/**
 * 전자결재·증명서·퇴사자 연차 수정 시나리오 검증. 데이터를 바꾸므로 DB 사본에서만 실행합니다.
 *
 *   powershell -File scripts/run-verify-documents.ps1 [-Driver node|postgres]
 */
if (process.env.VERIFY_ON_COPY !== '1') {
  console.error('DB 사본에서만 실행합니다. scripts/run-verify-documents.ps1 을 쓰세요.');
  process.exit(1);
}

const { getDb, getDbDialect } = await import('../server/db.js');
const { getAccess } = await import('../server/services/accessService.js');
const { getApprovalChain, listDocumentStepApprovers } = await import('../server/services/approvalService.js');
const documents = await import('../server/services/documentService.js');
const certificates = await import('../server/services/certificateService.js');
const leave = await import('../server/services/leaveService.js');
const mail = await import('../server/services/mailService.js');
const { listEvaluationManagers } = await import('../server/services/evaluationService.js');

const db = getDb();
const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectError(fn, pattern, status) {
  try {
    await fn();
  } catch (error) {
    if (pattern && !pattern.test(error.message)) throw new Error(`다른 오류: ${error.message}`);
    if (status && error.status !== status) throw new Error(`상태 ${error.status} (기대 ${status}): ${error.message}`);
    return error;
  }
  throw new Error('오류가 나야 하는데 성공했습니다.');
}

const year = new Date().getFullYear();
const active = await db.prepare('SELECT * FROM employees WHERE is_active = 1 ORDER BY id').all();
const admins = active.filter((e) => Number(e.is_admin));

/* 등장인물: 팀장 결재를 받는 팀원과 그 팀장, 서울 팀장과 소관 임원, 인사담당 두 명, 상관없는 직원 */
let member = null;
let leader = null;
for (const emp of active) {
  if (emp.position !== '팀원' || Number(emp.is_admin)) continue;
  const chain = await getApprovalChain(emp);
  if (chain.length !== 1 || chain[0].role !== '팀장') continue;
  const leaders = (await listDocumentStepApprovers(emp, '팀장')).filter((e) => !Number(e.is_admin));
  if (leaders.length) {
    member = emp;
    leader = leaders[0];
    break;
  }
}
let seoulLead = null;
for (const emp of active) {
  if (emp.position !== '팀장' || Number(emp.is_admin) || emp.id === leader?.id) continue;
  const chain = await getApprovalChain(emp);
  if (chain.map((s) => s.role).join() === '임원,대표이사') {
    seoulLead = emp;
    break;
  }
}
/* 사본의 임원 좌석이 비어 있으면 서울 팀장 부서를 맡는 좌석에 임원을 앉힙니다. */
let officer = seoulLead ? (await listDocumentStepApprovers(seoulLead, '임원')).find((e) => e.id !== leader?.id) : null;
if (seoulLead && !officer) {
  let seat = await db
    .prepare(
      `SELECT s.* FROM approval_seats s JOIN approval_seat_scopes sc ON sc.seat_id = s.id
       WHERE s.step_role = '임원' AND sc.department_code = ?`
    )
    .get(seoulLead.department_code);
  if (!seat) {
    seat = await db.prepare(`SELECT * FROM approval_seats WHERE step_role = '임원' ORDER BY id LIMIT 1`).get();
    await db
      .prepare('INSERT INTO approval_seat_scopes (seat_id, workplace_code, department_code, department_name) VALUES (?, ?, ?, ?)')
      .run(seat.id, seoulLead.workplace_code, seoulLead.department_code, seoulLead.department);
  }
  const taken = new Set([member?.id, leader?.id, seoulLead.id]);
  officer =
    active.find((e) => ['이사', '상무', '전무'].includes(e.position) && !Number(e.is_admin) && !taken.has(e.id)) ||
    active.find((e) => e.position === '팀원' && !Number(e.is_admin) && !taken.has(e.id) && e.department_code !== member?.department_code);
  await db.prepare('UPDATE approval_seats SET employee_id = ? WHERE id = ?').run(officer.id, seat.id);
}
const used = new Set([member, leader, seoulLead, officer].filter(Boolean).map((e) => e.id));
const [adminA, adminB] = admins.filter((e) => !used.has(e.id));
const outsider = active.find(
  (e) => !used.has(e.id) && !Number(e.is_admin) && e.position === '팀원' && e.department_code !== member?.department_code
);
const retiree = active.find(
  (e) => !used.has(e.id) && !Number(e.is_admin) && e.id !== outsider?.id && e.position === '팀원' && e.hire_date < `${year}-01-01`
);
console.log(
  JSON.stringify({
    dialect: getDbDialect(),
    member: member?.name,
    leader: leader?.name,
    seoulLead: seoulLead?.name,
    officer: officer?.name,
    adminA: adminA?.name,
    adminB: adminB?.name,
    outsider: outsider?.name,
    retiree: retiree?.name,
  })
);
if (!member || !leader || !seoulLead || !officer || !adminA || !adminB || !outsider || !retiree) {
  console.error('시나리오에 필요한 직원을 찾지 못했습니다.');
  process.exit(1);
}

const acc = async (emp) => getAccess(emp.id);
const [memberAcc, leaderAcc, seoulAcc, officerAcc, adminAAcc, adminBAcc, outsiderAcc] = await Promise.all(
  [member, leader, seoulLead, officer, adminA, adminB, outsider].map(acc)
);

/* ───────────── 전자결재 ───────────── */

/** 결재선: line(leader) 또는 line([outsider, 'agreement'], leader) */
const line = (...entries) =>
  entries.map((entry) => (Array.isArray(entry) ? { employeeId: entry[0].id, kind: entry[1] } : { employeeId: entry.id, kind: 'approval' }));
const recipientIds = async (id) => (await documents.getPendingRecipients(id)).recipients.map((e) => Number(e.id));
const sameIds = (ids, people) => [...ids].sort((a, b) => a - b).join() === people.map((p) => Number(p.id)).sort((a, b) => a - b).join();

/** 인사 수신 담당은 기안자 사업장의 인사담당이라, 검사 동안만 지정한 사람들을 한 사업장에 둡니다. */
async function sameWorkplace(people, fn) {
  const saved = [];
  for (const person of people) {
    saved.push(await db.prepare('SELECT id, workplace_code FROM employees WHERE id = ?').get(person.id));
    await db.prepare('UPDATE employees SET workplace_code = ? WHERE id = ?').run('VERIFY-R', person.id);
  }
  try {
    return await fn();
  } finally {
    for (const row of saved) await db.prepare('UPDATE employees SET workplace_code = ? WHERE id = ?').run(row.workplace_code, row.id);
  }
}

let generalId = 0;
await check('기안 화면 추천 결재선: 팀원은 팀장', async () => {
  const suggested = await documents.suggestLine(member.id);
  assert(suggested.length === 1 && suggested[0].employeeId === String(leader.id), JSON.stringify(suggested));
});

await check('일반 기안: 지정한 팀장 1단계, 팀장 결재함·메일 대상', async () => {
  const { id, autoApproved } = await documents.createDocument(member.id, {
    formKey: 'general',
    title: '검증용 품의',
    body: { content: '사무용품 구매 품의' },
    line: line(leader),
    refIds: [outsider.id, member.id],
  });
  generalId = id;
  assert(!autoApproved, '자동 승인되면 안 됨');
  const doc = await documents.getDocument(memberAcc, id);
  assert(
    doc.steps.length === 1 && doc.steps[0].kind === 'approval' && doc.steps[0].assigneeId === String(leader.id),
    `단계 ${JSON.stringify(doc.steps)}`
  );
  assert((await recipientIds(id)).join() === String(leader.id), '메일 대상은 지정한 팀장');
  assert(doc.refs.length === 1 && doc.refs[0].id === String(outsider.id), '참조자는 본인을 빼고 1명');
  assert(doc.permissions.withdraw && !doc.permissions.approve, '기안자 권한');
  const box = await documents.listBox(leader.id, 'todo');
  assert(box.items.some((item) => item.id === id), '팀장 결재함에 없음');
  assert((await documents.countTodo(leader.id)) === box.items.length, 'countTodo 불일치');
});

await check('일반 기안: 참조자는 열람(읽음 기록), 무관한 직원·다른 팀장은 못 봄', async () => {
  const doc = await documents.getDocument(outsiderAcc, generalId);
  assert(!doc.permissions.approve, '참조자는 결재 불가');
  const refs = await documents.listBox(outsider.id, 'refs');
  assert(refs.items.some((item) => item.id === generalId && !item.unread), '참조함 읽음 표시');
  await expectError(() => documents.getDocument(seoulAcc, generalId), /찾을 수 없습니다/, 404);
  await expectError(() => documents.approveDocument(seoulAcc, generalId), /차례가 아닙니다/, 403);
  await expectError(() => documents.approveDocument(memberAcc, generalId), /차례가 아닙니다/, 403);
});

await check('일반 기안: 팀장 승인 → 완료, 문서번호 기안-연도-0001', async () => {
  const doc = await documents.approveDocument(leaderAcc, generalId, '승인합니다');
  assert(doc.status === 'approved', doc.status);
  assert(/^기안-\d{4}-0001$/.test(doc.documentNo), doc.documentNo);
  assert(doc.steps[0].actorName === leader.name && !doc.steps[0].proxy && doc.steps[0].comment === '승인합니다', '처리자 기록');
  await expectError(() => documents.approveDocument(leaderAcc, generalId), /이미 처리가 끝난/, 409);
  await expectError(() => documents.withdrawDocument(memberAcc, generalId), /진행 중인 문서만/, 409);
  const processed = await documents.listBox(leader.id, 'processed');
  assert(processed.items.some((item) => item.id === generalId), '처리함');
});

await check('입력 검사: 필수·날짜 순서·선택지·참조자 수', async () => {
  await expectError(() => documents.createDocument(member.id, { formKey: 'general', title: '', body: { content: 'x' } }), /제목/);
  await expectError(() => documents.createDocument(member.id, { formKey: 'nope', title: 'x' }), /양식/);
  await expectError(
    () =>
      documents.createDocument(member.id, {
        formKey: 'business_trip',
        title: '출장',
        body: { destination: '부산', startDate: '2026-11-10', endDate: '2026-11-09', purpose: '점검' },
      }),
    /종료일이 시작일보다/
  );
  await expectError(
    () =>
      documents.createDocument(member.id, {
        formKey: 'business_trip',
        title: '출장',
        body: { destination: '부산', startDate: '2026-02-30', endDate: '2026-03-01', purpose: '점검' },
      }),
    /YYYY-MM-DD/
  );
  await expectError(
    () =>
      documents.createDocument(member.id, {
        formKey: 'condolence',
        title: '경조',
        body: { eventType: '없는구분', relation: '부', targetName: '홍', eventDate: '2026-11-01' },
      }),
    /목록에서 선택/
  );
  await expectError(
    () =>
      documents.createDocument(member.id, {
        formKey: 'business_trip',
        title: '출장',
        body: { destination: '부산', startDate: '2026-11-10', endDate: '2026-11-11', purpose: '점검', expense: '-5' },
      }),
    /0 이상의 숫자/
  );
  const many = active.filter((e) => e.id !== member.id).slice(0, 21).map((e) => e.id);
  await expectError(
    () => documents.createDocument(member.id, { formKey: 'general', title: 'x', body: { content: 'x' }, refIds: many }),
    /20명까지/
  );
});

await check('기안 본문(서식): 허용 서식만 남기고 스크립트·링크·이미지·위험한 스타일 제거', async () => {
  const dirty = [
    '<p style="text-align: center; font-size: 14pt; color: #ff0000; background-image: url(x)">제목<script>alert(1)</script></p>',
    '<p onclick="alert(1)"><b>굵게</b> <span style="font-family: \'Batang\', serif; position: fixed">글꼴</span></p>',
    '<a href="javascript:alert(1)">링크</a><img src=x onerror=alert(1)>',
    '<table><tbody><tr><td colspan="2" onmouseover="x()">칸</td></tr></tbody></table><ul><li>목록</li></ul>',
  ].join('');
  const { id } = await documents.createDocument(member.id, {
    formKey: 'general',
    title: '서식 검증',
    body: { content: dirty },
    line: line(leader),
  });
  const doc = await documents.getDocument(memberAcc, id);
  const html = doc.body.content;
  assert(doc.body.format === 'html', '형식 표시');
  assert(!/script|onclick|onerror|onmouseover|javascript|<a|<img|url\(|position/i.test(html), html);
  assert(/text-align:center/.test(html.replace(/\s/g, '')) && /font-size:14pt/.test(html.replace(/\s/g, '')), html);
  assert(html.includes('<b>굵게</b>') && html.includes('colspan="2"') && html.includes('<li>목록</li>') && html.includes('링크'), html);
  await expectError(
    () => documents.createDocument(member.id, { formKey: 'general', title: 'x', body: { content: '<p><br></p>&nbsp;' }, line: line(leader) }),
    /내용을\(를\) 입력/
  );
  await documents.withdrawDocument(memberAcc, id);
});

await check('결재선 검사: 없음·본인·중복·인원 초과, 합의로 끝나도 됨(결재 먼저 정렬)', async () => {
  const base = { formKey: 'general', title: 'x', body: { content: 'x' } };
  await expectError(() => documents.createDocument(member.id, base), /결재자를 1명 이상/);
  await expectError(() => documents.createDocument(member.id, { ...base, line: line(member) }), /본인은/);
  await expectError(() => documents.createDocument(member.id, { ...base, line: line(leader, leader) }), /두 번/);
  const { id } = await documents.createDocument(member.id, { ...base, line: line([outsider, 'agreement'], leader) });
  const doc = await documents.getDocument(memberAcc, id);
  assert(doc.steps.map((s) => s.kind).join() === 'approval,agreement', doc.steps.map((s) => s.kind).join());
  await documents.withdrawDocument(memberAcc, id);
  const eleven = active.filter((e) => e.id !== member.id).slice(0, 11);
  await expectError(() => documents.createDocument(member.id, { ...base, line: line(...eleven) }), /10명까지/);
});

let tripId = 0;
await check('출장 신청: 작성자가 지정한 결재 먼저 → 합의, 인사담당 자동 추가 없음, 팀장 반려 → 다시 기안 → 회수', async () => {
  const body = { destination: '부산공장', startDate: '2026-11-10', endDate: '2026-11-11', purpose: '설비 점검', expense: '150,000' };
  await expectError(() => documents.createDocument(member.id, { formKey: 'business_trip', title: '출장', body }), /1명 이상/);
  ({ id: tripId } = await documents.createDocument(member.id, {
    formKey: 'business_trip',
    title: '부산공장 출장',
    body,
    line: line([adminA, 'agreement'], leader),
  }));
  const created = await documents.getDocument(memberAcc, tripId);
  assert(created.body.expense === 150000, `경비 ${created.body.expense}`);
  assert(created.summary.includes('150,000원'), created.summary);
  assert(
    created.steps.map((s) => `${s.kind}:${s.assigneeId}`).join() === `approval:${leader.id},agreement:${adminA.id}`,
    `결재 먼저, 합의는 뒤: ${JSON.stringify(created.steps)}`
  );
  assert((await recipientIds(tripId)).join() === String(leader.id), '첫 메일은 결재자');
  await expectError(() => documents.approveDocument(officerAcc, tripId), /차례가 아닙니다/, 403);
  await expectError(() => documents.rejectDocument(leaderAcc, tripId, ''), /반려 사유/);
  const rejected = await documents.rejectDocument(leaderAcc, tripId, '일정 조정 필요');
  assert(rejected.status === 'rejected' && !rejected.documentNo, '반려 문서는 번호 없음');
  assert(rejected.permissions.resubmit === false, '결재자 화면에는 다시 기안 없음');
  const mine = await documents.getDocument(memberAcc, tripId);
  assert(mine.permissions.resubmit, '기안자는 다시 기안 가능');
  const { id: againId } = await documents.createDocument(member.id, {
    formKey: 'business_trip',
    title: '부산공장 출장 (일정 변경)',
    body: { destination: '부산공장', startDate: '2026-11-17', endDate: '2026-11-18', purpose: '설비 점검' },
    line: line([adminA, 'agreement']),
    sourceId: tripId,
  });
  const again = await documents.getDocument(memberAcc, againId);
  assert(again.sourceId === tripId && again.status === 'pending', '원문 연결');
  assert(again.steps.length === 1 && again.steps[0].kind === 'agreement', '합의자만 지정해도 기안 가능');
  await expectError(
    () =>
      documents.createDocument(outsider.id, {
        formKey: 'general',
        title: 'x',
        body: { content: 'x' },
        line: line(leader),
        sourceId: tripId,
      }),
    /다시 기안할 수 있는/
  );
  await expectError(() => documents.withdrawDocument(outsiderAcc, againId), /본인이 기안한/, 403);
  const withdrawn = await documents.withdrawDocument(memberAcc, againId);
  assert(withdrawn.status === 'withdrawn' && withdrawn.steps.every((s) => s.status === 'skipped'), '회수');
});

await check('경조금: 팀장 결재 → 합의자(인사담당)가 합의하며 다음 결재선 지정 → 지정한 순서로 완료', async () => {
  const { id } = await documents.createDocument(member.id, {
    formKey: 'condolence',
    title: '부친 회갑 경조금',
    body: { eventType: '부모 회갑·칠순', relation: '부', targetName: '홍길동', eventDate: '2026-11-20' },
    line: line([adminA, 'agreement'], leader, [outsider, 'agreement']),
  });
  let doc = await documents.getDocument(leaderAcc, id);
  assert(doc.permissions.approve && !doc.permissions.addLine, '결재자는 다음 결재선 지정 불가');
  await expectError(() => documents.approveDocument(leaderAcc, id, '', line(officer)), /합의자만/, 409);
  await documents.approveDocument(leaderAcc, id);
  assert((await recipientIds(id)).join() === String(adminA.id), '결재가 끝나면 합의자에게');
  assert((await documents.listBox(adminA.id, 'todo')).items.some((item) => item.id === id), '합의자 결재함');
  doc = await documents.getDocument(adminAAcc, id);
  assert(doc.permissions.approve && doc.permissions.addLine && !doc.permissions.proxy, '합의자는 다음 결재선 지정 가능');
  await expectError(() => documents.approveDocument(adminAAcc, id, '', line(member)), /기안자는/);
  await expectError(() => documents.approveDocument(adminAAcc, id, '', line(adminA)), /본인은 다음 결재선/);
  await expectError(() => documents.approveDocument(adminAAcc, id, '', line(outsider)), /이미 결재선에/);
  doc = await documents.approveDocument(adminAAcc, id, '확인했습니다', line(officer));
  assert(
    doc.steps.map((s) => `${s.kind}:${s.assigneeId}`).join() ===
      `approval:${leader.id},agreement:${adminA.id},approval:${officer.id},agreement:${outsider.id}`,
    `다음 결재선은 합의자 바로 뒤, 결재 먼저: ${doc.steps.map((s) => `${s.kind}:${s.assignee}`).join()}`
  );
  assert(doc.steps[1].statusLabel === '합의' && doc.steps[1].comment === '확인했습니다', '합의 기록');
  assert(doc.status === 'pending' && doc.steps[2].status === 'pending', '임원 결재 대기');
  assert((await recipientIds(id)).join() === String(officer.id), '다음 결재선 첫 사람에게 메일');
  await expectError(() => documents.withdrawDocument(memberAcc, id), /이미 승인한 결재자/, 409);
  await documents.approveDocument(officerAcc, id);
  doc = await documents.approveDocument(outsiderAcc, id, '', line(leader));
  assert(doc.status === 'pending' && doc.steps.length === 5 && doc.steps[4].assigneeId === String(leader.id), '추가된 합의자도 다음 결재선 지정');
  doc = await documents.approveDocument(leaderAcc, id);
  assert(doc.status === 'approved' && /^경조-\d{4}-0001$/.test(doc.documentNo), doc.documentNo);
});

await check('교육 신청: 임원 결재 → 합의로 끝나면 완료, 인사담당 대리 합의(대리 표시)', async () => {
  const suggested = await documents.suggestLine(seoulLead.id);
  assert(suggested[0]?.employeeId === String(officer.id), `추천 ${JSON.stringify(suggested)}`);
  const { id } = await documents.createDocument(seoulLead.id, {
    formKey: 'training_request',
    title: '외부 교육',
    body: { courseName: '노무관리 실무', institution: '노사발전재단', startDate: '2026-12-01', endDate: '2026-12-01', cost: 0, purpose: '역량 강화' },
    line: line([outsider, 'agreement'], officer),
  });
  await expectError(() => documents.approveDocument(leaderAcc, id), /차례가 아닙니다/, 403);
  let doc = await documents.approveDocument(officerAcc, id);
  assert(doc.steps[0].actorName === officer.name && !doc.steps[0].proxy, '임원 처리');
  doc = await documents.getDocument(adminBAcc, id);
  assert(doc.permissions.approve && doc.permissions.proxy && doc.permissions.addLine, '인사담당 대리 합의');
  doc = await documents.approveDocument(adminBAcc, id);
  assert(doc.status === 'approved' && /^교육-/.test(doc.documentNo), doc.documentNo);
  assert(doc.steps[1].proxy && doc.steps[1].actorName === adminB.name, '대리 표시');
});

await check('일반 기안 합의: 결재가 끝난 뒤 합의자에게 메일·결재함, 합의하면 완료', async () => {
  const { id } = await documents.createDocument(member.id, {
    formKey: 'general',
    title: '타부서 합의 품의',
    body: { content: '합의 검증' },
    line: line([outsider, 'agreement'], leader),
  });
  let doc = await documents.getDocument(memberAcc, id);
  assert(doc.steps.map((s) => `${s.kind}:${s.assigneeId}`).join() === `approval:${leader.id},agreement:${outsider.id}`, '결재 먼저');
  assert(doc.steps[1].statusLabel === '합의 대기' || doc.steps[1].status === 'waiting', doc.steps[1].statusLabel);
  assert((await recipientIds(id)).join() === String(leader.id), '첫 메일은 결재자');
  assert(!(await documents.listBox(outsider.id, 'todo')).items.some((item) => item.id === id), '합의자 결재함에는 아직 없음');
  const preview = await documents.getDocument(outsiderAcc, id);
  assert(!preview.permissions.approve, '결재선에 있는 합의자는 미리 볼 수 있으나 처리 불가');
  await expectError(() => documents.approveDocument(outsiderAcc, id), /차례가 아닙니다/, 403);
  doc = await documents.approveDocument(leaderAcc, id);
  assert(doc.steps[0].status === 'approved' && doc.steps[1].status === 'pending', '결재 완료 → 합의 대기');
  assert((await recipientIds(id)).join() === String(outsider.id), '결재 후 메일은 합의자');
  const todo = await documents.listBox(outsider.id, 'todo');
  assert(todo.items.some((item) => item.id === id && item.currentRole === `${outsider.name} 합의`), '합의자 결재함');
  doc = await documents.getDocument(outsiderAcc, id);
  assert(doc.permissions.addLine, '일반 기안 합의자도 다음 결재선 지정 가능');
  doc = await documents.approveDocument(outsiderAcc, id, '이견 없음');
  assert(doc.status === 'approved' && doc.documentNo && doc.steps[1].statusLabel === '합의', '합의로 완료');
});

await check('합의 반대: 반대 사유 필수, 문서 반려', async () => {
  const { id } = await documents.createDocument(member.id, {
    formKey: 'general',
    title: '반대 검증',
    body: { content: 'x' },
    line: line([outsider, 'agreement'], leader, [seoulLead, 'agreement']),
  });
  await documents.approveDocument(leaderAcc, id);
  await expectError(() => documents.rejectDocument(outsiderAcc, id, ''), /반대 사유/);
  const doc = await documents.rejectDocument(outsiderAcc, id, '예산 초과');
  assert(
    doc.status === 'rejected' && doc.steps[1].statusLabel === '반대' && doc.steps[2].status === 'skipped',
    `반려 ${doc.steps.map((s) => s.status).join()}`
  );
});

await check('결재 3단계: 하위 결재자 승인 시 상위 결재자에게 차례가 넘어감', async () => {
  const { id } = await documents.createDocument(member.id, {
    formKey: 'general',
    title: '상위 결재 검증',
    body: { content: 'x' },
    line: line(leader, seoulLead, officer),
  });
  assert((await recipientIds(id)).join() === String(leader.id), '1단계 메일');
  await documents.approveDocument(leaderAcc, id);
  assert((await recipientIds(id)).join() === String(seoulLead.id), '2단계 메일');
  await expectError(() => documents.approveDocument(officerAcc, id), /차례가 아닙니다/, 403);
  await documents.approveDocument(seoulAcc, id);
  assert((await recipientIds(id)).join() === String(officer.id), '3단계 메일');
  const doc = await documents.approveDocument(officerAcc, id);
  assert(doc.status === 'approved', doc.status);
});

await check('이전 문서(직위별 단계)도 그대로 처리', async () => {
  const { id } = await documents.createDocument(member.id, {
    formKey: 'general',
    title: '이전 방식',
    body: { content: 'x' },
    line: line(outsider),
  });
  await db
    .prepare(
      `UPDATE approval_document_steps SET role = '팀장', assignee_id = NULL, assignee_name = NULL,
         assignee_department = NULL, assignee_position = NULL WHERE document_id = ?`
    )
    .run(id);
  assert((await recipientIds(id)).includes(Number(leader.id)), '직위별 메일 대상');
  await expectError(() => documents.approveDocument(outsiderAcc, id), /차례가 아닙니다/, 403);
  const doc = await documents.approveDocument(leaderAcc, id);
  assert(doc.status === 'approved', doc.status);
});

await check('이전 방식 인사 수신 문서: 인사담당 본인 문서는 같은 사업장 다른 인사담당이 수신, 본인뿐이면 본인이 수신', async () => {
  const body = { eventType: '본인 결혼', relation: '본인', targetName: adminA.name, eventDate: '2026-12-05' };
  /** 배포 전 방식처럼 담당자 없는 "인사 수신" 단계 하나로 바꿉니다. */
  const legacyDraft = async (title) => {
    const { id } = await documents.createDocument(adminA.id, { formKey: 'condolence', title, body, line: line([outsider, 'agreement']) });
    await db
      .prepare(
        `UPDATE approval_document_steps SET role = '인사 수신', assignee_id = NULL, assignee_name = NULL,
           assignee_department = NULL, assignee_position = NULL WHERE document_id = ?`
      )
      .run(id);
    return id;
  };
  await sameWorkplace([adminA, adminB], async () => {
    const id = await legacyDraft('본인 결혼');
    assert((await recipientIds(id)).join() === String(adminB.id), '수신 메일은 다른 인사담당');
    const forHr = await documents.getDocument(adminBAcc, id);
    assert(forHr.permissions.receive && !forHr.permissions.approve && forHr.steps[0].statusLabel === '수신 대기', '수신 대기');
    await expectError(() => documents.approveDocument(adminBAcc, id), /결재선을 지정해 수신/, 409);
    const own = await documents.getDocument(adminAAcc, id);
    assert(!own.permissions.receive && !own.permissions.proxy, '본인 문서는 대리 수신도 불가');
    await expectError(() => documents.receiveDocument(adminAAcc, id, { line: line(adminB) }), /수신할 담당이 아닙니다/, 403);
    await documents.receiveDocument(adminBAcc, id, { line: line(adminB) });
    const done = await documents.approveDocument(adminBAcc, id);
    assert(done.status === 'approved', done.status);
  });
  await sameWorkplace([adminA], async () => {
    const id = await legacyDraft('본인 결혼 (혼자)');
    const own = await documents.getDocument(adminAAcc, id);
    assert(own.permissions.receive && !own.permissions.proxy, '사업장 인사담당이 본인뿐이면 본인이 수신');
    await documents.withdrawDocument(adminAAcc, id);
  });
});

await check('인사명령: 인사담당만 기안, 대상자·발령일 검사, 제목 자동, 결재 후 발령번호 인사 연도 - 번호호, 인사명령 대장', async () => {
  const body = {
    orderType: '입사',
    effectiveDate: '2099-11-01',
    entries: [
      { name: '김민석', jobType: '사무직', workplace: '천안', department: '관리팀', position: '사원' },
      { employeeId: outsider.id, name: outsider.name, jobType: '', workplace: '', department: '관리팀', position: '사원' },
    ],
  };
  const draft = (data, who = adminA, whoAcc = adminAAcc) =>
    documents.createDocument(who.id, { formKey: 'personnel_order', body: data, line: line(leader) }, { access: whoAcc });
  await expectError(() => draft(body, member, memberAcc), /인사담당만/, 403);
  await expectError(() => draft({ ...body, entries: [] }), /발령 대상을\(를\) 1명 이상/);
  await expectError(() => draft({ ...body, entries: [{ name: '' }] }), /1번째 대상자 성명/);
  await expectError(() => draft({ ...body, effectiveDate: '' }), /발령일/);
  await expectError(() => draft({ ...body, orderType: '없는구분' }), /목록에서 선택/);
  const { id } = await draft(body);
  let doc = await documents.getDocument(adminAAcc, id);
  assert(doc.title === '인사명령 (입사) 김민석 외 1명', doc.title);
  assert(doc.body.entries.length === 2 && doc.body.entries[1].employeeId === Number(outsider.id), JSON.stringify(doc.body.entries));
  assert(doc.summary.startsWith('입사 · 김민석'), doc.summary);
  doc = await documents.approveDocument(leaderAcc, id);
  const { DOC_FORM_MAP, orderNoText, orderDateText } = await import('../src/constants/approvalDocs.js');
  const first = DOC_FORM_MAP.personnel_order.numberFrom[year] || 1;
  assert(doc.status === 'approved' && doc.documentNo === `인사-${year}-${String(first).padStart(4, '0')}`, doc.documentNo);
  assert(orderNoText(doc.documentNo) === `인사 ${String(year).slice(2)} - ${first}호`, orderNoText(doc.documentNo));
  const second = await draft({ ...body, orderType: '전보' });
  const next = await documents.approveDocument(leaderAcc, second.id);
  assert(next.documentNo === `인사-${year}-${String(first + 1).padStart(4, '0')}`, `다음 번호 ${next.documentNo}`);
  assert(orderDateText('2026-11-01') === "26' 11/1부", orderDateText('2026-11-01'));

  const pendingOrder = await draft({ ...body, orderType: '승진' });
  const register = await documents.listPersonnelOrders({ year });
  const mine = register.filter((item) => [id, second.id].includes(item.documentId));
  assert(mine.length === 4, `대장 ${mine.length}줄 (명령 2건 × 대상자 2명)`);
  assert(!register.some((item) => item.documentId === pendingOrder.id), '결재 중인 명령은 대장에 없음');
  assert(register.findIndex((i) => i.documentId === second.id) < register.findIndex((i) => i.documentId === id), '최근 번호가 위');
  const row = mine.find((item) => item.documentId === id && item.entryIndex === 1);
  assert(
    row.orderNo === orderNoText(doc.documentNo) && row.employeeId === String(outsider.id) && row.orderType === '입사' && row.effectiveDate === '2099-11-01' && row.apply?.status === 'pending',
    JSON.stringify(row)
  );
  const transfers = await documents.listPersonnelOrders({ year, orderType: '전보', q: '김민석' });
  assert(transfers.some((i) => i.documentId === second.id) && !transfers.some((i) => i.documentId === id), '구분·검색 필터');
  const csv = await documents.exportPersonnelOrders({ year });
  assert(csv.headers[0] === '발령번호' && csv.rows.length === register.length, 'CSV');
  await documents.withdrawDocument(adminAAcc, pendingOrder.id);
});

await check('인사 발령: 발령일에 전보·승진 반영, 퇴사는 다음 날, 입사 등록, 그 밖은 이력만, 예정·취소·다시 반영, 이전 명령은 이력만', async () => {
  const orders = await import('../server/services/personnelOrderService.js');
  const employees = await import('../server/services/employeeService.js');
  const kst = (d) => d.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);
  const today = kst(new Date());
  const yesterday = kst(new Date(Date.now() - 86_400_000));
  const tomorrow = kst(new Date(Date.now() + 86_400_000));
  const created = [];
  const temp = async (name, extra = {}) => {
    const e = await employees.createEmployee({
      name,
      hireDate: '2020-01-01',
      workplace: member.workplace,
      department: member.department,
      jobType: '사무직',
      jobRank: '대리',
      payStep: 2,
      ...extra,
    });
    created.push(Number(e.id));
    return db.prepare('SELECT * FROM employees WHERE id = ?').get(e.id);
  };
  const entryOf = (e, patch = {}) => ({
    employeeId: e.id,
    name: e.name,
    jobType: e.job_type,
    workplace: e.workplace,
    department: e.department,
    position: e.job_rank || e.position,
    ...patch,
  });
  const order = async (orderType, effectiveDate, entries) => {
    const { id } = await documents.createDocument(
      adminA.id,
      { formKey: 'personnel_order', body: { orderType, effectiveDate, entries }, line: line(leader) },
      { access: adminAAcc }
    );
    const doc = await documents.approveDocument(leaderAcc, id);
    assert(doc.status === 'approved', `${orderType} 결재 ${doc.status}`);
    return id;
  };
  const actionsOf = async (docId) =>
    db.prepare('SELECT * FROM personnel_order_actions WHERE document_id = ? ORDER BY entry_index').all(docId);
  const history = async (empId, title) =>
    db
      .prepare(`SELECT * FROM employee_records WHERE employee_id = ? AND category = 'appointment' AND title = ?`)
      .all(empId, title);
  const fetch = (id) => db.prepare('SELECT * FROM employees WHERE id = ?').get(id);

  try {
    const daeri = (await import('../src/constants/hr.js')).PAY_GRADES.find((g) => g.rank === '대리');
    const t1 = await temp('발령시험일', { payGrade: daeri.key });
    const t2 = await temp('발령시험이', { payGrade: daeri.key });
    const otherDept = active.find((e) => e.department && e.department !== member.department && e.workplace === member.workplace) ||
      active.find((e) => e.department && e.department !== member.department);

    // 전보: 지난 날짜 → 결재 끝나자마자 반영, 부서만 바뀌고 이력 1줄
    const transferId = await order('전보', yesterday, [entryOf(t1, { department: otherDept.department, workplace: otherDept.workplace })]);
    let [a] = await actionsOf(transferId);
    let e1 = await fetch(t1.id);
    assert(a.status === 'applied' && e1.department === otherDept.department && e1.workplace === otherDept.workplace, `전보 ${a.status} ${a.message} ${e1.department}`);
    assert(String(e1.department_code) === String(otherDept.department_code), `부서코드 ${e1.department_code} / ${otherDept.department_code}`);
    assert(e1.job_rank === '대리' && e1.emp_no === t1.emp_no, '다른 칸은 그대로');
    assert((await history(t1.id, '전보')).length === 1, '전보 발령 이력');

    // 승진: 내일 날짜 → 예정, 내일이 되면 반영, 급호는 비움, 두 번 반영 안 됨
    const promoteId = await order('승진', tomorrow, [entryOf(t2, { position: '과장' })]);
    [a] = await actionsOf(promoteId);
    assert(a.status === 'pending' && (await fetch(t2.id)).job_rank === '대리', '발령일 전에는 예정');
    await orders.applyDue({ today: tomorrow });
    [a] = await actionsOf(promoteId);
    const e2 = await fetch(t2.id);
    assert(a.status === 'applied' && e2.job_rank === '과장' && !e2.pay_grade && e2.pay_step == null, `승진 ${a.status} ${e2.job_rank} ${e2.pay_grade}`);
    assert(/급호/.test(a.message || ''), a.message);
    await orders.applyDue({ today: tomorrow });
    assert((await history(t2.id, '승진')).length === 1, '승진 이력 한 줄');

    // 퇴사: 발령일 당일은 재직, 다음 날 재직 해제
    const resignId = await order('퇴사', today, [entryOf(t1)]);
    [a] = await actionsOf(resignId);
    assert(a.status === 'pending' && Number((await fetch(t1.id)).is_active) === 1, '퇴사일 당일은 재직');
    await orders.applyDue({ today: tomorrow });
    [a] = await actionsOf(resignId);
    e1 = await fetch(t1.id);
    assert(a.status === 'applied' && Number(e1.is_active) === 0 && e1.terminated_date === today, `퇴사 ${a.status} ${e1.terminated_date}`);

    // 입사: 사원 명부에 없는 대상자 등록, 이미 있으면 이력만
    const hireId = await order('입사', today, [
      { name: '발령신입삼', jobType: '생산직', workplace: member.workplace, department: member.department, position: '사원' },
      entryOf(t2),
    ]);
    const hires = await actionsOf(hireId);
    const newbie = await fetch(hires[0].employee_id);
    created.push(Number(hires[0].employee_id));
    assert(hires[0].status === 'applied' && newbie?.name === '발령신입삼' && newbie.hire_date === today && newbie.job_type === '생산직' && newbie.job_rank === '사원', `입사 ${hires[0].status} ${hires[0].message}`);
    assert(hires[1].status === 'recorded', `이미 있는 직원 ${hires[1].status}`);
    const register = await documents.listPersonnelOrders({});
    assert(register.find((i) => i.documentId === hireId && i.entryIndex === 0)?.employeeId === String(newbie.id), '대장에 등록된 직원 연결');

    // 그 밖의 구분: 이력만, 직접 입력 대상자는 건너뜀 → 반영 안 함 → 다시 반영
    const otherId = await order('휴직', today, [entryOf(t2), { name: '연결안됨', jobType: '', workplace: '', department: '', position: '' }]);
    const others = await actionsOf(otherId);
    assert(others[0].status === 'recorded' && (await fetch(t2.id)).job_rank === '과장', '휴직은 이력만');
    assert(others[1].status === 'skipped', `직접 입력 ${others[1].status}`);
    await orders.cancelAction(others[1].id);
    assert((await actionsOf(otherId))[1].status === 'cancelled', '반영 안 함');
    await expectError(() => orders.cancelAction(others[0].id), /이미 반영/, 409);
    const retried = await orders.retryAction(others[1].id);
    assert(retried.status === 'skipped', `다시 반영 ${retried.status}`);

    // 결재가 끝났지만 반영 줄이 없는 이전 인사명령: 사원 정보 그대로, 이력만
    const oldId = await order('전보', yesterday, [entryOf(t2, { department: otherDept.department })]);
    await db.prepare('DELETE FROM personnel_order_actions WHERE document_id = ?').run(oldId);
    await db.prepare(`UPDATE employees SET department = ?, department_code = ? WHERE id = ?`).run(member.department, member.department_code, t2.id);
    const back = await orders.backfillHistory();
    const [old] = await actionsOf(oldId);
    assert(back.documents >= 1 && old.status === 'recorded' && old.action === 'record', `이전 명령 ${old?.status}`);
    assert((await fetch(t2.id)).department === member.department, '이전 명령은 사원 정보 그대로');
    assert((await orders.backfillHistory()).documents === 0, '한 번만');
  } finally {
    for (const id of created) {
      await db.prepare('DELETE FROM personnel_order_actions WHERE employee_id = ?').run(id);
      await db.prepare('DELETE FROM employee_records WHERE employee_id = ?').run(id);
      await db.prepare('DELETE FROM users WHERE employee_id = ?').run(id);
      await db.prepare('DELETE FROM leave_balance_snapshots WHERE employee_id = ?').run(id);
      await db.prepare('DELETE FROM employees WHERE id = ?').run(id);
    }
  }
});

await check('문서함(관리): 양식·상태 필터, CSV', async () => {
  const all = await documents.listAll({ year });
  assert(all.length >= 6, `문서 ${all.length}`);
  const rejected = await documents.listAll({ status: 'rejected' });
  assert(rejected.length === 2 && rejected.some((item) => item.id === tripId), '반려 필터');
  const condolence = await documents.listAll({ form: 'condolence', status: 'approved' });
  assert(condolence.length === 2, `경조 ${condolence.length}`);
  const csv = await documents.exportAll({ year });
  assert(csv.rows.length === all.length && csv.headers[0] === '문서번호', 'CSV');
});

/* ───────────── 증명서: 직원 신청 → 사업장 인사담당 접수 → 관리팀 내부 결재 → 발급 ───────────── */

await db
  .prepare(
    `INSERT INTO employee_profiles (employee_id, birth_date, address) VALUES (?, NULL, NULL)
     ON CONFLICT (employee_id) DO UPDATE SET birth_date = NULL, address = NULL`
  )
  .run(member.id);
/* 접수 사업장 판정: 팀원·인사담당A는 같은 사업장, 인사담당B는 다른 사업장 */
const savedWorkplaces = await db
  .prepare('SELECT id, workplace_code FROM employees WHERE id IN (?, ?, ?)')
  .all(member.id, adminA.id, adminB.id);
await db.prepare('UPDATE employees SET workplace_code = ? WHERE id IN (?, ?)').run('VERIFY-A', member.id, adminA.id);
await db.prepare('UPDATE employees SET workplace_code = ? WHERE id = ?').run('VERIFY-B', adminB.id);

const issueDraft = (body, entries, extra = {}) =>
  documents.createDocument(adminA.id, { formKey: 'certificate_issue', body, line: entries, ...extra }, { access: adminAAcc });

let employmentRequest = null;
await check('증명서 신청: 생년월일 없으면 안내, 퇴직증명서·이전 양식 불가', async () => {
  await expectError(
    () => certificates.createRequest(member.id, { certType: 'employment', items: ['birthDate'], purpose: '금융기관 제출용' }),
    /생년월일이 없습니다/
  );
  await expectError(() => certificates.createRequest(member.id, { certType: 'employment', items: [] }), /용도/);
  await expectError(
    () => certificates.createRequest(member.id, { certType: 'retirement', items: [], purpose: 'x' }),
    /재직증명서 또는 경력증명서/
  );
  await expectError(
    () => documents.createDocument(member.id, { formKey: 'certificate', body: { certType: 'career', items: [], purpose: 'x' } }),
    /"증명서" 메뉴에서 신청/
  );
  await db.prepare('UPDATE employee_profiles SET birth_date = ?, address = ? WHERE employee_id = ?').run('1990-05-17', '서울시 중구', member.id);
  employmentRequest = await certificates.createRequest(member.id, {
    certType: 'employment',
    items: ['birthDate', 'department', 'retireReason'],
    purpose: '금융기관 제출용',
    submitTo: '국민은행',
    showSeal: false,
  });
  assert(employmentRequest.status === 'requested', employmentRequest.status);
  assert(!employmentRequest.request.items.includes('retireReason'), '재직자 신청에서 퇴직사유 제외');
  assert(!('showSeal' in employmentRequest.request), '직인 여부는 인사담당이 정함');
  const mine = await certificates.listMine(member.id);
  assert(mine.requests[0]?.id === employmentRequest.id && !('documentId' in mine.requests[0]), '내 신청 내역');
});

await check('신청 접수: 같은 사업장 인사담당에게 수신(메일 대상·접수함·메뉴 숫자)', async () => {
  const row = await db.prepare('SELECT * FROM certificate_requests WHERE id = ?').get(employmentRequest.id);
  const handlers = await certificates.listRequestHandlers(row);
  assert(handlers.map((e) => Number(e.id)).join() === String(adminA.id), `메일 대상 ${handlers.map((e) => e.name).join()}`);
  const mineA = await certificates.listRequests(adminAAcc, { scope: 'mine' });
  const mineB = await certificates.listRequests(adminBAcc, { scope: 'mine' });
  const allB = await certificates.listRequests(adminBAcc, {});
  assert(mineA.some((r) => r.id === employmentRequest.id), '인사담당A 접수함');
  assert(!mineB.some((r) => r.id === employmentRequest.id), '다른 사업장 인사담당B 접수함에는 없음');
  assert(allB.some((r) => r.id === employmentRequest.id), '전체 사업장 보기');
  assert((await certificates.countOpenRequests(adminA.id)) === 1 && (await certificates.countOpenRequests(adminB.id)) === 0, '메뉴 숫자');
  assert((await certificates.countOpenRequests(member.id)) === 0, '일반 직원 0');
});

await check('인사담당 본인 신청: 사업장 인사담당이 본인 한 명뿐이면 본인이 받아 품의', async () => {
  const own = await certificates.createRequest(adminA.id, { certType: 'employment', items: [], purpose: '본인 제출용' });
  const row = await db.prepare('SELECT * FROM certificate_requests WHERE id = ?').get(own.id);
  const handlers = (await certificates.listRequestHandlers(row)).map((e) => Number(e.id));
  assert(handlers.join() === String(adminA.id), `메일 대상 ${handlers.join()}`);
  assert((await certificates.listRequests(adminAAcc, { scope: 'mine' })).some((r) => r.id === own.id), '본인 접수함');
  assert(!(await certificates.listRequests(adminBAcc, { scope: 'mine' })).some((r) => r.id === own.id), '다른 사업장은 받지 않음');
  assert((await certificates.countOpenRequests(adminA.id)) === 2 && (await certificates.countOpenRequests(adminB.id)) === 0, '메뉴 숫자');
  const draft = await documents.createDocument(
    adminA.id,
    { formKey: 'certificate_issue', body: { requestId: own.id, items: [], purpose: '본인 제출용' }, line: line(officer) },
    { access: adminAAcc }
  );
  assert((await certificates.getRequest(own.id)).status === 'processing', '본인 신청 품의');
  await documents.withdrawDocument(adminAAcc, draft.id);
  await certificates.cancelRequest(adminA.id, own.id);
});

await check('메일: 역할로 받는 메일에서 시스템관리자 제외, 인사담당 겸임은 받음', async () => {
  const ids = [adminA.id, adminB.id];
  const saved = await db.prepare('SELECT employee_id, role FROM employee_roles WHERE employee_id IN (?, ?)').all(...ids);
  try {
    await db.prepare('DELETE FROM employee_roles WHERE employee_id IN (?, ?)').run(...ids);
    await db.prepare(`INSERT INTO employee_roles (employee_id, role) VALUES (?, 'system_admin')`).run(adminA.id);
    await db.prepare(`INSERT INTO employee_roles (employee_id, role) VALUES (?, 'system_admin')`).run(adminB.id);
    await db.prepare(`INSERT INTO employee_roles (employee_id, role) VALUES (?, 'hr')`).run(adminB.id);
    const kept = (await mail.withoutSystemAdmins([adminA, adminB, member])).map((e) => Number(e.id));
    assert(kept.join() === [adminB.id, member.id].map(Number).join(), `받는 사람 ${kept.join()}`);
    const managers = (await listEvaluationManagers()).map((e) => Number(e.id));
    assert(managers.includes(Number(adminB.id)) && !managers.includes(Number(adminA.id)), '평가·교육 메일은 인사담당만');
  } finally {
    await db.prepare('DELETE FROM employee_roles WHERE employee_id IN (?, ?)').run(...ids);
    for (const row of saved) {
      await db.prepare('INSERT INTO employee_roles (employee_id, role) VALUES (?, ?)').run(row.employee_id, row.role);
    }
  }
});

await check('인사담당 본인 신청: 같은 사업장 다른 인사담당이 받고, 내 사업장 신청에는 둘 다 보임', async () => {
  await db.prepare('UPDATE employees SET workplace_code = ? WHERE id = ?').run('VERIFY-A', adminB.id);
  try {
    const own = await certificates.createRequest(adminA.id, { certType: 'employment', items: [], purpose: '본인 제출용' });
    const row = await db.prepare('SELECT * FROM certificate_requests WHERE id = ?').get(own.id);
    const handlers = (await certificates.listRequestHandlers(row)).map((e) => Number(e.id));
    assert(handlers.join() === String(adminB.id), `메일 대상 ${handlers.join()}`);
    assert((await certificates.listRequests(adminAAcc, { scope: 'mine' })).some((r) => r.id === own.id), '본인도 내 사업장 신청에서 보임');
    assert((await certificates.listRequests(adminBAcc, { scope: 'mine' })).some((r) => r.id === own.id), '같은 사업장 인사담당 접수함');
    assert((await certificates.countOpenRequests(adminA.id)) === 1 && (await certificates.countOpenRequests(adminB.id)) === 2, '메뉴 숫자');
    await certificates.cancelRequest(adminA.id, own.id);
  } finally {
    await db.prepare('UPDATE employees SET workplace_code = ? WHERE id = ?').run('VERIFY-B', adminB.id);
  }
});

let issueDocId = 0;
await check('발급 품의: 인사담당만 기안, 신청 대상·종류 고정, 결재선 지정 → 내부 결재 중', async () => {
  const body = {
    requestId: employmentRequest.id,
    employeeId: outsider.id,
    certType: 'career',
    items: ['birthDate', 'department'],
    purpose: '금융기관 제출용',
    submitTo: '국민은행',
    showSeal: false,
  };
  await expectError(
    () => documents.createDocument(member.id, { formKey: 'certificate_issue', body, line: line(leader) }, { access: memberAcc }),
    /인사담당만/,
    403
  );
  await expectError(() => issueDraft(body, [{ employeeId: adminA.id, kind: 'approval' }]), /본인은 결재선에/);
  const { id } = await issueDraft(body, line([adminB, 'agreement'], officer));
  issueDocId = id;
  const doc = await documents.getDocument(adminAAcc, id);
  assert(doc.title === `${member.name} 재직증명서 발급 품의`, doc.title);
  assert(Number(doc.body.employeeId) === Number(member.id) && doc.body.certType === 'employment', '신청 대상·종류 고정');
  assert(doc.steps.map((s) => s.kind).join() === 'approval,agreement', doc.steps.map((s) => s.kind).join());
  assert((await recipientIds(id)).join() === String(officer.id), '첫 메일은 결재자');
  const req = await certificates.getRequest(employmentRequest.id);
  assert(req.status === 'processing' && req.documentId === id && req.handlerName === adminA.name, `신청 ${req.status}`);
  assert((await certificates.countOpenRequests(adminA.id)) === 0, '결재 중이면 접수 대기 숫자에서 빠짐');
});

await check('발급 품의: 같은 신청 중복 품의·반려·취소 409, 신청 직원·무관한 직원은 품의 문서 못 봄', async () => {
  const body = { requestId: employmentRequest.id, items: [], purpose: 'x' };
  await expectError(() => issueDraft(body, line(officer)), /이미 내부 결재 중/, 409);
  await expectError(() => certificates.rejectRequest(adminA, employmentRequest.id, '사유'), /내부 결재 중/, 409);
  await expectError(() => certificates.cancelRequest(member.id, employmentRequest.id), /내부 결재 중/, 409);
  await expectError(() => documents.getDocument(memberAcc, issueDocId), /찾을 수 없습니다/, 404);
  await expectError(() => documents.getDocument(outsiderAcc, issueDocId), /찾을 수 없습니다/, 404);
  await documents.getDocument(adminBAcc, issueDocId);
});

let employmentCert = null;
await check('내부 결재 반대 → 신청 접수 대기로 복귀, 다시 품의 → 최종 승인 시 발급', async () => {
  await documents.approveDocument(officerAcc, issueDocId);
  const rejected = await documents.rejectDocument(adminBAcc, issueDocId, '제출처 확인 필요');
  assert(rejected.status === 'rejected' && !rejected.steps[1].proxy, rejected.status);
  let req = await certificates.getRequest(employmentRequest.id);
  assert(req.status === 'requested' && req.documentId === null, `반려 후 ${req.status}`);
  const { id } = await issueDraft(
    { requestId: employmentRequest.id, items: ['birthDate', 'department'], purpose: '금융기관 제출용', submitTo: '국민은행', showSeal: false },
    line(officer),
    { sourceId: issueDocId }
  );
  const doc = await documents.approveDocument(officerAcc, id, '발급 승인');
  assert(doc.status === 'approved' && /^발급-\d{4}-0001$/.test(doc.documentNo) && doc.certificate, `${doc.status} ${doc.documentNo}`);
  employmentCert = await certificates.getCertificate(memberAcc, doc.certificate.id);
  assert(/^\d{4}-0001$/.test(employmentCert.certNo) && /^[A-Z2-9]{8}$/.test(employmentCert.verifyCode), employmentCert.certNo);
  assert(
    employmentCert.channel === 'approval' && employmentCert.documentId === id && employmentCert.issuedByName === adminA.name,
    `발급 경로 ${employmentCert.channel} ${employmentCert.issuedByName}`
  );
  const c = employmentCert.content;
  assert(c.birthDate === '1990-05-17' && c.department && c.address === null && c.statement.includes('재직하고'), '기재 내용');
  assert(employmentCert.sealImage === '' && !employmentCert.showSeal, '직인 끔');
  req = await certificates.getRequest(employmentRequest.id);
  assert(req.status === 'issued' && req.certificateId === employmentCert.id && req.certNo === employmentCert.certNo, `신청 ${req.status}`);
  const mine = await certificates.listMine(member.id);
  assert(mine.certificates.some((cert) => cert.id === employmentCert.id), '내 발급 내역');
  const myReq = mine.requests.find((r) => r.id === employmentRequest.id);
  assert(
    myReq?.status === 'issued' && myReq.certificateId === employmentCert.id && myReq.certificateStatus === 'issued',
    `신청 내역에서 인쇄할 증명서 ${JSON.stringify(myReq && { s: myReq.status, c: myReq.certificateId, cs: myReq.certificateStatus })}`
  );
  assert(employmentCert.content?.name && employmentCert.employeeId === String(member.id), '신청자 본인 인쇄용 내용');
});

let careerCert = null;
await check('경력증명서도 같은 흐름: 회수하면 접수 대기, 다시 품의 → 발급', async () => {
  await expectError(
    () => certificates.createRequest(member.id, { certType: 'career', items: ['duty'], purpose: '이직 제출용' }),
    /담당업무/
  );
  const req = await certificates.createRequest(member.id, {
    certType: 'career',
    items: ['department', 'duty'],
    duty: '설비 보전',
    purpose: '이직 제출용',
  });
  const body = { requestId: req.id, items: ['department', 'duty'], duty: '설비 보전', purpose: '이직 제출용' };
  const first = await issueDraft(body, line(officer));
  await documents.withdrawDocument(adminAAcc, first.id);
  assert((await certificates.getRequest(req.id)).status === 'requested', '회수 후 접수 대기');
  const second = await issueDraft(body, line(officer));
  const doc = await documents.approveDocument(officerAcc, second.id);
  careerCert = await certificates.getCertificate(memberAcc, doc.certificate.id);
  assert(careerCert.certType === 'career' && careerCert.content.duty === '설비 보전' && careerCert.showSeal, '경력 내용');
  assert((await certificates.getRequest(req.id)).status === 'issued', '발급 완료');
});

await check('신청 반려·취소: 접수 대기에만, 반려 사유 필수, 반려된 신청은 품의 불가', async () => {
  const r2 = await certificates.createRequest(member.id, { certType: 'career', items: [], purpose: '확인용' });
  await expectError(() => certificates.rejectRequest(adminA, r2.id, ''), /반려 사유/);
  const rejected = await certificates.rejectRequest(adminA, r2.id, '경력 기간 확인 필요');
  assert(rejected.status === 'rejected' && rejected.rejectReason === '경력 기간 확인 필요' && rejected.handlerName === adminA.name, '반려');
  await expectError(() => issueDraft({ requestId: r2.id, items: [], purpose: 'x' }, line(officer)), /반려된 신청/, 409);
  const r3 = await certificates.createRequest(member.id, { certType: 'employment', items: [], purpose: '확인용' });
  await expectError(() => certificates.cancelRequest(outsider.id, r3.id), /찾을 수 없습니다/, 404);
  const cancelled = await certificates.cancelRequest(member.id, r3.id);
  assert(cancelled.status === 'cancelled', cancelled.status);
  await expectError(() => certificates.cancelRequest(member.id, r3.id), /취소한 신청/, 409);
});

await check('같은 신청에 동시에 품의: 하나만 성공', async () => {
  const req = await certificates.createRequest(member.id, { certType: 'employment', items: [], purpose: '동시 품의' });
  const settled = await Promise.allSettled(
    Array.from({ length: 3 }, () => issueDraft({ requestId: req.id, items: [], purpose: '동시 품의' }, line(officer)))
  );
  const ok = settled.filter((s) => s.status === 'fulfilled');
  assert(ok.length === 1 && settled.every((s) => s.status === 'fulfilled' || s.reason.status === 409), JSON.stringify(settled.map((s) => s.status)));
  const pending = await db
    .prepare(`SELECT COUNT(*) AS n FROM approval_documents WHERE form_key = 'certificate_issue' AND status = 'pending'`)
    .get();
  assert(Number(pending.n) === 1, `진행 중 품의 ${pending.n}`);
  await documents.withdrawDocument(adminAAcc, ok[0].value.id);
  await certificates.cancelRequest(member.id, req.id);
});

await check('설정: 직인 이미지 형식·크기 검사', async () => {
  const settings = await certificates.getSettings();
  assert(!('selfIssue' in settings), '직접 발급 설정 없음');
  await expectError(() => certificates.saveSettings({ ...settings, sealImage: 'data:image/gif;base64,AAAA' }), /PNG 또는 JPG/);
  const big = `data:image/png;base64,${Buffer.alloc(310 * 1024).toString('base64')}`;
  await expectError(() => certificates.saveSettings({ ...settings, sealImage: big }), /KB 이하/);
  const png = `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`;
  const saved = await certificates.saveSettings({ ...settings, sealImage: png, ceoName: '대표자' });
  assert(saved.sealImage === png && saved.ceoName === '대표자', '저장');
  const cert = await certificates.getCertificate(memberAcc, careerCert.id);
  assert(cert.sealImage === png, '인쇄용 직인');
  await certificates.getCertificate(adminAAcc, careerCert.id);
  await expectError(() => certificates.getCertificate(outsiderAcc, careerCert.id), /찾을 수 없습니다/, 404);
});

await check('진위 확인: 번호+코드 일치 시 가린 성명, 틀리면 404', async () => {
  const result = await certificates.verifyCertificate(`제 ${employmentCert.certNo} 호`, employmentCert.verifyCode.toLowerCase());
  assert(result.maskedName.includes('*') && result.maskedName !== member.name, result.maskedName);
  assert(result.status === 'issued' && result.typeLabel === '재직증명서', '상태');
  await expectError(() => certificates.verifyCertificate(employmentCert.certNo, 'ABCDEFGH'), /일치하는 증명서가 없습니다/, 404);
  await expectError(() => certificates.verifyCertificate('없음', 'ABCDEFGH'), /발급번호와 8자리/);
});

await db.prepare(`UPDATE employees SET is_active = 0, terminated_date = ? WHERE id = ?`).run(`${year}-10-30`, retiree.id);

await check('인사담당 임의 발급 품의: 퇴직자 퇴직증명서·재직자 재직증명서, 퇴직자 재직증명서는 불가, 결재자 없이 본인 결재', async () => {
  await expectError(() => issueDraft({ items: [], purpose: 'x' }, line(officer)), /발급할 직원을 선택/);
  await expectError(
    () => issueDraft({ employeeId: retiree.id, certType: 'employment', items: [], purpose: 'x' }, line(officer)),
    /재직증명서를 발급할 수 없습니다/
  );
  const retire = await issueDraft(
    {
      employeeId: retiree.id,
      certType: 'retirement',
      items: ['position', 'retireReason'],
      retireReason: '개인 사정',
      purpose: '관공서 제출용',
      showSeal: false,
    },
    line(officer)
  );
  const retireDoc = await documents.approveDocument(officerAcc, retire.id);
  assert(retireDoc.title === `${retiree.name} 퇴직증명서 발급 품의` && retireDoc.summary.includes('인사 품의'), retireDoc.summary);
  const cert = await certificates.getCertificate(adminAAcc, retireDoc.certificate.id);
  assert(cert.content.endDate === `${year}-10-30` && cert.content.retireReason === '개인 사정', '퇴직 내용');
  assert(cert.sealImage === '' && cert.channel === 'admin' && cert.issuedByName === adminA.name, `경로 ${cert.channel}`);
  const employment = await issueDraft({ employeeId: outsider.id, certType: 'employment', items: ['position'], purpose: '은행 제출용' }, line(officer));
  const doc = await documents.approveDocument(officerAcc, employment.id);
  const cert2 = await certificates.getCertificate(adminAAcc, doc.certificate.id);
  assert(cert2.channel === 'admin' && cert2.employeeName === outsider.name, '재직자 임의 발급');

  const self = await issueDraft({ employeeId: outsider.id, certType: 'employment', items: [], purpose: '본인 결재 발급' }, []);
  assert(self.autoApproved, '결재선 없이 올리면 본인 결재로 완료');
  const selfDoc = await documents.getDocument(adminAAcc, self.id);
  assert(selfDoc.status === 'approved' && /^발급-\d{4}-\d{4}$/.test(selfDoc.documentNo) && selfDoc.certificate?.status === 'issued', `${selfDoc.status} ${selfDoc.documentNo}`);
  assert(
    selfDoc.steps.length === 1 && selfDoc.steps[0].status === 'approved' && selfDoc.steps[0].actorName === adminA.name && selfDoc.steps[0].comment === '본인 결재',
    JSON.stringify(selfDoc.steps)
  );
  const selfReq = await certificates.createRequest(member.id, { certType: 'employment', items: [], purpose: '본인 결재 신청 처리' });
  const fromRequest = await issueDraft({ requestId: selfReq.id, items: [], purpose: '본인 결재 신청 처리' }, []);
  assert(fromRequest.autoApproved && (await certificates.getRequest(selfReq.id)).status === 'issued', '신청도 본인 결재로 바로 발급');
  await expectError(
    () => documents.createDocument(adminA.id, { formKey: 'general', title: 'x', body: { content: 'x' }, line: [] }, { access: adminAAcc }),
    /결재자를 1명 이상/
  );
  const targets = await certificates.listIssueTargets();
  const target = targets.find((t) => t.id === String(retiree.id));
  assert(target && !target.isActive && target.terminatedDate === `${year}-10-30` && !target.beyondLegalPeriod, '대상 목록');
});

await check('증명서 취소: 사유 필수, 취소 후 인쇄 내용 없음, 진위 확인 "취소"', async () => {
  await expectError(() => certificates.revokeCertificate(adminA, employmentCert.id, ''), /취소 사유/);
  const revoked = await certificates.revokeCertificate(adminA, employmentCert.id, '용도 오기재');
  assert(revoked.status === 'revoked' && revoked.content === null && revoked.sealImage === '', '취소');
  await expectError(() => certificates.revokeCertificate(adminA, employmentCert.id, '다시'), /이미 취소/, 409);
  const result = await certificates.verifyCertificate(employmentCert.certNo, employmentCert.verifyCode);
  assert(result.status === 'revoked' && result.revokedAt, '진위 확인 취소');
});

await check('발급대장: 필터·검색·CSV, 일련번호 연속', async () => {
  const all = await certificates.listRegister({ year });
  assert(all.length === 6, `발급 ${all.length}`);
  const seqs = all.map((c) => c.certNo).sort();
  assert(seqs.join() === [1, 2, 3, 4, 5, 6].map((n) => `${year}-${String(n).padStart(4, '0')}`).join(), seqs.join());
  assert((await certificates.listRegister({ status: 'revoked' })).length === 1, '취소 필터');
  assert((await certificates.listRegister({ type: 'retirement' })).length === 1, '종류 필터');
  assert((await certificates.listRegister({ q: retiree.name })).length >= 1, '검색');
  const csv = await certificates.exportRegister({ year });
  assert(csv.rows.length === 6 && csv.rows.some((r) => r[6].includes('퇴직사유')), 'CSV 기재 항목');
  assert(csv.rows.some((r) => r[7] === '직원 신청') && csv.rows.some((r) => r[7] === '인사 품의'), 'CSV 발급 경로');
});

await check('동시 발급·동시 완료: 발급번호·문서번호 중복 없음', async () => {
  const ids = await Promise.all(
    Array.from({ length: 6 }, () =>
      certificates.issueCertificate({
        employeeId: member.id,
        data: { certType: 'employment', items: [], purpose: '동시 발급 검증' },
        channel: 'admin',
        actor: adminA,
      })
    )
  );
  const nos = new Set();
  for (const id of ids) nos.add((await db.prepare('SELECT cert_no FROM certificates WHERE id = ?').get(id)).cert_no);
  assert(nos.size === 6, `발급번호 ${[...nos].join()}`);
  const docIds = [];
  for (let i = 0; i < 4; i += 1) {
    docIds.push(
      (await documents.createDocument(member.id, { formKey: 'general', title: `동시 ${i}`, body: { content: 'x' }, line: line(leader) })).id
    );
  }
  const done = await Promise.all(docIds.map((id) => documents.approveDocument(leaderAcc, id)));
  const docNos = new Set(done.map((d) => d.documentNo));
  assert(docNos.size === 4 && done.every((d) => d.status === 'approved'), `문서번호 ${[...docNos].join()}`);
});

for (const row of savedWorkplaces) {
  await db.prepare('UPDATE employees SET workplace_code = ? WHERE id = ?').run(row.workplace_code, row.id);
}

/* ───────────── 퇴사자 연차 수정 (정산 전/후) ───────────── */

let accrualId = 0;
await check('퇴사자 연차(정산 전): 발생 추가·수정, 사용 추가는 퇴사일까지', async () => {
  const list = await leave.getTerminatedEmployees();
  const item = list.find((e) => e.id === `emp-${retiree.id}` || e.id === String(retiree.id));
  assert(item && item.resignation && !item.resignation.settled, '정산 전 퇴사자 목록');
  const accrual = await leave.createAccrual({
    employeeId: retiree.id,
    date: `${year}-10-01`,
    type: 'adjustment',
    amount: 1,
    description: '검증',
  });
  accrualId = Number(String(accrual.id).replace(/\D/g, ''));
  await leave.updateAccrual(accrualId, { date: `${year}-10-02`, type: 'adjustment', amount: 2, description: '검증' });
  await expectError(
    () => leave.createAccrual({ employeeId: retiree.id, date: `${year - 1}-12-01`, type: 'adjustment', amount: 1, description: 'x' }),
    /퇴사 연도/
  );
  await expectError(
    () => leave.createUsage({ employeeId: retiree.id, date: `${year}-11-03`, type: 'full', reason: 'x' }, adminA),
    /퇴사일\(.+\) 이후/
  );
  await leave.createUsage({ employeeId: retiree.id, date: `${year}-10-20`, type: 'full', reason: '검증' }, adminA);
  const detail = await leave.getEmployeeById(retiree.id, { includeTerminated: true });
  assert(detail && detail.isActive === false && detail.terminatedDate === `${year}-10-30`, '퇴사자 상세');
});

await check('퇴사자 연차(정산 확정 후): 수정·삭제 409', async () => {
  await leave.saveLeaveEventSettlement(year, adminA.id);
  const list = await leave.getTerminatedEmployees();
  const item = list.find((e) => e.id === `emp-${retiree.id}` || e.id === String(retiree.id));
  assert(item?.resignation?.settled, '정산 확정 표시');
  await expectError(
    () => leave.createAccrual({ employeeId: retiree.id, date: `${year}-10-03`, type: 'adjustment', amount: 1, description: 'x' }),
    /정산이 확정/,
    409
  );
  await expectError(() => leave.deleteAccrual(accrualId), /정산이 확정/, 409);
});

await check('직원 정보: 직위·급호(급+호봉 1~14) 저장, 직위에 맞는 급만, 직급과 별개, 비우기', async () => {
  const employees = await import('../server/services/employeeService.js');
  const { payGradeText } = await import('../src/constants/hr.js');
  assert(payGradeText('1급갑', 7) === '1급갑07' && payGradeText('2급을', 5) === '2급을05' && payGradeText('3급', 5) === '3급05', '표기');
  const before = await db.prepare('SELECT position FROM employees WHERE id = ?').get(outsider.id);
  let emp = await employees.updateEmployee(outsider.id, { jobRank: '과장', payGrade: '2급갑', payStep: '7' });
  assert(emp.jobRank === '과장' && emp.payGrade === '2급갑' && emp.payStep === 7 && emp.position === before.position, JSON.stringify(emp));
  await expectError(() => employees.updateEmployee(outsider.id, { jobRank: '팀장' }), /직위는/, 400);
  await expectError(() => employees.updateEmployee(outsider.id, { jobRank: '대리' }), /대리 직위의 급은 2급을/, 400);
  await expectError(() => employees.updateEmployee(outsider.id, { payGrade: '2갑' }), /급을 목록/, 400);
  await expectError(() => employees.updateEmployee(outsider.id, { payStep: '15' }), /호봉은 1~14/, 400);
  await expectError(() => employees.updateEmployee(outsider.id, { payStep: '' }), /급과 호봉을 함께/, 400);
  emp = await employees.updateEmployee(outsider.id, { name: outsider.name });
  assert(emp.payGrade === '2급갑' && emp.payStep === 7, '다른 항목만 고치면 유지');
  emp = await employees.updateEmployee(outsider.id, { jobRank: '사원', payGrade: '5급', payStep: 14 });
  assert(emp.payGrade === '5급' && emp.payStep === 14, '사원은 학력별 급');
  const roster = await employees.getEmployeeRoster(false);
  assert(roster.find((e) => e.id === String(outsider.id))?.payGrade === '5급', '명부 목록');
  await expectError(() => employees.updateEmployee(outsider.id, { jobRank: '상무' }), /상무 직위는 급호가 없습니다/, 400);
  emp = await employees.updateEmployee(outsider.id, { jobRank: '부사장', payGrade: '', payStep: '' });
  assert(emp.jobRank === '부사장' && !emp.payGrade && emp.payStep === null, '임원 직위는 급호 없이 저장');
  emp = await employees.updateEmployee(outsider.id, { jobRank: '', payGrade: '', payStep: '' });
  assert(emp.jobRank === '' && emp.payGrade === '' && emp.payStep === null, JSON.stringify(emp));
  const created = await employees.createEmployee({ name: '직위시험', hireDate: '2026-11-01', jobRank: '사원', payGrade: '3급', payStep: 1 });
  assert(created.jobRank === '사원' && created.payGrade === '3급' && created.payStep === 1, JSON.stringify(created));
  await expectError(() => employees.createEmployee({ name: '직위시험2', hireDate: '2026-11-01', jobRank: '부장', payGrade: '1급을', payStep: 1 }), /부장 직위의 급은 1급갑/, 400);
});

/* ───────────── 특별휴가(경조·공가·출산전후·배우자 출산·가족돌봄) ───────────── */

const { listLeaveRequestDates } = await import('../src/utils/leaveRequestDates.js');
const attendance = await import('../server/services/attendanceService.js');
const pastWeeks = [];
{
  const today = new Date().toISOString().slice(0, 10);
  for (let d = new Date(`${year}-02-01T00:00:00Z`); pastWeeks.length < 4; d.setUTCDate(d.getUTCDate() + 7)) {
    const mon = new Date(d);
    mon.setUTCDate(mon.getUTCDate() + ((8 - mon.getUTCDay()) % 7));
    const start = mon.toISOString().slice(0, 10);
    const fri = new Date(mon);
    fri.setUTCDate(fri.getUTCDate() + 4);
    const end = fri.toISOString().slice(0, 10);
    if (end >= today) break;
    if (listLeaveRequestDates(start, end).length !== 5) continue;
    const busy = await db
      .prepare("SELECT 1 FROM leave_usages WHERE employee_id = ? AND usage_date BETWEEN ? AND ? AND status IN ('pending', 'approved')")
      .get(member.id, start, end);
    if (!busy && !pastWeeks.some((w) => w.start === start)) pastWeeks.push({ start, end });
  }
}
const usedOf = async () => {
  const emp = await leave.getEmployeeById(member.id);
  return { used: emp.leaveSummary.usedDays, remaining: emp.leaveSummary.remaining };
};

await check('특별휴가: 종류·반차 검사, 공가 5일 한 번에 승인해도 연차 사용·잔여 그대로, 근태는 휴가', async () => {
  assert(pastWeeks.length >= 3, `빈 주가 부족합니다: ${JSON.stringify(pastWeeks)}`);
  const { start, end } = pastWeeks[0];
  await expectError(() => leave.submitLeaveRequest({ employeeId: member.id, kind: 'nope', type: 'full', startDate: start, endDate: start }), /휴가 종류/, 400);
  await expectError(
    () => leave.submitLeaveRequest({ employeeId: member.id, kind: 'condolence', type: 'half', halfPeriod: 'am', startDate: start }),
    /하루 단위로만/,
    400
  );
  const before = await usedOf();
  const submitted = await leave.submitLeaveRequest({ employeeId: member.id, kind: 'official', type: 'full', startDate: start, endDate: end });
  assert(submitted.count === 5 && submitted.kind === 'official' && submitted.reason === '공가', JSON.stringify(submitted));
  const pending = (await leave.getPendingApprovals(leader.id)).filter((u) => u.requestGroup === submitted.requestGroup);
  assert(pending.length === 5, `결재함 ${pending.length}건`);
  const decided = await leave.decideLeaveRequest(submitted.id, leader.id, 'approve', '', { group: true });
  assert(decided.count === 5 && decided.status === 'approved', JSON.stringify(decided));
  const special = (await leave.getSpecialLeaves(member.id)).filter((u) => u.requestGroup === submitted.requestGroup);
  assert(special.length === 5 && special.every((u) => u.status === 'approved' && u.kind === 'official'), '특별휴가 기록');
  const after = await usedOf();
  assert(after.used === before.used && after.remaining === before.remaining, `연차 변동 ${JSON.stringify({ before, after })}`);
  const admin = await leave.getAdminUsages(member.id);
  assert(!admin.some((u) => u.requestGroup === submitted.requestGroup), '연차 사용 목록에 섞이면 안 됨');
  const month = await attendance.getEmployeeMonth(member.id, start.slice(0, 7));
  const day = month.days.find((d) => d.date === start);
  assert(day?.leave?.leaveKind === 'official' && !day.evaluation.flags.includes('absent'), JSON.stringify(day?.evaluation));
});

await check('특별휴가: 여러 날 한 번에 반려·취소, 가족돌봄 연 10일 넘으면 안내(신청은 됨)', async () => {
  assert(pastWeeks.length >= 4, `빈 주가 부족합니다: ${JSON.stringify(pastWeeks)}`);
  const [, second, third, fourth] = pastWeeks;
  const care = await leave.submitLeaveRequest({ employeeId: member.id, kind: 'family_care', type: 'full', startDate: second.start, endDate: second.end });
  assert(care.count === 5 && care.warnings.length === 0, JSON.stringify(care.warnings));
  const rejected = await leave.decideLeaveRequest(care.id, leader.id, 'reject', '서류 보완', { group: true });
  assert(rejected.count === 5 && rejected.status === 'rejected', JSON.stringify(rejected));
  const careAgain = await leave.submitLeaveRequest({ employeeId: member.id, kind: 'family_care', type: 'full', startDate: second.start, endDate: second.end });
  await leave.decideLeaveRequest(careAgain.id, leader.id, 'approve', '', { group: true });
  const ten = await leave.submitLeaveRequest({ employeeId: member.id, kind: 'family_care', type: 'full', startDate: third.start, endDate: third.end });
  assert(ten.warnings.length === 0, `딱 10일은 안내 없음: ${JSON.stringify(ten.warnings)}`);
  const over = await leave.submitLeaveRequest({ employeeId: member.id, kind: 'family_care', type: 'full', startDate: fourth.start, endDate: fourth.end });
  assert(over.count === 5 && over.warnings.some((w) => /10일/.test(w)), JSON.stringify(over.warnings));
  await expectError(() => leave.cancelLeaveRequest(over.id, outsider.id, { group: true }), /찾을 수 없/, 404);
  const cancelled = await leave.cancelLeaveRequest(over.id, member.id, { group: true });
  assert(cancelled.count === 5, JSON.stringify(cancelled));
  const left = (await leave.getSpecialLeaves(member.id)).filter((u) => u.requestGroup === over.requestGroup);
  assert(left.length === 0, `취소 후 ${left.length}건 남음`);
});

await check('조직도: 사업장·부서·팀장·팀원, 겸직 팀장, 사업장관리자 범위, 공장 소속 이사는 공장장, 담당 자리 제외', async () => {
  const { getOrgChart } = await import('../server/services/orgService.js');
  const chart = await getOrgChart();
  const depts = chart.workplaces.flatMap((w) => w.departments);
  const people = [...chart.ceo, ...chart.officers.map((o) => o.holder).filter(Boolean), ...chart.workplaces.flatMap((w) => w.heads), ...depts.flatMap((d) => [...d.leads.filter((l) => !l.concurrent), ...d.members])];
  const activeCount = Number((await db.prepare('SELECT COUNT(*) AS n FROM employees WHERE is_active = 1').get()).n);
  assert(chart.total === activeCount, `재직 ${chart.total} / ${activeCount}`);
  assert(new Set(people.map((p) => p.id)).size === chart.total, `중복·누락 ${new Set(people.map((p) => p.id)).size} / ${chart.total}`);
  assert(!chart.officers.some((o) => o.role === '담당') && !depts.some((d) => d.leads.some((l) => l.label === '담당')), '결재 라인 담당 자리는 조직도에 없음');
  const myDept = depts.find((d) => d.members.some((m) => m.id === String(member.id)));
  assert(myDept && myDept.leads.some((l) => l.id === String(leader.id)), `팀원 ${member.name}의 부서에 팀장 ${leader.name}`);
  const concurrent = active.find((e) => e.concurrent_position === '팀장' && e.concurrent_dept_code);
  if (concurrent) {
    const dept = depts.find((d) => d.code === String(concurrent.concurrent_dept_code));
    assert(dept?.leads.some((l) => l.id === String(concurrent.id) && l.concurrent), '겸직 팀장');
  }
  const scoped = await getOrgChart(new Set([String(member.id), String(leader.id)]));
  assert(scoped.total === 2 && scoped.workplaces.flatMap((w) => w.departments).length >= 1, '범위 제한');

  const factory = active.find((e) => e.workplace_code && String(e.workplace_code) !== '1');
  const inserted = await db
    .prepare(
      `INSERT INTO employees (name, hire_date, workplace, workplace_code, department, department_code, position)
       VALUES ('공장임원시험', '2026-11-01', ?, ?, ?, ?, '이사')`
    )
    .run(factory.workplace, factory.workplace_code, factory.department, factory.department_code);
  try {
    const withOfficer = await getOrgChart();
    const site = withOfficer.workplaces.find((w) => w.code === String(factory.workplace_code));
    assert(site?.heads[0]?.name === '공장임원시험' && site.heads[0].position === '이사', `공장 소속 이사는 공장장 자리 ${JSON.stringify(site?.heads)}`);
    assert(!withOfficer.officers.some((o) => o.holder?.name === '공장임원시험'), '임원 줄에는 없음');
    assert(!site.departments.some((d) => d.members.some((m) => m.name === '공장임원시험')), '부서원에도 없음');
  } finally {
    await db.prepare('DELETE FROM employees WHERE id = ?').run(inserted.lastInsertRowid);
  }
});

await check('법정의무교육: 배정·수강·이수 기록이 있어도 배정·과정 삭제, 기록도 함께 삭제', async () => {
  const training = await import('../server/services/trainingService.js');
  const today = new Date().toISOString().slice(0, 10);
  const course = await training.saveCourse(null, {
    title: '삭제 검증 과정',
    videos: [{ title: '외부 교육', kind: 'link', videoRef: 'https://example.com/edu' }],
  });
  const videoId = course.videos[0].id;
  const target = { type: 'employees', employeeIds: [member.id, outsider.id] };
  const assign = async () => {
    const session = await training.createSession({ courseId: course.id, startDate: today, dueDate: `${year}-12-31`, target }, adminA);
    const row = await db.prepare('SELECT id FROM training_assignees WHERE session_id = ? AND employee_id = ?').get(session.id, member.id);
    await training.openLink(member.id, row.id, videoId);
    await training.completeLink(member.id, row.id, videoId);
    return session;
  };
  const count = async (sql, ...params) => Number((await db.prepare(sql).get(...params))?.n) || 0;
  const progressOf = (sessionId) =>
    count('SELECT COUNT(*) AS n FROM training_progress WHERE assignee_id IN (SELECT id FROM training_assignees WHERE session_id = ?)', sessionId);

  const first = await assign();
  assert((await training.getSession(first.id)).completedCount === 1 && (await progressOf(first.id)) === 1, '수강·이수 기록');
  await training.deleteSession(first.id);
  assert((await count('SELECT COUNT(*) AS n FROM training_assignees WHERE session_id = ?', first.id)) === 0 && (await progressOf(first.id)) === 0, '배정 삭제');

  const second = await assign();
  const third = await assign();
  const result = await training.deleteCourse(course.id);
  assert(result.removed.sessions === 2 && result.removed.assignees === 4, JSON.stringify(result));
  assert((await count('SELECT COUNT(*) AS n FROM training_sessions WHERE course_id = ?', course.id)) === 0, '배정 남음');
  assert((await progressOf(second.id)) + (await progressOf(third.id)) === 0, '수강 기록 남음');
  assert((await count('SELECT COUNT(*) AS n FROM training_videos WHERE course_id = ?', course.id)) === 0, '영상 남음');
  const mine = await training.listMine(member.id);
  assert(!JSON.stringify(mine).includes('삭제 검증 과정'), '직원 화면에 남음');
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : `\n     → ${r.error}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed (${getDbDialect()})`);
await db.close?.();
process.exit(failed.length ? 1 : 0);

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

await check('결재선 검사: 없음·본인·중복·합의로 끝남·인원 초과', async () => {
  const base = { formKey: 'general', title: 'x', body: { content: 'x' } };
  await expectError(() => documents.createDocument(member.id, base), /결재자를 1명 이상/);
  await expectError(() => documents.createDocument(member.id, { ...base, line: line(member) }), /본인은/);
  await expectError(() => documents.createDocument(member.id, { ...base, line: line(leader, leader) }), /두 번/);
  await expectError(
    () => documents.createDocument(member.id, { ...base, line: line(leader, [outsider, 'agreement']) }),
    /마지막은 결재자/
  );
  const eleven = active.filter((e) => e.id !== member.id).slice(0, 11);
  await expectError(() => documents.createDocument(member.id, { ...base, line: line(...eleven) }), /10명까지/);
});

let tripId = 0;
await check('출장 신청: 반려(사유 필수) → 다시 기안(원문 연결) → 회수', async () => {
  ({ id: tripId } = await documents.createDocument(member.id, {
    formKey: 'business_trip',
    title: '부산공장 출장',
    body: { destination: '부산공장', startDate: '2026-11-10', endDate: '2026-11-11', purpose: '설비 점검', expense: '150,000' },
    line: line(leader),
  }));
  const created = await documents.getDocument(memberAcc, tripId);
  assert(created.body.expense === 150000, `경비 ${created.body.expense}`);
  assert(created.summary.includes('150,000원'), created.summary);
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
    line: line(leader),
    sourceId: tripId,
  });
  const again = await documents.getDocument(memberAcc, againId);
  assert(again.sourceId === tripId && again.status === 'pending', '원문 연결');
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

await check('경조금: 지정한 팀장 → 인사 확인, 인사담당이 팀장 단계 대리 승인(대리 표시)', async () => {
  const { id } = await documents.createDocument(member.id, {
    formKey: 'condolence',
    title: '부친 회갑 경조금',
    body: { eventType: '부모 회갑·칠순', relation: '부', targetName: '홍길동', eventDate: '2026-11-20' },
    line: line(leader),
  });
  let doc = await documents.getDocument(adminAAcc, id);
  assert(doc.steps.map((s) => s.role).join() === '결재,인사', doc.steps.map((s) => s.role).join());
  assert(doc.permissions.approve && doc.permissions.proxy, '인사담당 대리 가능');
  doc = await documents.approveDocument(adminAAcc, id);
  assert(doc.steps[0].proxy && doc.steps[0].actorName === adminA.name, '대리 표시');
  assert(doc.status === 'pending' && doc.steps[1].status === 'pending', '인사 단계 대기');
  const hrIds = await recipientIds(id);
  assert(hrIds.includes(Number(adminB.id)) && !hrIds.includes(Number(member.id)), '인사 단계 메일은 인사담당');
  const todo = await documents.listBox(adminB.id, 'todo');
  assert(todo.items.some((item) => item.id === id && item.currentRole === '인사'), '인사담당 결재함');
  await expectError(() => documents.withdrawDocument(memberAcc, id), /이미 승인한 결재자/, 409);
  doc = await documents.approveDocument(adminBAcc, id);
  assert(doc.status === 'approved' && /^경조-\d{4}-0001$/.test(doc.documentNo), doc.documentNo);
  assert(!doc.steps[1].proxy, '인사 단계는 결재선 처리');
});

await check('교육 신청: 서울 팀장이 지정한 임원 → 인사', async () => {
  const suggested = await documents.suggestLine(seoulLead.id);
  assert(suggested[0]?.employeeId === String(officer.id), `추천 ${JSON.stringify(suggested)}`);
  const { id } = await documents.createDocument(seoulLead.id, {
    formKey: 'training_request',
    title: '외부 교육',
    body: { courseName: '노무관리 실무', institution: '노사발전재단', startDate: '2026-12-01', endDate: '2026-12-01', cost: 0, purpose: '역량 강화' },
    line: line(officer),
  });
  let doc = await documents.getDocument(seoulAcc, id);
  assert(doc.steps.map((s) => s.role).join() === '결재,인사', doc.steps.map((s) => s.role).join());
  await expectError(() => documents.approveDocument(leaderAcc, id), /차례가 아닙니다/, 403);
  doc = await documents.approveDocument(officerAcc, id);
  assert(doc.steps[0].actorName === officer.name && !doc.steps[0].proxy, '임원 처리');
  doc = await documents.approveDocument(adminAAcc, id, '확인');
  assert(doc.status === 'approved' && /^교육-/.test(doc.documentNo), doc.documentNo);
});

await check('합의: 합의자 → 결재자 순서, 합의하면 다음 결재자에게 메일·결재함', async () => {
  const { id } = await documents.createDocument(member.id, {
    formKey: 'general',
    title: '타부서 합의 품의',
    body: { content: '합의 검증' },
    line: line([outsider, 'agreement'], leader),
  });
  let doc = await documents.getDocument(memberAcc, id);
  assert(doc.steps.map((s) => `${s.kind}:${s.assigneeId}`).join() === `agreement:${outsider.id},approval:${leader.id}`, '단계 순서');
  assert(doc.steps[0].statusLabel === '합의 대기', doc.steps[0].statusLabel);
  assert((await recipientIds(id)).join() === String(outsider.id), '첫 메일은 합의자');
  assert(!(await documents.listBox(leader.id, 'todo')).items.some((item) => item.id === id), '결재자 결재함에는 아직 없음');
  const preview = await documents.getDocument(leaderAcc, id);
  assert(!preview.permissions.approve, '결재선에 있는 결재자는 미리 볼 수 있으나 처리 불가');
  await expectError(() => documents.approveDocument(leaderAcc, id), /차례가 아닙니다/, 403);
  const todo = await documents.listBox(outsider.id, 'todo');
  assert(todo.items.some((item) => item.id === id && item.currentRole === `${outsider.name} 합의`), '합의자 결재함');
  doc = await documents.approveDocument(outsiderAcc, id, '이견 없음');
  assert(doc.steps[0].statusLabel === '합의' && doc.steps[1].status === 'pending', '합의 완료 → 결재 대기');
  assert((await recipientIds(id)).join() === String(leader.id), '합의 후 메일은 다음 결재자');
  assert((await documents.listBox(leader.id, 'todo')).items.some((item) => item.id === id), '결재자 결재함');
  doc = await documents.approveDocument(leaderAcc, id);
  assert(doc.status === 'approved' && doc.documentNo, '완료');
});

await check('합의 반대: 반대 사유 필수, 문서 반려', async () => {
  const { id } = await documents.createDocument(member.id, {
    formKey: 'general',
    title: '반대 검증',
    body: { content: 'x' },
    line: line([outsider, 'agreement'], leader),
  });
  await expectError(() => documents.rejectDocument(outsiderAcc, id, ''), /반대 사유/);
  const doc = await documents.rejectDocument(outsiderAcc, id, '예산 초과');
  assert(doc.status === 'rejected' && doc.steps[0].statusLabel === '반대' && doc.steps[1].status === 'skipped', '반려');
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

await check('인사담당 본인 문서의 인사 단계는 본인이 처리 못 함', async () => {
  const { id } = await documents.createDocument(adminA.id, {
    formKey: 'condolence',
    title: '본인 결혼',
    body: { eventType: '본인 결혼', relation: '본인', targetName: adminA.name, eventDate: '2026-12-05' },
    line: line(adminB),
  });
  const doc = await documents.getDocument(adminAAcc, id);
  if (doc.steps.length > 1) await documents.approveDocument(adminBAcc, id);
  await expectError(() => documents.approveDocument(adminAAcc, id), /차례가 아닙니다/, 403);
  const done = await documents.approveDocument(adminBAcc, id);
  assert(done.status === 'approved', done.status);
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
  await expectError(() => issueDraft(body, []), /결재자를 1명 이상/);
  const { id } = await issueDraft(body, line([adminB, 'agreement'], officer));
  issueDocId = id;
  const doc = await documents.getDocument(adminAAcc, id);
  assert(doc.title === `${member.name} 재직증명서 발급 품의`, doc.title);
  assert(Number(doc.body.employeeId) === Number(member.id) && doc.body.certType === 'employment', '신청 대상·종류 고정');
  assert(doc.steps.map((s) => s.kind).join() === 'agreement,approval', doc.steps.map((s) => s.kind).join());
  assert((await recipientIds(id)).join() === String(adminB.id), '첫 메일은 합의자');
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
  const rejected = await documents.rejectDocument(adminBAcc, issueDocId, '제출처 확인 필요');
  assert(rejected.status === 'rejected', rejected.status);
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

await check('인사담당 임의 발급 품의: 퇴직자 퇴직증명서·재직자 재직증명서, 퇴직자 재직증명서는 불가', async () => {
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
  assert(all.length === 4, `발급 ${all.length}`);
  const seqs = all.map((c) => c.certNo).sort();
  assert(seqs.join() === [1, 2, 3, 4].map((n) => `${year}-${String(n).padStart(4, '0')}`).join(), seqs.join());
  assert((await certificates.listRegister({ status: 'revoked' })).length === 1, '취소 필터');
  assert((await certificates.listRegister({ type: 'retirement' })).length === 1, '종류 필터');
  assert((await certificates.listRegister({ q: retiree.name })).length >= 1, '검색');
  const csv = await certificates.exportRegister({ year });
  assert(csv.rows.length === 4 && csv.rows.some((r) => r[6].includes('퇴직사유')), 'CSV 기재 항목');
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

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : `\n     → ${r.error}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed (${getDbDialect()})`);
await db.close?.();
process.exit(failed.length ? 1 : 0);

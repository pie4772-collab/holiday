/**
 * DB 계층 변경 전후로 API 응답이 같은지 비교하기 위한 스냅샷 녹화 도구.
 * 실행 중인 서버(DB 사본)에 조회·쓰기 시나리오를 실행하고 결과를 JSON으로 저장합니다.
 *
 *   BASE=http://127.0.0.1:3999 ADMIN_USER=2022019 node scripts/api-snapshot.mjs out.json
 *   node scripts/api-snapshot.mjs --compare before.json after.json
 */
import fs from 'node:fs';

const DEFAULT_PASSWORD = '123456';
// 초기 비밀번호로 로그인하면 변경이 강제되므로 스냅샷용 비밀번호로 바꿔서 진행합니다.
const SNAPSHOT_PASSWORD = 'Snapshot2026pw';
const VOLATILE_KEY = /(createdAt|updatedAt|generatedAt|approvedAt|created_at|updated_at|generated_at|approved_at|imported_at|token|exp)$/i;
const DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;

function normalize(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = normalize(value[k], k);
    return out;
  }
  if (VOLATILE_KEY.test(key) && value != null) return '<volatile>';
  if (typeof value === 'string' && DATETIME.test(value)) return '<datetime>';
  return value;
}

if (process.argv[2] === '--compare') {
  const [a, b] = [process.argv[3], process.argv[4]].map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  const byName = new Map(b.map((step) => [step.name, step]));
  let diffs = 0;
  for (const step of a) {
    const other = byName.get(step.name);
    const left = JSON.stringify(step);
    const right = JSON.stringify(other);
    if (left !== right) {
      diffs += 1;
      if (diffs <= 15) {
        console.log(`DIFF ${step.name}`);
        console.log(`  before: ${left.slice(0, 400)}`);
        console.log(`  after : ${String(right).slice(0, 400)}`);
      }
    }
  }
  if (a.length !== b.length) console.log(`step count differs: ${a.length} vs ${b.length}`);
  console.log(`steps: ${a.length}, diffs: ${diffs}`);
  process.exit(diffs || a.length !== b.length ? 1 : 0);
}

const BASE = process.env.BASE || 'http://127.0.0.1:3999';
const outFile = process.argv[2] || 'api-snapshot.json';
const steps = [];
const tokens = new Map();

async function request(method, url, token, body) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function record(name, method, url, token, body) {
  const result = await request(method, url, token, body);
  steps.push({ name, status: result.status, body: normalize(result.data) });
  return result;
}

async function login(username) {
  if (tokens.has(username)) return tokens.get(username);
  let result = await request('POST', '/api/auth/login', null, { username, password: DEFAULT_PASSWORD });
  if (result.status !== 200) {
    result = await request('POST', '/api/auth/login', null, { username, password: SNAPSHOT_PASSWORD });
  }
  let token = result.status === 200 ? result.data.token : null;
  if (token && result.data.user?.mustChangePassword) {
    const changed = await request('POST', '/api/auth/change-password', token, {
      currentPassword: DEFAULT_PASSWORD,
      newPassword: SNAPSHOT_PASSWORD,
    });
    token = changed.status === 200 ? changed.data.token : null;
  }
  tokens.set(username, token);
  return token;
}

async function readAll(tag, admin, employees) {
  const health = await request('GET', '/health');
  const { employees: count, users } = health.data;
  steps.push({ name: `${tag} health`, status: health.status, body: { employees: count, users } });

  const adminGets = [
    '/api/auth/me',
    '/api/employees',
    '/api/admin/stats',
    '/api/admin/mail-settings',
    '/api/admin/leave-reports?year=2026&month=8',
    '/api/admin/leave-reports?year=2026&month=9',
    '/api/admin/leave-reports?year=2026&month=8&saved=1',
    '/api/admin/leave-settlements?year=2026&month=8',
    '/api/admin/leave-settlements?year=2026&month=9',
    '/api/admin/leave-event-settlements?year=2026',
    '/api/admin/leave-event-settlements?year=2026&saved=1',
    '/api/admin/ordinary-wages/template?purpose=liability',
    '/api/admin/ordinary-wages/template?purpose=settlement',
    '/api/admin/approval-lines',
    '/api/admin/roster?includeInactive=1',
    '/api/admin/roster?includeInactive=0',
    '/api/admin/leave-approval-logs?year=2026',
    '/api/admin/leave-approval-logs',
    '/api/leave/approvals',
    '/api/employees/me',
  ];
  for (const url of adminGets) await record(`${tag} GET ${url}`, 'GET', url, admin);

  for (const emp of employees) {
    for (const suffix of ['', '/leave/history', '/leave/usages']) {
      await record(`${tag} GET /employees/${emp.id}${suffix}`, 'GET', `/api/employees/${emp.id}${suffix}`, admin);
    }
    for (const suffix of ['accruals', 'usages']) {
      await record(`${tag} GET /admin/employees/${emp.id}/${suffix}`, 'GET', `/api/admin/employees/${emp.id}/${suffix}`, admin);
    }
  }
}

async function approveThroughChain(usageId, action, allUsers, label) {
  for (let step = 1; step <= 6; step += 1) {
    let handled = false;
    for (const username of allUsers) {
      const token = await login(username);
      if (!token) continue;
      const pending = await request('GET', '/api/leave/approvals', token);
      const items = Array.isArray(pending.data) ? pending.data : [];
      if (!items.some((item) => String(item.id) === String(usageId))) continue;
      const url = `/api/leave/usages/${usageId}/${action}`;
      const result = await record(`${label} step${step} ${action} by ${username}`, 'POST', url, token, { reason: '스냅샷 반려' });
      handled = true;
      if (action === 'reject' || result.data?.status === 'approved') return;
      break;
    }
    if (!handled) {
      steps.push({ name: `${label} step${step} no approver`, status: 0, body: null });
      return;
    }
  }
}

const adminUser = process.env.ADMIN_USER;
const admin = await login(adminUser);
if (!admin) throw new Error(`관리자 로그인 실패: ${adminUser}`);

const employees = (await request('GET', '/api/employees', admin)).data;
const roster = (await request('GET', '/api/admin/roster?includeInactive=1', admin)).data;
const allUsers = roster
  .filter((emp) => emp.isActive && emp.empNo)
  .map((emp) => emp.empNo)
  .sort();

await readAll('before-writes', admin, employees);

// 사원 관리
const created = await record('create employee', 'POST', '/api/admin/employees', admin, {
  name: '스냅샷테스트', empNo: 'T-SNAP-001', hireDate: '2025-03-10', workplace: employees[0].workplace,
  department: employees[0].department, jobType: '사무직', position: '팀원', isAdmin: false, email: '',
});
const newId = created.data?.id;
await record('update employee', 'PUT', `/api/admin/employees/${newId}`, admin, {
  name: '스냅샷테스트2', empNo: 'T-SNAP-001', hireDate: '2025-03-10', workplace: employees[0].workplace,
  department: employees[0].department, jobType: '생산직', position: '팀장', isAdmin: false, email: 'snap@example.com',
});
await record('terminate employee', 'POST', `/api/admin/employees/${newId}/terminate`, admin, { terminatedDate: '2026-09-15' });
await record('reactivate employee', 'POST', `/api/admin/employees/${newId}/reactivate`, admin);

// 연차 발생·사용 수동 관리
const target = employees[1];
const accrual = await record('create accrual', 'POST', '/api/admin/accruals', admin, {
  employeeId: target.id, type: 'adjustment', amount: 1.5, date: '2026-02-01', description: '스냅샷 발생',
});
await record('update accrual', 'PUT', `/api/admin/accruals/${accrual.data?.id}`, admin, {
  type: 'adjustment', amount: 2, date: '2026-02-01', description: '스냅샷 수정',
});
const tmpAccrual = await record('create accrual 2', 'POST', '/api/admin/accruals', admin, {
  employeeId: target.id, type: 'adjustment', amount: -1, date: '2026-03-01', description: '삭제 예정',
});
await record('delete accrual', 'DELETE', `/api/admin/accruals/${tmpAccrual.data?.id}`, admin);
const usage = await record('create usage', 'POST', '/api/admin/usages', admin, {
  employeeId: target.id, date: '2026-09-07', type: 'full', reason: '개인 사유', status: 'approved',
});
await record('update usage', 'PUT', `/api/admin/usages/${usage.data?.id}`, admin, {
  date: '2026-09-08', type: 'half', reason: '병원 진료', status: 'approved',
});
const tmpUsage = await record('create usage 2', 'POST', '/api/admin/usages', admin, {
  employeeId: target.id, date: '2026-09-10', type: 'full', reason: '삭제 예정', status: 'pending',
});
await record('delete usage', 'DELETE', `/api/admin/usages/${tmpUsage.data?.id}`, admin);

// 통상임금
for (const [i, emp] of employees.slice(0, 3).entries()) {
  await record(`wage liability ${emp.id}`, 'PUT', `/api/admin/employees/${emp.id}/ordinary-wage`, admin, {
    ordinaryWage: 3000000 + i * 100000, purpose: 'liability',
  });
  await record(`wage settlement ${emp.id}`, 'PUT', `/api/admin/employees/${emp.id}/ordinary-wage`, admin, {
    ordinaryWage: 3100000 + i * 100000, purpose: 'settlement',
  });
}
await record('wage upload liability', 'POST', '/api/admin/ordinary-wages/upload', admin, {
  purpose: 'liability',
  rows: employees.slice(3, 6).map((emp, i) => ({ empNo: emp.empNo, ordinaryWage: 2800000 + i * 50000 })),
});
await record('wage upload settlement', 'POST', '/api/admin/ordinary-wages/upload', admin, {
  purpose: 'settlement',
  rows: [...employees.slice(3, 5).map((emp) => ({ empNo: emp.empNo, ordinaryWage: 2900000 })), { empNo: 'NOPE', ordinaryWage: 1 }],
});
await record('wage load previous month (missing)', 'POST', '/api/admin/ordinary-wages/load-previous-month', admin, { year: 2026, month: 10 });
await record('save leave settlement 2026-09', 'POST', '/api/admin/leave-settlements', admin, { year: 2026, month: 9 });
await record('wage load previous month', 'POST', '/api/admin/ordinary-wages/load-previous-month', admin, { year: 2026, month: 10 });

// 결재선 저장 (조회 결과 그대로 왕복)
const lines = await request('GET', '/api/admin/approval-lines', admin);
await record('save approval lines', 'PUT', '/api/admin/approval-lines', admin, lines.data);

// 연차 신청과 결재
const byPosition = (position) => employees.filter((emp) => emp.position === position && emp.empNo).sort((a, b) => a.empNo.localeCompare(b.empNo));
const members = byPosition('팀원');
const scenarios = [
  { who: members[0], type: 'full', startDate: '2026-10-13', endDate: '2026-10-14', action: 'approve' },
  { who: members[Math.floor(members.length / 2)], type: 'half', startDate: '2026-10-15', action: 'reject' },
  { who: members[members.length - 1], type: 'full', startDate: '2026-10-16', endDate: '2026-10-16', action: 'approve' },
  { who: byPosition('팀장')[0], type: 'full', startDate: '2026-10-19', endDate: '2026-10-19', action: 'approve' },
  { who: byPosition('공장장')[0], type: 'full', startDate: '2026-10-20', endDate: '2026-10-20', action: 'approve' },
  { who: byPosition('이사')[0], type: 'full', startDate: '2026-10-21', endDate: '2026-10-21', action: 'approve' },
].filter((s) => s.who);

for (const [i, s] of scenarios.entries()) {
  const token = await login(s.who.empNo);
  if (!token) {
    steps.push({ name: `request${i} login failed`, status: 0, body: s.who.empNo });
    continue;
  }
  const submitted = await record(`request${i} submit (${s.who.position})`, 'POST', '/api/leave/requests', token, {
    employeeId: s.who.id, type: s.type, startDate: s.startDate, endDate: s.endDate || s.startDate,
    date: s.startDate, reason: '스냅샷 신청',
  });
  const created = submitted.data?.usages || submitted.data?.items || (Array.isArray(submitted.data) ? submitted.data : [submitted.data]);
  for (const item of created || []) {
    if (item?.id && item.status === 'pending') await approveThroughChain(item.id, s.action, allUsers, `request${i} usage${item.id}`);
  }
}

// 월말 확정
await record('save leave report', 'POST', '/api/admin/leave-reports', admin, { year: 2026, month: 8 });
await record('save leave settlement', 'POST', '/api/admin/leave-settlements', admin, { year: 2026, month: 8 });
await record('save event settlement', 'POST', '/api/admin/leave-event-settlements', admin, { year: 2026 });

const employeesAfter = (await request('GET', '/api/employees', admin)).data;
await readAll('after-writes', admin, employeesAfter);

fs.writeFileSync(outFile, JSON.stringify(steps, null, 1));
console.log(`recorded ${steps.length} steps -> ${outFile}`);

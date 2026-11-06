import { getDb } from '../db.js';
import { JOB_RANKS, JOB_TYPES, PAY_GRADES, POSITIONS, hasPayGrade } from '../../src/constants/hr.js';
import { orderAction, orderNoText } from '../../src/constants/approvalDocs.js';
import { createEmployee, terminateEmployee, updateEmployee } from './employeeService.js';
import { createRecord } from './personnelService.js';

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function stamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 19);
}

function kstToday() {
  return stamp().slice(0, 10);
}

function snapshot(row) {
  return {
    workplace: row.workplace || '',
    department: row.department || '',
    jobType: row.job_type || '',
    position: row.position || '',
    jobRank: row.job_rank || '',
    payGrade: row.pay_grade || '',
    payStep: row.pay_step == null ? null : Number(row.pay_step),
    isActive: Boolean(row.is_active),
    terminatedDate: row.terminated_date || null,
  };
}

async function employeeRow(id) {
  return id ? getDb().prepare('SELECT * FROM employees WHERE id = ?').get(Number(id)) : null;
}

/**
 * 인사명령 대상자 줄의 "직위" 칸을 사원 정보로 옮깁니다. 직위 목록(사원~부장, 임원)은 직위로,
 * 직급 목록(팀원·팀장·공장장·임원)은 직급으로 바꾸고, 이사·상무·전무는 둘 다 바꿉니다.
 */
function rankChanges(row, value) {
  const data = {};
  const isRank = JOB_RANKS.includes(value);
  const isPosition = POSITIONS.includes(value);
  if (isRank && value !== (row.job_rank || '')) {
    data.jobRank = value;
    const grade = row.pay_grade && PAY_GRADES.find((g) => g.key === row.pay_grade);
    if (row.pay_grade && (!hasPayGrade(value) || grade?.rank !== value)) {
      data.payGrade = '';
      data.payStep = '';
    }
  }
  if (isPosition && value !== (row.position || '')) data.position = value;
  return { data, known: isRank || isPosition };
}

/** 대상자 줄(발령 후 소속)과 지금 사원 정보가 다른 칸만 고릅니다. 빈 칸은 바꾸지 않습니다. */
function transferChanges(row, entry) {
  const data = {};
  const notes = [];
  const workplace = text(entry.workplace);
  const department = text(entry.department);
  const jobType = text(entry.jobType);
  const rank = text(entry.position);
  if (workplace && workplace !== (row.workplace || '')) data.workplace = workplace;
  if (department && department !== (row.department || '')) data.department = department;
  if (jobType && jobType !== (row.job_type || '')) {
    if (JOB_TYPES.includes(jobType)) data.jobType = jobType;
    else notes.push(`직종 "${jobType}"은(는) 목록에 없어 바꾸지 않았습니다.`);
  }
  if (rank) {
    const { data: rankData, known } = rankChanges(row, rank);
    Object.assign(data, rankData);
    if (!known) notes.push(`직위 "${rank}"은(는) 직위·직급 목록에 없어 바꾸지 않았습니다.`);
    if ('payGrade' in rankData) notes.push('직위가 바뀌어 급호를 비웠습니다. 사원 명부에서 새 급호를 넣어 주세요.');
  }
  return { data, notes };
}

/** 인사기록카드 발령 이력. 같은 날짜·구분 이력이 이미 있으면(직접 적어 둔 경우) 새로 만들지 않습니다. */
async function addHistory(employeeId, action, entry, orderNo, actorId) {
  const db = getDb();
  const existing = await db
    .prepare(
      `SELECT id FROM employee_records
       WHERE employee_id = ? AND category = 'appointment' AND start_date = ? AND title = ?
       ORDER BY id LIMIT 1`
    )
    .get(Number(employeeId), action.effective_date, action.order_type);
  if (existing) return Number(existing.id);
  const record = await createRecord(
    employeeId,
    {
      category: 'appointment',
      title: action.order_type,
      startDate: action.effective_date,
      organization: text(entry.department),
      result: text(entry.position),
      detail: [orderNo, text(entry.workplace), text(entry.department)].filter(Boolean).join(' · '),
      notes: '인사명령',
    },
    actorId
  );
  return Number(record.id);
}

async function perform(action) {
  const doc = await getDb()
    .prepare('SELECT id, document_no, body, employee_id FROM approval_documents WHERE id = ?')
    .get(action.document_id);
  if (!doc) return { status: 'skipped', message: '인사명령 문서를 찾을 수 없습니다.' };
  const entry = parseJson(doc.body, {}).entries?.[action.entry_index];
  if (!entry) return { status: 'skipped', message: '인사명령에서 대상자를 찾을 수 없습니다.' };
  const orderNo = orderNoText(doc.document_no);
  const actorId = doc.employee_id;
  let row = await employeeRow(action.employee_id);

  if (action.action === 'hire') {
    if (!row) {
      row = await getDb()
        .prepare('SELECT * FROM employees WHERE name = ? AND hire_date = ? ORDER BY id LIMIT 1')
        .get(text(entry.name), action.effective_date);
    }
    if (row) {
      const recordId = await addHistory(row.id, action, entry, orderNo, actorId);
      return { status: 'recorded', employeeId: row.id, recordId, after: snapshot(row), message: '이미 사원 명부에 있는 직원이라 발령 이력만 남겼습니다.' };
    }
    const rank = text(entry.position);
    const jobType = text(entry.jobType);
    const created = await createEmployee({
      name: text(entry.name),
      hireDate: action.effective_date,
      workplace: text(entry.workplace),
      department: text(entry.department),
      jobType: JOB_TYPES.includes(jobType) ? jobType : undefined,
      position: POSITIONS.includes(rank) ? rank : undefined,
      jobRank: JOB_RANKS.includes(rank) ? rank : '',
    });
    const recordId = await addHistory(created.id, action, entry, orderNo, actorId);
    return {
      status: 'applied',
      employeeId: Number(created.id),
      recordId,
      after: snapshot(await employeeRow(created.id)),
      message: '사원 명부에 등록했습니다. 사번이 없어 로그인 계정은 아직 없으니 사원 명부에서 사번을 넣어 주세요.',
    };
  }

  if (!row) return { status: 'skipped', message: '사원 명부의 직원과 연결되지 않은 대상자(직접 입력)라 반영하지 않았습니다.' };
  const before = snapshot(row);

  if (action.action === 'resign') {
    if (!row.is_active) return { status: 'skipped', before, message: '이미 퇴사 처리된 직원입니다.' };
    await terminateEmployee(row.id, action.effective_date);
    const recordId = await addHistory(row.id, action, entry, orderNo, actorId);
    return { status: 'applied', recordId, before, after: snapshot(await employeeRow(row.id)) };
  }

  if (action.action === 'transfer') {
    if (!row.is_active) return { status: 'skipped', before, message: '퇴사한 직원이라 반영하지 않았습니다.' };
    const { data, notes } = transferChanges(row, entry);
    if (Object.keys(data).length) await updateEmployee(row.id, { empNo: row.emp_no || '', ...data });
    const recordId = await addHistory(row.id, action, entry, orderNo, actorId);
    if (!Object.keys(data).length) notes.unshift('사원 정보와 같아 바뀐 항목이 없습니다.');
    return { status: 'applied', recordId, before, after: snapshot(await employeeRow(row.id)), message: notes.join(' ') };
  }

  const recordId = await addHistory(row.id, action, entry, orderNo, actorId);
  return { status: 'recorded', recordId, before };
}

async function applyAction(action) {
  const db = getDb();
  const claimed = await db
    .prepare(`UPDATE personnel_order_actions SET status = 'applying', updated_at = ? WHERE id = ? AND status = 'pending'`)
    .run(stamp(), action.id);
  if (!claimed.changes) return null;
  let result;
  try {
    result = await perform(action);
  } catch (error) {
    result = { status: 'failed', message: error.message || '반영하지 못했습니다.' };
  }
  const now = stamp();
  await db
    .prepare(
      `UPDATE personnel_order_actions
       SET status = ?, employee_id = COALESCE(?, employee_id), before_json = ?, after_json = ?, message = ?,
           record_id = ?, applied_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      result.status,
      result.employeeId ? Number(result.employeeId) : null,
      result.before ? JSON.stringify(result.before) : null,
      result.after ? JSON.stringify(result.after) : null,
      result.message || null,
      result.recordId || null,
      ['applied', 'recorded'].includes(result.status) ? now : null,
      now,
      action.id
    );
  if (result.status === 'failed') console.error(`[personnel-order] 반영 실패 #${action.id}: ${result.message}`);
  return result.status;
}

/** 결재가 끝난 인사명령의 대상자마다 반영할 줄을 만듭니다. 문서 완료 트랜잭션 안에서 부릅니다. */
export async function createActions(db, doc, now) {
  const body = parseJson(doc.body, {});
  const entries = Array.isArray(body.entries) ? body.entries : [];
  const action = orderAction(body.orderType);
  for (const [index, entry] of entries.entries()) {
    const employee = entry.employeeId ? await db.prepare('SELECT id FROM employees WHERE id = ?').get(Number(entry.employeeId)) : null;
    await db
      .prepare(
        `INSERT INTO personnel_order_actions
           (document_id, entry_index, employee_id, order_type, effective_date, action, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
         ON CONFLICT (document_id, entry_index) DO NOTHING`
      )
      .run(doc.id, index, employee ? Number(employee.id) : null, body.orderType || '', body.effectiveDate || '', action, now, now);
  }
}

/**
 * 발령일이 된 발령을 반영합니다. 퇴사는 발령일(퇴사일)까지 근무하므로 다음 날 반영합니다.
 * 결재가 끝난 직후와 매시간 부릅니다.
 */
export async function applyDue({ today = kstToday(), ids = null } = {}) {
  const rows = await getDb()
    .prepare(
      `SELECT * FROM personnel_order_actions
       WHERE status = 'pending' AND effective_date <> ''
         AND ((action <> 'resign' AND effective_date <= ?) OR (action = 'resign' AND effective_date < ?))
       ORDER BY effective_date, document_id, entry_index`
    )
    .all(today, today);
  const counts = {};
  for (const row of rows) {
    if (ids && !ids.includes(Number(row.id))) continue;
    const status = await applyAction(row);
    if (status) counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

/** 이 기능 전에 결재가 끝난 인사명령은 사원 정보는 그대로 두고 발령 이력만 남깁니다. 한 번 처리한 문서는 건너뜁니다. */
export async function backfillHistory() {
  const db = getDb();
  const docs = await db
    .prepare(
      `SELECT d.* FROM approval_documents d
       WHERE d.form_key = 'personnel_order' AND d.status = 'approved'
         AND NOT EXISTS (SELECT 1 FROM personnel_order_actions a WHERE a.document_id = d.id)
       ORDER BY d.id`
    )
    .all();
  let recorded = 0;
  for (const doc of docs) {
    const body = parseJson(doc.body, {});
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const orderNo = orderNoText(doc.document_no);
    for (const [index, entry] of entries.entries()) {
      const row = await employeeRow(entry.employeeId);
      const action = { order_type: body.orderType || '', effective_date: body.effectiveDate || '' };
      let status = 'skipped';
      let message = '사원 명부의 직원과 연결되지 않은 대상자(직접 입력)라 발령 이력을 남기지 않았습니다.';
      let recordId = null;
      if (row && action.effective_date) {
        try {
          recordId = await addHistory(row.id, action, entry, orderNo, doc.employee_id);
          status = 'recorded';
          message = '기능 도입 전에 결재된 인사명령이라 발령 이력만 남겼습니다.';
          recorded += 1;
        } catch (error) {
          status = 'failed';
          message = error.message;
        }
      }
      const now = stamp();
      await db
        .prepare(
          `INSERT INTO personnel_order_actions
             (document_id, entry_index, employee_id, order_type, effective_date, action, status, message, record_id,
              applied_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'record', ?, ?, ?, ?, ?, ?)
           ON CONFLICT (document_id, entry_index) DO NOTHING`
        )
        .run(doc.id, index, row ? Number(row.id) : null, action.order_type, action.effective_date, status, message, recordId,
          status === 'recorded' ? now : null, now, now);
    }
  }
  return { documents: docs.length, recorded };
}

export function mapAction(row) {
  if (!row?.action_id) return null;
  return {
    id: Number(row.action_id),
    action: row.action,
    status: row.action_status,
    message: row.action_message || '',
    before: parseJson(row.action_before, null),
    after: parseJson(row.action_after, null),
    appliedAt: row.action_applied_at || null,
    employeeId: row.action_employee_id ? String(row.action_employee_id) : null,
  };
}

async function actionRow(id) {
  const row = await getDb().prepare('SELECT * FROM personnel_order_actions WHERE id = ?').get(Number(id));
  if (!row) throw httpError('발령 반영 정보를 찾을 수 없습니다.', 404);
  return row;
}

/** 아직 반영하지 않은 발령을 반영하지 않기로 합니다 (발령 예정·실패·건너뜀). */
export async function cancelAction(id) {
  const row = await actionRow(id);
  if (!['pending', 'failed', 'skipped'].includes(row.status)) throw httpError('이미 반영된 발령은 취소할 수 없습니다. 사원 명부에서 직접 고쳐 주세요.', 409);
  await getDb()
    .prepare(`UPDATE personnel_order_actions SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = ?`)
    .run(stamp(), row.id, row.status);
  return { id: Number(row.id), status: 'cancelled' };
}

/** 실패·건너뜀·취소한 발령을 다시 반영합니다. 발령일 전이면 발령 예정으로 돌려 둡니다. */
export async function retryAction(id, { today = kstToday() } = {}) {
  const row = await actionRow(id);
  if (!['failed', 'skipped', 'cancelled'].includes(row.status)) throw httpError('다시 반영할 수 있는 상태가 아닙니다.', 409);
  await getDb()
    .prepare(`UPDATE personnel_order_actions SET status = 'pending', message = NULL, updated_at = ? WHERE id = ? AND status = ?`)
    .run(stamp(), row.id, row.status);
  await applyDue({ today, ids: [Number(row.id)] });
  const updated = await actionRow(row.id);
  return { id: Number(updated.id), status: updated.status, message: updated.message || '' };
}

let timer = null;

/** 서버 시작 1분 뒤 이전 인사명령의 발령 이력을 채우고, 매시간 발령일이 된 발령을 반영합니다. PERSONNEL_ORDER_APPLY=off 면 끕니다. */
export function startSchedule() {
  if (timer || process.env.PERSONNEL_ORDER_APPLY === 'off') return;
  let backfilled = false;
  const tick = async () => {
    try {
      if (!backfilled) {
        const result = await backfillHistory();
        backfilled = true;
        if (result.documents) console.log(`[personnel-order] 이전 인사명령 ${result.documents}건의 발령 이력 ${result.recorded}건을 남겼습니다.`);
      }
      const counts = await applyDue();
      if (Object.keys(counts).length) console.log(`[personnel-order] 발령 반영: ${JSON.stringify(counts)}`);
    } catch (error) {
      console.error('[personnel-order] 발령 반영 실패:', error.message);
    }
  };
  setTimeout(tick, 60_000).unref();
  timer = setInterval(tick, 60 * 60_000);
  timer.unref();
}

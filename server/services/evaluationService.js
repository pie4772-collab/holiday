import { getDb, LOCK_EVALUATION } from '../db.js';
import * as mailService from './mailService.js';
import * as personnelService from './personnelService.js';
import {
  EVALUATION_ITEMS,
  EVALUATION_KINDS,
  HIRE_TYPES,
  MAX_ITEM_SCORE,
  MAX_TOTAL_SCORE,
  OPEN_STATUSES,
  OUTCOMES,
  PASS_SCORE,
  PLAN_KINDS,
  REMINDER_DAYS,
  STALE_DUE_DAYS,
  UNTYPED_WINDOW_DAYS,
  addDays,
  allowedOutcomes,
  diffDays,
  documentNumber,
  evaluationLabel,
  periodEnd,
} from '../../src/constants/evaluation.js';

const MAX_COMMENT = 2000;
const MAX_NOTE = 500;
const DONE_LIMIT = 300;

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

const kstDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function kstToday(date = new Date()) {
  return kstDate.format(date);
}

function kstHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(date));
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}

function cleanDate(value, label) {
  const raw = text(value);
  if (!isDateKey(raw)) throw httpError(`${label}을(를) YYYY-MM-DD 형식으로 입력하세요.`);
  return raw;
}

function cleanNote(value, label, { required = false } = {}) {
  const note = text(value);
  if (required && note.length < 2) throw httpError(`${label}을(를) 입력하세요.`);
  if (note.length > MAX_NOTE) throw httpError(`${label}은(는) ${MAX_NOTE}자 이하로 입력하세요.`);
  return note || null;
}

function parseScores(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const SELECT_SQL = `
  SELECT v.*,
         e.emp_no, e.name, e.workplace, e.workplace_code, e.department, e.position, e.hire_date,
         e.hire_type, e.probation_end, e.regular_date, e.is_active,
         ev.name AS evaluator_name, ev.position AS evaluator_position, ev.department AS evaluator_department,
         rv.name AS reviewer_name, rv.position AS reviewer_position,
         sb.name AS submitted_by_name, rb.name AS reviewed_by_name, cb.name AS confirmed_by_name,
         (SELECT MAX(p.due_date) FROM employee_evaluations p
          WHERE p.employee_id = v.employee_id AND p.kind = v.kind AND p.round < v.round) AS previous_due
  FROM employee_evaluations v
  JOIN employees e ON e.id = v.employee_id
  LEFT JOIN employees ev ON ev.id = v.evaluator_id
  LEFT JOIN employees rv ON rv.id = v.reviewer_id
  LEFT JOIN employees sb ON sb.id = v.submitted_by
  LEFT JOIN employees rb ON rb.id = v.reviewed_by
  LEFT JOIN employees cb ON cb.id = v.confirmed_by`;

const OPEN_SQL = OPEN_STATUSES.map((s) => `'${s}'`).join(', ');

function idOrNull(value) {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError('직원을 다시 선택하세요.');
  return id;
}

function mapEvaluation(row, today = kstToday()) {
  return {
    id: String(row.id),
    kind: row.kind,
    round: Number(row.round),
    label: evaluationLabel(row.kind, Number(row.round)),
    dueDate: row.due_date,
    daysLeft: diffDays(row.due_date, today),
    status: row.status,
    evaluatorId: row.evaluator_id == null ? '' : String(row.evaluator_id),
    evaluatorName: row.evaluator_name || '',
    evaluatorPosition: row.evaluator_position || '',
    evaluatorDepartment: row.evaluator_department || '',
    reviewerId: row.reviewer_id == null ? '' : String(row.reviewer_id),
    reviewerName: row.reviewer_name || '',
    reviewerPosition: row.reviewer_position || '',
    documentNo: documentNumber(row.id, row.created_at),
    periodStart: row.previous_due ? addDays(row.previous_due, 1) : row.hire_date,
    scores: parseScores(row.scores),
    totalScore: row.total_score == null ? null : Number(row.total_score),
    maxScore: row.max_score == null ? null : Number(row.max_score),
    comment: row.comment || '',
    reviewerComment: row.reviewer_comment || '',
    recommendation: row.recommendation || '',
    outcome: row.outcome || '',
    outcomeDate: row.outcome_date || '',
    hrNote: row.hr_note || '',
    submittedAt: row.submitted_at || '',
    submittedById: row.submitted_by == null ? '' : String(row.submitted_by),
    submittedByName: row.submitted_by_name || '',
    reviewedAt: row.reviewed_at || '',
    reviewedById: row.reviewed_by == null ? '' : String(row.reviewed_by),
    reviewedByName: row.reviewed_by_name || '',
    confirmedAt: row.confirmed_at || '',
    confirmedByName: row.confirmed_by_name || '',
    remindedAt: row.reminded_at || '',
    updatedAt: row.updated_at,
    employee: {
      id: String(row.employee_id),
      empNo: row.emp_no || '',
      name: row.name,
      workplace: row.workplace || '',
      department: row.department || '',
      position: row.position || '',
      hireDate: row.hire_date,
      hireType: row.hire_type || '',
      probationEnd: row.probation_end || '',
      regularDate: row.regular_date || '',
      isActive: Boolean(row.is_active),
    },
  };
}

async function getRow(id) {
  const row = await getDb().prepare(`${SELECT_SQL} WHERE v.id = ?`).get(Number(id));
  if (!row) throw httpError('평가를 찾을 수 없습니다.', 404);
  return row;
}

async function getEmployee(employeeId) {
  const row = await getDb().prepare('SELECT * FROM employees WHERE id = ?').get(Number(employeeId));
  if (!row) throw httpError('직원을 찾을 수 없습니다.', 404);
  return row;
}

/* ───────────── 평가 일정 ───────────── */

/**
 * 입사 구분에 맞춰 평가 일정을 만들거나 정리합니다. 직원 등록·수정·입사 구분 지정 뒤에 부릅니다.
 * - 구분이 바뀌면 작성 전 평가는 지우고, 작성·확정된 평가가 있으면 바꾸지 못하게 합니다.
 * - 입사일이 바뀌면 작성 전인 1차 평가의 기한을 다시 계산합니다.
 */
export async function syncPlan(employeeId, today = kstToday()) {
  const db = getDb();
  return db.transaction(async () => {
    await db.lock(LOCK_EVALUATION, employeeId);
    const emp = await getEmployee(employeeId);
    const wanted = PLAN_KINDS[emp.hire_type] || [];
    let rows = await db.prepare('SELECT * FROM employee_evaluations WHERE employee_id = ?').all(emp.id);

    const written = rows.filter((r) => !wanted.includes(r.kind) && ['reviewing', 'submitted', 'confirmed'].includes(r.status));
    if (written.length) {
      throw httpError(
        `이미 작성된 ${evaluationLabel(written[0].kind, Number(written[0].round))}이(가) 있어 입사 구분을 바꿀 수 없습니다.`
      );
    }
    for (const row of rows) {
      if (!wanted.includes(row.kind)) await db.prepare('DELETE FROM employee_evaluations WHERE id = ?').run(row.id);
    }
    rows = rows.filter((r) => wanted.includes(r.kind));

    const rejected = rows.some((r) => r.kind === 'probation' && r.status === 'confirmed' && r.outcome === 'reject');
    for (const kind of wanted) {
      const due = periodEnd(emp.hire_date, EVALUATION_KINDS[kind].months);
      const first = rows.find((r) => r.kind === kind && Number(r.round) === 1);
      if (first) {
        if (first.status === 'pending' && first.due_date !== due) {
          await db
            .prepare(
              `UPDATE employee_evaluations SET due_date = ?, reminded_at = NULL, updated_at = datetime('now', 'localtime')
               WHERE id = ?`
            )
            .run(due, first.id);
        }
        continue;
      }
      if (!emp.is_active || (kind === 'one_year' && rejected)) continue;
      if (diffDays(today, due) > STALE_DUE_DAYS) continue;
      await db
        .prepare('INSERT INTO employee_evaluations (employee_id, kind, round, due_date) VALUES (?, ?, 1, ?)')
        .run(emp.id, kind, due);
    }

    await refreshEmployeeStatus(emp);
  });
}

/** employees.probation_end·regular_date 를 평가 결과에 맞춥니다. */
async function refreshEmployeeStatus(emp) {
  const db = getDb();
  let probationEnd = null;
  let regularDate = null;
  if (emp.hire_type === 'experienced') {
    regularDate = emp.hire_date;
  } else if (emp.hire_type === 'new') {
    const rounds = await db
      .prepare(
        `SELECT * FROM employee_evaluations WHERE employee_id = ? AND kind = 'probation' AND status <> 'cancelled'
         ORDER BY round DESC`
      )
      .all(emp.id);
    probationEnd = rounds[0]?.due_date || periodEnd(emp.hire_date, EVALUATION_KINDS.probation.months);
    const converted = rounds.find((r) => r.status === 'confirmed' && r.outcome === 'regular');
    regularDate = converted?.outcome_date || null;
  }
  await db
    .prepare('UPDATE employees SET probation_end = ?, regular_date = ? WHERE id = ?')
    .run(probationEnd, regularDate, emp.id);
}

export function cleanHireType(value) {
  const hireType = text(value);
  if (!hireType) return null;
  if (!HIRE_TYPES.some((t) => t.key === hireType)) throw httpError('입사 구분은 신입 또는 경력으로 선택하세요.');
  return hireType;
}

export async function setHireType(employeeId, value) {
  const hireType = cleanHireType(value);
  const db = getDb();
  await db.transaction(async () => {
    const emp = await getEmployee(employeeId);
    await db
      .prepare(`UPDATE employees SET hire_type = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`)
      .run(hireType, emp.id);
    await syncPlan(emp.id);
  });
  return listForEmployee(employeeId);
}

/* ───────────── 조회 ───────────── */

export async function listForManager(view = 'active') {
  const db = getDb();
  const today = kstToday();
  const rows =
    view === 'done'
      ? await db
          .prepare(
            `${SELECT_SQL} WHERE v.status IN ('confirmed', 'cancelled')
             ORDER BY COALESCE(v.confirmed_at, v.updated_at) DESC, v.id DESC LIMIT ${DONE_LIMIT}`
          )
          .all()
      : await db
          .prepare(
            `${SELECT_SQL} WHERE v.status IN (${OPEN_SQL}) AND e.is_active = 1
             ORDER BY v.due_date, v.id`
          )
          .all();
  const items = rows.map((row) => mapEvaluation(row, today));

  const untyped = await db
    .prepare(
      `SELECT id, emp_no, name, workplace, department, position, hire_date FROM employees
       WHERE is_active = 1 AND hire_type IS NULL AND hire_date >= ?
       ORDER BY hire_date DESC, name`
    )
    .all(addDays(today, -UNTYPED_WINDOW_DAYS));

  const active =
    view === 'done'
      ? (await db.prepare(`${SELECT_SQL} WHERE v.status IN (${OPEN_SQL}) AND e.is_active = 1`).all()).map(
          (row) => mapEvaluation(row, today)
        )
      : items;

  return {
    today,
    items,
    untyped: untyped.map((row) => ({
      id: String(row.id),
      empNo: row.emp_no || '',
      name: row.name,
      workplace: row.workplace || '',
      department: row.department || '',
      position: row.position || '',
      hireDate: row.hire_date,
    })),
    summary: {
      pending: active.filter((v) => v.status === 'pending').length,
      reviewing: active.filter((v) => v.status === 'reviewing').length,
      submitted: active.filter((v) => v.status === 'submitted').length,
      overdue: active.filter((v) => v.status === 'pending' && v.daysLeft < 0).length,
      dueSoon: active.filter((v) => v.status === 'pending' && v.daysLeft >= 0 && v.daysLeft <= REMINDER_DAYS).length,
      noEvaluator: active.filter((v) => v.status === 'pending' && !v.evaluatorId).length,
    },
  };
}

export async function listForEmployee(employeeId) {
  const today = kstToday();
  const rows = await getDb()
    .prepare(`${SELECT_SQL} WHERE v.employee_id = ? ORDER BY v.due_date, v.round`)
    .all(Number(employeeId));
  return rows.map((row) => mapEvaluation(row, today));
}

/** 내가 평가자(팀장)이거나 임원으로 지정된 진행 중 평가. myTask: 'write'(평가표 작성) | 'review'(임원 의견) | '' */
export async function listMine(employeeId) {
  const today = kstToday();
  const me = Number(employeeId);
  const rows = await getDb()
    .prepare(
      `${SELECT_SQL} WHERE e.is_active = 1 AND (
         (v.evaluator_id = ? AND v.status IN (${OPEN_SQL}))
         OR (v.reviewer_id = ? AND v.status IN ('reviewing', 'submitted'))
       )
       ORDER BY v.due_date, v.id`
    )
    .all(me, me);
  return rows.map((row) => {
    const item = mapEvaluation(row, today);
    const myRole = Number(row.reviewer_id) === me ? 'reviewer' : 'evaluator';
    const myTask =
      myRole === 'evaluator' && row.status === 'pending' ? 'write' : myRole === 'reviewer' && row.status === 'reviewing' ? 'review' : '';
    return { ...item, myRole, myTask };
  });
}

export async function countTasks(employeeId) {
  const me = Number(employeeId);
  const row = await getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM employee_evaluations v JOIN employees e ON e.id = v.employee_id
       WHERE e.is_active = 1 AND ((v.evaluator_id = ? AND v.status = 'pending') OR (v.reviewer_id = ? AND v.status = 'reviewing'))`
    )
    .get(me, me);
  return Number(row?.c || 0);
}

/**
 * 평가 관리 권한자, 지정된 평가자(팀장), 팀장 제출 뒤의 임원만 볼 수 있습니다. 평가 대상 본인은 볼 수 없습니다.
 * canEdit: 점수·팀장 의견 작성, canReview: 임원 의견 작성
 */
export async function getEvaluation(id, access) {
  const row = await getRow(id);
  const me = Number(access.employee.id);
  const manager = access.has('evaluations.manage');
  const self = Number(row.employee_id) === me;
  const evaluator = Number(row.evaluator_id) === me;
  const reviewer = Number(row.reviewer_id) === me && row.status !== 'pending';
  if (self || (!manager && !evaluator && !reviewer)) throw httpError('이 평가를 볼 권한이 없습니다.', 403);
  const afterSubmit = ['reviewing', 'submitted'].includes(row.status);
  return {
    ...mapEvaluation(row),
    canEdit: (row.status === 'pending' && (evaluator || manager)) || (manager && afterSubmit),
    canReview: (reviewer && row.status === 'reviewing') || (manager && afterSubmit),
    canManage: manager,
  };
}

/* ───────────── 평가자 지정·작성 ───────────── */

async function checkAssignee(db, row, personId, label) {
  if (!personId) return;
  const person = await db.prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1').get(personId);
  if (!person) throw httpError(`${label}을(를) 찾을 수 없습니다. 재직 중인 직원을 선택하세요.`);
  if (personId === Number(row.employee_id)) throw httpError(`평가 대상 본인은 ${label}이(가) 될 수 없습니다.`);
}

/** 평가자(팀장)·임원 지정과 기한 조정. 임원은 지정하지 않아도 됩니다(인사담당이 확정할 때 임원 의견을 대신 입력). */
export async function assignEvaluator(id, data, actor) {
  const db = getDb();
  let notifyEvaluator = null;
  let notifyReviewer = null;
  await db.transaction(async () => {
    const row = await getRow(id);
    await db.lock(LOCK_EVALUATION, row.employee_id);
    if (!OPEN_STATUSES.includes(row.status)) throw httpError('확정·취소된 평가는 바꿀 수 없습니다.');
    const currentEvaluator = idOrNull(row.evaluator_id);
    const currentReviewer = idOrNull(row.reviewer_id);
    const evaluatorId = idOrNull(text(data?.evaluatorId));
    const reviewerId = data && 'reviewerId' in data ? idOrNull(text(data.reviewerId)) : currentReviewer;
    await checkAssignee(db, row, evaluatorId, '평가자');
    await checkAssignee(db, row, reviewerId, '임원');
    if (evaluatorId && evaluatorId === reviewerId) throw httpError('평가자(팀장)와 임원은 다른 사람으로 지정하세요.');
    if (row.status !== 'pending' && evaluatorId !== currentEvaluator) {
      throw httpError('팀장이 제출한 평가는 평가자를 바꿀 수 없습니다. 먼저 반려하세요.');
    }
    if (row.status === 'submitted' && reviewerId !== currentReviewer) {
      throw httpError('임원 의견까지 받은 평가는 임원을 바꿀 수 없습니다. 먼저 반려하세요.');
    }
    const dueDate = data?.dueDate ? cleanDate(data.dueDate, '평가 기한') : row.due_date;
    const evaluatorChanged = evaluatorId !== currentEvaluator;
    const reviewerChanged = reviewerId !== currentReviewer;
    const dueChanged = dueDate !== row.due_date;
    const status = row.status === 'reviewing' && !reviewerId ? 'submitted' : row.status;
    const today = kstToday();
    const remindNow = Boolean(evaluatorId) && evaluatorChanged && row.status === 'pending' && diffDays(dueDate, today) <= REMINDER_DAYS;
    await db
      .prepare(
        `UPDATE employee_evaluations
         SET evaluator_id = ?, reviewer_id = ?, due_date = ?, status = ?,
             reminded_at = CASE WHEN ? = 1 THEN datetime('now', 'localtime') WHEN ? = 1 THEN NULL ELSE reminded_at END,
             updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      )
      .run(evaluatorId, reviewerId, dueDate, status, remindNow ? 1 : 0, dueChanged ? 1 : 0, row.id);
    if (row.kind === 'probation' && dueChanged) await refreshEmployeeStatus(await getEmployee(row.employee_id));
    if (evaluatorId && evaluatorChanged && row.status === 'pending') notifyEvaluator = evaluatorId;
    if (reviewerId && reviewerChanged && status === 'reviewing') notifyReviewer = reviewerId;
  });
  const updated = mapEvaluation(await getRow(id));
  if (notifyEvaluator) {
    mailService.notifyEvaluationAssigned(await getEmployee(notifyEvaluator), [updated], actor, await listEvaluationManagers());
  }
  if (notifyReviewer) {
    mailService.notifyEvaluationReviewRequested(await getEmployee(notifyReviewer), updated, await listEvaluationManagers());
  }
  return updated;
}

function cleanSubmission(row, data, { submit }) {
  const given = new Map((Array.isArray(data?.scores) ? data.scores : []).map((s) => [text(s?.key), s?.score]));
  const scores = EVALUATION_ITEMS.map((item) => {
    const raw = given.get(item.key);
    if (raw == null || raw === '') return { key: item.key, label: item.label, score: null };
    const score = Number(raw);
    if (!Number.isInteger(score) || score < 1 || score > MAX_ITEM_SCORE) {
      throw httpError(`${item.label}: 1~${MAX_ITEM_SCORE}점 중에서 고르세요.`);
    }
    return { key: item.key, label: item.label, score };
  });
  const comment = text(data?.comment);
  if (comment.length > MAX_COMMENT) throw httpError(`평가의견(팀장)은 ${MAX_COMMENT}자 이하로 입력하세요.`);
  const isProbation = row.kind === 'probation';
  const recommendation = isProbation ? text(data?.recommendation) : '';
  if (recommendation && !OUTCOMES[recommendation]) throw httpError('정규직 채용 여부를 다시 고르세요.');
  const filled = scores.filter((s) => s.score != null);
  const total = filled.length ? filled.reduce((sum, s) => sum + s.score, 0) : null;

  if (submit) {
    const missing = scores.find((s) => s.score == null);
    if (missing) throw httpError(`${missing.label} 점수를 고르세요.`);
    if (comment.length < 2) throw httpError('평가의견(팀장)을 입력하세요.');
    if (isProbation) {
      if (!recommendation) throw httpError('정규직 채용 여부를 고르세요.');
      if (!allowedOutcomes(total).includes(recommendation)) {
        throw httpError(
          total >= PASS_SCORE
            ? `최종 평가 점수가 ${PASS_SCORE}점 이상이면 정식 채용입니다.`
            : `최종 평가 점수가 ${PASS_SCORE}점 미만이면 수습 연장 또는 계약 종료 중에서 고르세요.`
        );
      }
    }
  }
  return {
    scores,
    total,
    max: MAX_TOTAL_SCORE,
    comment: comment || null,
    recommendation: recommendation || null,
  };
}

/**
 * 평가표(점수·팀장 의견·정규직 채용 여부) 임시 저장(submit=false) 또는 제출.
 * 지정된 평가자(팀장), 또는 평가 관리 권한자가 대신 작성할 수 있습니다.
 * 제출하면 임원이 지정돼 있으면 임원 의견 대기, 아니면 확정 대기가 됩니다.
 */
export async function saveEvaluation(id, data, access) {
  const db = getDb();
  const submit = Boolean(data?.submit);
  const actorId = Number(access.employee.id);
  const manager = access.has('evaluations.manage');
  let nextStatus = null;
  await db.transaction(async () => {
    const row = await getRow(id);
    await db.lock(LOCK_EVALUATION, row.employee_id);
    if (Number(row.employee_id) === actorId) throw httpError('본인 평가는 작성할 수 없습니다.', 403);
    const isEvaluator = Number(row.evaluator_id) === actorId;
    if (!isEvaluator && !manager) throw httpError('이 평가를 작성할 권한이 없습니다.', 403);
    const afterSubmit = ['reviewing', 'submitted'].includes(row.status);
    if (row.status !== 'pending' && !(manager && afterSubmit)) {
      throw httpError(afterSubmit ? '이미 제출한 평가입니다. 고치려면 인사담당에게 반려를 요청하세요.' : '확정·취소된 평가는 고칠 수 없습니다.');
    }
    const clean = cleanSubmission(row, data, { submit: submit || afterSubmit });
    const becomesSubmitted = submit && row.status === 'pending';
    const status = becomesSubmitted ? (row.reviewer_id ? 'reviewing' : 'submitted') : row.status;
    await db
      .prepare(
        `UPDATE employee_evaluations
         SET scores = ?, total_score = ?, max_score = ?, comment = ?, recommendation = ?,
             status = ?,
             submitted_by = CASE WHEN ? = 1 THEN ? ELSE submitted_by END,
             submitted_at = CASE WHEN ? = 1 THEN datetime('now', 'localtime') ELSE submitted_at END,
             updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      )
      .run(
        JSON.stringify(clean.scores),
        clean.total,
        clean.max,
        clean.comment,
        clean.recommendation,
        status,
        becomesSubmitted ? 1 : 0,
        actorId,
        becomesSubmitted ? 1 : 0,
        row.id
      );
    if (becomesSubmitted) nextStatus = status;
  });
  const updated = mapEvaluation(await getRow(id));
  if (nextStatus === 'reviewing') {
    mailService.notifyEvaluationReviewRequested(await getEmployee(updated.reviewerId), updated, await listEvaluationManagers());
  } else if (nextStatus === 'submitted' && !manager) {
    mailService.notifyEvaluationSubmitted(await listEvaluationManagers(), updated);
  }
  return updated;
}

/**
 * 평가의견(임원) 임시 저장 또는 제출. 지정된 임원은 임원 의견 대기일 때,
 * 평가 관리 권한자는 확정 전까지 대신 입력·수정할 수 있습니다.
 */
export async function reviewEvaluation(id, data, access) {
  const db = getDb();
  const submit = Boolean(data?.submit);
  const actorId = Number(access.employee.id);
  const manager = access.has('evaluations.manage');
  const comment = text(data?.comment);
  if (comment.length > MAX_COMMENT) throw httpError(`평가의견(임원)은 ${MAX_COMMENT}자 이하로 입력하세요.`);
  let submitted = false;
  await db.transaction(async () => {
    const row = await getRow(id);
    await db.lock(LOCK_EVALUATION, row.employee_id);
    if (Number(row.employee_id) === actorId) throw httpError('본인 평가는 작성할 수 없습니다.', 403);
    const isReviewer = Number(row.reviewer_id) === actorId;
    if (!isReviewer && !manager) throw httpError('이 평가에 임원 의견을 쓸 권한이 없습니다.', 403);
    const allowed = (isReviewer && row.status === 'reviewing') || (manager && ['reviewing', 'submitted'].includes(row.status));
    if (!allowed) {
      if (row.status === 'pending') throw httpError('팀장이 아직 평가표를 제출하지 않았습니다.');
      if (row.status === 'submitted') throw httpError('이미 의견을 제출했습니다. 고치려면 인사담당에게 요청하세요.');
      throw httpError('확정·취소된 평가는 고칠 수 없습니다.');
    }
    if (submit && comment.length < 2) throw httpError('평가의견(임원)을 입력하세요.');
    const becomesSubmitted = submit && row.status === 'reviewing';
    const signed = Boolean(comment) && (submit || row.status === 'submitted');
    await db
      .prepare(
        `UPDATE employee_evaluations
         SET reviewer_comment = ?, status = ?,
             reviewed_by = CASE WHEN ? = 1 THEN ? ELSE reviewed_by END,
             reviewed_at = CASE WHEN ? = 1 THEN datetime('now', 'localtime') ELSE reviewed_at END,
             updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      )
      .run(comment || null, becomesSubmitted ? 'submitted' : row.status, signed ? 1 : 0, actorId, signed ? 1 : 0, row.id);
    submitted = becomesSubmitted;
  });
  const updated = mapEvaluation(await getRow(id));
  if (submitted && !manager) mailService.notifyEvaluationSubmitted(await listEvaluationManagers(), updated);
  return updated;
}

/* ───────────── 인사담당 처리 ───────────── */

function recordDetail(row, outcome, outcomeDate, note) {
  const lines = [];
  const evaluatorName = row.evaluator_name || row.submitted_by_name;
  const reviewerName = row.reviewer_name || row.reviewed_by_name;
  if (row.comment) lines.push(`평가의견(팀장${evaluatorName ? ` ${evaluatorName}` : ''}): ${row.comment}`);
  if (row.reviewer_comment) lines.push(`평가의견(임원${reviewerName ? ` ${reviewerName}` : ''}): ${row.reviewer_comment}`);
  if (outcome) lines.push(`결과: ${OUTCOMES[outcome]}${outcome === 'extend' && outcomeDate ? ` (~${outcomeDate})` : ''}`);
  if (note) lines.push(`인사 의견: ${note}`);
  return lines.join('\n').slice(0, 2000);
}

/** 평가를 확정하고 인사기록카드(평가·발령 이력)에 남깁니다. 수습평가는 결과(정식 채용·수습 연장·계약 종료)를 정합니다. */
export async function confirmEvaluation(id, data, actor) {
  const db = getDb();
  const actorId = Number(actor.id);
  let nextRound = null;
  await db.transaction(async () => {
    const row = await getRow(id);
    await db.lock(LOCK_EVALUATION, row.employee_id);
    if (row.status === 'reviewing') throw httpError('임원 의견 대기 중입니다. 임원 의견을 받은 뒤 확정하거나, 임원 의견을 대신 입력해 제출하세요.');
    if (row.status !== 'submitted') throw httpError('평가자가 제출한 평가만 확정할 수 있습니다.');
    const note = cleanNote(data?.note, '인사 의견');
    let outcome = null;
    let outcomeDate = null;
    if (row.kind === 'probation') {
      outcome = text(data?.outcome);
      if (!OUTCOMES[outcome]) throw httpError('수습평가 결과(정식 채용·수습 연장·계약 종료)를 고르세요.');
      if (outcome === 'regular') {
        outcomeDate = data?.outcomeDate ? cleanDate(data.outcomeDate, '정규직 전환일') : addDays(row.due_date, 1);
      } else if (outcome === 'extend') {
        outcomeDate = cleanDate(data?.outcomeDate, '연장 수습 종료일');
        if (outcomeDate <= row.due_date) throw httpError(`연장 수습 종료일은 지금 수습 종료일(${row.due_date}) 뒤여야 합니다.`);
      }
    }

    const evaluatorName = row.evaluator_name || row.submitted_by_name || '';
    const label = evaluationLabel(row.kind, Number(row.round));
    const record = await personnelService.createRecord(
      row.employee_id,
      {
        category: 'evaluation',
        title: label,
        startDate: (row.submitted_at || '').slice(0, 10) || kstToday(),
        result: row.total_score != null ? `${row.total_score}/${row.max_score}점` : '',
        organization: evaluatorName,
        detail: recordDetail(row, outcome, outcomeDate, note),
        notes: '평가 일정에서 확정',
      },
      actorId
    );
    if (outcome === 'regular' || outcome === 'extend') {
      await personnelService.createRecord(
        row.employee_id,
        {
          category: 'appointment',
          title: outcome === 'regular' ? '정규직 전환' : '수습 연장',
          startDate: outcome === 'regular' ? outcomeDate : addDays(row.due_date, 1),
          organization: row.department || '',
          result: row.position || '',
          detail: outcome === 'regular' ? `${label} 결과` : `${label} 결과 · 수습 종료일 ${outcomeDate}`,
          notes: '평가 일정에서 확정',
        },
        actorId
      );
    }

    await db
      .prepare(
        `UPDATE employee_evaluations
         SET status = 'confirmed', outcome = ?, outcome_date = ?, hr_note = ?, record_id = ?,
             confirmed_by = ?, confirmed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      )
      .run(outcome, outcomeDate, note, Number(record.id), actorId, row.id);

    if (outcome === 'extend') {
      const result = await db
        .prepare(
          `INSERT INTO employee_evaluations (employee_id, kind, round, due_date, evaluator_id, reviewer_id)
           VALUES (?, 'probation', ?, ?, ?, ?)`
        )
        .run(row.employee_id, Number(row.round) + 1, outcomeDate, row.evaluator_id, row.reviewer_id);
      nextRound = result.lastInsertRowid;
    }
    if (outcome === 'reject') {
      await db
        .prepare(
          `UPDATE employee_evaluations SET status = 'cancelled', hr_note = ?, updated_at = datetime('now', 'localtime')
           WHERE employee_id = ? AND kind = 'one_year' AND status IN (${OPEN_SQL})`
        )
        .run('수습평가 결과 계약 종료', row.employee_id);
    }
    if (row.kind === 'probation') await refreshEmployeeStatus(await getEmployee(row.employee_id));
  });

  if (nextRound) {
    const next = mapEvaluation(await getRow(nextRound));
    if (next.evaluatorId) {
      mailService.notifyEvaluationAssigned(await getEmployee(next.evaluatorId), [next], actor, await listEvaluationManagers());
    }
  }
  return mapEvaluation(await getRow(id));
}

/**
 * 인사담당이 요청 메일을 직접 보냅니다. 작성 대기면 평가자에게 평가 요청,
 * 임원 의견 대기면 임원에게 의견 요청을 보내고 인사담당은 참조로 받습니다.
 */
export async function sendRequestMail(id, actor) {
  const row = await getRow(id);
  const toReviewer = row.status === 'reviewing';
  if (!['pending', 'reviewing'].includes(row.status)) {
    throw httpError(
      row.status === 'submitted' ? '확정 대기 중인 평가는 보낼 요청 메일이 없습니다. 확정하거나 반려하세요.' : '진행 중인 평가만 요청 메일을 보낼 수 있습니다.'
    );
  }
  const personId = toReviewer ? row.reviewer_id : row.evaluator_id;
  const role = toReviewer ? '임원' : '평가자';
  const roleObj = toReviewer ? '임원을' : '평가자를';
  if (!personId) throw httpError(`${roleObj} 먼저 지정하세요.`);
  const person = await getEmployee(personId);
  if (!person.is_active) throw httpError(`${role}(${person.name})는 퇴사했습니다. ${roleObj} 다시 지정하세요.`);
  if (!text(person.email)) throw httpError(`${person.name}님의 이메일 주소가 없습니다. 사원 정보에서 이메일을 등록하세요.`);
  if (!(await mailService.isMailEnabled())) throw httpError('메일 발송이 꺼져 있습니다. 메일 설정에서 발송을 켜세요.');

  const item = mapEvaluation(row);
  const cc = await listEvaluationManagers();
  const result = toReviewer
    ? await mailService.notifyEvaluationReviewRequested(person, item, cc, { actor })
    : await mailService.notifyEvaluationAssigned(person, [item], actor, cc, { resend: true });
  if (result?.error) throw httpError(`메일을 보내지 못했습니다: ${result.error}`, 502);
  if (!result || result.skipped) {
    throw httpError(result?.reason === 'incomplete' ? '메일 설정(SMTP 계정·비밀번호)을 먼저 완성하세요.' : '메일을 보내지 못했습니다.');
  }

  if (!toReviewer && diffDays(row.due_date, kstToday()) <= REMINDER_DAYS) {
    await getDb()
      .prepare(`UPDATE employee_evaluations SET reminded_at = datetime('now', 'localtime') WHERE id = ?`)
      .run(row.id);
  }
  return { role, name: person.name, email: text(person.email), ccCount: cc.filter((m) => text(m.email)).length };
}

export async function returnEvaluation(id, data, actor) {
  const db = getDb();
  const note = cleanNote(data?.note, '반려 사유', { required: true });
  await db.transaction(async () => {
    const row = await getRow(id);
    await db.lock(LOCK_EVALUATION, row.employee_id);
    if (!['reviewing', 'submitted'].includes(row.status)) throw httpError('제출된 평가만 반려할 수 있습니다.');
    await db
      .prepare(
        `UPDATE employee_evaluations SET status = 'pending', hr_note = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      )
      .run(note, row.id);
  });
  const updated = mapEvaluation(await getRow(id));
  if (updated.evaluatorId) {
    mailService.notifyEvaluationReturned(await getEmployee(updated.evaluatorId), updated, note, actor, await listEvaluationManagers());
  }
  return updated;
}

export async function cancelEvaluation(id, data) {
  const db = getDb();
  const note = cleanNote(data?.note, '취소 사유', { required: true });
  await db.transaction(async () => {
    const row = await getRow(id);
    await db.lock(LOCK_EVALUATION, row.employee_id);
    if (!OPEN_STATUSES.includes(row.status)) throw httpError('진행 중인 평가만 취소할 수 있습니다.');
    await db
      .prepare(
        `UPDATE employee_evaluations SET status = 'cancelled', hr_note = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      )
      .run(note, row.id);
    if (row.kind === 'probation') await refreshEmployeeStatus(await getEmployee(row.employee_id));
  });
  return mapEvaluation(await getRow(id));
}

export async function restoreEvaluation(id) {
  const db = getDb();
  await db.transaction(async () => {
    const row = await getRow(id);
    await db.lock(LOCK_EVALUATION, row.employee_id);
    if (row.status !== 'cancelled') throw httpError('취소된 평가만 되살릴 수 있습니다.');
    if (!(PLAN_KINDS[row.hire_type] || []).includes(row.kind)) {
      throw httpError('지금 입사 구분에 맞지 않는 평가라 되살릴 수 없습니다.');
    }
    await db
      .prepare(
        `UPDATE employee_evaluations
         SET status = 'pending', hr_note = NULL, updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      )
      .run(row.id);
    if (row.kind === 'probation') await refreshEmployeeStatus(await getEmployee(row.employee_id));
  });
  return mapEvaluation(await getRow(id));
}

/* ───────────── 기한 알림 ───────────── */

/** 인사담당 역할자. 없으면 시스템관리자 */
export async function listEvaluationManagers() {
  const rows = await getDb()
    .prepare(
      `SELECT e.*, r.role FROM employee_roles r JOIN employees e ON e.id = r.employee_id
       WHERE e.is_active = 1 AND r.role IN ('hr', 'system_admin') ORDER BY e.id`
    )
    .all();
  const hr = rows.filter((row) => row.role === 'hr');
  return hr.length ? hr : rows.filter((row) => row.role === 'system_admin');
}

/**
 * 기한이 REMINDER_DAYS 일 안으로 들어온(또는 지난) 작성 대기 평가를 한 번씩 알립니다.
 * 평가자에게는 본인 몫을, 인사담당에게는 전체 목록을 한 통으로 보냅니다.
 */
export async function sendDueReminders(today = kstToday()) {
  if (!(await mailService.isMailEnabled())) return { sent: 0, skipped: 'mail-disabled' };
  const db = getDb();
  const rows = await db
    .prepare(
      `${SELECT_SQL} WHERE v.status = 'pending' AND v.reminded_at IS NULL AND e.is_active = 1 AND v.due_date <= ?
       ORDER BY v.due_date, v.id`
    )
    .all(addDays(today, REMINDER_DAYS));
  if (!rows.length) return { sent: 0 };
  const items = rows.map((row) => mapEvaluation(row, today));

  const byEvaluator = new Map();
  for (const item of items) {
    if (!item.evaluatorId) continue;
    if (!byEvaluator.has(item.evaluatorId)) byEvaluator.set(item.evaluatorId, []);
    byEvaluator.get(item.evaluatorId).push(item);
  }
  const managers = await listEvaluationManagers();
  for (const [evaluatorId, list] of byEvaluator) {
    await mailService.notifyEvaluationReminder([await getEmployee(evaluatorId)], list, { forManager: false, cc: managers });
  }
  await mailService.notifyEvaluationReminder(managers, items, { forManager: true });

  for (const row of rows) {
    await db
      .prepare(`UPDATE employee_evaluations SET reminded_at = datetime('now', 'localtime') WHERE id = ?`)
      .run(row.id);
  }
  return { sent: items.length };
}

let reminderTimer = null;
let lastReminderDate = '';

/** 매시간 확인해서 하루에 한 번(오전 8시 이후) 기한 알림을 보냅니다. EVALUATION_REMINDERS=off 면 끕니다. */
export function startReminderSchedule() {
  if (reminderTimer || process.env.EVALUATION_REMINDERS === 'off') return;
  const tick = async () => {
    const today = kstToday();
    if (today === lastReminderDate || kstHour() < 8) return;
    lastReminderDate = today;
    try {
      const result = await sendDueReminders(today);
      if (result.sent) console.log(`[evaluation] 기한 알림 ${result.sent}건을 보냈습니다.`);
    } catch (error) {
      console.error('[evaluation] 기한 알림 실패:', error.message);
    }
  };
  setTimeout(tick, 60_000).unref();
  reminderTimer = setInterval(tick, 60 * 60_000);
  reminderTimer.unref();
}

import { getDb, LOCK_APPROVAL_DOCUMENT, LOCK_DOCUMENT_NUMBER } from '../db.js';
import * as mailService from './mailService.js';
import * as certificateService from './certificateService.js';
import {
  describeDocumentStep,
  getApprovalChain,
  listDocumentStepApprovers,
  matchesDocumentStep,
} from './approvalService.js';
import { sanitizeRichText, richTextPlain } from '../utils/richText.js';
import { addDays } from '../../src/constants/evaluation.js';
import { CERT_TYPES } from '../../src/constants/certificates.js';
import {
  DOC_FORM_MAP,
  DOC_STATUS_LABELS,
  HR_STEP,
  MAX_LINE,
  MAX_REFS,
  STEP_KINDS,
  TITLE_MAX,
  formatAmount,
  stepStatusLabel,
} from '../../src/constants/approvalDocs.js';

const COMMENT_MAX = 1000;
const MAX_AMOUNT = 1_000_000_000_000;
const BOXES = ['todo', 'drafted', 'processed', 'refs'];

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function limited(value, max, label, { required = false } = {}) {
  const raw = text(value);
  if (required && !raw) throw httpError(`${label}을(를) 입력하세요.`);
  if (raw.length > max) throw httpError(`${label}은(는) ${max}자 이내로 입력하세요.`);
  return raw;
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}

const kstStampFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function kstStamp(date = new Date()) {
  return kstStampFormat.format(date);
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
}

/* ───────────── 양식 입력 검사 ───────────── */

function cleanField(field, value) {
  if (field.type === 'date') {
    const raw = text(value);
    if (!raw) {
      if (field.required) throw httpError(`${field.label}을(를) 입력하세요.`);
      return '';
    }
    if (!isDateKey(raw)) throw httpError(`${field.label}을(를) YYYY-MM-DD 형식으로 입력하세요.`);
    return raw;
  }
  if (field.type === 'amount') {
    const raw = text(value).replace(/,/g, '');
    if (!raw) {
      if (field.required) throw httpError(`${field.label}을(를) 입력하세요.`);
      return '';
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > MAX_AMOUNT) throw httpError(`${field.label}은(는) 0 이상의 숫자로 입력하세요.`);
    return n;
  }
  if (field.type === 'select') {
    const raw = text(value);
    if (!raw) {
      if (field.required) throw httpError(`${field.label}을(를) 선택하세요.`);
      return '';
    }
    if (!field.options.includes(raw)) throw httpError(`${field.label} 값을 목록에서 선택하세요.`);
    return raw;
  }
  if (field.type === 'richtext') {
    const raw = value == null ? '' : String(value);
    if (raw.length > field.max) throw httpError(`${field.label}이(가) 너무 깁니다. 표·서식을 줄여 주세요.`);
    const html = sanitizeRichText(raw);
    if (field.required && !richTextPlain(html)) throw httpError(`${field.label}을(를) 입력하세요.`);
    return html;
  }
  return limited(value, field.max || 500, field.label, { required: field.required });
}

function cleanBody(form, data = {}) {
  const body = {};
  for (const field of form.fields) body[field.key] = cleanField(field, data[field.key]);
  if (form.fields.some((field) => field.type === 'richtext')) body.format = 'html';
  if (body.startDate && body.endDate && body.endDate < body.startDate) {
    throw httpError('종료일이 시작일보다 빠릅니다.');
  }
  return body;
}

/**
 * 결재선: 기안자가 지정한 결재자·합의자를 순서대로 놓고, 인사 확인 양식이면 끝에 인사 단계를 붙입니다.
 * line: [{ employeeId, kind: 'approval' | 'agreement' }]
 */
async function buildSteps(drafter, form, line) {
  const steps = [];
  if (form.line === 'select') {
    const entries = Array.isArray(line) ? line : [];
    if (!entries.length) throw httpError('결재자를 1명 이상 지정하세요.');
    if (entries.length > MAX_LINE) throw httpError(`결재선은 ${MAX_LINE}명까지 지정할 수 있습니다.`);
    const seen = new Set();
    for (const entry of entries) {
      const id = toId(entry?.employeeId);
      const kind = entry?.kind === 'agreement' ? 'agreement' : 'approval';
      if (!id) throw httpError('결재선에 지정할 직원을 선택하세요.');
      if (id === Number(drafter.id)) throw httpError('본인은 결재선에 넣을 수 없습니다.');
      if (seen.has(id)) throw httpError('결재선에 같은 사람이 두 번 들어 있습니다.');
      seen.add(id);
      const person = await employeeRow(id);
      if (!person?.is_active) throw httpError('결재선에 재직 중이 아닌 직원이 있습니다.');
      steps.push({ role: STEP_KINDS[kind], kind, assignee: person });
    }
    if (steps.at(-1).kind !== 'approval') throw httpError('결재선의 마지막은 결재자여야 합니다. 합의자 뒤에 결재자를 지정하세요.');
  }
  if (form.hr) steps.push({ role: HR_STEP, kind: 'approval', assignee: null });
  return steps;
}

/** 지정한 사람이 있는 단계는 그 사람만, 없는 단계(인사·이전 문서)는 직위별 규칙으로 판정합니다. */
async function stepMatches(actor, drafter, step) {
  if (!actor?.is_active || !drafter) return false;
  if (Number(actor.id) === Number(drafter.id)) return false;
  if (step.assignee_id) return Number(actor.id) === Number(step.assignee_id);
  return matchesDocumentStep(actor, drafter, step.role);
}

async function stepApprovers(drafter, step) {
  if (!step.assignee_id) return listDocumentStepApprovers(drafter, step.role);
  const person = await employeeRow(step.assignee_id);
  return person?.is_active ? [person] : [];
}

/** 기안 화면에서 미리 채울 결재자: 직위별 결재선에서 결재할 사람이 한 명으로 정해지는 단계만 */
export async function suggestLine(employeeId) {
  const drafter = await employeeRow(employeeId);
  if (!drafter?.is_active) throw httpError('직원을 찾을 수 없습니다.', 404);
  const line = [];
  for (const { role } of await getApprovalChain(drafter)) {
    if (role === '관리자') continue;
    const candidates = await listDocumentStepApprovers(drafter, role);
    if (candidates.length !== 1 || line.some((item) => item.employeeId === String(candidates[0].id))) continue;
    line.push({ employeeId: String(candidates[0].id), kind: 'approval' });
  }
  return line;
}

/* ───────────── 조회용 변환 ───────────── */

async function documentRow(id) {
  const row = await getDb().prepare('SELECT * FROM approval_documents WHERE id = ?').get(toId(id));
  if (!row) throw httpError('문서를 찾을 수 없습니다.', 404);
  return row;
}

async function documentSteps(documentId) {
  return getDb()
    .prepare('SELECT * FROM approval_document_steps WHERE document_id = ? ORDER BY step_order')
    .all(Number(documentId));
}

async function employeeRow(id) {
  return getDb().prepare('SELECT * FROM employees WHERE id = ?').get(Number(id));
}

function currentStep(doc, steps) {
  if (doc.status !== 'pending') return null;
  return steps.find((step) => Number(step.step_order) === Number(doc.current_step)) || null;
}

function bodySummary(form, body) {
  if (!form) return '';
  if (form.key === 'certificate') return CERT_TYPES[body.certType]?.label || '';
  if (form.key === 'certificate_issue') {
    return [body.employeeName, CERT_TYPES[body.certType]?.label, body.requestId ? '직원 신청' : '인사 품의']
      .filter(Boolean)
      .join(' · ');
  }
  const parts = [];
  if (body.destination) parts.push(body.destination);
  if (body.courseName) parts.push(body.courseName);
  if (body.eventType) parts.push(body.eventType);
  if (body.startDate) parts.push(body.endDate && body.endDate !== body.startDate ? `${body.startDate}~${body.endDate}` : body.startDate);
  if (body.eventDate) parts.push(body.eventDate);
  const amount = body.expense ?? body.cost;
  if (amount !== '' && amount != null) parts.push(formatAmount(amount));
  return parts.join(' · ');
}

function mapListItem(row, extra = {}) {
  const form = DOC_FORM_MAP[row.form_key];
  return {
    id: Number(row.id),
    formKey: row.form_key,
    formLabel: form?.label || row.form_key,
    title: row.title,
    summary: bodySummary(form, parseJson(row.body, {})),
    drafter: {
      id: String(row.employee_id),
      name: row.drafter_name,
      department: row.drafter_department || '',
      position: row.drafter_position || '',
    },
    status: row.status,
    statusLabel: DOC_STATUS_LABELS[row.status] || row.status,
    currentRole: row.current_assignee_name ? `${row.current_assignee_name} ${row.current_role}` : row.current_role || null,
    documentNo: row.document_no || '',
    submittedAt: row.submitted_at,
    completedAt: row.completed_at || null,
    ...extra,
  };
}

async function mapStep(step, drafter, { current = false } = {}) {
  const kind = step.kind === 'agreement' ? 'agreement' : 'approval';
  let described;
  if (step.assignee_id || step.assignee_name) {
    described = { label: step.assignee_position || STEP_KINDS[kind], assignee: step.assignee_name || null };
  } else {
    described = drafter ? await describeDocumentStep(drafter, step.role) : { label: step.role, assignee: null };
  }
  return {
    order: Number(step.step_order),
    role: step.role,
    kind,
    label: described.label,
    assignee: described.assignee,
    assigneeId: step.assignee_id ? String(step.assignee_id) : null,
    assigneeDepartment: step.assignee_department || '',
    status: step.status,
    statusLabel: stepStatusLabel(kind, step.status),
    current,
    actorName: step.actor_name || '',
    actorPosition: step.actor_position || '',
    proxy: Boolean(Number(step.proxy)),
    comment: step.comment || '',
    actedAt: step.acted_at || null,
  };
}

/* ───────────── 권한 ───────────── */

async function canView(access, doc, steps) {
  const me = Number(access.employee.id);
  if (Number(doc.employee_id) === me) return true;
  if (access.has('documents.manage')) return true;
  if (doc.form_key === 'certificate_issue' && access.has('certificates.manage')) return true;
  if (steps.some((step) => Number(step.actor_id) === me || Number(step.assignee_id) === me)) return true;
  const ref = await getDb()
    .prepare('SELECT id FROM approval_document_refs WHERE document_id = ? AND employee_id = ?')
    .get(doc.id, me);
  if (ref) return true;
  const step = currentStep(doc, steps);
  if (!step) return false;
  return stepMatches(access.employee, await employeeRow(doc.employee_id), step);
}

/* ───────────── 문서 보기 ───────────── */

export async function getDocument(access, id) {
  const db = getDb();
  const doc = await documentRow(id);
  const steps = await documentSteps(doc.id);
  if (!(await canView(access, doc, steps))) throw httpError('문서를 찾을 수 없습니다.', 404);

  const me = Number(access.employee.id);
  const drafter = await employeeRow(doc.employee_id);
  const step = currentStep(doc, steps);
  const lineMatch = step ? await stepMatches(access.employee, drafter, step) : false;
  const canProxy = Boolean(step) && !lineMatch && access.has('documents.manage') && me !== Number(doc.employee_id);
  const refs = await db
    .prepare(
      `SELECT r.employee_id, r.read_at, e.name, e.department, e.position
       FROM approval_document_refs r JOIN employees e ON e.id = r.employee_id
       WHERE r.document_id = ? ORDER BY e.name, r.id`
    )
    .all(doc.id);
  const myRef = refs.find((ref) => Number(ref.employee_id) === me);
  if (myRef && !myRef.read_at) {
    await db
      .prepare('UPDATE approval_document_refs SET read_at = ? WHERE document_id = ? AND employee_id = ?')
      .run(kstStamp(), doc.id, me);
  }
  const certificate = await db
    .prepare('SELECT id, cert_no, status FROM certificates WHERE document_id = ? ORDER BY id DESC LIMIT 1')
    .get(doc.id);
  const mine = Number(doc.employee_id) === me;
  const stepItems = [];
  for (const item of steps) stepItems.push(await mapStep(item, drafter, { current: item === step }));

  return {
    ...mapListItem(doc),
    body: parseJson(doc.body, {}),
    drafter: {
      id: String(doc.employee_id),
      name: doc.drafter_name,
      empNo: doc.drafter_emp_no || '',
      workplace: doc.drafter_workplace || '',
      department: doc.drafter_department || '',
      position: doc.drafter_position || '',
    },
    sourceId: doc.source_id ? Number(doc.source_id) : null,
    steps: stepItems,
    refs: refs.map((ref) => ({
      id: String(ref.employee_id),
      name: ref.name,
      department: ref.department || '',
      position: ref.position || '',
      readAt: ref.read_at || null,
    })),
    certificate: certificate
      ? { id: Number(certificate.id), certNo: certificate.cert_no, status: certificate.status }
      : null,
    permissions: {
      approve: lineMatch || canProxy,
      proxy: canProxy,
      withdraw: mine && doc.status === 'pending' && !steps.some((s) => s.status === 'approved'),
      resubmit: mine && (doc.status === 'rejected' || doc.status === 'withdrawn'),
    },
  };
}

/* ───────────── 문서함 ───────────── */

const LIST_SQL = `SELECT d.*, s.role AS current_role, s.assignee_id AS current_assignee_id,
    s.assignee_name AS current_assignee_name
  FROM approval_documents d
  LEFT JOIN approval_document_steps s ON s.document_id = d.id AND s.step_order = d.current_step AND d.status = 'pending'`;

async function todoRows(employee) {
  const rows = await getDb().prepare(`${LIST_SQL} WHERE d.status = 'pending' ORDER BY d.submitted_at, d.id`).all();
  const drafters = new Map();
  const result = [];
  for (const row of rows) {
    if (!row.current_role || Number(row.employee_id) === Number(employee.id)) continue;
    const key = Number(row.employee_id);
    if (!drafters.has(key)) drafters.set(key, await employeeRow(key));
    const step = { role: row.current_role, assignee_id: row.current_assignee_id };
    if (await stepMatches(employee, drafters.get(key), step)) result.push(row);
  }
  return result;
}

export async function countTodo(employeeId) {
  const employee = await employeeRow(employeeId);
  if (!employee?.is_active) return 0;
  return (await todoRows(employee)).length;
}

export async function listBox(employeeId, box) {
  const db = getDb();
  const employee = await employeeRow(employeeId);
  if (!employee) throw httpError('직원을 찾을 수 없습니다.', 404);
  const name = BOXES.includes(box) ? box : 'todo';
  let rows;
  if (name === 'todo') {
    rows = await todoRows(employee);
  } else if (name === 'drafted') {
    rows = await db.prepare(`${LIST_SQL} WHERE d.employee_id = ? ORDER BY d.id DESC`).all(employee.id);
  } else if (name === 'processed') {
    rows = await db
      .prepare(
        `${LIST_SQL} WHERE d.id IN (SELECT document_id FROM approval_document_steps WHERE actor_id = ?)
         ORDER BY d.id DESC`
      )
      .all(employee.id);
  } else {
    rows = await db
      .prepare(
        `${LIST_SQL} WHERE d.id IN (SELECT document_id FROM approval_document_refs WHERE employee_id = ?)
         ORDER BY d.id DESC`
      )
      .all(employee.id);
  }
  const unread =
    name === 'refs'
      ? new Set(
          (
            await db
              .prepare('SELECT document_id FROM approval_document_refs WHERE employee_id = ? AND read_at IS NULL')
              .all(employee.id)
          ).map((r) => Number(r.document_id))
        )
      : null;
  return {
    box: name,
    todoCount: name === 'todo' ? rows.length : (await todoRows(employee)).length,
    items: rows.map((row) => mapListItem(row, unread ? { unread: unread.has(Number(row.id)) } : {})),
  };
}

function adminFilter(filters = {}) {
  const where = [];
  const params = [];
  const year = Number(filters.year);
  if (Number.isInteger(year) && year > 2000) {
    where.push('d.submitted_at >= ? AND d.submitted_at < ?');
    params.push(`${year}-01-01`, `${year + 1}-01-01`);
  }
  if (DOC_FORM_MAP[filters.form]) {
    where.push('d.form_key = ?');
    params.push(filters.form);
  }
  if (DOC_STATUS_LABELS[filters.status]) {
    where.push('d.status = ?');
    params.push(filters.status);
  }
  return { sql: where.length ? ` WHERE ${where.join(' AND ')}` : '', params };
}

export async function listAll(filters = {}) {
  const { sql, params } = adminFilter(filters);
  const rows = await getDb().prepare(`${LIST_SQL}${sql} ORDER BY d.id DESC`).all(...params);
  const q = text(filters.q).toLowerCase();
  const items = rows.map((row) => mapListItem(row));
  if (!q) return items;
  return items.filter((item) =>
    [item.title, item.drafter.name, item.documentNo, item.drafter.department].some((v) => String(v).toLowerCase().includes(q))
  );
}

export async function exportAll(filters = {}) {
  const items = await listAll(filters);
  return {
    filename: `documents-${Number(filters.year) || 'all'}.csv`,
    headers: ['문서번호', '양식', '제목', '요약', '기안자', '부서', '직위', '상태', '현재 단계', '기안 일시', '완료 일시'],
    rows: items.map((item) => [
      item.documentNo,
      item.formLabel,
      item.title,
      item.summary,
      item.drafter.name,
      item.drafter.department,
      item.drafter.position,
      item.statusLabel,
      item.currentRole || '',
      item.submittedAt,
      item.completedAt || '',
    ]),
  };
}

/* ───────────── 기안 ───────────── */

async function cleanRefs(drafterId, refIds) {
  const ids = [...new Set((Array.isArray(refIds) ? refIds : []).map(toId).filter(Boolean))].filter(
    (id) => id !== Number(drafterId)
  );
  if (ids.length > MAX_REFS) throw httpError(`참조자는 ${MAX_REFS}명까지 지정할 수 있습니다.`);
  if (!ids.length) return [];
  const rows = await getDb()
    .prepare(`SELECT id FROM employees WHERE is_active = 1 AND id IN (${ids.map(() => '?').join(', ')})`)
    .all(...ids);
  if (rows.length !== ids.length) throw httpError('참조자 중 찾을 수 없는 직원이 있습니다.');
  return ids;
}

async function assignNumber(db, doc, form, completedAt) {
  const year = Number(completedAt.slice(0, 4));
  await db.lock(LOCK_DOCUMENT_NUMBER, year);
  const max = await db
    .prepare('SELECT MAX(doc_seq) AS m FROM approval_documents WHERE form_key = ? AND doc_year = ?')
    .get(doc.form_key, year);
  const seq = (Number(max?.m) || 0) + 1;
  const documentNo = `${form.prefix}-${year}-${String(seq).padStart(4, '0')}`;
  await db
    .prepare(
      `UPDATE approval_documents
       SET status = 'approved', current_step = NULL, doc_year = ?, doc_seq = ?, document_no = ?,
           completed_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(year, seq, documentNo, completedAt, completedAt, doc.id);
  return documentNo;
}

/** 완료 처리: 문서번호를 매기고, 증명서 발급 품의(이전 증명서 신청 포함)면 증명서를 발급합니다. */
async function completeDocument(db, doc, actor, completedAt) {
  const form = DOC_FORM_MAP[doc.form_key];
  await assignNumber(db, doc, form, completedAt);
  if (doc.form_key === 'certificate_issue') {
    await certificateService.issueFromDocument(db, doc, await employeeRow(doc.employee_id), completedAt);
  } else if (doc.form_key === 'certificate') {
    await certificateService.issueCertificate({
      employeeId: doc.employee_id,
      data: parseJson(doc.body, {}),
      channel: 'approval',
      actor,
      documentId: doc.id,
    });
  }
}

/** access: 기안자의 권한 (내부 결재 양식은 양식의 permission 이 있어야 기안) */
export async function createDocument(employeeId, data = {}, { access = null } = {}) {
  const db = getDb();
  const drafter = await employeeRow(employeeId);
  if (!drafter?.is_active) throw httpError('직원을 찾을 수 없습니다.', 404);
  const form = DOC_FORM_MAP[text(data.formKey)];
  if (!form) throw httpError('양식을 선택하세요.');
  if (form.retired) {
    throw httpError(
      form.key === 'certificate' ? '증명서는 "증명서" 메뉴에서 신청하세요.' : '더 이상 쓰지 않는 양식입니다.'
    );
  }
  if (form.permission && !access?.has(form.permission)) throw httpError(`${form.label}는 인사담당만 기안할 수 있습니다.`, 403);

  let body;
  let title;
  if (form.key === 'certificate_issue') {
    body = await certificateService.prepareIssueDraft(data.body || {});
    title = `${body.employeeName} ${CERT_TYPES[body.certType].label} 발급 품의`;
  } else {
    body = cleanBody(form, data.body || {});
    title = limited(data.title, TITLE_MAX, '제목', { required: true });
  }
  const refIds = await cleanRefs(drafter.id, data.refIds);

  let sourceId = null;
  if (data.sourceId != null && data.sourceId !== '') {
    const source = await db.prepare('SELECT * FROM approval_documents WHERE id = ?').get(toId(data.sourceId));
    if (!source || Number(source.employee_id) !== Number(drafter.id) || !['rejected', 'withdrawn'].includes(source.status)) {
      throw httpError('다시 기안할 수 있는 문서가 아닙니다.');
    }
    sourceId = source.id;
  }

  const steps = await buildSteps(drafter, form, data.line);
  const now = kstStamp();
  let id = 0;
  await db.transaction(async () => {
    const result = await db
      .prepare(
        `INSERT INTO approval_documents (
           form_key, title, body, employee_id, drafter_name, drafter_emp_no, drafter_workplace,
           drafter_department, drafter_position, status, current_step, source_id, submitted_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
      )
      .run(
        form.key,
        title,
        JSON.stringify(body),
        drafter.id,
        drafter.name,
        drafter.emp_no || null,
        drafter.workplace || null,
        drafter.department || null,
        drafter.position || null,
        steps.length ? 1 : null,
        sourceId,
        now,
        now,
        now
      );
    id = Number(result.lastInsertRowid);
    for (const [index, step] of steps.entries()) {
      await db
        .prepare(
          `INSERT INTO approval_document_steps (
             document_id, step_order, role, kind, status, assignee_id, assignee_name, assignee_department, assignee_position
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          index + 1,
          step.role,
          step.kind,
          index === 0 ? 'pending' : 'waiting',
          step.assignee?.id ?? null,
          step.assignee?.name ?? null,
          step.assignee?.department || null,
          step.assignee?.position || null
        );
    }
    for (const refId of refIds) {
      await db.prepare('INSERT INTO approval_document_refs (document_id, employee_id) VALUES (?, ?)').run(id, refId);
    }
    if (body.requestId) await certificateService.claimRequest(db, body.requestId, id, drafter, now);
    if (!steps.length) await completeDocument(db, await documentRow(id), drafter, now);
  });

  notifyAfterChange(id).catch((error) => console.error('[documents] notify failed:', error.message));
  return { id, autoApproved: !steps.length };
}

/* ───────────── 결재 ───────────── */

async function decide(access, id, decision, note) {
  const db = getDb();
  const actor = access.employee;
  let comment = '';
  await db.transaction(async () => {
    await db.lock(LOCK_APPROVAL_DOCUMENT, id);
    const doc = await documentRow(id);
    if (doc.status !== 'pending') throw httpError('이미 처리가 끝난 문서입니다.', 409);
    const steps = await documentSteps(doc.id);
    const step = currentStep(doc, steps);
    if (!step) throw httpError('결재할 단계가 없습니다.', 409);
    comment =
      decision === 'reject'
        ? limited(note, COMMENT_MAX, step.kind === 'agreement' ? '반대 사유' : '반려 사유', { required: true })
        : limited(note, COMMENT_MAX, '의견');
    const drafter = await employeeRow(doc.employee_id);
    const lineMatch = await stepMatches(actor, drafter, step);
    const proxy = !lineMatch && access.has('documents.manage') && Number(actor.id) !== Number(doc.employee_id);
    if (!lineMatch && !proxy) throw httpError('이 문서를 결재할 차례가 아닙니다.', 403);

    const now = kstStamp();
    await db
      .prepare(
        `UPDATE approval_document_steps
         SET status = ?, actor_id = ?, actor_name = ?, actor_position = ?, proxy = ?, comment = ?, acted_at = ?
         WHERE id = ?`
      )
      .run(decision === 'reject' ? 'rejected' : 'approved', actor.id, actor.name, actor.position || null, proxy ? 1 : 0, comment || null, now, step.id);

    if (decision === 'reject') {
      await db
        .prepare(
          `UPDATE approval_document_steps SET status = 'skipped' WHERE document_id = ? AND status = 'waiting'`
        )
        .run(doc.id);
      await db
        .prepare(
          `UPDATE approval_documents SET status = 'rejected', current_step = NULL, completed_at = ?, updated_at = ? WHERE id = ?`
        )
        .run(now, now, doc.id);
      if (doc.form_key === 'certificate_issue') await certificateService.releaseRequest(db, doc.id, now);
      return;
    }
    const next = steps.find((item) => Number(item.step_order) > Number(step.step_order));
    if (next) {
      await db.prepare(`UPDATE approval_document_steps SET status = 'pending' WHERE id = ?`).run(next.id);
      await db
        .prepare('UPDATE approval_documents SET current_step = ?, updated_at = ? WHERE id = ?')
        .run(next.step_order, now, doc.id);
      return;
    }
    await completeDocument(db, doc, actor, now);
  });
  notifyAfterChange(toId(id), { rejectNote: decision === 'reject' ? comment : '' }).catch((error) =>
    console.error('[documents] notify failed:', error.message)
  );
  return getDocument(access, id);
}

export function approveDocument(access, id, comment) {
  return decide(access, toId(id), 'approve', comment);
}

export function rejectDocument(access, id, reason) {
  return decide(access, toId(id), 'reject', reason);
}

export async function withdrawDocument(access, id) {
  const db = getDb();
  await db.transaction(async () => {
    await db.lock(LOCK_APPROVAL_DOCUMENT, toId(id));
    const doc = await documentRow(id);
    if (Number(doc.employee_id) !== Number(access.employee.id)) throw httpError('본인이 기안한 문서만 회수할 수 있습니다.', 403);
    if (doc.status !== 'pending') throw httpError('진행 중인 문서만 회수할 수 있습니다.', 409);
    const steps = await documentSteps(doc.id);
    if (steps.some((step) => step.status === 'approved')) {
      throw httpError('이미 승인한 결재자가 있어 회수할 수 없습니다. 결재자에게 반려를 요청하세요.', 409);
    }
    const now = kstStamp();
    await db
      .prepare(`UPDATE approval_document_steps SET status = 'skipped' WHERE document_id = ? AND status IN ('pending', 'waiting')`)
      .run(doc.id);
    await db
      .prepare(
        `UPDATE approval_documents SET status = 'withdrawn', current_step = NULL, completed_at = ?, updated_at = ? WHERE id = ?`
      )
      .run(now, now, doc.id);
    if (doc.form_key === 'certificate_issue') await certificateService.releaseRequest(db, doc.id, now);
  });
  return getDocument(access, id);
}

/* ───────────── 메일 ───────────── */

/** 진행 중 문서의 결재 요청 메일 받는 사람: 지금 단계에 지정한 사람(인사 단계는 인사담당 전원) */
export async function getPendingRecipients(id) {
  const doc = await documentRow(id);
  const step = currentStep(doc, await documentSteps(doc.id));
  const drafter = await employeeRow(doc.employee_id);
  if (!step || !drafter) return { kind: null, recipients: [] };
  return { kind: step.kind, recipients: await stepApprovers(drafter, step) };
}

async function notifyAfterChange(id, { rejectNote = '' } = {}) {
  if (!(await mailService.isMailEnabled())) return;
  const doc = await documentRow(id);
  const item = mapListItem(doc);
  const drafter = await employeeRow(doc.employee_id);
  if (doc.status === 'pending') {
    const steps = await documentSteps(doc.id);
    const { kind, recipients } = await getPendingRecipients(doc.id);
    const done = steps.filter((s) => s.status === 'approved').at(-1);
    await mailService.notifyDocumentPending(recipients, item, {
      kind,
      previous: done ? { name: done.actor_name, kind: done.kind } : null,
    });
    return;
  }
  if (doc.status === 'approved') {
    const refs = await getDb()
      .prepare(
        `SELECT e.* FROM approval_document_refs r JOIN employees e ON e.id = r.employee_id
         WHERE r.document_id = ? AND e.is_active = 1`
      )
      .all(doc.id);
    await mailService.notifyDocumentCompleted(drafter, item, refs);
    if (doc.form_key === 'certificate_issue') await certificateService.notifyIssuedFromDocument(doc);
    return;
  }
  if (doc.status === 'rejected') {
    const steps = await documentSteps(doc.id);
    const rejected = steps.find((step) => step.status === 'rejected');
    await mailService.notifyDocumentRejected(drafter, item, rejected?.actor_name || '', rejectNote || rejected?.comment || '', {
      kind: rejected?.kind,
    });
  }
}

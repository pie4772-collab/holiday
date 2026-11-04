import crypto from 'node:crypto';
import { getDb, LOCK_CERTIFICATE_NUMBER, LOCK_CERTIFICATE_REQUEST } from '../db.js';
import * as mailService from './mailService.js';
import { COMPANY_NAME } from '../../src/constants/evaluation.js';
import {
  CERT_CHANNEL_LABELS,
  CERT_ITEMS,
  CERT_REQUEST_STATUS_LABELS,
  CERT_STATUS_LABELS,
  CERT_TYPES,
  CERT_TYPE_KEYS,
  LEGAL_CLAIM_YEARS,
  REQUESTABLE_CERT_TYPES,
  SEAL_MAX_BYTES,
  certStatement,
  certTypeAllowed,
  maskName,
  serviceLength,
} from '../../src/constants/certificates.js';

const SETTINGS_KEY = 'certificate_settings';
const PURPOSE_MAX = 100;
const SUBMIT_TO_MAX = 100;
const REVOKE_REASON_MAX = 200;
/** 헷갈리는 글자(0·O·1·I)를 뺀 확인 코드 문자 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

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
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function isActiveRow(row) {
  return Boolean(Number(row?.is_active));
}

function dateOnly(value) {
  return text(value).slice(0, 10);
}

function yearsAfter(dateKey, years) {
  const [y, m, d] = dateKey.split('-');
  return `${Number(y) + years}-${m}-${d}`;
}

/* ───────────── 설정 ───────────── */

async function defaultCeoName() {
  const db = getDb();
  const seat = await db
    .prepare(
      `SELECT e.name FROM approval_seats s
       JOIN employees e ON e.id = s.employee_id
       WHERE s.seat_key = 'ceo' AND e.is_active = 1`
    )
    .get();
  if (seat?.name) return seat.name;
  const row = await db
    .prepare(`SELECT name FROM employees WHERE position = '대표이사' AND is_active = 1 ORDER BY id LIMIT 1`)
    .get();
  return row?.name || '';
}

export async function getSettings() {
  const row = await getDb().prepare('SELECT value FROM app_meta WHERE key = ?').get(SETTINGS_KEY);
  const raw = parseJson(row?.value, {}) || {};
  return {
    companyName: text(raw.companyName) || COMPANY_NAME,
    ceoName: text(raw.ceoName),
    ceoNameDefault: await defaultCeoName(),
    address: text(raw.address),
    phone: text(raw.phone),
    sealImage: typeof raw.sealImage === 'string' ? raw.sealImage : '',
  };
}

function cleanSeal(value) {
  const raw = text(value);
  if (!raw) return '';
  const match = raw.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw httpError('직인 이미지는 PNG 또는 JPG 파일만 올릴 수 있습니다.');
  if (Buffer.from(match[2], 'base64').length > SEAL_MAX_BYTES) {
    throw httpError(`직인 이미지는 ${Math.round(SEAL_MAX_BYTES / 1024)}KB 이하로 올려 주세요.`);
  }
  return raw;
}

export async function saveSettings(data = {}) {
  const value = {
    companyName: limited(data.companyName, 100, '회사명', { required: true }),
    ceoName: limited(data.ceoName, 50, '대표자'),
    address: limited(data.address, 200, '회사 주소'),
    phone: limited(data.phone, 50, '연락처'),
    sealImage: cleanSeal(data.sealImage),
  };
  await getDb()
    .prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(SETTINGS_KEY, JSON.stringify(value));
  return getSettings();
}

/* ───────────── 발급 ───────────── */

async function employeeRow(id) {
  return getDb()
    .prepare(
      `SELECT e.*, p.birth_date AS profile_birth_date, p.address AS profile_address
       FROM employees e
       LEFT JOIN employee_profiles p ON p.employee_id = e.id
       WHERE e.id = ?`
    )
    .get(toId(id));
}

/** 발급 요청을 검사합니다. 퇴직사유처럼 퇴직자만 쓰는 항목은 재직자 요청에서 뺍니다. */
export function cleanRequest(employee, data = {}) {
  const certType = text(data.certType);
  if (!CERT_TYPE_KEYS.includes(certType)) throw httpError('증명서 종류를 선택하세요.');
  const active = isActiveRow(employee);
  if (!certTypeAllowed(certType, active)) {
    throw httpError(
      active ? '퇴직증명서는 퇴직한 직원에게만 발급합니다.' : '퇴직한 직원에게는 재직증명서를 발급할 수 없습니다. 경력증명서나 퇴직증명서를 선택하세요.'
    );
  }
  const requested = new Set(Array.isArray(data.items) ? data.items.map(String) : []);
  const items = CERT_ITEMS.filter((item) => requested.has(item.key) && (!item.terminatedOnly || !active)).map(
    (item) => item.key
  );
  const values = {};
  for (const item of CERT_ITEMS) {
    if (item.input && items.includes(item.key)) {
      values[item.key] = limited(data[item.key], item.max, item.label, { required: true });
    }
  }
  return {
    certType,
    items,
    duty: values.duty || '',
    retireReason: values.retireReason || '',
    purpose: limited(data.purpose, PURPOSE_MAX, '용도', { required: true }),
    submitTo: limited(data.submitTo, SUBMIT_TO_MAX, '제출처'),
    showSeal: data.showSeal !== false,
  };
}

/** 발급 당시 기재 내용 사본. 요청한 항목만 담습니다. */
function buildContent(employee, request, settings, issueDate) {
  const active = isActiveRow(employee);
  const has = (key) => request.items.includes(key);
  const pick = (key, value, missing) => {
    if (!has(key)) return null;
    const raw = text(value);
    if (!raw) throw httpError(missing);
    return raw;
  };
  const hireDate = dateOnly(employee.hire_date);
  const endDate = active ? null : dateOnly(employee.terminated_date) || null;
  if (!active && !endDate) throw httpError('퇴사일이 없는 퇴직자입니다. 사원 정보에서 퇴사일을 먼저 입력하세요.');
  return {
    heading: CERT_TYPES[request.certType].heading,
    typeLabel: CERT_TYPES[request.certType].label,
    name: employee.name,
    empNo: employee.emp_no || '',
    birthDate: pick(
      'birthDate',
      dateOnly(employee.profile_birth_date),
      '인사기록카드에 생년월일이 없습니다. 생년월일 항목을 빼거나 인사기록카드에 먼저 입력하세요.'
    ),
    address: pick('address', employee.profile_address, '인사기록카드에 주소가 없습니다. 주소 항목을 빼거나 인사기록카드에 먼저 입력하세요.'),
    department: pick('department', employee.department, '사원 정보에 부서가 없어 소속을 적을 수 없습니다.'),
    position: pick('position', employee.position, '사원 정보에 직위가 없어 직위를 적을 수 없습니다.'),
    duty: has('duty') ? request.duty : null,
    retireReason: has('retireReason') ? request.retireReason : null,
    isActive: active,
    hireDate,
    endDate,
    serviceLength: serviceLength(hireDate, endDate || issueDate),
    purpose: request.purpose,
    submitTo: request.submitTo,
    statement: certStatement(request.certType, active),
    companyName: settings.companyName,
    ceoName: settings.ceoName || settings.ceoNameDefault,
    companyAddress: settings.address,
    companyPhone: settings.phone,
    issueDate,
  };
}

function newVerifyCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return code;
}

/** 신청·품의 전에 지금 정보로 발급할 수 있는지 미리 확인합니다. */
export async function checkRequest(employeeId, data) {
  const employee = await employeeRow(employeeId);
  if (!employee) throw httpError('직원을 찾을 수 없습니다.', 404);
  const request = cleanRequest(employee, data);
  buildContent(employee, request, await getSettings(), kstStamp().slice(0, 10));
  return request;
}

/** 발급번호를 매기고 대장에 남깁니다. 바깥 트랜잭션(전자결재 승인) 안에서도 부를 수 있습니다. */
export async function issueCertificate({ employeeId, data, channel, actor, documentId = null }) {
  const db = getDb();
  const employee = await employeeRow(employeeId);
  if (!employee) throw httpError('직원을 찾을 수 없습니다.', 404);
  const request = cleanRequest(employee, data);
  const issuedAt = kstStamp();
  const issueDate = issuedAt.slice(0, 10);
  const year = Number(issueDate.slice(0, 4));
  const content = buildContent(employee, request, await getSettings(), issueDate);
  let id = 0;
  await db.transaction(async () => {
    await db.lock(LOCK_CERTIFICATE_NUMBER, year);
    const max = await db.prepare('SELECT MAX(seq) AS m FROM certificates WHERE year = ?').get(year);
    const seq = (Number(max?.m) || 0) + 1;
    const result = await db
      .prepare(
        `INSERT INTO certificates (
           cert_type, employee_id, year, seq, cert_no, verify_code, purpose, submit_to, items, content,
           show_seal, channel, document_id, issued_by, issued_by_name, issued_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        request.certType,
        employee.id,
        year,
        seq,
        `${year}-${String(seq).padStart(4, '0')}`,
        newVerifyCode(),
        request.purpose,
        request.submitTo,
        JSON.stringify(request.items),
        JSON.stringify(content),
        request.showSeal ? 1 : 0,
        channel,
        documentId,
        toId(actor?.id) || null,
        actor?.name || null,
        issuedAt
      );
    id = Number(result.lastInsertRowid);
  });
  return id;
}

/* ───────────── 직원 신청 → 사업장 인사담당 접수 ───────────── */

function requestStateMessage(status) {
  if (status === 'processing') return '이미 내부 결재 중인 신청입니다.';
  if (status === 'issued') return '이미 발급된 신청입니다.';
  if (status === 'rejected') return '반려된 신청입니다.';
  if (status === 'cancelled') return '직원이 취소한 신청입니다.';
  return '처리할 수 없는 신청입니다.';
}

const REQUEST_SQL = `SELECT r.*, c.cert_no, d.status AS document_status, d.document_no,
    p.birth_date AS profile_birth_date, p.address AS profile_address, e.is_active AS employee_active
  FROM certificate_requests r
  JOIN employees e ON e.id = r.employee_id
  LEFT JOIN employee_profiles p ON p.employee_id = r.employee_id
  LEFT JOIN certificates c ON c.id = r.certificate_id
  LEFT JOIN approval_documents d ON d.id = r.document_id`;

function mapRequest(row) {
  return {
    id: Number(row.id),
    certType: row.cert_type,
    typeLabel: CERT_TYPES[row.cert_type]?.label || row.cert_type,
    request: { certType: row.cert_type, ...parseJson(row.request, {}) },
    employeeId: String(row.employee_id),
    employeeName: row.employee_name,
    workplace: row.workplace || '',
    department: row.department || '',
    position: row.position || '',
    status: row.status,
    statusLabel: CERT_REQUEST_STATUS_LABELS[row.status] || row.status,
    documentId: row.document_id ? Number(row.document_id) : null,
    documentNo: row.document_no || '',
    certificateId: row.certificate_id ? Number(row.certificate_id) : null,
    certNo: row.cert_no || '',
    handlerName: row.handler_name || '',
    rejectReason: row.reject_reason || '',
    requestedAt: row.requested_at,
    completedAt: row.completed_at || null,
    profile: {
      isActive: isActiveRow({ is_active: row.employee_active }),
      hasBirthDate: Boolean(text(row.profile_birth_date)),
      hasAddress: Boolean(text(row.profile_address)),
    },
  };
}

async function requestRow(id) {
  const row = await getDb().prepare(`${REQUEST_SQL} WHERE r.id = ?`).get(toId(id));
  if (!row) throw httpError('증명서 신청을 찾을 수 없습니다.', 404);
  return row;
}

function activeAdmins() {
  return getDb().prepare('SELECT * FROM employees WHERE is_active = 1 AND is_admin = 1 ORDER BY id').all();
}

function handlersFrom(admins, request) {
  const code = text(request?.workplace_code);
  const local = code ? admins.filter((emp) => text(emp.workplace_code) === code) : [];
  return (local.length ? local : admins).filter((emp) => Number(emp.id) !== Number(request?.employee_id));
}

/** 신청을 받을 사업장 인사담당: 신청자 사업장의 인사담당(시스템관리자·인사담당), 없으면 전체 인사담당 */
export async function listRequestHandlers(request) {
  return handlersFrom(await activeAdmins(), request);
}

export async function createRequest(employeeId, data = {}) {
  const db = getDb();
  const employee = await employeeRow(employeeId);
  if (!employee || !isActiveRow(employee)) throw httpError('직원을 찾을 수 없습니다.', 404);
  if (!REQUESTABLE_CERT_TYPES.includes(text(data.certType))) throw httpError('재직증명서 또는 경력증명서를 선택하세요.');
  const { certType, showSeal: _seal, ...request } = await checkRequest(employee.id, data);
  const now = kstStamp();
  const result = await db
    .prepare(
      `INSERT INTO certificate_requests (
         employee_id, cert_type, request, employee_name, workplace_code, workplace, department, position,
         status, requested_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)`
    )
    .run(
      employee.id,
      certType,
      JSON.stringify(request),
      employee.name,
      employee.workplace_code || null,
      employee.workplace || null,
      employee.department || null,
      employee.position || null,
      now,
      now
    );
  const row = await requestRow(result.lastInsertRowid);
  listRequestHandlers(row)
    .then((handlers) => mailService.notifyCertificateRequested(handlers, mapRequest(row)))
    .catch((error) => console.error('[certificates] notify failed:', error.message));
  return mapRequest(row);
}

export async function cancelRequest(employeeId, id) {
  const db = getDb();
  await db.transaction(async () => {
    await db.lock(LOCK_CERTIFICATE_REQUEST, toId(id));
    const row = await requestRow(id);
    if (Number(row.employee_id) !== Number(employeeId)) throw httpError('증명서 신청을 찾을 수 없습니다.', 404);
    if (row.status !== 'requested') throw httpError(`${requestStateMessage(row.status)} 취소할 수 없습니다.`, 409);
    const now = kstStamp();
    await db
      .prepare(`UPDATE certificate_requests SET status = 'cancelled', completed_at = ?, updated_at = ? WHERE id = ?`)
      .run(now, now, row.id);
  });
  return mapRequest(await requestRow(id));
}

/** 인사담당 접수함. status: open(접수 대기·결재 중, 기본)·all·상태 키, scope: mine 이면 내가 받는 사업장 신청만 */
export async function listRequests(access, filters = {}) {
  const where = [];
  const params = [];
  const status = text(filters.status) || 'open';
  if (status === 'open') where.push(`r.status IN ('requested', 'processing')`);
  else if (CERT_REQUEST_STATUS_LABELS[status]) {
    where.push('r.status = ?');
    params.push(status);
  }
  let rows = await getDb()
    .prepare(`${REQUEST_SQL}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY r.requested_at DESC, r.id DESC`)
    .all(...params);
  if (filters.scope === 'mine') {
    const admins = await activeAdmins();
    const me = Number(access.employee.id);
    rows = rows.filter((row) => handlersFrom(admins, row).some((emp) => Number(emp.id) === me));
  }
  return rows.map(mapRequest);
}

export async function getRequest(id) {
  return mapRequest(await requestRow(id));
}

/** 사업장 인사담당이 접수 대기 중인 신청 수 (왼쪽 메뉴 표시) */
export async function countOpenRequests(employeeId) {
  const employee = await employeeRow(employeeId);
  if (!employee?.is_active || !Number(employee.is_admin)) return 0;
  const rows = await getDb().prepare(`SELECT * FROM certificate_requests WHERE status = 'requested'`).all();
  if (!rows.length) return 0;
  const admins = await activeAdmins();
  return rows.filter((row) => handlersFrom(admins, row).some((emp) => Number(emp.id) === Number(employee.id))).length;
}

export async function rejectRequest(actor, id, reason) {
  const db = getDb();
  const cleanReason = limited(reason, REVOKE_REASON_MAX, '반려 사유', { required: true });
  await db.transaction(async () => {
    await db.lock(LOCK_CERTIFICATE_REQUEST, toId(id));
    const row = await requestRow(id);
    if (row.status !== 'requested') throw httpError(`${requestStateMessage(row.status)} 반려할 수 없습니다.`, 409);
    const now = kstStamp();
    await db
      .prepare(
        `UPDATE certificate_requests
         SET status = 'rejected', reject_reason = ?, handler_id = ?, handler_name = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(cleanReason, toId(actor?.id) || null, actor?.name || null, now, now, row.id);
  });
  const result = mapRequest(await requestRow(id));
  employeeRow(result.employeeId)
    .then((employee) => mailService.notifyCertificateRequestRejected(employee, result, actor?.name || '', cleanReason))
    .catch((error) => console.error('[certificates] notify failed:', error.message));
  return result;
}

/* ───────────── 관리팀 내부 결재("증명서 발급 품의")와 연결 ───────────── */

/**
 * 품의 본문을 만듭니다. 직원 신청(requestId)이면 대상자·증명서 종류는 신청대로 고정하고,
 * 인사담당이 직접 올리는 품의면 퇴직자를 포함해 대상자를 고릅니다.
 */
export async function prepareIssueDraft(data = {}) {
  const requestId = toId(data.requestId);
  let employeeId = toId(data.employeeId);
  let certType = text(data.certType);
  if (requestId) {
    const row = await requestRow(requestId);
    if (row.status !== 'requested') throw httpError(requestStateMessage(row.status), 409);
    employeeId = Number(row.employee_id);
    certType = row.cert_type;
  }
  if (!employeeId) throw httpError('발급할 직원을 선택하세요.');
  const request = await checkRequest(employeeId, { ...data, certType });
  const employee = await employeeRow(employeeId);
  return {
    ...request,
    employeeId,
    requestId: requestId || null,
    employeeName: employee.name,
    empNo: employee.emp_no || '',
    employeeDepartment: employee.department || '',
    employeePosition: employee.position || '',
    employeeActive: isActiveRow(employee),
  };
}

/** 품의를 올릴 때 신청을 "내부 결재 중"으로 잡습니다. 기안 트랜잭션 안에서 부릅니다. */
export async function claimRequest(db, requestId, documentId, drafter, now) {
  await db.lock(LOCK_CERTIFICATE_REQUEST, toId(requestId));
  const row = await db.prepare('SELECT * FROM certificate_requests WHERE id = ?').get(toId(requestId));
  if (!row) throw httpError('증명서 신청을 찾을 수 없습니다.', 404);
  if (row.status !== 'requested') throw httpError(requestStateMessage(row.status), 409);
  await db
    .prepare(
      `UPDATE certificate_requests
       SET status = 'processing', document_id = ?, handler_id = ?, handler_name = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(documentId, drafter.id, drafter.name, now, row.id);
}

/** 품의가 반려·회수되면 신청을 다시 접수 대기로 돌립니다. */
export async function releaseRequest(db, documentId, now) {
  await db
    .prepare(
      `UPDATE certificate_requests SET status = 'requested', document_id = NULL, updated_at = ?
       WHERE document_id = ? AND status = 'processing'`
    )
    .run(now, documentId);
}

/** 품의가 최종 승인되면 발급합니다. 발급자는 품의를 올린 인사담당입니다. */
export async function issueFromDocument(db, doc, drafter, now) {
  const body = parseJson(doc.body, {});
  const certificateId = await issueCertificate({
    employeeId: body.employeeId,
    data: body,
    channel: body.requestId ? 'approval' : 'admin',
    actor: drafter,
    documentId: doc.id,
  });
  if (body.requestId) {
    await db
      .prepare(
        `UPDATE certificate_requests SET status = 'issued', certificate_id = ?, completed_at = ?, updated_at = ?
         WHERE id = ? AND document_id = ?`
      )
      .run(certificateId, now, now, body.requestId, doc.id);
  }
  return certificateId;
}

/** 직원 신청으로 발급되었으면 신청한 직원에게 알립니다. */
export async function notifyIssuedFromDocument(doc) {
  const body = parseJson(doc.body, {});
  if (!body.requestId) return;
  const cert = await getDb()
    .prepare('SELECT cert_no, cert_type FROM certificates WHERE document_id = ? ORDER BY id DESC LIMIT 1')
    .get(doc.id);
  if (!cert) return;
  await mailService.notifyCertificateIssued(await employeeRow(body.employeeId), {
    typeLabel: CERT_TYPES[cert.cert_type]?.label || cert.cert_type,
    certNo: cert.cert_no,
  });
}

/* ───────────── 조회 ───────────── */

function mapCertificate(row, { withContent = false, seal = '' } = {}) {
  const content = parseJson(row.content, {});
  const issued = row.status === 'issued';
  return {
    id: Number(row.id),
    certType: row.cert_type,
    typeLabel: CERT_TYPES[row.cert_type]?.label || row.cert_type,
    certNo: row.cert_no,
    verifyCode: row.verify_code,
    employeeId: String(row.employee_id),
    employeeName: content.name || row.employee_name || '',
    empNo: content.empNo || row.emp_no || '',
    employeeActive: row.employee_active == null ? undefined : Boolean(Number(row.employee_active)),
    purpose: row.purpose,
    submitTo: row.submit_to || '',
    items: parseJson(row.items, []),
    showSeal: Boolean(Number(row.show_seal)),
    channel: row.channel,
    channelLabel: CERT_CHANNEL_LABELS[row.channel] || row.channel,
    documentId: row.document_id ? Number(row.document_id) : null,
    issuedByName: row.issued_by_name || '',
    issuedAt: row.issued_at,
    status: row.status,
    statusLabel: CERT_STATUS_LABELS[row.status] || row.status,
    revokedAt: row.revoked_at || null,
    revokedByName: row.revoked_by_name || '',
    revokeReason: row.revoke_reason || '',
    ...(withContent ? { content: issued ? content : null, sealImage: issued && Number(row.show_seal) ? seal : '' } : {}),
  };
}

const SELECT_SQL = `SELECT c.*, e.name AS employee_name, e.emp_no, e.is_active AS employee_active
  FROM certificates c JOIN employees e ON e.id = c.employee_id`;

async function certificateRow(id) {
  const row = await getDb().prepare(`${SELECT_SQL} WHERE c.id = ?`).get(toId(id));
  if (!row) throw httpError('증명서를 찾을 수 없습니다.', 404);
  return row;
}

async function getCertificateRecord(id) {
  const row = await certificateRow(id);
  return mapCertificate(row, { withContent: true, seal: (await getSettings()).sealImage });
}

/** 본인 증명서 또는 증명서 관리 권한자만 봅니다. */
export async function getCertificate(access, id) {
  const row = await certificateRow(id);
  if (Number(row.employee_id) !== Number(access.employee.id) && !access.has('certificates.manage')) {
    throw httpError('증명서를 찾을 수 없습니다.', 404);
  }
  return mapCertificate(row, { withContent: true, seal: (await getSettings()).sealImage });
}

export async function listMine(employeeId) {
  const db = getDb();
  const employee = await employeeRow(employeeId);
  if (!employee) throw httpError('직원을 찾을 수 없습니다.', 404);
  const rows = await db.prepare(`${SELECT_SQL} WHERE c.employee_id = ? ORDER BY c.issued_at DESC, c.id DESC`).all(employee.id);
  const requests = await db
    .prepare(`${REQUEST_SQL} WHERE r.employee_id = ? ORDER BY r.requested_at DESC, r.id DESC LIMIT 50`)
    .all(employee.id);
  const settings = await getSettings();
  return {
    companyName: settings.companyName,
    profile: {
      isActive: isActiveRow(employee),
      hasBirthDate: Boolean(text(employee.profile_birth_date)),
      hasAddress: Boolean(text(employee.profile_address)),
      department: employee.department || '',
      position: employee.position || '',
    },
    certificates: rows.map((row) => mapCertificate(row)),
    requests: requests.map((row) => {
      const { documentId: _doc, documentNo: _no, ...item } = mapRequest(row);
      return item;
    }),
  };
}

/** 발급 화면의 직원 선택 목록 (퇴직자 포함) */
export async function listIssueTargets() {
  const rows = await getDb()
    .prepare(
      `SELECT e.id, e.name, e.emp_no, e.department, e.position, e.workplace, e.hire_date, e.terminated_date, e.is_active,
              p.birth_date AS profile_birth_date, p.address AS profile_address
       FROM employees e
       LEFT JOIN employee_profiles p ON p.employee_id = e.id
       ORDER BY e.is_active DESC, e.name, e.id`
    )
    .all();
  const today = kstStamp().slice(0, 10);
  return rows.map((row) => {
    const terminatedDate = isActiveRow(row) ? null : dateOnly(row.terminated_date) || null;
    return {
      id: String(row.id),
      name: row.name,
      empNo: row.emp_no || '',
      department: row.department || '',
      position: row.position || '',
      workplace: row.workplace || '',
      hireDate: dateOnly(row.hire_date),
      terminatedDate,
      isActive: isActiveRow(row),
      hasBirthDate: Boolean(text(row.profile_birth_date)),
      hasAddress: Boolean(text(row.profile_address)),
      beyondLegalPeriod: Boolean(terminatedDate && yearsAfter(terminatedDate, LEGAL_CLAIM_YEARS) < today),
    };
  });
}

function registerFilter(filters = {}) {
  const where = [];
  const params = [];
  const year = Number(filters.year);
  if (Number.isInteger(year) && year > 2000) {
    where.push('c.year = ?');
    params.push(year);
  }
  if (CERT_TYPE_KEYS.includes(filters.type)) {
    where.push('c.cert_type = ?');
    params.push(filters.type);
  }
  if (filters.status === 'issued' || filters.status === 'revoked') {
    where.push('c.status = ?');
    params.push(filters.status);
  }
  return { sql: where.length ? ` WHERE ${where.join(' AND ')}` : '', params };
}

export async function listRegister(filters = {}) {
  const { sql, params } = registerFilter(filters);
  const rows = await getDb().prepare(`${SELECT_SQL}${sql} ORDER BY c.year DESC, c.seq DESC`).all(...params);
  const q = text(filters.q).toLowerCase();
  const items = rows.map((row) => mapCertificate(row));
  if (!q) return items;
  return items.filter((item) =>
    [item.employeeName, item.empNo, item.certNo, item.purpose, item.submitTo].some((v) => String(v).toLowerCase().includes(q))
  );
}

export async function exportRegister(filters = {}) {
  const items = await listRegister(filters);
  const itemLabels = Object.fromEntries(CERT_ITEMS.map((item) => [item.key, item.label]));
  return {
    filename: `certificates-${Number(filters.year) || 'all'}.csv`,
    headers: [
      '발급번호', '종류', '성명', '사번', '용도', '제출처', '기재 항목', '발급 경로', '발급자', '발급 일시',
      '상태', '취소 일시', '취소자', '취소 사유',
    ],
    rows: items.map((item) => [
      item.certNo,
      item.typeLabel,
      item.employeeName,
      item.empNo,
      item.purpose,
      item.submitTo,
      ['성명', '재직기간', ...item.items.map((key) => itemLabels[key] || key)].join(' · '),
      item.channelLabel,
      item.issuedByName,
      item.issuedAt,
      item.statusLabel,
      item.revokedAt || '',
      item.revokedByName,
      item.revokeReason,
    ]),
  };
}

export async function revokeCertificate(actor, id, reason) {
  const cleanReason = limited(reason, REVOKE_REASON_MAX, '취소 사유', { required: true });
  const db = getDb();
  const row = await certificateRow(id);
  if (row.status !== 'issued') throw httpError('이미 취소된 증명서입니다.', 409);
  await db
    .prepare(
      `UPDATE certificates
       SET status = 'revoked', revoked_at = ?, revoked_by = ?, revoked_by_name = ?, revoke_reason = ?
       WHERE id = ? AND status = 'issued'`
    )
    .run(kstStamp(), toId(actor?.id) || null, actor?.name || null, cleanReason, row.id);
  return getCertificateRecord(row.id);
}

/* ───────────── 진위 확인 (로그인 없이) ───────────── */

function normalizeCertNo(value) {
  const match = text(value).match(/(\d{4})\s*-\s*(\d{1,6})/);
  if (!match) return '';
  return `${match[1]}-${String(Number(match[2])).padStart(4, '0')}`;
}

function normalizeCode(value) {
  return text(value).toUpperCase().replace(/[\s-]/g, '');
}

function sameCode(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** 발급번호와 확인 코드가 모두 맞을 때만 가린 성명·종류·발급일을 돌려줍니다. */
export async function verifyCertificate(certNo, code) {
  const no = normalizeCertNo(certNo);
  const cleanCode = normalizeCode(code);
  if (!no || cleanCode.length !== CODE_LENGTH) throw httpError('발급번호와 8자리 확인 코드를 입력하세요.');
  const row = await getDb().prepare('SELECT * FROM certificates WHERE cert_no = ?').get(no);
  if (!row || !sameCode(row.verify_code, cleanCode)) throw httpError('일치하는 증명서가 없습니다. 발급번호와 확인 코드를 다시 확인하세요.', 404);
  const content = parseJson(row.content, {});
  return {
    certNo: row.cert_no,
    typeLabel: CERT_TYPES[row.cert_type]?.label || row.cert_type,
    maskedName: maskName(content.name),
    issueDate: dateOnly(row.issued_at),
    companyName: content.companyName || '',
    status: row.status,
    revokedAt: row.revoked_at ? dateOnly(row.revoked_at) : null,
  };
}

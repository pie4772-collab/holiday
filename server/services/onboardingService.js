import { getDb } from '../db.js';
import * as mailService from './mailService.js';
import * as personnelService from './personnelService.js';
import { getSettings as getCertificateSettings } from './certificateService.js';
import { DOCUMENT_MAX_BYTES } from '../../src/constants/personnel.js';
import {
  EMPLOYEE_INPUTS,
  INSURANCES,
  ONBOARDING_KINDS,
  onboardingForm,
  toAmount,
} from '../../src/constants/onboarding.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const AMOUNT_MAX = 10_000_000_000;

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

function parseJson(value, fallback) {
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
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

function stamp() {
  return kstStampFormat.format(new Date());
}

function limited(value, max, label, { required = false } = {}) {
  const raw = text(value);
  if (required && !raw) throw httpError(`${label}을(를) 입력하세요.`);
  if (raw.length > max) throw httpError(`${label}은(는) ${max}자 이내로 입력하세요.`);
  return raw;
}

function dateKey(value, label, { required = false } = {}) {
  const raw = text(value);
  if (!raw) {
    if (required) throw httpError(`${label}을(를) 입력하세요.`);
    return '';
  }
  const date = personnelService.normalizeDate(raw);
  if (!date) throw httpError(`${label} 날짜 형식이 올바르지 않습니다.`);
  return date;
}

function time(value, label) {
  const raw = text(value);
  if (!TIME_RE.test(raw)) throw httpError(`${label}은(는) 00:00 형식으로 입력하세요.`);
  return raw;
}

function amount(value, label, { required = false } = {}) {
  const n = toAmount(value);
  if (required && n <= 0) throw httpError(`${label}을(를) 입력하세요.`);
  if (n < 0 || n > AMOUNT_MAX) throw httpError(`${label} 금액을 확인하세요.`);
  return n;
}

/** 인사담당이 채우는 계약 조건·임금. 작성 요청 당시 내용 그대로 서류에 찍힙니다. */
function cleanCompany(kind, data = {}, employee) {
  if (kind === 'contract') {
    const startDate = dateKey(data.startDate, '근로계약 시작일', { required: true });
    const endDate = dateKey(data.endDate, '근로계약 종료일');
    if (endDate && endDate < startDate) throw httpError('근로계약 종료일이 시작일보다 빠릅니다.');
    return {
      startDate,
      endDate,
      contractDate: dateKey(data.contractDate, '계약일', { required: true }),
      workplace: limited(data.workplace, 200, '근무장소', { required: true }),
      duty: limited(data.duty, 200, '업무의 내용', { required: true }),
      workStart: time(data.workStart, '근로 시작 시각'),
      workEnd: time(data.workEnd, '근로 종료 시각'),
      breakStart: time(data.breakStart, '휴게 시작 시각'),
      breakEnd: time(data.breakEnd, '휴게 종료 시각'),
      workDays: limited(data.workDays, 200, '근무일/휴일', { required: true }),
      wageTerms: limited(data.wageTerms, 1000, '임금 조건', { required: true }),
      probation: limited(data.probation, 500, '수습기간'),
      insurance: Object.fromEntries(INSURANCES.map((i) => [i.key, Boolean(data.insurance?.[i.key])])),
    };
  }
  if (kind === 'wage') {
    return {
      category: limited(data.category, 50, '구분') || '신규입사',
      period: limited(data.period, 50, '적용기간', { required: true }),
      noticeDate: dateKey(data.noticeDate, '통지일', { required: true }),
      workplace: limited(data.workplace, 50, '사업장'),
      rank: limited(data.rank, 50, '직급'),
      department: limited(data.department, 50, '부서'),
      hireDate: employee.hire_date || '',
      basePay: amount(data.basePay, '기본급', { required: true }),
      allowance: amount(data.allowance, '제수당'),
      monthlyBonus: amount(data.monthlyBonus, '월상여'),
    };
  }
  if (kind === 'ethics') {
    return {
      department: limited(data.department, 50, '소속'),
      rank: limited(data.rank, 50, '직위'),
    };
  }
  return {};
}

async function employeeRow(employeeId) {
  return getDb().prepare('SELECT * FROM employees WHERE id = ?').get(toId(employeeId));
}

function mapForm(row) {
  const form = onboardingForm(row.kind);
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    kind: row.kind,
    label: form?.label || row.kind,
    docType: form?.docType || '',
    status: row.status,
    company: parseJson(row.company_json, {}),
    employeeInput: parseJson(row.employee_json, {}),
    documentId: row.document_id ? String(row.document_id) : null,
    requestedBy: row.requested_by_name || '',
    requestedAt: row.requested_at,
    signedAt: row.signed_at || null,
    cancelledAt: row.cancelled_at || null,
  };
}

const FORM_ORDER = `CASE kind WHEN 'contract' THEN 1 WHEN 'wage' THEN 2 WHEN 'pledge' THEN 3 ELSE 4 END`;

/** 서류에 찍는 회사 정보. 직인은 증명서 설정의 직인 이미지를 씁니다. */
async function companyInfo(withSeal) {
  const settings = await getCertificateSettings();
  return {
    companyName: settings.companyName,
    ceoName: settings.ceoName || settings.ceoNameDefault,
    address: settings.address,
    phone: settings.phone,
    sealImage: withSeal ? settings.sealImage : '',
  };
}

/** 인사기록카드 화면: 요청 내역과 미리보기에 쓸 회사 정보. */
export async function listForEmployee(employeeId) {
  const employee = await employeeRow(employeeId);
  if (!employee) throw httpError('직원을 찾을 수 없습니다.', 404);
  const rows = await getDb()
    .prepare(`SELECT * FROM onboarding_forms WHERE employee_id = ? ORDER BY id DESC`)
    .all(employee.id);
  return { forms: rows.map(mapForm), company: await companyInfo(true) };
}

/** 같은 양식의 작성 대기 요청이 있으면 내용을 바꿔 다시 보냅니다. */
export async function createRequests(employeeId, data, actor) {
  const employee = await employeeRow(employeeId);
  if (!employee) throw httpError('직원을 찾을 수 없습니다.', 404);
  if (!Number(employee.is_active)) throw httpError('퇴사한 직원에게는 작성 요청을 보낼 수 없습니다.');
  const forms = Array.isArray(data?.forms) ? data.forms : [];
  if (!forms.length) throw httpError('작성 요청할 서류를 하나 이상 고르세요.');
  const kinds = forms.map((f) => text(f?.kind));
  if (kinds.some((k) => !ONBOARDING_KINDS.includes(k))) throw httpError('서류 종류를 확인하세요.');
  if (new Set(kinds).size !== kinds.length) throw httpError('같은 서류를 두 번 고를 수 없습니다.');
  const cleaned = forms.map((f, i) => ({ kind: kinds[i], company: cleanCompany(kinds[i], f.data, employee) }));

  const now = stamp();
  const actorId = toId(actor?.id) || null;
  const db = getDb();
  await db.transaction(async () => {
    for (const { kind, company } of cleaned) {
      const json = JSON.stringify(company);
      const open = await db
        .prepare(`SELECT id FROM onboarding_forms WHERE employee_id = ? AND kind = ? AND status = 'requested'`)
        .get(employee.id, kind);
      if (open) {
        await db
          .prepare(
            `UPDATE onboarding_forms SET company_json = ?, requested_by = ?, requested_by_name = ?, requested_at = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(json, actorId, actor?.name || null, now, now, open.id);
      } else {
        await db
          .prepare(
            `INSERT INTO onboarding_forms
               (employee_id, kind, status, company_json, requested_by, requested_by_name, requested_at, updated_at)
             VALUES (?, ?, 'requested', ?, ?, ?, ?, ?)`
          )
          .run(employee.id, kind, json, actorId, actor?.name || null, now, now);
      }
    }
  });

  mailService.notifyOnboardingRequested(
    { name: employee.name, email: employee.email },
    cleaned.map((c) => onboardingForm(c.kind).label)
  );
  return listForEmployee(employee.id);
}

export async function cancelRequest(id) {
  const row = await getDb().prepare('SELECT * FROM onboarding_forms WHERE id = ?').get(toId(id));
  if (!row) throw httpError('작성 요청을 찾을 수 없습니다.', 404);
  if (row.status !== 'requested') throw httpError('작성 대기 중인 요청만 취소할 수 있습니다.', 409);
  const now = stamp();
  await getDb()
    .prepare(`UPDATE onboarding_forms SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ? AND status = 'requested'`)
    .run(now, now, row.id);
  return mapForm(await getDb().prepare('SELECT * FROM onboarding_forms WHERE id = ?').get(row.id));
}

/** tasks: 작성할 서류 수, total: 받은(취소 제외) 서류 수 — 메뉴를 보일지 정합니다. */
export async function summary(employeeId) {
  const row = await getDb()
    .prepare(
      `SELECT SUM(CASE WHEN status = 'requested' THEN 1 ELSE 0 END) AS tasks, COUNT(*) AS total
       FROM onboarding_forms WHERE employee_id = ? AND status <> 'cancelled'`
    )
    .get(toId(employeeId));
  return { tasks: Number(row?.tasks || 0), total: Number(row?.total || 0) };
}

/** 입사자 본인 화면: 받은 요청과 서류에 찍을 회사·본인 정보. */
export async function listMine(employeeId) {
  const employee = await employeeRow(employeeId);
  if (!employee) throw httpError('직원을 찾을 수 없습니다.', 404);
  const db = getDb();
  const rows = await db
    .prepare(`SELECT * FROM onboarding_forms WHERE employee_id = ? AND status <> 'cancelled' ORDER BY ${FORM_ORDER}, id DESC`)
    .all(employee.id);
  const profile = await db.prepare('SELECT address, mobile_phone FROM employee_profiles WHERE employee_id = ?').get(employee.id);
  const forms = rows.map(mapForm);
  return {
    forms,
    company: await companyInfo(forms.some((f) => f.status === 'requested' && onboardingForm(f.kind)?.seal)),
    employee: {
      name: employee.name,
      department: employee.department || '',
      workplace: employee.workplace || '',
      jobRank: employee.job_rank || '',
      position: employee.position || '',
      hireDate: employee.hire_date || '',
      address: profile?.address || '',
      phone: profile?.mobile_phone || '',
    },
  };
}

function isPdf(content) {
  return Buffer.isBuffer(content) && content.length > 5 && content.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * 입사자가 동의·서명한 완성본(PDF)을 받아 인사기록카드 증명서류에 저장합니다.
 * PDF는 화면에서 서명을 넣어 만든 것이며, 서버는 형식과 크기만 확인합니다.
 */
export async function submit(employeeId, id, { agreed, address, phone, content }) {
  const db = getDb();
  const row = await db.prepare('SELECT * FROM onboarding_forms WHERE id = ?').get(toId(id));
  if (!row || String(row.employee_id) !== String(toId(employeeId))) throw httpError('작성 요청을 찾을 수 없습니다.', 404);
  if (row.status !== 'requested') throw httpError('이미 작성했거나 취소된 요청입니다.', 409);
  if (!['1', 'true', true].includes(agreed)) throw httpError('내용에 동의해야 제출할 수 있습니다.');
  const inputs = EMPLOYEE_INPUTS[row.kind] || [];
  const employeeInput = {};
  if (inputs.includes('address')) employeeInput.address = limited(address, 200, '주소', { required: true });
  if (inputs.includes('phone')) employeeInput.phone = limited(phone, 30, '연락처', { required: true });
  if (!isPdf(content)) throw httpError('서명한 서류(PDF)를 만들지 못했습니다. 다시 시도하세요.');
  if (content.length > DOCUMENT_MAX_BYTES) throw httpError('서류 파일이 너무 큽니다.', 413);

  const employee = await employeeRow(row.employee_id);
  const now = stamp();
  employeeInput.name = employee.name;
  const claimed = await db
    .prepare(
      `UPDATE onboarding_forms SET status = 'signed', employee_json = ?, signed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'requested'`
    )
    .run(JSON.stringify(employeeInput), now, now, row.id);
  if (!claimed.changes) throw httpError('이미 작성했거나 취소된 요청입니다.', 409);

  const form = onboardingForm(row.kind);
  let document;
  try {
    document = await personnelService.createDocument(
      employee.id,
      {
        docType: form.docType,
        fileName: `${form.docType}_${employee.name}_${now.slice(0, 10)}.pdf`,
        notes: `입사 서류 전자 작성 · ${now.slice(0, 16)} 본인 동의·서명`,
        content,
      },
      employee.id
    );
  } catch (error) {
    await db
      .prepare(`UPDATE onboarding_forms SET status = 'requested', employee_json = NULL, signed_at = NULL, updated_at = ? WHERE id = ?`)
      .run(stamp(), row.id);
    throw error;
  }
  await db.prepare('UPDATE onboarding_forms SET document_id = ? WHERE id = ?').run(Number(document.id), row.id);
  await fillProfile(employee.id, employeeInput);

  if (row.requested_by) {
    const requester = await employeeRow(row.requested_by);
    if (requester) {
      mailService.notifyOnboardingSigned({ name: requester.name, email: requester.email }, employee, form.label);
    }
  }
  return mapForm(await db.prepare('SELECT * FROM onboarding_forms WHERE id = ?').get(row.id));
}

/** 인사기록카드의 주소·휴대전화가 비어 있으면 입사자가 서류에 적은 값으로 채웁니다. */
async function fillProfile(employeeId, { address, phone }) {
  const profile = await getDb()
    .prepare('SELECT address, mobile_phone FROM employee_profiles WHERE employee_id = ?')
    .get(employeeId);
  const values = {};
  if (address && !profile?.address) values.address = address;
  if (phone && !profile?.mobile_phone) values.mobilePhone = phone;
  if (!Object.keys(values).length) return;
  try {
    await personnelService.saveProfile(employeeId, values, employeeId);
  } catch (error) {
    console.error('[onboarding] profile fill skipped:', error.message);
  }
}

/** 본인이 작성한 서류 사본을 내려받습니다. */
export async function getMyFile(employeeId, id) {
  const row = await getDb().prepare('SELECT * FROM onboarding_forms WHERE id = ?').get(toId(id));
  if (!row || String(row.employee_id) !== String(toId(employeeId))) throw httpError('서류를 찾을 수 없습니다.', 404);
  if (row.status !== 'signed') throw httpError('아직 작성하지 않은 서류입니다.', 409);
  const missing = () => httpError('보관된 서류 파일이 없습니다. 인사담당에게 문의하세요.', 404);
  if (!row.document_id) throw missing();
  try {
    return await personnelService.getDocumentFile(row.document_id);
  } catch (error) {
    if (error.status === 404) throw missing();
    throw error;
  }
}

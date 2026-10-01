import { createHash } from 'node:crypto';
import { getDb } from '../db.js';
import { decryptBytes, encryptBytes } from '../secrets.js';
import { validateUpload } from '../utils/fileUpload.js';
import {
  DOCUMENT_EXTENSIONS,
  DOCUMENT_PREVIEW_EXTENSIONS,
  DOCUMENT_TYPES,
  PROFILE_FIELDS,
  RECORD_CATEGORIES,
  RECORD_CATEGORY_KEYS,
  RECORD_CSV_LABELS,
  RECORD_FIELDS,
  SELF_HIDDEN_CATEGORIES,
} from '../../src/constants/personnel.js';

const MAX_TEXT = 200;
const MAX_LONG_TEXT = 2000;
const LONG_FIELDS = new Set(['address', 'militaryNotes', 'detail', 'notes']);

const PROFILE_COLUMNS = Object.fromEntries(
  PROFILE_FIELDS.map((f) => [f.key, f.key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`)])
);
const RECORD_COLUMNS = {
  startDate: 'start_date',
  endDate: 'end_date',
  title: 'title',
  organization: 'organization',
  result: 'result',
  detail: 'detail',
  notes: 'notes',
};

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * 날짜를 YYYY-MM-DD 로 맞춥니다. 2024.3.2, 20240302, 2024/03/02 도 받습니다.
 * allowPartial 이면 YYYY, YYYY-MM 도 허용합니다(학력·경력 연월).
 */
export function normalizeDate(value, { allowPartial = false } = {}) {
  const raw = text(value);
  if (!raw) return '';
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  const parts = compact ? compact.slice(1) : raw.split(/[-./\s]+/).filter(Boolean);
  if (!parts.length || parts.length > 3 || !parts.every((p) => /^\d+$/.test(p))) return null;
  const [y, m, d] = parts.map(Number);
  if (y < 1900 || y > 2100) return null;
  if (parts.length < 3 && !allowPartial) return null;
  if (m !== undefined && (m < 1 || m > 12)) return null;
  if (d !== undefined) {
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  }
  return [String(y), m && String(m).padStart(2, '0'), d && String(d).padStart(2, '0')].filter(Boolean).join('-');
}

function cleanValue(key, value, label, { partialDate = false, isDate = false, options = null } = {}) {
  const raw = text(value);
  if (isDate) {
    const date = normalizeDate(raw, { allowPartial: partialDate });
    if (date === null) throw httpError(`${label}: 날짜 형식이 올바르지 않습니다 (${raw}).`);
    return date || null;
  }
  const max = LONG_FIELDS.has(key) ? MAX_LONG_TEXT : MAX_TEXT;
  if (raw.length > max) throw httpError(`${label}: ${max}자 이하로 입력하세요.`);
  if (raw && options && !options.includes(raw)) {
    throw httpError(`${label}: ${options.join('·')} 중 하나로 입력하세요 (${raw}).`);
  }
  return raw || null;
}

function mapProfileRow(row) {
  const profile = {};
  for (const field of PROFILE_FIELDS) profile[field.key] = row?.[PROFILE_COLUMNS[field.key]] || '';
  profile.updatedAt = row?.updated_at || null;
  return profile;
}

function mapRecordRow(row) {
  const record = { id: String(row.id), category: row.category };
  for (const key of RECORD_FIELDS) record[key] = row[RECORD_COLUMNS[key]] || '';
  record.updatedAt = row.updated_at;
  return record;
}

function mapEmployeeBasics(row) {
  return {
    id: String(row.id),
    empNo: row.emp_no || '',
    name: row.name,
    workplace: row.workplace || '',
    department: row.department || '',
    position: row.position || '',
    concurrentDept: row.concurrent_dept || '',
    concurrentPosition: row.concurrent_position || '',
    jobType: row.job_type || '',
    hireDate: row.hire_date,
    terminatedDate: row.terminated_date || null,
    isActive: Boolean(row.is_active),
    email: row.email || '',
  };
}

function cleanProfile(data) {
  const out = {};
  for (const field of PROFILE_FIELDS) {
    if (!(field.key in (data || {}))) continue;
    out[field.key] = cleanValue(field.key, data[field.key], field.label, {
      isDate: field.type === 'date',
      options: field.options,
    });
  }
  return out;
}

function cleanRecord(data) {
  const category = text(data?.category);
  if (!RECORD_CATEGORY_KEYS.includes(category)) throw httpError('이력 구분을 확인하세요.');
  const def = RECORD_CATEGORIES.find((c) => c.key === category);
  const out = { category };
  for (const key of RECORD_FIELDS) {
    out[key] = cleanValue(key, data?.[key], def.fields[key] || RECORD_CSV_LABELS[key], {
      isDate: key === 'startDate' || key === 'endDate',
      partialDate: true,
    });
  }
  if (!out.title && !out.organization) {
    throw httpError(`${def.label}: ${def.fields.title || '명칭'} 또는 ${def.fields.organization || '기관'}을 입력하세요.`);
  }
  if (out.startDate && out.endDate && out.endDate < out.startDate) {
    throw httpError(`${def.label}: 종료일이 시작일보다 빠릅니다.`);
  }
  return out;
}

async function getEmployee(employeeId) {
  const row = await getDb().prepare('SELECT * FROM employees WHERE id = ?').get(Number(employeeId));
  if (!row) throw httpError('직원을 찾을 수 없습니다.', 404);
  return row;
}

export async function getPersonnelCard(employeeId, { self = false } = {}) {
  const employee = await getEmployee(employeeId);
  const db = getDb();
  const profile = await db.prepare('SELECT * FROM employee_profiles WHERE employee_id = ?').get(employee.id);
  const rows = await db
    .prepare(
      `SELECT * FROM employee_records WHERE employee_id = ?
       ORDER BY category, COALESCE(start_date, '') DESC, id DESC`
    )
    .all(employee.id);

  const hidden = self ? SELF_HIDDEN_CATEGORIES : [];
  const records = {};
  for (const key of RECORD_CATEGORY_KEYS) if (!hidden.includes(key)) records[key] = [];
  for (const row of rows) {
    if (records[row.category]) records[row.category].push(mapRecordRow(row));
  }

  return { employee: mapEmployeeBasics(employee), profile: mapProfileRow(profile), records };
}

async function upsertProfile(employeeId, values, actorId) {
  const db = getDb();
  const existing = await db.prepare('SELECT * FROM employee_profiles WHERE employee_id = ?').get(employeeId);
  const merged = { ...mapProfileRow(existing), ...values };
  const keys = PROFILE_FIELDS.map((f) => f.key);
  const columns = keys.map((k) => PROFILE_COLUMNS[k]);
  await db
    .prepare(
      `INSERT INTO employee_profiles (employee_id, ${columns.join(', ')}, updated_by, updated_at)
       VALUES (?, ${columns.map(() => '?').join(', ')}, ?, datetime('now', 'localtime'))
       ON CONFLICT(employee_id) DO UPDATE SET
         ${columns.map((c) => `${c} = excluded.${c}`).join(',\n         ')},
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`
    )
    .run(employeeId, ...keys.map((k) => merged[k] || null), actorId ? Number(actorId) : null);
}

export async function saveProfile(employeeId, data, actorId) {
  const employee = await getEmployee(employeeId);
  await upsertProfile(employee.id, cleanProfile(data), actorId);
  return getPersonnelCard(employee.id);
}

async function insertRecord(employeeId, record, actorId) {
  const columns = RECORD_FIELDS.map((k) => RECORD_COLUMNS[k]);
  const result = await getDb()
    .prepare(
      `INSERT INTO employee_records (employee_id, category, ${columns.join(', ')}, updated_by)
       VALUES (?, ?, ${columns.map(() => '?').join(', ')}, ?)`
    )
    .run(employeeId, record.category, ...RECORD_FIELDS.map((k) => record[k]), actorId ? Number(actorId) : null);
  return result.lastInsertRowid;
}

async function writeRecord(id, record, actorId) {
  await getDb()
    .prepare(
      `UPDATE employee_records
       SET category = ?, ${RECORD_FIELDS.map((k) => `${RECORD_COLUMNS[k]} = ?`).join(', ')},
           updated_by = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`
    )
    .run(record.category, ...RECORD_FIELDS.map((k) => record[k]), actorId ? Number(actorId) : null, Number(id));
}

export async function createRecord(employeeId, data, actorId) {
  const employee = await getEmployee(employeeId);
  const id = await insertRecord(employee.id, cleanRecord(data), actorId);
  return mapRecordRow(await getDb().prepare('SELECT * FROM employee_records WHERE id = ?').get(id));
}

export async function updateRecord(id, data, actorId) {
  const row = await getDb().prepare('SELECT * FROM employee_records WHERE id = ?').get(Number(id));
  if (!row) throw httpError('이력을 찾을 수 없습니다.', 404);
  await writeRecord(row.id, cleanRecord({ category: row.category, ...data }), actorId);
  return mapRecordRow(await getDb().prepare('SELECT * FROM employee_records WHERE id = ?').get(row.id));
}

export async function deleteRecord(id) {
  const result = await getDb().prepare('DELETE FROM employee_records WHERE id = ?').run(Number(id));
  if (!result.changes) throw httpError('이력을 찾을 수 없습니다.', 404);
}

// ----- 입사 증명서류 -----

function mapDocumentRow(row) {
  return {
    id: String(row.id),
    docType: row.doc_type,
    fileName: row.file_name,
    extension: row.extension,
    sizeBytes: Number(row.size_bytes),
    notes: row.notes || '',
    uploadedBy: row.uploader_name || '',
    createdAt: row.created_at,
    previewable: DOCUMENT_PREVIEW_EXTENSIONS.includes(row.extension),
  };
}

const DOCUMENT_LIST_SQL = `
  SELECT d.id, d.employee_id, d.doc_type, d.file_name, d.extension, d.size_bytes, d.notes, d.created_at,
         u.name AS uploader_name
  FROM employee_documents d
  LEFT JOIN employees u ON u.id = d.uploaded_by`;

export async function listDocuments(employeeId) {
  const employee = await getEmployee(employeeId);
  const rows = await getDb()
    .prepare(`${DOCUMENT_LIST_SQL} WHERE d.employee_id = ? ORDER BY d.id DESC`)
    .all(employee.id);
  return rows.map(mapDocumentRow);
}

/** 파일 내용(Buffer)을 암호화해 저장합니다. */
export async function createDocument(employeeId, { docType, fileName, notes, content }, actorId) {
  const employee = await getEmployee(employeeId);
  const type = text(docType);
  if (!DOCUMENT_TYPES.includes(type)) throw httpError('서류 종류를 선택하세요.');
  const { name, extension } = validateUpload(fileName, content);
  const memo = cleanValue('notes', notes, '메모');
  const result = await getDb()
    .prepare(
      `INSERT INTO employee_documents
         (employee_id, doc_type, file_name, extension, size_bytes, sha256, notes, content, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      employee.id,
      type,
      name,
      extension,
      content.length,
      createHash('sha256').update(content).digest('hex'),
      memo,
      encryptBytes(content),
      actorId ? Number(actorId) : null
    );
  const row = await getDb().prepare(`${DOCUMENT_LIST_SQL} WHERE d.id = ?`).get(result.lastInsertRowid);
  return mapDocumentRow(row);
}

/** 내려받기용으로 복호화한 파일을 돌려줍니다. */
export async function getDocumentFile(id) {
  const row = await getDb().prepare('SELECT * FROM employee_documents WHERE id = ?').get(Number(id));
  if (!row) throw httpError('서류를 찾을 수 없습니다.', 404);
  const content = decryptBytes(row.content);
  if (!content) throw httpError('서류를 복호화하지 못했습니다. 비밀 키가 바뀌었는지 확인하세요.', 500);
  return {
    fileName: row.file_name,
    contentType: DOCUMENT_EXTENSIONS[row.extension] || 'application/octet-stream',
    previewable: DOCUMENT_PREVIEW_EXTENSIONS.includes(row.extension),
    content,
  };
}

export async function deleteDocument(id) {
  const result = await getDb().prepare('DELETE FROM employee_documents WHERE id = ?').run(Number(id));
  if (!result.changes) throw httpError('서류를 찾을 수 없습니다.', 404);
}

// ----- CSV 내려받기(양식 겸 현재 데이터)·올리기 -----

const PROFILE_CSV_HEADERS = ['사번', '이름', ...PROFILE_FIELDS.map((f) => f.label)];
const RECORD_CSV_HEADERS = ['사번', '이름', '구분', ...RECORD_FIELDS.map((k) => RECORD_CSV_LABELS[k]), 'ID'];

function headerKey(value) {
  return text(value).replace(/\s+/g, '').toLowerCase();
}

function categoryFromLabel(value) {
  const key = headerKey(value);
  const found = RECORD_CATEGORIES.find(
    (c) => c.key === key || c.aliases.some((alias) => headerKey(alias) === key)
  );
  return found?.key || null;
}

export async function exportPersonnel(type) {
  const db = getDb();
  const employees = await db.prepare('SELECT * FROM employees ORDER BY is_active DESC, emp_no, id').all();
  if (type === 'records') {
    const byId = new Map(employees.map((e) => [Number(e.id), e]));
    const rows = await db
      .prepare(`SELECT * FROM employee_records ORDER BY employee_id, category, COALESCE(start_date, ''), id`)
      .all();
    return {
      headers: RECORD_CSV_HEADERS,
      rows: rows
        .filter((row) => byId.has(Number(row.employee_id)))
        .map((row) => {
          const emp = byId.get(Number(row.employee_id));
          const label = RECORD_CATEGORIES.find((c) => c.key === row.category)?.label || row.category;
          return [emp.emp_no || '', emp.name, label, ...RECORD_FIELDS.map((k) => row[RECORD_COLUMNS[k]] || ''), String(row.id)];
        }),
    };
  }
  const profiles = new Map(
    (await db.prepare('SELECT * FROM employee_profiles').all()).map((row) => [Number(row.employee_id), row])
  );
  return {
    headers: PROFILE_CSV_HEADERS,
    rows: employees
      .filter((emp) => emp.emp_no)
      .map((emp) => {
        const profile = mapProfileRow(profiles.get(Number(emp.id)));
        return [emp.emp_no, emp.name, ...PROFILE_FIELDS.map((f) => profile[f.key])];
      }),
  };
}

function indexHeaders(headerRow, labels) {
  const index = {};
  headerRow.forEach((cell, i) => {
    const key = headerKey(cell);
    for (const [field, label] of Object.entries(labels)) {
      if (headerKey(label) === key && index[field] === undefined) index[field] = i;
    }
  });
  return index;
}

async function employeesByEmpNo() {
  const rows = await getDb().prepare('SELECT id, emp_no FROM employees WHERE emp_no IS NOT NULL').all();
  return new Map(rows.map((row) => [text(row.emp_no), Number(row.id)]));
}

/**
 * CSV(첫 행 머리글)를 반영합니다. 한 줄이라도 오류가 있으면 아무것도 반영하지 않고 오류 목록을 돌려줍니다.
 * - profiles: 사번 기준으로 기본정보·병역을 덮어씁니다. 머리글에 없는 항목은 그대로 둡니다.
 * - records: ID가 있으면 그 이력을 고치고, 없으면 추가합니다. 똑같은 이력이 이미 있으면 건너뜁니다.
 */
export async function importPersonnel(type, table, actorId) {
  if (!Array.isArray(table) || table.length < 2) throw httpError('CSV에 데이터 행이 없습니다.');
  const [headerRow, ...dataRows] = table.map((row) => (Array.isArray(row) ? row : []));
  const empIds = await employeesByEmpNo();
  const errors = [];
  const planned = [];

  if (type === 'profiles') {
    const labels = Object.fromEntries([['empNo', '사번'], ...PROFILE_FIELDS.map((f) => [f.key, f.label])]);
    const index = indexHeaders(headerRow, labels);
    if (index.empNo === undefined) throw httpError('CSV에 사번 열이 필요합니다.');
    const present = PROFILE_FIELDS.filter((f) => index[f.key] !== undefined);
    if (!present.length) throw httpError('반영할 항목 열이 없습니다. 내려받은 양식의 머리글을 그대로 쓰세요.');
    const seen = new Set();
    dataRows.forEach((row, i) => {
      const line = i + 2;
      const empNo = text(row[index.empNo]);
      try {
        if (!empNo) throw httpError('사번이 비어 있습니다.');
        const employeeId = empIds.get(empNo);
        if (!employeeId) throw httpError(`없는 사번입니다 (${empNo}).`);
        if (seen.has(empNo)) throw httpError(`같은 사번이 두 번 있습니다 (${empNo}).`);
        seen.add(empNo);
        const values = cleanProfile(Object.fromEntries(present.map((f) => [f.key, row[index[f.key]]])));
        planned.push({ employeeId, values });
      } catch (error) {
        errors.push({ line, message: error.message });
      }
    });
    if (errors.length) return { applied: false, errors };
    await getDb().transaction(async () => {
      for (const item of planned) await upsertProfile(item.employeeId, item.values, actorId);
    });
    return { applied: true, updated: planned.length, inserted: 0, skipped: 0, errors: [] };
  }

  if (type !== 'records') throw httpError('알 수 없는 업로드 종류입니다.');
  const labels = Object.fromEntries([
    ['empNo', '사번'],
    ['category', '구분'],
    ['id', 'ID'],
    ...RECORD_FIELDS.map((k) => [k, RECORD_CSV_LABELS[k]]),
  ]);
  const index = indexHeaders(headerRow, labels);
  if (index.empNo === undefined || index.category === undefined) {
    throw httpError('CSV에 사번·구분 열이 필요합니다.');
  }
  const db = getDb();
  const existingRows = await db.prepare('SELECT * FROM employee_records').all();
  const existingById = new Map(existingRows.map((row) => [String(row.id), row]));
  const signature = (employeeId, r) =>
    JSON.stringify([Number(employeeId), r.category, ...RECORD_FIELDS.map((k) => r[k] || '')]);
  const known = new Set(
    existingRows.map((row) =>
      signature(row.employee_id, {
        category: row.category,
        ...Object.fromEntries(RECORD_FIELDS.map((k) => [k, row[RECORD_COLUMNS[k]]])),
      })
    )
  );

  let skipped = 0;
  dataRows.forEach((row, i) => {
    const line = i + 2;
    try {
      const empNo = text(row[index.empNo]);
      if (!empNo) throw httpError('사번이 비어 있습니다.');
      const employeeId = empIds.get(empNo);
      if (!employeeId) throw httpError(`없는 사번입니다 (${empNo}).`);
      const category = categoryFromLabel(row[index.category]);
      if (!category) throw httpError(`구분을 확인하세요 (${text(row[index.category])}).`);
      const record = cleanRecord({
        category,
        ...Object.fromEntries(RECORD_FIELDS.map((k) => [k, index[k] === undefined ? '' : row[index[k]]])),
      });
      const id = index.id === undefined ? '' : text(row[index.id]);
      if (id) {
        const current = existingById.get(id);
        if (!current || Number(current.employee_id) !== employeeId) {
          throw httpError(`ID ${id} 이력이 없거나 사번과 맞지 않습니다.`);
        }
        planned.push({ id, record });
        return;
      }
      const sig = signature(employeeId, record);
      if (known.has(sig)) {
        skipped += 1;
        return;
      }
      known.add(sig);
      planned.push({ employeeId, record });
    } catch (error) {
      errors.push({ line, message: error.message });
    }
  });
  if (errors.length) return { applied: false, errors };

  let inserted = 0;
  let updated = 0;
  await db.transaction(async () => {
    for (const item of planned) {
      if (item.id) {
        await writeRecord(item.id, item.record, actorId);
        updated += 1;
      } else {
        await insertRecord(item.employeeId, item.record, actorId);
        inserted += 1;
      }
    }
  });
  return { applied: true, inserted, updated, skipped, errors: [] };
}

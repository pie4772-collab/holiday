import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, getDbDialect, getDbDriverName, USER_DATA_DIR } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..');
/** Cafe24 AI Space starter 공간의 저장 한도. 요금제를 바꾸면 STORAGE_QUOTA_MB 로 맞춥니다. */
const QUOTA_MB = Number(process.env.STORAGE_QUOTA_MB) || 2048;
const APP_SCAN_TTL_MS = 10 * 60_000;
const SKIP_DIRS = new Set(['.git']);
const TOP_TABLES = 12;

const ATTACHMENT_TABLES = [
  { table: 'employee_documents', label: '인사기록카드 서류' },
  { table: 'notice_files', label: '공지사항 첨부' },
];

const TABLE_LABELS = {
  employee_documents: '인사기록카드 서류',
  notice_files: '공지사항 첨부',
  leave_usages: '연차 사용',
  leave_approval_logs: '연차 승인·반려 이력',
  leave_accruals: '연차 발생',
  attendance_records: '출퇴근 기록',
  attendance_logs: '출퇴근 로그',
  approval_documents: '전자결재 문서',
  approval_document_steps: '전자결재 결재선',
  certificates: '증명서 발급',
  employees: '직원',
  employee_records: '인사기록',
  admin_usage_logs: '관리자 사용 기록',
  training_progress: '교육 시청 기록',
  notices: '공지사항',
};

let appScan = null;

async function directorySize(dir, skipPaths = new Set()) {
  let bytes = 0;
  let files = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { bytes, files };
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || skipPaths.has(path.resolve(full))) continue;
      const sub = await directorySize(full, skipPaths);
      bytes += sub.bytes;
      files += sub.files;
    } else if (entry.isFile()) {
      try {
        bytes += (await fs.stat(full)).size;
        files += 1;
      } catch {
        // 지우는 중인 파일은 건너뜁니다.
      }
    }
  }
  return { bytes, files };
}

/** 앱 폴더(라이브러리 포함) 크기. 파일이 많아 10분 동안 결과를 재사용합니다. 데이터 폴더는 따로 셉니다. */
async function appFilesSize(refresh) {
  if (!refresh && appScan && Date.now() - appScan.at < APP_SCAN_TTL_MS) return appScan.result;
  const result = await directorySize(APP_ROOT, new Set(USER_DATA_DIR ? [path.resolve(USER_DATA_DIR)] : []));
  appScan = { at: Date.now(), result };
  return result;
}

async function postgresUsage(db) {
  const { size } = await db.prepare('SELECT pg_database_size(current_database()) AS size').get();
  const rows = await db
    .prepare(
      `SELECT c.relname AS name, pg_total_relation_size(c.oid) AS size, COALESCE(s.n_live_tup, 0) AS row_count
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE c.relkind = 'r' AND n.nspname = current_schema()
       ORDER BY pg_total_relation_size(c.oid) DESC`
    )
    .all();
  return {
    sizeBytes: Number(size) || 0,
    tables: rows.map((row) => ({ name: row.name, sizeBytes: Number(row.size) || 0, rows: Number(row.row_count) || 0 })),
  };
}

async function sqliteUsage(db) {
  const pageCount = (await db.prepare('PRAGMA page_count').get())?.page_count || 0;
  const pageSize = (await db.prepare('PRAGMA page_size').get())?.page_size || 0;
  let tables = [];
  try {
    const rows = await db
      .prepare(
        `SELECT name, SUM(pgsize) AS size FROM dbstat
         WHERE name NOT LIKE 'sqlite_%' GROUP BY name ORDER BY size DESC`
      )
      .all();
    tables = rows.map((row) => ({ name: row.name, sizeBytes: Number(row.size) || 0, rows: null }));
  } catch {
    // dbstat 없이 빌드된 SQLite는 테이블별 크기를 알 수 없습니다.
  }
  return { sizeBytes: pageCount * pageSize, tables };
}

async function attachmentUsage(db) {
  const items = [];
  for (const { table, label } of ATTACHMENT_TABLES) {
    try {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS file_count, COALESCE(SUM(size_bytes), 0) AS original_bytes,
                  COALESCE(SUM(length(content)), 0) AS stored_bytes
           FROM ${table}`
        )
        .get();
      items.push({
        key: table,
        label,
        count: Number(row.file_count) || 0,
        originalBytes: Number(row.original_bytes) || 0,
        storedBytes: Number(row.stored_bytes) || 0,
      });
    } catch {
      items.push({ key: table, label, count: 0, originalBytes: 0, storedBytes: 0 });
    }
  }
  return items;
}

export async function getStorageUsage({ refresh = false } = {}) {
  const db = getDb();
  const dialect = getDbDialect();
  const database = dialect === 'postgres' ? await postgresUsage(db) : await sqliteUsage(db);
  const attachments = await attachmentUsage(db);
  const app = await appFilesSize(refresh);
  const userData = USER_DATA_DIR ? await directorySize(USER_DATA_DIR) : { bytes: 0, files: 0 };
  // SQLite 파일은 앱 폴더나 데이터 폴더 안에 있어 그 크기에 이미 들어 있습니다.
  const quotaBytes = QUOTA_MB * 1024 * 1024;
  const totalBytes = (dialect === 'postgres' ? database.sizeBytes : 0) + app.bytes + userData.bytes;

  return {
    checkedAt: new Date().toISOString(),
    quotaBytes,
    totalBytes,
    usedRatio: quotaBytes ? totalBytes / quotaBytes : 0,
    database: {
      dialect,
      driver: getDbDriverName(),
      sizeBytes: database.sizeBytes,
      tables: database.tables.slice(0, TOP_TABLES).map((t) => ({ ...t, label: TABLE_LABELS[t.name] || '' })),
    },
    attachments,
    appFiles: { sizeBytes: app.bytes, fileCount: app.files, cachedAt: appScan ? new Date(appScan.at).toISOString() : null },
    userData: { sizeBytes: userData.bytes, fileCount: userData.files },
  };
}

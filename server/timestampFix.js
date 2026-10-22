import { getDb } from './db.js';
import { HOST_UTC_OFFSET_MINUTES } from './timezone.js';

const META_KEY = 'timestamps_kst_v1';
const KST_OFFSET_MINUTES = 9 * 60;

/** 서버가 datetime('now', 'localtime')으로 남긴 시각. 근태 기록·마감 시각은 처음부터 한국 시간으로 저장해 뺍니다. */
const COLUMNS = {
  employees: ['created_at', 'updated_at'],
  departments: ['created_at'],
  leave_balance_snapshots: ['imported_at'],
  leave_accruals: ['created_at', 'updated_at'],
  leave_usages: ['created_at', 'updated_at', 'approved_at'],
  users: ['created_at', 'password_changed_at'],
  approval_mappings: ['created_at'],
  approval_seats: ['created_at', 'updated_at'],
  leave_settlement_ordinary_wages: ['updated_at'],
  leave_approval_logs: ['created_at'],
  leave_month_reports: ['generated_at'],
  leave_pay_settlements: ['generated_at'],
  leave_event_settlements: ['generated_at'],
  mail_settings: ['updated_at'],
  employee_roles: ['created_at'],
  employee_profiles: ['updated_at'],
  employee_records: ['created_at', 'updated_at'],
  employee_documents: ['created_at'],
  attendance_sites: ['updated_at'],
  attendance_records: ['created_at', 'updated_at'],
  notices: ['created_at', 'updated_at'],
  notice_reads: ['read_at'],
  notice_files: ['created_at'],
  employee_evaluations: ['submitted_at', 'reviewed_at', 'confirmed_at', 'reminded_at', 'created_at', 'updated_at'],
};

/**
 * 운영에 올린 초기 DB(database/holiday.db, 2026-09-07 16:34 커밋)는 PC에서 한국 시간으로 만들어졌습니다.
 * 그 이후 운영 서버가 남긴 값만 UTC이므로, 초기 DB에 있던 시각은 그대로 둡니다.
 */
const SEED_CUTOFF = '2026-09-07 07:34:27';
const SEED_STAMPS = new Set([
  '2026-09-07 13:52:50',
  '2026-09-07 13:52:51',
  '2026-09-07 13:52:52',
  '2026-09-07 13:52:53',
  '2026-09-07 13:52:54',
  '2026-09-07 16:18:56',
  '2026-09-07 16:27:35',
  '2026-09-07 16:33:03',
]);
const STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

const utcStamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

function shift(value, minutes) {
  const [, y, mo, d, h, mi, s] = value.match(STAMP).map(Number);
  return utcStamp(new Date(Date.UTC(y, mo - 1, d, h, mi + minutes, s)));
}

/**
 * 서버가 UTC로 돌던 동안 저장된 시각을 한국 시간으로 한 번만 옮깁니다.
 * 서버가 원래 한국 시간이었다면(로컬 PC) 바꿀 것이 없어 완료 표시만 남깁니다.
 */
export async function convertStoredTimestampsToKst() {
  const db = getDb();
  if (await db.prepare('SELECT value FROM app_meta WHERE key = ?').get(META_KEY)) return null;
  const minutes = KST_OFFSET_MINUTES - HOST_UTC_OFFSET_MINUTES;
  // 이번 시작 중 마이그레이션이 이미 한국 시간으로 남긴 값은 옮기지 않습니다.
  const startedAt = shift(utcStamp(new Date(Date.now() - process.uptime() * 1000)), HOST_UTC_OFFSET_MINUTES);
  const changed = {};
  await db.transaction(async () => {
    if (minutes !== 0) {
      for (const [table, columns] of Object.entries(COLUMNS)) {
        for (const column of columns) {
          const values = (
            await db.prepare(`SELECT DISTINCT ${column} AS v FROM ${table} WHERE ${column} IS NOT NULL`).all()
          )
            .map((r) => String(r.v))
            .filter((v) => STAMP.test(v) && v > SEED_CUTOFF && v < startedAt && !SEED_STAMPS.has(v))
            .sort()
            .reverse();
          let rows = 0;
          for (const v of values) {
            rows += (await db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(shift(v, minutes), v))
              .changes;
          }
          if (rows) changed[`${table}.${column}`] = rows;
        }
      }
    }
    await db
      .prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .run(META_KEY, String(minutes));
  });
  return { minutes, changed };
}

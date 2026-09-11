import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { INITIAL_ADMIN_NAMES, STRATEGY_APPROVER_EMP_NO, SEOUL_WORKPLACE_CODE, STRATEGY_DEPT_CODE, APPROVAL_SEAT_DEFAULTS } from '../src/constants/hr.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_DB_PATH = path.join(__dirname, '../database/holiday.db');
const USER_DATA_DIR = process.env.USER_DATA_DIR
  || (fs.existsSync('/app/user_data') || fs.existsSync('/app') ? '/app/user_data' : null);

function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (USER_DATA_DIR) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    const persistent = path.join(USER_DATA_DIR, 'holiday.db');
    if (!fs.existsSync(persistent) && fs.existsSync(BUNDLED_DB_PATH)) {
      fs.copyFileSync(BUNDLED_DB_PATH, persistent);
    }
    return persistent;
  }
  return BUNDLED_DB_PATH;
}

const DB_PATH = resolveDbPath();

const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
const SQL = await initSqlJs({
  wasmBinary: fs.readFileSync(wasmPath),
});

function openDatabase() {
  if (fs.existsSync(DB_PATH)) {
    return new SQL.Database(fs.readFileSync(DB_PATH));
  }
  const db = new SQL.Database();
  const schemaPath = path.join(__dirname, '../database/schema.sql');
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, 'utf8'));
  }
  return db;
}

const sqlDb = openDatabase();

function persist() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(sqlDb.export()));
}

function toParams(args) {
  return args.map((value) => (value === undefined ? null : value));
}

class Statement {
  constructor(sql) {
    this.sql = sql;
  }

  get(...args) {
    const stmt = sqlDb.prepare(this.sql);
    const params = toParams(args);
    if (params.length) stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : undefined;
    stmt.free();
    return row;
  }

  all(...args) {
    const stmt = sqlDb.prepare(this.sql);
    const params = toParams(args);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  run(...args) {
    const params = toParams(args);
    if (params.length) sqlDb.run(this.sql, params);
    else sqlDb.run(this.sql);
    const idResult = sqlDb.exec('SELECT last_insert_rowid() AS id');
    const lastInsertRowid = idResult[0]?.values?.[0]?.[0] ?? 0;
    const changes = sqlDb.getRowsModified();
    persist();
    return { lastInsertRowid, changes };
  }
}

class Db {
  prepare(sql) {
    return new Statement(sql);
  }

  exec(sql) {
    sqlDb.exec(sql);
    persist();
    return this;
  }

  pragma(source) {
    sqlDb.run(`PRAGMA ${source}`);
  }
}

const db = new Db();

function tableColumns(database, table) {
  return database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function addColumn(database, table, definition) {
  const [name] = definition.split(/\s+/);
  const cols = tableColumns(database, table);
  if (cols.length && !cols.includes(name)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function migrateApprovalMappingsTable(database) {
  const ddl = database.prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'approval_mappings'`
  ).get();
  const needsRebuild = Boolean(ddl?.sql?.includes('CHECK'));
  database.exec('DROP TABLE IF EXISTS approval_mappings_new');
  database.exec(`
    CREATE TABLE approval_mappings_new (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      role             TEXT NOT NULL,
      workplace_code   TEXT,
      department_code  TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
  if (ddl && needsRebuild) {
    database.exec(
      `INSERT INTO approval_mappings_new (id, employee_id, role, workplace_code, department_code, created_at)
       SELECT id, employee_id, role, workplace_code, department_code, created_at FROM approval_mappings`
    );
    database.exec('DROP TABLE approval_mappings');
    database.exec('ALTER TABLE approval_mappings_new RENAME TO approval_mappings');
  } else if (!ddl) {
    database.exec('ALTER TABLE approval_mappings_new RENAME TO approval_mappings');
  } else {
    database.exec('DROP TABLE approval_mappings_new');
  }
}

function seedApprovalRules(database) {
  const seeded = database.prepare(`SELECT value FROM app_meta WHERE key = 'approval_rules_v2'`).get();
  if (seeded?.value) return;

  const park = database
    .prepare(`SELECT id FROM employees WHERE emp_no = ? OR name = '박지은'`)
    .get(STRATEGY_APPROVER_EMP_NO);
  if (park) {
    const existing = database
      .prepare(
        `SELECT id FROM approval_mappings
         WHERE employee_id = ? AND role = '담당' AND workplace_code = ? AND department_code = ?`
      )
      .get(park.id, SEOUL_WORKPLACE_CODE, STRATEGY_DEPT_CODE);
    if (!existing) {
      database
        .prepare(
          `INSERT INTO approval_mappings (employee_id, role, workplace_code, department_code)
           VALUES (?, '담당', ?, ?)`
        )
        .run(park.id, SEOUL_WORKPLACE_CODE, STRATEGY_DEPT_CODE);
    }
    const execMap = database
      .prepare(
        `SELECT id FROM approval_mappings
         WHERE employee_id = ? AND role = '임원' AND workplace_code = ? AND department_code = ?`
      )
      .get(park.id, SEOUL_WORKPLACE_CODE, STRATEGY_DEPT_CODE);
    if (!execMap) {
      database
        .prepare(
          `INSERT INTO approval_mappings (employee_id, role, workplace_code, department_code)
           VALUES (?, '임원', ?, ?)`
        )
        .run(park.id, SEOUL_WORKPLACE_CODE, STRATEGY_DEPT_CODE);
    }
  }

  database.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('approval_rules_v2', '1')`).run();
}

function migrateApprovalSeats(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS approval_seats (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      seat_key      TEXT NOT NULL UNIQUE,
      title         TEXT NOT NULL,
      step_role     TEXT NOT NULL,
      employee_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS approval_seat_scopes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      seat_id          INTEGER NOT NULL REFERENCES approval_seats(id) ON DELETE CASCADE,
      workplace_code   TEXT,
      department_code  TEXT NOT NULL,
      department_name  TEXT,
      UNIQUE(seat_id, department_code)
    );
  `);
}

function lookupDept(database, departmentName) {
  return database
    .prepare(
      `SELECT department_code, workplace_code, department
       FROM employees
       WHERE department = ? AND (workplace = '서울' OR workplace_code = ?)
       LIMIT 1`
    )
    .get(departmentName, SEOUL_WORKPLACE_CODE);
}

function seedApprovalSeats(database) {
  const seeded = database.prepare(`SELECT value FROM app_meta WHERE key = 'approval_seats_v1'`).get();
  if (seeded?.value) return;

  for (const def of APPROVAL_SEAT_DEFAULTS) {
    let employeeId = null;
    if (def.employeeEmpNo) {
      const emp = database
        .prepare(`SELECT id FROM employees WHERE emp_no = ? OR name = '박지은'`)
        .get(def.employeeEmpNo);
      employeeId = emp?.id || null;
    }
    const existing = database.prepare('SELECT id FROM approval_seats WHERE seat_key = ?').get(def.seatKey);
    let seatId = existing?.id;
    if (!seatId) {
      const result = database
        .prepare(
          `INSERT INTO approval_seats (seat_key, title, step_role, employee_id, sort_order)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(def.seatKey, def.title, def.stepRole, employeeId, def.sortOrder);
      seatId = result.lastInsertRowid;
    }

    for (const deptName of def.departments || []) {
      const found = lookupDept(database, deptName);
      const departmentCode = found?.department_code || (deptName === '경영전략실' ? STRATEGY_DEPT_CODE : null);
      if (!departmentCode) continue;
      const workplaceCode = found?.workplace_code || SEOUL_WORKPLACE_CODE;
      const already = database
        .prepare('SELECT id FROM approval_seat_scopes WHERE seat_id = ? AND department_code = ?')
        .get(seatId, String(departmentCode));
      if (already) continue;
      database
        .prepare(
          `INSERT INTO approval_seat_scopes (seat_id, workplace_code, department_code, department_name)
           VALUES (?, ?, ?, ?)`
        )
        .run(seatId, String(workplaceCode), String(departmentCode), deptName);
    }
  }

  database.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('approval_seats_v1', '1')`).run();
}

function toText(value) {
  if (value == null || value === '') return null;
  return String(value).trim();
}

function importRosterSeed(database) {
  const seeded = database.prepare(`SELECT value FROM app_meta WHERE key = 'roster_org_imported'`).get();
  if (seeded?.value) return;

  const seedPath = [
    path.join(__dirname, '../database/roster_seed.json'),
    path.join(__dirname, '../scripts/roster-import.json'),
  ].find((p) => fs.existsSync(p));
  if (!seedPath) return;

  const rows = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const asOfDate = process.env.AS_OF_DATE || '2026-08-31';
  const displayYear = Number(String(asOfDate).slice(0, 4)) || 2026;

  for (const row of rows) {
    const empNo = toText(row['사번']);
    if (!empNo) continue;
    const name = toText(row['이름']);
    const hireDate = toText(row['입사일']);
    const isAdmin = row['권한'] === '관리자' ? 1 : 0;
    const isActive = row['상태'] === '퇴사' ? 0 : 1;
    const payload = [
      empNo,
      name,
      hireDate,
      toText(row['사업장']),
      toText(row['사업장코드']),
      toText(row['부서']),
      toText(row['부서코드']),
      toText(row['직종']) || '사무직',
      toText(row['직급']) || '팀원',
      toText(row['직급코드']),
      toText(row['겸직부서']),
      toText(row['겸직부서코드']),
      toText(row['겸직직급']),
      toText(row['겸직직급코드']),
      toText(row['퇴사일']),
      isActive,
      isAdmin,
    ];

    const existing = database.prepare('SELECT id FROM employees WHERE emp_no = ?').get(empNo);
    if (existing) {
      database
        .prepare(
          `UPDATE employees
           SET name = ?, hire_date = ?, workplace = ?, workplace_code = ?,
               department = ?, department_code = ?, job_type = ?,
               position = ?, position_code = ?,
               concurrent_dept = ?, concurrent_dept_code = ?,
               concurrent_position = ?, concurrent_position_code = ?,
               terminated_date = ?, is_active = ?, is_admin = ?,
               updated_at = datetime('now', 'localtime')
           WHERE id = ?`
        )
        .run(
          name,
          hireDate,
          payload[3],
          payload[4],
          payload[5],
          payload[6],
          payload[7],
          payload[8],
          payload[9],
          payload[10],
          payload[11],
          payload[12],
          payload[13],
          payload[14],
          isActive,
          isAdmin,
          existing.id
        );
    } else {
      const result = database
        .prepare(
          `INSERT INTO employees (
             emp_no, name, hire_date, workplace, workplace_code, department, department_code,
             job_type, position, position_code, concurrent_dept, concurrent_dept_code,
             concurrent_position, concurrent_position_code, terminated_date, is_active, is_admin
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          empNo,
          name,
          hireDate,
          payload[3],
          payload[4],
          payload[5],
          payload[6],
          payload[7],
          payload[8],
          payload[9],
          payload[10],
          payload[11],
          payload[12],
          payload[13],
          payload[14],
          isActive,
          isAdmin
        );
      database
        .prepare(
          `INSERT INTO leave_balance_snapshots
             (employee_id, as_of_date, display_year, accrued, used, remaining, source_file)
           VALUES (?, ?, ?, 0, 0, 0, 'roster_seed')`
        )
        .run(result.lastInsertRowid, asOfDate, displayYear);
    }
  }

  database
    .prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('roster_org_imported', ?)`)
    .run(path.basename(seedPath));
}

function migrate(database) {
  const cols = tableColumns(database, 'employees');
  if (cols.length && !cols.includes('terminated_date')) {
    database.exec('ALTER TABLE employees ADD COLUMN terminated_date TEXT');
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id   INTEGER NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  migrateApprovalMappingsTable(database);
  migrateApprovalSeats(database);

  addColumn(database, 'employees', 'is_admin INTEGER NOT NULL DEFAULT 0');
  addColumn(database, 'employees', 'workplace TEXT');
  addColumn(database, 'employees', 'workplace_code TEXT');
  addColumn(database, 'employees', 'department_code TEXT');
  addColumn(database, 'employees', 'job_type TEXT');
  addColumn(database, 'employees', 'position_code TEXT');
  addColumn(database, 'employees', 'concurrent_dept TEXT');
  addColumn(database, 'employees', 'concurrent_dept_code TEXT');
  addColumn(database, 'employees', 'concurrent_position TEXT');
  addColumn(database, 'employees', 'concurrent_position_code TEXT');
  addColumn(database, 'employees', 'ordinary_wage REAL');
  addColumn(database, 'leave_usages', 'approved_by INTEGER');
  addColumn(database, 'leave_usages', 'approved_at TEXT');
  addColumn(database, 'leave_usages', 'reject_reason TEXT');
  addColumn(database, 'leave_usages', 'approval_step TEXT');

  database.exec(`
    CREATE TABLE IF NOT EXISTS leave_month_reports (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      year          INTEGER NOT NULL,
      month         INTEGER NOT NULL,
      as_of_date    TEXT NOT NULL,
      generated_by  INTEGER,
      payload       TEXT NOT NULL,
      generated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(year, month)
    );
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS leave_pay_settlements (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      year          INTEGER NOT NULL,
      month         INTEGER NOT NULL,
      as_of_date    TEXT NOT NULL,
      generated_by  INTEGER,
      payload       TEXT NOT NULL,
      generated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(year, month)
    );
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS leave_event_settlements (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      year          INTEGER NOT NULL UNIQUE,
      as_of_date    TEXT NOT NULL,
      generated_by  INTEGER,
      payload       TEXT NOT NULL,
      generated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS mail_settings (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      enabled      INTEGER NOT NULL DEFAULT 0,
      imap_host    TEXT,
      imap_port    INTEGER,
      imap_secure  TEXT,
      smtp_host    TEXT,
      smtp_port    INTEGER,
      smtp_secure  TEXT,
      username     TEXT,
      password     TEXT,
      from_name    TEXT,
      from_email   TEXT,
      app_url      TEXT,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  const mailRow = database.prepare('SELECT id, smtp_host, username, from_name, from_email FROM mail_settings WHERE id = 1').get();
  if (!mailRow) {
    database
      .prepare(
        `INSERT INTO mail_settings (
           id, enabled, smtp_host, smtp_port, smtp_secure, username, from_name, from_email, app_url
         ) VALUES (1, 0, 'smtp.mailplug.co.kr', 465, 'ssl', 'salary@dysp.co.kr',
                   'KBI동양철관주식회사', 'salary@dysp.co.kr', 'https://pie8405-holiday.mycafe24.ai')`
      )
      .run();
  } else if (!mailRow.smtp_host || mailRow.smtp_host === 'gw.kbigrp.com') {
    database
      .prepare(
        `UPDATE mail_settings
         SET smtp_host = 'smtp.mailplug.co.kr',
             smtp_port = 465,
             smtp_secure = 'ssl',
             username = CASE WHEN username IS NULL OR trim(username) = '' THEN 'salary@dysp.co.kr' ELSE username END,
             from_name = CASE WHEN from_name IS NULL OR from_name IN ('', 'Holiday 연차관리') THEN 'KBI동양철관주식회사' ELSE from_name END,
             from_email = CASE WHEN from_email IS NULL OR trim(from_email) = '' THEN 'salary@dysp.co.kr' ELSE from_email END
         WHERE id = 1`
      )
      .run();
  }

  const adminCols = tableColumns(database, 'employees');
  const adminSeeded = database.prepare(`SELECT value FROM app_meta WHERE key = 'initial_admins_seeded'`).get();
  if (!adminSeeded && adminCols.includes('is_admin')) {
    const already = database.prepare('SELECT COUNT(*) AS c FROM employees WHERE is_admin = 1').get();
    if (!already?.c) {
      const placeholders = INITIAL_ADMIN_NAMES.map(() => '?').join(', ');
      database.prepare(`UPDATE employees SET is_admin = 1 WHERE name IN (${placeholders})`).run(
        ...INITIAL_ADMIN_NAMES
      );
    }
    database.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('initial_admins_seeded', '1')`).run();
  }

  database.exec(`
    UPDATE employees
    SET position = '팀원'
    WHERE position IS NULL
       OR trim(position) = ''
       OR position = '-'
       OR position NOT IN ('팀원', '팀장', '공장장', '임원', '대표이사')
  `);

  importRosterSeed(database);
  seedApprovalRules(database);
  seedApprovalSeats(database);

  // 7월 말 임포트 잔액인데 as_of가 8/31로 들어간 경우 보정.
  // (8월 사용분이 스냅샷 이후 차감에 잡히지 않는 문제 방지)
  const snapFix = database.prepare(`SELECT value FROM app_meta WHERE key = 'snapshot_asof_jul31_fixed'`).get();
  if (!snapFix) {
    database
      .prepare(
        `UPDATE leave_balance_snapshots
         SET as_of_date = '2026-07-31'
         WHERE as_of_date = '2026-08-31'`
      )
      .run();
    database
      .prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('snapshot_asof_jul31_fixed', '1')`)
      .run();
  }
}

sqlDb.run('PRAGMA foreign_keys = ON');
migrate(db);

export function getDb() {
  return db;
}

export function getDbPath() {
  return DB_PATH;
}

export function parseEmployeeId(id) {
  if (!id) return null;
  const str = String(id);
  const match = str.match(/^emp-(\d+)$/i);
  return match ? Number(match[1]) : Number(str);
}

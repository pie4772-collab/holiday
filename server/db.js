import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnv.js';
import { INITIAL_ADMIN_NAMES, STRATEGY_APPROVER_EMP_NO, SEOUL_WORKPLACE_CODE, STRATEGY_DEPT_CODE, APPROVAL_SEAT_DEFAULTS } from '../src/constants/hr.js';

loadEnvFile();

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_DB_PATH = path.join(__dirname, '../database/holiday.db');
export const USER_DATA_DIR = process.env.USER_DATA_DIR
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
const SCHEMA_PATH = path.join(__dirname, '../database/schema.sql');
const MIGRATIONS_DIR = path.join(__dirname, '../database/migrations');
const PG_SCHEMA_PATH = path.join(__dirname, '../database/postgres/schema.sql');
const STATEMENT_CACHE_LIMIT = 500;

function ensureDbDir() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

function readSchemaSql() {
  return fs.existsSync(SCHEMA_PATH) ? fs.readFileSync(SCHEMA_PATH, 'utf8') : '';
}

/** sql.js 시절 파일을 node:sqlite로 처음 열기 전에 한 번만 원본을 보관합니다. */
function backupBeforeDriverSwitch() {
  const backupPath = `${DB_PATH}.pre-node-sqlite.bak`;
  if (fs.existsSync(DB_PATH) && !fs.existsSync(backupPath)) {
    fs.copyFileSync(DB_PATH, backupPath);
  }
}

async function loadNodeSqlite() {
  if (process.env.DB_DRIVER === 'sqljs') return null;
  try {
    const mod = await import('node:sqlite');
    return mod.DatabaseSync ? mod : null;
  } catch {
    return null;
  }
}

/** Node 22.13+ 내장 SQLite: 네이티브 빌드 없이 파일에 변경분만 기록합니다. */
function createNodeSqliteDriver({ DatabaseSync }) {
  ensureDbDir();
  const isNew = !fs.existsSync(DB_PATH);
  if (!isNew) backupBeforeDriverSwitch();
  const database = new DatabaseSync(DB_PATH);
  database.exec('PRAGMA busy_timeout = 5000');
  if (isNew) {
    const schema = readSchemaSql();
    if (schema) database.exec(schema);
  }

  // node:sqlite는 JS number를 항상 REAL로 바인딩해 TEXT 컬럼에 '1.0'으로 저장되므로 정수는 BigInt로 넘긴다.
  function bindable(params) {
    return params.map((value) =>
      typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : value
    );
  }

  const cache = new Map();
  function statement(sql) {
    let stmt = cache.get(sql);
    if (!stmt) {
      if (cache.size >= STATEMENT_CACHE_LIMIT) cache.clear();
      stmt = database.prepare(sql);
      cache.set(sql, stmt);
    }
    return stmt;
  }

  return {
    name: 'node:sqlite',
    get(sql, params) {
      const row = statement(sql).get(...bindable(params));
      return row ? { ...row } : undefined;
    },
    all(sql, params) {
      return statement(sql).all(...bindable(params)).map((row) => ({ ...row }));
    },
    run(sql, params) {
      const result = statement(sql).run(...bindable(params));
      return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    exec(sql) {
      database.exec(sql);
    },
    flush() {},
    close() {
      database.close();
    },
  };
}

/**
 * Node 20 등 node:sqlite가 없는 환경용 대체 드라이버.
 * DB 전체를 메모리에 두므로, 임시 파일에 쓴 뒤 교체해 저장 중 중단돼도 원본이 손상되지 않게 합니다.
 */
async function createSqlJsDriver() {
  const { default: initSqlJs } = await import('sql.js');
  const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });

  let database;
  if (fs.existsSync(DB_PATH)) {
    database = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    database = new SQL.Database();
    const schema = readSchemaSql();
    if (schema) database.exec(schema);
  }

  function lastInsertRowid() {
    const result = database.exec('SELECT last_insert_rowid() AS id');
    return result[0]?.values?.[0]?.[0] ?? 0;
  }

  return {
    name: 'sql.js',
    get(sql, params) {
      const stmt = database.prepare(sql);
      try {
        if (params.length) stmt.bind(params);
        return stmt.step() ? stmt.getAsObject() : undefined;
      } finally {
        stmt.free();
      }
    },
    all(sql, params) {
      const stmt = database.prepare(sql);
      try {
        if (params.length) stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    run(sql, params) {
      if (params.length) database.run(sql, params);
      else database.run(sql);
      return { lastInsertRowid: lastInsertRowid(), changes: database.getRowsModified() };
    },
    exec(sql) {
      database.exec(sql);
    },
    flush() {
      ensureDbDir();
      const tmpPath = `${DB_PATH}.tmp`;
      fs.writeFileSync(tmpPath, Buffer.from(database.export()));
      fs.renameSync(tmpPath, DB_PATH);
    },
    close() {
      database.close();
    },
  };
}

function toParams(args) {
  return args.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  });
}

class SyncStatement {
  constructor(owner, sql) {
    this.owner = owner;
    this.sql = sql;
  }

  get(...args) {
    return this.owner.execute('get', this.sql, toParams(args));
  }

  all(...args) {
    return this.owner.execute('all', this.sql, toParams(args));
  }

  run(...args) {
    return this.owner.execute('run', this.sql, toParams(args));
  }
}

/** 서버 시작 시 스키마 보정(migrate)에만 쓰는 SQLite 동기 인터페이스입니다. */
class SqliteSyncDb {
  constructor(driver) {
    this.driver = driver;
    this.txDepth = 0;
  }

  prepare(sql) {
    return new SyncStatement(this, sql);
  }

  execute(kind, sql, params) {
    if (kind === 'get') return this.driver.get(sql, params);
    if (kind === 'all') return this.driver.all(sql, params);
    const result = this.driver.run(sql, params);
    this.afterWrite();
    return result;
  }

  exec(sql) {
    this.driver.exec(sql);
    this.afterWrite();
    return this;
  }

  pragma(source) {
    this.driver.exec(`PRAGMA ${source}`);
  }

  afterWrite() {
    if (this.txDepth === 0) this.driver.flush();
  }

  /** 동기 함수만 지원합니다. 중첩 호출은 바깥 트랜잭션에 합쳐집니다. */
  transaction(fn) {
    if (this.txDepth > 0) return fn();
    this.driver.exec('BEGIN');
    this.txDepth += 1;
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        throw new Error('db.transaction()에는 동기 함수만 전달할 수 있습니다.');
      }
      this.driver.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.driver.exec('ROLLBACK');
      } catch {
        // BEGIN 이후 SQLite가 이미 롤백한 경우
      }
      throw error;
    } finally {
      this.txDepth -= 1;
      this.driver.flush();
    }
  }

  close() {
    this.driver.close();
  }
}

const txContext = new AsyncLocalStorage();

export const LOCK_EMPLOYEE_LEAVE = 1;
export const LOCK_LEAVE_USAGE = 2;

function activeTx() {
  const store = txContext.getStore();
  return store?.active ? store : null;
}

/** SQLite는 연결이 하나뿐이라, 트랜잭션이 진행 중이면 다른 요청의 쿼리를 끝날 때까지 기다리게 합니다. */
function createSqliteBackend(sync) {
  let running = null;

  async function waitIdle() {
    while (running) await running;
  }

  return {
    name: sync.driver.name,
    dialect: 'sqlite',
    sync,
    async query(kind, sql, params, tx) {
      if (!tx) await waitIdle();
      return sync.execute(kind, sql, params);
    },
    async exec(sql, tx) {
      if (!tx) await waitIdle();
      sync.exec(sql);
    },
    async transaction(fn) {
      await waitIdle();
      let finish;
      running = new Promise((resolve) => {
        finish = resolve;
      });
      const store = { active: true };
      sync.driver.exec('BEGIN');
      sync.txDepth += 1;
      try {
        const result = await fn(store);
        sync.driver.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          sync.driver.exec('ROLLBACK');
        } catch {
          // SQLite가 이미 롤백한 경우
        }
        throw error;
      } finally {
        store.active = false;
        sync.txDepth -= 1;
        try {
          sync.driver.flush();
        } finally {
          running = null;
          finish();
        }
      }
    },
    close() {
      sync.close();
    },
  };
}

class Statement {
  constructor(owner, sql) {
    this.owner = owner;
    this.sql = sql;
  }

  get(...args) {
    return this.owner.query('get', this.sql, toParams(args));
  }

  all(...args) {
    return this.owner.query('all', this.sql, toParams(args));
  }

  run(...args) {
    return this.owner.query('run', this.sql, toParams(args));
  }
}

/** 서비스 코드가 쓰는 DB 인터페이스. 모든 쿼리는 Promise를 돌려줍니다. */
class Db {
  constructor(backend) {
    this.backend = backend;
  }

  get dialect() {
    return this.backend.dialect;
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  query(kind, sql, params = []) {
    return this.backend.query(kind, sql, params, activeTx());
  }

  exec(sql) {
    return this.backend.exec(sql, activeTx());
  }

  /**
   * 트랜잭션 안에서 같은 (namespace, id) 작업을 한 번에 하나만 진행시킵니다.
   * SQLite는 트랜잭션이 이미 직렬화되므로 아무것도 하지 않습니다.
   */
  async lock(namespace, id) {
    if (this.dialect !== 'postgres' || !activeTx()) return;
    await this.query('get', 'SELECT pg_advisory_xact_lock(CAST(? AS integer), CAST(? AS integer)) AS locked', [
      namespace,
      Number(id) || 0,
    ]);
  }

  /** 중첩 호출은 바깥 트랜잭션에 합쳐집니다. */
  transaction(fn) {
    const current = activeTx();
    if (current) return fn(current);
    return this.backend.transaction((store) => txContext.run(store, () => fn(store)));
  }

  close() {
    return this.backend.close();
  }
}

function migrationFilesFor(dialect) {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  const byVersion = new Map();
  for (const file of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    const match = file.match(/^(\d{3,})_[\w-]+?(?:\.(sqlite|postgres))?\.sql$/);
    if (!match) continue;
    const [, version, fileDialect] = match;
    if (fileDialect && fileDialect !== dialect) continue;
    if (fileDialect || !byVersion.has(version)) byVersion.set(version, file);
  }
  return [...byVersion.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * database/migrations/NNN_설명.sql 을 번호 순서대로 한 번씩 적용합니다.
 * DB별로 문법이 다르면 NNN_설명.sqlite.sql / NNN_설명.postgres.sql 로 나눠 둡니다.
 * 파일 안에서 BEGIN/COMMIT을 쓰지 마세요. 파일마다 트랜잭션으로 감쌉니다.
 */
async function runSqlMigrations(database) {
  await database.exec(
    database.dialect === 'postgres'
      ? `CREATE TABLE IF NOT EXISTS schema_migrations (
           version     TEXT PRIMARY KEY,
           name        TEXT NOT NULL,
           applied_at  TEXT NOT NULL DEFAULT to_char(LOCALTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
         )`
      : `CREATE TABLE IF NOT EXISTS schema_migrations (
           version     TEXT PRIMARY KEY,
           name        TEXT NOT NULL,
           applied_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
         )`
  );

  const applied = new Set(
    (await database.prepare('SELECT version FROM schema_migrations').all()).map((row) => row.version)
  );
  for (const [version, file] of migrationFilesFor(database.dialect)) {
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await database.transaction(async () => {
      await database.exec(sql);
      await database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(version, file);
    });
    console.error(`[db] migration applied: ${file}`);
  }
  // 마이그레이션으로 생긴 id 테이블도 INSERT ... RETURNING id 대상에 넣습니다.
  await database.backend.refreshTableInfo?.();
}

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
  const asOfDate = process.env.AS_OF_DATE || '2026-07-31';
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
    CREATE TABLE IF NOT EXISTS leave_settlement_ordinary_wages (
      employee_id   INTEGER PRIMARY KEY,
      ordinary_wage REAL,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS leave_approval_logs (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      leave_usage_id    INTEGER REFERENCES leave_usages(id) ON DELETE SET NULL,
      employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      actor_id          INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      action            TEXT NOT NULL CHECK (action IN ('submit', 'auto_approve', 'step_approve', 'approve', 'reject')),
      step              TEXT,
      note              TEXT,
      usage_date        TEXT NOT NULL,
      usage_type        TEXT NOT NULL,
      days              REAL NOT NULL,
      reason            TEXT,
      employee_emp_no   TEXT,
      employee_name     TEXT NOT NULL,
      workplace         TEXT,
      workplace_code    TEXT,
      department        TEXT,
      position          TEXT,
      actor_emp_no      TEXT,
      actor_name        TEXT,
      actor_position    TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_created ON leave_approval_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_employee ON leave_approval_logs(employee_id);
    CREATE INDEX IF NOT EXISTS idx_leave_approval_logs_action ON leave_approval_logs(action);
  `);

  const approvalLogSeeded = database
    .prepare(`SELECT value FROM app_meta WHERE key = 'leave_approval_logs_backfill_v1'`)
    .get();
  if (!approvalLogSeeded) {
    database.exec(`
      INSERT INTO leave_approval_logs (
        leave_usage_id, employee_id, actor_id, action, step, note,
        usage_date, usage_type, days, reason,
        employee_emp_no, employee_name, workplace, workplace_code, department, position,
        actor_emp_no, actor_name, actor_position, created_at
      )
      SELECT
        u.id,
        u.employee_id,
        u.approved_by,
        CASE
          WHEN u.status = 'rejected' THEN 'reject'
          WHEN u.status = 'approved' AND u.created_by = 'employee'
               AND u.approved_by IS NOT NULL AND u.approved_by = u.employee_id THEN 'auto_approve'
          WHEN u.status = 'approved' THEN 'approve'
          ELSE 'submit'
        END,
        u.approval_step,
        u.reject_reason,
        u.usage_date,
        u.usage_type,
        u.days,
        u.reason,
        e.emp_no,
        e.name,
        e.workplace,
        e.workplace_code,
        e.department,
        e.position,
        a.emp_no,
        a.name,
        a.position,
        COALESCE(u.approved_at, u.created_at)
      FROM leave_usages u
      JOIN employees e ON e.id = u.employee_id
      LEFT JOIN employees a ON a.id = u.approved_by
      WHERE u.status IN ('approved', 'rejected')
        AND NOT EXISTS (
          SELECT 1 FROM leave_approval_logs l WHERE l.leave_usage_id = u.id
        );
    `);
    // pending: also log initial submit using created_at
    database.exec(`
      INSERT INTO leave_approval_logs (
        leave_usage_id, employee_id, actor_id, action, step, note,
        usage_date, usage_type, days, reason,
        employee_emp_no, employee_name, workplace, workplace_code, department, position,
        actor_emp_no, actor_name, actor_position, created_at
      )
      SELECT
        u.id, u.employee_id, u.employee_id, 'submit', u.approval_step, NULL,
        u.usage_date, u.usage_type, u.days, u.reason,
        e.emp_no, e.name, e.workplace, e.workplace_code, e.department, e.position,
        e.emp_no, e.name, e.position, u.created_at
      FROM leave_usages u
      JOIN employees e ON e.id = u.employee_id
      WHERE u.status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM leave_approval_logs l
          WHERE l.leave_usage_id = u.id AND l.action = 'submit'
        );
    `);
    database
      .prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('leave_approval_logs_backfill_v1', '1')`)
      .run();
  }

  const approvalLogSubmitSeeded = database
    .prepare(`SELECT value FROM app_meta WHERE key = 'leave_approval_logs_submit_backfill_v1'`)
    .get();
  if (!approvalLogSubmitSeeded) {
    database.exec(`
      INSERT INTO leave_approval_logs (
        leave_usage_id, employee_id, actor_id, action, step, note,
        usage_date, usage_type, days, reason,
        employee_emp_no, employee_name, workplace, workplace_code, department, position,
        actor_emp_no, actor_name, actor_position, created_at
      )
      SELECT
        u.id, u.employee_id, u.employee_id, 'submit',
        CASE WHEN u.status = 'pending' THEN u.approval_step ELSE NULL END,
        NULL,
        u.usage_date, u.usage_type, u.days, u.reason,
        e.emp_no, e.name, e.workplace, e.workplace_code, e.department, e.position,
        e.emp_no, e.name, e.position, u.created_at
      FROM leave_usages u
      JOIN employees e ON e.id = u.employee_id
      WHERE u.created_by = 'employee'
        AND NOT EXISTS (
          SELECT 1 FROM leave_approval_logs l
          WHERE l.leave_usage_id = u.id AND l.action = 'submit'
        );
    `);
    database
      .prepare(
        `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('leave_approval_logs_submit_backfill_v1', '1')`
      )
      .run();
  }

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
       OR position NOT IN ('팀원', '팀장', '공장장', '이사', '상무', '전무', '임원', '대표이사')
  `);

  importRosterSeed(database);
  seedApprovalRules(database);
  seedApprovalSeats(database);

  // 7월 말 임포트 잔액인데 as_of가 8/31로 들어간 경우 보정.
  // 재임포트 후에도 항상 맞춰 두어 8월 사용분이 스냅샷 이후 차감에 잡히게 한다.
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

async function openSqlite() {
  const nodeSqlite = await loadNodeSqlite();
  const sync = new SqliteSyncDb(nodeSqlite ? createNodeSqliteDriver(nodeSqlite) : await createSqlJsDriver());
  sync.pragma('foreign_keys = ON');
  sync.transaction(() => migrate(sync));
  const database = new Db(createSqliteBackend(sync));
  await runSqlMigrations(database);
  return database;
}

/**
 * DB_CLIENT=postgres 이면 PostgreSQL(DB_HOST·DB_PORT·DB_NAME·DB_USER·DB_PASSWORD 또는 DATABASE_URL)을 씁니다.
 * PostgreSQL이 비어 있으면 기존 SQLite 파일(DB_PATH)의 데이터를 한 번 옮겨 옵니다. SQLite 파일은 그대로 둡니다.
 */
async function openPostgres() {
  const { createPostgresBackend, describeConnection } = await import('./dbPostgres.js');
  const database = new Db(await createPostgresBackend());
  database.location = describeConnection();
  await database.backend.ensureSchema(PG_SCHEMA_PATH);
  await runSqlMigrations(database);

  const { importSqliteIfEmpty } = await import('./dbImport.js');
  const imported = await importSqliteIfEmpty(database, openSqlite, { sourceLabel: DB_PATH });
  if (imported) {
    const tables = Object.entries(imported.tables).map(([name, count]) => `${name}=${count}`).join(', ');
    console.error(`[db] SQLite → PostgreSQL 이전 완료 (${DB_PATH}): ${tables}`);
    for (const line of imported.orphans) console.warn(`[db] 이전 중 정리: ${line}`);
  }
  return database;
}

// Cafe24 AI Space는 콘솔에서 넣은 DB_* 변수를 전달하지 않으므로 APP_DB_CLIENT도 받습니다.
export const DB_CLIENT_SETTING = process.env.DB_CLIENT || process.env.APP_DB_CLIENT || '';
const USE_POSTGRES = /^(postgres|postgresql|pg|pgsql)$/i.test(DB_CLIENT_SETTING);
const db = USE_POSTGRES ? await openPostgres() : await openSqlite();

export function getDb() {
  return db;
}

export function getDbPath() {
  return db.location || DB_PATH;
}

export function getDbDriverName() {
  return db.backend.name;
}

export function getDbDialect() {
  return db.dialect;
}

export async function closeDb() {
  await db.close();
}

export function parseEmployeeId(id) {
  if (!id) return null;
  const str = String(id);
  const match = str.match(/^emp-(\d+)$/i);
  return match ? Number(match[1]) : Number(str);
}

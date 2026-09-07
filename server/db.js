import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { INITIAL_ADMIN_NAMES } from '../src/constants/hr.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/holiday.db');

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

function migrate(database) {
  const cols = database.prepare('PRAGMA table_info(employees)').all().map((c) => c.name);
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
    UPDATE employees
    SET position = '팀원'
    WHERE position IS NULL
       OR trim(position) = ''
       OR position = '-'
       OR position NOT IN ('팀원', '팀장')
  `);

  const latestCols = database.prepare('PRAGMA table_info(employees)').all().map((c) => c.name);
  if (latestCols.length && !latestCols.includes('is_admin')) {
    database.exec('ALTER TABLE employees ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
    const placeholders = INITIAL_ADMIN_NAMES.map(() => '?').join(', ');
    database.prepare(`UPDATE employees SET is_admin = 1 WHERE name IN (${placeholders})`).run(
      ...INITIAL_ADMIN_NAMES
    );
  }
}

sqlDb.run('PRAGMA foreign_keys = ON');
migrate(db);

export function getDb() {
  return db;
}

export function parseEmployeeId(id) {
  if (!id) return null;
  const str = String(id);
  const match = str.match(/^emp-(\d+)$/i);
  return match ? Number(match[1]) : Number(str);
}

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/holiday.db');

let db;

function migrate(dbInstance) {
  const cols = dbInstance.prepare("PRAGMA table_info(employees)").all().map((c) => c.name);
  if (!cols.includes('terminated_date')) {
    dbInstance.exec('ALTER TABLE employees ADD COLUMN terminated_date TEXT');
  }
}

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

export function parseEmployeeId(id) {
  if (!id) return null;
  const str = String(id);
  const match = str.match(/^emp-(\d+)$/i);
  return match ? Number(match[1]) : Number(str);
}

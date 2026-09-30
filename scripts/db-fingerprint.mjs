import { createHash } from 'node:crypto';
import { getDb, getDbDialect, getDbDriverName, closeDb } from '../server/db.js';

const db = getDb();
const tableSql =
  getDbDialect() === 'postgres'
    ? `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`
    : `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`;
const tables = (await db.prepare(tableSql).all()).map((row) => row.name);

async function orderColumn(table) {
  const sql =
    getDbDialect() === 'postgres'
      ? `SELECT column_name AS name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position`
      : `SELECT name FROM pragma_table_info(?) ORDER BY cid`;
  const columns = (await db.prepare(sql).all(table)).map((row) => row.name);
  return columns.includes('id') ? 'id' : columns[0];
}

const result = { driver: getDbDriverName(), tables: {} };
for (const table of tables.sort()) {
  const rows = await db.prepare(`SELECT * FROM "${table}" ORDER BY "${await orderColumn(table)}"`).all();
  const hash = createHash('sha256');
  for (const row of rows) {
    const ordered = Object.keys(row)
      .sort()
      .map((key) => [key, row[key]]);
    hash.update(JSON.stringify(ordered));
  }
  result.tables[table] = { count: rows.length, sha256: hash.digest('hex').slice(0, 16) };
}

console.log(JSON.stringify(result, null, 2));
await closeDb();

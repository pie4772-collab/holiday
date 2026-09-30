import { createHash } from 'node:crypto';
import { getDb, getDbDriverName } from '../server/db.js';

const db = getDb();
const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  .all()
  .map((row) => row.name);

const result = { driver: getDbDriverName(), tables: {} };
for (const table of tables) {
  const rows = db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
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

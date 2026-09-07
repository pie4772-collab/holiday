import { getDb } from '../server/db.js';

const admins = getDb()
  .prepare('SELECT name, emp_no, is_admin FROM employees WHERE is_admin = 1 ORDER BY name')
  .all();
const total = getDb().prepare('SELECT COUNT(*) AS c FROM employees').get();

console.log(JSON.stringify({ total: total.c, adminCount: admins.length, admins }, null, 2));

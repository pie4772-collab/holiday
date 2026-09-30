import { getDb } from '../server/db.js';
import { syncUsersFromEmployees } from '../server/services/authService.js';

const users = await syncUsersFromEmployees();
const employees = await getDb().prepare('SELECT COUNT(*) AS c FROM employees').get();
const missing = await getDb()
  .prepare("SELECT COUNT(*) AS c FROM employees WHERE emp_no IS NULL OR trim(emp_no) = ''")
  .get();
const positions = await getDb()
  .prepare('SELECT position, COUNT(*) AS c FROM employees GROUP BY position ORDER BY position')
  .all();

console.log(
  JSON.stringify(
    {
      employees: employees.c,
      users,
      missingEmpNo: missing.c,
      positions,
    },
    null,
    2
  )
);

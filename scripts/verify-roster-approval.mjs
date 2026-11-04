import { getDb } from '../server/db.js';
import { getEmployeeRoster } from '../server/services/employeeService.js';
import { canApproveRequests, canApproveUsage } from '../server/services/approvalService.js';

const db = getDb();
const counts = await db.prepare(
  `SELECT
     COUNT(*) AS total,
     SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) AS admins,
     SUM(CASE WHEN position = '팀장' THEN 1 ELSE 0 END) AS leads,
     SUM(CASE WHEN position = '공장장' THEN 1 ELSE 0 END) AS factories,
     SUM(CASE WHEN workplace_code IS NOT NULL THEN 1 ELSE 0 END) AS with_codes
   FROM employees`
).get();

const roster = await getEmployeeRoster(true);
const leaked = roster.some(
  (e) =>
    'workplaceCode' in e ||
    'departmentCode' in e ||
    'positionCode' in e ||
    'concurrentDeptCode' in e ||
    'concurrentPositionCode' in e
);

const snapshotCount = (await db.prepare('SELECT COUNT(*) AS c FROM leave_balance_snapshots').get()).c;
const usageCount = (await db.prepare('SELECT COUNT(*) AS c FROM leave_usages').get()).c;
const meta = await db.prepare('SELECT * FROM app_meta ORDER BY key').all();

const sampleLead = await db
  .prepare(`SELECT id, name, position FROM employees WHERE position = '팀장' ORDER BY id LIMIT 1`)
  .get();
const sampleMember = await db
  .prepare(
    `SELECT id, name FROM employees WHERE workplace_code = (
       SELECT workplace_code FROM employees WHERE id = ?
     ) AND department_code = (
       SELECT department_code FROM employees WHERE id = ?
     ) AND position = '팀원' ORDER BY id LIMIT 1`
  )
  .get(sampleLead?.id, sampleLead?.id);

console.log(
  JSON.stringify(
    {
      counts,
      leakedCodes: leaked,
      snapshots: snapshotCount,
      usages: usageCount,
      meta,
      sampleLeadCanApprove: sampleLead ? await canApproveRequests(sampleLead.id) : null,
      leadCanApproveMember:
        sampleLead && sampleMember ? await canApproveUsage(sampleLead.id, sampleMember.id) : null,
    },
    null,
    2
  )
);

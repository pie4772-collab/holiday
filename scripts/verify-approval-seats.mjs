import { getDb } from '../server/db.js';
import { approvalHintFor, getApprovalChain, listApprovalLines } from '../server/services/approvalService.js';

const db = getDb();
const lines = await listApprovalLines();
const sampleSql = (department) =>
  `SELECT * FROM employees WHERE department = '${department}' AND position = '팀장' ORDER BY id LIMIT 1`;
const samples = {
  finance: await db.prepare(sampleSql('재경팀')).get(),
  export: await db.prepare(sampleSql('수출2팀')).get(),
  sales: await db.prepare(sampleSql('영업1팀')).get(),
  purchase: await db.prepare(sampleSql('구매팀')).get(),
};

const hints = {};
for (const [key, emp] of Object.entries(samples)) {
  hints[key] = emp ? { chain: await getApprovalChain(emp), hint: await approvalHintFor(emp) } : null;
}

console.log(
  JSON.stringify(
    {
      seats: lines.seats.map((s) => ({
        title: s.title,
        vacant: s.vacant,
        employeeName: s.employeeName,
        depts: s.scopes.map((x) => x.departmentName),
      })),
      hints,
    },
    null,
    2
  )
);

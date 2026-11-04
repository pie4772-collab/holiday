import { getDb } from '../server/db.js';
import {
  approvalHintFor,
  canApproveUsage,
  getApprovalChain,
  nextApprovalStep,
} from '../server/services/approvalService.js';

const db = getDb();
const park = await db.prepare(`SELECT * FROM employees WHERE name = '박지은' ORDER BY id LIMIT 1`).get();
const strategy = await db
  .prepare(`SELECT * FROM employees WHERE department = '경영전략실' AND position = '팀원' ORDER BY id LIMIT 1`)
  .get();
const otherLead = await db
  .prepare(
    `SELECT * FROM employees WHERE workplace = '서울' AND position = '팀장' AND is_admin = 0 ORDER BY id LIMIT 1`
  )
  .get();
const mappings = await db
  .prepare('SELECT role, workplace_code, department_code FROM approval_mappings ORDER BY id')
  .all();

console.log(
  JSON.stringify(
    {
      mappings,
      strategyHint: strategy ? await approvalHintFor(strategy) : null,
      strategyChain: strategy ? await getApprovalChain(strategy) : null,
      otherLeadCannotApproveStrategy:
        otherLead && strategy ? await canApproveUsage(otherLead.id, { employee_id: strategy.id }) : null,
      parkCanApproveStrategy:
        park && strategy ? await canApproveUsage(park.id, { employee_id: strategy.id }) : null,
      seoulLeadChain: otherLead ? await getApprovalChain(otherLead) : null,
      seoulLeadFirstHint: otherLead ? await approvalHintFor(otherLead) : null,
      seoulLeadNext: otherLead ? await nextApprovalStep(otherLead, '임원') : null,
    },
    null,
    2
  )
);

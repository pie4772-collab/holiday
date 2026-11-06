import { getDb } from '../db.js';
import { LEAD_POSITIONS, SEOUL_WORKPLACE_CODE, isOfficerPosition } from '../../src/constants/hr.js';

function code(value) {
  return value == null ? '' : String(value).trim();
}

/** 공장(서울 외 사업장)의 이사·상무·전무는 결재에서 공장장 단계를 맡으므로 그 사업장의 공장장 자리에 둡니다. */
function isSeoul(row) {
  const wc = code(row.workplace_code);
  return wc === SEOUL_WORKPLACE_CODE || row.workplace === '서울' || (!wc && !code(row.workplace));
}

function byCode(a, b) {
  return (Number(a.code) || 0) - (Number(b.code) || 0) || String(a.name).localeCompare(String(b.name), 'ko');
}

function person(row, extra = {}) {
  return {
    id: String(row.id),
    name: row.name,
    empNo: row.emp_no || '',
    position: row.position || '',
    jobRank: row.job_rank || '',
    jobType: row.job_type || '',
    workplace: row.workplace || '',
    department: row.department || '',
    ...extra,
  };
}

/** 가장 많은 사람이 속한 사업장. 부서코드가 같은데 사업장이 다른 사람이 섞여 있어도 한 곳에 둡니다. */
function mainWorkplace(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = code(row.workplace_code);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

/**
 * 조직도: 대표이사 → 임원(결재 라인 자리) → 사업장(공장장) → 부서(팀장·팀원).
 * 따로 저장한 조직 정보 없이 재직 직원의 사업장·부서·직급과 결재 라인 설정으로 그립니다.
 * employeeIds 가 있으면 그 직원만 보여 줍니다(사업장관리자 범위).
 */
export async function getOrgChart(employeeIds = null) {
  const db = getDb();
  const all = await db.prepare('SELECT * FROM employees WHERE is_active = 1 ORDER BY name, id').all();
  const rows = employeeIds ? all.filter((row) => employeeIds.has(String(row.id))) : all;

  /** 담당 자리는 결재 라인에서만 쓰는 자리라 조직도에는 넣지 않습니다. */
  const seats = (await db.prepare('SELECT * FROM approval_seats ORDER BY sort_order, id').all()).filter(
    (s) => s.step_role !== '담당'
  );
  const scopes = await db.prepare('SELECT * FROM approval_seat_scopes ORDER BY id').all();
  const holderOf = (seat) => all.find((row) => Number(row.id) === Number(seat.employee_id)) || null;
  const seatTitlesByDept = new Map();
  for (const scope of scopes) {
    const seat = seats.find((s) => Number(s.id) === Number(scope.seat_id));
    if (!seat) continue;
    const key = code(scope.department_code);
    if (!seatTitlesByDept.has(key)) seatTitlesByDept.set(key, []);
    seatTitlesByDept.get(key).push(seat.title);
  }

  const ceoSeat = seats.find((s) => s.step_role === '대표이사');
  const ceoRows = rows.filter((row) => row.position === '대표이사');
  const ceoHolder = ceoSeat ? holderOf(ceoSeat) : null;
  if (ceoHolder && !ceoRows.some((row) => Number(row.id) === Number(ceoHolder.id))) ceoRows.unshift(ceoHolder);

  const seatHolderIds = new Set();
  const officers = seats
    .filter((s) => s.step_role !== '대표이사')
    .map((seat) => {
      const holder = holderOf(seat);
      if (holder) seatHolderIds.add(Number(holder.id));
      return {
        key: seat.seat_key,
        title: seat.title,
        role: seat.step_role,
        holder: holder ? person(holder) : null,
        departments: scopes
          .filter((scope) => Number(scope.seat_id) === Number(seat.id))
          .map((scope) => scope.department_name || scope.department_code),
      };
    });
  const factoryOfficers = [];
  for (const row of rows) {
    if (!isOfficerPosition(row.position)) continue;
    if (!isSeoul(row)) factoryOfficers.push(row);
    else if (!seatHolderIds.has(Number(row.id))) {
      officers.push({ key: `emp-${row.id}`, title: row.position, role: '임원', holder: person(row), departments: [] });
    }
  }

  const topIds = new Set([...ceoRows.map((row) => Number(row.id)), ...rows.filter((row) => isOfficerPosition(row.position)).map((row) => Number(row.id))]);
  const staff = rows.filter((row) => !topIds.has(Number(row.id)));

  const deptGroups = new Map();
  for (const row of staff) {
    const key = code(row.department_code) || `name:${code(row.department) || '미지정'}`;
    if (!deptGroups.has(key)) deptGroups.set(key, []);
    deptGroups.get(key).push(row);
  }

  const workplaces = new Map();
  const workplaceOf = (wc, sample) => {
    if (!workplaces.has(wc)) {
      workplaces.set(wc, { code: wc, name: sample?.workplace || '사업장 미지정', heads: [], departments: [] });
    }
    return workplaces.get(wc);
  };

  for (const [key, members] of deptGroups) {
    const wc = mainWorkplace(members);
    const sample = members.find((row) => code(row.workplace_code) === wc) || members[0];
    const workplace = workplaceOf(wc, sample);
    const deptCode = key.startsWith('name:') ? '' : key;
    const heads = members.filter((row) => row.position === '공장장');
    for (const head of heads) workplace.heads.push(person(head));
    const leads = members.filter((row) => LEAD_POSITIONS.includes(row.position));
    const concurrentLeads = deptCode
      ? staff.filter(
          (row) =>
            LEAD_POSITIONS.includes(row.concurrent_position) &&
            code(row.concurrent_dept_code) === deptCode &&
            !leads.some((lead) => Number(lead.id) === Number(row.id))
        )
      : [];
    const others = members.filter((row) => row.position !== '공장장' && !LEAD_POSITIONS.includes(row.position));
    workplace.departments.push({
      code: deptCode,
      name: sample.department || '부서 미지정',
      leads: [
        ...leads.map((row) => person(row, { label: '팀장' })),
        ...concurrentLeads.map((row) => person(row, { label: '팀장(겸직)', concurrent: true })),
      ],
      members: others.map((row) => person(row)),
      headcount: members.length - heads.length,
      officerTitles: deptCode ? seatTitlesByDept.get(deptCode) || [] : [],
    });
  }

  for (const row of factoryOfficers) workplaceOf(code(row.workplace_code), row).heads.unshift(person(row));

  const workplaceList = [...workplaces.values()].sort(byCode);
  for (const workplace of workplaceList) workplace.departments.sort(byCode);

  return {
    ceo: ceoRows.map((row) => person(row)),
    ceoVacant: !ceoRows.length,
    officers,
    workplaces: workplaceList,
    total: rows.length,
  };
}

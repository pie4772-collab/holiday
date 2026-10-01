import { getDb } from '../db.js';
import {
  ATTENDANCE_FLAGS,
  DAY_BOUNDARY_HOUR,
  NIGHT_END_MINUTES,
  NIGHT_START_MINUTES,
  PLACE_MAX_LENGTH,
  REMOTE_WORK_TYPES,
  TRIP_WORK_TYPES,
  WORK_TYPE_LABELS,
  WORK_TYPES,
} from '../../src/constants/attendance.js';
import { isLeaveExemptPosition } from '../../src/constants/hr.js';
import { getHolidayName, isNonWorkingDay, nonWorkingDayReason } from '../../src/utils/workCalendar.js';
import { ipInRanges, parseIpRanges } from '../utils/clientIp.js';
import { canReviewRemote, remoteReviewRequired, remoteReviewerLabel } from './approvalService.js';

const META_START_DATE = 'attendance_start_date';
const META_PROXY_HOPS = 'attendance_proxy_hops';
const DEFAULT_SITE_CODE = '1';
const BOUNDARY_MINUTES = DAY_BOUNDARY_HOUR * 60;
const WORK_TYPE_KEYS = WORK_TYPES.map((t) => t.key);
const FLAG_ORDER = new Map(ATTENDANCE_FLAGS.map((flag, index) => [flag.key, index]));
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function httpError(message, status = 400, code) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

/* ───────────── 시간 (한국 표준시) ───────────── */

const kstFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function kstNow(date = new Date()) {
  const parts = Object.fromEntries(kstFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}:${parts.second}`;
  return { date: day, time, stamp: `${day} ${time}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function dateToUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(key, days) {
  return new Date(dateToUtc(key) + days * 86400000).toISOString().slice(0, 10);
}

function diffDays(a, b) {
  return Math.round((dateToUtc(a) - dateToUtc(b)) / 86400000);
}

function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  return new Date(dateToUtc(value)).toISOString().slice(0, 10) === value;
}

function parseMonth(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) throw httpError('월은 YYYY-MM 형식으로 입력해주세요.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw httpError('월을 확인해주세요.');
  const first = `${match[1]}-${match[2]}-01`;
  const last = addDays(month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`, -1);
  return { year, month, first, last, key: `${match[1]}-${match[2]}` };
}

function hhmmToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function minutesToHhmm(minutes) {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

/** 근무일 0시 기준 분. 다음날 새벽 퇴근은 1440 이상이 됩니다. */
function minutesOnWorkDate(stamp, workDate) {
  if (!stamp) return null;
  const day = stamp.slice(0, 10);
  const minutes = hhmmToMinutes(stamp.slice(11, 16));
  if (minutes == null) return null;
  return diffDays(day, workDate) * 1440 + minutes;
}

/** 새벽 5시 이전은 전날 근무로 봅니다. */
function workDateOf(now) {
  return now.minutes < BOUNDARY_MINUTES ? addDays(now.date, -1) : now.date;
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/* ───────────── 설정 ───────────── */

async function getMeta(key) {
  const row = await getDb().prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

async function setMeta(key, value) {
  const db = getDb();
  if (value == null || value === '') {
    await db.prepare('DELETE FROM app_meta WHERE key = ?').run(key);
    return;
  }
  await db
    .prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

export async function getProxyHops() {
  const stored = await getMeta(META_PROXY_HOPS);
  const value = stored != null ? Number(stored) : Number(process.env.APP_TRUST_PROXY_HOPS ?? 1);
  return Number.isInteger(value) && value >= 0 && value <= 5 ? value : 1;
}

function mapSite(row) {
  const { ranges, invalid } = parseIpRanges(row.ip_ranges);
  return {
    code: String(row.workplace_code),
    name: row.name,
    workStart: row.work_start,
    workEnd: row.work_end,
    lunchStart: row.lunch_start,
    lunchEnd: row.lunch_end,
    graceMinutes: Number(row.grace_minutes) || 0,
    ipRanges: ranges.map((r) => r.cidr),
    invalidRanges: invalid,
    m: {
      workStart: hhmmToMinutes(row.work_start),
      workEnd: hhmmToMinutes(row.work_end),
      lunchStart: hhmmToMinutes(row.lunch_start),
      lunchEnd: hhmmToMinutes(row.lunch_end),
      grace: Number(row.grace_minutes) || 0,
    },
    ranges,
  };
}

function publicSite(site) {
  if (!site) return null;
  const { m: _m, ranges: _r, invalidRanges: _i, ...rest } = site;
  return rest;
}

async function loadSites() {
  const rows = await getDb().prepare('SELECT * FROM attendance_sites ORDER BY workplace_code').all();
  return new Map(rows.map((row) => [String(row.workplace_code), mapSite(row)]));
}

function siteFor(employee, sites) {
  return sites.get(text(employee?.workplace_code)) || sites.get(DEFAULT_SITE_CODE) || [...sites.values()][0] || null;
}

/** 어느 사업장이든 허용 대역에 들면 사무실 출퇴근으로 인정합니다. */
function matchIpSite(ip, sites) {
  for (const site of sites.values()) {
    if (ipInRanges(ip, site.ranges)) return site;
  }
  return null;
}

async function getStartDate() {
  const stored = await getMeta(META_START_DATE);
  if (stored && isDateKey(stored)) return stored;
  const row = await getDb().prepare('SELECT MIN(work_date) AS d FROM attendance_records').get();
  return row?.d || null;
}

export async function getSettings() {
  const sites = await loadSites();
  return {
    sites: [...sites.values()].map(publicSite),
    startDate: (await getMeta(META_START_DATE)) || '',
    effectiveStartDate: await getStartDate(),
    proxyHops: await getProxyHops(),
  };
}

function validateTime(value, label) {
  const minutes = hhmmToMinutes(text(value));
  if (minutes == null) throw httpError(`${label} 시각을 HH:MM 형식으로 입력해주세요.`);
  return minutesToHhmm(minutes);
}

export async function saveSettings(data, actorId) {
  const sites = Array.isArray(data?.sites) ? data.sites : [];
  const existing = await loadSites();
  const updates = [];
  for (const input of sites) {
    const current = existing.get(text(input.code));
    if (!current) throw httpError(`알 수 없는 사업장입니다: ${text(input.code)}`);
    const label = current.name;
    const workStart = validateTime(input.workStart, `${label} 출근`);
    const workEnd = validateTime(input.workEnd, `${label} 퇴근`);
    const lunchStart = validateTime(input.lunchStart, `${label} 점심 시작`);
    const lunchEnd = validateTime(input.lunchEnd, `${label} 점심 종료`);
    const m = [workStart, lunchStart, lunchEnd, workEnd].map(hhmmToMinutes);
    if (!(m[0] < m[1] && m[1] < m[2] && m[2] < m[3])) {
      throw httpError(`${label}: 출근 < 점심 시작 < 점심 종료 < 퇴근 순서가 되어야 합니다.`);
    }
    const grace = Number(input.graceMinutes);
    if (!Number.isInteger(grace) || grace < 0 || grace > 120) {
      throw httpError(`${label}: 인정 시간은 0~120분 사이로 입력해주세요.`);
    }
    const rangesText = Array.isArray(input.ipRanges) ? input.ipRanges.join('\n') : text(input.ipRanges);
    const { ranges, invalid } = parseIpRanges(rangesText);
    if (invalid.length) throw httpError(`${label}: IP 대역 형식이 잘못되었습니다 (${invalid.join(', ')}).`);
    updates.push({
      code: current.code,
      workStart,
      workEnd,
      lunchStart,
      lunchEnd,
      grace,
      ipRanges: ranges.map((r) => r.cidr).join('\n'),
    });
  }

  let startDate = null;
  if (data && 'startDate' in data) {
    startDate = text(data.startDate);
    if (startDate && !isDateKey(startDate)) throw httpError('근태 판정 시작일을 확인해주세요.');
  }
  let hops = null;
  if (data && data.proxyHops != null && data.proxyHops !== '') {
    hops = Number(data.proxyHops);
    if (!Number.isInteger(hops) || hops < 0 || hops > 5) throw httpError('프록시 단계는 0~5 사이로 입력해주세요.');
  }

  const db = getDb();
  await db.transaction(async () => {
    for (const u of updates) {
      await db
        .prepare(
          `UPDATE attendance_sites
           SET work_start = ?, work_end = ?, lunch_start = ?, lunch_end = ?, grace_minutes = ?, ip_ranges = ?,
               updated_by = ?, updated_at = datetime('now', 'localtime')
           WHERE workplace_code = ?`
        )
        .run(u.workStart, u.workEnd, u.lunchStart, u.lunchEnd, u.grace, u.ipRanges, actorId ?? null, u.code);
    }
    if (startDate != null) await setMeta(META_START_DATE, startDate);
    if (hops != null) await setMeta(META_PROXY_HOPS, hops);
  });
  return getSettings();
}

/* ───────────── 연차 연동 ───────────── */

async function loadLeaves(from, to, employeeId = null) {
  const params = [from, to];
  let where = `usage_date BETWEEN ? AND ? AND status IN ('pending', 'approved')`;
  if (employeeId != null) {
    where += ' AND employee_id = ?';
    params.push(Number(employeeId));
  }
  const rows = await getDb()
    .prepare(`SELECT employee_id, usage_date, usage_type, half_period, status, days FROM leave_usages WHERE ${where}`)
    .all(...params);
  const map = new Map();
  for (const row of rows) {
    const key = `${row.employee_id}|${row.usage_date}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/** 같은 날 신청 여러 건을 하루 단위로 요약합니다. 반차 둘이면 종일로 봅니다. */
function summarizeLeave(list) {
  if (!list?.length) return null;
  const status = list.some((row) => row.status === 'pending') ? 'pending' : 'approved';
  const total = list.reduce((acc, row) => acc + (Number(row.days) || 0), 0);
  const periods = new Set(list.filter((row) => row.usage_type === 'half').map((row) => row.half_period || ''));
  if (list.some((row) => row.usage_type !== 'half') || total >= 1 || (periods.has('am') && periods.has('pm'))) {
    return { kind: 'full', period: null, status };
  }
  const period = periods.has('am') ? 'am' : periods.has('pm') ? 'pm' : null;
  return { kind: 'half', period, status };
}

/* ───────────── 판정 ───────────── */

function mapRecord(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    workDate: row.work_date,
    checkInAt: row.check_in_at || null,
    checkInIp: row.check_in_ip || null,
    checkInType: row.check_in_type || null,
    checkInPlace: row.check_in_place || null,
    checkOutAt: row.check_out_at || null,
    checkOutIp: row.check_out_ip || null,
    checkOutType: row.check_out_type || null,
    checkOutPlace: row.check_out_place || null,
    corrected: Boolean(row.corrected),
    note: row.note || null,
    remoteStatus: row.remote_status || null,
    remoteReviewedAt: row.remote_reviewed_at || null,
    remoteRejectReason: row.remote_reject_reason || null,
  };
}

function hasRemoteType(record) {
  return [record?.checkInType, record?.checkOutType].some((t) => REMOTE_WORK_TYPES.includes(t));
}

/** 반차 시간대 미지정(이전 신청)은 출근 시각으로 오전/오후를 정합니다. */
function resolveHalfPeriod(leave, site, inMinutes) {
  if (leave?.kind !== 'half') return null;
  if (leave.period) return leave.period;
  if (inMinutes == null) return null;
  return inMinutes >= site.m.lunchStart - site.m.grace ? 'am' : 'pm';
}

function scheduleFor(site, leave, period) {
  if (!site || leave?.kind === 'full') return null;
  return {
    start: period === 'am' ? site.m.lunchEnd : site.m.workStart,
    end: period === 'pm' ? site.m.lunchStart : site.m.workEnd,
  };
}

/**
 * 하루 근태를 계산합니다. 기록·연차가 바뀌면 다시 계산되도록 저장하지 않고 조회 때마다 판정합니다.
 */
export function evaluateDay({ employee, site, date, record, leave, today, nowMinutes, startDate }) {
  const flags = new Set();
  const nonWorking = isNonWorkingDay(date);
  const exempt = isLeaveExemptPosition(employee?.position);
  const inMin = minutesOnWorkDate(record?.checkInAt, date);
  const outMin = minutesOnWorkDate(record?.checkOutAt, date);
  const types = [record?.checkInType, record?.checkOutType].filter(Boolean);
  const remote = hasRemoteType(record);
  // 외근·출장은 상급자가 확인해야 인정합니다. 확인 전·반려는 사무실 출퇴근과 같이 판정합니다.
  const remoteApproved = remote && record.remoteStatus === 'approved';
  const isTrip = remoteApproved && types.some((t) => TRIP_WORK_TYPES.includes(t));
  const hasRecord = inMin != null || outMin != null;
  const tracked = Boolean(startDate) && date >= startDate;
  const isPast = date < today;
  const isToday = date === today;
  const grace = site?.m.grace ?? 0;

  const period = resolveHalfPeriod(leave, site, inMin);
  const schedule = nonWorking ? null : scheduleFor(site, leave, period);

  if (leave?.kind === 'full') flags.add('leave_full');
  if (leave?.kind === 'half') flags.add(period === 'am' ? 'leave_am' : period === 'pm' ? 'leave_pm' : 'leave_half');
  if (nonWorking) flags.add(hasRecord ? 'holiday_work' : 'holiday');
  if (isTrip) flags.add('trip');
  else if (remoteApproved) flags.add('outside');
  else if (remote) flags.add(record.remoteStatus === 'rejected' ? 'remote_rejected' : 'remote_pending');

  let workMinutes = 0;
  let overtimeMinutes = 0;
  let nightMinutes = 0;
  if (inMin != null && outMin != null && outMin > inMin) {
    const lunch = site ? overlap(inMin, outMin, site.m.lunchStart, site.m.lunchEnd) : 0;
    workMinutes = outMin - inMin - lunch;
    nightMinutes =
      overlap(inMin, outMin, 0, NIGHT_END_MINUTES) + overlap(inMin, outMin, NIGHT_START_MINUTES, 1440 + NIGHT_END_MINUTES);
  }

  if (schedule) {
    if (!hasRecord) {
      if (exempt) flags.add('exempt');
      else if (tracked && isPast) flags.add('absent');
      else if (tracked && isToday && nowMinutes > schedule.start + grace) flags.add('not_yet');
    } else {
      if (inMin == null) flags.add('missing_in');
      if (inMin != null && outMin == null) flags.add(isPast ? 'missing_out' : 'working');
      const judge = !exempt && !remoteApproved;
      if (judge && inMin != null && inMin > schedule.start + grace) flags.add('late');
      if (judge && outMin != null && outMin < schedule.end - grace) flags.add('early');
      if (outMin != null && outMin > schedule.end + grace) {
        overtimeMinutes = outMin - Math.max(schedule.end, inMin ?? schedule.end);
        flags.add('overtime');
      }
    }
  } else if (nonWorking && workMinutes) {
    overtimeMinutes = workMinutes;
  }

  const problems = ['absent', 'missing_in', 'missing_out', 'late', 'early', 'not_yet', 'working'];
  if (hasRecord && schedule && !problems.some((p) => flags.has(p))) flags.add('normal');
  if (!flags.size) flags.add('none');

  const sorted = [...flags].sort((a, b) => (FLAG_ORDER.get(a) ?? 99) - (FLAG_ORDER.get(b) ?? 99));
  return {
    flags: sorted,
    primary: sorted[0],
    halfPeriod: period,
    scheduledStart: schedule ? minutesToHhmm(schedule.start) : null,
    scheduledEnd: schedule ? minutesToHhmm(schedule.end) : null,
    lateMinutes: flags.has('late') ? inMin - schedule.start : 0,
    earlyMinutes: flags.has('early') ? schedule.end - outMin : 0,
    workMinutes,
    overtimeMinutes: Math.max(0, overtimeMinutes),
    nightMinutes,
    exempt,
    isWorkingDay: !nonWorking,
    holidayName: nonWorking ? nonWorkingDayReason(date) || null : getHolidayName(date),
  };
}

function emptySummary() {
  return {
    scheduledDays: 0,
    attendedDays: 0,
    late: 0,
    early: 0,
    absent: 0,
    missingIn: 0,
    missingOut: 0,
    leaveDays: 0,
    tripDays: 0,
    outsideDays: 0,
    remotePending: 0,
    holidayWorkDays: 0,
    workMinutes: 0,
    overtimeMinutes: 0,
    nightMinutes: 0,
  };
}

function addToSummary(summary, day) {
  const f = new Set(day.evaluation.flags);
  if (day.evaluation.isWorkingDay) summary.scheduledDays += 1;
  if (day.record?.checkInAt || day.record?.checkOutAt) summary.attendedDays += 1;
  if (f.has('late')) summary.late += 1;
  if (f.has('early')) summary.early += 1;
  if (f.has('absent')) summary.absent += 1;
  if (f.has('missing_in')) summary.missingIn += 1;
  if (f.has('missing_out')) summary.missingOut += 1;
  if (f.has('leave_full') && day.evaluation.isWorkingDay) summary.leaveDays += 1;
  if ((f.has('leave_am') || f.has('leave_pm') || f.has('leave_half')) && day.evaluation.isWorkingDay) {
    summary.leaveDays += 0.5;
  }
  if (f.has('trip')) summary.tripDays += 1;
  if (f.has('outside')) summary.outsideDays += 1;
  if (f.has('remote_pending')) summary.remotePending += 1;
  if (f.has('holiday_work')) summary.holidayWorkDays += 1;
  summary.workMinutes += day.evaluation.workMinutes;
  summary.overtimeMinutes += day.evaluation.overtimeMinutes;
  summary.nightMinutes += day.evaluation.nightMinutes;
}

function employeeInfo(row) {
  return {
    employeeId: String(row.id),
    empNo: row.emp_no || '',
    name: row.name,
    workplace: row.workplace || '',
    workplaceCode: row.workplace_code || '',
    department: row.department || '',
    position: row.position || '',
  };
}

/** 근무 기간 밖(입사 전·퇴사 후)인 날은 판정하지 않습니다. */
function isEmployedOn(employee, date) {
  if (employee.hire_date && date < employee.hire_date) return false;
  if (employee.terminated_date && date > employee.terminated_date) return false;
  return true;
}

async function isClosed(date) {
  const row = await getDb()
    .prepare('SELECT closed_at FROM attendance_closings WHERE year = ? AND month = ?')
    .get(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
  return row ? row.closed_at : null;
}

/* ───────────── 직원 출퇴근 ───────────── */

async function getEmployee(employeeId) {
  const row = await getDb().prepare('SELECT * FROM employees WHERE id = ?').get(Number(employeeId));
  if (!row) throw httpError('직원을 찾을 수 없습니다.', 404);
  return row;
}

async function getRecordRow(employeeId, date) {
  return getDb()
    .prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND work_date = ?')
    .get(Number(employeeId), date);
}

async function buildTodayContext(employeeId, ip, nowDate) {
  const now = kstNow(nowDate);
  const workDate = workDateOf(now);
  const employee = await getEmployee(employeeId);
  const sites = await loadSites();
  const site = siteFor(employee, sites);
  const record = mapRecord(await getRecordRow(employee.id, workDate));
  const leave = summarizeLeave((await loadLeaves(workDate, workDate, employee.id)).get(`${employee.id}|${workDate}`));
  const ipSite = matchIpSite(ip, sites);
  const closedAt = await isClosed(workDate);
  // 새벽(전날 근무 시간대)이면 현재 시각을 근무일 기준 분으로 바꿉니다.
  const nowMinutes = minutesOnWorkDate(now.stamp, workDate);
  return { now, workDate, nowMinutes, employee, sites, site, record, leave, ipSite, closedAt, ip };
}

function leaveLabel(leave) {
  if (!leave) return '';
  const status = leave.status === 'pending' ? '승인 대기' : '승인';
  if (leave.kind === 'full') return `연차(${status})`;
  const period = leave.period === 'am' ? '오전 ' : leave.period === 'pm' ? '오후 ' : '';
  return `${period}반차(${status})`;
}

/** 지금 출근·퇴근을 기록할 수 있는지와 막히는 이유 */
function actionAvailability(ctx) {
  const { now, workDate, record, leave, site, closedAt } = ctx;
  const common = (() => {
    if (!ctx.employee.is_active) return '재직 중인 직원만 기록할 수 있습니다.';
    if (closedAt) return `${workDate.slice(0, 7)} 근태가 마감되어 기록할 수 없습니다.`;
    if (leave?.kind === 'full') {
      return `${workDate}은(는) ${leaveLabel(leave)}일이라 출퇴근을 기록할 수 없습니다. 근무가 필요하면 연차 신청을 취소(반려)한 뒤 기록해주세요.`;
    }
    return null;
  })();

  let checkIn = common;
  if (!checkIn) {
    if (now.minutes < BOUNDARY_MINUTES) {
      checkIn = `출근은 ${String(DAY_BOUNDARY_HOUR).padStart(2, '0')}:00부터 기록할 수 있습니다.`;
    } else if (record?.checkInAt) {
      checkIn = `이미 ${record.checkInAt.slice(11, 16)}에 출근을 기록했습니다.`;
    } else if (record?.checkOutAt) {
      checkIn = '퇴근이 먼저 기록된 날은 출근을 추가할 수 없습니다. 관리자에게 정정을 요청해주세요.';
    } else if (site && leave?.kind === 'half' && leave.period === 'am' && ctx.nowMinutes < site.m.lunchStart - site.m.grace) {
      checkIn = `오전 반차일은 ${minutesToHhmm(site.m.lunchStart - site.m.grace)} 이후에 출근을 기록할 수 있습니다.`;
    } else if (site && leave?.kind === 'half' && leave.period === 'pm' && ctx.nowMinutes >= site.m.lunchStart) {
      checkIn = `오후 반차일은 ${site.lunchStart} 이전에만 출근을 기록할 수 있습니다.`;
    }
  }

  let checkOut = common;
  if (!checkOut && record?.checkInAt && ctx.nowMinutes <= minutesOnWorkDate(record.checkInAt, workDate)) {
    checkOut = '출근 직후에는 퇴근을 기록할 수 없습니다. 잠시 후 다시 시도해주세요.';
  }

  return {
    checkIn: { allowed: !checkIn, reason: checkIn },
    checkOut: { allowed: !checkOut, reason: checkOut },
  };
}

function presentToday(ctx, startDate) {
  const availability = actionAvailability(ctx);
  return {
    now: ctx.now.stamp,
    workDate: ctx.workDate,
    weekday: WEEKDAYS[new Date(dateToUtc(ctx.workDate)).getUTCDay()],
    site: publicSite(ctx.site),
    ip: ctx.ip,
    ipAllowed: Boolean(ctx.ipSite),
    ipSiteName: ctx.ipSite?.name || null,
    record: ctx.record,
    leave: ctx.leave,
    closed: Boolean(ctx.closedAt),
    remoteReview: {
      required: remoteReviewRequired(ctx.employee),
      reviewer: remoteReviewerLabel(ctx.employee),
    },
    evaluation: evaluateDay({
      employee: ctx.employee,
      site: ctx.site,
      date: ctx.workDate,
      record: ctx.record,
      leave: ctx.leave,
      today: ctx.workDate,
      nowMinutes: ctx.nowMinutes,
      startDate,
    }),
    ...availability,
  };
}

export async function getMyToday(employeeId, ip, nowDate = new Date()) {
  const ctx = await buildTodayContext(employeeId, ip, nowDate);
  return presentToday(ctx, await getStartDate());
}

function normalizeWorkInput(data, ipSite) {
  const type = WORK_TYPE_KEYS.includes(text(data?.type)) ? text(data.type) : 'office';
  const place = text(data?.place);
  if (type === 'office') {
    if (!ipSite) {
      throw httpError(
        '회사 허용 IP가 아닌 곳에서는 출퇴근을 기록할 수 없습니다. 외근·출장이면 유형과 장소를 입력해주세요.',
        403,
        'IP_NOT_ALLOWED'
      );
    }
    return { type, place: null };
  }
  if (!place) throw httpError(`${WORK_TYPE_LABELS[type]} 장소를 입력해주세요.`, 400, 'PLACE_REQUIRED');
  if (place.length > PLACE_MAX_LENGTH) throw httpError(`장소는 ${PLACE_MAX_LENGTH}자 이내로 입력해주세요.`);
  return { type, place };
}

async function writeLog(db, { employeeId, workDate, action, occurredAt, ip, type, place, actorId, reason, detail }) {
  await db
    .prepare(
      `INSERT INTO attendance_logs (employee_id, work_date, action, occurred_at, ip, work_type, place, actor_id, reason, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(employeeId),
      workDate,
      action,
      occurredAt,
      ip || null,
      type || null,
      place || null,
      actorId ?? null,
      reason || null,
      detail ? JSON.stringify(detail) : null
    );
}

/**
 * 외근·출장 기록의 확인 상태. 공장장 이상은 바로 인정하고,
 * 확인받은 출근과 같은 유형·장소로 퇴근하면 확인을 유지합니다.
 */
function nextRemoteStatus(employee, input, existing, side) {
  if (!REMOTE_WORK_TYPES.includes(input.type)) return null;
  if (!remoteReviewRequired(employee)) return { status: 'approved', reviewerId: employee.id };
  if (
    side === 'out' &&
    existing?.remote_status === 'approved' &&
    existing.check_in_type === input.type &&
    existing.check_in_place === input.place
  ) {
    return null;
  }
  return { status: 'pending', reviewerId: null };
}

async function applyRemoteStatus(db, ctx, next) {
  if (!next) return;
  await db
    .prepare(
      `UPDATE attendance_records
       SET remote_status = ?, remote_reviewed_by = ?, remote_reviewed_at = ?, remote_reject_reason = NULL
       WHERE employee_id = ? AND work_date = ?`
    )
    .run(next.status, next.reviewerId ?? null, next.reviewerId ? ctx.now.stamp : null, ctx.employee.id, ctx.workDate);
}

export async function checkIn(employeeId, data, ip, nowDate = new Date()) {
  const ctx = await buildTodayContext(employeeId, ip, nowDate);
  const { checkIn: availability } = actionAvailability(ctx);
  if (!availability.allowed) throw httpError(availability.reason, 409);
  const input = normalizeWorkInput(data, ctx.ipSite);

  const db = getDb();
  await db.transaction(async () => {
    const existing = await getRecordRow(ctx.employee.id, ctx.workDate);
    if (existing?.check_in_at) throw httpError('이미 출근을 기록했습니다.', 409);
    if (existing) {
      await db
        .prepare(
          `UPDATE attendance_records SET check_in_at = ?, check_in_ip = ?, check_in_type = ?, check_in_place = ?,
             updated_at = datetime('now', 'localtime') WHERE id = ?`
        )
        .run(ctx.now.stamp, ip || null, input.type, input.place, existing.id);
    } else {
      await db
        .prepare(
          `INSERT INTO attendance_records (employee_id, work_date, check_in_at, check_in_ip, check_in_type, check_in_place)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(ctx.employee.id, ctx.workDate, ctx.now.stamp, ip || null, input.type, input.place);
    }
    await applyRemoteStatus(db, ctx, nextRemoteStatus(ctx.employee, input, existing, 'in'));
    await writeLog(db, {
      employeeId: ctx.employee.id,
      workDate: ctx.workDate,
      action: 'check_in',
      occurredAt: ctx.now.stamp,
      ip,
      type: input.type,
      place: input.place,
      actorId: ctx.employee.id,
    });
  });
  return getMyToday(employeeId, ip, nowDate);
}

/** 퇴근은 여러 번 누를 수 있고 마지막 기록이 남습니다(변경 이력은 로그에 보관). */
export async function checkOut(employeeId, data, ip, nowDate = new Date()) {
  const ctx = await buildTodayContext(employeeId, ip, nowDate);
  const { checkOut: availability } = actionAvailability(ctx);
  if (!availability.allowed) throw httpError(availability.reason, 409);
  const input = normalizeWorkInput(data, ctx.ipSite);

  const db = getDb();
  await db.transaction(async () => {
    const existing = await getRecordRow(ctx.employee.id, ctx.workDate);
    if (existing) {
      await db
        .prepare(
          `UPDATE attendance_records SET check_out_at = ?, check_out_ip = ?, check_out_type = ?, check_out_place = ?,
             updated_at = datetime('now', 'localtime') WHERE id = ?`
        )
        .run(ctx.now.stamp, ip || null, input.type, input.place, existing.id);
    } else {
      await db
        .prepare(
          `INSERT INTO attendance_records (employee_id, work_date, check_out_at, check_out_ip, check_out_type, check_out_place)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(ctx.employee.id, ctx.workDate, ctx.now.stamp, ip || null, input.type, input.place);
    }
    await applyRemoteStatus(db, ctx, nextRemoteStatus(ctx.employee, input, existing, 'out'));
    await writeLog(db, {
      employeeId: ctx.employee.id,
      workDate: ctx.workDate,
      action: existing?.check_out_at ? 'check_out_again' : 'check_out',
      occurredAt: ctx.now.stamp,
      ip,
      type: input.type,
      place: input.place,
      actorId: ctx.employee.id,
    });
  });
  return getMyToday(employeeId, ip, nowDate);
}

/* ───────────── 조회 ───────────── */

async function loadRecords(from, to, employeeId = null) {
  const params = [from, to];
  let where = 'work_date BETWEEN ? AND ?';
  if (employeeId != null) {
    where += ' AND employee_id = ?';
    params.push(Number(employeeId));
  }
  const rows = await getDb().prepare(`SELECT * FROM attendance_records WHERE ${where}`).all(...params);
  return new Map(rows.map((row) => [`${row.employee_id}|${row.work_date}`, mapRecord(row)]));
}

async function loadEmployees(from, to, employeeIds) {
  const rows = await getDb()
    .prepare(
      `SELECT * FROM employees
       WHERE hire_date <= ? AND (is_active = 1 OR (terminated_date IS NOT NULL AND terminated_date >= ?))
       ORDER BY workplace_code, department, name, id`
    )
    .all(to, from);
  return employeeIds ? rows.filter((row) => employeeIds.has(String(row.id))) : rows;
}

function listDates(from, to) {
  const dates = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

async function baseContext(nowDate) {
  const now = kstNow(nowDate);
  const today = workDateOf(now);
  return {
    today,
    nowMinutes: minutesOnWorkDate(now.stamp, today),
    startDate: await getStartDate(),
    sites: await loadSites(),
  };
}

function buildDay(base, employee, date, records, leaves) {
  const site = siteFor(employee, base.sites);
  const record = records.get(`${employee.id}|${date}`) || null;
  const leave = summarizeLeave(leaves.get(`${employee.id}|${date}`));
  const employed = isEmployedOn(employee, date);
  const evaluation = employed
    ? evaluateDay({
        employee,
        site,
        date,
        record,
        leave,
        today: base.today,
        nowMinutes: base.nowMinutes,
        startDate: base.startDate,
      })
    : { ...evaluateDay({ employee, site, date, record: null, leave: null, today: date, nowMinutes: 0, startDate: null }), flags: ['none'], primary: 'none' };
  return { date, weekday: WEEKDAYS[new Date(dateToUtc(date)).getUTCDay()], record, leave, evaluation };
}

export async function getDailyBoard(date, employeeIds = null, nowDate = new Date()) {
  if (!isDateKey(date)) throw httpError('날짜를 확인해주세요.');
  const base = await baseContext(nowDate);
  const employees = (await loadEmployees(date, date, employeeIds)).filter((row) => isEmployedOn(row, date));
  const records = await loadRecords(date, date);
  const leaves = await loadLeaves(date, date);
  const rows = employees.map((employee) => ({
    ...employeeInfo(employee),
    ...buildDay(base, employee, date, records, leaves),
  }));
  const counts = {};
  for (const row of rows) for (const flag of row.evaluation.flags) counts[flag] = (counts[flag] || 0) + 1;
  return {
    date,
    weekday: WEEKDAYS[new Date(dateToUtc(date)).getUTCDay()],
    holidayName: isNonWorkingDay(date) ? nonWorkingDayReason(date) : null,
    closed: Boolean(await isClosed(date)),
    startDate: base.startDate,
    rows,
    counts,
  };
}

export async function getMonthlyReport(monthText, employeeIds = null, nowDate = new Date()) {
  const month = parseMonth(monthText);
  const base = await baseContext(nowDate);
  const employees = await loadEmployees(month.first, month.last, employeeIds);
  const records = await loadRecords(month.first, month.last);
  const leaves = await loadLeaves(month.first, month.last);
  const dates = listDates(month.first, month.last);
  const closing = await getDb()
    .prepare('SELECT closed_at, closed_by FROM attendance_closings WHERE year = ? AND month = ?')
    .get(month.year, month.month);

  const rows = employees.map((employee) => {
    const summary = emptySummary();
    for (const date of dates) {
      if (!isEmployedOn(employee, date) || date > base.today) continue;
      addToSummary(summary, buildDay(base, employee, date, records, leaves));
    }
    return { ...employeeInfo(employee), summary };
  });

  return {
    month: month.key,
    closed: Boolean(closing),
    closedAt: closing?.closed_at || null,
    startDate: base.startDate,
    workingDays: dates.filter((d) => !isNonWorkingDay(d)).length,
    rows,
  };
}

export async function getEmployeeMonth(employeeId, monthText, { includeLogs = false } = {}, nowDate = new Date()) {
  const month = parseMonth(monthText);
  const employee = await getEmployee(employeeId);
  const base = await baseContext(nowDate);
  const records = await loadRecords(month.first, month.last, employee.id);
  const leaves = await loadLeaves(month.first, month.last, employee.id);
  const summary = emptySummary();
  const days = listDates(month.first, month.last).map((date) => {
    const day = buildDay(base, employee, date, records, leaves);
    if (isEmployedOn(employee, date) && date <= base.today) addToSummary(summary, day);
    return day;
  });
  const result = {
    employee: employeeInfo(employee),
    site: publicSite(siteFor(employee, base.sites)),
    month: month.key,
    closed: Boolean(await isClosed(month.first)),
    startDate: base.startDate,
    days,
    summary,
  };
  if (includeLogs) {
    const logs = await getDb()
      .prepare(
        `SELECT l.*, a.name AS actor_name FROM attendance_logs l
         LEFT JOIN employees a ON a.id = l.actor_id
         WHERE l.employee_id = ? AND l.work_date BETWEEN ? AND ?
         ORDER BY l.id DESC`
      )
      .all(employee.id, month.first, month.last);
    result.logs = logs.map((row) => ({
      id: String(row.id),
      workDate: row.work_date,
      action: row.action,
      occurredAt: row.occurred_at,
      ip: row.ip || null,
      type: row.work_type || null,
      place: row.place || null,
      actorName: row.actor_name || null,
      reason: row.reason || null,
      detail: row.detail ? safeJson(row.detail) : null,
    }));
  }
  return result;
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/* ───────────── 관리자 정정·마감 ───────────── */

/** "HH:MM" → 근무일 기준 시각 문자열. 새벽 5시 이전은 다음날로 봅니다. */
function stampFromInput(date, value, label) {
  const raw = text(value);
  if (!raw) return null;
  const minutes = hhmmToMinutes(raw);
  if (minutes == null) throw httpError(`${label} 시각을 HH:MM 형식으로 입력해주세요.`);
  const day = minutes < BOUNDARY_MINUTES ? addDays(date, 1) : date;
  return `${day} ${minutesToHhmm(minutes)}:00`;
}

function correctionType(value, place, label) {
  const type = WORK_TYPE_KEYS.includes(text(value)) ? text(value) : 'office';
  const cleanPlace = text(place);
  if (REMOTE_WORK_TYPES.includes(type) && !cleanPlace) throw httpError(`${label} ${WORK_TYPE_LABELS[type]} 장소를 입력해주세요.`);
  if (cleanPlace.length > PLACE_MAX_LENGTH) throw httpError(`장소는 ${PLACE_MAX_LENGTH}자 이내로 입력해주세요.`);
  return { type, place: REMOTE_WORK_TYPES.includes(type) ? cleanPlace : null };
}

export async function correctDay(employeeId, date, data, actorId, nowDate = new Date()) {
  if (!isDateKey(date)) throw httpError('날짜를 확인해주세요.');
  const employee = await getEmployee(employeeId);
  if (await isClosed(date)) throw httpError(`${date.slice(0, 7)} 근태가 마감되어 정정할 수 없습니다. 마감을 해제한 뒤 정정해주세요.`, 409);
  if (date > workDateOf(kstNow(nowDate))) throw httpError('앞으로의 날짜는 정정할 수 없습니다.');
  const reason = text(data?.reason);
  if (reason.length < 2) throw httpError('정정 사유를 입력해주세요.');
  if (reason.length > 500) throw httpError('정정 사유는 500자 이내로 입력해주세요.');

  const checkInAt = stampFromInput(date, data?.checkIn, '출근');
  const checkOutAt = stampFromInput(date, data?.checkOut, '퇴근');
  if (checkInAt && minutesOnWorkDate(checkInAt, date) >= 1440) throw httpError('출근 시각은 05:00 이후로 입력해주세요.');
  if (checkInAt && checkOutAt && checkOutAt <= checkInAt) throw httpError('퇴근 시각은 출근 시각보다 늦어야 합니다.');
  const inType = checkInAt ? correctionType(data?.checkInType, data?.checkInPlace, '출근') : null;
  const outType = checkOutAt ? correctionType(data?.checkOutType, data?.checkOutPlace, '퇴근') : null;
  const note = text(data?.note).slice(0, 500) || null;

  const db = getDb();
  const occurredAt = kstNow(nowDate).stamp;
  await db.transaction(async () => {
    const before = mapRecord(await getRecordRow(employee.id, date));
    if (!checkInAt && !checkOutAt) {
      if (before) await db.prepare('DELETE FROM attendance_records WHERE id = ?').run(Number(before.id));
    } else if (before) {
      await db
        .prepare(
          `UPDATE attendance_records
           SET check_in_at = ?, check_in_type = ?, check_in_place = ?,
               check_in_ip = CASE WHEN check_in_at = ? THEN check_in_ip ELSE NULL END,
               check_out_at = ?, check_out_type = ?, check_out_place = ?,
               check_out_ip = CASE WHEN check_out_at = ? THEN check_out_ip ELSE NULL END,
               corrected = 1, note = ?, updated_at = datetime('now', 'localtime')
           WHERE id = ?`
        )
        .run(
          checkInAt,
          inType?.type ?? null,
          inType?.place ?? null,
          checkInAt ?? '',
          checkOutAt,
          outType?.type ?? null,
          outType?.place ?? null,
          checkOutAt ?? '',
          note,
          Number(before.id)
        );
    } else {
      await db
        .prepare(
          `INSERT INTO attendance_records (
             employee_id, work_date, check_in_at, check_in_type, check_in_place,
             check_out_at, check_out_type, check_out_place, corrected, note
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
        )
        .run(
          employee.id,
          date,
          checkInAt,
          inType?.type ?? null,
          inType?.place ?? null,
          checkOutAt,
          outType?.type ?? null,
          outType?.place ?? null,
          note
        );
    }
    let after = mapRecord(await getRecordRow(employee.id, date));
    if (after) {
      // 관리자가 새로 넣거나 바꾼 외근·출장은 확인된 것으로 보고, 그대로면 기존 확인 상태를 유지합니다.
      const unchanged = before?.remoteStatus && remoteSignature(before) === remoteSignature(after);
      const status = !hasRemoteType(after) ? null : unchanged ? before.remoteStatus : 'approved';
      if (!unchanged) {
        await db
          .prepare(
            `UPDATE attendance_records
             SET remote_status = ?, remote_reviewed_by = ?, remote_reviewed_at = ?, remote_reject_reason = NULL
             WHERE id = ?`
          )
          .run(status, status ? actorId ?? null : null, status ? occurredAt : null, Number(after.id));
        after = mapRecord(await getRecordRow(employee.id, date));
      }
    }
    await writeLog(db, {
      employeeId: employee.id,
      workDate: date,
      action: after ? 'correct' : 'delete',
      occurredAt,
      actorId,
      reason,
      detail: {
        before: before && pickTimes(before),
        after: after && pickTimes(after),
      },
    });
  });
  return getEmployeeMonth(employee.id, date.slice(0, 7), { includeLogs: true }, nowDate);
}

function remoteSignature(record) {
  const part = (type, place) => (REMOTE_WORK_TYPES.includes(type) ? `${type}:${place || ''}` : '-');
  return `${part(record.checkInType, record.checkInPlace)}|${part(record.checkOutType, record.checkOutPlace)}`;
}

/* ───────────── 외근·출장 확인 ───────────── */

async function loadReviewRows(where, params) {
  return getDb()
    .prepare(
      `SELECT r.*, e.name AS employee_name, e.emp_no, e.workplace, e.workplace_code, e.department, e.department_code,
              e.position, e.concurrent_position, e.concurrent_dept_code, e.is_active AS employee_active,
              v.name AS reviewer_name
       FROM attendance_records r
       JOIN employees e ON e.id = r.employee_id
       LEFT JOIN employees v ON v.id = r.remote_reviewed_by
       WHERE ${where}
       ORDER BY r.work_date DESC, r.id DESC`
    )
    .all(...params);
}

function mapReviewRow(row) {
  return {
    ...employeeInfo({ ...row, id: row.employee_id, name: row.employee_name }),
    record: mapRecord(row),
    reviewerName: row.reviewer_name || null,
    reviewerLabel: remoteReviewerLabel(row),
  };
}

/**
 * 확인할 외근·출장 기록. 상급자로서 확인할 수 있거나 근태 정정 권한(covers) 범위에 있는 직원만 보입니다.
 * @param {(employeeRow) => boolean} covers 관리자 대리 확인 범위
 */
export async function listRemoteReviews(reviewerId, covers, { status = 'pending', days = 60 } = {}, nowDate = new Date()) {
  const reviewer = await getEmployee(reviewerId);
  const since = addDays(workDateOf(kstNow(nowDate)), -days);
  const rows =
    status === 'pending'
      ? await loadReviewRows(`r.remote_status = 'pending'`, [])
      : await loadReviewRows(`r.remote_status IN ('approved', 'rejected') AND r.work_date >= ?`, [since]);
  const result = [];
  for (const row of rows) {
    const employeeRow = { ...row, id: row.employee_id };
    if (!(await canReviewRemote(reviewer, employeeRow)) && !covers(employeeRow)) continue;
    if (status !== 'pending' && Number(row.remote_reviewed_by) === Number(row.employee_id)) continue;
    result.push(mapReviewRow(row));
  }
  return result;
}

export async function reviewRemote(recordId, reviewerId, covers, data, nowDate = new Date()) {
  const decision = data?.decision === 'reject' ? 'rejected' : data?.decision === 'approve' ? 'approved' : null;
  if (!decision) throw httpError('확인 또는 반려를 선택해주세요.');
  const reason = text(data?.reason).slice(0, 500);
  if (decision === 'rejected' && reason.length < 2) throw httpError('반려 사유를 입력해주세요.');

  const [row] = await loadReviewRows('r.id = ?', [Number(recordId)]);
  if (!row) throw httpError('기록을 찾을 수 없습니다.', 404);
  const record = mapRecord(row);
  if (!hasRemoteType(record)) throw httpError('외근·출장 기록이 아닙니다.');
  const employeeRow = { ...row, id: row.employee_id };
  const reviewer = await getEmployee(reviewerId);
  const isLineReviewer = await canReviewRemote(reviewer, employeeRow);
  const isAdmin = covers(employeeRow) && Number(reviewerId) !== Number(row.employee_id);
  if (!isLineReviewer && !isAdmin) throw httpError('이 기록을 확인할 권한이 없습니다.', 403);
  if (record.remoteStatus !== 'pending' && !isAdmin) throw httpError('이미 처리된 기록입니다.', 409);
  if (await isClosed(record.workDate)) throw httpError(`${record.workDate.slice(0, 7)} 근태가 마감되어 처리할 수 없습니다.`, 409);

  const occurredAt = kstNow(nowDate).stamp;
  const db = getDb();
  await db.transaction(async () => {
    await db
      .prepare(
        `UPDATE attendance_records
         SET remote_status = ?, remote_reviewed_by = ?, remote_reviewed_at = ?, remote_reject_reason = ?,
             updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      )
      .run(decision, Number(reviewerId), occurredAt, decision === 'rejected' ? reason : null, Number(recordId));
    await writeLog(db, {
      employeeId: row.employee_id,
      workDate: record.workDate,
      action: decision === 'approved' ? 'remote_approve' : 'remote_reject',
      occurredAt,
      actorId: reviewerId,
      reason: reason || null,
    });
  });
  const [updated] = await loadReviewRows('r.id = ?', [Number(recordId)]);
  return mapReviewRow(updated);
}

function pickTimes(record) {
  return {
    checkInAt: record.checkInAt,
    checkInType: record.checkInType,
    checkInPlace: record.checkInPlace,
    checkOutAt: record.checkOutAt,
    checkOutType: record.checkOutType,
    checkOutPlace: record.checkOutPlace,
  };
}

export async function closeMonth(monthText, actorId) {
  const month = parseMonth(monthText);
  const today = workDateOf(kstNow());
  if (month.first > today) throw httpError('아직 시작하지 않은 달은 마감할 수 없습니다.');
  await getDb()
    .prepare(
      `INSERT INTO attendance_closings (year, month, closed_by, closed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (year, month) DO NOTHING`
    )
    .run(month.year, month.month, actorId ?? null, kstNow().stamp);
  return { month: month.key, closed: true };
}

export async function reopenMonth(monthText) {
  const month = parseMonth(monthText);
  await getDb().prepare('DELETE FROM attendance_closings WHERE year = ? AND month = ?').run(month.year, month.month);
  return { month: month.key, closed: false };
}

export async function exportMonthly(monthText, employeeIds = null) {
  const report = await getMonthlyReport(monthText, employeeIds);
  const hours = (minutes) => (minutes ? Math.round((minutes / 60) * 100) / 100 : 0);
  const headers = [
    '사번', '성명', '사업장', '부서', '직급', '근무일', '출근일', '지각', '조퇴', '결근', '출근누락', '퇴근누락',
    '연차(일)', '출장', '외근', '외근·출장 확인대기', '휴일근무', '근무시간(h)', '연장(h)', '야간(h)',
  ];
  const rows = report.rows.map((row) => {
    const s = row.summary;
    return [
      row.empNo, row.name, row.workplace, row.department, row.position, s.scheduledDays, s.attendedDays, s.late,
      s.early, s.absent, s.missingIn, s.missingOut, s.leaveDays, s.tripDays, s.outsideDays, s.remotePending,
      s.holidayWorkDays,
      hours(s.workMinutes), hours(s.overtimeMinutes), hours(s.nightMinutes),
    ];
  });
  return { headers, rows, month: report.month };
}

import nodemailer from 'nodemailer';
import { getDb } from '../db.js';
import { decryptField, encryptField, isEncrypted } from '../secrets.js';
import * as approvalService from './approvalService.js';
import { WORK_TYPE_LABELS } from '../../src/constants/attendance.js';
import { OUTCOMES, REMINDER_DAYS } from '../../src/constants/evaluation.js';
import { isSpecialLeave, leaveKindLabel, usageLabel } from '../../src/constants/leaveKinds.js';

const SUBJECT_PREFIX = '[동양철관 관리팀]';
const APP_NAME = '동양철관 인사관리';

const DEFAULTS = {
  enabled: false,
  smtpHost: 'smtp.mailplug.co.kr',
  smtpPort: 465,
  smtpSecure: 'ssl',
  username: 'salary@dysp.co.kr',
  fromName: 'KBI동양철관주식회사',
  fromEmail: 'salary@dysp.co.kr',
  appUrl: process.env.APP_PUBLIC_URL || 'https://pie8405-holiday.mycafe24.ai',
};

function rowToPublic(row, includePassword = false) {
  if (!row) {
    return { ...DEFAULTS, passwordSet: false };
  }
  return {
    enabled: Boolean(row.enabled),
    smtpHost: row.smtp_host || DEFAULTS.smtpHost,
    smtpPort: Number(row.smtp_port) || DEFAULTS.smtpPort,
    smtpSecure: row.smtp_secure || DEFAULTS.smtpSecure,
    username: row.username || '',
    fromName: row.from_name || DEFAULTS.fromName,
    fromEmail: row.from_email || '',
    appUrl: row.app_url || DEFAULTS.appUrl,
    passwordSet: Boolean(row.password),
    ...(includePassword ? { password: row.password || '' } : {}),
  };
}

async function getRow() {
  const row = await getDb().prepare('SELECT * FROM mail_settings WHERE id = 1').get();
  if (!row?.password) return row;
  const password = decryptField(row.password);
  if (password == null) {
    console.error('[mail] 저장된 SMTP 비밀번호를 복호화하지 못했습니다. 비밀 키가 바뀌었다면 메일 설정에서 비밀번호를 다시 입력하세요.');
  }
  return { ...row, password: password || '' };
}

/** 이전 버전에서 평문으로 저장된 SMTP 비밀번호를 암호화합니다. 서버 시작 시 한 번 호출합니다. */
export async function encryptStoredMailPassword() {
  const row = await getDb().prepare('SELECT password FROM mail_settings WHERE id = 1').get();
  if (!row?.password || isEncrypted(row.password)) return false;
  await getDb()
    .prepare('UPDATE mail_settings SET password = ? WHERE id = 1')
    .run(encryptField(row.password));
  return true;
}

export async function getMailSettings() {
  return rowToPublic(await getRow());
}

export async function saveMailSettings(data) {
  const current = await getRow();
  const password =
    data.password && String(data.password).trim()
      ? String(data.password).trim()
      : current?.password || '';
  const username = String(data.username || '').trim();
  const fromEmail = String(data.fromEmail || username).trim();
  await getDb()
    .prepare(
      `INSERT INTO mail_settings (
         id, enabled, smtp_host, smtp_port, smtp_secure, username, password,
         from_name, from_email, app_url, updated_at
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(id) DO UPDATE SET
         enabled = excluded.enabled,
         smtp_host = excluded.smtp_host,
         smtp_port = excluded.smtp_port,
         smtp_secure = excluded.smtp_secure,
         username = excluded.username,
         password = excluded.password,
         from_name = excluded.from_name,
         from_email = excluded.from_email,
         app_url = excluded.app_url,
         updated_at = excluded.updated_at`
    )
    .run(
      data.enabled ? 1 : 0,
      String(data.smtpHost || DEFAULTS.smtpHost).trim(),
      Number(data.smtpPort) || DEFAULTS.smtpPort,
      data.smtpSecure === 'starttls' ? 'starttls' : 'ssl',
      username,
      encryptField(password),
      String(data.fromName || DEFAULTS.fromName).trim() || DEFAULTS.fromName,
      fromEmail,
      String(data.appUrl || DEFAULTS.appUrl).trim().replace(/\/$/, '') || DEFAULTS.appUrl
    );
  return getMailSettings();
}

/** 휴가 이름(연차·오전 반차·경조휴가…). 화면 형태(type)와 DB 행(usage_type) 모두 받습니다. */
function leaveTypeLabel(usage) {
  return usageLabel({
    type: usage?.type || usage?.usage_type,
    halfPeriod: usage?.halfPeriod ?? usage?.half_period,
    kind: usage?.kind || usage?.leave_kind,
  });
}

/** 메일 제목의 큰 분류: 연차 또는 연차 외 휴가 이름 */
function leaveGroupLabel(usage) {
  const kind = usage?.kind || usage?.leave_kind;
  return isSpecialLeave(kind) ? leaveKindLabel(kind) : '연차';
}

function uniqueEmails(employees) {
  const seen = new Set();
  const result = [];
  for (const emp of employees || []) {
    if (!emp) continue;
    const email = String(emp.email || '').trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    result.push({ ...emp, email });
  }
  return result;
}

/**
 * 역할(관리자 단계·사업장 관리자·인사담당 등)로 정해진 받는 사람에서 시스템관리자를 뺍니다.
 * 인사담당·사업장관리자를 겸하면 남깁니다. 본인 신청·지정 결재자처럼 사람으로 정해진 메일에는 쓰지 않습니다.
 */
export async function withoutSystemAdmins(employees) {
  const rows = await getDb()
    .prepare(
      `SELECT employee_id FROM employee_roles WHERE role = 'system_admin'
       AND employee_id NOT IN (SELECT employee_id FROM employee_roles WHERE role IN ('hr', 'site_admin'))`
    )
    .all();
  const excluded = new Set(rows.map((row) => Number(row.employee_id)));
  return (employees || []).filter((emp) => emp && !excluded.has(Number(emp.id)));
}

/** 연차 결재 메일 받는 사람. "관리자" 단계면 시스템관리자를 뺍니다. */
async function leaveApprovers(employee, usageStep) {
  const approvers = await approvalService.listLineApprovers(employee, usageStep);
  const step = await approvalService.currentApprovalStep(employee, usageStep);
  return step === '관리자' ? withoutSystemAdmins(approvers) : approvers;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function usesStarttls(settings) {
  const port = Number(settings.smtpPort);
  return settings.smtpSecure === 'starttls' || port === 25 || port === 587;
}

function createTransport(settings) {
  const port = Number(settings.smtpPort) || 25;
  const starttls = usesStarttls(settings);
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port,
    secure: !starttls && port === 465,
    requireTLS: starttls,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 20000,
    tls: {
      servername: settings.smtpHost,
      minVersion: 'TLSv1.2',
    },
    auth: settings.username
      ? { user: settings.username, pass: settings.password }
      : undefined,
  });
}

function isConnectError(error) {
  const code = String(error.code || '');
  const message = String(error.message || '');
  return (
    ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'EHOSTUNREACH', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET'].includes(
      code
    ) || /timeout|connect|ECONN|socket timed out/i.test(message)
  );
}

function mailErrorMessage(error, settings) {
  const code = String(error.code || '');
  const detail = String(error.response || error.message || '알 수 없는 오류');
  if (isConnectError(error)) {
    return (
      `${settings.smtpHost}:${settings.smtpPort} 연결에 실패했습니다 (${code || 'timeout'}). ` +
      '메일플러그 SMTP(smtp.mailplug.co.kr:465, SSL)와 앱 비밀번호가 맞는지 확인하세요.'
    );
  }
  if (code === 'EAUTH' || /auth|invalid login|535/i.test(detail)) {
    return 'SMTP 인증에 실패했습니다. 메일플러그 계정(salary@dysp.co.kr)과 앱 비밀번호를 확인하세요.';
  }
  if (/certificate|self-signed|UNABLE_TO_VERIFY/i.test(detail)) {
    return '메일 서버 보안 인증서를 확인하지 못했습니다. SMTP 서버가 smtp.mailplug.co.kr인지 확인하세요.';
  }
  return `메일 발송 실패: ${detail}`;
}

async function mergeTestSettings(overrides = {}) {
  const stored = rowToPublic(await getRow(), true);
  const password =
    overrides.password && String(overrides.password).trim()
      ? String(overrides.password).trim()
      : stored.password || '';
  return {
    ...stored,
    smtpHost: String(overrides.smtpHost || stored.smtpHost || DEFAULTS.smtpHost).trim(),
    smtpPort: Number(overrides.smtpPort || stored.smtpPort || DEFAULTS.smtpPort),
    smtpSecure: overrides.smtpSecure === 'ssl' || overrides.smtpSecure === 'starttls'
      ? overrides.smtpSecure
      : stored.smtpSecure || DEFAULTS.smtpSecure,
    username: String(overrides.username || stored.username || '').trim(),
    fromName: String(overrides.fromName || stored.fromName || DEFAULTS.fromName).trim(),
    fromEmail: String(overrides.fromEmail || stored.fromEmail || '').trim(),
    appUrl: String(overrides.appUrl || stored.appUrl || DEFAULTS.appUrl).trim(),
    password,
  };
}

function connectionAttempts(settings) {
  return [settings];
}

function approvalUrl(settings, forAdmin = false) {
  const base = settings.appUrl || DEFAULTS.appUrl;
  const path = forAdmin ? '/admin/approvals' : '/employee/approvals';
  return `${base}/login?next=${encodeURIComponent(path)}`;
}

function htmlLayout(title, body, buttonLabel, href) {
  return `<!DOCTYPE html>
<html lang="ko">
<body style="font-family: 'Malgun Gothic', sans-serif; color:#0a2540; line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <h2 style="font-size:18px;margin:0 0 16px;">${escapeHtml(title)}</h2>
    ${body}
    <p style="margin:24px 0;">
      <a href="${escapeHtml(href)}" style="display:inline-block;background:#635bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;">${escapeHtml(buttonLabel)}</a>
    </p>
    <p style="font-size:12px;color:#6b7c93;">${APP_NAME} 시스템</p>
  </div>
</body>
</html>`;
}

async function sendWithSettings(settings, to, subject, html, cc = []) {
  if (!settings.smtpHost || !settings.username || !settings.password) {
    return { skipped: true, reason: 'incomplete' };
  }
  if (!to.length) return { skipped: true, reason: 'no-recipients' };

  const toSet = new Set(to.map((email) => email.toLowerCase()));
  const ccList = [...new Set(cc.filter((email) => !toSet.has(email.toLowerCase())))];
  const transporter = createTransport(settings);
  const fromEmail = settings.fromEmail || settings.username;
  const result = await transporter.sendMail({
    from: `"${settings.fromName}" <${fromEmail}>`,
    to: to.join(', '),
    ...(ccList.length ? { cc: ccList.join(', ') } : {}),
    subject: `${SUBJECT_PREFIX} ${subject}`,
    html,
  });
  return { skipped: false, messageId: result.messageId };
}

/** options.cc: 참조로 받을 직원 행 목록 */
async function sendMail(to, subject, html, options = {}) {
  const settings = rowToPublic(await getRow(), true);
  if (!options.force && !settings.enabled) return { skipped: true, reason: 'disabled' };
  return sendWithSettings(settings, to, subject, html, uniqueEmails(options.cc).map((r) => r.email));
}

export async function sendTestMail(toEmail, overrides = {}) {
  const settings = await mergeTestSettings(overrides);
  const to = String(toEmail || settings.fromEmail || settings.username).trim();
  if (!to) throw Object.assign(new Error('테스트 받을 이메일을 입력해주세요.'), { status: 400 });
  if (!settings.username || !settings.password) {
    throw Object.assign(new Error('SMTP 계정과 비밀번호를 먼저 입력한 뒤 저장하거나, 비밀번호를 다시 입력하고 테스트를 눌러주세요.'), {
      status: 400,
    });
  }
  const html = htmlLayout(
    '메일 서버 연결 테스트',
    `<p>${APP_NAME} 메일 서버가 정상적으로 연결되었습니다.</p>`,
    `${APP_NAME} 열기`,
    settings.appUrl || DEFAULTS.appUrl
  );

  const attempts = connectionAttempts(settings);
  let lastError = null;
  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i];
    try {
      const result = await sendWithSettings(attempt, [to], '메일 서버 테스트', html);
      if (result.skipped) {
        throw Object.assign(new Error('메일을 보내지 못했습니다. 설정을 확인해주세요.'), { status: 400 });
      }
      return {
        ok: true,
        to,
        usedPort: Number(attempt.smtpPort),
        usedSecure: usesStarttls(attempt) ? 'starttls' : 'ssl',
        fallback: i > 0,
      };
    } catch (error) {
      lastError = error;
      if (!isConnectError(error)) break;
    }
  }

  throw Object.assign(new Error(mailErrorMessage(lastError, settings)), { status: 502 });
}

function datesText(items) {
  const dates = [...new Set((items || []).map((item) => item.date || item.usage_date).filter(Boolean))].sort();
  if (!dates.length) return '-';
  if (dates.length === 1) return dates[0];
  return `${dates[0]} ~ ${dates[dates.length - 1]} (${dates.length}일)`;
}

export async function notifyLeaveSubmitted(employee, items, approvalHint) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const step = items?.[0]?.approvalStep || items?.[0]?.approval_step;
    const approvers = uniqueEmails(await leaveApprovers(employee, step));
    if (!approvers.length) {
      console.warn('[mail] no line approver email for', employee.name, approvalHint);
      return;
    }
    const typeLabel = leaveTypeLabel(items?.[0]);
    const groupLabel = leaveGroupLabel(items?.[0]);
    const dates = datesText(items);
    const reason = items?.[0]?.reason || '';
    const href = approvalUrl(settings, false);
    const body = `
      <p><strong>${escapeHtml(employee.name)}</strong>님이 ${escapeHtml(typeLabel)}를 신청했습니다.</p>
      <p>기간: ${escapeHtml(dates)}<br/>사유: ${escapeHtml(reason || '-')}<br/>결재: ${escapeHtml(approvalHint || '승인 대기')}</p>
      <p>아래 링크로 접속한 뒤 로그인하여 승인 또는 반려해주세요.</p>
    `;
    await sendMail(
      approvers.map((a) => a.email),
      `${employee.name} ${groupLabel} 승인 요청 (${dates})`,
      htmlLayout(`${groupLabel} 승인 요청`, body, '승인하러 가기', href)
    );
  } catch (error) {
    console.error('[mail] notifyLeaveSubmitted failed:', error.message);
  }
}

export async function notifyLeaveCancelled(employee, usage) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const approvers = uniqueEmails(await leaveApprovers(employee, usage.approval_step));
    if (!approvers.length) return;
    const typeLabel = leaveTypeLabel(usage);
    const groupLabel = leaveGroupLabel(usage);
    const body = `
      <p><strong>${escapeHtml(employee.name)}</strong>님이 승인 대기 중이던 ${escapeHtml(typeLabel)} 신청을 취소했습니다.</p>
      <p>사용일: ${escapeHtml(usage.usage_date)}<br/>사유: ${escapeHtml(usage.reason || '-')}</p>
      <p>이 신청은 더 이상 승인할 필요가 없습니다.</p>
    `;
    await sendMail(
      approvers.map((a) => a.email),
      `${employee.name} ${groupLabel} 신청 취소 (${usage.usage_date})`,
      htmlLayout(`${groupLabel} 신청 취소`, body, '승인 대기 보기', approvalUrl(settings, false))
    );
  } catch (error) {
    console.error('[mail] notifyLeaveCancelled failed:', error.message);
  }
}

export async function notifyLeaveAdvanced(employee, usage, approvalHint) {
  return notifyLeaveSubmitted(employee, [usage], approvalHint);
}

export async function notifyLeaveFinal(employee, usage, decision, rejectReason, approver = null, options = {}) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const typeLabel = leaveTypeLabel(usage);
    const groupLabel = leaveGroupLabel(usage);
    const date = usage.date || usage.usage_date;
    const approved = decision === 'approve' || usage.status === 'approved' || options.intermediate;
    const resultLabel = !approved
      ? '반려'
      : options.intermediate
        ? '단계 승인'
        : '최종 승인';
    const approverName = approver?.name ? String(approver.name) : '';
    const nextHint = options.approvalHint ? `<br/>다음 결재: ${escapeHtml(options.approvalHint)}` : '';
    const body = `
      <p>${escapeHtml(employee.name)}님의 ${escapeHtml(typeLabel)} 신청이 <strong>${escapeHtml(resultLabel)}</strong>되었습니다.</p>
      <p>사용일: ${escapeHtml(date)}<br/>사유: ${escapeHtml(usage.reason || '-')}
      ${approverName ? `<br/>승인자: ${escapeHtml(approverName)}` : ''}
      ${!approved && rejectReason ? `<br/>반려 사유: ${escapeHtml(rejectReason)}` : ''}
      ${nextHint}</p>
    `;
    const subject = `${employee.name} ${groupLabel} ${resultLabel} (${date})`;
    const html = htmlLayout(
      `${groupLabel} ${resultLabel}`,
      body,
      options.intermediate ? '승인 현황 보기' : `${APP_NAME} 열기`,
      options.intermediate
        ? approvalUrl(settings, false)
        : `${settings.appUrl || DEFAULTS.appUrl}/login?next=${encodeURIComponent('/employee/history')}`
    );

    if (!approved) {
      const applicant = uniqueEmails([employee]);
      if (applicant.length) {
        await sendMail(applicant.map((a) => a.email), subject, html);
      }
      return;
    }

    // 승인 시: 신청자 · 승인자 · 해당 사업장 관리자(시스템관리자 제외)
    const recipients = uniqueEmails([
      employee,
      approver,
      ...(await withoutSystemAdmins(await approvalService.listWorkplaceAdminEmployees(employee))),
    ]);
    if (!recipients.length) {
      console.warn('[mail] no approval recipients for', employee.name);
      return;
    }
    await sendMail(
      recipients.map((r) => r.email),
      subject,
      html
    );
  } catch (error) {
    console.error('[mail] notifyLeaveFinal failed:', error.message);
  }
}

function remoteSummary(info) {
  const label = WORK_TYPE_LABELS[info.type] || info.type;
  return {
    label,
    html: `<p>근무일: ${escapeHtml(info.workDate)}<br/>구분: ${escapeHtml(label)} (${escapeHtml(info.side === 'out' ? '퇴근' : '출근')} ${escapeHtml(String(info.at || '').slice(11, 16))})<br/>장소: ${escapeHtml(info.place || '-')}</p>`,
  };
}

/**
 * 외근·출장 확인 요청. reviewers 는 확인권자(없으면 근태 관리자) 직원 행 목록입니다.
 * info: { workDate, type, place, side, at }
 */
export async function notifyRemoteSubmitted(employee, info, reviewers, { forAdmin = false } = {}) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails(forAdmin ? await withoutSystemAdmins(reviewers) : reviewers).filter(
      (r) => Number(r.id) !== Number(employee.id)
    );
    if (!to.length) {
      console.warn('[mail] no remote reviewer email for', employee.name);
      return;
    }
    const { label, html } = remoteSummary(info);
    const path = forAdmin ? '/admin/attendance-reviews' : '/employee/attendance-reviews';
    const body = `
      <p><strong>${escapeHtml(employee.name)}</strong>님이 ${escapeHtml(label)}을(를) 등록했습니다.</p>
      ${html}
      <p>확인해야 지각·조퇴로 판정되지 않습니다. 아래 링크로 접속해 확인 또는 반려해주세요.</p>
    `;
    await sendMail(
      to.map((r) => r.email),
      `${employee.name} ${label} 확인 요청 (${info.workDate})`,
      htmlLayout(`${label} 확인 요청`, body, '확인하러 가기', `${settings.appUrl || DEFAULTS.appUrl}/login?next=${encodeURIComponent(path)}`)
    );
  } catch (error) {
    console.error('[mail] notifyRemoteSubmitted failed:', error.message);
  }
}

export async function isMailEnabled() {
  return rowToPublic(await getRow()).enabled;
}

function pageUrl(settings, path) {
  return `${settings.appUrl || DEFAULTS.appUrl}/login?next=${encodeURIComponent(path)}`;
}

function dueText(item) {
  const days = item.daysLeft;
  const left = days < 0 ? `${-days}일 지남` : days === 0 ? '오늘' : `${days}일 남음`;
  return `${item.dueDate} (${left})`;
}

function evaluationRows(items, { withEvaluator = false } = {}) {
  const rows = items
    .map(
      (item) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e3e8ee;">${escapeHtml(item.employee.name)}<br/><span style="color:#6b7c93;font-size:12px;">${escapeHtml(item.employee.department)} · ${escapeHtml(item.employee.position)}</span></td>
        <td style="padding:6px 8px;border-bottom:1px solid #e3e8ee;">${escapeHtml(item.label)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e3e8ee;">${escapeHtml(dueText(item))}</td>
        ${withEvaluator ? `<td style="padding:6px 8px;border-bottom:1px solid #e3e8ee;">${escapeHtml(item.evaluatorName || '미지정')}</td>` : ''}
      </tr>`
    )
    .join('');
  return `<table style="border-collapse:collapse;font-size:14px;width:100%;">
    <tr style="text-align:left;color:#6b7c93;font-size:12px;">
      <th style="padding:6px 8px;">대상</th><th style="padding:6px 8px;">평가</th><th style="padding:6px 8px;">기한</th>
      ${withEvaluator ? '<th style="padding:6px 8px;">평가자</th>' : ''}
    </tr>${rows}</table>`;
}

/**
 * 평가자 지정(또는 수습 연장으로 다음 차수 생성) 알림. cc: 참조로 받을 인사담당
 * resend 면 인사담당이 직접 다시 보내는 요청입니다. 결과({ skipped } / { error } / 발송 결과)를 돌려줍니다.
 */
export async function notifyEvaluationAssigned(evaluator, items, actor = null, cc = [], { resend = false } = {}) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return { skipped: true, reason: 'disabled' };
    const to = uniqueEmails([evaluator]);
    if (!to.length) return { skipped: true, reason: 'no-recipients' };
    const first = items[0];
    const by = actor?.name ? ` (${resend ? '요청' : '지정'}: ${escapeHtml(actor.name)})` : '';
    const body = `
      <p>${escapeHtml(evaluator.name)}님${
        resend ? `, 아래 평가의 작성을 요청드립니다${by}.` : `이 아래 평가의 평가자로 지정되었습니다${by}.`
      }</p>
      ${evaluationRows(items)}
      <p>기한 안에 근무평가서(20개 항목 점수·평가의견)를 작성해 제출해주세요.</p>
    `;
    return await sendMail(
      to.map((r) => r.email),
      `평가 요청: ${first.employee.name} ${first.label} (기한 ${first.dueDate})`,
      htmlLayout('평가 요청', body, '평가 작성하러 가기', pageUrl(settings, '/employee/evaluations')),
      { cc }
    );
  } catch (error) {
    console.error('[mail] notifyEvaluationAssigned failed:', error.message);
    return { error: error.message };
  }
}

/** 기한 임박·경과 알림. forManager 면 인사담당용 전체 목록 */
export async function notifyEvaluationReminder(recipients, items, { forManager = false, cc = [] } = {}) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails(recipients);
    if (!to.length || !items.length) return;
    const overdue = items.filter((item) => item.daysLeft < 0).length;
    const noEvaluator = items.filter((item) => !item.evaluatorId).length;
    const body = forManager
      ? `
      <p>기한이 ${REMINDER_DAYS}일 안으로 다가왔거나 지난 평가가 ${items.length}건 있습니다${overdue ? ` (기한 지남 ${overdue}건)` : ''}.</p>
      ${evaluationRows(items, { withEvaluator: true })}
      ${noEvaluator ? `<p style="color:#df1b41;">평가자가 지정되지 않은 평가가 ${noEvaluator}건 있습니다. 평가자를 지정해주세요.</p>` : ''}
    `
      : `
      <p>작성할 평가의 기한이 다가왔습니다.</p>
      ${evaluationRows(items)}
      <p>기한 안에 평가표를 작성해 제출해주세요.</p>
    `;
    const subject = forManager
      ? `평가 기한 안내 ${items.length}건${overdue ? ` (기한 지남 ${overdue}건)` : ''}`
      : `평가 기한 안내: ${items.map((item) => `${item.employee.name} ${item.label}`).join(', ')}`;
    await sendMail(
      to.map((r) => r.email),
      subject,
      htmlLayout(
        '평가 기한 안내',
        body,
        forManager ? '평가 일정 보기' : '평가 작성하러 가기',
        pageUrl(settings, forManager ? '/admin/evaluations' : '/employee/evaluations')
      ),
      { cc }
    );
  } catch (error) {
    console.error('[mail] notifyEvaluationReminder failed:', error.message);
  }
}

function trainingRows(items, { withCounts = false } = {}) {
  const cell = 'padding:6px 8px;border-bottom:1px solid #e3e8ee;';
  const rows = items
    .map(
      (item) => `<tr>
        <td style="${cell}">${escapeHtml(item.title)}</td>
        <td style="${cell}">${escapeHtml(dueText(item))}</td>
        ${withCounts ? `<td style="${cell}">${item.completedCount}/${item.assigneeCount}명 수료</td>` : ''}
      </tr>`
    )
    .join('');
  return `<table style="border-collapse:collapse;font-size:14px;width:100%;">
    <tr style="text-align:left;color:#6b7c93;font-size:12px;">
      <th style="padding:6px 8px;">교육</th><th style="padding:6px 8px;">수료 기한</th>
      ${withCounts ? '<th style="padding:6px 8px;">현황</th>' : ''}
    </tr>${rows}</table>`;
}

/** 미수료 직원에게 법정의무교육 수료 기한 안내. 결과({ skipped } / { error } / 발송 결과)를 돌려줍니다. */
export async function notifyTrainingReminder(employee, items) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return { skipped: true, reason: 'disabled' };
    const to = uniqueEmails([employee]);
    if (!to.length) return { skipped: true, reason: 'no-recipients' };
    const body = `
      <p>${escapeHtml(employee.name)}님, 아직 수료하지 않은 법정의무교육이 있습니다.</p>
      ${trainingRows(items)}
      <p>기한 안에 교육 영상을 시청하고 수료를 마쳐주세요.</p>
    `;
    return await sendMail(
      to.map((r) => r.email),
      `법정의무교육 수료 안내: ${items.map((item) => item.title).join(', ')}`,
      htmlLayout('법정의무교육 수료 안내', body, '교육 들으러 가기', pageUrl(settings, '/employee/training'))
    );
  } catch (error) {
    console.error('[mail] notifyTrainingReminder failed:', error.message);
    return { error: error.message };
  }
}

/** 인사담당에게 기한이 다가온 교육의 수료 현황 요약 */
export async function notifyTrainingSummary(recipients, sessions) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails(recipients);
    if (!to.length || !sessions.length) return;
    const body = `
      <p>수료 기한이 다가온 법정의무교육입니다. 미수료 직원에게 안내 메일을 보냈습니다.</p>
      ${trainingRows(sessions, { withCounts: true })}
    `;
    await sendMail(
      to.map((r) => r.email),
      `법정의무교육 수료 현황 ${sessions.length}건`,
      htmlLayout('법정의무교육 수료 현황', body, '교육 현황 보기', pageUrl(settings, '/admin/training'))
    );
  } catch (error) {
    console.error('[mail] notifyTrainingSummary failed:', error.message);
  }
}

function evaluationScoreText(item) {
  if (item.totalScore == null) return '';
  const outcome = OUTCOMES[item.recommendation];
  return `<p>최종 평가 점수: <strong>${item.totalScore}/${item.maxScore}점</strong>${
    outcome ? ` · 정규직 채용 여부(팀장): ${escapeHtml(outcome)}` : ''
  }</p>`;
}

/** 팀장 제출 → 지정된 임원에게 평가의견(임원) 요청. 결과는 notifyEvaluationAssigned 와 같습니다. */
export async function notifyEvaluationReviewRequested(reviewer, item, cc = [], { actor = null } = {}) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return { skipped: true, reason: 'disabled' };
    const to = uniqueEmails([reviewer]);
    if (!to.length) return { skipped: true, reason: 'no-recipients' };
    const body = `
      <p>${escapeHtml(item.submittedByName || item.evaluatorName)}님이 평가표를 제출했습니다. 평가 내용을 확인하고 평가의견(임원)을 작성해 제출해주세요.${
        actor?.name ? ` (요청: ${escapeHtml(actor.name)})` : ''
      }</p>
      ${evaluationRows([item])}
      ${evaluationScoreText(item)}
    `;
    return await sendMail(
      to.map((r) => r.email),
      `임원 의견 요청: ${item.employee.name} ${item.label}`,
      htmlLayout('평가 임원 의견 요청', body, '의견 작성하러 가기', pageUrl(settings, '/employee/evaluations')),
      { cc }
    );
  } catch (error) {
    console.error('[mail] notifyEvaluationReviewRequested failed:', error.message);
    return { error: error.message };
  }
}

/** 평가자(또는 임원)가 제출 → 인사담당에게 확정 요청 */
export async function notifyEvaluationSubmitted(managers, item) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails(managers);
    if (!to.length) return;
    const body = `
      <p>${escapeHtml(item.reviewedByName || item.submittedByName || item.evaluatorName)}님이 평가표를 제출했습니다. 확인 후 확정해주세요.</p>
      ${evaluationRows([item])}
      ${evaluationScoreText(item)}
    `;
    await sendMail(
      to.map((r) => r.email),
      `평가 제출: ${item.employee.name} ${item.label}`,
      htmlLayout('평가 제출 · 확정 요청', body, '확정하러 가기', pageUrl(settings, '/admin/evaluations'))
    );
  } catch (error) {
    console.error('[mail] notifyEvaluationSubmitted failed:', error.message);
  }
}

export async function notifyEvaluationReturned(evaluator, item, note, actor = null, cc = []) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails([evaluator]);
    if (!to.length) return;
    const body = `
      <p>제출한 평가표가 반려되었습니다${actor?.name ? ` (처리: ${escapeHtml(actor.name)})` : ''}. 고쳐서 다시 제출해주세요.</p>
      ${evaluationRows([item])}
      <p>반려 사유: ${escapeHtml(note || '-')}</p>
    `;
    await sendMail(
      to.map((r) => r.email),
      `평가 반려: ${item.employee.name} ${item.label}`,
      htmlLayout('평가 반려', body, '평가 고치러 가기', pageUrl(settings, '/employee/evaluations')),
      { cc }
    );
  } catch (error) {
    console.error('[mail] notifyEvaluationReturned failed:', error.message);
  }
}

/** 외근·출장 확인 결과를 본인에게 알립니다. decision: 'approved' | 'rejected' */
export async function notifyRemoteReviewed(employee, info, decision, reviewer, rejectReason) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails([employee]);
    if (!to.length) return;
    const { label, html } = remoteSummary(info);
    const result = decision === 'approved' ? '확인' : '반려';
    const body = `
      <p>${escapeHtml(employee.name)}님의 ${escapeHtml(label)} 기록이 <strong>${result}</strong>되었습니다.</p>
      ${html}
      <p>처리자: ${escapeHtml(reviewer?.name || '-')}${
        decision === 'rejected' && rejectReason ? `<br/>반려 사유: ${escapeHtml(rejectReason)}` : ''
      }</p>
      ${decision === 'rejected' ? '<p>반려된 기록은 사무실 출퇴근과 같이 지각·조퇴를 판정합니다.</p>' : ''}
    `;
    await sendMail(
      to.map((r) => r.email),
      `${label} ${result} (${info.workDate})`,
      htmlLayout(`${label} ${result}`, body, '근태 보기', `${settings.appUrl || DEFAULTS.appUrl}/login?next=${encodeURIComponent('/employee/attendance')}`)
    );
  } catch (error) {
    console.error('[mail] notifyRemoteReviewed failed:', error.message);
  }
}

function documentTable(doc) {
  const rows = [
    ['양식', doc.formLabel],
    ['제목', doc.title],
    ...(doc.summary ? [['내용', doc.summary]] : []),
    ['기안자', `${doc.drafter.name}${doc.drafter.department ? ` (${doc.drafter.department})` : ''}`],
    ['기안 일시', String(doc.submittedAt || '').slice(0, 16)],
    ...(doc.documentNo ? [['문서번호', doc.documentNo]] : []),
  ];
  return `<table style="border-collapse:collapse;font-size:14px;">${rows
    .map(
      ([label, value]) => `<tr>
        <td style="padding:4px 12px 4px 0;color:#6b7c93;white-space:nowrap;">${escapeHtml(label)}</td>
        <td style="padding:4px 0;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join('')}</table>`;
}

function documentUrl(settings, doc) {
  return pageUrl(settings, `/employee/documents/${doc.id}`);
}

/** 결재할 차례가 된 사람들에게 알립니다. */
/**
 * 다음 결재자(합의자)에게 알립니다. 앞 단계에서 결재한 사람이 있으면 함께 적습니다.
 * options: { kind: 'approval' | 'agreement', previous: { name, kind } | null }
 */
export async function notifyDocumentPending(approvers, doc, { kind = 'approval', previous = null } = {}) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails(approvers);
    if (!to.length) return;
    const ACTIONS = { agreement: '합의', receive: '수신' };
    const action = ACTIONS[kind] || '결재';
    const before = previous?.name
      ? `<p>${escapeHtml(previous.name)}님이 ${ACTIONS[previous.kind] || '결재'}했습니다.</p>`
      : '';
    const body = `
      ${before}
      <p>${action}할 문서가 도착했습니다.${kind === 'receive' ? ' 내용을 확인하고 결재선을 지정해 주세요.' : ''}</p>
      ${documentTable(doc)}
    `;
    await sendMail(
      to.map((r) => r.email),
      `${action} 요청: [${doc.formLabel}] ${doc.title} (기안 ${doc.drafter.name})`,
      htmlLayout(`${action} 요청`, body, '문서 보기', documentUrl(settings, doc))
    );
  } catch (error) {
    console.error('[mail] notifyDocumentPending failed:', error.message);
  }
}

/** 결재가 끝나면 기안자에게, 참조자는 참조로 알립니다. */
export async function notifyDocumentCompleted(drafter, doc, refs = []) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails([drafter]);
    const cc = uniqueEmails(refs);
    if (!to.length && !cc.length) return;
    const body = `
      <p>아래 문서의 결재가 완료되었습니다.</p>
      ${documentTable(doc)}
      ${
        doc.formKey === 'certificate' || doc.formKey === 'certificate_issue'
          ? '<p>증명서가 발급되었습니다. 증명서 발급대장에서 인쇄할 수 있습니다.</p>'
          : ''
      }
    `;
    await sendMail(
      (to.length ? to : cc).map((r) => r.email),
      `결재 완료: [${doc.formLabel}] ${doc.title}${doc.documentNo ? ` (${doc.documentNo})` : ''}`,
      htmlLayout('결재 완료', body, '문서 보기', documentUrl(settings, doc)),
      { cc: to.length ? cc : [] }
    );
  } catch (error) {
    console.error('[mail] notifyDocumentCompleted failed:', error.message);
  }
}

export async function notifyDocumentRejected(drafter, doc, actorName, reason, { kind = 'approval' } = {}) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails([drafter]);
    if (!to.length) return;
    const by = kind === 'agreement' ? '합의 반대' : '반려';
    const body = `
      <p>아래 문서가 <strong>반려</strong>되었습니다.</p>
      ${documentTable(doc)}
      <p>${by}: ${escapeHtml(actorName || '-')}${reason ? `<br/>사유: ${escapeHtml(reason)}` : ''}</p>
      <p>내용을 고쳐 "다시 기안"할 수 있습니다.</p>
    `;
    await sendMail(
      to.map((r) => r.email),
      `결재 반려: [${doc.formLabel}] ${doc.title}`,
      htmlLayout('결재 반려', body, '문서 보기', documentUrl(settings, doc))
    );
  } catch (error) {
    console.error('[mail] notifyDocumentRejected failed:', error.message);
  }
}

function certificateRequestTable(request) {
  const rows = [
    ['증명서', request.typeLabel],
    ['신청자', `${request.employeeName}${request.department ? ` (${request.department})` : ''}`],
    ...(request.workplace ? [['사업장', request.workplace]] : []),
    ['용도', request.request?.purpose || ''],
    ...(request.request?.submitTo ? [['제출처', request.request.submitTo]] : []),
    ['신청 일시', String(request.requestedAt || '').slice(0, 16)],
  ];
  return `<table style="border-collapse:collapse;font-size:14px;">${rows
    .map(
      ([label, value]) => `<tr>
        <td style="padding:4px 12px 4px 0;color:#6b7c93;white-space:nowrap;">${escapeHtml(label)}</td>
        <td style="padding:4px 0;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join('')}</table>`;
}

/** 직원의 증명서 신청을 사업장 인사담당에게 알립니다. */
export async function notifyCertificateRequested(handlers, request) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails(handlers);
    if (!to.length) return;
    const body = `
      <p>증명서 발급 신청이 접수되었습니다. 내용을 확인하고 관리팀 내부 결재(증명서 발급 품의)로 발급하거나 반려하세요.</p>
      ${certificateRequestTable(request)}
    `;
    await sendMail(
      to.map((r) => r.email),
      `증명서 신청: ${request.typeLabel} (${request.employeeName})`,
      htmlLayout('증명서 발급 신청', body, '신청 확인', pageUrl(settings, '/admin/certificates'))
    );
  } catch (error) {
    console.error('[mail] notifyCertificateRequested failed:', error.message);
  }
}

/** 신청한 증명서가 내부 결재를 거쳐 발급되었음을 직원에게 알립니다. */
export async function notifyCertificateIssued(employee, { typeLabel, certNo }) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails([employee]);
    if (!to.length) return;
    const body = `
      <p>신청하신 <strong>${escapeHtml(typeLabel)}</strong>가 발급되었습니다. (발급번호 ${escapeHtml(certNo)})</p>
      <p>"증명서" 메뉴에서 인쇄하거나 PDF로 저장할 수 있습니다.</p>
    `;
    await sendMail(
      to.map((r) => r.email),
      `증명서 발급: ${typeLabel} (${certNo})`,
      htmlLayout('증명서 발급 완료', body, '증명서 보기', pageUrl(settings, '/employee/certificates'))
    );
  } catch (error) {
    console.error('[mail] notifyCertificateIssued failed:', error.message);
  }
}

export async function notifyCertificateRequestRejected(employee, request, handlerName, reason) {
  try {
    const settings = rowToPublic(await getRow(), true);
    if (!settings.enabled) return;
    const to = uniqueEmails([employee]);
    if (!to.length) return;
    const body = `
      <p>증명서 신청이 <strong>반려</strong>되었습니다.</p>
      ${certificateRequestTable(request)}
      <p>반려: ${escapeHtml(handlerName || '-')}<br/>사유: ${escapeHtml(reason)}</p>
    `;
    await sendMail(
      to.map((r) => r.email),
      `증명서 신청 반려: ${request.typeLabel}`,
      htmlLayout('증명서 신청 반려', body, '증명서 보기', pageUrl(settings, '/employee/certificates'))
    );
  } catch (error) {
    console.error('[mail] notifyCertificateRequestRejected failed:', error.message);
  }
}

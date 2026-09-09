import nodemailer from 'nodemailer';
import { getDb } from '../db.js';
import * as approvalService from './approvalService.js';

const DEFAULTS = {
  enabled: false,
  imapHost: 'gw.kbigrp.com',
  imapPort: 993,
  imapSecure: 'ssl',
  smtpHost: 'gw.kbigrp.com',
  smtpPort: 465,
  smtpSecure: 'ssl',
  username: '',
  fromName: 'Holiday 연차관리',
  fromEmail: '',
  appUrl: process.env.APP_PUBLIC_URL || 'https://pie8405-holiday.mycafe24.ai',
};

function rowToPublic(row, includePassword = false) {
  if (!row) {
    return { ...DEFAULTS, passwordSet: false };
  }
  return {
    enabled: Boolean(row.enabled),
    imapHost: row.imap_host || DEFAULTS.imapHost,
    imapPort: Number(row.imap_port) || DEFAULTS.imapPort,
    imapSecure: row.imap_secure || DEFAULTS.imapSecure,
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

function getRow() {
  return getDb().prepare('SELECT * FROM mail_settings WHERE id = 1').get();
}

export function getMailSettings() {
  return rowToPublic(getRow());
}

export function saveMailSettings(data) {
  const current = getRow();
  const password =
    data.password && String(data.password).trim()
      ? String(data.password).trim()
      : current?.password || '';
  const username = String(data.username || '').trim();
  const fromEmail = String(data.fromEmail || username).trim();
  getDb()
    .prepare(
      `INSERT INTO mail_settings (
         id, enabled, imap_host, imap_port, imap_secure,
         smtp_host, smtp_port, smtp_secure, username, password,
         from_name, from_email, app_url, updated_at
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(id) DO UPDATE SET
         enabled = excluded.enabled,
         imap_host = excluded.imap_host,
         imap_port = excluded.imap_port,
         imap_secure = excluded.imap_secure,
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
      String(data.imapHost || DEFAULTS.imapHost).trim(),
      Number(data.imapPort) || DEFAULTS.imapPort,
      data.imapSecure === 'starttls' ? 'starttls' : 'ssl',
      String(data.smtpHost || DEFAULTS.smtpHost).trim(),
      Number(data.smtpPort) || DEFAULTS.smtpPort,
      data.smtpSecure === 'starttls' ? 'starttls' : 'ssl',
      username,
      password,
      String(data.fromName || DEFAULTS.fromName).trim() || DEFAULTS.fromName,
      fromEmail,
      String(data.appUrl || DEFAULTS.appUrl).trim().replace(/\/$/, '') || DEFAULTS.appUrl
    );
  return getMailSettings();
}

function uniqueEmails(employees) {
  const seen = new Set();
  const result = [];
  for (const emp of employees || []) {
    const email = String(emp.email || '').trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    result.push({ ...emp, email });
  }
  return result;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createTransport(settings) {
  const port = Number(settings.smtpPort) || 465;
  const starttls = settings.smtpSecure === 'starttls';
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port,
    secure: !starttls && (port === 465 || settings.smtpSecure === 'ssl'),
    requireTLS: starttls,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: settings.username
      ? { user: settings.username, pass: settings.password }
      : undefined,
  });
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
    <p style="font-size:12px;color:#6b7c93;">Holiday 연차 관리 시스템</p>
  </div>
</body>
</html>`;
}

async function sendMail(to, subject, html, options = {}) {
  const row = getRow();
  const settings = rowToPublic(row, true);
  if (!options.force && !settings.enabled) return { skipped: true, reason: 'disabled' };
  if (!settings.smtpHost || !settings.username || !settings.password) {
    return { skipped: true, reason: 'incomplete' };
  }
  if (!to.length) return { skipped: true, reason: 'no-recipients' };

  const transporter = createTransport(settings);
  const fromEmail = settings.fromEmail || settings.username;
  const result = await transporter.sendMail({
    from: `"${settings.fromName}" <${fromEmail}>`,
    to: to.join(', '),
    subject,
    html,
  });
  return { skipped: false, messageId: result.messageId };
}

export async function sendTestMail(toEmail) {
  const settings = rowToPublic(getRow(), true);
  const to = String(toEmail || settings.fromEmail || settings.username).trim();
  if (!to) throw Object.assign(new Error('테스트 받을 이메일을 입력해주세요.'), { status: 400 });
  if (!settings.username || !settings.password) {
    throw Object.assign(new Error('SMTP 계정과 비밀번호를 먼저 저장해주세요.'), { status: 400 });
  }
  const html = htmlLayout(
    '메일 서버 연결 테스트',
    '<p>Holiday 연차 관리 메일 서버가 정상적으로 연결되었습니다.</p>',
    'Holiday 열기',
    settings.appUrl || DEFAULTS.appUrl
  );
  const result = await sendMail([to], '[Holiday] 메일 서버 테스트', html, { force: true });
  if (result.skipped) {
    throw Object.assign(new Error('메일을 보내지 못했습니다. 설정을 확인해주세요.'), { status: 400 });
  }
  return { ok: true, to };
}

function datesText(items) {
  const dates = [...new Set((items || []).map((item) => item.date || item.usage_date).filter(Boolean))].sort();
  if (!dates.length) return '-';
  if (dates.length === 1) return dates[0];
  return `${dates[0]} ~ ${dates[dates.length - 1]} (${dates.length}일)`;
}

export async function notifyLeaveSubmitted(employee, items, approvalHint) {
  try {
    const settings = rowToPublic(getRow(), true);
    if (!settings.enabled) return;
    const step = items?.[0]?.approvalStep || items?.[0]?.approval_step;
    const approvers = uniqueEmails(approvalService.listLineApprovers(employee, step));
    if (!approvers.length) {
      console.warn('[mail] no line approver email for', employee.name, approvalHint);
      return;
    }
    const typeLabel = items?.[0]?.type === 'half' ? '반차' : '연차';
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
      `[Holiday] ${employee.name} 연차 승인 요청 (${dates})`,
      htmlLayout('연차 승인 요청', body, '승인하러 가기', href)
    );
  } catch (error) {
    console.error('[mail] notifyLeaveSubmitted failed:', error.message);
  }
}

export async function notifyLeaveAdvanced(employee, usage, approvalHint) {
  return notifyLeaveSubmitted(employee, [usage], approvalHint);
}

export async function notifyLeaveFinal(employee, usage, decision, rejectReason) {
  try {
    const settings = rowToPublic(getRow(), true);
    if (!settings.enabled) return;
    const typeLabel = usage.type === 'half' || usage.usage_type === 'half' ? '반차' : '연차';
    const date = usage.date || usage.usage_date;
    const approved = decision === 'approve' || usage.status === 'approved';
    const resultLabel = approved ? '최종 승인' : '반려';
    const body = `
      <p>${escapeHtml(employee.name)}님의 ${escapeHtml(typeLabel)} 신청이 <strong>${escapeHtml(resultLabel)}</strong>되었습니다.</p>
      <p>사용일: ${escapeHtml(date)}<br/>사유: ${escapeHtml(usage.reason || '-')}
      ${!approved && rejectReason ? `<br/>반려 사유: ${escapeHtml(rejectReason)}` : ''}</p>
    `;
    const subject = `[Holiday] ${employee.name} 연차 ${resultLabel} (${date})`;
    const html = htmlLayout(
      `연차 ${resultLabel}`,
      body,
      'Holiday 열기',
      `${settings.appUrl || DEFAULTS.appUrl}/login?next=${encodeURIComponent('/employee/history')}`
    );

    const applicant = uniqueEmails([employee]);
    if (applicant.length) {
      await sendMail(applicant.map((a) => a.email), subject, html);
    }

    if (approved) {
      const admins = uniqueEmails(approvalService.listAdminEmployees()).filter(
        (admin) => admin.email.toLowerCase() !== String(employee.email || '').trim().toLowerCase()
      );
      if (admins.length) {
        const adminHtml = htmlLayout(
          `연차 ${resultLabel} 알림`,
          body,
          '관리 화면 열기',
          approvalUrl(settings, true)
        );
        await sendMail(admins.map((a) => a.email), subject, adminHtml);
      }
    }
  } catch (error) {
    console.error('[mail] notifyLeaveFinal failed:', error.message);
  }
}

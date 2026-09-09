import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { useMailSettings, useSaveMailSettings, useTestMailSettings } from '../../hooks/useEmployeeRoster';

const emptyForm = {
  enabled: false,
  imapHost: 'gw.kbigrp.com',
  imapPort: 993,
  imapSecure: 'ssl',
  smtpHost: 'gw.kbigrp.com',
  smtpPort: 465,
  smtpSecure: 'ssl',
  username: '',
  password: '',
  fromName: 'Holiday 연차관리',
  fromEmail: '',
  appUrl: 'https://pie8405-holiday.mycafe24.ai',
};

export function AdminMailSettings() {
  const { data, isLoading, isError, refetch } = useMailSettings();
  const saveSettings = useSaveMailSettings();
  const testMail = useTestMailSettings();
  const [form, setForm] = useState(emptyForm);
  const [testTo, setTestTo] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: Boolean(data.enabled),
      imapHost: data.imapHost || emptyForm.imapHost,
      imapPort: data.imapPort || emptyForm.imapPort,
      imapSecure: data.imapSecure || 'ssl',
      smtpHost: data.smtpHost || emptyForm.smtpHost,
      smtpPort: data.smtpPort || emptyForm.smtpPort,
      smtpSecure: data.smtpSecure || 'ssl',
      username: data.username || '',
      password: '',
      fromName: data.fromName || emptyForm.fromName,
      fromEmail: data.fromEmail || '',
      appUrl: data.appUrl || emptyForm.appUrl,
    });
    if (data.fromEmail || data.username) setTestTo(data.fromEmail || data.username);
  }, [data]);

  function patch(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const result = await saveSettings.mutateAsync(form);
    setForm((prev) => ({ ...prev, password: '' }));
    setMessage(result.enabled ? '메일 설정을 저장했고, 알림 발송을 켰습니다.' : '메일 설정을 저장했습니다.');
    setTimeout(() => setMessage(''), 4000);
  }

  async function handleTest() {
    const result = await testMail.mutateAsync(testTo);
    setMessage(`${result.to}로 테스트 메일을 보냈습니다.`);
    setTimeout(() => setMessage(''), 4000);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  return (
    <div>
      <PageHeader
        title="메일 서버"
        description="연차 신청·최종 승인 알림에 사용할 IMAP/SMTP 서버입니다. 결재 단계 담당자에게 순서대로 승인 링크가 발송됩니다."
        actions={
          <Button type="submit" form="mail-settings-form" disabled={saveSettings.isPending}>
            {saveSettings.isPending ? '저장 중…' : '저장'}
          </Button>
        }
      />

      {message && (
        <div className="mb-4 rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-4 py-3 text-sm text-[#09825d]">
          {message}
        </div>
      )}
      {(saveSettings.isError || testMail.isError) && (
        <div className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">
          {saveSettings.error?.message || testMail.error?.message || '요청에 실패했습니다.'}
        </div>
      )}

      <form id="mail-settings-form" onSubmit={handleSave} className="space-y-5">
        <Panel>
          <PanelHeader title="알림 사용" />
          <PanelBody>
            <label className="flex items-center gap-2 text-sm text-stripe-text cursor-pointer">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => patch('enabled', e.target.checked)}
              />
              연차 신청·승인 메일 발송
            </label>
            <p className="text-[13px] text-stripe-muted mt-2">
              사원 명부에 이메일이 있는 결재자·신청자·관리자에게만 발송됩니다. 접속 주소는 아래 앱 URL입니다.
            </p>
            <div className="mt-4">
              <label className="stripe-label">앱 URL (메일 링크)</label>
              <input
                className="stripe-input"
                value={form.appUrl}
                onChange={(e) => patch('appUrl', e.target.value)}
                placeholder="https://pie8405-holiday.mycafe24.ai"
              />
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="IMAP 구성" description="수신 서버 · SSL/TLS 권장" />
          <PanelBody>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="stripe-label">호스트 이름</label>
                <input className="stripe-input font-mono" value={form.imapHost} onChange={(e) => patch('imapHost', e.target.value)} />
              </div>
              <div>
                <label className="stripe-label">포트</label>
                <input className="stripe-input font-mono" type="number" value={form.imapPort} onChange={(e) => patch('imapPort', Number(e.target.value))} />
              </div>
              <div>
                <label className="stripe-label">보안 연결 유형</label>
                <select className="stripe-input" value={form.imapSecure} onChange={(e) => patch('imapSecure', e.target.value)}>
                  <option value="ssl">SSL/TLS (권장)</option>
                  <option value="starttls">STARTTLS</option>
                </select>
              </div>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="SMTP 구성" description="발신 서버 · SSL/TLS 권장" />
          <PanelBody>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="stripe-label">호스트 이름</label>
                <input className="stripe-input font-mono" value={form.smtpHost} onChange={(e) => patch('smtpHost', e.target.value)} />
              </div>
              <div>
                <label className="stripe-label">포트</label>
                <input className="stripe-input font-mono" type="number" value={form.smtpPort} onChange={(e) => patch('smtpPort', Number(e.target.value))} />
              </div>
              <div>
                <label className="stripe-label">보안 연결 유형</label>
                <select className="stripe-input" value={form.smtpSecure} onChange={(e) => patch('smtpSecure', e.target.value)}>
                  <option value="ssl">SSL/TLS (권장)</option>
                  <option value="starttls">STARTTLS</option>
                </select>
              </div>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="발신 계정" description="메일 서버 로그인 정보" />
          <PanelBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="stripe-label">계정 (이메일)</label>
                <input
                  className="stripe-input"
                  type="email"
                  value={form.username}
                  onChange={(e) => patch('username', e.target.value)}
                  placeholder="name@kbigrp.com"
                />
              </div>
              <div>
                <label className="stripe-label">비밀번호 {data?.passwordSet ? '(저장됨, 바꿀 때만 입력)' : ''}</label>
                <input
                  className="stripe-input"
                  type="password"
                  value={form.password}
                  onChange={(e) => patch('password', e.target.value)}
                  autoComplete="new-password"
                  placeholder={data?.passwordSet ? '••••••••' : ''}
                />
              </div>
              <div>
                <label className="stripe-label">표시 이름</label>
                <input className="stripe-input" value={form.fromName} onChange={(e) => patch('fromName', e.target.value)} />
              </div>
              <div>
                <label className="stripe-label">보내는 주소</label>
                <input
                  className="stripe-input"
                  type="email"
                  value={form.fromEmail}
                  onChange={(e) => patch('fromEmail', e.target.value)}
                  placeholder="비우면 계정과 동일"
                />
              </div>
            </div>
          </PanelBody>
        </Panel>
      </form>

      <Panel className="mt-5">
        <PanelHeader title="연결 테스트" />
        <PanelBody>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="stripe-input flex-1"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="테스트 받을 이메일"
            />
            <Button type="button" variant="secondary" onClick={handleTest} disabled={testMail.isPending}>
              <Send className="h-4 w-4" />
              {testMail.isPending ? '보내는 중…' : '테스트 메일'}
            </Button>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}

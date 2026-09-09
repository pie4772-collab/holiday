import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { useMailSettings, useSaveMailSettings, useTestMailSettings } from '../../hooks/useEmployeeRoster';

const MAILPLUG = {
  smtpHost: 'smtp.mailplug.co.kr',
  smtpPort: 465,
  smtpSecure: 'ssl',
};

const emptyForm = {
  enabled: false,
  provider: 'mailplug',
  smtpHost: MAILPLUG.smtpHost,
  smtpPort: MAILPLUG.smtpPort,
  smtpSecure: MAILPLUG.smtpSecure,
  username: 'salary@dysp.co.kr',
  password: '',
  fromName: 'KBI동양철관주식회사',
  fromEmail: 'salary@dysp.co.kr',
  appUrl: 'https://pie8405-holiday.mycafe24.ai',
};

export function AdminMailSettings() {
  const { data, isLoading, isError, refetch } = useMailSettings();
  const saveSettings = useSaveMailSettings();
  const testMail = useTestMailSettings();
  const [form, setForm] = useState(emptyForm);
  const [testTo, setTestTo] = useState('jaeyong.lee@kbigrp.com');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: Boolean(data.enabled),
      provider: 'mailplug',
      smtpHost: data.smtpHost || emptyForm.smtpHost,
      smtpPort: data.smtpPort || emptyForm.smtpPort,
      smtpSecure: data.smtpSecure || 'ssl',
      username: data.username || emptyForm.username,
      password: '',
      fromName: data.fromName || emptyForm.fromName,
      fromEmail: data.fromEmail || emptyForm.fromEmail,
      appUrl: data.appUrl || emptyForm.appUrl,
    });
    setTestTo((current) => current || 'jaeyong.lee@kbigrp.com');
  }, [data]);

  function patch(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSslChange(checked) {
    setForm((prev) => ({
      ...prev,
      smtpSecure: checked ? 'ssl' : 'starttls',
      smtpPort: checked ? 465 : prev.smtpPort === 465 ? 587 : prev.smtpPort,
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const result = await saveSettings.mutateAsync(form);
    setForm((prev) => ({ ...prev, password: '' }));
    setMessage(result.enabled ? '메일 설정을 저장했고, 알림 발송을 켰습니다.' : '메일 설정을 저장했습니다.');
    setTimeout(() => setMessage(''), 4000);
  }

  async function handleTest() {
    const result = await testMail.mutateAsync({ ...form, to: testTo });
    setMessage(`${result.to}로 테스트 메일을 보냈습니다.`);
    setTimeout(() => setMessage(''), 6000);
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

  const sslEnabled = form.smtpSecure === 'ssl';

  return (
    <div>
      <PageHeader
        title="메일 서버"
        description="연차 신청·승인 알림은 메일플러그 SMTP로만 발송합니다."
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
          <PanelHeader title="보내는 메일 서버" description="메일플러그 SMTP" />
          <PanelBody className="space-y-4">
            <div>
              <label className="stripe-label">메일 서비스</label>
              <select
                className="stripe-input"
                value={form.provider}
                onChange={() => setForm((prev) => ({ ...prev, provider: 'mailplug', ...MAILPLUG }))}
              >
                <option value="mailplug">메일플러그</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
              <div>
                <label className="stripe-label">SMTP 서버</label>
                <input
                  className="stripe-input font-mono"
                  value={form.smtpHost}
                  onChange={(e) => patch('smtpHost', e.target.value)}
                />
              </div>
              <div>
                <label className="stripe-label">포트</label>
                <input
                  className="stripe-input font-mono"
                  type="number"
                  value={form.smtpPort}
                  onChange={(e) => patch('smtpPort', Number(e.target.value))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-stripe-text cursor-pointer">
              <input type="checkbox" checked={sslEnabled} onChange={(e) => handleSslChange(e.target.checked)} />
              SSL 사용 (포트 465)
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="stripe-label">SMTP 계정 (아이디)</label>
                <input
                  className="stripe-input"
                  type="email"
                  value={form.username}
                  onChange={(e) => patch('username', e.target.value)}
                />
              </div>
              <div>
                <label className="stripe-label">SMTP 비밀번호 {data?.passwordSet ? '(저장됨, 바꿀 때만 입력)' : ''}</label>
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
                <label className="stripe-label">발신자 이름</label>
                <input className="stripe-input" value={form.fromName} onChange={(e) => patch('fromName', e.target.value)} />
              </div>
              <div>
                <label className="stripe-label">발신 메일</label>
                <input
                  className="stripe-input"
                  type="email"
                  value={form.fromEmail}
                  onChange={(e) => patch('fromEmail', e.target.value)}
                />
              </div>
            </div>

            <p className="text-[13px] text-stripe-muted">
              메일플러그는 일반 비밀번호 대신 앱 비밀번호를 사용하세요. 저장한 뒤 테스트 메일로 연결을 확인합니다.
            </p>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="알림 사용" />
          <PanelBody>
            <label className="flex items-center gap-2 text-sm text-stripe-text cursor-pointer">
              <input type="checkbox" checked={form.enabled} onChange={(e) => patch('enabled', e.target.checked)} />
              연차 신청·승인 메일 발송
            </label>
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
      </form>

      <Panel className="mt-5">
        <PanelHeader title="테스트 메일" />
        <PanelBody>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="stripe-label">테스트 수신 메일</label>
              <input
                className="stripe-input"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={handleTest} disabled={testMail.isPending}>
                <Send className="h-4 w-4" />
                {testMail.isPending ? '보내는 중…' : '테스트 메일 보내기'}
              </Button>
            </div>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}

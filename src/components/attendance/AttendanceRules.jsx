import { Panel, PanelBody, PanelHeader } from '../ui/Panel';

function attendanceRuleItems(site) {
  const grace = site?.graceMinutes ?? 15;
  const hours = site
    ? `${site.name} ${site.workStart}~${site.workEnd}, 점심 ${site.lunchStart}~${site.lunchEnd}`
    : '사업장별 정규 근무시간';
  return [
    {
      title: '기록 장소',
      body: '회사 네트워크(사업장 허용 IP)에서만 사무실 출퇴근을 기록할 수 있습니다. 외근·국내출장·해외출장은 장소를 입력하면 어디서나 기록할 수 있습니다.',
    },
    { title: '근무시간', body: `${hours}. 점심시간은 근무시간에서 뺍니다.` },
    {
      title: `${grace}분 인정`,
      body: `시작 ${grace}분 뒤까지 출근은 지각이 아니고, 종료 ${grace}분 전부터 퇴근은 조퇴가 아닙니다. 연장근무는 종료 ${grace}분이 지난 뒤 퇴근부터 집계합니다.`,
    },
    {
      title: '반차',
      body: `점심시간이 기준입니다. 오전 반차는 점심 종료가 출근 시각이고 점심 시작 ${grace}분 전부터 출근을 기록할 수 있습니다. 오후 반차는 점심 시작이 퇴근 시각이고 점심 시작 전까지만 출근을 기록할 수 있습니다.`,
    },
    { title: '연차', body: '연차(승인 또는 승인 대기)인 날은 출퇴근을 기록할 수 없습니다. 근무가 필요하면 연차를 취소(반려)한 뒤 기록하세요.' },
    {
      title: '출장·외근',
      body: '외근·출장(국내·해외)은 상급자가 확인하면 지각·조퇴를 판정하지 않습니다. 팀원은 팀장, 팀장은 임원·공장장이 확인하고, 공장장 이상은 확인 없이 인정됩니다. 확인 전이나 반려되면 사무실 출퇴근과 같이 판정합니다.',
    },
    {
      title: '기록 규칙',
      body: '출근은 하루 한 번, 퇴근은 다시 누르면 마지막 시각으로 바뀝니다. 새벽 5시 전 퇴근은 전날 근무로 기록하고, 출근은 5시부터 가능합니다.',
    },
    { title: '휴일', body: '주말·공휴일 기록은 휴일 근무로 남기며 지각·결근을 판정하지 않습니다.' },
    {
      title: '결근·누락',
      body: '근무일에 기록이 없으면 결근, 출근만 있고 다음 날까지 퇴근이 없으면 퇴근 누락으로 표시합니다. 임원은 판정에서 제외합니다.',
    },
    { title: '정정·마감', body: '잘못된 기록은 관리자가 사유와 함께 정정하며 이력이 남습니다. 마감된 달은 정정할 수 없습니다.' },
  ];
}

export function AttendanceRules({ site }) {
  return (
    <Panel>
      <PanelHeader title="근태 규칙" />
      <PanelBody noPadding>
        <div className="divide-y divide-[#f0f3f7]">
          {attendanceRuleItems(site).map((rule) => (
            <div key={rule.title} className="flex gap-3 px-5 py-2.5">
              <span className="w-20 flex-shrink-0 text-[13px] font-medium text-stripe-text">{rule.title}</span>
              <p className="text-[13px] text-stripe-muted leading-relaxed">{rule.body}</p>
            </div>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}

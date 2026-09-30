import { useState } from 'react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { LeaveUsageList } from '../../components/LeaveUsageList';
import { useLeaveUsages, useTeamMembers } from '../../hooks/useLeaveData';

function remainingClass(value) {
  return value < 3 ? 'text-[#df1b41]' : 'text-[#09825d]';
}

function MemberUsages({ member }) {
  const { data: usages, isLoading } = useLeaveUsages(member.id);
  return (
    <Panel className="mt-5">
      <PanelHeader title={`${member.name} 연차 사용·신청 내역`} description={member.department} />
      <PanelBody noPadding>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <LeaveUsageList usages={usages || []} emptyText="사용·신청 내역이 없습니다." />
        )}
      </PanelBody>
    </Panel>
  );
}

export function EmployeeTeam() {
  const { data: members, isLoading, isError, refetch } = useTeamMembers();
  const [selectedId, setSelectedId] = useState(null);

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

  const list = members || [];
  const selected = list.find((m) => m.id === selectedId) || null;

  return (
    <div>
      <PageHeader title="부서원 연차" description={`담당 부서원 ${list.length}명의 연차 현황입니다. 이름을 누르면 내역을 볼 수 있습니다.`} />

      <Panel>
        {list.length === 0 ? (
          <p className="py-12 text-center text-sm text-stripe-muted">담당 부서원이 없습니다.</p>
        ) : (
          <div className="stripe-table-fit-wrap">
            <table className="stripe-table stripe-table-fit w-full">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>부서</th>
                  <th>직급</th>
                  <th>발생</th>
                  <th>사용</th>
                  <th>잔여</th>
                </tr>
              </thead>
              <tbody>
                {list.map((member) => (
                  <tr
                    key={member.id}
                    onClick={() => setSelectedId(member.id === selectedId ? null : member.id)}
                    className={`cursor-pointer ${member.id === selectedId ? 'bg-[#f6f9fc]' : ''}`}
                  >
                    <td className="font-medium whitespace-nowrap text-primary-500">{member.name}</td>
                    <td className="muted whitespace-nowrap">{member.department || '-'}</td>
                    <td className="muted whitespace-nowrap">{member.position || '-'}</td>
                    <td className="tabular-nums whitespace-nowrap">{member.leaveSummary.accruedThisYear}</td>
                    <td className="tabular-nums muted whitespace-nowrap">{member.leaveSummary.usedDays}</td>
                    <td className="tabular-nums whitespace-nowrap">
                      <span className={`font-medium ${remainingClass(member.leaveSummary.remaining)}`}>
                        {member.leaveSummary.remaining}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected && <MemberUsages member={selected} />}
    </div>
  );
}

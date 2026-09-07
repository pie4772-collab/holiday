import { useEffect, useMemo, useState } from 'react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelHeader, PanelBody } from '../../components/ui/Panel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useEmployeeRoster, useApprovalLines, useSaveApprovalLines } from '../../hooks/useEmployeeRoster';

function toFormSeats(seats) {
  return (seats || []).map((seat) => ({
    id: seat.id,
    seatKey: seat.seatKey,
    title: seat.title,
    stepRole: seat.stepRole,
    employeeId: seat.employeeId || '',
    scopes: seat.scopes || [],
  }));
}

export function AdminApprovalLines() {
  const { data, isLoading, isError, refetch } = useApprovalLines();
  const { data: roster } = useEmployeeRoster(false);
  const saveLines = useSaveApprovalLines();
  const [seats, setSeats] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (data?.seats) setSeats(toFormSeats(data.seats));
  }, [data]);

  const people = useMemo(
    () => (roster || []).filter((emp) => emp.isActive).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [roster]
  );

  const seoulDepartments = useMemo(
    () =>
      (data?.departments || []).filter(
        (dept) => dept.workplace === '서울' || String(dept.workplaceCode) === '1'
      ),
    [data]
  );

  function updateSeat(id, patch) {
    setSeats((prev) => prev.map((seat) => (seat.id === id ? { ...seat, ...patch } : seat)));
  }

  function toggleScope(seat, dept) {
    const exists = seat.scopes.some((scope) => scope.departmentCode === dept.code);
    const scopes = exists
      ? seat.scopes.filter((scope) => scope.departmentCode !== dept.code)
      : [
          ...seat.scopes.filter((scope) => scope.departmentCode !== dept.code),
          {
            departmentCode: dept.code,
            departmentName: dept.name,
            workplaceCode: dept.workplaceCode,
          },
        ];
    updateSeat(seat.id, { scopes });
  }

  async function handleSave() {
    const result = await saveLines.mutateAsync({
      seats: seats.map((seat) => ({
        id: seat.id,
        seatKey: seat.seatKey,
        employeeId: seat.employeeId || null,
        scopes: seat.scopes,
      })),
    });
    setSeats(toFormSeats(result.seats));
    setMessage('결재 라인을 저장했습니다.');
    setTimeout(() => setMessage(''), 3000);
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

  const execSeats = seats.filter((seat) => seat.stepRole === '임원');
  const otherSeats = seats.filter((seat) => seat.stepRole !== '임원');

  return (
    <div>
      <PageHeader
        title="결재 라인"
        description="서울 팀장 소관 임원과 대표이사를 지정합니다. 공석이면 해당 단계는 관리자가 대신 승인할 수 있습니다."
        actions={
          <Button onClick={handleSave} disabled={saveLines.isPending}>
            {saveLines.isPending ? '저장 중…' : '저장'}
          </Button>
        }
      />

      {message && (
        <div className="mb-4 rounded-md border border-[#d7f7c2] bg-[#f6fef9] px-4 py-3 text-sm text-[#09825d]">
          {message}
        </div>
      )}
      {saveLines.isError && (
        <div className="mb-4 rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#df1b41]">
          {saveLines.error?.message || '저장에 실패했습니다.'}
        </div>
      )}

      <Panel className="mb-5">
        <PanelHeader title="서울 팀장 소관 임원" description="재경·관리·구매 / 수출 / 영업" />
        <PanelBody>
          <div className="space-y-6">
            {execSeats.map((seat) => (
              <div key={seat.id} className="border border-stripe-border rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-stripe-text">{seat.title}</h3>
                    {seat.employeeId ? (
                      <Badge variant="success">지정</Badge>
                    ) : (
                      <Badge variant="warning">공석</Badge>
                    )}
                  </div>
                  <select
                    value={seat.employeeId}
                    onChange={(e) => updateSeat(seat.id, { employeeId: e.target.value })}
                    className="stripe-input max-w-xs"
                  >
                    <option value="">공석</option>
                    {people.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.empNo || '사번 없음'}) · {emp.department}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-stripe-muted mb-2">소관 부서</p>
                <div className="flex flex-wrap gap-2">
                  {seoulDepartments.map((dept) => {
                    const checked = seat.scopes.some((scope) => scope.departmentCode === dept.code);
                    return (
                      <label
                        key={`${seat.id}-${dept.code}`}
                        className={`text-xs px-2.5 py-1.5 rounded-md border cursor-pointer ${
                          checked
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-stripe-border text-stripe-muted'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleScope(seat, dept)}
                        />
                        {dept.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </PanelBody>
      </Panel>

      {otherSeats.map((seat) => (
        <Panel key={seat.id} className="mb-5">
          <PanelHeader
            title={seat.title}
            description={
              seat.stepRole === '대표이사'
                ? '서울 팀장 결재의 최종 단계'
                : '해당 부서 팀원 신청의 승인자'
            }
          />
          <PanelBody>
            <div className="flex flex-wrap items-center gap-3">
              {seat.employeeId ? <Badge variant="success">지정</Badge> : <Badge variant="warning">공석</Badge>}
              <select
                value={seat.employeeId}
                onChange={(e) => updateSeat(seat.id, { employeeId: e.target.value })}
                className="stripe-input max-w-xs"
              >
                <option value="">공석</option>
                {people.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.empNo || '사번 없음'}) · {emp.department}
                  </option>
                ))}
              </select>
            </div>
            {seat.stepRole !== '대표이사' && (
              <div className="flex flex-wrap gap-2 mt-4">
                {seoulDepartments.map((dept) => {
                  const checked = seat.scopes.some((scope) => scope.departmentCode === dept.code);
                  return (
                    <label
                      key={`${seat.id}-${dept.code}`}
                      className={`text-xs px-2.5 py-1.5 rounded-md border cursor-pointer ${
                        checked
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-stripe-border text-stripe-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleScope(seat, dept)}
                      />
                      {dept.name}
                    </label>
                  );
                })}
              </div>
            )}
          </PanelBody>
        </Panel>
      ))}
    </div>
  );
}

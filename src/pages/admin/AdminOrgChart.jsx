import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Crown, Search, Users } from 'lucide-react';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { useOrgChart } from '../../hooks/useEmployeeRoster';
import { useCurrentEmployee } from '../../hooks/useLeaveData';
import { hasPermission } from '../../utils/access';

const VLINE = 'mx-auto h-6 w-px bg-[#c9d3df]';

function matches(person, q) {
  return Boolean(q) && [person.name, person.empNo, person.jobRank].some((v) => String(v || '').toLowerCase().includes(q));
}

function PersonName({ person, q, canOpen, className = '' }) {
  const hit = matches(person, q);
  const text = (
    <span className={`${hit ? 'rounded bg-[#fde68a] px-0.5' : ''} ${className}`} title={[person.jobRank, person.empNo].filter(Boolean).join(' · ')}>
      {person.name}
    </span>
  );
  return canOpen ? (
    <Link to={`/admin/personnel/${person.id}`} className="hover:text-primary-600 hover:underline">
      {text}
    </Link>
  ) : (
    text
  );
}

function TopNode({ icon: Icon, title, person, vacant, sub, q, canOpen, dark = false }) {
  return (
    <div
      className={`min-w-[10rem] rounded-lg border px-4 py-3 text-center shadow-sm ${
        dark ? 'border-primary-600 bg-primary-600 text-white' : 'border-stripe-border bg-white'
      }`}
    >
      <div className={`flex items-center justify-center gap-1.5 text-[12px] font-medium ${dark ? 'text-white/80' : 'text-stripe-muted'}`}>
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {title}
      </div>
      <div className="mt-1 text-[15px] font-semibold">
        {person ? <PersonName person={person} q={q} canOpen={canOpen} /> : vacant ? <span className={dark ? 'text-white/70' : 'text-stripe-muted'}>공석</span> : null}
      </div>
      {sub && <div className={`mt-1 text-[11px] leading-snug ${dark ? 'text-white/70' : 'text-stripe-muted'}`}>{sub}</div>}
    </div>
  );
}

function DepartmentCard({ dept, q, showMembers, canOpen }) {
  const hit = dept.members.some((m) => matches(m, q)) || dept.leads.some((l) => matches(l, q));
  const open = showMembers || (q && hit);
  return (
    <div className={`rounded-md border bg-white ${hit ? 'border-[#f59e0b] ring-1 ring-[#fde68a]' : 'border-stripe-border'}`}>
      <div className="flex items-start justify-between gap-2 border-b border-stripe-border px-3 py-2">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-stripe-text">{dept.name}</div>
          {dept.officerTitles.length > 0 && <div className="text-[11px] text-stripe-muted">소관: {dept.officerTitles.join(', ')}</div>}
        </div>
        <Badge className="shrink-0">{dept.headcount}명</Badge>
      </div>
      <div className="space-y-1.5 px-3 py-2 text-[13px]">
        {dept.leads.length ? (
          dept.leads.map((lead) => (
            <div key={`${lead.id}-${lead.label}`} className="flex items-center gap-1.5">
              <Badge variant={lead.label === '담당' ? 'purple' : 'info'}>{lead.label}</Badge>
              <PersonName person={lead} q={q} canOpen={canOpen} className="font-medium" />
              {lead.jobRank && <span className="text-[12px] text-stripe-muted">{lead.jobRank}</span>}
              {lead.concurrent && <span className="text-[11px] text-stripe-muted">({lead.department})</span>}
            </div>
          ))
        ) : (
          <div className="text-[12px] text-stripe-muted">팀장 없음</div>
        )}
        {dept.members.length > 0 &&
          (open ? (
            <div className="flex flex-wrap gap-x-2 gap-y-1 border-t border-dashed border-stripe-border pt-1.5">
              {dept.members.map((m) => (
                <span key={m.id} className="whitespace-nowrap">
                  <PersonName person={m} q={q} canOpen={canOpen} />
                  {m.jobRank && <span className="ml-0.5 text-[11px] text-stripe-muted">{m.jobRank}</span>}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-stripe-muted">팀원 {dept.members.length}명</div>
          ))}
      </div>
    </div>
  );
}

/** 조직도: 대표이사 → 임원·담당 → 사업장(공장장) → 부서(팀장·팀원). 직원 정보와 결재 라인 설정으로 자동으로 그립니다. */
export function AdminOrgChart() {
  const { data, isLoading, isError, error, refetch } = useOrgChart();
  const { data: me } = useCurrentEmployee();
  const canOpen = hasPermission(me, 'records.view');
  const [query, setQuery] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const q = query.trim().toLowerCase();

  const hitCount = useMemo(() => {
    if (!data || !q) return 0;
    const people = [
      ...data.ceo,
      ...data.officers.map((o) => o.holder).filter(Boolean),
      ...data.workplaces.flatMap((w) => [...w.heads, ...w.departments.flatMap((d) => [...d.leads, ...d.members])]),
    ];
    return new Set(people.filter((p) => matches(p, q)).map((p) => p.id)).size;
  }, [data, q]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }
  if (isError) return <ErrorMessage message={error?.message} onRetry={() => refetch()} />;

  const officers = data.officers;
  return (
    <div>
      <PageHeader
        title="조직도"
        description="재직 직원의 사업장·부서·직급과 결재 라인 설정(임원·담당 자리)으로 자동으로 그립니다. 사원 명부나 결재 라인을 고치면 바로 반영됩니다."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stripe-muted" />
          <input className="stripe-input pl-8" placeholder="이름·사번·직위 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-stripe-text">
          <input type="checkbox" checked={showMembers} onChange={(e) => setShowMembers(e.target.checked)} />
          팀원 이름 모두 보기
        </label>
        <span className="text-[13px] text-stripe-muted">
          재직 {data.total}명{q && ` · 찾은 사람 ${hitCount}명`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stripe-border bg-[#f6f9fc] p-5">
        <div className="min-w-[720px]">
          <div className="flex flex-wrap justify-center gap-3">
            {data.ceo.length ? (
              data.ceo.map((p) => <TopNode key={p.id} icon={Crown} title="대표이사" person={p} q={q} canOpen={canOpen} dark />)
            ) : (
              <TopNode icon={Crown} title="대표이사" vacant dark />
            )}
          </div>

          {officers.length > 0 && (
            <>
              <div className={VLINE} />
              <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-3 border-t border-[#c9d3df] pt-4">
                {officers.map((o) => (
                  <TopNode
                    key={o.key}
                    title={o.title}
                    person={o.holder}
                    vacant={!o.holder}
                    sub={o.departments.length ? o.departments.join(' · ') : ''}
                    q={q}
                    canOpen={canOpen}
                  />
                ))}
              </div>
            </>
          )}

          <div className={VLINE} />
          <div
            className="grid gap-4 border-t border-[#c9d3df] pt-4"
            style={{ gridTemplateColumns: `repeat(${Math.max(data.workplaces.length, 1)}, minmax(15rem, 1fr))` }}
          >
            {data.workplaces.map((w) => {
              const headcount = w.heads.length + w.departments.reduce((sum, d) => sum + d.headcount, 0);
              return (
                <section key={w.code || w.name} className="min-w-0">
                  <div className="rounded-lg border border-[#1e3a5f] bg-[#1e3a5f] px-4 py-3 text-white shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                        <Building2 className="h-4 w-4" /> {w.name}
                      </span>
                      <span className="flex items-center gap-1 text-[12px] text-white/80">
                        <Users className="h-3.5 w-3.5" /> {headcount}명
                      </span>
                    </div>
                    {w.heads.length > 0 && (
                      <div className="mt-1 text-[13px]">
                        공장장{' '}
                        {w.heads.map((h, i) => (
                          <span key={h.id} className="font-medium">
                            {i > 0 && ', '}
                            <PersonName person={h} q={q} canOpen={canOpen} />
                            {h.position !== '공장장' && <span className="ml-1 font-normal text-white/80">{h.position}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="ml-4 space-y-2 border-l border-[#c9d3df] pl-4 pt-3">
                    {w.departments.map((d) => (
                      <div key={d.code || d.name} className="relative">
                        <span className="absolute -left-4 top-4 h-px w-4 bg-[#c9d3df]" />
                        <DepartmentCard dept={d} q={q} showMembers={showMembers} canOpen={canOpen} />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-stripe-muted">
        팀장은 직급이 팀장인 직원(겸직 팀장 포함), 공장장은 그 사업장의 공장장과 서울 외 사업장 소속 이사·상무·전무입니다. 임원·담당 자리와 소관 부서는 환경설정 → 결재 라인에서 정합니다.
      </p>
    </div>
  );
}

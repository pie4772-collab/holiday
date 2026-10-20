import { createPortal } from 'react-dom';
import {
  COMPANY_NAME,
  EVALUATION_GROUPS,
  EVALUATION_KINDS,
  MAX_TOTAL_SCORE,
  OUTCOMES,
  PASS_SCORE,
} from '../../constants/evaluation';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dateWithWeekday(value) {
  if (!value) return '';
  const key = value.slice(0, 10);
  const [y, m, d] = key.split('-').map(Number);
  return `${key}(${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

const cell = 'border border-black px-2 py-1';
const head = `${cell} bg-[#f2f2f2] text-center font-semibold`;

function splitStamp(value) {
  const text = String(value || '').replace('T', ' ');
  return { date: text.slice(0, 10), time: text.slice(11, 16) };
}

/**
 * 결재란: 지정된 사람 이름과, 지금 상태에서 끝난 단계의 처리 일시.
 * 반려되면 이전 제출 일시가 남아 있어서 상태와 처리 순서로 끝난 단계인지 판단합니다.
 * 지정된 사람이 아닌 인사담당이 대신 처리했으면 대리 처리자를 함께 적습니다.
 */
function signerBoxes(data) {
  const submitted = ['reviewing', 'submitted', 'confirmed'].includes(data.status) && Boolean(data.submittedAt);
  const reviewed =
    ['submitted', 'confirmed'].includes(data.status) && Boolean(data.reviewedAt) && submitted && data.reviewedAt >= data.submittedAt;
  const proxy = (assignedId, actorId, actorName) => (assignedId && actorId && assignedId !== actorId ? actorName : '');
  return [
    {
      role: '평가자',
      name: data.evaluatorName || (submitted ? data.submittedByName : ''),
      at: submitted ? data.submittedAt : '',
      proxy: submitted ? proxy(data.evaluatorId, data.submittedById, data.submittedByName) : '',
      proxyOnly: submitted && !data.evaluatorId,
    },
    {
      role: '임원',
      name: data.reviewerName || (reviewed ? data.reviewedByName : ''),
      at: reviewed ? data.reviewedAt : '',
      proxy: reviewed ? proxy(data.reviewerId, data.reviewedById, data.reviewedByName) : '',
      proxyOnly: reviewed && !data.reviewerId,
    },
    {
      role: '인사',
      name: data.confirmedByName,
      at: data.status === 'confirmed' ? data.confirmedAt : '',
    },
  ];
}

/** 근무평가서 양식 그대로 인쇄합니다. 화면에는 보이지 않고 인쇄할 때만 나옵니다. */
export function EvaluationPrintSheet({ data, scores, total, comment, reviewerComment, recommendation }) {
  const kind = EVALUATION_KINDS[data.kind];
  const isProbation = data.kind === 'probation';
  const result = data.outcome || recommendation;
  const scoreText = `${total != null ? `${total} / ${MAX_TOTAL_SCORE}` : ''} 점`;
  const signers = signerBoxes(data);

  return createPortal(
    // 표가 인쇄 영역 경계에 닿으면 바깥선이 잘려서 둘레에 여유를 둡니다.
    <div className="evaluation-print p-0.5 text-[11.5px] leading-snug text-black">
      <div className="mb-3 flex items-stretch justify-between gap-4">
        <div className="flex flex-1 flex-col justify-between">
          <h1 className="pt-2 text-[22px] font-bold tracking-tight">
            {kind?.formTitle || '근무평가서'}
            {data.round > 1 && <span className="ml-2 text-[15px] font-semibold">({data.round}차)</span>}
          </h1>
          <table className="mt-3 w-full border-collapse">
            <tbody>
              <tr>
                <td className={`${head} w-24`}>작성일자</td>
                <td className={`${cell} text-center`}>{dateWithWeekday(data.submittedAt)}</td>
              </tr>
              <tr>
                <td className={head}>문서번호</td>
                <td className={`${cell} text-center`}>{data.documentNo}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <table className="border-collapse">
          <tbody>
            <tr>
              <td rowSpan={2} className={`${head} w-6 px-1 [writing-mode:vertical-rl]`}>
                결 재
              </td>
              {signers.map(({ role }) => (
                <td key={role} className={`${head} w-24`}>
                  {role}
                </td>
              ))}
            </tr>
            <tr>
              {signers.map(({ role, name, at, proxy, proxyOnly }) => {
                const stamp = splitStamp(at);
                return (
                  <td key={role} className={`${cell} h-20 px-1 text-center align-middle`}>
                    <div className="font-medium">{name || ''}</div>
                    {at && (
                      <div className="mt-0.5 text-[9.5px] leading-tight tabular-nums">
                        <div>{stamp.date}</div>
                        <div>{stamp.time}</div>
                      </div>
                    )}
                    {(proxy || proxyOnly) && (
                      <div className="mt-0.5 text-[9px] leading-tight">{proxyOnly ? '(인사 대리 입력)' : `대리 ${proxy}`}</div>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <table className="mb-3 w-full border-collapse">
        <tbody>
          <tr>
            <td className={`${head} w-24`}>제목</td>
            <td className={`${cell} text-center`}>
              [{COMPANY_NAME}] {data.employee.name}_{data.label}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="mb-3 w-full border-collapse">
        <tbody>
          <tr>
            <td rowSpan={2} className={`${head} w-16`}>
              평가
              <br />
              대상
            </td>
            <td className={`${head} w-20`}>회사</td>
            <td className={cell}>{COMPANY_NAME}</td>
            <td className={`${head} w-20`}>부서</td>
            <td className={cell}>{data.employee.department}</td>
            <td className={`${head} w-20`}>입사일자</td>
            <td className={`${cell} text-center`}>{data.employee.hireDate}</td>
          </tr>
          <tr>
            <td className={head}>성명</td>
            <td className={cell}>{data.employee.name}</td>
            <td className={head}>직급</td>
            <td className={cell}>{data.employee.position}</td>
            <td className={head}>평가기간</td>
            <td className={`${cell} whitespace-nowrap text-center`}>
              {data.periodStart} ~ {data.dueDate}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="mb-3 w-full border-collapse">
        <thead>
          <tr>
            <th colSpan={2} className={`${head} w-40`}>
              평가항목
            </th>
            <th className={head}>평 가 내 용</th>
            <th className={`${head} w-20`}>
              평가점수
              <br />
              (1~5점)
            </th>
          </tr>
        </thead>
        <tbody>
          {EVALUATION_GROUPS.map((group) =>
            group.items.map((item, index) => (
              <tr key={item.key}>
                {index === 0 && (
                  <td rowSpan={group.items.length} className={`${head} w-16`}>
                    {group.label}
                  </td>
                )}
                <td className={`${cell} text-center font-semibold`}>{item.label}</td>
                <td className={cell}>{item.question}</td>
                <td className={`${cell} text-center tabular-nums`}>{scores[item.key] ?? ''}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <table className="mb-3 w-full border-collapse">
        <tbody>
          <tr>
            <td rowSpan={2} className={`${head} w-16`}>
              평가
              <br />
              의견
            </td>
            <td className={`${head} w-24`}>
              평가의견
              <br />
              (팀장)
            </td>
            <td className={`${cell} h-24 whitespace-pre-line align-top`}>{comment}</td>
          </tr>
          <tr>
            <td className={head}>
              평가의견
              <br />
              (임원)
            </td>
            <td className={`${cell} h-24 whitespace-pre-line align-top`}>{reviewerComment}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse">
        <tbody>
          {isProbation ? (
            <>
              <tr>
                <td rowSpan={2} className={`${head} w-16`}>
                  평가
                  <br />
                  결과
                </td>
                <td className={`${head} w-28`}>* {PASS_SCORE}점 이상</td>
                <td className={`${cell} text-center`}>정식채용</td>
                <td className={`${head} w-32`}>최종 평가 점수</td>
                <td className={`${cell} w-32 text-center`}>{scoreText}</td>
              </tr>
              <tr>
                <td className={head}>* {PASS_SCORE}점 미만</td>
                <td className={`${cell} text-center`}>수습연장 or 계약종료</td>
                <td className={head}>정규직 채용 여부</td>
                <td className={`${cell} text-center font-semibold`}>{OUTCOMES[result] || ''}</td>
              </tr>
            </>
          ) : (
            <tr>
              <td className={`${head} w-16`}>
                평가
                <br />
                결과
              </td>
              <td className={`${head} w-32`}>최종 평가 점수</td>
              <td className={`${cell} text-center`}>{scoreText}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>,
    document.body
  );
}

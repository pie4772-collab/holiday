import { createPortal } from 'react-dom';
import { COMPANY_NAME } from '../../constants/evaluation';
import { COMPLETE_RATIO, formatSeconds } from '../../constants/training';

const cell = 'border border-black px-2 py-1';
const head = `${cell} bg-[#f2f2f2] text-center font-semibold`;

function todayKey() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** 법정의무교육 실시 대장. 화면에는 보이지 않고 인쇄할 때만 나옵니다. rows 는 인쇄할 대상자 목록입니다. */
export function TrainingPrintSheet({ session, rows }) {
  const { course } = session;
  const completed = session.assignees.filter((a) => a.completedAt).length;
  const videoText = course.videos
    .map((v) => `${v.title}${v.kind === 'youtube' && v.durationSeconds ? ` (${formatSeconds(v.durationSeconds)})` : v.kind === 'link' ? ' (외부 사이트)' : ''}`)
    .join(' / ');
  const method = `온라인 동영상 교육 (사내 시스템, 영상별 ${Math.round(COMPLETE_RATIO * 100)}% 이상 시청${
    course.requireMaterialConfirm && course.companyMaterial ? ' 및 회사 자료 확인' : ''
  } 시 수료)`;

  return createPortal(
    <div className="training-print p-0.5 text-[11px] leading-snug text-black">
      <h1 className="mb-1 text-center text-[20px] font-bold tracking-tight">법정의무교육 실시 대장</h1>
      <p className="mb-3 text-center text-[12px]">{COMPANY_NAME}</p>

      <table className="mb-3 w-full border-collapse">
        <tbody>
          <tr>
            <td className={`${head} w-24`}>교육명</td>
            <td className={cell} colSpan={3}>
              {session.title}
            </td>
          </tr>
          <tr>
            <td className={head}>교육 기간</td>
            <td className={cell}>
              {session.startDate} ~ {session.dueDate}
            </td>
            <td className={`${head} w-24`}>교육 기관</td>
            <td className={cell}>{course.provider}</td>
          </tr>
          <tr>
            <td className={head}>교육 방법</td>
            <td className={cell} colSpan={3}>
              {method}
            </td>
          </tr>
          <tr>
            <td className={head}>교육 자료</td>
            <td className={cell} colSpan={3}>
              {videoText || '-'}
              {course.companyMaterial && <div className="mt-0.5">회사 자료: 사내 시스템 게시 (직원 확인 기록 보관)</div>}
            </td>
          </tr>
          <tr>
            <td className={head}>교육 인원</td>
            <td className={cell} colSpan={3}>
              대상 {session.assignees.length}명 · 수료 {completed}명 · 미수료 {session.assignees.length - completed}명
              {rows.length !== session.assignees.length && ` (아래 명단 ${rows.length}명)`}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${head} w-8`}>번호</th>
            <th className={head}>사업장</th>
            <th className={head}>부서</th>
            <th className={head}>성명</th>
            <th className={head}>사번</th>
            <th className={head}>수료 일시</th>
            <th className={head}>시청 시간</th>
            <th className={`${head} w-24`}>서명</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a, index) => (
            <tr key={a.id} className="break-inside-avoid">
              <td className={`${cell} text-center tabular-nums`}>{index + 1}</td>
              <td className={cell}>{a.workplace}</td>
              <td className={cell}>{a.department}</td>
              <td className={`${cell} text-center`}>{a.name}</td>
              <td className={`${cell} text-center tabular-nums`}>{a.empNo}</td>
              <td className={`${cell} text-center tabular-nums`}>{a.completedAt ? a.completedAt.slice(0, 16) : '미수료'}</td>
              <td className={`${cell} text-center`}>{a.watchedSeconds ? formatSeconds(a.watchedSeconds) : '-'}</td>
              <td className={`${cell} h-7`} />
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end gap-10 text-[12px]">
        <span>작성일: {todayKey()}</span>
        <span>작성자: ____________ (인)</span>
        <span>확인자: ____________ (인)</span>
      </div>
    </div>,
    document.body
  );
}

import { createPortal } from 'react-dom';
import { DocumentSheetView } from './DraftSheet';
import { stepBoxLabel } from './documentFormat';

const cell = 'border border-black px-2 py-1';
const head = `${cell} bg-[#f2f2f2] text-center font-semibold`;

/** 전자결재 문서를 화면과 같은 양식으로 A4에 인쇄합니다. 결재 의견은 양식 아래에 붙입니다. 화면에는 보이지 않습니다. */
export function DocumentPrintSheet({ doc }) {
  const comments = doc.steps.filter((step) => step.comment);

  return createPortal(
    <div className="document-print text-[12px] leading-snug text-black">
      <DocumentSheetView doc={doc} />
      {comments.length > 0 && (
        <table className="mt-3 w-full border-collapse" style={{ fontFamily: "'Batang', '바탕', serif" }}>
          <thead>
            <tr>
              <th className={`${head} w-28`}>결재자</th>
              <th className={head}>의견</th>
            </tr>
          </thead>
          <tbody>
            {comments.map((step) => (
              <tr key={step.order}>
                <td className={`${cell} text-center`}>
                  {step.actorName}
                  <div className="text-[10px]">{stepBoxLabel(step)}</div>
                </td>
                <td className={`${cell} whitespace-pre-line`}>
                  {step.status === 'rejected' && <strong>[{step.kind === 'agreement' ? '반대' : '반려'}] </strong>}
                  {step.comment}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>,
    document.body
  );
}

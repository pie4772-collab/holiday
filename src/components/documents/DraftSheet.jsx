import { COMPANY_LEGAL_NAME, DOC_FORM_MAP, sheetTitle } from '../../constants/approvalDocs';
import { documentBodyRows, documentRichBody, sheetInput, signersFromDoc } from './documentFormat';

const SHEET_FONT = { fontFamily: "'Batang', '바탕', serif" };

/** 왼쪽 항목 이름 칸은 글자를 칸 너비에 고르게 벌립니다 (회 사 명, 일    자). */
export function SheetRow({ label, children, className = '', align = 'center' }) {
  return (
    <div className={`flex border-b border-black ${className}`}>
      <div className="flex w-[84px] shrink-0 items-center border-r border-black px-3 py-2">
        <span className="block w-full [text-align-last:justify]">{label}</span>
      </div>
      <div className={`flex min-w-0 flex-1 px-2.5 py-1.5 ${align === 'top' ? 'items-start' : 'items-center'}`}>
        <div className="w-full min-w-0">{children}</div>
      </div>
    </div>
  );
}

/** 결재란·합의란: 직위 / 이름 / 처리일(또는 반려·대리 표시) 세 줄 */
export function SignBlock({ title, signers }) {
  if (!signers.length) return null;
  return (
    <table className="border-collapse text-[13px]">
      <tbody>
        <tr>
          <th rowSpan={3} className="w-7 border border-black bg-[#f2f2f2] px-1 text-center font-semibold leading-tight">
            {title.split('').map((ch, i) => (
              <span key={i} className="block">
                {ch}
              </span>
            ))}
          </th>
          {signers.map((s) => (
            <td key={s.key} className="h-7 w-[78px] border border-black px-1 text-center font-normal">
              <span className="block truncate">{s.position}</span>
            </td>
          ))}
        </tr>
        <tr>
          {signers.map((s) => (
            <td key={s.key} className="h-[66px] border border-black px-1 text-center align-middle">
              <span className="block break-keep">{s.name}</span>
            </td>
          ))}
        </tr>
        <tr>
          {signers.map((s) => (
            <td
              key={s.key}
              className={`h-7 border border-black px-0.5 text-center text-[11px] tabular-nums ${s.alert ? 'font-semibold text-[#c0262d]' : ''}`}
            >
              {s.sub}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function spacedTitle(title) {
  return title.length <= 3 ? 'text-[32px] tracking-[0.6em] pl-[0.6em]' : 'text-[24px] tracking-[0.12em] pl-[0.12em]';
}

/**
 * 기안 문서 양식. 윗부분(제목·회사명·결재란)과 관리번호·일자·작성자·제목 줄을 그리고, 본문은 children 으로 받습니다.
 * signers: { approval: [], agreement: [] } — signersFromDoc / signersFromDraft 로 만듭니다.
 */
export function DraftSheet({ title, signers, documentNo, date, writer, subject, children, className = '' }) {
  return (
    <div
      className={`border border-black bg-white text-[14px] text-[#111] [&>*:last-child]:border-b-0 ${className}`}
      style={SHEET_FONT}
    >
      <div className="flex border-b border-black">
        <div className="flex w-[260px] shrink-0 flex-col border-r border-black">
          <div className={`flex min-h-[104px] flex-1 items-center justify-center border-b border-black ${spacedTitle(title)}`}>
            {title}
          </div>
          <SheetRow label="회사명" className="border-b-0">
            {COMPANY_LEGAL_NAME}
          </SheetRow>
        </div>
        <div className="min-w-0 flex-1" />
        <div className="flex shrink-0 flex-col items-end gap-1 p-1.5">
          <SignBlock title="결재" signers={signers.approval} />
          <SignBlock title="합의" signers={signers.agreement} />
        </div>
      </div>
      <SheetRow label="관리번호">{documentNo}</SheetRow>
      <SheetRow label="일자">{date}</SheetRow>
      <SheetRow label="작성자">{writer}</SheetRow>
      <SheetRow label="제목">{subject}</SheetRow>
      {children}
    </div>
  );
}

/** 기안된 문서를 양식 그대로 보여 줍니다 (문서 보기·인쇄 공용). */
export function DocumentSheetView({ doc, className = '' }) {
  const rows = documentBodyRows(doc);
  const rich = documentRichBody(doc);
  const writer = [doc.drafter.name, [doc.drafter.department, doc.drafter.position].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' · ');
  return (
    <DraftSheet
      className={className}
      title={sheetTitle(DOC_FORM_MAP[doc.formKey])}
      signers={signersFromDoc(doc)}
      documentNo={doc.documentNo || (doc.status === 'pending' ? '(결재 진행 중)' : '-')}
      date={String(doc.submittedAt || '').slice(0, 10)}
      writer={writer}
      subject={doc.title}
    >
      {rows.map((row) => (
        <SheetRow key={row.label} label={row.label} align={row.multiline ? 'top' : 'center'}>
          <span className={row.multiline ? 'whitespace-pre-line' : ''}>{row.value}</span>
        </SheetRow>
      ))}
      {doc.refs?.length > 0 && <SheetRow label="참조">{doc.refs.map((ref) => ref.name).join(', ')}</SheetRow>}
      {rich && (
        <div className="border-b border-black px-4 py-3" style={{ minHeight: 360 }}>
          {rich.html != null ? (
            <div className="rich-content" dangerouslySetInnerHTML={{ __html: rich.html }} />
          ) : (
            <div className="rich-content whitespace-pre-line">{rich.text}</div>
          )}
        </div>
      )}
    </DraftSheet>
  );
}

/** 양식 입력 칸을 문서 양식의 줄로 그립니다 (서식 본문 칸은 제외). */
export function SheetFields({ form, values, onChange }) {
  function set(key, value) {
    onChange({ ...values, [key]: value });
  }
  return form.fields
    .filter((field) => field.type !== 'richtext')
    .map((field) => {
      const id = `doc-field-${field.key}`;
      const value = values[field.key] ?? '';
      const label = (
        <label htmlFor={id}>
          {field.label}
          {field.required && <span className="text-[#df1b41]">*</span>}
        </label>
      );
      let input;
      if (field.type === 'textarea') {
        input = (
          <textarea
            id={id}
            className={`${sheetInput} min-h-[110px]`}
            maxLength={field.max}
            value={value}
            onChange={(e) => set(field.key, e.target.value)}
          />
        );
      } else if (field.type === 'select') {
        input = (
          <select id={id} className={sheetInput} value={value} onChange={(e) => set(field.key, e.target.value)}>
            <option value="">선택</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      } else if (field.type === 'amount') {
        input = (
          <input
            id={id}
            className={`${sheetInput} max-w-[220px] text-right tabular-nums`}
            inputMode="numeric"
            value={value === '' ? '' : Number(String(value).replace(/,/g, '')).toLocaleString('ko-KR')}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, '');
              set(field.key, digits === '' ? '' : String(Number(digits)));
            }}
          />
        );
      } else {
        input = (
          <input
            id={id}
            type={field.type === 'date' ? 'date' : 'text'}
            className={`${sheetInput} ${field.type === 'date' ? 'max-w-[220px]' : ''}`}
            maxLength={field.max}
            value={value}
            onChange={(e) => set(field.key, e.target.value)}
          />
        );
      }
      return (
        <SheetRow key={field.key} label={label} align={field.type === 'textarea' ? 'top' : 'center'}>
          {input}
        </SheetRow>
      );
    });
}

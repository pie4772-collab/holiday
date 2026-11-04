import { DOC_FORM_MAP, HR_STEP, RECEIVE_STEP, formatAmount } from '../../constants/approvalDocs';
import { CERT_ITEMS, CERT_TYPES } from '../../constants/certificates';

const ITEM_LABELS = Object.fromEntries(CERT_ITEMS.map((item) => [item.key, item.label]));

/** 문서 본문을 [{ label, value, multiline }] 로 바꿉니다. 화면·인쇄 공용 */
export function documentBodyRows(doc) {
  const body = doc.body || {};
  if (doc.formKey === 'certificate' || doc.formKey === 'certificate_issue') {
    const target =
      doc.formKey === 'certificate_issue'
        ? [
            {
              label: '발급 대상',
              value: [
                body.employeeName,
                [body.empNo, body.employeeDepartment, body.employeePosition].filter(Boolean).join(' · '),
                body.employeeActive === false ? '퇴직' : '',
              ]
                .filter(Boolean)
                .join(' / '),
            },
            { label: '발급 경위', value: body.requestId ? '직원 신청' : '인사담당 품의' },
          ]
        : [];
    return [
      ...target,
      { label: '증명서 종류', value: CERT_TYPES[body.certType]?.label || body.certType },
      { label: '기재 항목', value: ['성명', '재직기간', ...(body.items || []).map((key) => ITEM_LABELS[key] || key)].join(', ') },
      ...(body.duty ? [{ label: '담당업무', value: body.duty }] : []),
      ...(body.retireReason ? [{ label: '퇴직사유', value: body.retireReason }] : []),
      { label: '용도', value: body.purpose },
      ...(body.submitTo ? [{ label: '제출처', value: body.submitTo }] : []),
    ];
  }
  const form = DOC_FORM_MAP[doc.formKey];
  if (!form) return [];
  const rows = [];
  const fields = form.fields;
  for (const field of fields) {
    if (field.key === 'endDate' || field.type === 'richtext') continue;
    const value = body[field.key];
    if (field.key === 'startDate') {
      const end = body.endDate;
      rows.push({ label: '기간', value: end && end !== value ? `${value} ~ ${end}` : value });
      continue;
    }
    if (value === '' || value == null) continue;
    rows.push({
      label: field.label,
      value: field.type === 'amount' ? formatAmount(value) : String(value),
      multiline: field.type === 'textarea',
    });
  }
  return rows;
}

/**
 * 서식 있는 본문. format 이 html 인 본문만 서버에서 허용 태그로 정리된 것이라 HTML 로 그립니다.
 * 그 밖(변경 전 문서의 일반 글)은 글자로 보여 줍니다.
 */
export function documentRichBody(doc) {
  const form = DOC_FORM_MAP[doc.formKey];
  const field = form?.fields.find((f) => f.type === 'richtext');
  if (!field) return null;
  const value = doc.body?.[field.key] ?? '';
  return doc.body?.format === 'html' ? { html: String(value) } : { text: String(value) };
}

/** 글자를 편집기에 넣을 HTML 로 바꿉니다 (변경 전 문서를 다시 기안할 때). */
export function plainToHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split('\n')
    .map((line) => `<p>${line || '<br>'}</p>`)
    .join('');
}

export function stepBoxLabel(step) {
  return step.label === '인사' ? '인사 확인' : step.label;
}

/** 문서 양식 안의 입력 칸 (회색 바탕) */
export const sheetInput =
  'w-full rounded-none border border-[#d9d9d9] bg-[#f5f5f5] px-2 py-1 text-[14px] outline-none focus:border-[#7a8ba3] focus:bg-white';

function dotDate(value) {
  const text = String(value || '').slice(0, 10);
  return text ? text.replaceAll('-', '.') : '';
}

/** 문서 보기·인쇄용 결재란: { approval, agreement } 각각 [{ key, position, name, sub, alert }] */
export function signersFromDoc(doc) {
  const stepSigner = (step) => {
    const receive = step.role === RECEIVE_STEP;
    const agreement = step.kind === 'agreement' && !receive;
    let sub = '';
    let alert = false;
    if (step.status === 'approved') sub = `${dotDate(step.actedAt)}${step.proxy ? ' 대리' : ''}`;
    else if (step.status === 'rejected') {
      sub = agreement ? '반대' : '반려';
      alert = true;
    } else if (step.status === 'skipped') sub = '-';
    return {
      key: `step-${step.order}`,
      position: step.assigneeId ? step.label : step.role === HR_STEP ? '인사 확인' : stepBoxLabel(step),
      name: step.actorName || step.assignee || (step.role === HR_STEP || receive ? '인사담당' : ''),
      sub,
      alert,
    };
  };
  return {
    approval: [
      { key: 'draft', position: doc.drafter.position || '기안', name: doc.drafter.name, sub: dotDate(doc.submittedAt) },
      ...doc.steps.filter((step) => step.kind !== 'agreement').map(stepSigner),
    ],
    agreement: doc.steps.filter((step) => step.kind === 'agreement').map(stepSigner),
  };
}

/** 기안 중인 결재란: 지정한 결재선 그대로 미리 보여 줍니다. */
export function signersFromDraft({ me, line, peopleById, hr = false }) {
  const toSigner = (item, index) => {
    const person = peopleById.get(String(item.employeeId));
    return {
      key: `line-${index}-${item.employeeId}`,
      position: person?.position || (item.kind === 'agreement' ? '합의' : '결재'),
      name: person?.name || '',
      sub: '',
    };
  };
  const indexed = line.map((item, index) => ({ item, index }));
  return {
    approval: [
      { key: 'draft', position: me?.position || '기안', name: me?.name || '', sub: '' },
      ...indexed.filter(({ item }) => item.kind !== 'agreement').map(({ item, index }) => toSigner(item, index)),
      ...(hr ? [{ key: 'hr', position: '인사 확인', name: '인사담당', sub: '' }] : []),
    ],
    agreement: indexed.filter(({ item }) => item.kind === 'agreement').map(({ item, index }) => toSigner(item, index)),
  };
}

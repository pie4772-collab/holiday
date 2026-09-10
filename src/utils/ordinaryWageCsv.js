function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** 단순 CSV 파서 (따옴표·BOM 지원) */
export function parseCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\r') {
      // ignore; handle on \n
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((value) => String(value || '').trim() !== ''));
}

function headerKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * 통상임금 업로드 CSV → API rows
 * 필수: 사번, 월통상임금(또는 통상임금)
 */
export function parseOrdinaryWageCsv(text) {
  const table = parseCsv(text);
  if (table.length < 2) {
    throw new Error('CSV에 데이터 행이 없습니다.');
  }

  const headers = table[0].map(headerKey);
  const empIdx = headers.findIndex((h) => ['사번', 'empno', 'emp_no', '사원번호'].includes(h));
  const wageIdx = headers.findIndex((h) =>
    ['월통상임금', '통상임금', 'ordinarywage', 'ordinary_wage'].includes(h)
  );

  if (empIdx < 0) throw new Error('CSV에 사번 열이 필요합니다.');
  if (wageIdx < 0) throw new Error('CSV에 월통상임금 열이 필요합니다.');

  return table.slice(1).map((cols) => ({
    empNo: cols[empIdx] ?? '',
    ordinaryWage: cols[wageIdx] ?? '',
  }));
}

export function downloadTextFile(filename, content, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export { csvCell };

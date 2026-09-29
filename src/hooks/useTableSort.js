import { useCallback, useMemo, useState } from 'react';

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

export function compareSortValues(a, b) {
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1;
  if (isEmpty(b)) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'ko', { numeric: true });
}

/** 빈 값은 정렬 방향과 관계없이 항상 뒤로 보냅니다. */
export function sortRows(rows, sort, getValue) {
  const list = Array.isArray(rows) ? [...rows] : [];
  if (!sort?.key) return list;
  const factor = sort.dir === 'asc' ? 1 : -1;
  return list.sort((x, y) => {
    const a = getValue(x, sort.key);
    const b = getValue(y, sort.key);
    if (isEmpty(a) || isEmpty(b)) return compareSortValues(a, b);
    return compareSortValues(a, b) * factor;
  });
}

export function useSortState(initialSort = { key: null, dir: 'asc' }) {
  const [sort, setSort] = useState(initialSort);
  const onSort = useCallback((key) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  }, []);
  return { sort, onSort };
}

/**
 * @param {Array} rows
 * @param {(row: any, key: string) => any} getValue 모듈 수준 함수로 전달 (렌더마다 바뀌지 않도록)
 */
export function useTableSort(rows, getValue, initialSort) {
  const { sort, onSort } = useSortState(initialSort);
  const sorted = useMemo(() => sortRows(rows, sort, getValue), [rows, sort, getValue]);
  return { sorted, sort, onSort };
}

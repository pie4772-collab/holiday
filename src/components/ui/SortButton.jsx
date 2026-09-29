import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

export function SortButton({ label, column, sort, onSort, className = '' }) {
  const active = sort?.key === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 text-inherit font-inherit whitespace-nowrap ${className}`}
    >
      {label}
      {active ? (
        sort.dir === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  );
}

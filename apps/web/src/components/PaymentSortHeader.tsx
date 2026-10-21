import type { PaymentTableSort, PaymentTableSortField } from '../lib/payment-table-view';

type Props = {
  field: PaymentTableSortField;
  label: string;
  sort: PaymentTableSort;
  onSort: (field: PaymentTableSortField) => void;
};

export function PaymentSortHeader({ field, label, sort, onSort }: Props) {
  const active = sort.field === field;
  return (
    <th
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      scope="col"
    >
      <button
        aria-label={`Ordenar por ${label}`}
        className="payments-table__sort"
        data-active={active || undefined}
        onClick={() => onSort(field)}
        type="button"
      >
        {label}
        <span aria-hidden="true">{active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

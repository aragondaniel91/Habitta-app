import type { DirectoryUnit } from './types';

export type UnitDirectorySort =
  'unit-asc' | 'unit-desc' | 'updated-desc' | 'updated-asc' | 'aliquot-desc' | 'aliquot-asc';

export const UNIT_DIRECTORY_PAGE_SIZES = [10, 25, 50] as const;
export type UnitDirectoryPageSize = (typeof UNIT_DIRECTORY_PAGE_SIZES)[number];

/** Compact page shortcuts; null is a decorative gap, not a selectable page. */
export function unitDirectoryPageLinks(page: number, totalPages: number): Array<number | null> {
  const last = Math.max(1, Math.trunc(totalPages));
  if (last <= 5) return Array.from({ length: last }, (_, index) => index + 1);
  const current = Number.isFinite(page) ? Math.min(last, Math.max(1, Math.trunc(page))) : 1;
  const pages = [...new Set([1, last, current - 1, current, current + 1])]
    .filter((item) => item >= 1 && item <= last)
    .sort((a, b) => a - b);
  const result: Array<number | null> = [];
  pages.forEach((item, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && item - previous > 1) {
      if (item - previous === 2) result.push(previous + 1);
      else result.push(null);
    }
    result.push(item);
  });
  return result;
}

const collator = new Intl.Collator('es-VE', { numeric: true, sensitivity: 'base' });

function aliquotValue(unit: DirectoryUnit): number | null {
  if (unit.ownershipPercentage == null || unit.ownershipPercentage === '') return null;
  const value = Number(unit.ownershipPercentage);
  return Number.isFinite(value) ? value : null;
}

function updatedTime(unit: DirectoryUnit): number | null {
  const value = Date.parse(unit.updatedAt);
  return Number.isFinite(value) ? value : null;
}

function compareNullableNumbers(a: number | null, b: number | null, direction: 1 | -1) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

/** Stable, tenant-local presentation ordering. Never mutate the API's directory. */
export function sortDirectoryUnits(units: readonly DirectoryUnit[], sort: UnitDirectorySort) {
  return [...units].sort((a, b) => {
    const reference = () =>
      collator.compare(a.building?.name ?? '', b.building?.name ?? '') ||
      collator.compare(a.code, b.code) ||
      collator.compare(a.id, b.id);

    if (sort === 'unit-asc') return reference();
    if (sort === 'unit-desc') return -reference();

    const comparison = sort.startsWith('updated')
      ? compareNullableNumbers(updatedTime(a), updatedTime(b), sort === 'updated-desc' ? -1 : 1)
      : compareNullableNumbers(aliquotValue(a), aliquotValue(b), sort === 'aliquot-desc' ? -1 : 1);
    return comparison || reference();
  });
}

export function paginateDirectoryUnits(
  units: readonly DirectoryUnit[],
  requestedPage: number,
  pageSize: UnitDirectoryPageSize,
) {
  const total = units.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isFinite(requestedPage)
    ? Math.min(totalPages, Math.max(1, Math.trunc(requestedPage)))
    : 1;
  const startIndex = (page - 1) * pageSize;
  return {
    rows: units.slice(startIndex, startIndex + pageSize),
    page,
    totalPages,
    first: total ? startIndex + 1 : 0,
    last: Math.min(total, startIndex + pageSize),
    total,
  };
}

import type { Person } from './types';

export const PEOPLE_DIRECTORY_PAGE_SIZES = [10, 25, 50] as const;
export type PeopleDirectoryPageSize = (typeof PEOPLE_DIRECTORY_PAGE_SIZES)[number];
export type PeopleDirectorySort = 'name-asc' | 'name-desc';

const personCollator = new Intl.Collator('es-VE', {
  numeric: true,
  sensitivity: 'base',
});

export function orderPeopleDirectory(
  people: readonly Person[],
  order: PeopleDirectorySort,
): Person[] {
  return [...people].sort((left, right) => {
    const first = personCollator.compare(
      `${left.first_name} ${left.last_name}`.trim(),
      `${right.first_name} ${right.last_name}`.trim(),
    );
    const result = first || personCollator.compare(left.id, right.id);
    return order === 'name-desc' ? -result : result;
  });
}

export function paginatePeopleDirectory(
  people: readonly Person[],
  requestedPage: number,
  size: PeopleDirectoryPageSize,
) {
  const total = people.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const page = Number.isFinite(requestedPage)
    ? Math.min(totalPages, Math.max(1, Math.trunc(requestedPage)))
    : 1;
  const start = (page - 1) * size;
  return {
    people: people.slice(start, start + size),
    page,
    total,
    totalPages,
    first: total ? start + 1 : 0,
    last: Math.min(total, start + size),
  };
}

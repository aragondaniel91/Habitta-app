export type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type PaginatedResponse<T> = PageInfo & { items: T[] };

export const pageInfo = <T>(response: PaginatedResponse<T>): PageInfo => ({
  page: response.page,
  pageSize: response.pageSize,
  total: response.total,
  totalPages: response.totalPages,
  hasNextPage: response.hasNextPage,
  hasPreviousPage: response.hasPreviousPage,
});

export const financialPagePath = (path: string, page: number, pageSize: number) => {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}page=${page}&pageSize=${pageSize}`;
};

export const mergePageItems = <T extends { id: string }>(current: T[], next: T[]) => {
  const byId = new Map(current.map((item) => [item.id, item]));
  next.forEach((item) => byId.set(item.id, item));
  return [...byId.values()];
};

export async function collectAllPages<T extends { id: string }>(
  fetchPage: (page: number) => Promise<PaginatedResponse<T>>,
  maxPages = 100,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchPage(page);
    items.push(...response.items);
    if (!response.hasNextPage) return mergePageItems([], items);
  }
  throw new Error('El listado financiero excede el límite seguro de páginas.');
}

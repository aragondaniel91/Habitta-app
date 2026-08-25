import { describe, expect, it, vi } from 'vitest';
import { collectAllPages, financialPagePath, mergePageItems } from './pagination';

describe('HAB-321 web pagination helpers', () => {
  it('builds explicit first and next-page paths', () => {
    expect(financialPagePath('/payments', 1, 50)).toBe('/payments?page=1&pageSize=50');
    expect(financialPagePath('/payments?status=open', 2, 50)).toBe(
      '/payments?status=open&page=2&pageSize=50',
    );
  });

  it('collects reference data across pages without duplicates', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: 'a' }, { id: 'b' }],
        page: 1,
        pageSize: 2,
        total: 3,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      })
      .mockResolvedValueOnce({
        items: [{ id: 'b' }, { id: 'c' }],
        page: 2,
        pageSize: 2,
        total: 3,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      });

    await expect(collectAllPages(fetchPage)).resolves.toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2);
  });

  it('merges load-more pages by stable row identity', () => {
    expect(
      mergePageItems(
        [
          { id: 'a', value: 1 },
          { id: 'b', value: 1 },
        ],
        [
          { id: 'b', value: 2 },
          { id: 'c', value: 1 },
        ],
      ),
    ).toEqual([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'c', value: 1 },
    ]);
  });

  it('fails explicitly instead of silently truncating reference data', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      items: [{ id: String(page) }],
      page,
      pageSize: 1,
      total: 3,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: page > 1,
    }));

    await expect(collectAllPages(fetchPage, 2)).rejects.toThrow(
      'El listado financiero excede el límite seguro de páginas.',
    );
  });
});

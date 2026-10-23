import { describe, expect, it } from 'vitest';
import { paginateDirectoryUnits, sortDirectoryUnits } from './unit-directory-view';
import type { DirectoryUnit } from './types';

function unit(
  id: string,
  code: string,
  updatedAt = '2026-10-10T12:00:00Z',
  ownershipPercentage: number | string | null = null,
  buildingName = 'Torre A',
): DirectoryUnit {
  return {
    id,
    condominiumId: 'condominium',
    buildingId: 'building',
    code,
    floor: null,
    type: 'apartment',
    status: 'active',
    ownershipPercentage,
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt,
    building: { id: 'building', name: buildingName },
    owners: [],
    occupancies: [],
  };
}

describe('Units directory presentation', () => {
  it('uses natural unit order and never mutates the directory received from API', () => {
    const units = [
      unit('c', 'A-10'),
      unit('a', 'A-2'),
      unit('b', 'A-1'),
      unit('d', 'A-3', '2026-10-10', null, 'Torre B'),
    ];
    expect(sortDirectoryUnits(units, 'unit-asc').map((row) => row.code)).toEqual([
      'A-1',
      'A-2',
      'A-10',
      'A-3',
    ]);
    expect(sortDirectoryUnits(units, 'unit-desc').map((row) => row.id)).toEqual([
      'd',
      'c',
      'a',
      'b',
    ]);
    expect(units.map((row) => row.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('orders updates and handles missing values without inventing dates', () => {
    const units = [
      unit('old', 'U3', '2025-01-01'),
      unit('invalid', 'U4', 'bad-date'),
      unit('new', 'U2', '2026-10-22'),
      unit('mid', 'U1', '2026-01-01'),
    ];
    expect(sortDirectoryUnits(units, 'updated-desc').map((row) => row.id)).toEqual([
      'new',
      'mid',
      'old',
      'invalid',
    ]);
    expect(sortDirectoryUnits(units, 'updated-asc').map((row) => row.id)).toEqual([
      'old',
      'mid',
      'new',
      'invalid',
    ]);
  });

  it('sorts aliquots numerically, leaving unspecified amounts last in either direction', () => {
    const units = [
      unit('missing', 'U5', '2026-01-01', null),
      unit('high', 'U2', '2026-01-01', '12.5'),
      unit('low', 'U3', '2026-01-01', 2.5),
      unit('zero', 'U1', '2026-01-01', 0),
      unit('invalid', 'U4', '2026-01-01', 'no-data'),
    ];
    expect(sortDirectoryUnits(units, 'aliquot-desc').map((row) => row.id)).toEqual([
      'high',
      'low',
      'zero',
      'invalid',
      'missing',
    ]);
    expect(sortDirectoryUnits(units, 'aliquot-asc').map((row) => row.id)).toEqual([
      'zero',
      'low',
      'high',
      'invalid',
      'missing',
    ]);
  });

  it('paginates across 48 records without losing rows or duplicating items', () => {
    const units = Array.from({ length: 48 }, (_, i) => unit(String(i), String(i + 1)));
    const pages = [1, 2, 3, 4, 5].map((page) => paginateDirectoryUnits(units, page, 10));
    expect(pages.map((part) => part.rows.length)).toEqual([10, 10, 10, 10, 8]);
    expect(pages.flatMap((part) => part.rows.map((row) => row.id))).toEqual(
      units.map((row) => row.id),
    );
    expect(pages[4]).toMatchObject({ page: 5, first: 41, last: 48, total: 48, totalPages: 5 });
    expect(paginateDirectoryUnits(units, 2, 25)).toMatchObject({
      page: 2,
      first: 26,
      last: 48,
      totalPages: 2,
    });
    expect(paginateDirectoryUnits(units, 1, 50)).toMatchObject({
      page: 1,
      first: 1,
      last: 48,
      totalPages: 1,
    });
  });

  it('clamps stale page selections when filtering shrinks the list', () => {
    const units = [unit('a', 'A1'), unit('b', 'B2')];
    expect(paginateDirectoryUnits(units, 17, 10)).toMatchObject({
      page: 1,
      first: 1,
      last: 2,
      totalPages: 1,
    });
    expect(paginateDirectoryUnits([], 5, 10)).toMatchObject({
      page: 1,
      first: 0,
      last: 0,
      total: 0,
      totalPages: 1,
    });
    expect(paginateDirectoryUnits(units, Number.NaN, 10).page).toBe(1);
  });
});

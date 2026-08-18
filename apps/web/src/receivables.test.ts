import { describe, expect, it } from 'vitest';
import {
  filterReceivables,
  getAgingSegments,
  getOverdueAmount,
  getReceivableCurrencies,
  getReceivableDueState,
  getReceivableStatusCounts,
  parseOpeningBalancesCsv,
} from './lib/receivables';
import type {
  ChargeConcept,
  ReceivableFilters,
  ReceivableItem,
  ReceivableUnit,
} from './lib/receivables';

const units: ReceivableUnit[] = [
  { id: 'unit-a', code: 'A-101', status: 'active' },
  { id: 'unit-b', code: 'B-202', status: 'active' },
];

const concepts: ChargeConcept[] = [
  { id: 'concept-regular', code: 'REG', name: 'Cuota regular', category: 'regular_dues' },
  { id: 'concept-water', code: 'WATER', name: 'Servicio de agua', category: 'service' },
];

const items: ReceivableItem[] = [
  {
    id: 'receivable-a',
    unit_id: 'unit-a',
    concept_id: 'concept-regular',
    description: 'Cuota de enero',
    currency_code: 'USD',
    outstanding_amount: '100.00',
    status: 'open',
    issue_date: '2026-01-01',
    due_date: '2026-01-10',
  },
  {
    id: 'receivable-b',
    unit_id: 'unit-b',
    concept_id: 'concept-water',
    description: 'Agua febrero',
    currency_code: 'VES',
    outstanding_amount: '500.00',
    status: 'partially_paid',
    issue_date: '2026-02-01',
    due_date: '2026-08-15',
  },
  {
    id: 'receivable-c',
    unit_id: 'unit-a',
    description: 'Ajuste histórico',
    currency_code: 'USD',
    outstanding_amount: '0.00',
    status: 'reversed',
    issue_date: '2025-12-01',
  },
];

const emptyFilters: ReceivableFilters = {
  query: '',
  unitId: '',
  conceptId: '',
  currencyCode: '',
  status: '',
  due: '',
};

describe('receivables helpers', () => {
  it('searches by description, unit and concept without accent sensitivity', () => {
    expect(filterReceivables(items, units, concepts, { ...emptyFilters, query: 'enero' })).toEqual([
      items[0],
    ]);
    expect(filterReceivables(items, units, concepts, { ...emptyFilters, query: 'b-202' })).toEqual([
      items[1],
    ]);
    expect(
      filterReceivables(items, units, concepts, { ...emptyFilters, query: 'servicio agua' }),
    ).toEqual([items[1]]);
  });

  it('keeps currencies and status counts isolated', () => {
    expect(
      getReceivableCurrencies(
        [
          {
            currency_code: 'USD',
            net_outstanding: '100',
            total_debits: '100',
            total_credits: '0',
          },
          {
            currency_code: 'VES',
            net_outstanding: '500',
            total_debits: '600',
            total_credits: '100',
          },
        ],
        [],
        items,
      ),
    ).toEqual(['USD', 'VES']);
    expect(getReceivableStatusCounts(items, 'USD')).toEqual({
      open: 1,
      partiallyPaid: 0,
      settled: 0,
      reversed: 1,
    });
  });

  it('distinguishes overdue, upcoming and settled receivables', () => {
    expect(getReceivableDueState(items[0]!, '2026-07-29')).toBe('overdue');
    expect(getReceivableDueState(items[1]!, '2026-07-29')).toBe('upcoming');
    expect(getReceivableDueState(items[2]!, '2026-07-29')).toBe('settled');
  });

  it('builds aging percentages without combining buckets', () => {
    const aging = {
      currency_code: 'USD',
      current_amount: '50',
      days_1_30: '20',
      days_31_60: '15',
      days_61_90: '10',
      over_90: '5',
    };
    expect(getAgingSegments(aging).map((segment) => segment.percentage)).toEqual([
      50, 20, 15, 10, 5,
    ]);
    expect(getOverdueAmount(aging)).toBe(50);
  });

  it('parses the supported opening-balances CSV contract', () => {
    expect(
      parseOpeningBalancesCsv(
        'unit_code,balance_type,amount,currency_code,effective_date,description\nA-101,debit,25.00,USD,2026-01-01,Saldo anterior',
      ),
    ).toEqual([
      {
        unit_code: 'A-101',
        balance_type: 'debit',
        amount: '25.00',
        currency_code: 'USD',
        effective_date: '2026-01-01',
        description: 'Saldo anterior',
      },
    ]);
  });
  it('preserves building context in topology-safe CSVs', () =>
    expect(
      parseOpeningBalancesCsv(
        'building_name,unit_code,balance_type,amount,currency_code,effective_date,description\nTorre II,1-A,debit,25.00,USD,2026-01-01,Saldo anterior',
      )[0],
    ).toMatchObject({ building_name: 'Torre II', unit_code: '1-A' }));
});

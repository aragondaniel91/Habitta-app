import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  currencyRows,
  financialUnitOptions,
  payableUnitOptions,
  residentUnitLabel,
  residentUnitLabels,
  rowsForSelection,
  unitBalanceStanding,
} from './lib/resident-units';
import type { ResidentFinancialUnit } from './lib/resident-units';

// HAB-427: an owner of several units in one condominium.
//
// The rules are tested as functions, because that is what they are: which units exist, which of
// them may receive a payment, and what a balance means. The parts that can only be expressed as
// structure -- that the drawer is handed the payable units and not the visible ones, that a unit
// change resets pagination -- are asserted against the source, and the browser behaviour itself is
// covered by the authenticated financial E2E.

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const dashboard = read('./pages/ResidentDashboard.tsx');
const paymentsPage = read('./pages/ResidentPaymentsPage.tsx');
const paymentsView = read('./pages/ResidentPaymentsView.tsx');
const drawer = read('./features/payments/components/PaymentCaptureDrawer.tsx');

const row = (overrides: Partial<ResidentFinancialUnit>): ResidentFinancialUnit => ({
  unit_id: 'unit-a',
  can_submit_payment: true,
  currency_code: 'USD',
  total_debits: '100.00',
  total_credits: '0.00',
  net_outstanding: '100.00',
  overdue_amount: '0.00',
  upcoming_amount: '100.00',
  ...overrides,
});

describe('HAB-427 naming a resident’s units', () => {
  const units = [
    { id: 'unit-a', code: '101', building_id: 'torre-a' },
    { id: 'unit-b', code: '101', building_id: 'torre-b' },
    { id: 'unit-c', code: 'PH', building_id: null },
  ];
  const buildings = [
    { id: 'torre-a', name: 'Torre A' },
    { id: 'torre-b', name: 'Torre B' },
  ];

  it('tells two units apart when only the building differs', () => {
    // The dashboard read `building_name`, which /units has never returned, so both of these
    // rendered as a bare "101" and an owner of both could not tell which was which.
    const labels = residentUnitLabels(units, buildings);
    expect(labels.get('unit-a')).toBe('Torre A · 101');
    expect(labels.get('unit-b')).toBe('Torre B · 101');
  });

  it('falls back to the code when there is no building, and never to the identifier', () => {
    const labels = residentUnitLabels(units, buildings);
    expect(labels.get('unit-c')).toBe('PH');
    expect(residentUnitLabel(labels, 'unit-unknown')).toBe('Unidad sin identificar');
    expect(residentUnitLabel(labels, 'unit-unknown')).not.toContain('unit-unknown');
  });
});

describe('HAB-427 which units the resident sees and which they may pay for', () => {
  const rows = [
    row({ unit_id: 'unit-a', currency_code: 'USD' }),
    row({ unit_id: 'unit-a', currency_code: 'VES' }),
    row({ unit_id: 'unit-b', can_submit_payment: false }),
    row({ unit_id: 'unit-c', currency_code: null, can_submit_payment: true }),
  ];
  const labels = new Map([
    ['unit-a', 'Torre A · 101'],
    ['unit-b', 'Torre B · 202'],
    ['unit-c', 'PH'],
  ]);

  it('lists a unit once however many currencies it is charged in', () => {
    expect(financialUnitOptions(rows, labels).map((unit) => unit.id)).toEqual([
      'unit-c',
      'unit-a',
      'unit-b',
    ]);
  });

  it('offers as payment destinations only the units the database accepts', () => {
    // The difference is the whole point: unit-b is visible and not payable. Treating "visible" as
    // "payable" produces a form that can only end in a refusal.
    expect(payableUnitOptions(rows, labels).map((unit) => unit.id)).toEqual(['unit-c', 'unit-a']);
    expect(payableUnitOptions(rows, labels).map((unit) => unit.id)).not.toContain('unit-b');
  });

  it('keeps a unit with no movement discoverable', () => {
    expect(financialUnitOptions(rows, labels).map((unit) => unit.id)).toContain('unit-c');
    expect(currencyRows(rowsForSelection(rows, 'unit-c'))).toEqual([]);
  });

  it('narrows to one unit and back to all of them', () => {
    expect(rowsForSelection(rows, 'unit-a')).toHaveLength(2);
    expect(rowsForSelection(rows, '')).toHaveLength(4);
  });

  it('keeps currencies apart rather than adding them together', () => {
    const selected = currencyRows(rowsForSelection(rows, 'unit-a'));
    expect(selected.map((entry) => entry.currency_code)).toEqual(['USD', 'VES']);
  });
});

describe('HAB-427 what a balance means', () => {
  it('reads a positive net as money owed', () => {
    expect(unitBalanceStanding('120.00')).toEqual({ tone: 'warning', label: 'Pendiente' });
  });

  it('reads zero as settled', () => {
    expect(unitBalanceStanding('0.00')).toEqual({ tone: 'success', label: 'Al día' });
  });

  it('reads a negative net as a credit, never as settled', () => {
    // An overpayment is money the condominium owes back. Calling it "al día" writes it off.
    expect(unitBalanceStanding('-30.00')).toEqual({ tone: 'info', label: 'Saldo a favor' });
  });
});

describe('HAB-427 the resident dashboard', () => {
  it('asks the per-unit RPC, and only behind the financial capability', () => {
    expect(dashboard).toContain('financial(() =>');
    expect(dashboard).toContain('/resident-financial-units`');
    expect(dashboard).not.toContain('financial(apiRequest<');
  });

  it('keeps the consolidated view on the summary function', () => {
    // HAB-427 adds a per-unit answer; it does not replace the condominium-wide one.
    expect(dashboard).toContain('/receivables/summary`');
    expect(dashboard).toContain('sortReceivableSummaries(data?.summaries ?? [])');
  });

  it('offers the selector only to an owner of several units', () => {
    expect(dashboard).toContain('financialUnits.length > 1');
    expect(dashboard).toContain('<option value="">Todas mis unidades</option>');
    expect(dashboard).toContain('propertyCards.length > 1');
  });

  it('still declares every hook before the early returns', () => {
    // Same contract as HAB-412: a hook below `if (loading && !data) return` crashes the dashboard
    // for every resident the moment the data arrives, and no DOM-less test can see it.
    const firstEarlyReturn = dashboard.indexOf('if (loading && !data) return');
    expect(firstEarlyReturn).toBeGreaterThan(0);
    const afterReturns = dashboard.slice(firstEarlyReturn);
    for (const hook of ['useMemo(', 'useState(', 'useEffect(', 'useCallback(']) {
      expect(afterReturns).not.toContain(hook);
    }
  });
});

describe('HAB-427 the resident payments page', () => {
  it('filters on the server and resets the cursor when the unit changes', () => {
    // Page 2 of one unit is not page 2 of another. Keeping the cursor would append another unit's
    // rows to the history, and the totals would describe a list nobody is looking at.
    expect(paymentsPage).toContain('`&unitId=${selectedUnitId}`');
    expect(paymentsPage).toContain('const selectUnit = useCallback');
    expect(paymentsPage).toContain('payments: [], receivables: []');
    expect(paymentsPage).toContain('[condominiumId, selectedUnitId, session]');
  });

  it('hands the capture drawer the payable units, never the visible ones', () => {
    // Scoped to the capture drawer's own props. The receipt host below it still receives the full
    // unit list, which is correct -- it names units on a receipt rather than offering destinations.
    const capture = paymentsPage.slice(paymentsPage.indexOf('<PaymentCaptureDrawer'));
    const captureProps = capture.slice(0, capture.indexOf('/>'));
    expect(captureProps).toContain('units={payableUnits}');
    expect(captureProps).not.toContain('units={data.units}');
    expect(paymentsPage).toContain('payableUnitOptions(data?.financialUnits ?? [], unitLabels)');
  });

  it('will not open the create flow with nothing to pay for', () => {
    expect(paymentsPage).toContain("drawer?.type === 'create' && payableUnits.length > 0");
    expect(paymentsPage).toContain('canRegisterPayment={payableUnits.length > 0}');
  });

  it('takes the balance from the ledger rather than from the receivables on screen', () => {
    expect(paymentsView).toContain('financialRows');
    expect(paymentsView).not.toContain('Number(receivable.outstanding_amount ?? 0)');
  });

  it('names the unit in the history when several are in view', () => {
    expect(paymentsView).toContain('residentUnitLabel(unitLabels, payment.unit_id)');
    expect(paymentsView).toContain('!selectedUnitId && unitOptions.length > 1');
  });
});

describe('HAB-427 the payment capture drawer', () => {
  it('receives units already named, so it can never render an identifier', () => {
    expect(drawer).toContain('export type PaymentUnitOption = { id: string; label: string }');
    expect(drawer).toContain('units: PaymentUnitOption[];');
    expect(drawer).not.toContain('buildingNameById');
  });

  it('does not make a choice out of a single destination, but still sends it', () => {
    // A hidden input rather than a server-side guess: the unit the resident was shown is the unit
    // the payload carries.
    expect(drawer).toContain('const onlyUnit = units.length === 1 ? units[0] : undefined;');
    expect(drawer).toContain('<input name="unitId" type="hidden" value={onlyUnit.id} />');
  });

  it('forces an explicit choice when there are several, with nothing preselected', () => {
    expect(drawer).toContain('{!payment && units.length > 1 ? (');
    expect(drawer).toContain('<Select defaultValue="" name="unitId" required>');
    expect(drawer).toContain('<option value="">Seleccionar unidad</option>');
  });

  it('refuses to submit when there is no destination at all', () => {
    expect(drawer).toContain('(!editing && units.length === 0)');
  });

  it('never lets an edit move a payment to another unit', () => {
    // Every branch that renders the unit control is guarded by `!payment`.
    for (const branch of [
      '{!payment && units.length === 0 ? (',
      '{!payment && onlyUnit ? (',
      '{!payment && units.length > 1 ? (',
    ]) {
      expect(drawer).toContain(branch);
    }
    expect(drawer).not.toMatch(/\{payment && [^}]*name="unitId"/);
  });
});

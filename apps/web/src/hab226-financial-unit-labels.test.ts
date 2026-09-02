import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const paymentCaptureSource = source('./features/payments/components/PaymentCaptureDrawer.tsx');
const adminPaymentsSource = source('./pages/AdminPaymentsPage.tsx');
const residentUnitsSource = source('./lib/resident-units.ts');
const receivablesPageSource = source('./pages/ReceivablesPage.tsx');
const receivablesDrawersSource = source('./pages/ReceivablesDrawersImpl.tsx');
const statementSource = source('./features/receivables/AccountStatementDrawer.tsx');
const transferSource = source('./features/receivables/OwnershipTransferPanel.tsx');
const recurringDuesSource = source('./features/receivables/RecurringDuesWorkspace.tsx');

describe('HAB-226 topology-safe financial unit labels', () => {
  it('keeps payment selection UUID-backed while displaying building-qualified labels', () => {
    // HAB-427 moved the label into the caller: the drawer is handed the units it may offer, already
    // named, so it cannot widen that set or resolve a building itself. The rule is unchanged and is
    // asserted in both places -- the drawer renders a label against a uuid value, and the callers
    // build that label with the same shared helper every other financial surface uses.
    expect(paymentCaptureSource).toContain(
      'export type PaymentUnitOption = { id: string; label: string }',
    );
    expect(paymentCaptureSource).toContain('<Select defaultValue="" name="unitId" required>');
    expect(paymentCaptureSource).toContain('<option key={unit.id} value={unit.id}>');
    expect(paymentCaptureSource).toContain('{unit.label}');
    expect(adminPaymentsSource).toContain(
      "import { unitReferenceLabel } from '../lib/unit-domain'",
    );
    expect(adminPaymentsSource).toContain('unitReferenceLabel({');
    expect(residentUnitsSource).toContain("import { unitReferenceLabel } from './unit-domain'");
    expect(residentUnitsSource).toContain('unitReferenceLabel({');
    // The identity rules, stated as rules. The previous line matched the exact formatting of the
    // request body, so prettier moving a brace read as a financial regression. What must hold is
    // that creation carries an idempotency key and editing does not mint a new identity.
    expect(paymentCaptureSource).toMatch(
      /\(payment \? \{\} : \{ idempotencyKey: idempotencyKey\.current \}\)/,
    );
    expect(paymentCaptureSource).toContain('const idempotencyKey = useRef(crypto.randomUUID())');
    // The label is presentation. Identity is always the unit's UUID -- including on the
    // single-unit path, where the id travels as a hidden value rather than as a name.
    expect(paymentCaptureSource).not.toMatch(/unitId:\s*unitReferenceLabel/);
    expect(paymentCaptureSource).not.toContain('value={unitReferenceLabel');
    expect(paymentCaptureSource).not.toContain('value={unit.label}');
    expect(paymentCaptureSource).not.toContain('unitLabel:');
    expect(paymentCaptureSource).toContain(
      '<input name="unitId" type="hidden" value={onlyUnit.id} />',
    );
  });

  it('uses qualified labels for receivables filters and detail while keeping manual charges UUID-backed', () => {
    expect(receivablesPageSource).toContain(
      "import { unitReferenceLabel } from '../lib/unit-domain'",
    );
    expect(receivablesPageSource).toContain('<option key={unit.id} value={unit.id}>');
    expect(receivablesPageSource).toContain('<strong>{unitLabel(item.unit_id)}</strong>');
    expect(receivablesPageSource).not.toContain('getUnitCode');
    expect(receivablesDrawersSource).toContain(
      "import { unitReferenceLabel } from '../lib/unit-domain'",
    );
    expect(receivablesDrawersSource).toContain("unitId: String(values.get('unitId') ?? '')");
    expect(receivablesDrawersSource).toContain(
      'rows: activeUnits.map((unit) => ({ unitId: unit.id }))',
    );
    expect(receivablesDrawersSource).not.toContain('getUnitCode');
  });

  it('keeps statements, solvency and ownership transfer addressed by UUID', () => {
    expect(statementSource).toContain("import { unitReferenceLabel } from '../../lib/unit-domain'");
    expect(statementSource).toContain('const selectedUnitLabel = selectedUnit');
    expect(statementSource).toContain('<option key={unit.id} value={unit.id}>');
    expect(statementSource).toContain('selectedUnitLabel ?? statement.account.unit_code');
    expect(statementSource).toContain('/units/${nextUnitId}/account-statement');
    expect(statementSource).toContain('/units/${unitId}/solvency-certificates');
    expect(statementSource).toContain(
      "csvFileName('estado-de-cuenta', statement.account.unit_code)",
    );
    expect(statementSource).toContain('unitId={selectedUnit.id}');
    expect(statementSource).toContain('unitLabel={selectedUnitLabel ?? selectedUnit.code}');
    expect(transferSource).toContain('unitLabel: string;');
    expect(transferSource).toContain('unitId: string;');
    expect(transferSource).toContain('Propiedad de {unitLabel}');
    expect(transferSource).toContain('/units/${unitId}/ownership-transfers');
  });

  it('only derives recurring dues labels from UUID-indexed current units and leaves snapshots immutable', () => {
    expect(recurringDuesSource).toContain(
      "import { unitReferenceLabel } from '../../lib/unit-domain'",
    );
    expect(recurringDuesSource).toContain(
      'const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit]))',
    );
    expect(recurringDuesSource).toContain('checked={scopeForm.unitIds.includes(unit.id)}');
    expect(recurringDuesSource).toContain('? [...current.unitIds, unit.id]');
    expect(recurringDuesSource).toContain('unitIds: scopeForm.unitIds');
    expect(recurringDuesSource).toContain('(run.distribution_snapshot ?? []).map((row) => {');
    expect(recurringDuesSource).toContain('const currentUnit = unitById.get(row.unit_id);');
    expect(recurringDuesSource).toContain('row.unit_code || row.unit_id');
    expect(recurringDuesSource).not.toContain('run.distribution_snapshot =');
    expect(recurringDuesSource).not.toContain('row.unit_code =');
    expect(recurringDuesSource).not.toContain('row.unit_id =');
  });
});

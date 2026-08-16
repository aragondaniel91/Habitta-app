import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const statementSource = readFileSync(
  new URL('./features/receivables/AccountStatementDrawer.tsx', import.meta.url),
  'utf8',
);
const transferSource = readFileSync(
  new URL('./features/receivables/OwnershipTransferPanel.tsx', import.meta.url),
  'utf8',
);
const policySource = readFileSync(
  new URL('./features/receivables/FinancialIntegrityPanel.tsx', import.meta.url),
  'utf8',
);
const wrapperSource = readFileSync(
  new URL('./pages/ReceivablesDrawers.tsx', import.meta.url),
  'utf8',
);

describe('HAB-186 unit financial account UI contract', () => {
  it('replaces the legacy statement drawer with the authoritative unit account', () => {
    expect(wrapperSource).toContain('AccountStatementDrawer');
    expect(statementSource).toContain('/account-statement');
    expect(statementSource).toContain('/solvency?asOf=');
    expect(statementSource).toContain('/solvency-certificates');
    expect(statementSource).toContain('Cuenta de la unidad');
  });

  it('never presents a mixed-currency total in the statement UI', () => {
    expect(statementSource).toContain('Cada moneda se mantiene separada.');
    expect(statementSource).toContain('closing_balances');
    expect(statementSource).not.toContain('totalBalance');
    expect(statementSource).not.toContain('Saldo total convertido');
  });

  it('makes property transfer an explicit effective-dated workflow', () => {
    expect(statementSource).toContain('<OwnershipTransferPanel');
    expect(transferSource).toContain('/ownership-transfers');
    expect(transferSource).toContain(
      'Las alícuotas de los nuevos propietarios deben sumar exactamente 100%.',
    );
    expect(transferSource).toContain('Confirmar transferencia');
    expect(transferSource).toMatch(/Cargos, pagos, saldos y movimientos no cambian\s+de unidad\./);
  });

  it('keeps Venezuela currency policy provider-neutral and approval based', () => {
    expect(statementSource).toContain('<FinancialIntegrityPanel');
    expect(policySource).toContain("'approved_rates_only'");
    expect(policySource).toContain("useState('BCV')");
    expect(policySource).toContain('el backend es neutral');
    expect(policySource).toContain('/exchange-rates');
    expect(policySource).not.toContain("fetch('https://");
    expect(policySource).not.toContain('/rest/v1/');
  });

  it('exposes solvency issuance only after an eligible evaluation', () => {
    expect(statementSource).toContain(
      "solvency?.eligible ? 'Unidad solvente' : 'Unidad no solvente'",
    );
    expect(statementSource).toContain('manage && solvency?.eligible');
    expect(statementSource).toContain('Emitir solvencia');
    expect(statementSource).toContain('verification_id');
  });
});

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
const administrationSource = readFileSync(
  new URL('./features/receivables/FinancialAdministrationDrawer.tsx', import.meta.url),
  'utf8',
);
const wrapperSource = readFileSync(
  new URL('./pages/ReceivablesDrawers.tsx', import.meta.url),
  'utf8',
);
const statementStyles = readFileSync(new URL('./account-statement.css', import.meta.url), 'utf8');
const receivablesDrawerStyles = readFileSync(
  new URL('./receivables-drawers.css', import.meta.url),
  'utf8',
);

describe('HAB-186 unit financial account UI contract', () => {
  it('opens the account statement directly from the receivables entry point', () => {
    expect(wrapperSource).toContain('AccountStatementDrawer');
    expect(statementSource).toContain('Estado de cuenta y solvencia');
    expect(administrationSource).toContain('Operaciones administrativas');
    expect(administrationSource).toContain('Estado de cuenta.');
    expect(administrationSource).not.toContain('Disponible en Estado de cuenta');
    expect(administrationSource).toContain('Política de moneda y solvencia');
    expect(administrationSource).toContain('Configurar política financiera');
    expect(administrationSource).toContain('Sin FX automático');
  });

  it('keeps financial administration separate from the reading flow', () => {
    expect(wrapperSource).toContain("mode === 'administration'");
    expect(statementSource).not.toContain('<OwnershipTransferPanel');
    expect(statementSource).not.toContain('<FinancialIntegrityPanel');
    expect(administrationSource).toContain('<OwnershipTransferPanel');
    expect(statementSource).toContain('/account-statement');
    expect(statementSource).toContain('/solvency?asOf=');
    expect(statementSource).toContain('/solvency-certificates');
    expect(statementSource).toContain('Cuenta de la unidad');
  });

  it('owns its styles on direct entry and keeps the wide layout responsive', () => {
    expect(statementSource).toContain("import '../../account-statement.css';");
    expect(statementSource).toContain("import '../../hab186-financial-integrity.css';");
    expect(receivablesDrawerStyles).toMatch(
      /\.receivables-drawer\[data-wide\]\s*\{\s*width:\s*min\(800px, 100vw\);/,
    );
    expect(statementStyles).toContain('.account-statement-financial-overview');
  });

  it('never presents a mixed-currency total in the statement UI', () => {
    expect(statementSource).toContain('Cada moneda se mantiene separada.');
    expect(statementSource).toContain('closing_balances');
    expect(statementSource).not.toContain('totalBalance');
    expect(statementSource).not.toContain('Saldo total convertido');
  });

  it('makes property transfer an explicit effective-dated workflow', () => {
    expect(administrationSource).toMatch(/Transferencia de propiedad/);
    expect(transferSource).toContain('/ownership-transfers');
    expect(transferSource).toContain(
      'Las alícuotas de los nuevos propietarios deben sumar exactamente 100%.',
    );
    expect(transferSource).toContain('Confirmar transferencia');
    expect(transferSource).toMatch(/Cargos, pagos, saldos y movimientos no cambian\s+de unidad\./);
  });

  it('keeps Venezuela currency policy provider-neutral and approval based', () => {
    expect(administrationSource).toContain('<FinancialIntegrityPanel');
    expect(policySource).toContain("'approved_rates_only'");
    expect(policySource).toContain("useState('BCV')");
    expect(policySource).toContain('el backend es neutral');
    expect(policySource).toContain('/exchange-rates');
    expect(policySource).not.toContain("fetch('https://");
    expect(policySource).not.toContain('/rest/v1/');
  });

  it('does not expose condominium policy mutation UI to non-managing roles', () => {
    expect(administrationSource).toContain('const manage = canManage(roles)');
    expect(administrationSource).toContain('{manage ? (');
    expect(administrationSource).toContain('Configuración protegida');
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

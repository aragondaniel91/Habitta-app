import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8');
const navigationSource = readFileSync(
  fileURLToPath(new URL('./navigation.ts', import.meta.url)),
  'utf8',
);
const wrapperSource = readFileSync(
  fileURLToPath(new URL('./pages/MaintenancePage.tsx', import.meta.url)),
  'utf8',
);
const operationsSource = readFileSync(
  fileURLToPath(new URL('./pages/MaintenancePageBase.tsx', import.meta.url)),
  'utf8',
);
const financialSource = readFileSync(
  fileURLToPath(new URL('./features/maintenance/MaintenanceFinancialWorkspace.tsx', import.meta.url)),
  'utf8',
);
const documentApiSource = readFileSync(
  fileURLToPath(new URL('./features/documents/api.ts', import.meta.url)),
  'utf8',
);
const uploaderSource = readFileSync(
  fileURLToPath(new URL('./features/documents/PrivateDocumentUploader.tsx', import.meta.url)),
  'utf8',
);
const mainSource = readFileSync(fileURLToPath(new URL('./main.tsx', import.meta.url)), 'utf8');

describe('maintenance administrator workspace integration', () => {
  it('keeps the existing operational workspace intact behind the maintenance switcher', () => {
    expect(navigationSource).toContain("title: 'Activos y mantenimiento'");
    expect(appSource).toContain("activeRoute.key === 'maintenance'");
    expect(wrapperSource).toContain('MaintenanceOperationsPage');
    expect(wrapperSource).toContain('MaintenanceFinancialWorkspace');
    expect(operationsSource).toContain('<PageHeader');
    expect(operationsSource).not.toContain('className="page-header"');
  });

  it('preserves the four operational views and real maintenance API actions', () => {
    expect(operationsSource).toContain("type Tab = 'overview' | 'assets' | 'plans' | 'work-orders'");
    expect(operationsSource).toContain('/maintenance/assets');
    expect(operationsSource).toContain('/maintenance/plans');
    expect(operationsSource).toContain('/maintenance/work-orders');
    expect(operationsSource).toContain('/maintenance/generate-due');
  });

  it('adds quotes, decisions, private evidence and expense links without mutating expense amounts', () => {
    expect(financialSource).toContain('/quotes`');
    expect(financialSource).toContain('/decision`');
    expect(financialSource).toContain('/attachments`');
    expect(financialSource).toContain('/expenses`');
    expect(financialSource).toContain('JSON.stringify({ expenseId, quoteId: expenseQuoteId || undefined })');
    expect(financialSource).not.toContain('target_amount');
    expect(financialSource).not.toContain('treasuryAccountId');
  });

  it('forwards quote context through the shared private uploader', () => {
    expect(uploaderSource).toContain('quoteId?: string');
    expect(uploaderSource).toContain('metadata.quoteId = quoteId');
    expect(documentApiSource).toContain("headers.set('X-Quote-Id', metadata.quoteId)");
  });

  it('loads dedicated responsive styles inside the maintenance chunk', () => {
    expect(operationsSource).toContain("import '../maintenance.css'");
    expect(wrapperSource).toContain("import '../features/maintenance/maintenance-financial.css'");
    expect(mainSource).not.toContain("import './maintenance.css'");
  });
});

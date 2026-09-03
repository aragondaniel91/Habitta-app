import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const app = source('./App.tsx');
const roles = source('./lib/roles.ts');
const dashboard = source('./pages/ResidentDashboard.tsx');
const payments = source('./pages/ResidentPaymentsView.tsx');
const community = source('./pages/ResidentCommunityPage.tsx');
const documents = source('./pages/ResidentDocumentsPage.tsx');
const requests = source('./pages/ResidentRequestsPage.tsx');
const dashboardCss = source('./resident-dashboard.css');
const paymentsCss = source('./resident-payments.css');
const communityCss = source('./resident-community.css');
const requestsCss = source('./resident-requests.css');

describe('HAB-431 resident experience final production contract', () => {
  it('remounts the active module whenever condominium context changes', () => {
    expect(app).toContain('<Suspense key={selectedCondominiumId} fallback={<ModuleLoading />}>');
    expect(app).toContain('selectedCondominiumId={selectedCondominiumId}');
  });

  it('keeps pure resident experiences separate from administrative workspaces', () => {
    expect(app).toContain('<ResidentDashboard');
    expect(app).toContain('<ResidentRequestsPage');
    expect(app).toContain('<ResidentCommunityPage');
    expect(app).toContain('<ResidentDocumentsPage');
    expect(app).toContain('<PaymentsPage');
    expect(dashboard).toContain('canAccessResidentPayments(roles)');
    expect(dashboard).toContain('canAccessResidentOperations(roles)');
    expect(requests).toContain('canWriteResidentRequests(roles)');
    expect(roles).toContain(
      "const restricted: CondominiumRole[] = ['tenant', 'family_member', 'authorized_occupant']",
    );
    expect(roles).toContain("return roles.includes('owner');");
  });

  it('keeps resident financial presentation currency-separated and ledger-authoritative', () => {
    expect(dashboard).toContain('currencyRows(selectedRows)');
    expect(dashboard).toContain('Cada moneda por separado');
    expect(payments).toContain('financialRows');
    expect(payments).toContain('row.net_outstanding');
    expect(payments).toContain('row.currency_code === currency');
    expect(payments).not.toContain('reduce((total, receivable)');
  });

  it('keeps resident surfaces compact and touch-safe on small screens', () => {
    expect(dashboardCss).toContain('@media (max-width: 520px)');
    expect(dashboardCss).toContain('min-height: var(--hq-touch-target)');
    expect(paymentsCss).toContain('@media (max-width: 600px)');
    expect(paymentsCss).toContain('min-height: var(--hq-touch-target)');
    expect(communityCss).toContain('@media (max-width: 520px)');
    expect(communityCss).toContain('min-height: var(--hq-touch-target)');
    expect(requestsCss).toContain('@media (max-width: 520px)');
    expect(requestsCss).toContain('min-height: var(--hq-touch-target)');
    expect(dashboardCss).toContain('.resident-dashboard .empty-state');
    expect(paymentsCss).toContain('.resident-payments__history-panel .empty-state');
    expect(communityCss).toContain('.resident-documents__empty .empty-state');
    expect(requestsCss).toContain('.resident-requests__empty .empty-state');
  });

  it('keeps resident copy on readable labels instead of raw identifiers', () => {
    expect(dashboard).toContain('residentUnitLabel');
    expect(payments).toContain('residentUnitLabel');
    expect(documents).toContain('document.title');
    expect(requests).toContain('request.request_number');
    expect(community).toContain('destination.title');
  });
});

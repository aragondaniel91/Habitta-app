import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const paymentsRouter = source('./pages/PaymentsPage.tsx');
const adminPayments = source('./pages/AdminPaymentsPage.tsx');
const residentPaymentsPage = source('./pages/ResidentPaymentsPage.tsx');
const residentPaymentsView = source('./pages/ResidentPaymentsView.tsx');
const captureDrawer = source('./features/payments/components/PaymentCaptureDrawer.tsx');
const roles = source('./lib/roles.ts');

describe('HAB-417 resident payments stay simple without weakening financial boundaries', () => {
  it('routes resident-only sessions away from the administrative treasury workspace', () => {
    expect(paymentsRouter).toContain('usesResidentDashboard(roles)');
    expect(paymentsRouter).toContain('<ResidentPaymentsPage {...props} />');
    expect(paymentsRouter).toContain('<AdminPaymentsPage {...props} />');

    expect(adminPayments).toContain('eyebrow="Tesorería y validación"');
    expect(adminPayments).toContain('Bandeja de revisión');
    expect(residentPaymentsView).toContain('eyebrow="Mi hogar"');
    expect(residentPaymentsView).toContain('title="Mis pagos"');
    expect(residentPaymentsView).not.toContain('Bandeja de revisión');
    expect(residentPaymentsView).not.toContain('Vista de tesorería');
  });

  it('does not ask a resident browser for the administrative review queue', () => {
    expect(residentPaymentsPage).not.toContain('/payments/review-queue');
    expect(residentPaymentsPage).not.toContain('/treasury/');
    expect(residentPaymentsView).not.toContain('Configurar');
  });

  it('uses the reviewed payment submit transition instead of treating a draft as finished', () => {
    expect(residentPaymentsPage).toContain('submitOnComplete');
    expect(captureDrawer).toContain(
      '`/v1/condominiums/${condominiumId}/payments/${savedPayment.id}/submit`',
    );
    expect(captureDrawer).toContain("{ method: 'POST' }");
    expect(captureDrawer).toContain("await onComplete('Pago enviado a validación.')");
    expect(captureDrawer).toContain('Enviar a validación');
  });

  it('keeps draft and correction states actionable but never exposes reviewer actions', () => {
    expect(residentPaymentsView).toContain(
      "if (status === 'correction_requested') return 'Corregir pago';",
    );
    expect(residentPaymentsView).toContain("if (status === 'draft') return 'Continuar';");
    expect(residentPaymentsView).toContain("return 'Ver recibo';");
    expect(residentPaymentsView).not.toContain('Iniciar revisión');
    expect(residentPaymentsView).not.toContain('Aprobar');
    expect(residentPaymentsView).not.toContain('Reversar pago aprobado');
  });

  it('keeps tenant-only presentation aligned with the database restriction', () => {
    // The route gate now asks its own question. `isTenantOnly` was the right test while tenants
    // were the only restricted residents; family members and authorized occupants are refused the
    // same way by the database and are not tenants, so a negation of "tenant-only" would have let
    // them through.
    expect(roles).toContain(
      "if (route.key === 'payments' && !canAccessResidentPayments(roles)) return false;",
    );
    expect(roles).toContain(
      "const restricted: CondominiumRole[] = ['tenant', 'family_member', 'authorized_occupant'];",
    );
    // All four residential roles use the resident experience.
    for (const role of ['owner', 'tenant', 'family_member', 'authorized_occupant']) {
      expect(roles).toContain(`'${role}',`);
    }
  });

  it('keeps the resident honest about balances and payment validation', () => {
    expect(residentPaymentsView).toContain('Saldo pendiente');
    expect(residentPaymentsView).toContain(
      'Este saldo solo cambia cuando la administración aprueba y aplica el pago.',
    );
    expect(residentPaymentsView).toContain('Reporta tu pago con claridad');
    expect(residentPaymentsView).toContain('La administración está revisando este pago.');
  });
});

describe('HAB-417 the resident dashboard says whose home this is', () => {
  const dashboard = readFileSync(new URL('./pages/ResidentDashboard.tsx', import.meta.url), 'utf8');
  const dashboardCss = readFileSync(new URL('./resident-dashboard.css', import.meta.url), 'utf8');

  it('reads the resident own units without a new endpoint or a new permission', () => {
    // `can_read_unit` already admits the active owner of a unit and its active tenant, so the
    // existing units route returns a resident their own units and nothing else. The authorization
    // stays in the database; the client does not filter and does not ask for anything new.
    expect(dashboard).toContain('apiRequest<ResidentUnit[]>(`${base}/units`, session)');
    expect(dashboard).not.toMatch(/units\?.*owner|filter\(\(unit\)/);
  });

  it('names the unit rather than showing its identifier', () => {
    // Standing rule across the app: never put a UUID in front of a person when a readable code
    // exists. The label comes from the shared helper every other financial surface uses.
    expect(dashboard).toContain('unitReferenceLabel({');
    expect(dashboard).not.toMatch(/\{unit\.id\}|residentContext\.unit\?\.id/);
  });

  it('states the residential standing without inventing a role', () => {
    // The dashboard reports what the membership already says and never derives a standing the
    // backend would not recognise. HAB-412 added two more residential roles, so all four are named
    // -- and owner is tested first, because someone who owns and is also family is an owner here.
    for (const label of ['Propietario', 'Inquilino', 'Familiar', 'Ocupante autorizado']) {
      expect(dashboard).toContain(`'${label}'`);
    }
    expect(dashboard.indexOf("'Propietario'")).toBeLessThan(dashboard.indexOf("'Familiar'"));
    expect(dashboard).toContain("roles.includes('owner')");
  });

  it('degrades to the condominium alone when there is no unit to name', () => {
    // A resident whose unit is not readable still gets a working home screen. A failed units
    // request is not a warning either: the header simply says less.
    expect(dashboard).toContain('residentContext.unit || residentContext.standing');
    expect(dashboard).toContain("units.status === 'fulfilled' ? units.value : []");
  });

  it('keeps the context strip inside the Habitta design contract', () => {
    // Same badge component and same spacing rhythm as the rest of the sheet, so the strip reads as
    // part of the heading block rather than as a first card of its own.
    expect(dashboard).toMatch(/<Badge tone="(info|neutral)">/);
    expect(dashboardCss).toContain('.resident-dashboard__context');
    expect(dashboard).not.toMatch(/style=\{\{/);
  });
});

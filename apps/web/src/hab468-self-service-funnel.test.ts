import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFile(new URL(relative, import.meta.url), 'utf8');

describe('HAB-468 self-service trial funnel contract', () => {
  it('carries only sanitized Esencial/Comunidad plan intent from public pricing', async () => {
    const site = await read('../../site/site.js');

    expect(site).toContain("const SELF_SERVICE_PLAN_CODES = new Set(['esencial', 'comunidad'])");
    expect(site).toContain("url.searchParams.set('signup', '1')");
    expect(site).toContain("url.searchParams.set('plan', planCode)");
    expect(site).toContain("url.searchParams.set('period', period)");
    expect(site).toContain("link.textContent = 'Comenzar prueba gratis'");
    expect(site).toContain("link.textContent = 'Hablar con Habitta'");
    expect(site).toContain("nextPeriod !== 'monthly' && nextPeriod !== 'annual'");
    expect(site).not.toMatch(/fallbackPrice|defaultPrice|hardcodedPrice/i);
  });

  it('persists non-authoritative signup intent in Auth metadata while keeping generic signup', async () => {
    const auth = await read('./components/PasswordAuthExperience.tsx');

    expect(auth).toContain('parseSelfServiceTrialIntent(window.location.search)');
    expect(auth).toContain('...selfServiceAuthMetadata(selfServiceIntent)');
    expect(auth).toContain("registration_source: 'public_admin_onboarding'");
    expect(auth).toContain("'Comienza tu prueba gratis'");
    expect(auth).toContain("'Crea tu cuenta administrativa'");
    expect(auth).toContain('30 días de prueba');
    expect(auth).toContain('No se realizará');
    expect(auth).toContain('configuración de pago se hará por separado');
  });

  it('uses the authoritative trial RPC only for a first workspace with self-service intent', async () => {
    const onboarding = await read('./lib/adminOnboarding.ts');

    expect(onboarding).toContain("supabase.rpc('create_self_service_trial_workspace_v1'");
    expect(onboarding).toContain("supabase.rpc('create_admin_workspace_v2'");
    expect(onboarding).toContain("supabase.rpc('create_condominium_with_profile_v2'");
    expect(onboarding).toMatch(/hasOrganization[\s\S]*create_condominium_with_profile_v2/);
    expect(onboarding).toMatch(/selfServiceIntent[\s\S]*submitSelfServiceTrial/);
    expect(onboarding).toContain('if (!result.error) clearSelfServiceIdempotencyKey');
    expect(onboarding).toContain('selected plan unit limit exceeded');
    expect(onboarding).toContain('selected plan requires guided onboarding');
    expect(onboarding).toContain('idempotency key reused');
    expect(onboarding).toContain(
      'self-service onboarding is only available for the first workspace',
    );
  });

  it('shows plan, period, 30-day trial and no-charge context before provisioning', async () => {
    const wizard = await read('./components/AdminOnboardingWizard.tsx');

    expect(wizard).toContain('selfServiceTrialIntentFromMetadata');
    expect(wizard).toContain('selfServicePlanLabel(intent.planCode)');
    expect(wizard).toContain('selfServiceBillingPeriodLabel(intent.billingPeriod)');
    expect(wizard).toContain('prueba gratis por 30 días');
    expect(wizard).toContain('No se realizará ningún cargo hoy');
    expect(wizard).toContain("step === 'review'");
    expect(wizard).toContain("? 'Crear condominio y activar prueba'");
  });

  it('does not add checkout, browser service-role access or resident-finance mutations', async () => {
    const sources = (
      await Promise.all([
        read('./components/PasswordAuthExperience.tsx'),
        read('./components/AdminOnboardingWizard.tsx'),
        read('./lib/adminOnboarding.ts'),
        read('./lib/selfServiceOnboarding.ts'),
      ])
    ).join('\n');

    expect(sources).not.toMatch(/service[_ -]?role/i);
    expect(sources).not.toMatch(/checkout|payment[_ -]?method/i);
    expect(sources).not.toMatch(/\.from\(['"](?:payments|receivables|ledger_entries|treasury)/i);
    expect(sources).not.toMatch(/auto_bill_enabled\s*:\s*true/i);
  });

  it('preserves the existing password recovery safety behavior', async () => {
    const auth = await read('./components/PasswordAuthExperience.tsx');
    const recovery = auth.slice(auth.indexOf('export function PasswordRecoveryGate'));

    expect(recovery).toContain('supabase.auth.updateUser({ password })');
    expect(recovery).toContain("supabase.auth.signOut({ scope: 'others' })");
    expect(recovery).toContain("window.history.replaceState({}, '', '/')");
    expect(recovery).not.toContain('selfServiceAuthMetadata');
    expect(recovery).not.toContain('create_self_service_trial_workspace_v1');
  });
});

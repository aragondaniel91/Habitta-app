import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const html = read('../../platform-admin/commercial.html');
const script = read('../../platform-admin/commercial.js');
const css = read('../../platform-admin/commercial-ops.css');

describe('HAB-477 Platform Admin commercial shell', () => {
  it('uses the approved shared Platform Admin shell with Commercial and Activity destinations', () => {
    expect(html).toContain('class="platform-layout"');
    expect(html).toContain('class="platform-sidebar"');
    expect(html).toContain('class="platform-topbar"');
    expect(html).toContain('href="/platform-shell.css"');
    expect(html).toContain('href="/commercial-ops.css"');
    expect(html).toContain('data-commercial-nav="actions"');
    expect(html).toContain('data-commercial-nav="activity"');
    expect(html).toContain('href="/commercial.html?view=activity"');
  });

  it('keeps customer context and direct Customer 360 drill-down in the same operating surface', () => {
    expect(html).toContain('id="commercial-customer-select"');
    expect(html).toContain('id="commercial-condominium-select"');
    expect(html).toContain('id="commercial-customer-360"');
    expect(script).toContain('/customers.html?organization=');
  });

  it('requires an explicit review confirmation before submitting a commercial mutation', () => {
    expect(html).toContain('id="commercial-confirm-check"');
    expect(html).toMatch(/disabled id="commercial-dialog-submit"/);
    expect(script).toContain('if (!currentAction || !confirmCheck.checked) return;');
    expect(script).toContain('dialogSubmit.disabled = !confirmCheck.checked');
  });

  it('has desktop-first commercial density with responsive fallback', () => {
    expect(css).toContain('.commercial-grid');
    expect(css).toContain('.audit-table');
    expect(css).toContain('min-width: 1180px');
    expect(css).toContain('@media (max-width: 760px)');
  });
});

describe('HAB-477 approved mutation boundary', () => {
  it('integrates only the existing hardened commercial mutation RPCs', () => {
    const expectedMutations = [
      'platform_start_30_day_trial',
      'platform_apply_commercial_offer',
      'platform_gift_months',
      'platform_activate_subscription',
      'platform_create_commercial_offer',
      'platform_disable_commercial_offer',
    ];
    for (const rpcName of expectedMutations) expect(script).toContain(`'${rpcName}'`);

    expect(script).not.toContain('platform_pause_subscription');
    expect(script).not.toContain('platform_cancel_subscription');
    expect(script).not.toContain('platform_change_plan');
  });

  it('keeps demo/internal explicitly visible but outside customer mutation controls', () => {
    expect(script).toContain("demo: 'Demo · no facturable'");
    expect(script).toContain("internal: 'Interno · no facturable'");
    expect(script).toContain("if (row.account_type !== 'customer')");
    expect(script).toContain("badge('Fuera de billing'");
  });

  it('never introduces privileged browser credentials or condominium accounting paths', () => {
    expect(script).not.toContain('service_role');
    expect(script).not.toContain('/rest/v1/people');
    expect(script).not.toContain('/rest/v1/payments');
    expect(script).not.toContain('/rest/v1/receivables');
    expect(script).not.toContain('/rest/v1/ledger');
    expect(script).not.toContain('/rest/v1/treasury');
  });

  it('keeps commercial identity bounded by operations and only enriches matching condominiums', () => {
    expect(script).toContain('commercialByCondominium');
    expect(script).toContain('for (const operation of operationsRows)');
    expect(script).not.toContain('for (const commercial of commercialRows)');
  });
});

describe('HAB-477 authoritative audit history', () => {
  it('reads Customer 360 and renders only recorded subscription, terms and adjustment history', () => {
    expect(script).toContain("rpc('get_platform_customer_360'");
    expect(script).toContain('data.commercial_history ?? []');
    expect(script).toContain('data.terms_history ?? []');
    expect(script).toContain('data.adjustment_history ?? []');
  });

  it('does not fabricate actors when an audit actor is absent', () => {
    expect(script).toContain("if (!value) return 'No registrado'");
    expect(script).toContain('actor_user_id');
    expect(script).toContain('authorized_by');
  });

  it('makes mutation success and failure explicit to the operator', () => {
    expect(script).toContain(
      "setStatus('Acción comercial confirmada. El estado y la auditoría fueron recargados.', 'success')",
    );
    expect(script).toContain("dialogWarning.dataset.tone = 'error'");
  });
});

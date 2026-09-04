import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const pages = [
  read('../../platform-admin/index.html'),
  read('../../platform-admin/customers.html'),
  read('../../platform-admin/subscriptions.html'),
  read('../../platform-admin/commercial.html'),
];
const shell = read('../../platform-admin/platform-shell.css');
const commercial = pages[3];
const commercialScript = read('../../platform-admin/commercial.js');

describe('HAB-479 Platform Admin accessibility contract', () => {
  it('gives every operating surface a skip target and labeled main navigation', () => {
    for (const page of pages) {
      expect(page).toContain('class="skip-link" href="#platform-main"');
      expect(page).toMatch(/<main[^>]*id="platform-main"[^>]*tabindex="-1"/);
      expect(page).toContain('aria-label="Navegación principal" class="platform-nav"');
      expect(page).toContain('aria-disabled="true" class="nav-disabled"');
    }
  });

  it('makes asynchronous status and horizontally scrollable tables programmatically discoverable', () => {
    for (const page of pages) {
      expect(page).toMatch(/aria-atomic="true" aria-live="polite" role="status"/);
      expect(page).toContain(
        'aria-label="Tabla desplazable horizontalmente" class="table-scroll" role="region" tabindex="0"',
      );
    }
  });

  it('provides a visible focus contract, touch targets and reduced-motion fallback', () => {
    expect(shell).toContain(':focus-visible');
    expect(shell).toContain('.skip-link:focus');
    expect(shell).toContain(".table-scroll[tabindex='0']:focus-visible");
    expect(shell).toContain('@media (max-width: 620px)');
    expect(shell).toContain('min-height: 44px');
    expect(shell).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

describe('HAB-479 commercial dialog keyboard contract', () => {
  it('explicitly names both native dialogs', () => {
    expect(commercial).toContain(
      'aria-describedby="commercial-dialog-subtitle" aria-labelledby="commercial-dialog-title" id="commercial-action-dialog"',
    );
    expect(commercial).toContain(
      'aria-describedby="offer-dialog-description" aria-labelledby="offer-dialog-title" id="offer-dialog"',
    );
    expect(commercial).toContain('id="offer-dialog-title"');
    expect(commercial).toContain('id="offer-dialog-description"');
  });

  it('returns focus to the invoking control after either dialog closes', () => {
    expect(commercialScript).toContain('let actionDialogReturnFocus = null');
    expect(commercialScript).toContain('let offerDialogReturnFocus = null');
    expect(commercialScript).toContain("actionDialog.addEventListener('close'");
    expect(commercialScript).toContain("offerDialog.addEventListener('close'");
    expect(commercialScript).toContain('requestAnimationFrame(() => target.focus())');
  });
});

describe('HAB-479 security/domain boundary', () => {
  it('does not add privileged browser credentials or condominium accounting access', () => {
    const combined = pages.join('\n') + commercialScript;
    expect(combined).not.toContain('service_role');
    expect(combined).not.toContain('/rest/v1/payments');
    expect(combined).not.toContain('/rest/v1/receivables');
    expect(combined).not.toContain('/rest/v1/ledger');
    expect(combined).not.toContain('/rest/v1/treasury');
  });
});

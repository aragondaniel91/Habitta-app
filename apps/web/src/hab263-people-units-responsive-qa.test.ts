import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('HAB-263 Personas + Unidades responsive and visual QA', () => {
  it('loads a scoped QA layer only from the shared community directory route', async () => {
    const route = await read('./pages/CommunityDirectoryPage.tsx');
    const css = await read('./hab263-responsive-qa.css');

    expect(route).toContain("import '../hab263-responsive-qa.css';");
    expect(css).toContain('.people-v3-workspace');
    expect(css).toContain('.units-v3-page');
    expect(css).toContain(':is(.people-v3-drawer, .units-v3-drawer)');
  });

  it('keeps the People sticky directory below the persistent topbar', async () => {
    const css = await read('./hab263-responsive-qa.css');

    expect(css).toContain('top: calc(var(--topbar-height) + 1rem)');
    expect(css).toContain('max-height: calc(100dvh - var(--topbar-height) - 2rem)');
    expect(css).toContain('@media (max-width: 860px)');
    expect(css).toContain('top: auto');
    expect(css).toContain('max-height: none');
  });

  it('uses balanced KPI layouts on desktop, tablet and mobile', async () => {
    const css = await read('./hab263-responsive-qa.css');

    expect(css).toContain('.people-v3-workspace .ux-metrics');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(css).toContain('.units-v3-page .ux-metrics');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('prevents long names, emails and building labels from widening the viewport', async () => {
    const css = await read('./hab263-responsive-qa.css');

    expect(css).toContain('.people-v3-profile-header__meta span');
    expect(css).toContain('.people-v3-history__list strong');
    expect(css).toContain('.units-v3-detail-facts strong');
    expect(css).toContain('.units-v3-history-list strong');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toContain('.people-v3-profile-header__name h2');
    expect(css).toContain('.people-v3-unit-card__title h4');
    expect(css).toContain('.units-v3-row__identity strong');
    expect(css).toContain('white-space: normal');
  });

  it('keeps drawers viewport-bound, vertically scrollable and tabs horizontally safe', async () => {
    const [drawer, uxCss, qaCss] = await Promise.all([
      read('./components/Drawer.tsx'),
      read('./ux-contract.css'),
      read('./hab263-responsive-qa.css'),
    ]);

    expect(uxCss).toContain('height: 100dvh');
    expect(uxCss).toContain('overflow-y: auto');
    expect(uxCss).toContain('overscroll-behavior: contain');
    expect(qaCss).toContain('max-width: 100vw');
    expect(qaCss).toContain('overflow-x: hidden');
    expect(qaCss).toContain('overscroll-behavior-inline: contain');
    expect(qaCss).toContain('white-space: nowrap');
    expect(drawer).toContain('aria-modal="true"');
  });

  it('preserves keyboard-only dialog behavior and explicit focus indicators', async () => {
    const [drawer, styles, qaCss] = await Promise.all([
      read('./components/Drawer.tsx'),
      read('./styles.css'),
      read('./hab263-responsive-qa.css'),
    ]);

    expect(drawer).toContain("event.key === 'Escape'");
    expect(drawer).toContain("event.key !== 'Tab'");
    expect(drawer).toContain('previouslyFocusedRef.current?.focus?.()');
    expect(styles).toContain(':focus-visible');
    expect(qaCss).toContain('.people-v3-directory__item:focus-visible');
    expect(qaCss).toContain('.units-v3-row:focus-visible');
    expect(qaCss).toContain('.ux-tab:focus-visible');
  });

  it('keeps the supported app floor at 320px and responsive module breakpoints explicit', async () => {
    const [styles, peopleCss, unitsCss, qaCss] = await Promise.all([
      read('./styles.css'),
      read('./features/people/people-v3.css'),
      read('./units-v3.css'),
      read('./hab263-responsive-qa.css'),
    ]);

    expect(styles).toContain('min-width: 320px');
    expect(peopleCss).toContain('@media (max-width: 860px)');
    expect(peopleCss).toContain('@media (max-width: 560px)');
    expect(unitsCss).toContain('@media (max-width: 1180px)');
    expect(unitsCss).toContain('@media (max-width: 860px)');
    expect(unitsCss).toContain('@media (max-width: 560px)');
    expect(qaCss).toContain('max-width: 100%');
  });
});

import { readFileSync } from 'node:fs';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Condominium, Organization } from './components/AppShell';
import { PlatformAccountHandoff } from './components/AuthExperience';
import { platformAdminUrlForHost } from './lib/platform-handoff';
import { scopeWorkspaceToMemberships } from './lib/workspace-scope';

// HAB-432: a Platform Admin identity opening the tenant portal is handed a choice, not a redirect.
//
// The bug this pins was a loop rather than a permission problem: the app sent the browser to the
// admin console on sight, but the Supabase session at the app origin survived the trip, so coming
// back bounced the person out again with no way to sign in as somebody else. Nothing about who may
// do what changed here -- only who decides to leave.

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

/** Every element in a rendered tree, so props can be asserted without a DOM. */
function flatten(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!isValidElement(node)) return [];
  const { children } = node.props as { children?: ReactNode };
  return [node, ...flatten(children)];
}

describe('HAB-432 the platform account handoff replaces the redirect', () => {
  it('no longer navigates away from the tenant portal on its own', () => {
    // The whole defect in one assertion: nothing in App may move the browser to another origin.
    // `history.replaceState` (same-origin route correction) is untouched and deliberately not
    // matched here.
    expect(appSource).not.toMatch(/location\.(replace|assign|href\s*=)/);
    expect(appSource).not.toContain('admin.mihabitta.com');
    // And the state is rendered rather than escaped from.
    expect(appSource).toContain('<PlatformAccountHandoff');
  });

  it('hands the session to the existing Supabase signOut, never to storage keys by hand', () => {
    expect(appSource).toContain('const signOut = () => void supabase?.auth.signOut()');
    expect(appSource).toContain('onSignOut={signOut}');
    expect(appSource).not.toContain('localStorage');
  });

  it('states the account context without dressing it as a failure', () => {
    const html = renderToStaticMarkup(
      <PlatformAccountHandoff onSignOut={() => {}} platformAdminUrl="https://admin.example.test" />,
    );

    expect(html).toContain('Cuenta de plataforma');
    expect(html).toContain('Esta cuenta administra Habitta desde Platform Admin.');
    expect(html).toContain(
      'Tu sesión actual no tiene un espacio de condominio o residente en este portal.',
    );
    // The words this state must never use, because none of them are true of it.
    expect(html).not.toMatch(/error|no pudimos|falló|no autorizado|403|tenant/i);
  });

  it('offers both ways forward, the console as a real link', () => {
    const html = renderToStaticMarkup(
      <PlatformAccountHandoff
        onSignOut={() => {}}
        platformAdminUrl="https://admin-preview.mihabitta.com"
      />,
    );

    expect(html).toContain('href="https://admin-preview.mihabitta.com"');
    expect(html).toContain('Ir a Platform Admin');
    expect(html).toContain('Iniciar sesión con otra cuenta');
    // One heading, and the primary action is an anchor rather than a scripted jump.
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<a class="button" href=/);
  });

  it('wires the alternate-account action to the callers signOut and nothing else', () => {
    const onSignOut = vi.fn();
    const tree = flatten(
      PlatformAccountHandoff({ onSignOut, platformAdminUrl: 'https://admin.example.test' }),
    );

    const handlers = tree
      .map((element) => (element.props as { onClick?: () => void }).onClick)
      .filter((onClick): onClick is () => void => Boolean(onClick));

    expect(handlers).toHaveLength(1);
    handlers.forEach((onClick) => onClick());
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('HAB-432 the console target follows the environment', () => {
  it('sends the production app to the production console', () => {
    expect(platformAdminUrlForHost('app.mihabitta.com')).toBe('https://admin.mihabitta.com');
  });

  it('sends every preview origin to the preview console', () => {
    for (const host of ['habitta-web-dev.pages.dev', 'preview.mihabitta.com']) {
      expect(platformAdminUrlForHost(host)).toBe('https://admin-preview.mihabitta.com');
    }
  });

  it('treats an origin it does not recognise as non-production', () => {
    // Production is named, never assumed: a dev server or an unregistered preview must not be able
    // to hand somebody the production console.
    for (const host of ['localhost', '127.0.0.1', 'some-branch.habitta-web-dev.pages.dev']) {
      expect(platformAdminUrlForHost(host)).toBe('https://admin-preview.mihabitta.com');
    }
  });
});

describe('HAB-432 tenant routing semantics are untouched', () => {
  // What decides the handoff is the same rule as before; only its consequence changed. These two
  // cases are the boundary either side of it.
  const organizations: Organization[] = [
    { id: 'org-a', name: 'A' },
    { id: 'org-b', name: 'B' },
  ];
  const condominiums: Condominium[] = [
    { id: 'condo-a', name: 'A1', organization_id: 'org-a' },
    { id: 'condo-b', name: 'B1', organization_id: 'org-b' },
  ];

  it('still marks a membership-less cross-tenant identity as platform only', () => {
    const result = scopeWorkspaceToMemberships(organizations, condominiums, {
      organizations: [],
      condominiums: [],
    });

    expect(result.platformOnly).toBe(true);
  });

  it('still gives a resident identity its own workspace, never the handoff', () => {
    const result = scopeWorkspaceToMemberships(organizations, condominiums, {
      organizations: [],
      condominiums: [{ condominium_id: 'condo-b', role: 'owner' }],
    });

    expect(result.platformOnly).toBe(false);
    expect(result.condominiums.map((item) => item.id)).toEqual(['condo-b']);
  });
});

// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AddCondominiumPage } from './AddCondominiumPage';

describe('AddCondominiumPage', () => {
  let host: HTMLDivElement | undefined;

  afterEach(() => host?.remove());

  it('offers only organizations owned by the signed-in organization owner', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(AddCondominiumPage, {
        organizations: [
          { id: 'owned', name: 'Administradora propia' },
          { id: 'member-only', name: 'Organización ajena' },
        ],
        ownedOrganizationIds: ['owned'],
        onCancel: () => {},
        onCreated: async () => {},
      }));
    });

    const organizationSelect = host.querySelector<HTMLSelectElement>('.admin-onboarding-form select');
    if (!organizationSelect) throw new Error('Organization selector not found');
    const options = Array.from(organizationSelect.options).map((option) => ({
      value: option.value, label: option.textContent,
    }));
    expect(options).toEqual([{ value: 'owned', label: 'Administradora propia' }]);
    expect(host.textContent).not.toContain('Organización ajena');
    act(() => root.unmount());
  });
});

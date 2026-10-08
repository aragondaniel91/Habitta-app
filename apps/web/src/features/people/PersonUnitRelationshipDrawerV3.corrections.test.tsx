// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonUnitRelationshipDrawerV3 } from './PersonUnitRelationshipDrawerV3';
import type { PersonUnitRelationshipSummary } from './person-unit-relationships';

const api = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ peopleApi: api }));

const relationships: PersonUnitRelationshipSummary[] = [
  {
    unitId: 'u1',
    unitLabel: '101',
    active: true,
    activeSince: '2026-01-01',
    currentOwnership: {
      id: 'owner-1',
      person_id: 'p1',
      unit_id: 'u1',
      ownership_percentage: 50,
      starts_at: '2026-01-01',
      units: { id: 'u1', code: '101', condominium_id: 'c1' },
    },
    ownershipHistory: [],
    currentOccupancy: {
      id: 'occupancy-1',
      person_id: 'p1',
      unit_id: 'u1',
      occupancy_type: 'tenant',
      starts_at: '2026-01-01',
      units: { id: 'u1', code: '101', condominium_id: 'c1' },
    },
    occupancyHistory: [],
    currentCommunication: null,
    communicationHistory: [],
    accessRoles: [],
    latestInvitation: null,
    latestInvitationStatus: null,
    invitations: [],
  },
];

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set?.call(
      element,
      value,
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('PersonUnitRelationshipDrawerV3 corrections', () => {
  let host: HTMLDivElement;
  let root: Root;
  const onRequestClose = vi.fn();

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    api.mockResolvedValue({});
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(PersonUnitRelationshipDrawerV3, {
          condominiumId: 'c1',
          session: {} as never,
          person: { id: 'p1', first_name: 'Ana', last_name: 'Pérez' },
          units: [{ id: 'u1', code: '101', condominium_id: 'c1', status: 'active' }],
          buildings: [],
          relationships,
          initialUnitId: 'u1',
          onClose: vi.fn(),
          onChanged: vi.fn(),
          onRequestClose,
        }),
      );
    });
    await flush();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('edits active ownership and occupancy through correction PATCHes without closing either relationship', async () => {
    const ownershipInput = host.querySelector('input[value="50"]') as HTMLInputElement;
    setValue(ownershipInput, '60');
    const buttons = Array.from(host.querySelectorAll('button'));
    act(() => buttons.find((button) => button.textContent?.includes('Editar propiedad'))?.click());
    await flush();

    const occupancySelect = host.querySelectorAll('select')[1] as HTMLSelectElement;
    setValue(occupancySelect, 'owner_occupant');
    act(() => buttons.find((button) => button.textContent?.includes('Editar ocupación'))?.click());
    await flush();

    expect(api).toHaveBeenCalledWith('/v1/condominiums/c1/unit-owners/owner-1', {} as never, {
      method: 'PATCH',
      body: JSON.stringify({ ownershipPercentage: 60 }),
    });
    expect(api).toHaveBeenCalledWith(
      '/v1/condominiums/c1/unit-occupancies/occupancy-1',
      {} as never,
      {
        method: 'PATCH',
        body: JSON.stringify({ occupancyType: 'owner_occupant' }),
      },
    );
    expect(
      api.mock.calls.flatMap(([, , request]) => [String(request?.body)]).join(''),
    ).not.toContain('endsAt');
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it('keeps the owner-share correction guidance inside relationship management', () => {
    expect(host.textContent).toContain('Porcentaje de propiedad (%)');
    expect(host.textContent).toContain(
      'Si el total conocido supera 100%, reduce un porcentaje para corregirlo.',
    );
  });
});

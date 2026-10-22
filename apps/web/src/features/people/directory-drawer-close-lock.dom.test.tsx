// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnitEditor } from '../units/UnitEditor';
import { PersonEditorDrawerV3 } from './PersonEditorDrawerV3';
import { PersonUnitRelationshipDrawerV3 } from './PersonUnitRelationshipDrawerV3';

const api = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ peopleApi: api }));

describe('Directory editors cannot be dismissed during a save', () => {
  let host: HTMLDivElement;
  let root: Root;
  const onClose = vi.fn();

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = async (element: ReturnType<typeof createElement>) => {
    await act(async () => {
      root.render(element);
    });
  };

  const tryDismiss = () => {
    const backdrop = host.querySelector<HTMLButtonElement>('button[aria-label="Cerrar panel"]');
    expect(backdrop).not.toBeNull();
    expect(backdrop!.disabled).toBe(true);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      backdrop!.click();
    });
    expect(onClose).not.toHaveBeenCalled();
  };

  it('locks a unit editor whose parent reports saving, and unlocks it afterwards', async () => {
    const props = {
      mode: 'create' as const,
      topology: 'house_community' as const,
      buildings: [],
      saving: true,
      onClose,
      onSave: vi.fn(),
    };
    await render(createElement(UnitEditor, props));
    tryDismiss();

    await render(createElement(UnitEditor, { ...props, saving: false }));
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="Cerrar panel"]')?.disabled,
    ).toBe(false);
  });

  it('locks the person editor for the entire pending mutation', async () => {
    let finish!: (value: unknown) => void;
    api.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render(
      createElement(PersonEditorDrawerV3, {
        condominiumId: 'c1',
        session: {} as never,
        buildings: [],
        units: [],
        person: { id: 'p1', first_name: 'Ana', last_name: 'Pérez', status: 'active' },
        onClose,
        onSaved: vi.fn(),
      }),
    );

    await act(async () => {
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(api).toHaveBeenCalledTimes(1);
    tryDismiss();

    await act(async () => {
      finish({ id: 'p1', first_name: 'Ana', last_name: 'Pérez' });
    });
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="Cerrar panel"]')?.disabled,
    ).toBe(false);
  });

  it('locks relationship management until the server completes the association', async () => {
    let finish!: (value: unknown) => void;
    api.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render(
      createElement(PersonUnitRelationshipDrawerV3, {
        condominiumId: 'c1',
        session: {} as never,
        person: { id: 'p1', first_name: 'Ana', last_name: 'Pérez' },
        units: [{ id: 'u1', code: '101', condominium_id: 'c1', status: 'active' }],
        buildings: [],
        relationships: [],
        initialUnitId: 'u1',
        onClose,
        onChanged: vi.fn(),
        onRequestClose: vi.fn(),
      }),
    );

    const associate = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Asociar propiedad'),
    );
    expect(associate).toBeDefined();
    await act(async () => {
      associate!.click();
    });
    expect(api).toHaveBeenCalledTimes(1);
    tryDismiss();

    await act(async () => {
      finish({});
    });
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="Cerrar panel"]')?.disabled,
    ).toBe(false);
  });
});

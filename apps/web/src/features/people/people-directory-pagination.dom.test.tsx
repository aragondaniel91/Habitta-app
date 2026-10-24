// @vitest-environment jsdom
import { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { PeopleDirectoryView } from './PeopleWorkspaceComponents';
import { orderPeopleDirectory, paginatePeopleDirectory } from './people-directory-view';
import type { Person } from './types';

const people: Person[] = Array.from({ length: 48 }, (_, index) => ({
  id: `resident-${index + 1}`,
  first_name: 'Persona',
  last_name: String(index + 1),
  document_number: String(index + 1),
  email: `person${index + 1}@example.com`,
  status: index < 26 ? 'active' : 'inactive',
}));

describe('minimal Personas directory pagination', () => {
  let host: HTMLDivElement;
  let root: Root;
  const onSelect = vi.fn();

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    onSelect.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function Harness() {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('');
    const matching = people.filter((person) => {
      const matchesName = `${person.first_name} ${person.last_name}`
        .toLowerCase()
        .includes(query.toLowerCase());
      return matchesName && (!status || (person.status ?? 'active') === status);
    });
    return (
      <PeopleDirectoryView
        emptyState={{
          title: 'Sin coincidencias',
          description: 'Ajusta los filtros.',
          actionLabel: 'Restablecer filtro',
        }}
        onClearFilters={() => {
          setQuery('');
          setStatus('');
        }}
        onQueryChange={setQuery}
        onSelect={onSelect}
        onStatusFilterChange={setStatus}
        people={matching}
        query={query}
        selectedId={null}
        statusFilter={status}
        totalPeople={people.length}
      />
    );
  }

  async function renderDirectory() {
    await act(async () => root.render(<Harness />));
  }

  const visible = () =>
    [...host.querySelectorAll('.people-v3-directory__item')].map(
      (item) => item.querySelector('.people-v3-directory__identity strong')?.textContent,
    );

  async function click(text: string) {
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent?.trim() === text,
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
  }

  async function choose(label: string, value: string) {
    const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
    expect(select).not.toBeNull();
    await act(async () => {
      select!.value = value;
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  async function search(value: string) {
    const input = host.querySelector<HTMLInputElement>('input[type="search"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(input, value);
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  it('naturally sorts and paginates 48 records without mutating the source', () => {
    const copy = [...people];
    expect(
      orderPeopleDirectory(people, 'name-asc')
        .slice(0, 3)
        .map((p) => p.last_name),
    ).toEqual(['1', '2', '3']);
    expect(orderPeopleDirectory(people, 'name-desc')[0]?.last_name).toBe('48');
    expect(people).toEqual(copy);
    const page = paginatePeopleDirectory(people, 99, 10);
    expect([page.page, page.totalPages, page.first, page.last, page.people.length]).toEqual([
      5, 5, 41, 48, 8,
    ]);
    expect(paginatePeopleDirectory([], 5, 10).first).toBe(0);
    expect(paginatePeopleDirectory(people, Number.NaN, 25).page).toBe(1);
  });

  it('shows 10/25/50 options, page range and last page with next/previous controls', async () => {
    await renderDirectory();
    expect(visible()).toHaveLength(10);
    expect(visible()[0]).toBe('Persona 1');
    expect(host.textContent).toContain('1–10 de 48 personas');
    expect(host.querySelectorAll('.people-v3-directory__item')).toHaveLength(10);
    expect(
      host.querySelector<HTMLButtonElement>(
        'nav[aria-label="Paginación del directorio de personas"] button',
      )?.disabled,
    ).toBe(true);

    await click('Siguiente');
    expect(visible()[0]).toBe('Persona 11');
    expect(host.textContent).toContain('11–20 de 48 personas');

    await choose('Personas por página', '25');
    expect(visible()).toHaveLength(25);
    expect(visible()[0]).toBe('Persona 1');
    await click('Siguiente');
    expect(visible()).toHaveLength(23);
    expect(host.textContent).toContain('26–48 de 48 personas');
    await choose('Personas por página', '50');
    expect(visible()).toHaveLength(48);
    expect(
      host.querySelector('nav[aria-label="Paginación del directorio de personas"]'),
    ).toBeNull();
  });

  it('resets to first page on sorting, search and status changes', async () => {
    await renderDirectory();
    await click('Siguiente');
    await choose('Ordenar personas', 'name-desc');
    expect(visible()[0]).toBe('Persona 48');
    expect(host.textContent).toContain('1–10 de 48 personas');

    await click('Siguiente');
    await search('Persona 3');
    expect(host.textContent).toContain('1–10 de 11 personas');
    expect(visible()[0]).toBe('Persona 39');

    await search('');
    await click('Siguiente');
    await choose('Personas por página', '25');
    await choose('Ordenar personas', 'name-asc');
    await choose('Ordenar personas', 'name-desc');
    await choose('Ordenar personas', 'name-asc');
    await choose('Personas por página', '10');
    await click('Siguiente');
    await choose('Filtrar personas por estado', 'inactive');
    expect(visible()[0]).toBe('Persona 27');
    expect(host.textContent).toContain('1–10 de 22 personas');
  });

  it('keeps selection functional after navigating and filtering', async () => {
    await renderDirectory();
    await click('Siguiente');
    const row = host.querySelectorAll<HTMLButtonElement>('.people-v3-directory__item')[0];
    expect(row?.textContent).toContain('Persona 11');
    await act(async () => row!.click());
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'resident-11' }),
      'pointer',
    );
  });

  it('has a compact empty state and no phantom page navigation', async () => {
    await renderDirectory();
    await search('No existe');
    expect(host.textContent).toContain('Sin coincidencias');
    expect(host.textContent).toContain('0–0 de 0 personas');
    expect(
      host.querySelector('nav[aria-label="Paginación del directorio de personas"]'),
    ).toBeNull();
    await click('Restablecer filtro');
    expect(visible()).toHaveLength(10);
  });
});

import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { apiRequest } from '../../lib/api';
import { Dialog, DialogBody, DialogFooter } from '../../components/Dialog';
import { Button } from '../../components/ui';
import './BoardGroupsPreviewPage.css';

type Mode = 'autonomo' | 'hibrido' | 'centralizado';
type Board = {
  id: number;
  building: string;
  group: string;
  mode: Mode;
  members: number;
  state: 'Activa' | 'Pendiente';
};
const seed: Board[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  building: `Edificio ${i + 1}`,
  group: `Junta Edificio ${i + 1}`,
  mode: 'autonomo',
  members: 3 + (i % 3),
  state: i === 9 ? 'Pendiente' : 'Activa',
}));
const modes: Record<Mode, string> = {
  autonomo: 'Autónomo',
  hibrido: 'Híbrido',
  centralizado: 'Centralizado',
};
type Sort = 'building' | 'group' | 'mode' | 'members' | 'state';

type RegisteredBuilding = { id: string; name: string };
type Props = { condominiumId?: string | null; session?: Session | null };

export function BoardGroupsPreviewPage({ condominiumId, session }: Props) {
  const [registered, setRegistered] = useState<RegisteredBuilding[]>([]);
  const [registeredError, setRegisteredError] = useState<string | null>(null);
  const [registeredLoading, setRegisteredLoading] = useState(false);
  useEffect(() => {
    if (!condominiumId || !session) return;
    let active = true;
    setRegisteredLoading(true);
    setRegisteredError(null);
    setRegistered([]);
    void apiRequest<RegisteredBuilding[]>(
      '/v1/condominiums/' + condominiumId + '/buildings',
      session,
    )
      .then((items) => {
        if (active) setRegistered(items);
      })
      .catch(() => {
        if (active) setRegisteredError('No se pudieron cargar los edificios registrados.');
      })
      .finally(() => {
        if (active) setRegisteredLoading(false);
      });
    return () => {
      active = false;
    };
  }, [condominiumId, session]);
  const [rows, setRows] = useState<Board[]>(seed);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [sort, setSort] = useState<Sort>('building');
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [context, setContext] = useState('general');
  const pageSize = 5;
  const filtered = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            (modeFilter === 'all' || row.mode === modeFilter) &&
            (stateFilter === 'all' || row.state === stateFilter) &&
            `${row.building} ${row.group} ${modes[row.mode]} ${row.state}`
              .toLocaleLowerCase('es')
              .includes(search.toLocaleLowerCase('es')),
        )
        .sort((a, b) => {
          const v =
            sort === 'members'
              ? a.members - b.members
              : sort === 'mode'
                ? modes[a.mode].localeCompare(modes[b.mode], 'es')
                : String(a[sort]).localeCompare(String(b[sort]), 'es', { numeric: true });
          return descending ? -v : v;
        }),
    [rows, search, modeFilter, stateFilter, sort, descending],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const detail = rows.find((row) => row.id === selected);
  const sortBy = (key: Sort) => {
    setDescending((prev) => (sort === key ? !prev : false));
    setSort(key);
    setPage(1);
  };
  return (
    <div className="hab-board-preview">
      <header className="hab-board-preview__head">
        <div>
          <p className="hab-board-preview__eyebrow">Organización / Juntas y equipos</p>
          <h1>Juntas y equipos</h1>
          <p className="hab-board-preview__sub">
            Explora el modelo de administración por edificio.
          </p>
        </div>
        <span className="hab-board-preview__tag">VISTA DEMOSTRATIVA</span>
      </header>
      <aside className="hab-board-preview__notice">
        Datos de ejemplo: esta pantalla no consulta ni modifica juntas, pagos, cuotas o permisos
        reales. Las configuraciones se pierden al salir.
      </aside>
      {condominiumId && session && (
        <section className="hab-board-preview__panel" aria-label="Edificios registrados">
          <h2>Edificios registrados</h2>
          <p className="hab-board-preview__sub">
            Información real de estructura. Las juntas y modalidades de abajo son ilustrativas.
          </p>
          {registeredLoading ? (
            <p role="status">Cargando edificios…</p>
          ) : registeredError ? (
            <p role="alert">{registeredError}</p>
          ) : registered.length === 0 ? (
            <p>No hay edificios registrados en este condominio.</p>
          ) : (
            <ul>
              {registered.map((building) => (
                <li key={building.id}>{building.name}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="hab-board-preview__stats" aria-label="Resumen demostrativo">
        <div>
          <span>Edificios</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Juntas activas</span>
          <strong>{rows.filter((x) => x.state === 'Activa').length}</strong>
        </div>
        <div>
          <span>Autónomos</span>
          <strong>{rows.filter((x) => x.mode === 'autonomo').length}</strong>
        </div>
        <div>
          <span>Modalidades disponibles</span>
          <strong>3</strong>
        </div>
      </section>
      <section className="hab-board-preview__panel">
        <div className="hab-board-preview__panelhead">
          <div>
            <h2>Directorio de juntas</h2>
            <p className="hab-board-preview__sub">Búsqueda, filtros, orden y paginación</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setRows(seed);
              setSearch('');
              setModeFilter('all');
              setStateFilter('all');
              setPage(1);
              setSelected(null);
              setSort('building');
              setDescending(false);
              setContext('general');
            }}
          >
            Restablecer demo
          </button>
        </div>
        <div className="hab-board-preview__filters">
          <label>
            Buscar
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Edificio, junta o estado"
            />
          </label>
          <label>
            Modelo
            <select
              value={modeFilter}
              onChange={(e) => {
                setModeFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todos</option>
              <option value="autonomo">Autónomo</option>
              <option value="hibrido">Híbrido</option>
              <option value="centralizado">Centralizado</option>
            </select>
          </label>
          <label>
            Estado
            <select
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todos</option>
              <option value="Activa">Activa</option>
              <option value="Pendiente">Pendiente</option>
            </select>
          </label>
          <label>
            Contexto
            <select value={context} onChange={(e) => setContext(e.target.value)}>
              <option value="general">Administración general</option>
              <option value="board">Junta de edificio</option>
              <option value="resident">Residente</option>
            </select>
          </label>
        </div>
        <div className="hab-board-preview__scroll">
          <table>
            <thead>
              <tr>
                {(
                  [
                    ['building', 'Edificio'],
                    ['group', 'Grupo'],
                    ['mode', 'Modalidad'],
                    ['members', 'Integrantes'],
                    ['state', 'Estado'],
                  ] as [Sort, string][]
                ).map(([key, label]) => (
                  <th key={key}>
                    <button
                      type="button"
                      onClick={() => sortBy(key)}
                      aria-label={`Ordenar por ${label}`}
                    >
                      {label} {sort === key ? (descending ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                ))}
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice((current - 1) * pageSize, current * pageSize).map((row) => (
                <tr key={row.id}>
                  <td>{row.building}</td>
                  <td>{row.group}</td>
                  <td>
                    <span className="hab-board-preview__mode">{modes[row.mode]}</span>
                  </td>
                  <td>{row.members}</td>
                  <td>{row.state}</td>
                  <td>
                    <button type="button" onClick={() => setSelected(row.id)}>
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="hab-board-preview__empty">No hay juntas que coincidan con los filtros.</p>
          )}
        </div>
        <footer className="hab-board-preview__pager">
          <span>
            {filtered.length} resultados · Página {current} de {pages}
          </span>
          <div>
            <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              Anterior
            </button>
            <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>
              Siguiente
            </button>
          </div>
        </footer>
      </section>
      {detail && (
        <Dialog title={detail.group} onClose={() => setSelected(null)} size="md">
          <DialogBody>
            <p>
              Grupo de ejemplo del {detail.building}. Los cargos de la residencia general siguen
              perteneciendo a la cuenta cobrable del edificio.
            </p>
            <label>
              Modelo administrativo (solo demo)
              <select
                value={detail.mode}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((x) =>
                      x.id === detail.id ? { ...x, mode: e.target.value as Mode } : x,
                    ),
                  )
                }
              >
                <option value="autonomo">Autónomo</option>
                <option value="hibrido">Híbrido</option>
                <option value="centralizado">Centralizado</option>
              </select>
            </label>
            <p>
              <strong>Integrantes ilustrativos:</strong> presidenta, tesorero y secretaria. No
              representan usuarios reales.
            </p>
            <p>
              <strong>Contexto seleccionado:</strong>{' '}
              {context === 'general'
                ? 'Administración general'
                : context === 'board'
                  ? 'Junta de edificio'
                  : 'Residente'}
            </p>
            <p className="hab-board-preview__warning">
              Finanzas internas de apartamentos y permisos por edificio: pendientes de arquitectura,
              RLS y autorización.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setSelected(null)}>
              Cerrar detalle
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}

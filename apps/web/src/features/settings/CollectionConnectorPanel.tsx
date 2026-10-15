import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Badge, Button, Field, Surface } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import { useCondominiumRoles } from '../../lib/roles';

type CatalogItem = {
  provider_key: string;
  country_code: string;
  display_name: string;
  capabilities: string[];
  lifecycle_status: 'pending';
};
type Connection = {
  id: string;
  provider_key: string;
  display_label: string;
  environment: 'sandbox' | 'production';
  connection_status: 'pending' | 'disabled';
  connector_country_code: string | null;
};
type Assignment = { condominium_collection_provider_connections: Connection | null };

const countries: Record<string, string> = {
  AR: 'Argentina',
  AU: 'Australia',
  BR: 'Brasil',
  CA: 'Canadá',
  CL: 'Chile',
  CO: 'Colombia',
  MX: 'México',
  PE: 'Perú',
  US: 'Estados Unidos',
  UY: 'Uruguay',
  VE: 'Venezuela',
};
const capabilityLabels: Record<string, string> = {
  bank_transfer: 'Transferencias',
  card: 'Tarjetas',
  wallet: 'Billetera',
};
const roadmapProviders = [
  { name: 'Mercado', mark: 'M', detail: 'Transferencias locales' },
  { name: 'Mercantil', mark: 'B', detail: 'Pagos y transferencias' },
  { name: 'Pago Móvil', mark: 'PM', detail: 'Pagos móviles locales' },
];
const countryName = (code: string) => countries[code] ?? code;
const providerMark = (name: string) =>
  name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function CollectionConnectorPanel({
  condominiumId,
  session,
}: {
  condominiumId: string;
  session: Session;
}) {
  const roles = useCondominiumRoles();
  // Owners reach this only through condominium_admin membership. Residents and read-only roles never receive controls.
  const canManageConnectors = roles.includes('condominium_admin') || roles.includes('accountant');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selected, setSelected] = useState('');
  const [displayLabel, setDisplayLabel] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const refresh = useCallback(async () => {
    const [nextCatalog, assignments] = await Promise.all([
      apiRequest<CatalogItem[]>(
        `/v1/condominiums/${condominiumId}/collection-connectors/catalog`,
        session,
      ),
      apiRequest<Assignment[]>(`/v1/condominiums/${condominiumId}/collection-connectors`, session),
    ]);
    setCatalog(nextCatalog);
    setConnections(
      assignments.flatMap((item) =>
        item.condominium_collection_provider_connections
          ? [item.condominium_collection_provider_connections]
          : [],
      ),
    );
  }, [condominiumId, session]);

  useEffect(() => {
    if (!canManageConnectors) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    void refresh()
      .catch(() => {
        if (!cancelled)
          setError('No pudimos cargar el catálogo de conectores. Inténtalo de nuevo.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManageConnectors, refresh]);

  const selectProvider = (item: CatalogItem) => {
    setSelected(`${item.provider_key}:${item.country_code}`);
    setDisplayLabel(`${item.display_name} · ${countryName(item.country_code)}`);
    setError('');
    setConfirmation('');
  };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const item = catalog.find(
      (candidate) => `${candidate.provider_key}:${candidate.country_code}` === selected,
    );
    if (!item) {
      setError('Selecciona un proveedor planificado para continuar.');
      return;
    }
    const label = displayLabel.trim();
    if (!label) {
      setError('Escribe una etiqueta para identificar esta preparación.');
      return;
    }
    setBusy(true);
    setError('');
    setConfirmation('');
    try {
      await apiRequest(`/v1/condominiums/${condominiumId}/collection-connectors`, session, {
        method: 'POST',
        body: JSON.stringify({
          providerKey: item.provider_key,
          countryCode: item.country_code,
          displayLabel: label,
          environment,
          condominiumIds: [condominiumId],
        }),
      });
      await refresh();
      setConfirmation('Preparación registrada como pendiente. No procesa pagos ni cambia saldos.');
      setSelected('');
      setDisplayLabel('');
      setEnvironment('sandbox');
    } catch {
      setError('No tienes autorización para registrar este conector pendiente.');
    } finally {
      setBusy(false);
    }
  };
  const disable = async (id: string, label: string) => {
    setBusy(true);
    setError('');
    setConfirmation('');
    try {
      await apiRequest(
        `/v1/condominiums/${condominiumId}/collection-connectors/${id}/disable`,
        session,
        { method: 'POST' },
      );
      await refresh();
      setConfirmation(
        `${label} se deshabilitó. No se eliminaron pagos ni movimientos porque no existen.`,
      );
    } catch {
      setError('No tienes autorización para deshabilitar este conector.');
    } finally {
      setBusy(false);
    }
  };
  if (!canManageConnectors) return null;
  const selectedItem = catalog.find(
    (item) => `${item.provider_key}:${item.country_code}` === selected,
  );

  return (
    <section
      aria-labelledby="collection-connectors-title"
      className="settings-connector-section"
      id="conectores-cobranza"
    >
      <header className="settings-connector-header">
        <div>
          <span className="settings-kicker">Cobranza del condominio</span>
          <h2 id="collection-connectors-title">Conectores de pago</h2>
          <p>Prepara opciones de cobro para revisión futura, sin activar procesamiento.</p>
        </div>
        <Badge tone="warning">Planificado · no operativo</Badge>
      </header>
      <div className="settings-connector-safety" role="note">
        <span aria-hidden="true" className="settings-connector-safety__icon">
          !
        </span>
        <p>
          No se solicitan credenciales, no se reciben webhooks y ninguna acción aquí modifica
          cuotas, pagos, recibos, saldos ni el libro mayor.
        </p>
      </div>
      {loading ? (
        <Surface aria-busy="true" className="settings-connector-loading">
          Cargando catálogo y preparaciones…
        </Surface>
      ) : null}
      {error ? (
        <div className="settings-inline-alert" role="alert">
          {error}
        </div>
      ) : null}
      {confirmation ? (
        <div className="settings-connector-confirmation" role="status">
          {confirmation}
        </div>
      ) : null}
      {!loading ? (
        <>
          <Surface className="settings-connector-catalog">
            <div className="settings-connector-section-heading">
              <div>
                <span>01 · Catálogo disponible</span>
                <h3>Elige un proveedor para preparar</h3>
              </div>
              <small>Todos están pendientes de adaptación aprobada.</small>
            </div>
            {catalog.length ? (
              <div aria-label="Proveedores disponibles" className="settings-connector-grid">
                {catalog.map((item) => {
                  const key = `${item.provider_key}:${item.country_code}`;
                  const isSelected = key === selected;
                  return (
                    <button
                      aria-pressed={isSelected}
                      className="settings-provider-card"
                      data-selected={isSelected || undefined}
                      key={key}
                      onClick={() => selectProvider(item)}
                      type="button"
                    >
                      <span aria-hidden="true" className="settings-provider-card__mark">
                        {providerMark(item.display_name)}
                      </span>
                      <span className="settings-provider-card__body">
                        <strong>{item.display_name}</strong>
                        <small>
                          {countryName(item.country_code)} · {item.country_code}
                        </small>
                        <span className="settings-provider-card__capabilities">
                          {item.capabilities.map((capability) => (
                            <em key={capability}>{capabilityLabels[capability] ?? capability}</em>
                          ))}
                        </span>
                      </span>
                      <Badge tone="warning">Pendiente</Badge>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="settings-connector-empty" role="status">
                <strong>El catálogo no tiene proveedores disponibles todavía.</strong>
                <span>Cuando se revise una opción oficial, aparecerá aquí como planificada.</span>
              </div>
            )}
          </Surface>
          <Surface className="settings-connector-setup">
            <div className="settings-connector-section-heading">
              <div>
                <span>02 · Preparación</span>
                <h3>Registra una intención no operativa</h3>
              </div>
              {selectedItem ? (
                <small>
                  {selectedItem.display_name} · {countryName(selectedItem.country_code)}
                </small>
              ) : null}
            </div>
            <form
              className="settings-connector-form ux-form"
              onSubmit={(event) => void create(event)}
            >
              <Field
                hint="Solo se usa para reconocer la preparación dentro de Habitta."
                label="Etiqueta de la conexión"
                required
              >
                <input
                  className="input"
                  disabled={busy || !selectedItem}
                  maxLength={120}
                  onChange={(event) => setDisplayLabel(event.target.value)}
                  placeholder="Ej. Cobranza administración"
                  value={displayLabel}
                />
              </Field>
              <fieldset className="settings-connector-environment" disabled={busy || !selectedItem}>
                <legend>Entorno</legend>
                <label data-selected={environment === 'sandbox'}>
                  <input
                    checked={environment === 'sandbox'}
                    name="connector-environment"
                    onChange={() => setEnvironment('sandbox')}
                    type="radio"
                    value="sandbox"
                  />
                  <span>
                    <strong>Sandbox</strong>
                    <small>Predeterminado · sin procesamiento</small>
                  </span>
                </label>
                <label data-selected={environment === 'production'}>
                  <input
                    checked={environment === 'production'}
                    name="connector-environment"
                    onChange={() => setEnvironment('production')}
                    type="radio"
                    value="production"
                  />
                  <span>
                    <strong>Producción</strong>
                    <small>Solo etiqueta; sigue no operativa</small>
                  </span>
                </label>
              </fieldset>
              <div className="settings-connector-form__footer">
                <small>
                  La preparación queda en estado pendiente y puede deshabilitarse después.
                </small>
                <Button aria-busy={busy} disabled={busy || !selectedItem} type="submit">
                  {busy ? 'Registrando…' : 'Registrar preparación'}
                </Button>
              </div>
            </form>
          </Surface>
          <aside aria-labelledby="connector-roadmap-title" className="settings-connector-roadmap">
            <div>
              <span>Venezuela · ROADMAP</span>
              <h3 id="connector-roadmap-title">Integraciones locales en evaluación</h3>
              <p>No son parte del catálogo aprobado y no se pueden seleccionar ni preparar.</p>
            </div>
            <div className="settings-connector-roadmap__cards">
              {roadmapProviders.map((provider) => (
                <div aria-disabled="true" className="settings-roadmap-card" key={provider.name}>
                  <span aria-hidden="true" className="settings-provider-card__mark">
                    {provider.mark}
                  </span>
                  <span>
                    <strong>{provider.name}</strong>
                    <small>{provider.detail}</small>
                  </span>
                  <Badge tone="neutral">ROADMAP</Badge>
                </div>
              ))}
            </div>
          </aside>
          <div className="settings-connector-connections">
            <div className="settings-connector-section-heading">
              <div>
                <span>Preparaciones registradas</span>
                <h3>Administrar conexiones</h3>
              </div>
              <small>
                {connections.length} {connections.length === 1 ? 'registro' : 'registros'}
              </small>
            </div>
            {connections.length ? (
              <div className="settings-connector-connection-grid">
                {connections.map((connection) => (
                  <Surface className="settings-connection-card" key={connection.id}>
                    <div className="settings-connection-card__main">
                      <span aria-hidden="true" className="settings-provider-card__mark">
                        {providerMark(connection.provider_key)}
                      </span>
                      <div>
                        <strong>{connection.display_label}</strong>
                        <small>
                          {countryName(connection.connector_country_code ?? '')} ·{' '}
                          {connection.environment === 'sandbox' ? 'Sandbox' : 'Producción'}
                        </small>
                      </div>
                    </div>
                    <Badge
                      tone={connection.connection_status === 'disabled' ? 'neutral' : 'warning'}
                    >
                      {connection.connection_status === 'disabled'
                        ? 'Deshabilitado'
                        : 'Pendiente · no operativo'}
                    </Badge>
                    {connection.connection_status === 'pending' ? (
                      <Button
                        disabled={busy}
                        onClick={() => void disable(connection.id, connection.display_label)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {busy ? 'Deshabilitando…' : 'Deshabilitar'}
                      </Button>
                    ) : (
                      <span className="settings-connection-card__disabled">
                        Sin acciones disponibles
                      </span>
                    )}
                  </Surface>
                ))}
              </div>
            ) : (
              <Surface className="settings-connector-empty">
                <strong>Aún no hay preparaciones registradas.</strong>
                <span>Selecciona un proveedor planificado arriba para crear la primera.</span>
              </Surface>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

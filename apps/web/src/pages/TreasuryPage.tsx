import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CheckCircleIcon, ExpensesIcon, PaymentsIcon, ReportsIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, EmptyState, Skeleton, Surface } from '../components/ui';
import {
  closeTreasuryReconciliation,
  createTreasuryAccount,
  createTreasuryReconciliation,
  createTreasuryTransfer,
  loadTreasuryWorkspace,
  recordTreasuryMovement,
} from '../features/treasury/api';
import {
  AccountDrawer,
  MovementDrawer,
  ReconciliationDrawer,
  TransferDrawer,
  type TreasuryDrawer,
} from '../features/treasury/TreasuryDrawers';
import {
  accountTypeLabels,
  balancesByCurrency,
  formatTreasuryAmount,
  formatTreasuryDate,
  movementKindLabels,
  type TreasuryAccount,
  type TreasuryMovement,
  type TreasuryReconciliation,
  type TreasuryTransfer,
} from '../features/treasury/types';
import { canManage, useCondominiumRoles } from '../lib/roles';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type WorkspaceData = {
  accounts: TreasuryAccount[];
  movements: TreasuryMovement[];
  transfers: TreasuryTransfer[];
  reconciliations: TreasuryReconciliation[];
};

const emptyData: WorkspaceData = {
  accounts: [],
  movements: [],
  transfers: [],
  reconciliations: [],
};

function TreasuryLoading() {
  return (
    <div aria-label="Cargando tesorería" className="treasury-page">
      <PageHeader eyebrow="Bancos y caja" title="Tesorería" />
      <div className="treasury-metrics-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
      <Skeleton className="treasury-table-skeleton" />
    </div>
  );
}

export function TreasuryPage({ condominiumId, condominiumName, session }: Props) {
  const roles = useCondominiumRoles();
  const manage = canManage(roles);
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [drawer, setDrawer] = useState<TreasuryDrawer>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await loadTreasuryWorkspace(condominiumId, session));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo cargar la tesorería.',
      );
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => balancesByCurrency(data.accounts), [data.accounts]);
  const accountsById = useMemo(
    () => new Map(data.accounts.map((account) => [account.id, account])),
    [data.accounts],
  );
  const openReconciliations = data.reconciliations.filter((item) => item.status === 'draft');

  const afterWrite = async (text: string) => {
    setDrawer(null);
    setMessage(text);
    await load();
  };

  if (loading && !data.accounts.length && !error) return <TreasuryLoading />;

  return (
    <div className="treasury-page">
      <PageHeader
        actions={
          manage ? (
            <>
              <Button onClick={() => setDrawer('account')} size="sm" variant="secondary">
                Nueva cuenta
              </Button>
              <Button
                disabled={data.accounts.length < 2}
                onClick={() => setDrawer('transfer')}
                size="sm"
                variant="secondary"
              >
                Transferencia
              </Button>
              <Button
                disabled={!data.accounts.length}
                onClick={() => setDrawer('movement')}
                size="sm"
              >
                Registrar movimiento
              </Button>
            </>
          ) : null
        }
        description={`${condominiumName} · bancos, caja y conciliación, con saldos derivados de movimientos inmutables.`}
        eyebrow="Bancos y caja"
        title="Tesorería"
      />

      {error ? (
        <div className="treasury-inline-alert" role="status">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="treasury-success-alert" role="status">
          <CheckCircleIcon size={17} /> {message}
        </div>
      ) : null}

      <section aria-label="Saldos por moneda" className="treasury-metrics-grid">
        {totals.length ? (
          totals.map((total) => (
            <Surface className="treasury-metric" key={total.currencyCode}>
              <div className="treasury-metric__top">
                <span>
                  <PaymentsIcon size={20} />
                </span>
                <small>Disponible en {total.currencyCode}</small>
              </div>
              <strong>{formatTreasuryAmount(total.total, total.currencyCode)}</strong>
              <p>Suma de las cuentas activas. Las monedas nunca se mezclan.</p>
            </Surface>
          ))
        ) : (
          <Surface className="treasury-metric">
            <div className="treasury-metric__top">
              <span>
                <PaymentsIcon size={20} />
              </span>
              <small>Sin cuentas activas</small>
            </div>
            <strong>—</strong>
            <p>Crea una cuenta para empezar a registrar movimientos.</p>
          </Surface>
        )}
        <Surface className="treasury-metric">
          <div className="treasury-metric__top">
            <span>
              <ReportsIcon size={20} />
            </span>
            <small>Conciliaciones abiertas</small>
          </div>
          <strong>{openReconciliations.length}</strong>
          <p>Períodos en borrador pendientes de cierre.</p>
        </Surface>
      </section>

      <section className="treasury-grid">
        <Surface className="treasury-panel">
          <div className="treasury-section-heading">
            <div>
              <span className="treasury-kicker">Cuentas</span>
              <h2>Bancos y caja</h2>
            </div>
          </div>
          {data.accounts.length ? (
            <div className="treasury-table-scroll">
              <table className="treasury-table">
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>Tipo</th>
                    <th>Último movimiento</th>
                    <th className="treasury-table__amount">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <strong>{account.name}</strong>
                        {account.bank_name ? <small>{account.bank_name}</small> : null}
                      </td>
                      <td>
                        <Badge tone={account.account_type === 'bank' ? 'info' : 'neutral'}>
                          {accountTypeLabels[account.account_type]}
                        </Badge>
                      </td>
                      <td>{formatTreasuryDate(account.latest_movement_at)}</td>
                      <td className="treasury-table__amount">
                        {formatTreasuryAmount(account.balance, account.currency_code)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              description="Registra la primera cuenta bancaria o de caja del condominio."
              icon={<PaymentsIcon size={28} />}
              title="Todavía no hay cuentas"
              {...(manage
                ? { actionLabel: 'Nueva cuenta', onAction: () => setDrawer('account') }
                : {})}
            />
          )}
        </Surface>

        <Surface className="treasury-panel">
          <div className="treasury-section-heading">
            <div>
              <span className="treasury-kicker">Conciliación</span>
              <h2>Períodos</h2>
            </div>
            {manage ? (
              <Button
                disabled={!data.accounts.length}
                onClick={() => setDrawer('reconciliation')}
                size="sm"
                variant="secondary"
              >
                Nueva conciliación
              </Button>
            ) : null}
          </div>
          {data.reconciliations.length ? (
            <ul className="treasury-reconciliation-list">
              {data.reconciliations.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{accountsById.get(item.account_id)?.name ?? 'Cuenta'}</strong>
                    <small>
                      {formatTreasuryDate(item.period_start)} —{' '}
                      {formatTreasuryDate(item.period_end)}
                      {item.difference !== null
                        ? ` · diferencia ${formatTreasuryAmount(
                            item.difference,
                            accountsById.get(item.account_id)?.currency_code ?? '',
                          )}`
                        : ''}
                    </small>
                  </div>
                  <div className="treasury-reconciliation-list__actions">
                    <Badge tone={item.status === 'closed' ? 'success' : 'warning'}>
                      {item.status === 'closed' ? 'Cerrada' : 'Borrador'}
                    </Badge>
                    {manage && item.status === 'draft' ? (
                      <Button
                        onClick={() =>
                          void closeTreasuryReconciliation(condominiumId, session, item.id)
                            .then(() => afterWrite('Conciliación cerrada.'))
                            .catch((closeError: unknown) =>
                              setError(
                                closeError instanceof Error
                                  ? closeError.message
                                  : 'No se pudo cerrar la conciliación.',
                              ),
                            )
                        }
                        size="sm"
                        variant="ghost"
                      >
                        Cerrar
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              description="Compara el estado de cuenta del banco con los movimientos registrados."
              icon={<ReportsIcon size={28} />}
              title="Sin conciliaciones"
            />
          )}
        </Surface>
      </section>

      <Surface className="treasury-panel">
        <div className="treasury-section-heading">
          <div>
            <span className="treasury-kicker">Libro</span>
            <h2>Movimientos recientes</h2>
            <p>Los saldos se derivan de estas filas; ninguna se modifica ni se elimina.</p>
          </div>
        </div>
        {data.movements.length ? (
          <div className="treasury-table-scroll">
            <table className="treasury-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cuenta</th>
                  <th>Concepto</th>
                  <th>Descripción</th>
                  <th className="treasury-table__amount">Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatTreasuryDate(movement.occurred_on)}</td>
                    <td>{accountsById.get(movement.account_id)?.name ?? '—'}</td>
                    <td>
                      <Badge tone={movement.direction === 'credit' ? 'success' : 'warning'}>
                        {movementKindLabels[movement.movement_kind]}
                      </Badge>
                    </td>
                    <td>{movement.description}</td>
                    <td className="treasury-table__amount" data-direction={movement.direction}>
                      {movement.direction === 'debit' ? '−' : '+'}
                      {formatTreasuryAmount(movement.amount, movement.currency_code)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            description="Los depósitos, retiros y transferencias aparecerán aquí."
            icon={<ExpensesIcon size={28} />}
            title="Sin movimientos"
          />
        )}
      </Surface>

      {drawer === 'account' ? (
        <AccountDrawer
          onClose={() => setDrawer(null)}
          onSubmit={async (input) => {
            await createTreasuryAccount(condominiumId, session, input);
            await afterWrite('Cuenta creada.');
          }}
        />
      ) : null}
      {drawer === 'movement' ? (
        <MovementDrawer
          accounts={data.accounts}
          onClose={() => setDrawer(null)}
          onSubmit={async (input) => {
            await recordTreasuryMovement(condominiumId, session, input);
            await afterWrite('Movimiento registrado.');
          }}
        />
      ) : null}
      {drawer === 'transfer' ? (
        <TransferDrawer
          accounts={data.accounts}
          onClose={() => setDrawer(null)}
          onSubmit={async (input) => {
            await createTreasuryTransfer(condominiumId, session, input);
            await afterWrite('Transferencia registrada.');
          }}
        />
      ) : null}
      {drawer === 'reconciliation' ? (
        <ReconciliationDrawer
          accounts={data.accounts}
          onClose={() => setDrawer(null)}
          onSubmit={async (input) => {
            await createTreasuryReconciliation(condominiumId, session, input);
            await afterWrite('Conciliación creada.');
          }}
        />
      ) : null}
    </div>
  );
}

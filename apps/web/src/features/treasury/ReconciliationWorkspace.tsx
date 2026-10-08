import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ConfirmDialog } from '../../components/Dialog';
import { ReportsIcon } from '../../components/icons';
import { Badge, Button, EmptyState, Skeleton, Surface } from '../../components/ui';
import {
  closeTreasuryReconciliation,
  loadTreasuryReconciliationWorkspace,
  matchTreasuryMovement,
} from './api';
import {
  formatTreasuryAmount,
  formatTreasuryDate,
  movementKindLabels,
  type TreasuryAccount,
  type TreasuryReconciliation,
  type TreasuryReconciliationWorkspace,
} from './types';

const emptyWorkspace: TreasuryReconciliationWorkspace = {
  total_count: 0,
  matched_count: 0,
  matched_amount: '0',
  book_closing_balance: '0',
  difference: '0',
  items: [],
};

export function ReconciliationWorkspace({
  account,
  condominiumId,
  onClosed,
  reconciliation,
  session,
  canManage,
}: {
  account?: TreasuryAccount | undefined;
  condominiumId: string;
  onClosed: (closed: TreasuryReconciliation) => Promise<void>;
  reconciliation: TreasuryReconciliation;
  session: Session;
  canManage: boolean;
}) {
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [matching, setMatching] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const currency = account?.currency_code ?? '';
  const load = useCallback(
    async (offset = 0) => {
      setLoading(true);
      setError('');
      try {
        const page = await loadTreasuryReconciliationWorkspace(
          condominiumId,
          session,
          reconciliation.id,
          offset,
        );
        setWorkspace((previous) => ({
          ...page,
          items: offset === 0 ? page.items : [...previous.items, ...page.items],
        }));
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudo cargar la conciliación.',
        );
      } finally {
        setLoading(false);
      }
    },
    [condominiumId, reconciliation.id, session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const displayBookBalance =
    reconciliation.status === 'closed'
      ? reconciliation.book_closing_balance
      : workspace.book_closing_balance;
  const displayDifference =
    reconciliation.status === 'closed' ? reconciliation.difference : workspace.difference;
  const differenceIsZero = Number(displayDifference) === 0;

  return (
    <Surface className="treasury-panel treasury-reconciliation-workspace">
      <div className="treasury-section-heading">
        <div>
          <span className="treasury-kicker">Conciliación</span>
          <h2>{account?.name ?? 'Cuenta retirada'}</h2>
          <p>
            {formatTreasuryDate(reconciliation.period_start)} —{' '}
            {formatTreasuryDate(reconciliation.period_end)} · {currency}
          </p>
        </div>
        <Badge tone={reconciliation.status === 'closed' ? 'success' : 'warning'}>
          {reconciliation.status === 'closed' ? 'Cerrada' : 'Borrador'}
        </Badge>
      </div>

      <dl className="treasury-reconciliation-summary">
        <div>
          <dt>Estado externo inicial</dt>
          <dd>{formatTreasuryAmount(reconciliation.statement_opening_balance, currency)}</dd>
        </div>
        <div>
          <dt>Estado externo final</dt>
          <dd>{formatTreasuryAmount(reconciliation.statement_closing_balance, currency)}</dd>
        </div>
        <div>
          <dt>Saldo del libro</dt>
          <dd>
            {displayBookBalance === null ? '—' : formatTreasuryAmount(displayBookBalance, currency)}
          </dd>
        </div>
        <div>
          <dt>{differenceIsZero ? 'Sin diferencia' : 'Diferencia informativa'}</dt>
          <dd data-difference={differenceIsZero ? 'zero' : 'nonzero'}>
            {displayDifference === null ? '—' : formatTreasuryAmount(displayDifference, currency)}
          </dd>
        </div>
      </dl>
      {reconciliation.notes ? (
        <p className="treasury-form__note">Notas: {reconciliation.notes}</p>
      ) : null}
      {reconciliation.status === 'draft' ? (
        <p className="treasury-workspace-progress">
          {workspace.matched_count} de {workspace.total_count} movimientos marcados · total marcado{' '}
          {formatTreasuryAmount(workspace.matched_amount, currency)}. El saldo del libro y la
          diferencia son una vista previa del cálculo de cierre.
        </p>
      ) : null}
      {error ? (
        <p className="treasury-inline-alert" role="alert">
          {error}
        </p>
      ) : null}

      <h3>Movimientos del período</h3>
      {loading && !workspace.items.length ? (
        <Skeleton className="treasury-table-skeleton" />
      ) : workspace.items.length ? (
        <div className="treasury-table-scroll">
          <table className="treasury-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Tipo</th>
                <th className="treasury-table__amount">Monto</th>
                <th>Conciliación</th>
              </tr>
            </thead>
            <tbody>
              {workspace.items.map((movement) => (
                <tr key={movement.id}>
                  <td>{formatTreasuryDate(movement.occurred_on)}</td>
                  <td>
                    <strong>{movement.description}</strong>
                    {movement.reference ? <small>{movement.reference}</small> : null}
                  </td>
                  <td>
                    <Badge tone={movement.direction === 'credit' ? 'success' : 'warning'}>
                      {movementKindLabels[movement.movement_kind]}
                    </Badge>
                  </td>
                  <td className="treasury-table__amount" data-direction={movement.direction}>
                    {movement.direction === 'debit' ? '−' : '+'}
                    {formatTreasuryAmount(movement.amount, movement.currency_code)}
                  </td>
                  <td>
                    {movement.matched_in_reconciliation ? (
                      <Badge tone="success">Conciliado</Badge>
                    ) : movement.matched_reconciliation_id ? (
                      <Badge tone="neutral">Conciliado en otro período</Badge>
                    ) : reconciliation.status === 'draft' && canManage ? (
                      <Button
                        disabled={matching === movement.id}
                        onClick={async () => {
                          setMatching(movement.id);
                          setError('');
                          try {
                            await matchTreasuryMovement(
                              condominiumId,
                              session,
                              reconciliation.id,
                              movement.id,
                            );
                            await load();
                          } catch (requestError) {
                            setError(
                              requestError instanceof Error
                                ? requestError.message
                                : 'No se pudo marcar el movimiento.',
                            );
                          } finally {
                            setMatching('');
                          }
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        {matching === movement.id ? 'Marcando…' : 'Marcar conciliado'}
                      </Button>
                    ) : (
                      <span>Sin conciliar</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          description="No hay movimientos de esta cuenta en el período seleccionado."
          icon={<ReportsIcon size={28} />}
          title="Sin movimientos elegibles"
        />
      )}
      {workspace.items.length < workspace.total_count ? (
        <Button
          disabled={loading}
          onClick={() => void load(workspace.items.length)}
          size="sm"
          variant="secondary"
        >
          {loading ? 'Cargando…' : `Cargar más (${workspace.total_count - workspace.items.length})`}
        </Button>
      ) : null}
      {reconciliation.status === 'draft' && canManage ? (
        <div className="treasury-workspace-actions">
          <p>
            Marcar un movimiento es permanente: el historial de conciliación no se puede deshacer.
          </p>
          <Button onClick={() => setConfirmClose(true)}>Cerrar conciliación</Button>
        </div>
      ) : null}
      {confirmClose ? (
        <ConfirmDialog
          busy={closing}
          busyLabel="Cerrando…"
          confirmLabel="Cerrar definitivamente"
          description={`Cerrarás ${account?.name ?? 'esta cuenta'} (${formatTreasuryDate(reconciliation.period_start)} — ${formatTreasuryDate(reconciliation.period_end)}). Estado externo final: ${formatTreasuryAmount(reconciliation.statement_closing_balance, currency)}. Libro: ${formatTreasuryAmount(workspace.book_closing_balance, currency)}. Diferencia: ${formatTreasuryAmount(workspace.difference, currency)}. Esta conciliación no podrá editarse ni reabrirse.`}
          onCancel={() => setConfirmClose(false)}
          onConfirm={async () => {
            setClosing(true);
            setError('');
            try {
              const closed = await closeTreasuryReconciliation(
                condominiumId,
                session,
                reconciliation.id,
              );
              setConfirmClose(false);
              await onClosed(closed);
            } catch (requestError) {
              setError(
                requestError instanceof Error
                  ? requestError.message
                  : 'No se pudo cerrar la conciliación.',
              );
            } finally {
              setClosing(false);
            }
          }}
          title="Cerrar conciliación definitivamente"
        />
      ) : null}
    </Surface>
  );
}

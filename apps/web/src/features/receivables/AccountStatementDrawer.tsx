import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Drawer } from '../../components/Drawer';
import { CheckCircleIcon, ReportsIcon } from '../../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import { csvFileName, downloadCsv, toCsv } from '../../lib/csv-export';
import { formatDashboardAmount, formatDashboardDate } from '../../lib/dashboard';
import type { ReceivableUnit } from '../../lib/receivables';
import { canManage, useCondominiumRoles } from '../../lib/roles';

type Amount = string | number;

type Balance = {
  currency_code: string;
  amount: Amount;
};

type OwnerSnapshot = {
  person_id: string;
  name: string;
  document_type?: string | null;
  document_number?: string | null;
  ownership_percentage?: Amount | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

type StatementMovement = {
  ledger_entry_id: string;
  effective_date: string;
  description: string;
  entry_type: string;
  debit: Amount | null;
  credit: Amount | null;
  running_balance: Amount;
  currency_code: string;
  receivable_item_id?: string | null;
  payment_id?: string | null;
  payment_allocation_id?: string | null;
};

type AccountStatement = {
  account: {
    condominium_id: string;
    condominium_name: string;
    unit_id: string;
    unit_code: string;
  };
  period: { from: string | null; to: string };
  owners: OwnerSnapshot[];
  opening_balances: Balance[];
  movements: StatementMovement[];
  closing_balances: Balance[];
};

type SolvencyEvaluation = {
  eligible: boolean;
  as_of_date: string;
  balances: Balance[];
  policy: {
    balance_basis: 'outstanding' | 'overdue';
    grace_days: number;
    tolerance_per_currency: Amount;
    certificate_validity_days: number;
  };
};

type SolvencyCertificate = {
  id: string;
  verification_id: string;
  unit_id: string;
  as_of_date: string;
  valid_until: string;
  criteria_snapshot: Record<string, unknown>;
  balance_snapshot: Balance[];
  owner_snapshot: OwnerSnapshot[];
  issued_at: string;
};

type Props = {
  condominiumId: string;
  session: Session;
  units: ReceivableUnit[];
  onClose: () => void;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

function statementCsv(statement: AccountStatement) {
  return toCsv(
    ['Fecha', 'Descripción', 'Tipo', 'Débito', 'Crédito', 'Saldo', 'Moneda'],
    statement.movements.map((movement) => [
      movement.effective_date,
      movement.description,
      movement.entry_type,
      movement.debit ?? '',
      movement.credit ?? '',
      movement.running_balance,
      movement.currency_code,
    ]),
  );
}

function BalanceCards({ title, balances }: { title: string; balances: Balance[] }) {
  if (!balances.length) return null;
  return (
    <section className="account-statement-balance-section">
      <div className="account-statement-section-heading">
        <strong>{title}</strong>
        <span>Cada moneda se mantiene separada.</span>
      </div>
      <div className="account-statement-balance-grid">
        {balances.map((balance) => (
          <article key={balance.currency_code}>
            <span>{balance.currency_code}</span>
            <strong>{formatDashboardAmount(balance.amount, balance.currency_code)}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AccountStatementDrawer({ condominiumId, session, units, onClose }: Props) {
  const roles = useCondominiumRoles();
  const manage = canManage(roles);
  const activeUnits = units.filter((unit) => unit.status !== 'inactive');
  const [unitId, setUnitId] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState(todayIso());
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [solvency, setSolvency] = useState<SolvencyEvaluation | null>(null);
  const [certificates, setCertificates] = useState<SolvencyCertificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState('');

  const selectedUnit = useMemo(() => units.find((unit) => unit.id === unitId), [unitId, units]);
  const latestCertificate = certificates[0] ?? null;

  const load = async (nextUnitId = unitId) => {
    if (!nextUnitId) {
      setStatement(null);
      setSolvency(null);
      setCertificates([]);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const query = new URLSearchParams();
      if (periodFrom) query.set('from', periodFrom);
      if (periodTo) query.set('to', periodTo);
      const statementPath = `/v1/condominiums/${condominiumId}/units/${nextUnitId}/account-statement${query.size ? `?${query}` : ''}`;
      const solvencyPath = `/v1/condominiums/${condominiumId}/units/${nextUnitId}/solvency?asOf=${periodTo || todayIso()}`;
      const certificatesPath = `/v1/condominiums/${condominiumId}/units/${nextUnitId}/solvency-certificates`;
      const [nextStatement, nextSolvency, nextCertificates] = await Promise.all([
        apiRequest<AccountStatement>(statementPath, session),
        apiRequest<SolvencyEvaluation>(solvencyPath, session),
        apiRequest<SolvencyCertificate[]>(certificatesPath, session),
      ]);
      setStatement(nextStatement);
      setSolvency(nextSolvency);
      setCertificates(nextCertificates);
    } catch (requestError) {
      setStatement(null);
      setSolvency(null);
      setCertificates([]);
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar el estado de cuenta.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setStatement(null);
    setSolvency(null);
    setCertificates([]);
    setMessage('');
  }, [condominiumId]);

  const issueCertificate = async () => {
    if (!unitId || !solvency?.eligible) return;
    setIssuing(true);
    setMessage('');
    try {
      const certificate = await apiRequest<SolvencyCertificate>(
        `/v1/condominiums/${condominiumId}/units/${unitId}/solvency-certificates`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ asOf: periodTo || todayIso() }),
        },
      );
      setCertificates((current) => [certificate, ...current]);
      setMessage('Solvencia emitida. El criterio y los saldos quedaron congelados en el certificado.');
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : 'No se pudo emitir la solvencia.',
      );
    } finally {
      setIssuing(false);
    }
  };

  return (
    <Drawer eyebrow="Cuenta financiera de la unidad" onClose={onClose} prefix="receivables" title="Estado de cuenta y solvencia" wide>
      <div className="account-statement-drawer">
        {message ? <div className="receivables-action-feedback" role="status">{message}</div> : null}

        <div className="account-statement-filters">
          <Field label="Unidad">
            <Select
              onChange={(event) => {
                const next = event.target.value;
                setUnitId(next);
                void load(next);
              }}
              value={unitId}
            >
              <option value="">Selecciona una unidad</option>
              {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}
            </Select>
          </Field>
          <Field label="Desde" hint="Opcional; permite calcular el saldo inicial del período.">
            <input max={periodTo} onChange={(event) => setPeriodFrom(event.target.value)} type="date" value={periodFrom} />
          </Field>
          <Field label="Hasta">
            <input min={periodFrom || undefined} onChange={(event) => setPeriodTo(event.target.value)} type="date" value={periodTo} />
          </Field>
          <Button disabled={!unitId || loading} onClick={() => void load()} variant="secondary">
            {loading ? 'Actualizando…' : 'Aplicar período'}
          </Button>
        </div>

        {loading ? <Skeleton className="receivables-statement-skeleton" /> : null}

        {!loading && unitId && statement ? (
          <>
            <section className="account-statement-identity">
              <div>
                <span>Cuenta de la unidad</span>
                <strong>{statement.account.unit_code}</strong>
                <small>{statement.account.condominium_name}</small>
              </div>
              <div className="account-statement-actions">
                <Button
                  onClick={() => downloadCsv(csvFileName('estado-de-cuenta', statement.account.unit_code), statementCsv(statement))}
                  size="sm"
                  variant="secondary"
                >
                  Descargar CSV
                </Button>
                <Button onClick={() => window.print()} size="sm" variant="secondary">
                  Imprimir / guardar PDF
                </Button>
              </div>
            </section>

            {statement.owners.length ? (
              <section className="account-statement-owners">
                <div className="account-statement-section-heading">
                  <strong>Propietarios del período</strong>
                  <span>La identidad cambia; la cuenta y su historial permanecen en la unidad.</span>
                </div>
                <div>
                  {statement.owners.map((owner) => (
                    <article key={`${owner.person_id}-${owner.starts_at ?? ''}`}>
                      <div><strong>{owner.name}</strong><span>{owner.document_type ?? ''} {owner.document_number ?? ''}</span></div>
                      {owner.ownership_percentage != null ? <Badge tone="info">{owner.ownership_percentage}%</Badge> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <BalanceCards balances={statement.opening_balances} title="Saldo inicial" />
            <BalanceCards balances={statement.closing_balances} title="Saldo al cierre" />

            <section className="account-statement-solvency" data-eligible={solvency?.eligible || undefined}>
              <div className="account-statement-solvency__icon"><CheckCircleIcon size={22} /></div>
              <div>
                <span>Solvencia al {solvency ? formatDashboardDate(solvency.as_of_date) : '—'}</span>
                <strong>{solvency?.eligible ? 'Unidad solvente' : 'Unidad no solvente'}</strong>
                <p>
                  {solvency?.policy.balance_basis === 'overdue'
                    ? `Criterio: deuda vencida, ${solvency.policy.grace_days} días de gracia.`
                    : 'Criterio: saldo pendiente total por moneda.'}
                </p>
              </div>
              {manage && solvency?.eligible ? (
                <Button disabled={issuing} onClick={() => void issueCertificate()} size="sm">
                  {issuing ? 'Emitiendo…' : 'Emitir solvencia'}
                </Button>
              ) : null}
            </section>

            {latestCertificate ? (
              <section className="account-statement-certificate">
                <div><span>Última constancia emitida</span><strong>Verificación {latestCertificate.verification_id}</strong></div>
                <Badge tone="success">Válida hasta {formatDashboardDate(latestCertificate.valid_until)}</Badge>
              </section>
            ) : null}

            {statement.movements.length ? (
              <section className="account-statement-movements">
                <div className="account-statement-section-heading">
                  <strong>Movimientos del libro</strong>
                  <span>{statement.movements.length} movimientos trazables.</span>
                </div>
                <div className="account-statement-movement-list">
                  {statement.movements.map((movement) => (
                    <article key={movement.ledger_entry_id}>
                      <div>
                        <strong>{movement.description}</strong>
                        <span>{formatDashboardDate(movement.effective_date)} · {movement.entry_type}</span>
                      </div>
                      <div>
                        <small>
                          {movement.debit != null
                            ? `Débito ${formatDashboardAmount(movement.debit, movement.currency_code)}`
                            : movement.credit != null
                              ? `Crédito ${formatDashboardAmount(movement.credit, movement.currency_code)}`
                              : 'Sin variación'}
                        </small>
                        <strong>{formatDashboardAmount(movement.running_balance, movement.currency_code)}</strong>
                        <Badge tone="neutral">{movement.currency_code}</Badge>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <EmptyState description="La unidad todavía no tiene movimientos dentro del período seleccionado." icon={<ReportsIcon size={26} />} title="Sin movimientos" />
            )}
          </>
        ) : null}

        {!loading && !unitId ? (
          <EmptyState description="Selecciona una unidad para consultar su cuenta financiera, propietarios del período y elegibilidad de solvencia." icon={<ReportsIcon size={26} />} title="Selecciona una unidad" />
        ) : null}
      </div>
    </Drawer>
  );
}

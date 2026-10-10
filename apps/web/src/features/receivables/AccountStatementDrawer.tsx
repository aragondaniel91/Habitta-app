import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import '../../account-statement.css';
import '../../hab186-financial-integrity.css';
import { Drawer } from '../../components/Drawer';
import { CheckCircleIcon, ReportsIcon } from '../../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton } from '../../components/ui';
import { apiRequest } from '../../lib/api';
import { csvFileName, downloadCsv, toCsv } from '../../lib/csv-export';
import { formatDashboardAmount, formatDashboardDate } from '../../lib/dashboard';
import type { ReceivableUnit } from '../../lib/receivables';
import { canManage, useCondominiumRoles } from '../../lib/roles';
import { unitReferenceLabel } from '../../lib/unit-domain';

type Amount = string | number;

type Balance = {
  currency_code: string;
  amount: Amount;
};

type OwnerSnapshot = {
  person_id: string;
  name: string;
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

type MovementTotals = {
  currency_code: string;
  entries: MovementTotal[];
};

type MovementTotal = {
  key: string;
  label: string;
  amount: number;
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
  buildingNameById: Record<string, string>;
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

function BalanceCards({
  title,
  balances,
  emphasis = 'standard',
}: {
  title: string;
  balances: Balance[];
  emphasis?: 'primary' | 'standard';
}) {
  if (!balances.length) return null;
  return (
    <section className="account-statement-balance-section" data-emphasis={emphasis}>
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

function amountAsNumber(amount: Amount | null) {
  if (amount == null) return 0;
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? parsed : 0;
}

function movementLabel(movement: StatementMovement) {
  switch (movement.entry_type) {
    case 'charge':
      return 'Cargo';
    case 'opening_debit':
      return 'Saldo inicial (débito)';
    case 'opening_credit':
      return 'Saldo inicial (crédito)';
    case 'adjustment_debit':
      return 'Ajuste (débito)';
    case 'adjustment_credit':
      return 'Ajuste (crédito)';
    case 'payment_credit':
      return 'Pago aplicado';
    case 'late_fee_charge':
      return 'Recargo por mora';
    case 'reversal':
      return movement.debit != null ? 'Reversión (débito)' : 'Reversión (crédito)';
    default:
      return movement.entry_type;
  }
}

function movementSummaryCategory(movement: StatementMovement) {
  const direction = movement.debit != null ? 'debit' : 'credit';
  switch (movement.entry_type) {
    case 'charge':
      return { key: 'charge', label: 'Cargos' };
    case 'opening_debit':
    case 'opening_credit':
    case 'adjustment_debit':
    case 'adjustment_credit':
      return { key: movement.entry_type, label: movementLabel(movement) };
    case 'payment_credit':
      return { key: 'payment_credit', label: 'Pagos aplicados' };
    case 'late_fee_charge':
      return { key: 'late_fee_charge', label: 'Recargos por mora' };
    case 'reversal':
      return { key: `reversal_${direction}`, label: movementLabel(movement) };
    default:
      return { key: `${movement.entry_type}_${direction}`, label: movementLabel(movement) };
  }
}

function movementTotals(movements: StatementMovement[]): MovementTotals[] {
  const totalsByCurrency = new Map<string, MovementTotals>();

  for (const movement of movements) {
    const total = totalsByCurrency.get(movement.currency_code) ?? {
      currency_code: movement.currency_code,
      entries: [],
    };
    const category = movementSummaryCategory(movement);
    const entry = total.entries.find((candidate) => candidate.key === category.key);
    const amount = amountAsNumber(movement.debit ?? movement.credit);
    if (entry) entry.amount += amount;
    else total.entries.push({ ...category, amount });
    totalsByCurrency.set(movement.currency_code, total);
  }

  return [...totalsByCurrency.values()].sort((left, right) =>
    left.currency_code.localeCompare(right.currency_code),
  );
}

function PeriodMovementSummary({ movements }: { movements: StatementMovement[] }) {
  const totals = movementTotals(movements);
  if (!totals.length) return null;

  return (
    <section className="account-statement-period-summary">
      <div className="account-statement-section-heading">
        <div>
          <strong>Actividad del período</strong>
          <span>Los movimientos se separan por tipo y moneda, sin conversión.</span>
        </div>
      </div>
      <div className="account-statement-period-summary__grid">
        {totals.map((total) => (
          <article key={total.currency_code}>
            <strong>{total.currency_code}</strong>
            <dl>
              {total.entries.map((entry) => (
                <div key={entry.key}>
                  <dt>{entry.label}</dt>
                  <dd>{formatDashboardAmount(entry.amount, total.currency_code)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AccountStatementDrawer({
  condominiumId,
  session,
  units,
  buildingNameById,
  onClose,
}: Props) {
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
  const selectedUnitLabel = selectedUnit
    ? unitReferenceLabel({
        code: selectedUnit.code,
        buildingName: selectedUnit.building_id
          ? (buildingNameById[selectedUnit.building_id] ?? null)
          : null,
      })
    : null;
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
      setMessage(
        'Solvencia emitida. El criterio y los saldos quedaron congelados en el certificado.',
      );
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : 'No se pudo emitir la solvencia.',
      );
    } finally {
      setIssuing(false);
    }
  };

  return (
    <Drawer
      eyebrow="Cuenta financiera de la unidad"
      onClose={onClose}
      prefix="receivables"
      title="Estado de cuenta y solvencia"
      wide
    >
      <div className="account-statement-drawer">
        {message ? (
          <div className="receivables-action-feedback" role="status">
            {message}
          </div>
        ) : null}

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
              {activeUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unitReferenceLabel({
                    code: unit.code,
                    buildingName: unit.building_id
                      ? (buildingNameById[unit.building_id] ?? null)
                      : null,
                  })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Desde" hint="Opcional; permite calcular el saldo inicial del período.">
            <input
              max={periodTo}
              onChange={(event) => setPeriodFrom(event.target.value)}
              type="date"
              value={periodFrom}
            />
          </Field>
          <Field label="Hasta">
            <input
              min={periodFrom || undefined}
              onChange={(event) => setPeriodTo(event.target.value)}
              type="date"
              value={periodTo}
            />
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
                <strong>{selectedUnitLabel ?? statement.account.unit_code}</strong>
                <small>{statement.account.condominium_name}</small>
              </div>
              <div className="account-statement-actions">
                <Button
                  onClick={() =>
                    downloadCsv(
                      csvFileName('estado-de-cuenta', statement.account.unit_code),
                      statementCsv(statement),
                    )
                  }
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

            <section
              className="account-statement-financial-overview"
              aria-label="Resumen financiero"
            >
              <BalanceCards
                balances={statement.closing_balances}
                emphasis="primary"
                title="Saldo al cierre"
              />
              <BalanceCards balances={statement.opening_balances} title="Saldo inicial" />
              <PeriodMovementSummary movements={statement.movements} />
            </section>

            <section
              className="account-statement-solvency"
              data-eligible={solvency?.eligible || undefined}
            >
              <div className="account-statement-solvency__icon">
                <CheckCircleIcon size={22} />
              </div>
              <div>
                <span>
                  Solvencia al {solvency ? formatDashboardDate(solvency.as_of_date) : '—'}
                </span>
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
                <div>
                  <span>Última constancia emitida</span>
                  <strong>Verificación {latestCertificate.verification_id}</strong>
                </div>
                <Badge tone="success">
                  Válida hasta {formatDashboardDate(latestCertificate.valid_until)}
                </Badge>
              </section>
            ) : null}

            {statement.owners.length ? (
              <section className="account-statement-owners">
                <div className="account-statement-section-heading">
                  <strong>Titularidad registrada</strong>
                  <span>
                    La administración de propiedad se gestiona fuera del estado de cuenta.
                  </span>
                </div>
                <div>
                  {statement.owners.map((owner) => (
                    <article key={`${owner.person_id}-${owner.starts_at ?? ''}`}>
                      <div>
                        <strong>{owner.name}</strong>
                      </div>
                      {owner.ownership_percentage != null ? (
                        <Badge tone="info">{owner.ownership_percentage}%</Badge>
                      ) : null}
                    </article>
                  ))}
                </div>
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
                        <span>
                          {formatDashboardDate(movement.effective_date)} · {movementLabel(movement)}
                        </span>
                      </div>
                      <div>
                        <small>
                          {movement.debit != null
                            ? `Débito ${formatDashboardAmount(movement.debit, movement.currency_code)}`
                            : movement.credit != null
                              ? `Crédito ${formatDashboardAmount(movement.credit, movement.currency_code)}`
                              : 'Sin variación'}
                        </small>
                        <strong>
                          {formatDashboardAmount(movement.running_balance, movement.currency_code)}
                        </strong>
                        <Badge tone="neutral">{movement.currency_code}</Badge>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <EmptyState
                description="La unidad todavía no tiene movimientos dentro del período seleccionado."
                icon={<ReportsIcon size={26} />}
                title="Sin movimientos"
              />
            )}
          </>
        ) : null}

        {!loading && !unitId ? (
          <EmptyState
            description="Selecciona una unidad para consultar su cuenta financiera, propietarios del período y elegibilidad de solvencia."
            icon={<ReportsIcon size={26} />}
            title="Selecciona una unidad"
          />
        ) : null}
      </div>
    </Drawer>
  );
}

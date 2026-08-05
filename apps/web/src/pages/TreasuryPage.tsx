import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../components/ui';
import { ExpensesIcon, PaymentsIcon, ReportsIcon } from '../components/icons';
import {
  closeTreasuryReconciliation,
  createTreasuryAccount,
  createTreasuryReconciliation,
  createTreasuryTransfer,
  listTreasuryAccounts,
  listTreasuryMovements,
  listTreasuryReconciliations,
  recordTreasuryMovement,
  reverseTreasuryMovement,
  type TreasuryAccount,
  type TreasuryMovement,
  type TreasuryReconciliation,
} from '../features/treasury/api';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type Panel = 'account' | 'movement' | 'transfer' | 'reconciliation' | null;
type View = 'accounts' | 'movements' | 'reconciliations';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const numeric = (value: string | number | null) => Number(value ?? 0);
const key = (scope: string) => `treasury-${scope}-${crypto.randomUUID()}`;

const money = (value: string | number | null, currency: string) =>
  new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric(value));

const shortDate = (value: string) =>
  new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`));

const movementLabels: Record<TreasuryMovement['movement_kind'], string> = {
  opening_balance: 'Saldo inicial',
  deposit: 'Depósito',
  withdrawal: 'Retiro',
  fee: 'Comisión',
  adjustment: 'Ajuste',
  transfer_in: 'Transferencia recibida',
  transfer_out: 'Transferencia enviada',
  reversal: 'Reverso',
};

const accountTypeLabel = (value: TreasuryAccount['account_type']) =>
  value === 'bank' ? 'Cuenta bancaria' : 'Caja';

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export function TreasuryPage({ condominiumId, condominiumName, session }: Props) {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [movements, setMovements] = useState<TreasuryMovement[]>([]);
  const [reconciliations, setReconciliations] = useState<TreasuryReconciliation[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [view, setView] = useState<View>('accounts');
  const [panel, setPanel] = useState<Panel>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reverseId, setReverseId] = useState('');
  const [reverseReason, setReverseReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [accountItems, movementItems, reconciliationItems] = await Promise.all([
        listTreasuryAccounts(condominiumId, session),
        listTreasuryMovements(condominiumId, session),
        listTreasuryReconciliations(condominiumId, session),
      ]);
      setAccounts(accountItems);
      setMovements(movementItems);
      setReconciliations(reconciliationItems);
      setSelectedAccountId((current) =>
        accountItems.some((account) => account.id === current)
          ? current
          : (accountItems[0]?.id ?? ''),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar Tesorería.');
    } finally {
      setLoading(false);
    }
  }, [condominiumId, session]);

  useEffect(() => void load(), [load]);

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const totals = useMemo(() => {
    const result = new Map<string, number>();
    for (const account of accounts) {
      result.set(
        account.currency_code,
        (result.get(account.currency_code) ?? 0) + numeric(account.balance),
      );
    }
    return [...result.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [accounts]);

  const visibleMovements = useMemo(
    () =>
      selectedAccountId
        ? movements.filter((movement) => movement.account_id === selectedAccountId)
        : movements,
    [movements, selectedAccountId],
  );

  const visibleReconciliations = useMemo(
    () =>
      selectedAccountId
        ? reconciliations.filter((item) => item.account_id === selectedAccountId)
        : reconciliations,
    [reconciliations, selectedAccountId],
  );

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await operation();
      setMessage(success);
      setPanel(null);
      await load();
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const submitAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const accountType = String(values.get('accountType')) as 'bank' | 'cash';
    const payload: {
      name: string;
      accountType: 'bank' | 'cash';
      currencyCode: string;
      bankName?: string;
      accountReference?: string;
      notes?: string;
    } = {
      name: String(values.get('name')),
      accountType,
      currencyCode: String(values.get('currencyCode')).toUpperCase(),
    };
    const bankName = String(values.get('bankName') ?? '').trim();
    const accountReference = String(values.get('accountReference') ?? '').trim();
    const notes = String(values.get('notes') ?? '').trim();
    if (bankName) payload.bankName = bankName;
    if (accountReference) payload.accountReference = accountReference;
    if (notes) payload.notes = notes;
    void run(
      () => createTreasuryAccount(condominiumId, session, payload),
      'Cuenta de tesorería creada.',
    );
  };

  const submitMovement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const movementKind = String(values.get('movementKind')) as
      'opening_balance' | 'deposit' | 'withdrawal' | 'fee' | 'adjustment';
    const selectedDirection = String(values.get('direction')) as 'credit' | 'debit';
    const direction =
      movementKind === 'deposit'
        ? 'credit'
        : movementKind === 'withdrawal' || movementKind === 'fee'
          ? 'debit'
          : selectedDirection;
    const payload: Parameters<typeof recordTreasuryMovement>[2] = {
      accountId: String(values.get('accountId')),
      direction,
      movementKind,
      amount: String(values.get('amount')),
      occurredOn: String(values.get('occurredOn')),
      description: String(values.get('description')),
      sourceType: movementKind === 'opening_balance' ? 'opening_balance' : 'manual',
      idempotencyKey: key('movement'),
    };
    const reference = String(values.get('reference') ?? '').trim();
    if (reference) payload.reference = reference;
    void run(
      () => recordTreasuryMovement(condominiumId, session, payload),
      'Movimiento registrado.',
    );
  };

  const submitTransfer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const payload: Parameters<typeof createTreasuryTransfer>[2] = {
      fromAccountId: String(values.get('fromAccountId')),
      toAccountId: String(values.get('toAccountId')),
      amount: String(values.get('amount')),
      occurredOn: String(values.get('occurredOn')),
      description: String(values.get('description')),
      idempotencyKey: key('transfer'),
    };
    const reference = String(values.get('reference') ?? '').trim();
    if (reference) payload.reference = reference;
    void run(
      () => createTreasuryTransfer(condominiumId, session, payload),
      'Transferencia registrada en ambas cuentas.',
    );
  };

  const submitReconciliation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const payload: Parameters<typeof createTreasuryReconciliation>[2] = {
      accountId: String(values.get('accountId')),
      periodStart: String(values.get('periodStart')),
      periodEnd: String(values.get('periodEnd')),
      statementOpeningBalance: String(values.get('statementOpeningBalance')),
      statementClosingBalance: String(values.get('statementClosingBalance')),
    };
    const notes = String(values.get('notes') ?? '').trim();
    if (notes) payload.notes = notes;
    void run(
      () => createTreasuryReconciliation(condominiumId, session, payload),
      'Conciliación creada en borrador.',
    );
  };

  const exportCsv = () => {
    const rows = [
      ['Fecha', 'Cuenta', 'Tipo', 'Descripción', 'Referencia', 'Débito', 'Crédito', 'Moneda'],
      ...visibleMovements.map((movement) => {
        const account = accountById.get(movement.account_id);
        return [
          movement.occurred_on,
          account?.name ?? movement.account_id,
          movementLabels[movement.movement_kind],
          movement.description,
          movement.reference ?? '',
          movement.direction === 'debit' ? numeric(movement.amount).toFixed(2) : '',
          movement.direction === 'credit' ? numeric(movement.amount).toFixed(2) : '',
          movement.currency_code,
        ];
      }),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(',')).join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tesoreria-${condominiumName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${today()}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="treasury-page">
        <Skeleton className="treasury-skeleton treasury-skeleton--title" />
        <div className="treasury-summary-grid">
          <Skeleton className="treasury-skeleton treasury-skeleton--card" />
          <Skeleton className="treasury-skeleton treasury-skeleton--card" />
          <Skeleton className="treasury-skeleton treasury-skeleton--card" />
        </div>
      </div>
    );
  }

  return (
    <div className="treasury-page">
      <header className="treasury-hero">
        <div>
          <span>CONTROL DE FONDOS</span>
          <h1>Tesorería</h1>
          <p>{condominiumName} · bancos, cajas, movimientos y conciliaciones por moneda.</p>
        </div>
        <div className="treasury-hero__actions">
          <Button onClick={() => setPanel('account')} variant="secondary">
            Nueva cuenta
          </Button>
          <Button
            disabled={!accounts.length}
            onClick={() => setPanel('movement')}
            variant="secondary"
          >
            Registrar movimiento
          </Button>
          <Button disabled={accounts.length < 2} onClick={() => setPanel('transfer')}>
            Transferir
          </Button>
        </div>
      </header>

      {error ? (
        <div className="treasury-message" data-tone="error">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="treasury-message" data-tone="success">
          {message}
        </div>
      ) : null}

      <section aria-label="Saldos por moneda" className="treasury-summary-grid">
        {totals.map(([currency, balance]) => (
          <Surface className="treasury-summary-card" key={currency}>
            <div className="treasury-summary-card__icon">
              <PaymentsIcon size={21} />
            </div>
            <span>Fondos disponibles</span>
            <strong>{money(balance, currency)}</strong>
            <small>
              {accounts.filter((account) => account.currency_code === currency).length} cuentas en{' '}
              {currency}
            </small>
          </Surface>
        ))}
        <Surface className="treasury-summary-card">
          <div className="treasury-summary-card__icon">
            <ReportsIcon size={21} />
          </div>
          <span>Por conciliar</span>
          <strong>{reconciliations.filter((item) => item.status === 'draft').length}</strong>
          <small>Períodos abiertos</small>
        </Surface>
      </section>

      <div className="treasury-toolbar">
        <div className="treasury-tabs" role="tablist" aria-label="Vistas de tesorería">
          {(['accounts', 'movements', 'reconciliations'] as const).map((item) => (
            <button
              aria-selected={view === item}
              key={item}
              onClick={() => setView(item)}
              role="tab"
              type="button"
            >
              {item === 'accounts'
                ? 'Cuentas'
                : item === 'movements'
                  ? 'Movimientos'
                  : 'Conciliaciones'}
            </button>
          ))}
        </div>
        <div className="treasury-toolbar__actions">
          {view !== 'accounts' ? (
            <Select
              aria-label="Filtrar por cuenta"
              onChange={(event) => setSelectedAccountId(event.target.value)}
              value={selectedAccountId}
            >
              <option value="">Todas las cuentas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.currency_code}
                </option>
              ))}
            </Select>
          ) : null}
          {view === 'movements' ? (
            <Button onClick={exportCsv} variant="secondary">
              Exportar CSV
            </Button>
          ) : null}
          {view === 'reconciliations' ? (
            <Button disabled={!accounts.length} onClick={() => setPanel('reconciliation')}>
              Nueva conciliación
            </Button>
          ) : null}
        </div>
      </div>

      {view === 'accounts' ? (
        accounts.length ? (
          <div className="treasury-account-grid">
            {accounts.map((account) => (
              <Surface className="treasury-account-card" key={account.id}>
                <div className="treasury-account-card__head">
                  <div className="treasury-account-card__icon">
                    <ExpensesIcon size={22} />
                  </div>
                  <Badge tone={account.is_active ? 'success' : 'neutral'}>
                    {account.is_active ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
                <div>
                  <span>
                    {accountTypeLabel(account.account_type)} · {account.currency_code}
                  </span>
                  <h2>{account.name}</h2>
                  <p>{account.bank_name ?? 'Fondos bajo control de la administración'}</p>
                </div>
                <strong>{money(account.balance, account.currency_code)}</strong>
                <small>{account.account_reference ?? 'Sin referencia visible'}</small>
                <Button
                  onClick={() => {
                    setSelectedAccountId(account.id);
                    setView('movements');
                  }}
                  variant="ghost"
                >
                  Ver movimientos
                </Button>
              </Surface>
            ))}
          </div>
        ) : (
          <EmptyState
            actionLabel="Crear primera cuenta"
            description="Registra las cuentas bancarias y cajas donde el condominio mantiene fondos. Cada cuenta conserva una sola moneda."
            icon={<PaymentsIcon size={26} />}
            onAction={() => setPanel('account')}
            title="Todavía no hay cuentas de tesorería"
          />
        )
      ) : null}

      {view === 'movements' ? (
        visibleMovements.length ? (
          <Surface className="treasury-table-card">
            <div className="treasury-table-wrap">
              <table className="treasury-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cuenta</th>
                    <th>Movimiento</th>
                    <th>Descripción</th>
                    <th>Débito</th>
                    <th>Crédito</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleMovements.map((movement) => {
                    const account = accountById.get(movement.account_id);
                    const reversible = !['transfer_in', 'transfer_out', 'reversal'].includes(
                      movement.movement_kind,
                    );
                    return (
                      <tr key={movement.id}>
                        <td>{shortDate(movement.occurred_on)}</td>
                        <td>
                          <strong>{account?.name ?? 'Cuenta'}</strong>
                          <small>{movement.currency_code}</small>
                        </td>
                        <td>
                          <Badge tone={movement.direction === 'credit' ? 'success' : 'warning'}>
                            {movementLabels[movement.movement_kind]}
                          </Badge>
                        </td>
                        <td>
                          <strong>{movement.description}</strong>
                          <small>{movement.reference ?? 'Sin referencia'}</small>
                        </td>
                        <td className="treasury-amount treasury-amount--debit">
                          {movement.direction === 'debit'
                            ? money(movement.amount, movement.currency_code)
                            : '—'}
                        </td>
                        <td className="treasury-amount treasury-amount--credit">
                          {movement.direction === 'credit'
                            ? money(movement.amount, movement.currency_code)
                            : '—'}
                        </td>
                        <td>
                          {reversible ? (
                            <Button
                              onClick={() => setReverseId(movement.id)}
                              size="sm"
                              variant="ghost"
                            >
                              Reversar
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Surface>
        ) : (
          <EmptyState
            description="Selecciona otra cuenta o registra el primer movimiento."
            icon={<ReportsIcon size={26} />}
            title="No hay movimientos para mostrar"
          />
        )
      ) : null}

      {view === 'reconciliations' ? (
        visibleReconciliations.length ? (
          <div className="treasury-reconciliation-list">
            {visibleReconciliations.map((item) => {
              const account = accountById.get(item.account_id);
              return (
                <Surface className="treasury-reconciliation-card" key={item.id}>
                  <div>
                    <Badge tone={item.status === 'closed' ? 'success' : 'warning'}>
                      {item.status === 'closed' ? 'Cerrada' : 'Borrador'}
                    </Badge>
                    <h2>{account?.name ?? 'Cuenta de tesorería'}</h2>
                    <p>
                      {shortDate(item.period_start)} – {shortDate(item.period_end)}
                    </p>
                  </div>
                  <div className="treasury-reconciliation-card__values">
                    <span>
                      Estado bancario
                      <strong>
                        {money(item.statement_closing_balance, account?.currency_code ?? 'USD')}
                      </strong>
                    </span>
                    <span>
                      Libro Habitta
                      <strong>
                        {item.book_closing_balance === null
                          ? 'Pendiente'
                          : money(item.book_closing_balance, account?.currency_code ?? 'USD')}
                      </strong>
                    </span>
                    <span>
                      Diferencia
                      <strong>
                        {item.difference === null
                          ? 'Pendiente'
                          : money(item.difference, account?.currency_code ?? 'USD')}
                      </strong>
                    </span>
                  </div>
                  {item.status === 'draft' ? (
                    <Button
                      disabled={saving}
                      onClick={() =>
                        void run(
                          () => closeTreasuryReconciliation(condominiumId, item.id, session),
                          'Conciliación cerrada con el saldo calculado por Habitta.',
                        )
                      }
                    >
                      Cerrar conciliación
                    </Button>
                  ) : null}
                </Surface>
              );
            })}
          </div>
        ) : (
          <EmptyState
            actionLabel="Crear conciliación"
            description="Compara el saldo del banco con el libro de Habitta por cuenta y período."
            icon={<ReportsIcon size={26} />}
            onAction={() => setPanel('reconciliation')}
            title="No hay conciliaciones"
          />
        )
      ) : null}

      {panel ? (
        <div
          className="treasury-dialog-backdrop"
          onMouseDown={() => !saving && setPanel(null)}
          role="presentation"
        >
          <Surface
            aria-labelledby="treasury-dialog-title"
            aria-modal="true"
            className="treasury-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="treasury-dialog__head">
              <div>
                <span>TESORERÍA</span>
                <h2 id="treasury-dialog-title">
                  {panel === 'account'
                    ? 'Nueva cuenta'
                    : panel === 'movement'
                      ? 'Registrar movimiento'
                      : panel === 'transfer'
                        ? 'Transferencia interna'
                        : 'Nueva conciliación'}
                </h2>
              </div>
              <Button disabled={saving} onClick={() => setPanel(null)} variant="ghost">
                Cerrar
              </Button>
            </div>

            {panel === 'account' ? (
              <form className="treasury-form" onSubmit={submitAccount}>
                <Field label="Nombre de la cuenta">
                  <input name="name" placeholder="Ej. Banco Mercantil USD" required />
                </Field>
                <div className="treasury-form__grid">
                  <Field label="Tipo">
                    <Select name="accountType">
                      <option value="bank">Cuenta bancaria</option>
                      <option value="cash">Caja</option>
                    </Select>
                  </Field>
                  <Field hint="Tres letras, por ejemplo USD o VES." label="Moneda">
                    <input
                      defaultValue="USD"
                      maxLength={3}
                      minLength={3}
                      name="currencyCode"
                      pattern="[A-Za-z]{3}"
                      required
                    />
                  </Field>
                </div>
                <Field label="Banco o institución">
                  <input name="bankName" placeholder="Solo para cuentas bancarias" />
                </Field>
                <Field label="Referencia visible">
                  <input name="accountReference" placeholder="Ej. **** 1234" />
                </Field>
                <Field label="Notas">
                  <textarea name="notes" rows={3} />
                </Field>
                <Button disabled={saving} type="submit">
                  {saving ? 'Guardando…' : 'Crear cuenta'}
                </Button>
              </form>
            ) : null}

            {panel === 'movement' ? (
              <form className="treasury-form" onSubmit={submitMovement}>
                <Field label="Cuenta">
                  <Select defaultValue={selectedAccountId} name="accountId" required>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.currency_code}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="treasury-form__grid">
                  <Field label="Tipo">
                    <Select name="movementKind">
                      <option value="deposit">Depósito</option>
                      <option value="withdrawal">Retiro</option>
                      <option value="fee">Comisión</option>
                      <option value="adjustment">Ajuste</option>
                      <option value="opening_balance">Saldo inicial</option>
                    </Select>
                  </Field>
                  <Field label="Dirección">
                    <Select name="direction">
                      <option value="credit">Entrada</option>
                      <option value="debit">Salida</option>
                    </Select>
                  </Field>
                </div>
                <div className="treasury-form__grid">
                  <Field label="Monto">
                    <input
                      inputMode="decimal"
                      name="amount"
                      pattern="(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?"
                      required
                    />
                  </Field>
                  <Field label="Fecha">
                    <input defaultValue={today()} name="occurredOn" required type="date" />
                  </Field>
                </div>
                <Field label="Descripción">
                  <input name="description" required />
                </Field>
                <Field label="Referencia">
                  <input name="reference" />
                </Field>
                <Button disabled={saving} type="submit">
                  {saving ? 'Registrando…' : 'Registrar movimiento'}
                </Button>
              </form>
            ) : null}

            {panel === 'transfer' ? (
              <form className="treasury-form" onSubmit={submitTransfer}>
                <Field
                  hint="Las dos cuentas deben utilizar la misma moneda."
                  label="Cuenta de origen"
                >
                  <Select name="fromAccountId" required>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.currency_code}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cuenta de destino">
                  <Select name="toAccountId" required>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.currency_code}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="treasury-form__grid">
                  <Field label="Monto">
                    <input inputMode="decimal" name="amount" required />
                  </Field>
                  <Field label="Fecha">
                    <input defaultValue={today()} name="occurredOn" required type="date" />
                  </Field>
                </div>
                <Field label="Descripción">
                  <input defaultValue="Transferencia interna" name="description" required />
                </Field>
                <Field label="Referencia">
                  <input name="reference" />
                </Field>
                <Button disabled={saving} type="submit">
                  {saving ? 'Transfiriendo…' : 'Registrar transferencia'}
                </Button>
              </form>
            ) : null}

            {panel === 'reconciliation' ? (
              <form className="treasury-form" onSubmit={submitReconciliation}>
                <Field label="Cuenta">
                  <Select defaultValue={selectedAccountId} name="accountId" required>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {account.currency_code}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="treasury-form__grid">
                  <Field label="Desde">
                    <input defaultValue={monthStart()} name="periodStart" required type="date" />
                  </Field>
                  <Field label="Hasta">
                    <input defaultValue={today()} name="periodEnd" required type="date" />
                  </Field>
                </div>
                <div className="treasury-form__grid">
                  <Field label="Saldo inicial del estado">
                    <input
                      defaultValue="0.00"
                      inputMode="decimal"
                      name="statementOpeningBalance"
                      required
                    />
                  </Field>
                  <Field label="Saldo final del estado">
                    <input inputMode="decimal" name="statementClosingBalance" required />
                  </Field>
                </div>
                <Field label="Notas">
                  <textarea name="notes" rows={3} />
                </Field>
                <Button disabled={saving} type="submit">
                  {saving ? 'Creando…' : 'Crear conciliación'}
                </Button>
              </form>
            ) : null}
          </Surface>
        </div>
      ) : null}

      {reverseId ? (
        <div className="treasury-dialog-backdrop" role="presentation">
          <Surface
            aria-modal="true"
            className="treasury-dialog treasury-dialog--small"
            role="dialog"
          >
            <div className="treasury-dialog__head">
              <div>
                <span>CORRECCIÓN TRAZABLE</span>
                <h2>Reversar movimiento</h2>
              </div>
            </div>
            <p>
              El movimiento original permanecerá en el historial y Habitta agregará el movimiento
              contrario.
            </p>
            <Field label="Motivo">
              <textarea
                autoFocus
                onChange={(event) => setReverseReason(event.target.value)}
                rows={3}
                value={reverseReason}
              />
            </Field>
            <div className="treasury-dialog__actions">
              <Button
                disabled={saving}
                onClick={() => {
                  setReverseId('');
                  setReverseReason('');
                }}
                variant="secondary"
              >
                Cancelar
              </Button>
              <Button
                disabled={saving || reverseReason.trim().length < 2}
                onClick={() =>
                  void run(
                    () => reverseTreasuryMovement(condominiumId, reverseId, session, reverseReason),
                    'Movimiento reversado sin borrar el historial.',
                  ).finally(() => {
                    setReverseId('');
                    setReverseReason('');
                  })
                }
                variant="danger"
              >
                {saving ? 'Reversando…' : 'Confirmar reverso'}
              </Button>
            </div>
          </Surface>
        </div>
      ) : null}
    </div>
  );
}

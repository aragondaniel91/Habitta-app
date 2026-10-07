import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { FormActions, FormGrid } from '../../components/FormLayout';
import { Button, Field, Select } from '../../components/ui';
import { Drawer } from '../../components/Drawer';
import {
  accountTypeLabels,
  formatTreasuryAmount,
  isPositiveTreasuryAmount,
  isTreasuryBalance,
  accountTypeHints,
  movementKindHints,
  movementKindLabels,
  recordableKinds,
  type TreasuryAccount,
  type TreasuryAccountType,
  type TreasuryMovementKind,
} from './types';

export type TreasuryDrawer = 'account' | 'movement' | 'transfer' | 'reconciliation' | null;

const today = () => new Date().toISOString().slice(0, 10);

function DrawerShell({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Drawer eyebrow={eyebrow} onClose={onClose} prefix="treasury" title={title}>
      {children}
    </Drawer>
  );
}

type Submitting = { saving: boolean; error: string };

const useSubmit = (action: () => Promise<void>) => {
  const [state, setState] = useState<Submitting>({ saving: false, error: '' });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState({ saving: true, error: '' });
    try {
      await action();
    } catch (error) {
      setState({
        saving: false,
        error: error instanceof Error ? error.message : 'No se pudo completar la operación.',
      });
      return;
    }
    setState({ saving: false, error: '' });
  };
  return { ...state, submit };
};

export function AccountDrawer({
  account,
  onClose,
  onSubmit,
}: {
  account?: {
    id: string;
    name: string;
    account_type: string;
    currency_code: string;
    bank_name?: string | null;
    account_reference?: string | null;
    notes?: string | null;
    is_active?: boolean;
    balance?: string | number | null;
    latest_movement_at?: string | null;
  };
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    accountType: string;
    currencyCode: string;
    bankName?: string;
    accountReference?: string;
    notes?: string;
    isActive: boolean;
  }) => Promise<void>;
}) {
  const editing = Boolean(account);
  // A settled account cannot be reinterpreted: the balance it already reported would change.
  // A zero balance does not mean an unused account: deposits and withdrawals can net to zero.
  // The API guards the immutable history, so match its real predicate instead of allowing a
  // change that will only end in a 409 response.
  const hasMovements = editing && Boolean(account?.latest_movement_at);
  const [name, setName] = useState(account?.name ?? '');
  const [accountType, setAccountType] = useState(account?.account_type ?? 'bank');
  const [currencyCode, setCurrencyCode] = useState(account?.currency_code ?? 'USD');
  const [bankName, setBankName] = useState(account?.bank_name ?? '');
  const [accountReference, setAccountReference] = useState(account?.account_reference ?? '');
  const [notes, setNotes] = useState(account?.notes ?? '');
  const [isActive, setIsActive] = useState(account?.is_active ?? true);
  const { saving, error, submit } = useSubmit(() =>
    onSubmit({
      name,
      accountType,
      currencyCode,
      // Bank details are meaningful only for bank accounts; hidden values must not reach the API.
      ...(accountType === 'bank' && bankName.trim() ? { bankName: bankName.trim() } : {}),
      ...(accountType === 'bank' && accountReference.trim()
        ? { accountReference: accountReference.trim() }
        : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      isActive,
    }),
  );

  return (
    <DrawerShell
      eyebrow="Tesorería"
      onClose={onClose}
      title={editing ? 'Editar cuenta' : 'Nueva cuenta'}
    >
      <form className="treasury-form ux-form" onSubmit={(event) => void submit(event)}>
        {error ? (
          <div className="treasury-inline-alert" role="alert">
            {error}
          </div>
        ) : null}
        {hasMovements ? (
          <p className="treasury-form__note" role="note">
            Esta cuenta ya tiene saldo registrado. Puedes corregir el nombre, la institución y la
            referencia; la moneda y el tipo quedan fijos para no alterar movimientos ya conciliados.
          </p>
        ) : null}
        <Field label="Nombre">
          <input
            className="input"
            onChange={(event) => setName(event.target.value)}
            placeholder={accountType === 'bank' ? 'Cuenta bancaria principal' : 'Caja principal'}
            required
            value={name}
          />
        </Field>
        <FormGrid className="treasury-account-type-grid">
          <Field
            className="treasury-account-type-field"
            hint={accountTypeHints[accountType as TreasuryAccountType]}
            label="Tipo"
          >
            <Select
              disabled={hasMovements}
              onChange={(event) => {
                const nextType = event.target.value;
                setAccountType(nextType);
                // "Institución financiera" only applies to bank accounts; clear it so a value
                // typed before switching away can't resurface if the type is set back to "Banco".
                if (nextType !== 'bank') {
                  setBankName('');
                  setAccountReference('');
                }
              }}
              value={accountType}
            >
              {Object.entries(accountTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            className="treasury-account-type-field"
            hint="Una cuenta nunca mezcla monedas."
            label="Moneda"
          >
            <Select
              disabled={hasMovements}
              onChange={(event) => setCurrencyCode(event.target.value)}
              value={currencyCode}
            >
              <option value="USD">USD</option>
              <option value="VES">VES</option>
              <option value="EUR">EUR</option>
            </Select>
          </Field>
        </FormGrid>
        {accountType === 'bank' ? (
          <Field label="Institución financiera">
            <input
              className="input"
              onChange={(event) => setBankName(event.target.value)}
              placeholder="Banco de Venezuela"
              value={bankName}
            />
          </Field>
        ) : null}
        {accountType === 'bank' ? (
          <Field
            hint="Últimos 4 dígitos, alias o referencia interna. No incluyas números completos de cuenta ni credenciales bancarias."
            label="Identificador de cuenta"
          >
            <input
              className="input"
              maxLength={120}
              onChange={(event) => setAccountReference(event.target.value)}
              placeholder="•••• 4821"
              value={accountReference}
            />
          </Field>
        ) : null}
        <Field hint="Opcional: deja solo una aclaracion operativa breve." label="Notas">
          <textarea
            className="textarea"
            maxLength={1000}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            value={notes}
          />
        </Field>
        {editing ? (
          <Field
            hint="Una cuenta archivada deja de ofrecerse para nuevos movimientos y conserva su historial."
            label="Estado"
          >
            <Select
              onChange={(event) => setIsActive(event.target.value === 'active')}
              value={isActive ? 'active' : 'archived'}
            >
              <option value="active">Activa</option>
              <option value="archived">Archivada</option>
            </Select>
          </Field>
        ) : null}
        <FormActions sticky>
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear cuenta'}
          </Button>
        </FormActions>
      </form>
    </DrawerShell>
  );
}

export function MovementDrawer({
  accounts,
  initialAccountId,
  initialMovementKind,
  onClose,
  onSubmit,
}: {
  accounts: TreasuryAccount[];
  /** Used only by the post-create balance path; regular movement entry always starts generic. */
  initialAccountId?: string;
  initialMovementKind?: TreasuryMovementKind;
  onClose: () => void;
  onSubmit: (input: {
    accountId: string;
    movementKind: TreasuryMovementKind;
    amount: string;
    occurredOn: string;
    description: string;
    overdraftReason?: string;
    adjustmentDirection?: 'credit' | 'debit';
  }) => Promise<void>;
}) {
  const [accountId, setAccountId] = useState(initialAccountId ?? accounts[0]?.id ?? '');
  const [movementKind, setMovementKind] = useState<TreasuryMovementKind>(
    initialMovementKind ?? 'deposit',
  );
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(today);
  const [description, setDescription] = useState('');
  const [confirmOverdraft, setConfirmOverdraft] = useState(false);
  const [overdraftReason, setOverdraftReason] = useState('');
  // An adjustment can correct a balance up or down; unlike every other recordable kind, its
  // direction is not implied by movementKind and must come from what the operator picks.
  const [adjustmentDirection, setAdjustmentDirection] = useState<'credit' | 'debit'>('credit');

  const account = accounts.find((item) => item.id === accountId);
  const amountIsValid = isPositiveTreasuryAmount(amount);
  const numericAmount = amountIsValid ? Number(amount) : 0;
  const isDebit =
    movementKind === 'withdrawal' ||
    movementKind === 'fee' ||
    (movementKind === 'adjustment' && adjustmentDirection === 'debit');
  const projectedBalance = Number(account?.balance ?? 0) - numericAmount;
  const overdraft = isDebit && numericAmount > 0 && projectedBalance < 0;
  const cannotSubmit = !accountId || !amountIsValid || description.trim().length < 2;

  const { saving, error, submit } = useSubmit(() =>
    onSubmit({
      accountId,
      movementKind,
      amount,
      occurredOn,
      description,
      ...(overdraft ? { overdraftReason: overdraftReason.trim() } : {}),
      ...(movementKind === 'adjustment' ? { adjustmentDirection } : {}),
    }),
  );

  return (
    <DrawerShell eyebrow="Tesorería" onClose={onClose} title="Registrar movimiento">
      <form className="treasury-form ux-form" onSubmit={(event) => void submit(event)}>
        {error ? (
          <div className="treasury-inline-alert" role="alert">
            {error}
          </div>
        ) : null}
        {!accounts.length ? (
          <div className="treasury-inline-alert" role="status">
            Aún no hay cuentas activas. Crea una cuenta desde «Nueva cuenta» (o reactiva una
            archivada) antes de registrar movimientos.
          </div>
        ) : null}
        <p className="treasury-form__note" role="note">
          Cada movimiento queda en el historial de la cuenta con su fecha, monto y autor. Los pagos
          aprobados, los gastos pagados y las transferencias internas se registran solos; usa este
          formulario para depósitos, retiros, comisiones bancarias o ajustes fuera de esos flujos.
        </p>
        <Field label="Cuenta">
          <Select
            onChange={(event) => {
              setAccountId(event.target.value);
              setConfirmOverdraft(false);
            }}
            required
            value={accountId}
          >
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.currency_code}
              </option>
            ))}
          </Select>
        </Field>
        <FormGrid>
          <Field
            hint={movementKindHints[movementKind]}
            label="Tipo"
          >
            <Select
              onChange={(event) => {
                setMovementKind(event.target.value as TreasuryMovementKind);
                setConfirmOverdraft(false);
              }}
              value={movementKind}
            >
              {recordableKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {movementKindLabels[kind]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha">
            <input
              className="input"
              onChange={(event) => setOccurredOn(event.target.value)}
              required
              type="date"
              value={occurredOn}
            />
          </Field>
        </FormGrid>
        {movementKind === 'adjustment' ? (
          <Field
            hint="Determina si el ajuste aumenta o disminuye el saldo de la cuenta."
            label="Dirección del ajuste"
          >
            <Select
              onChange={(event) => {
                setAdjustmentDirection(event.target.value as 'credit' | 'debit');
                setConfirmOverdraft(false);
              }}
              value={adjustmentDirection}
            >
              <option value="credit">Aumenta el saldo</option>
              <option value="debit">Disminuye el saldo</option>
            </Select>
          </Field>
        ) : null}
        <Field label="Monto">
          <input
            className="input"
            inputMode="decimal"
            pattern="^(0|[1-9][0-9]{0,15})([.][0-9]{1,2})?$"
            onChange={(event) => {
              setAmount(event.target.value);
              setConfirmOverdraft(false);
            }}
            placeholder="0.00"
            required
            value={amount}
          />
        </Field>
        <Field label="Descripción">
          <input
            className="input"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Cobro de cuotas de agosto"
            required
            value={description}
          />
        </Field>

        {overdraft && account ? (
          <div className="treasury-overdraft-warning" role="alert">
            <strong>Esta operación dejará la cuenta en negativo.</strong>
            <p>
              Saldo actual {formatTreasuryAmount(account.balance, account.currency_code)} · saldo
              resultante {formatTreasuryAmount(projectedBalance, account.currency_code)}.
            </p>
            <Field
              hint="Quedará guardado en la auditoría financiera."
              label="Motivo de la excepción"
            >
              <textarea
                className="textarea"
                maxLength={500}
                minLength={5}
                onChange={(event) => setOverdraftReason(event.target.value)}
                required
                rows={3}
                value={overdraftReason}
              />
            </Field>
            <label className="treasury-overdraft-confirmation">
              <input
                checked={confirmOverdraft}
                onChange={(event) => setConfirmOverdraft(event.target.checked)}
                type="checkbox"
              />
              Confirmo que deseo registrar el movimiento aunque la cuenta quede negativa.
            </label>
          </div>
        ) : null}

        <FormActions sticky>
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button
            disabled={
              saving ||
              cannotSubmit ||
              (overdraft && (!confirmOverdraft || overdraftReason.trim().length < 5))
            }
            type="submit"
          >
            {saving ? 'Registrando…' : overdraft ? 'Confirmar y registrar' : 'Registrar movimiento'}
          </Button>
        </FormActions>
      </form>
    </DrawerShell>
  );
}

export function TransferDrawer({
  accounts,
  onClose,
  onSubmit,
}: {
  accounts: TreasuryAccount[];
  onClose: () => void;
  onSubmit: (input: {
    fromAccountId: string;
    toAccountId: string;
    amount: string;
    occurredOn: string;
    description: string;
    overdraftReason?: string;
  }) => Promise<void>;
}) {
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(today);
  const [description, setDescription] = useState('');
  const [confirmOverdraft, setConfirmOverdraft] = useState(false);
  const [overdraftReason, setOverdraftReason] = useState('');

  const origin = accounts.find((account) => account.id === fromAccountId);
  const destinations = accounts.filter(
    (account) => account.id !== fromAccountId && account.currency_code === origin?.currency_code,
  );
  const amountIsValid = isPositiveTreasuryAmount(amount);
  const numericAmount = amountIsValid ? Number(amount) : 0;
  const projectedBalance = Number(origin?.balance ?? 0) - numericAmount;
  const overdraft = numericAmount > 0 && projectedBalance < 0;
  const cannotSubmit =
    !fromAccountId ||
    !toAccountId ||
    !amountIsValid ||
    description.trim().length < 2 ||
    !destinations.length;

  const { saving, error, submit } = useSubmit(() =>
    onSubmit({
      fromAccountId,
      toAccountId,
      amount,
      occurredOn,
      description,
      ...(overdraft ? { overdraftReason: overdraftReason.trim() } : {}),
    }),
  );

  return (
    <DrawerShell eyebrow="Tesorería" onClose={onClose} title="Transferencia interna">
      <form className="treasury-form ux-form" onSubmit={(event) => void submit(event)}>
        {error ? (
          <div className="treasury-inline-alert" role="alert">
            {error}
          </div>
        ) : null}
        {accounts.length < 2 ? (
          <div className="treasury-inline-alert" role="status">
            Para transferir necesitas al menos dos cuentas activas en la misma moneda. Crea la
            cuenta que falta desde «Nueva cuenta» y vuelve a intentarlo.
          </div>
        ) : null}
        <p className="treasury-form__note" role="note">
          Una transferencia interna mueve fondos entre dos cuentas del condominio en la misma moneda.
          Habitta registra una salida en la cuenta origen y una entrada en la cuenta destino con la
          misma fecha, así que el saldo total no cambia. Para cambiar de moneda, registra un retiro y
          un depósito por separado e indica la tasa aplicada en la descripción.
        </p>
        <Field label="Cuenta origen">
          <Select
            onChange={(event) => {
              setFromAccountId(event.target.value);
              setToAccountId('');
              setConfirmOverdraft(false);
            }}
            required
            value={fromAccountId}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currency_code}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          hint={destinations.length ? undefined : 'No hay otra cuenta en la misma moneda.'}
          label="Cuenta destino"
        >
          <Select
            onChange={(event) => setToAccountId(event.target.value)}
            required
            value={toAccountId}
          >
            <option value="">Selecciona una cuenta</option>
            {destinations.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currency_code}
              </option>
            ))}
          </Select>
        </Field>
        <FormGrid>
          <Field label="Monto">
            <input
              className="input"
              inputMode="decimal"
              pattern="^(0|[1-9][0-9]{0,15})([.][0-9]{1,2})?$"
              onChange={(event) => {
                setAmount(event.target.value);
                setConfirmOverdraft(false);
              }}
              placeholder="0.00"
              required
              value={amount}
            />
          </Field>
          <Field label="Fecha">
            <input
              className="input"
              onChange={(event) => setOccurredOn(event.target.value)}
              required
              type="date"
              value={occurredOn}
            />
          </Field>
        </FormGrid>
        <Field label="Descripción">
          <input
            className="input"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Fondeo de caja chica"
            required
            value={description}
          />
        </Field>

        {overdraft && origin ? (
          <div className="treasury-overdraft-warning" role="alert">
            <strong>La cuenta origen quedará en negativo.</strong>
            <p>
              Saldo actual {formatTreasuryAmount(origin.balance, origin.currency_code)} · saldo
              resultante {formatTreasuryAmount(projectedBalance, origin.currency_code)}.
            </p>
            <Field
              hint="Quedará guardado en la auditoría financiera."
              label="Motivo de la excepción"
            >
              <textarea
                className="textarea"
                maxLength={500}
                minLength={5}
                onChange={(event) => setOverdraftReason(event.target.value)}
                required
                rows={3}
                value={overdraftReason}
              />
            </Field>
            <label className="treasury-overdraft-confirmation">
              <input
                checked={confirmOverdraft}
                onChange={(event) => setConfirmOverdraft(event.target.checked)}
                type="checkbox"
              />
              Confirmo que deseo transferir aunque la cuenta origen quede negativa.
            </label>
          </div>
        ) : null}

        <FormActions sticky>
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button
            disabled={
              saving ||
              cannotSubmit ||
              (overdraft && (!confirmOverdraft || overdraftReason.trim().length < 5))
            }
            type="submit"
          >
            {saving
              ? 'Transfiriendo…'
              : overdraft
                ? 'Confirmar transferencia'
                : 'Registrar transferencia'}
          </Button>
        </FormActions>
      </form>
    </DrawerShell>
  );
}

export function ReconciliationDrawer({
  accounts,
  onClose,
  onSubmit,
}: {
  accounts: TreasuryAccount[];
  onClose: () => void;
  onSubmit: (input: {
    accountId: string;
    startsOn: string;
    endsOn: string;
    statementOpeningBalance: string;
    statementClosingBalance: string;
  }) => Promise<void>;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState(today);
  const [statementOpeningBalance, setOpening] = useState('');
  const [statementClosingBalance, setClosing] = useState('');
  const amountsAreValid =
    isTreasuryBalance(statementOpeningBalance) && isTreasuryBalance(statementClosingBalance);
  const { saving, error, submit } = useSubmit(() =>
    onSubmit({ accountId, startsOn, endsOn, statementOpeningBalance, statementClosingBalance }),
  );

  return (
    <DrawerShell eyebrow="Tesorería" onClose={onClose} title="Nueva conciliación">
      <form className="treasury-form ux-form" onSubmit={(event) => void submit(event)}>
        {error ? (
          <div className="treasury-inline-alert" role="alert">
            {error}
          </div>
        ) : null}
        {!accounts.length ? (
          <div className="treasury-inline-alert" role="status">
            Aún no hay cuentas activas para conciliar. Crea una cuenta desde «Nueva cuenta» antes de
            iniciar una conciliación.
          </div>
        ) : null}
        <Field label="Cuenta">
          <Select onChange={(event) => setAccountId(event.target.value)} required value={accountId}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currency_code}
              </option>
            ))}
          </Select>
        </Field>
        <FormGrid>
          <Field label="Desde">
            <input
              className="input"
              onChange={(event) => setStartsOn(event.target.value)}
              required
              type="date"
              value={startsOn}
            />
          </Field>
          <Field label="Hasta">
            <input
              className="input"
              onChange={(event) => setEndsOn(event.target.value)}
              required
              type="date"
              value={endsOn}
            />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label="Saldo inicial del estado">
            <input
              className="input"
              inputMode="decimal"
              pattern="^-?(0|[1-9][0-9]{0,15})([.][0-9]{1,2})?$"
              onChange={(event) => setOpening(event.target.value)}
              placeholder="0.00"
              required
              value={statementOpeningBalance}
            />
          </Field>
          <Field label="Saldo final del estado">
            <input
              className="input"
              inputMode="decimal"
              pattern="^-?(0|[1-9][0-9]{0,15})([.][0-9]{1,2})?$"
              onChange={(event) => setClosing(event.target.value)}
              placeholder="0.00"
              required
              value={statementClosingBalance}
            />
          </Field>
        </FormGrid>
        <FormActions sticky>
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button
            disabled={
              saving || !accountId || !startsOn || !endsOn || startsOn > endsOn || !amountsAreValid
            }
            type="submit"
          >
            {saving ? 'Creando…' : 'Crear conciliación'}
          </Button>
        </FormActions>
      </form>
    </DrawerShell>
  );
}

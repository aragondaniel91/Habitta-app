import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { FormActions, FormGrid } from '../../components/FormLayout';
import { Button, Field, Select } from '../../components/ui';
import { Drawer } from '../../components/Drawer';
import {
  accountTypeLabels,
  formatTreasuryAmount,
  movementKindLabels,
  recordableKinds,
  type TreasuryAccount,
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
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    accountType: string;
    currencyCode: string;
    bankName?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState('bank');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [bankName, setBankName] = useState('');
  const { saving, error, submit } = useSubmit(() =>
    onSubmit({
      name,
      accountType,
      currencyCode,
      ...(bankName.trim() ? { bankName: bankName.trim() } : {}),
    }),
  );

  return (
    <DrawerShell eyebrow="Tesorería" onClose={onClose} title="Nueva cuenta">
      <form className="treasury-form" onSubmit={(event) => void submit(event)}>
        {error ? <div className="treasury-inline-alert">{error}</div> : null}
        <Field label="Nombre">
          <input
            className="input"
            onChange={(event) => setName(event.target.value)}
            placeholder="Banco Nacional USD"
            required
            value={name}
          />
        </Field>
        <FormGrid>
          <Field label="Tipo">
            <Select onChange={(event) => setAccountType(event.target.value)} value={accountType}>
              {Object.entries(accountTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field hint="Una cuenta nunca mezcla monedas." label="Moneda">
            <Select onChange={(event) => setCurrencyCode(event.target.value)} value={currencyCode}>
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
        <FormActions sticky>
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? 'Guardando…' : 'Crear cuenta'}
          </Button>
        </FormActions>
      </form>
    </DrawerShell>
  );
}

export function MovementDrawer({
  accounts,
  onClose,
  onSubmit,
}: {
  accounts: TreasuryAccount[];
  onClose: () => void;
  onSubmit: (input: {
    accountId: string;
    movementKind: TreasuryMovementKind;
    amount: string;
    occurredOn: string;
    description: string;
    overdraftReason?: string;
  }) => Promise<void>;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [movementKind, setMovementKind] = useState<TreasuryMovementKind>('deposit');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(today);
  const [description, setDescription] = useState('');
  const [confirmOverdraft, setConfirmOverdraft] = useState(false);
  const [overdraftReason, setOverdraftReason] = useState('');

  const account = accounts.find((item) => item.id === accountId);
  const numericAmount = Number(amount);
  const isDebit = movementKind === 'withdrawal' || movementKind === 'fee';
  const projectedBalance = Number(account?.balance ?? 0) - numericAmount;
  const overdraft = isDebit && numericAmount > 0 && projectedBalance < 0;

  const { saving, error, submit } = useSubmit(() =>
    onSubmit({
      accountId,
      movementKind,
      amount,
      occurredOn,
      description,
      ...(overdraft ? { overdraftReason: overdraftReason.trim() } : {}),
    }),
  );

  return (
    <DrawerShell eyebrow="Tesorería" onClose={onClose} title="Registrar movimiento">
      <form className="treasury-form" onSubmit={(event) => void submit(event)}>
        {error ? <div className="treasury-inline-alert">{error}</div> : null}
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
            hint={
              movementKind === 'opening_balance'
                ? 'Solo se admite en una cuenta sin movimientos.'
                : undefined
            }
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
        <Field label="Monto">
          <input
            className="input"
            inputMode="decimal"
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
              saving || (overdraft && (!confirmOverdraft || overdraftReason.trim().length < 5))
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
  const numericAmount = Number(amount);
  const projectedBalance = Number(origin?.balance ?? 0) - numericAmount;
  const overdraft = numericAmount > 0 && projectedBalance < 0;

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
      <form className="treasury-form" onSubmit={(event) => void submit(event)}>
        {error ? <div className="treasury-inline-alert">{error}</div> : null}
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
              !toAccountId ||
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
  const { saving, error, submit } = useSubmit(() =>
    onSubmit({ accountId, startsOn, endsOn, statementOpeningBalance, statementClosingBalance }),
  );

  return (
    <DrawerShell eyebrow="Tesorería" onClose={onClose} title="Nueva conciliación">
      <form className="treasury-form" onSubmit={(event) => void submit(event)}>
        {error ? <div className="treasury-inline-alert">{error}</div> : null}
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
          <Button disabled={saving} type="submit">
            {saving ? 'Creando…' : 'Crear conciliación'}
          </Button>
        </FormActions>
      </form>
    </DrawerShell>
  );
}

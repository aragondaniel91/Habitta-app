import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

type Unit = { id: string; code: string };
type Concept = { id: string; code: string; name: string };
type Item = {
  id: string;
  unit_id: string;
  currency_code: string;
  outstanding_amount: string;
  status: string;
  original_amount: string;
};
const api = async <T,>(path: string, session: Session, init?: RequestInit) => {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? 'http://localhost:8787'}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la operación');
  return data as T;
};
const money = (amount: string, currency: string) =>
  new Intl.NumberFormat('es-VE', { style: 'currency', currency }).format(Number(amount));
export function ReceivablesPanel({
  condominiumId,
  units,
  session,
}: {
  condominiumId: string;
  units: Unit[];
  session: Session;
}) {
  const [items, setItems] = useState<Item[]>([]),
    [concepts, setConcepts] = useState<Concept[]>([]),
    [message, setMessage] = useState(''),
    [filter, setFilter] = useState(''),
    [csv, setCsv] = useState<File | null>(null),
    [preview, setPreview] = useState<unknown[] | null>(null);
  const load = async () => {
    if (!condominiumId) return;
    const [i, c] = await Promise.all([
      api<Item[]>(`/v1/condominiums/${condominiumId}/receivables`, session),
      api<Concept[]>(`/v1/condominiums/${condominiumId}/charge-concepts`, session),
    ]);
    setItems(i);
    setConcepts(c);
  };
  useEffect(() => {
    void load();
  }, [condominiumId, session.access_token]);
  const totals = useMemo(
    () =>
      Object.entries(
        items.reduce<Record<string, number>>((a, x) => {
          a[x.currency_code] = (a[x.currency_code] ?? 0) + Number(x.outstanding_amount);
          return a;
        }, {}),
      ),
    [items],
  );
  const submit = async (e: React.FormEvent<HTMLFormElement>, path: string) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(path, session, {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          amount: data.amount ? Number(data.amount) : undefined,
          currencyCode: String(data.currencyCode ?? '').toUpperCase(),
        }),
      });
      setMessage('Guardado correctamente.');
      e.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error');
    }
  };
  return (
    <section className="people-panel">
      <h2>Cuentas por cobrar</h2>
      <p>{message}</p>
      <div className="cards">
        {totals.map(([currency, total]) => (
          <article key={currency}>
            <small>Pendiente {currency}</small>
            <b>{money(String(total), currency)}</b>
          </article>
        ))}
      </div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar por unidad, moneda o estado"
      />
      <h3>Conceptos</h3>
      <form onSubmit={(e) => void submit(e, `/v1/condominiums/${condominiumId}/charge-concepts`)}>
        <input name="code" required placeholder="Código" />
        <input name="name" required placeholder="Nombre" />
        <select name="category">
          <option value="regular_dues">Cuota regular</option>
          <option value="service">Servicio</option>
          <option value="other">Otro</option>
        </select>
        <button>Crear concepto</button>
      </form>
      <h3>Cargo manual</h3>
      <form onSubmit={(e) => void submit(e, `/v1/condominiums/${condominiumId}/receivables`)}>
        <select name="unitId">
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.code}
            </option>
          ))}
        </select>
        <select name="conceptId">
          <option value="">Sin concepto</option>
          {concepts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input name="description" required placeholder="Descripción" />
        <input name="amount" required type="number" min="0.01" step="0.01" placeholder="Monto" />
        <select name="currencyCode">
          <option>USD</option>
          <option>VES</option>
        </select>
        <input name="issueDate" type="date" required />
        <input name="dueDate" type="date" />
        <button>Emitir cargo</button>
      </form>
      <h3>Cargos</h3>
      {items
        .filter((x) => `${x.unit_id} ${x.currency_code} ${x.status}`.includes(filter))
        .map((item) => (
          <p key={item.id}>
            {item.currency_code} · {money(item.outstanding_amount, item.currency_code)} ·{' '}
            {item.status}
            <button
              onClick={() => {
                const reason = prompt('Motivo del reverso');
                if (reason)
                  void api(
                    `/v1/condominiums/${condominiumId}/receivables/${item.id}/reverse`,
                    session,
                    { method: 'POST', body: JSON.stringify({ reason }) },
                  ).then(load);
              }}
            >
              Reversar
            </button>
          </p>
        ))}
      <h3>Saldos iniciales</h3>
      <input type="file" accept=".csv" onChange={(e) => setCsv(e.target.files?.[0] ?? null)} />
      <button
        onClick={async () => {
          if (!csv) return;
          const lines = (await csv.text()).trim().split(/\r?\n/);
          const headers = lines.shift()?.split(',');
          if (
            headers?.join(',') !==
            'unit_code,balance_type,amount,currency_code,effective_date,description'
          ) {
            setMessage('Encabezados CSV inválidos');
            return;
          }
          const rows = lines.map((line) =>
            Object.fromEntries(headers.map((h, i) => [h, line.split(',')[i]?.trim()])),
          );
          const p = await api<{ valid: unknown[] }>(
            `/v1/condominiums/${condominiumId}/opening-balances/preview`,
            session,
            {
              method: 'POST',
              body: JSON.stringify({
                rows,
                idempotencyKey: crypto.randomUUID(),
                filename: csv.name,
              }),
            },
          );
          setPreview(p.valid);
        }}
      >
        Previsualizar CSV
      </button>
      {preview && (
        <button
          onClick={() =>
            void api(`/v1/condominiums/${condominiumId}/opening-balances/commit`, session, {
              method: 'POST',
              body: JSON.stringify({
                rows: preview,
                idempotencyKey: crypto.randomUUID(),
                filename: csv?.name,
              }),
            }).then(() => {
              setMessage('Importación completada.');
              return load();
            })
          }
        >
          Confirmar importación
        </button>
      )}
    </section>
  );
}

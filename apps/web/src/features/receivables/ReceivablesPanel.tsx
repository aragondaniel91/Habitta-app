import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
type Unit = { id: string; code: string };
type Concept = { id: string; code: string; name: string };
type Item = {
  id: string;
  unit_id: string;
  concept_id?: string;
  currency_code: string;
  outstanding_amount: string;
  status: string;
  due_date?: string;
  description: string;
};
type Summary = {
  currency_code: string;
  net_outstanding: string;
  total_debits: string;
  total_credits: string;
};
type Aging = {
  currency_code: string;
  current_amount: string;
  days_1_30: string;
  days_31_60: string;
  days_61_90: string;
  over_90: string;
};
type Statement = {
  effective_date: string;
  description: string;
  debit?: string;
  credit?: string;
  running_balance: string;
  currency_code: string;
  entry_type: string;
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
  if (!response.ok)
    throw new Error(
      typeof data.error === 'string' ? data.error : 'No se pudo completar la operación',
    );
  return data as T;
};
const amount = (value: string, currency: string) => `${currency} ${value}`;
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
    [summary, setSummary] = useState<Summary[]>([]),
    [aging, setAging] = useState<Aging[]>([]),
    [statement, setStatement] = useState<Statement[]>([]),
    [message, setMessage] = useState(''),
    [filters, setFilters] = useState({ unit: '', concept: '', currency: '', status: '', due: '' }),
    [csv, setCsv] = useState<File | null>(null),
    [openingPreview, setOpeningPreview] = useState<{
      valid: unknown[];
      errors: { row: number; error: string }[];
    } | null>(null),
    [openingKey, setOpeningKey] = useState(''),
    [batchPreview, setBatchPreview] = useState<{
      total: string;
      currencyCode: string;
      count: number;
    } | null>(null),
    [batchKey, setBatchKey] = useState(''),
    [reverseId, setReverseId] = useState(''),
    [reverseReason, setReverseReason] = useState('');
  const load = async () => {
    if (!condominiumId) return;
    const [i, c, s, a] = await Promise.all([
      api<Item[]>(`/v1/condominiums/${condominiumId}/receivables`, session),
      api<Concept[]>(`/v1/condominiums/${condominiumId}/charge-concepts`, session),
      api<Summary[]>(`/v1/condominiums/${condominiumId}/receivables/summary`, session),
      api<Aging[]>(`/v1/condominiums/${condominiumId}/receivables/aging`, session),
    ]);
    setItems(i);
    setConcepts(c);
    setSummary(s);
    setAging(a);
  };
  useEffect(() => {
    void load();
  }, [condominiumId, session.access_token]);
  const post = async (path: string, payload: unknown) => {
    try {
      await api(path, session, { method: 'POST', body: JSON.stringify(payload) });
      setMessage('Guardado correctamente.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error');
    }
  };
  const formData = (event: React.FormEvent<HTMLFormElement>) =>
    Object.fromEntries(new FormData(event.currentTarget));
  const visible = items.filter(
    (item) =>
      (!filters.unit || item.unit_id === filters.unit) &&
      (!filters.concept || item.concept_id === filters.concept) &&
      (!filters.currency || item.currency_code === filters.currency) &&
      (!filters.status || item.status === filters.status) &&
      (!filters.due || item.due_date === filters.due),
  );
  return (
    <section className="people-panel">
      <h2>Cuentas por cobrar</h2>
      <p role="status">{message}</p>
      <div className="cards">
        {summary.map((row) => (
          <article key={row.currency_code}>
            <small>Pendiente {row.currency_code}</small>
            <b>{amount(row.net_outstanding, row.currency_code)}</b>
            <span>
              Débitos {row.total_debits} · Créditos {row.total_credits}
            </span>
          </article>
        ))}
      </div>
      <h3>Filtros</h3>
      <div className="grid">
        <select
          value={filters.unit}
          onChange={(e) => setFilters({ ...filters, unit: e.target.value })}
        >
          <option value="">Todas las unidades</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.code}
            </option>
          ))}
        </select>
        <select
          value={filters.concept}
          onChange={(e) => setFilters({ ...filters, concept: e.target.value })}
        >
          <option value="">Todos los conceptos</option>
          {concepts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={filters.currency}
          onChange={(e) => setFilters({ ...filters, currency: e.target.value })}
        >
          <option value="">Todas las monedas</option>
          <option>USD</option>
          <option>VES</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">Todos los estados</option>
          <option value="open">Abierto</option>
          <option value="reversed">Reversado</option>
        </select>
        <input
          type="date"
          value={filters.due}
          onChange={(e) => setFilters({ ...filters, due: e.target.value })}
        />
      </div>
      <h3>Concepto</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = formData(e);
          void post(`/v1/condominiums/${condominiumId}/charge-concepts`, {
            code: d.code,
            name: d.name,
            category: d.category,
          });
        }}
      >
        <input name="code" required placeholder="Código" />
        <input name="name" required placeholder="Nombre" />
        <select name="category">
          <option value="regular_dues">Cuota regular</option>
          <option value="service">Servicio</option>
        </select>
        <button>Crear concepto</button>
      </form>
      <h3>Cargo manual</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void post(`/v1/condominiums/${condominiumId}/receivables`, formData(e));
        }}
      >
        <select name="unitId" required>
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
        <input
          name="amount"
          required
          inputMode="decimal"
          pattern="^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$"
          placeholder="0.00"
        />
        <select name="currencyCode">
          <option>USD</option>
          <option>VES</option>
        </select>
        <input name="issueDate" type="date" required />
        <input name="dueDate" type="date" />
        <button>Emitir cargo</button>
      </form>
      <h3>Lote fijo</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const d = formData(e),
            key = crypto.randomUUID();
          const payload = {
            conceptId: d.conceptId,
            name: d.name,
            currencyCode: d.currencyCode,
            issueDate: d.issueDate,
            dueDate: d.dueDate,
            distributionMethod: 'fixed_per_unit',
            fixedAmount: d.fixedAmount,
            rows: units.map((u) => ({ unitId: u.id })),
            idempotencyKey: key,
          };
          const result = await api<{ total: string; currencyCode: string; count: number }>(
            `/v1/condominiums/${condominiumId}/charge-batches/preview`,
            session,
            { method: 'POST', body: JSON.stringify(payload) },
          );
          setBatchPreview(result);
          setBatchKey(key);
          sessionStorage.setItem('batch-preview', JSON.stringify(payload));
        }}
      >
        <select name="conceptId" required>
          {concepts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input name="name" required placeholder="Nombre del lote" />
        <input name="fixedAmount" required inputMode="decimal" placeholder="0.00" />
        <select name="currencyCode">
          <option>USD</option>
          <option>VES</option>
        </select>
        <input name="issueDate" type="date" required />
        <input name="dueDate" type="date" required />
        <button>Previsualizar lote</button>
      </form>
      {batchPreview && (
        <p>
          {batchPreview.count} cargos · {amount(batchPreview.total, batchPreview.currencyCode)}{' '}
          <button
            onClick={() => {
              const payload = JSON.parse(sessionStorage.getItem('batch-preview') ?? '{}');
              void post(`/v1/condominiums/${condominiumId}/charge-batches/commit`, {
                ...payload,
                idempotencyKey: batchKey,
              });
            }}
          >
            Publicar lote
          </button>
        </p>
      )}
      <h3>Cargos</h3>
      {visible.length ? (
        visible.map((item) => (
          <p key={item.id}>
            {item.description} · {amount(item.outstanding_amount, item.currency_code)} ·{' '}
            {item.status} <button onClick={() => setReverseId(item.id)}>Reversar</button>
          </p>
        ))
      ) : (
        <p>Sin cargos para estos filtros.</p>
      )}
      {reverseId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void post(`/v1/condominiums/${condominiumId}/receivables/${reverseId}/reverse`, {
              reason: reverseReason,
            });
            setReverseId('');
            setReverseReason('');
          }}
        >
          <textarea
            required
            minLength={3}
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            placeholder="Motivo obligatorio"
          />
          <button>Confirmar reverso</button>
        </form>
      )}
      <h3>Estado de cuenta</h3>
      <select
        onChange={async (e) =>
          setStatement(
            e.target.value
              ? await api(
                  `/v1/condominiums/${condominiumId}/units/${e.target.value}/statement`,
                  session,
                )
              : [],
          )
        }
      >
        <option value="">Selecciona una unidad</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.code}
          </option>
        ))}
      </select>
      {statement.map((row, index) => (
        <p key={`${row.effective_date}-${index}`}>
          {row.effective_date} · {row.description} · D {row.debit ?? '—'} · C {row.credit ?? '—'} ·
          Saldo {amount(row.running_balance, row.currency_code)}
        </p>
      ))}
      <h3>Antigüedad</h3>
      {aging.map((row) => (
        <p key={row.currency_code}>
          {row.currency_code}: vigente {row.current_amount} · 1–30 {row.days_1_30} · 31–60{' '}
          {row.days_31_60} · 61–90 {row.days_61_90} · +90 {row.over_90}
        </p>
      ))}
      <h3>Saldos iniciales</h3>
      <input type="file" accept=".csv" onChange={(e) => setCsv(e.target.files?.[0] ?? null)} />
      <button
        onClick={async () => {
          if (!csv) return;
          const lines = (await csv.text()).trim().split(/\r?\n/),
            headers = lines
              .shift()
              ?.split(',')
              .map((x) => x.trim());
          if (
            headers?.join(',') !==
            'unit_code,balance_type,amount,currency_code,effective_date,description'
          ) {
            setMessage('Encabezados CSV inválidos');
            return;
          }
          const rows = lines.map((line) =>
              Object.fromEntries(headers.map((h, i) => [h, line.split(',')[i]?.trim() ?? ''])),
            ),
            key = crypto.randomUUID();
          setOpeningKey(key);
          const result = await api<{ valid: unknown[]; errors: { row: number; error: string }[] }>(
            `/v1/condominiums/${condominiumId}/opening-balances/preview`,
            session,
            {
              method: 'POST',
              body: JSON.stringify({ rows, idempotencyKey: key, filename: csv.name }),
            },
          );
          setOpeningPreview(result);
        }}
      >
        Previsualizar CSV
      </button>
      {openingPreview && (
        <>
          <p>
            Válidas {openingPreview.valid.length} · Errores {openingPreview.errors.length}
          </p>
          {openingPreview.errors.map((x) => (
            <p key={x.row}>
              Fila {x.row}: {x.error}
            </p>
          ))}
          {openingPreview.errors.length === 0 && (
            <button
              onClick={() =>
                void post(`/v1/condominiums/${condominiumId}/opening-balances/commit`, {
                  rows: openingPreview.valid,
                  idempotencyKey: openingKey,
                  filename: csv?.name,
                })
              }
            >
              Confirmar importación
            </button>
          )}
        </>
      )}
    </section>
  );
}

import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { uuidSchema } from '@habitta/validation';
import { buildXlsx, type XlsxSheet } from './financial-xlsx';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type Environment = { Bindings: NotificationBindings; Variables: Variables };
type AppContext = Context<Environment>;
type Row = Record<string, unknown>;

const PAGE_SIZE = 500;
const MAX_ROWS = 20_000;
const MAX_WORKBOOK_BYTES = 15 * 1024 * 1024;
const currency = z.string().regex(/^[A-Z]{3}$/);
const querySchema = z.object({
  months: z.coerce
    .number()
    .int()
    .refine((value) => [3, 6, 12].includes(value))
    .default(6),
});

const rest = (c: AppContext, path: string, init: RequestInit = {}) =>
  fetch(`${c.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.get('token')}`,
      ...(init.headers ?? {}),
    },
  });
const totalFrom = (response: Response) =>
  Number.parseInt(response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1] ?? '', 10);
const dateBeforeMonths = (date: Date, months: number) => {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months + 1, 1));
  return result.toISOString().slice(0, 10);
};
const dateOnly = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
const numeric = (value: unknown) => {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : 0;
};
const text = (value: unknown) =>
  typeof value === 'string' ? value : value == null ? '' : String(value);
const sheetName = (kind: string, code: string) => `${kind}-${code}`.slice(0, 31);
const safeFileName = (value: string) =>
  value
    .normalize('NFKD')
    .split('')
    .map((character) =>
      /^[\\/:*?"<>|]$/.test(character) || character.charCodeAt(0) < 32 ? '_' : character,
    )
    .join('')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[_ .]+|[_ .]+$/g, '')
    .slice(0, 70) || 'financial-report';

async function requireReportAccess(c: AppContext, condominiumId: string) {
  const capability = await Promise.all(
    ['can_read_receivables', 'can_read_expenses', 'can_read_treasury'].map((name) =>
      rest(c, `rpc/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: condominiumId }),
      }),
    ),
  );
  if (capability.some((response) => !response.ok)) return false;
  return (await Promise.all(capability.map((response) => response.json()))).every(
    (value) => value === true,
  );
}

async function readAll(c: AppContext, path: string) {
  const rows: Row[] = [];
  let expectedTotal: number | undefined;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await rest(c, `${path}&limit=${PAGE_SIZE}&offset=${offset}`, {
      headers: { Prefer: 'count=exact' },
    });
    if (!response.ok)
      throw new Error(
        response.status === 401 || response.status === 403 ? 'Forbidden' : 'Source unavailable',
      );
    const total = totalFrom(response);
    const page = await response.json();
    if (!Array.isArray(page) || !Number.isSafeInteger(total))
      throw new Error('Pagination metadata unavailable');
    expectedTotal ??= total;
    if (total !== expectedTotal) throw new Error('Financial data changed while preparing export');
    if (total > MAX_ROWS || rows.length + page.length > MAX_ROWS)
      throw new Error('Export exceeds 20,000 rows per report source');
    rows.push(...(page as Row[]));
    if (rows.length === total) return rows;
    if (!page.length) throw new Error('Financial history ended before exact count');
  }
}

const dataRows = (headers: string[], records: Array<Array<string | number>>) => [
  headers.map((value) => ({ type: 'text' as const, value })),
  ...records.map((record) =>
    record.map((value, index) => ({
      type:
        headers[index]?.includes('Fecha') && /^\d{4}-\d{2}-\d{2}$/.test(String(value))
          ? ('date' as const)
          : typeof value === 'number'
            ? ('number' as const)
            : ('text' as const),
      value,
    })),
  ),
];

export const financialExportRoutes = new Hono<Environment>();
financialExportRoutes.get('/:id/reports/financial.xlsx', async (c) => {
  const condominiumId = uuidSchema.parse(c.req.param('id'));
  const parsed = querySchema.safeParse({ months: c.req.query('months') ?? undefined });
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  if (!(await requireReportAccess(c, condominiumId))) return c.json({ error: 'Forbidden' }, 403);

  // This timestamp is also passed to each source query, preventing records created after the
  // report began from appearing in a later page. The workbook records it as its filter snapshot.
  const generatedAt = new Date();
  const createdBefore = generatedAt.toISOString();
  const from = dateBeforeMonths(generatedAt, parsed.data.months);
  const [condominiums, units, receivables, payments, expenses, movements] = await Promise.all([
    readAll(c, `condominiums?id=eq.${condominiumId}&select=name`),
    readAll(c, `units?condominium_id=eq.${condominiumId}&select=id,code&order=code.asc,id.asc`),
    readAll(
      c,
      `receivable_balances?condominium_id=eq.${condominiumId}&issue_date=gte.${from}&created_at=lte.${createdBefore}&select=id,unit_id,description,issue_date,due_date,original_amount,outstanding_amount,currency_code,status&order=issue_date.asc,id.asc`,
    ),
    readAll(
      c,
      `payments?condominium_id=eq.${condominiumId}&payment_date=gte.${from}&created_at=lte.${createdBefore}&select=id,unit_id,payment_date,original_amount,original_currency_code,status&order=payment_date.asc,id.asc`,
    ),
    readAll(
      c,
      `expenses?condominium_id=eq.${condominiumId}&expense_date=gte.${from}&created_at=lte.${createdBefore}&select=id,expense_date,due_date,amount,currency_code,status,description&order=expense_date.asc,id.asc`,
    ),
    readAll(
      c,
      `treasury_movements?condominium_id=eq.${condominiumId}&occurred_on=gte.${from}&created_at=lte.${createdBefore}&select=id,occurred_on,direction,movement_kind,amount,currency_code,description,source_type&order=occurred_on.asc,id.asc`,
    ),
  ]);
  const condominiumName = text(condominiums[0]?.name) || 'Condominium';
  const unitCodes = new Map(units.map((unit) => [text(unit.id), text(unit.code)]));
  const grouped = new Map<
    string,
    { receivables: Row[]; payments: Row[]; expenses: Row[]; movements: Row[] }
  >();
  for (const [kind, rows, key] of [
    ['receivables', receivables, 'currency_code'],
    ['payments', payments, 'original_currency_code'],
    ['expenses', expenses, 'currency_code'],
    ['movements', movements, 'currency_code'],
  ] as const)
    for (const row of rows) {
      const code = currency.safeParse(row[key]);
      if (!code.success) continue;
      const current = grouped.get(code.data) ?? {
        receivables: [],
        payments: [],
        expenses: [],
        movements: [],
      };
      current[kind].push(row);
      grouped.set(code.data, current);
    }
  const sheets: XlsxSheet[] = [
    {
      name: 'Metadata',
      rows: dataRows(
        ['Campo', 'Valor'],
        [
          ['Condominio', condominiumName],
          ['Desde', from],
          ['Hasta', generatedAt.toISOString().slice(0, 10)],
          ['Generado (UTC)', generatedAt.toISOString()],
          [
            'Filtros',
            `Últimos ${parsed.data.months} meses; registros creados hasta ${createdBefore}`,
          ],
          ['Moneda', 'Las sumas se mantienen separadas por hoja y moneda'],
          [
            'Privacidad',
            'No incluye referencias bancarias, pagador, proveedor, facturas, notas ni URLs de soporte',
          ],
        ],
      ),
    },
  ];
  for (const [code, groups] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const totals = [
      [
        'Cuentas por cobrar',
        groups.receivables.reduce((sum, row) => sum + numeric(row.outstanding_amount), 0),
      ],
      ['Pagos', groups.payments.reduce((sum, row) => sum + numeric(row.original_amount), 0)],
      ['Gastos', groups.expenses.reduce((sum, row) => sum + numeric(row.amount), 0)],
      [
        'Movimientos débito',
        groups.movements
          .filter((row) => row.direction === 'debit')
          .reduce((sum, row) => sum + numeric(row.amount), 0),
      ],
      [
        'Movimientos crédito',
        groups.movements
          .filter((row) => row.direction === 'credit')
          .reduce((sum, row) => sum + numeric(row.amount), 0),
      ],
    ];
    sheets.push({
      name: sheetName('Resumen', code),
      rows: dataRows(['Concepto', `Total ${code}`], totals),
      tableName: `Summary_${code}`,
    });
    sheets.push({
      name: sheetName('Cobrar', code),
      rows: dataRows(
        [
          'ID',
          'Unidad',
          'Descripción',
          'Fecha emisión',
          'Fecha vencimiento',
          `Importe ${code}`,
          `Saldo ${code}`,
          'Estado',
        ],
        groups.receivables.map((row) => [
          text(row.id),
          unitCodes.get(text(row.unit_id)) ?? '',
          text(row.description),
          dateOnly(row.issue_date),
          dateOnly(row.due_date),
          numeric(row.original_amount),
          numeric(row.outstanding_amount),
          text(row.status),
        ]),
      ),
      tableName: `Receivables_${code}`,
    });
    sheets.push({
      name: sheetName('Pagos', code),
      rows: dataRows(
        ['ID', 'Unidad', 'Fecha pago', `Importe ${code}`, 'Estado'],
        groups.payments.map((row) => [
          text(row.id),
          unitCodes.get(text(row.unit_id)) ?? '',
          dateOnly(row.payment_date),
          numeric(row.original_amount),
          text(row.status),
        ]),
      ),
      tableName: `Payments_${code}`,
    });
    sheets.push({
      name: sheetName('Gastos', code),
      rows: dataRows(
        ['ID', 'Fecha gasto', 'Fecha vencimiento', `Importe ${code}`, 'Estado', 'Descripción'],
        groups.expenses.map((row) => [
          text(row.id),
          dateOnly(row.expense_date),
          dateOnly(row.due_date),
          numeric(row.amount),
          text(row.status),
          text(row.description),
        ]),
      ),
      tableName: `Expenses_${code}`,
    });
    sheets.push({
      name: sheetName('Movimientos', code),
      rows: dataRows(
        ['ID', 'Fecha movimiento', 'Dirección', 'Tipo', `Importe ${code}`, 'Descripción', 'Origen'],
        groups.movements.map((row) => [
          text(row.id),
          dateOnly(row.occurred_on),
          text(row.direction),
          text(row.movement_kind),
          numeric(row.amount),
          text(row.description),
          text(row.source_type),
        ]),
      ),
      tableName: `Movements_${code}`,
    });
  }
  if (sheets.length === 1)
    sheets.push({
      name: 'Sin datos',
      rows: dataRows(
        ['Estado'],
        [['No hay movimientos financieros para los filtros seleccionados.']],
      ),
    });
  const workbook = buildXlsx(sheets);
  if (workbook.byteLength > MAX_WORKBOOK_BYTES)
    return c.json({ error: 'Export exceeds the 15 MB workbook limit' }, 413);
  return new Response(workbook, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeFileName(`${condominiumName}-reporte-financiero-${from}`)}.xlsx"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

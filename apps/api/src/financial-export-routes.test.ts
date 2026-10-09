import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { financialExportRoutes } from './financial-export-routes';
import { buildXlsx } from './financial-xlsx';

const condominium = '42720000-0000-4000-8000-000000000001';
const env = { SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon-key' };

const app = () => {
  const router = new Hono<{
    Bindings: typeof env;
    Variables: { token: string; userId: string };
  }>();
  router.use('*', async (c, next) => {
    c.set('token', 'caller-token');
    c.set('userId', 'caller');
    await next();
  });
  router.route('/', financialExportRoutes as never);
  return router;
};

afterEach(() => vi.unstubAllGlobals());

describe('financial XLSX export', () => {
  it('uses caller-authorized capabilities, pages every dataset, and returns a real workbook', async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        requests.push(url);
        if (url.includes('/rpc/')) return new Response('true', { status: 200 });
        if (url.includes('condominiums?')) {
          return new Response(JSON.stringify([{ name: 'Condo / name' }]), { status: 200, headers: { 'content-range': '0-0/1' } });
        }
        const page = [{ id: url.includes('offset=500') ? 'row-2' : 'row-1', currency_code: 'USD', original_currency_code: 'USD', issue_date: '2026-10-01', payment_date: '2026-10-01', expense_date: '2026-10-01', occurred_on: '2026-10-01', original_amount: '10.00', outstanding_amount: '5.00', amount: '4.00', direction: 'credit', movement_kind: 'deposit', status: 'approved', description: '=formula', unit_id: 'unit-1' }];
        return new Response(JSON.stringify(page), { status: 200, headers: { 'content-range': `${url.includes('offset=500') ? '1-1' : '0-0'}/2` } });
      }),
    );
    const response = await app().request(`/${condominium}/reports/financial.xlsx?months=6`, {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('spreadsheetml');
    expect(response.headers.get('content-disposition')).toContain('.xlsx');
    expect(requests.filter((url) => url.includes('/rpc/'))).toHaveLength(3);
    for (const source of ['receivable_balances?', 'payments?', 'expenses?', 'treasury_movements?']) {
      expect(requests.some((url) => url.includes(source) && url.includes('limit=500') && url.includes('offset=0'))).toBe(true);
      expect(requests.some((url) => url.includes(source) && url.includes('offset=500'))).toBe(true);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([80, 75, 3, 4]);
    const contents = new TextDecoder().decode(bytes);
    expect(contents).toContain("'=formula");
    expect(contents).toContain('tableStyleInfo');
  });

  it('refuses a report when any required financial scope is not authorized', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url.includes('can_read_expenses') ? 'false' : 'true', { status: 200 })));
    const response = await app().request(`/${condominium}/reports/financial.xlsx`, {}, env);
    expect(response.status).toBe(403);
  });

  it('generates typed cells and blocks every spreadsheet formula prefix in text values', () => {
    const workbook = buildXlsx([{ name: 'Datos', tableName: 'Safe_Table', rows: [[{ type: 'text', value: 'Descripción' }, { type: 'text', value: 'Monto' }], ...['=danger', '+danger', '-danger', '@danger', '\tdanger', '\rdanger'].map((value) => [{ type: 'text' as const, value }, { type: 'number' as const, value: 12.5 }]) ] }]);
    expect([...workbook.slice(0, 4)]).toEqual([80, 75, 3, 4]);
    const contents = new TextDecoder().decode(workbook);
    for (const prefix of ['=danger', '+danger', '-danger', '@danger', '\tdanger', '\rdanger']) expect(contents).toContain(`'${prefix}`);
    expect(contents).toContain('<v>12.5</v>');
    expect(contents).toContain('Safe_Table');
  });
});

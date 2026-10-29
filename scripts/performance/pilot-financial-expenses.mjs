/**
 * Deterministic local transport benchmark for the Expenses initial list request.
 * It intentionally measures serialized payload + a fixed per-byte delay, not production latency.
 */
import { performance } from 'node:perf_hooks';

const records = Array.from({ length: 121 }, (_, index) => ({
  id: `expense-${index + 1}`,
  condominium_id: '60000000-0000-4000-8000-000000000001',
  category_id: `category-${index % 8}`,
  vendor_id: `vendor-${index % 20}`,
  description: `Servicio de mantenimiento mensual ${index + 1}`,
  invoice_number: `INV-2026-${String(index + 1).padStart(4, '0')}`,
  expense_date: '2026-10-28',
  amount: '1234.56',
  currency_code: 'USD',
  status: 'approved',
  notes: 'Synthetic fixture payload used only for the repeatable Pilot 6 benchmark.',
}));
const iterations = 40;
const percentile = (values, p) => values[Math.ceil(values.length * p) - 1];

async function measure(name, payload) {
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  const samples = await Promise.all(
    Array.from({ length: iterations }, async () => {
      const started = performance.now();
      // Fixed 0.02ms/byte replaces network variability while preserving payload cost.
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(bytes * 0.02)));
      return performance.now() - started;
    }),
  );
  samples.sort((left, right) => left - right);
  return { name, bytes, p75Ms: percentile(samples, 0.75), p95Ms: percentile(samples, 0.95) };
}

const results = await Promise.all([
  measure('before-full-catalog', records),
  measure('after-page-50', { items: records.slice(0, 50), page: 1, pageSize: 50, total: 121 }),
]);
console.table(
  results.map((result) => ({
    path: result.name,
    bytes: result.bytes,
    p75_ms: result.p75Ms.toFixed(1),
    p95_ms: result.p95Ms.toFixed(1),
  })),
);

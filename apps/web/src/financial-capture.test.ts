import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFile(new URL(relative, import.meta.url), 'utf8');

describe('financial capture orchestration', () => {
  it('routes new payments through the guided capture drawer only', async () => {
    const page = await source('./pages/PaymentsPage.tsx');

    expect(page).toContain("import { PaymentCaptureDrawer }");
    expect(page).toContain("drawer?.type === 'create'");
    expect(page).toContain("drawer={drawer?.type === 'create' ? null : drawer}");
  });

  it('creates a payment once and uploads proof against the returned draft id', async () => {
    const capture = await source('./features/payments/components/PaymentCaptureDrawer.tsx');

    expect(capture).toContain('const idempotencyKey = useRef(crypto.randomUUID())');
    expect(capture).toContain('idempotencyKey: idempotencyKey.current');
    expect(capture).toContain('setCreatedPayment(payment)');
    expect(capture).toContain('paymentId={createdPayment.id}');
    expect(capture).toContain("requiresProof && !proofSaved");
  });

  it('keeps expense proof upload on the expense draft returned by creation', async () => {
    const page = await source('./pages/ExpensesPage.tsx');
    const capture = await source('./features/expenses/ExpenseCaptureDrawer.tsx');

    expect(page).toContain('ExpenseCaptureDrawer');
    expect(capture).toContain('setCreatedExpense(expense)');
    expect(capture).toContain('/expenses/${createdExpense.id}/attachments');
    expect(capture).toContain('setProofSaved(true)');
    expect(capture).toContain('JPEG, PNG, WebP o PDF');
  });

  it('never submits, approves or posts to treasury from capture', async () => {
    const paymentCapture = await source(
      './features/payments/components/PaymentCaptureDrawer.tsx',
    );
    const expenseCapture = await source('./features/expenses/ExpenseCaptureDrawer.tsx');

    for (const capture of [paymentCapture, expenseCapture]) {
      expect(capture).not.toContain('/approve');
      expect(capture).not.toContain('/submit');
      expect(capture).not.toContain('/treasury/');
    }
  });
});

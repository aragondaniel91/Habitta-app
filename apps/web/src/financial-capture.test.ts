import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFile(new URL(relative, import.meta.url), 'utf8');

describe('financial capture orchestration', () => {
  it('routes new payments through the guided capture drawer only', async () => {
    // HAB-417 split the payments route into a resident experience and the administrative one, so
    // the drawer no longer lives in PaymentsPage -- that file is now a router. The contract is
    // about where new payments are created, not about which file holds the JSX, so it follows the
    // administrative surface that actually owns treasury capture.
    const router = await source('./pages/PaymentsPage.tsx');
    const admin = await source('./pages/AdminPaymentsPage.tsx');

    expect(router).toContain('usesResidentDashboard(roles)');
    expect(router).toContain('ResidentPaymentsPage');
    expect(router).toContain('AdminPaymentsPage');

    expect(admin).toContain('import { PaymentCaptureDrawer }');
    expect(admin).toContain("drawer?.type === 'create'");
    expect(admin).toContain("drawer={drawer?.type === 'create' ? null : drawer}");
  });

  it('creates a payment once and uploads proof against the returned draft id', async () => {
    const capture = await source('./features/payments/components/PaymentCaptureDrawer.tsx');

    expect(capture).toContain('import { FormActions, FormGrid }');
    for (const name of [
      'unitId',
      'paymentMethodId',
      'paymentDate',
      'originalCurrencyCode',
      'originalAmount',
      'payerName',
      'reference',
      'notes',
    ]) {
      expect(capture).toContain(`name="${name}"`);
    }
    // The invariant is one payment identity per capture, not the name of the state setter that
    // holds it. What must stay true: creation carries an idempotency key, editing does not
    // manufacture a new one, and the proof is uploaded against the identity creation returned.
    expect(capture).toContain('const idempotencyKey = useRef(crypto.randomUUID())');
    expect(capture).toMatch(/\(payment \? \{\} : \{ idempotencyKey: idempotencyKey\.current \}\)/);

    const savedState = capture.match(/const \[(\w+), (set\w+)\] = useState<Payment>\(\)/);
    expect(savedState).not.toBeNull();
    const [, saved, setSaved] = savedState ?? [];

    // Exactly one creation, and the returned payment is what the rest of the drawer works from.
    expect(capture).toContain(`${setSaved}(`);
    expect(capture).toMatch(new RegExp(`if \\(${saved}\\) return;`));
    expect(capture).toContain(`paymentId={${saved}.id}`);
    expect(capture).toContain('requiresProof && !proofSaved');
    expect(capture).toContain('<FormActions className="financial-capture-footer" sticky>');
  });

  it('keeps expense proof upload on the expense draft returned by creation', async () => {
    const page = await source('./pages/ExpensesPage.tsx');
    const capture = await source('./features/expenses/ExpenseCaptureDrawer.tsx');

    expect(page).toContain('ExpenseCaptureDrawer');
    expect(capture).toContain('setCreatedExpense(expense)');
    expect(capture).toContain('/expenses/${createdExpense.id}/attachments');
    expect(capture).toContain('setProofSaved(true)');
    expect(capture).toContain('JPEG, PNG, WebP o PDF');
    for (const key of [
      'categoryId',
      'vendorId',
      'description',
      'invoiceNumber',
      'expenseDate',
      'dueDate',
      'amount',
      'currencyCode',
      'paymentMethod',
      'paymentReference',
      'notes',
    ]) {
      expect(capture).toContain(`${key},`);
    }
    expect(capture).toContain('<FormGrid columns={3}>');
    expect(capture).toContain('<FormActions className="financial-capture-footer" sticky>');
  });

  it('never approves or posts to treasury from capture', async () => {
    const paymentCapture = await source('./features/payments/components/PaymentCaptureDrawer.tsx');
    const expenseCapture = await source('./features/expenses/ExpenseCaptureDrawer.tsx');

    // These never become reachable from a capture surface, in either experience. Approval and
    // treasury posting are decisions somebody else makes about a payment that already exists.
    for (const capture of [paymentCapture, expenseCapture]) {
      expect(capture).not.toContain('/approve');
      expect(capture).not.toContain('/reverse');
      expect(capture).not.toContain('/treasury/');
      expect(capture).not.toContain('/allocations');
    }

    // Expense capture keeps the original absolute rule: it has no send-for-review step at all.
    expect(expenseCapture).not.toContain('/submit');
  });

  it('submits to review only in the explicit resident mode, and only after the required proof', async () => {
    const capture = await source('./features/payments/components/PaymentCaptureDrawer.tsx');
    const resident = await source('./pages/ResidentPaymentsPage.tsx');
    const admin = await source('./pages/AdminPaymentsPage.tsx');

    // HAB-417 gave the resident flow a way to finish: draft, proof, then send to review. That is a
    // new capability, so it gets an explicit contract rather than a loosened one. Submitting means
    // handing the payment to review -- it is not approval, allocation or a ledger posting, and the
    // assertions above still forbid all three.
    expect(capture).toContain('submitOnComplete = false');
    expect(capture).toContain('if (!submitOnComplete) {');
    expect(capture).toMatch(/payments\/\$\{savedPayment\.id\}\/submit/);

    // The precondition lives in the handler, not only in the button's disabled state: a guard that
    // exists solely in the markup is one re-render away from not existing.
    expect(capture).toMatch(
      /if \(requiresProof && !proofSaved && !editing\) \{[\s\S]{0,200}?return;/,
    );

    // Off unless a surface opts in, and only the resident surface does.
    expect(resident).toContain('submitOnComplete');
    expect(admin).not.toContain('submitOnComplete');
  });
});

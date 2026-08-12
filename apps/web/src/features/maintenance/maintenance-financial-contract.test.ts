import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceSource = readFileSync(
  fileURLToPath(new URL('./MaintenanceFinancialWorkspace.tsx', import.meta.url)),
  'utf8',
);
const documentApiSource = readFileSync(
  fileURLToPath(new URL('../documents/api.ts', import.meta.url)),
  'utf8',
);

describe('HAB-133 maintenance financial browser contract', () => {
  it('creates and decides quotes through the dedicated work-order endpoints', () => {
    expect(workspaceSource).toContain('/quotes`');
    expect(workspaceSource).toContain('/decision`');
    expect(workspaceSource).toContain("decideQuote(quote.id, 'approve')");
    expect(workspaceSource).toContain("decideQuote(quote.id, 'reject')");
  });

  it('links an existing expense by identifiers only', () => {
    expect(workspaceSource).toContain(
      'JSON.stringify({ expenseId, quoteId: expenseQuoteId || undefined })',
    );
    expect(workspaceSource).not.toContain('expenseAmount');
    expect(workspaceSource).not.toContain('treasuryAccountId');
  });

  it('sends quote context as an upload header', () => {
    expect(documentApiSource).toContain("headers.set('X-Quote-Id', metadata.quoteId)");
  });
});

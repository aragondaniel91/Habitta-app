import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const apiUrl = new URL('./community-api.ts', import.meta.url);
const pageUrl = new URL('../../pages/DocumentsPage.tsx', import.meta.url);

describe('budget community document links', () => {
  it('routes budget links through the tenant-safe budget endpoint', async () => {
    const source = await readFile(apiUrl, 'utf8');
    expect(source).toContain("| 'budget';");
    expect(source).toContain("input.targetType === 'budget'");
    expect(source).toContain(
      '`/v1/condominiums/${condominiumId}/budgets/${input.targetId}/community-document-link`',
    );
  });

  it('renders budget links with a real label and module destination', async () => {
    const source = await readFile(pageUrl, 'utf8');
    expect(source).toContain("budget: 'Presupuesto'");
    expect(source).toContain("budget: '/app/budgets'");
  });
});

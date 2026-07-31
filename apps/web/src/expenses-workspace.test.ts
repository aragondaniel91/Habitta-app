import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const appUrl = new URL('./App.tsx', import.meta.url);
const mainUrl = new URL('./main.tsx', import.meta.url);
const pageUrl = new URL('./pages/ExpensesPage.tsx', import.meta.url);

describe('expenses workspace', () => {
  it('routes the expenses module to the real workspace and loads its styles', async () => {
    const [app, main] = await Promise.all([readFile(appUrl, 'utf8'), readFile(mainUrl, 'utf8')]);

    expect(app).toContain("currentRoute.key === 'expenses'");
    expect(app).toContain('<ExpensesPage');
    expect(main).toContain("import './expenses.css'");
  });

  it('keeps currencies separate and uses lifecycle actions instead of destructive edits', async () => {
    const page = await readFile(pageUrl, 'utf8');

    expect(page).toContain('Moneda independiente');
    expect(page).toContain('expense.currency_code');
    expect(page).toContain('/approve');
    expect(page).toContain('/paid');
    expect(page).toContain('/void');
    expect(page).not.toContain("method: 'DELETE'");
  });
});

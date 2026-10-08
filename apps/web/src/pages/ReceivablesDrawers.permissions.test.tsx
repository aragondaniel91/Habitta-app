import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RolesProvider } from '../lib/roles';
import { ReceivablesDrawerHost } from './ReceivablesDrawers';

const pageSource = readFileSync(new URL('./ReceivablesPage.tsx', import.meta.url), 'utf8');

const selectedReceivable = {
  id: 'receivable-1',
  unit_id: 'unit-1',
  description: 'Cuota ordinaria',
  currency_code: 'USD',
  outstanding_amount: '100.00',
  status: 'open',
  issue_date: '2026-10-01',
  due_date: '2026-10-10',
};

const renderDrawer = (
  roles: Parameters<typeof RolesProvider>[0]['value'],
  mode: 'receivable' | 'manual' | 'concept',
) =>
  renderToStaticMarkup(
    <RolesProvider value={roles}>
      <ReceivablesDrawerHost
        buildingNameById={{}}
        concepts={[]}
        condominiumId="condominium-1"
        mode={mode}
        onClose={() => undefined}
        onRefresh={async () => undefined}
        selectedCurrency="USD"
        selectedReceivable={selectedReceivable}
        session={{} as never}
        units={[{ id: 'unit-1', code: 'A-101', building_id: null }]}
      />
    </RolesProvider>,
  );

describe('Receivables write affordances', () => {
  it('does not offer a read-only role a charge reversal', () => {
    expect(renderDrawer(['board_member'], 'receivable')).not.toContain('Reversar cargo');
  });

  it('keeps reversal available to financial managers', () => {
    expect(renderDrawer(['accountant'], 'receivable')).toContain('Reversar cargo');
  });

  it('does not render write drawers when a stale client requests one', () => {
    expect(renderDrawer(['board_member'], 'manual')).toBe('');
    expect(renderDrawer(['board_member'], 'concept')).toBe('');
  });

  it('does not offer catalog or opening-balance writes from the Receivables workspace', () => {
    expect(pageSource).toMatch(
      /receivables-tools-menu[\s\S]*\{manage \? \([\s\S]*Nuevo concepto[\s\S]*Importar saldos/,
    );
  });
});

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Personas and Unidades preservation messaging', () => {
  it('keeps relationship changes in Personas and explains the non-destructive cross-module result', async () => {
    const [people, unitDetail] = await Promise.all([
      read('./features/people/PeoplePanelV3.tsx'),
      read('./features/units/UnitDetailDrawer.tsx'),
    ]);

    expect(people).toContain('Cerrar relación activa');
    expect(people).toMatch(/La persona y su relaci.n con la unidad no se eliminan\./);
    expect(unitDetail).toContain('Los cambios de propietario u ocupante se realizan desde Personas');
    expect(unitDetail).toMatch(/una sola\s+identidad por persona/);
    expect(unitDetail).toMatch(/historial consistente entre m.dulos/);
  });
});

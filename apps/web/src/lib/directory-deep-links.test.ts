import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  directoryDetailHref,
  directoryRequestedCondominium,
  directoryRequestedId,
  findDirectoryTarget,
} from './directory-deep-links';

const person = '22222222-2222-4222-8222-222222222221';
const unit = '33333333-3333-4333-8333-333333333331';
const condominium = '44444444-4444-4444-8444-444444444441';

describe('Directory deep links', () => {
  it('opens exactly one known person or unit identifier', () => {
    expect(directoryDetailHref('people', person)).toBe('/app/people?person=' + person);
    expect(directoryDetailHref('units', unit)).toBe('/app/units?unit=' + unit);
    expect(directoryRequestedId('people', '?person=' + person)).toBe(person);
    expect(directoryRequestedId('units', '?unit=' + unit)).toBe(unit);
    expect(directoryRequestedId('people', '?unit=' + unit)).toBeNull();
  });
  it('preserves a multi-condominium context only as an authorized selection hint', () => {
    const href = directoryDetailHref('people', person, condominium);
    expect(href).toBe('/app/people?person=' + person + '&condominium=' + condominium);
    expect(directoryRequestedId('people', href.split('?')[1]!)).toBe(person);
    expect(directoryRequestedCondominium(href.split('?')[1]!)).toBe(condominium);
    expect(directoryRequestedCondominium('?condominium=not-a-uuid')).toBeNull();
    expect(
      directoryRequestedCondominium('?condominium=' + condominium + '&condominium=' + condominium),
    ).toBeNull();
    expect(() => directoryDetailHref('units', unit, '../other-tenant')).toThrow('Invalid');
  });

  it('resolves only a record present in the current authorized directory', () => {
    const currentTenant = [{ id: person, label: 'A' }];
    expect(findDirectoryTarget(currentTenant, person)).toEqual(currentTenant[0]);
    expect(findDirectoryTarget(currentTenant, unit)).toBeNull();
    expect(findDirectoryTarget(currentTenant, 'not-valid')).toBeNull();
    expect(findDirectoryTarget(currentTenant, null)).toBeNull();
  });

  it('wires both modules through role-gated in-app navigation', () => {
    const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
    const app = read('../App.tsx');
    const unitsPage = read('../pages/UnitsPage.tsx');
    const peoplePage = read('../features/people/PeoplePanelV3.tsx');
    const unitDrawer = read('../features/units/UnitDetailDrawer.tsx');
    expect(app).toContain('const route = visibleRoutes.find((item) => item.key === destination)');
    expect(app).toContain('window.history.replaceState');
    expect(app).toContain("onOpenPerson={(personId) => navigateDirectory('people', personId)}");
    expect(app).toContain("onOpenUnit={(unitId) => navigateDirectory('units', unitId)}");
    expect(unitsPage).toContain('findDirectoryTarget(directory.units, requestedUnitId)');
    expect(peoplePage).toContain('findDirectoryTarget(people, requestedPersonId)');
    expect(peoplePage).toContain('directoryLoadedFor !== condominiumId');
    expect(unitDrawer).toContain('canViewPeople && isDirectoryIdentifier(person.personId)');
    expect(peoplePage).toContain('canOpenUnits && isDirectoryIdentifier(relationship.unitId)');
  });

  it('rejects duplicate, malformed or injected identifiers', () => {
    expect(directoryRequestedId('people', '?person=' + person + '&person=' + unit)).toBeNull();
    expect(directoryRequestedId('people', '?person=%3Cscript%3E')).toBeNull();
    expect(directoryRequestedId('units', '?unit=not-an-id')).toBeNull();
    expect(() => directoryDetailHref('people', '../payments')).toThrow('Invalid');
    expect(() => directoryDetailHref('units', 'x?admin=true')).toThrow('Invalid');
  });
});

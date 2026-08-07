import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const fixtureUrl = new URL('../fixtures/financial.fixture.json', import.meta.url);

test('mantiene seguro y determinista el fixture financiero', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8')) as {
    schemaVersion: number;
    fixtureId: string;
    environment: string;
    condominiums: Array<{ key: string; units: Array<{ code: string }> }>;
    users: Array<{ key: string; email: string; condominium: string }>;
    financial: {
      chargeConcept: { code: string; amount: string };
      paymentMethod: { code: string };
      openingState: { unitCode: string; receivableAmount: string };
    };
  };

  expect(fixture.schemaVersion).toBe(1);
  expect(fixture.environment).toBe('isolated-test-only');
  expect(fixture.fixtureId).toMatch(/^habitta-financial-e2e-/);

  const condominiumKeys = fixture.condominiums.map(({ key }) => key);
  expect(new Set(condominiumKeys).size).toBe(condominiumKeys.length);
  expect(condominiumKeys).toEqual(expect.arrayContaining(['primary', 'isolation']));

  const unitCodes = fixture.condominiums.flatMap(({ units }) => units.map(({ code }) => code));
  expect(new Set(unitCodes).size).toBe(unitCodes.length);
  expect(unitCodes.every((code) => code.startsWith('E2E-'))).toBe(true);

  const userKeys = fixture.users.map(({ key }) => key);
  expect(userKeys).toEqual(
    expect.arrayContaining(['administrator', 'reviewer', 'payer', 'isolationUser']),
  );
  expect(fixture.users.every(({ email }) => email.endsWith('@example.invalid'))).toBe(true);
  expect(fixture.users.every(({ condominium }) => condominiumKeys.includes(condominium))).toBe(true);

  expect(fixture.financial.chargeConcept.code).toMatch(/^E2E-/);
  expect(fixture.financial.paymentMethod.code).toMatch(/^E2E-/);
  expect(unitCodes).toContain(fixture.financial.openingState.unitCode);
  expect(fixture.financial.chargeConcept.amount).toMatch(/^\d+\.\d{2}$/);
  expect(fixture.financial.openingState.receivableAmount).toMatch(/^\d+\.\d{2}$/);
});

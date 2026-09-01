import { readFile } from 'node:fs/promises';

const fixtureUrl = new URL('../fixtures/financial.fixture.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));

const fail = (message) => {
  throw new Error(`Invalid financial E2E fixture: ${message}`);
};

if (fixture.schemaVersion !== 1) fail('schemaVersion must be 1');
if (fixture.environment !== 'isolated-test-only') fail('environment must be isolated-test-only');
if (!fixture.fixtureId?.startsWith('habitta-financial-e2e-')) {
  fail('fixtureId must use the habitta-financial-e2e- prefix');
}

const condominiums = fixture.condominiums ?? [];
if (condominiums.length < 2) fail('at least two condominiums are required for isolation tests');

const condominiumKeys = new Set(condominiums.map(({ key }) => key));
if (condominiumKeys.size !== condominiums.length) fail('condominium keys must be unique');
if (!condominiumKeys.has('primary') || !condominiumKeys.has('isolation')) {
  fail('primary and isolation condominiums are required');
}

const unitCodes = condominiums.flatMap(({ units = [] }) => units.map(({ code }) => code));
if (new Set(unitCodes).size !== unitCodes.length) fail('unit codes must be unique');
if (unitCodes.some((code) => !code?.startsWith('E2E-'))) {
  fail('every unit code must use the E2E- prefix');
}

const users = fixture.users ?? [];
const requiredUsers = new Set([
  'administrator',
  'reviewer',
  'payer',
  'familyResident',
  'authorizedResident',
  'isolationUser',
]);
for (const user of users) {
  requiredUsers.delete(user.key);
  if (!user.email?.endsWith('@example.invalid')) fail(`${user.key} must use example.invalid`);
  if (!condominiumKeys.has(user.condominium)) fail(`${user.key} references an unknown condominium`);
}
if (requiredUsers.size > 0) fail(`missing users: ${[...requiredUsers].join(', ')}`);

const financial = fixture.financial;
if (!financial?.chargeConcept?.code?.startsWith('E2E-')) fail('charge concept code must use E2E-');
if (!financial?.paymentMethod?.code?.startsWith('E2E-')) fail('payment method code must use E2E-');
if (!unitCodes.includes(financial?.openingState?.unitCode)) fail('openingState unit must exist');

for (const value of [
  financial?.chargeConcept?.amount,
  financial?.openingState?.receivableAmount,
  financial?.openingState?.expectedPendingBalance,
  financial?.openingState?.expectedApprovedBalance,
]) {
  if (!/^\d+\.\d{2}$/.test(value ?? '')) fail(`invalid monetary value: ${value}`);
}

const configuredBaseUrl = process.env.E2E_BASE_URL;
if (configuredBaseUrl) {
  const hostname = new URL(configuredBaseUrl).hostname;
  if (hostname === 'habitta-web-prod.pages.dev' || hostname.includes('prod')) {
    fail(`production-like E2E_BASE_URL is forbidden: ${hostname}`);
  }
}

console.log(`financial fixture ${fixture.fixtureId} is valid`);

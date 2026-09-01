import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const fixtureUrl = new URL('../fixtures/financial.fixture.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.E2E_FIXTURE_PASSWORD;

const fail = (message) => {
  throw new Error(`Financial E2E provisioning refused: ${message}`);
};

if (!supabaseUrl) fail('SUPABASE_URL is required');
if (!serviceRoleKey) fail('SUPABASE_SERVICE_ROLE_KEY is required');
if (!password || password.length < 12)
  fail('E2E_FIXTURE_PASSWORD must contain at least 12 characters');
if (fixture.environment !== 'isolated-test-only')
  fail('fixture environment must be isolated-test-only');

const target = new URL(supabaseUrl);
const localHosts = new Set(['127.0.0.1', 'localhost']);
if (!localHosts.has(target.hostname) || target.port !== '54321') {
  fail(`only the local Supabase API at localhost:54321 is allowed, received ${target.host}`);
}

const ids = {
  organization: '11111111-1111-4111-8111-111111111111',
  primaryCondominium: '22222222-2222-4222-8222-222222222221',
  isolationCondominium: '22222222-2222-4222-8222-222222222222',
  primaryUnitA101: '33333333-3333-4333-8333-333333333331',
  primaryUnitA102: '33333333-3333-4333-8333-333333333332',
  isolationUnitB201: '33333333-3333-4333-8333-333333333333',
  payerPerson: '44444444-4444-4444-8444-444444444441',
  additionalRecipientPerson: '44444444-4444-4444-8444-444444444442',
  unrelatedRecipientPerson: '44444444-4444-4444-8444-444444444443',
  familyResidentPerson: '44444444-4444-4444-8444-444444444444',
  authorizedResidentPerson: '44444444-4444-4444-8444-444444444445',
  payerOwnership: '55555555-5555-4555-8555-555555555551',
  chargeConcept: '66666666-6666-4666-8666-666666666661',
  paymentMethod: '77777777-7777-4777-8777-777777777771',
  receivableItem: '88888888-8888-4888-8888-888888888881',
  receivableEntry: '99999999-9999-4999-8999-999999999991',
};

const apiHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

const request = async (path, options = {}) => {
  const response = await fetch(new URL(path, supabaseUrl), {
    ...options,
    headers: { ...apiHeaders, ...options.headers },
  });

  const body = await response.text();
  if (!response.ok) {
    fail(`${options.method ?? 'GET'} ${path} returned ${response.status}: ${body}`);
  }

  return body ? JSON.parse(body) : null;
};

const insert = async (table, rows) =>
  request(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });

const createUser = async (user) => {
  const result = await request('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: user.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `Habitta E2E ${user.key}`,
        fixture_id: fixture.fixtureId,
      },
    }),
  });

  return result.user ?? result;
};

const usersByKey = new Map();
for (const user of fixture.users) {
  usersByKey.set(user.key, await createUser(user));
}

const adminId = usersByKey.get('administrator')?.id;
const reviewerId = usersByKey.get('reviewer')?.id;
const payerId = usersByKey.get('payer')?.id;
const additionalRecipientId = usersByKey.get('additionalRecipient')?.id;
const unrelatedRecipientId = usersByKey.get('unrelatedRecipient')?.id;
const familyResidentId = usersByKey.get('familyResident')?.id;
const authorizedResidentId = usersByKey.get('authorizedResident')?.id;
const isolationUserId = usersByKey.get('isolationUser')?.id;
if (
  ![
    adminId,
    reviewerId,
    payerId,
    additionalRecipientId,
    unrelatedRecipientId,
    familyResidentId,
    authorizedResidentId,
    isolationUserId,
  ].every(Boolean)
) {
  fail('Supabase did not return every required auth user id');
}

await insert('organizations', {
  id: ids.organization,
  name: `${fixture.organization.name} [${fixture.fixtureId}]`,
  created_by: adminId,
});

await insert('condominiums', [
  {
    id: ids.primaryCondominium,
    organization_id: ids.organization,
    name: fixture.condominiums.find(({ key }) => key === 'primary').name,
    created_by: adminId,
  },
  {
    id: ids.isolationCondominium,
    organization_id: ids.organization,
    name: fixture.condominiums.find(({ key }) => key === 'isolation').name,
    created_by: isolationUserId,
  },
]);

await insert('condominium_memberships', [
  { condominium_id: ids.primaryCondominium, user_id: adminId, role: 'condominium_admin' },
  { condominium_id: ids.primaryCondominium, user_id: reviewerId, role: 'payment_reviewer' },
  { condominium_id: ids.primaryCondominium, user_id: payerId, role: 'owner' },
  { condominium_id: ids.primaryCondominium, user_id: additionalRecipientId, role: 'owner' },
  { condominium_id: ids.primaryCondominium, user_id: unrelatedRecipientId, role: 'owner' },
  { condominium_id: ids.primaryCondominium, user_id: familyResidentId, role: 'family_member' },
  {
    condominium_id: ids.primaryCondominium,
    user_id: authorizedResidentId,
    role: 'authorized_occupant',
  },
  {
    condominium_id: ids.isolationCondominium,
    user_id: isolationUserId,
    role: 'condominium_admin',
  },
]);

await insert('units', [
  {
    id: ids.primaryUnitA101,
    condominium_id: ids.primaryCondominium,
    code: 'E2E-A101',
    type: 'apartment',
    created_by: adminId,
  },
  {
    id: ids.primaryUnitA102,
    condominium_id: ids.primaryCondominium,
    code: 'E2E-A102',
    type: 'apartment',
    created_by: adminId,
  },
  {
    id: ids.isolationUnitB201,
    condominium_id: ids.isolationCondominium,
    code: 'E2E-B201',
    type: 'apartment',
    created_by: isolationUserId,
  },
]);

await insert('people', [
  {
    id: ids.payerPerson,
    condominium_id: ids.primaryCondominium,
    auth_user_id: payerId,
    first_name: 'Habitta',
    last_name: 'E2E Payer',
    email: fixture.users.find(({ key }) => key === 'payer').email,
    created_by: adminId,
  },
  {
    id: ids.additionalRecipientPerson,
    condominium_id: ids.primaryCondominium,
    auth_user_id: additionalRecipientId,
    first_name: 'Habitta',
    last_name: 'E2E Additional',
    email: fixture.users.find(({ key }) => key === 'additionalRecipient').email,
    created_by: adminId,
  },
  {
    id: ids.unrelatedRecipientPerson,
    condominium_id: ids.primaryCondominium,
    auth_user_id: unrelatedRecipientId,
    first_name: 'Habitta',
    last_name: 'E2E Unrelated',
    email: fixture.users.find(({ key }) => key === 'unrelatedRecipient').email,
    created_by: adminId,
  },
  {
    id: ids.familyResidentPerson,
    condominium_id: ids.primaryCondominium,
    auth_user_id: familyResidentId,
    first_name: 'Habitta',
    last_name: 'E2E Family',
    email: fixture.users.find(({ key }) => key === 'familyResident').email,
    created_by: adminId,
  },
  {
    id: ids.authorizedResidentPerson,
    condominium_id: ids.primaryCondominium,
    auth_user_id: authorizedResidentId,
    first_name: 'Habitta',
    last_name: 'E2E Authorized',
    email: fixture.users.find(({ key }) => key === 'authorizedResident').email,
    created_by: adminId,
  },
]);

await insert('unit_owners', {
  id: ids.payerOwnership,
  unit_id: ids.primaryUnitA101,
  person_id: ids.payerPerson,
  ownership_percentage: 100,
  is_primary_contact: true,
  starts_at: '2020-01-01',
  created_by: adminId,
});

await insert('unit_occupancies', [
  {
    unit_id: ids.primaryUnitA101,
    person_id: ids.additionalRecipientPerson,
    occupancy_type: 'tenant',
    is_primary_contact: false,
    starts_at: '2020-01-01',
    created_by: adminId,
  },
  {
    unit_id: ids.primaryUnitA102,
    person_id: ids.familyResidentPerson,
    occupancy_type: 'family_member',
    is_primary_contact: false,
    starts_at: '2020-01-01',
    created_by: adminId,
  },
  {
    unit_id: ids.primaryUnitA102,
    person_id: ids.authorizedResidentPerson,
    occupancy_type: 'authorized_occupant',
    is_primary_contact: false,
    starts_at: '2020-01-01',
    created_by: adminId,
  },
]);

await insert('charge_concepts', {
  id: ids.chargeConcept,
  condominium_id: ids.primaryCondominium,
  code: fixture.financial.chargeConcept.code,
  name: fixture.financial.chargeConcept.name,
  category: fixture.financial.chargeConcept.category,
  default_currency_code: fixture.financial.chargeConcept.currencyCode,
  default_amount: fixture.financial.chargeConcept.amount,
  created_by: adminId,
});

await insert('condominium_payment_methods', {
  id: ids.paymentMethod,
  condominium_id: ids.primaryCondominium,
  method_type: 'bank_transfer',
  display_name: fixture.financial.paymentMethod.name,
  currency_code: fixture.condominiums.find(({ key }) => key === 'primary').currencyCode,
  instructions: `fixture=${fixture.fixtureId};code=${fixture.financial.paymentMethod.code}`,
  requires_reference: true,
  requires_proof: false,
  created_by: adminId,
});

await insert('receivable_items', {
  id: ids.receivableItem,
  condominium_id: ids.primaryCondominium,
  unit_id: ids.primaryUnitA101,
  concept_id: ids.chargeConcept,
  item_type: 'charge',
  description: `${fixture.financial.chargeConcept.name} [${fixture.fixtureId}]`,
  reference: fixture.fixtureId,
  issue_date: '2026-08-01',
  due_date: '2026-08-15',
  currency_code: fixture.financial.chargeConcept.currencyCode,
  original_amount: fixture.financial.openingState.receivableAmount,
  created_by: adminId,
});

await insert('receivable_ledger_entries', {
  id: ids.receivableEntry,
  condominium_id: ids.primaryCondominium,
  unit_id: ids.primaryUnitA101,
  receivable_item_id: ids.receivableItem,
  entry_type: 'charge',
  direction: 'debit',
  amount: fixture.financial.openingState.receivableAmount,
  currency_code: fixture.financial.chargeConcept.currencyCode,
  effective_date: '2026-08-01',
  description: `Financial E2E opening charge ${randomUUID()}`,
  source_id: ids.chargeConcept,
  created_by: adminId,
});

console.log(
  JSON.stringify(
    {
      fixtureId: fixture.fixtureId,
      target: target.origin,
      users: Object.fromEntries([...usersByKey].map(([key, user]) => [key, user.email])),
      primaryCondominiumId: ids.primaryCondominium,
      primaryUnitId: ids.primaryUnitA101,
      residentUnitId: ids.primaryUnitA102,
      receivableItemId: ids.receivableItem,
      paymentMethodId: ids.paymentMethod,
    },
    null,
    2,
  ),
);

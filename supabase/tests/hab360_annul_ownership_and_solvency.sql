begin;
select plan(27);

select has_function(
  'public',
  'revert_unit_ownership_transfer',
  array['uuid','uuid','text'],
  'ownership transfer revert RPC exists'
);
select has_function(
  'public',
  'annul_solvency_certificate',
  array['uuid','uuid','text'],
  'solvency certificate annulment RPC exists'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000036401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab360o-admin@test.local', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000036402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hab360o-board@test.local', 'x', now(), now());

insert into public.organizations (id, name, created_by)
values ('36400000-0000-4000-8000-000000000001', 'HAB 360O Org', '00000000-0000-0000-0000-000000036401');

insert into public.condominiums (id, organization_id, name, created_by)
values ('36410000-0000-4000-8000-000000000001', '36400000-0000-4000-8000-000000000001', 'HAB 360O Condo', '00000000-0000-0000-0000-000000036401');

insert into public.organization_memberships (organization_id, user_id, role)
values ('36400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036401', 'organization_owner');

insert into public.condominium_memberships (condominium_id, user_id, role)
values
  ('36410000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036401', 'condominium_admin'),
  ('36410000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036402', 'board_member');

insert into public.buildings (id, condominium_id, name, created_by)
values ('36420000-0000-4000-8000-000000000001', '36410000-0000-4000-8000-000000000001', 'Torre HAB 360O', '00000000-0000-0000-0000-000000036401');

insert into public.units (id, condominium_id, building_id, code, type, ownership_percentage, created_by)
values ('36430000-0000-4000-8000-000000000001', '36410000-0000-4000-8000-000000000001', '36420000-0000-4000-8000-000000000001', 'O-01', 'apartment', 100, '00000000-0000-0000-0000-000000036401');

insert into public.people (id, condominium_id, first_name, last_name, status, created_by)
values
  ('36440000-0000-4000-8000-000000000001', '36410000-0000-4000-8000-000000000001', 'Ana', 'Original', 'active', '00000000-0000-0000-0000-000000036401'),
  ('36440000-0000-4000-8000-000000000002', '36410000-0000-4000-8000-000000000001', 'Beto', 'Equivocado', 'active', '00000000-0000-0000-0000-000000036401');

insert into public.unit_owners (unit_id, person_id, ownership_percentage, is_primary_contact, starts_at, created_by)
values ('36430000-0000-4000-8000-000000000001', '36440000-0000-4000-8000-000000000001', 100, true, current_date - 400, '00000000-0000-0000-0000-000000036401');

insert into public.condominium_solvency_policies (condominium_id, updated_by)
values ('36410000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000036401');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036401', true);

select lives_ok(
  $$select public.transfer_unit_ownership('36410000-0000-4000-8000-000000000001','36430000-0000-4000-8000-000000000001',current_date - 1,'[{"person_id":"36440000-0000-4000-8000-000000000002","ownership_percentage":100,"is_primary_contact":true}]'::jsonb,null,'Traspaso equivocado')$$,
  'a transfer moves the unit to the wrong owner'
);
select is(
  (select person_id from public.unit_owners where unit_id='36430000-0000-4000-8000-000000000001' and ends_at is null),
  '36440000-0000-4000-8000-000000000002'::uuid,
  'the wrong owner currently holds the unit'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036402', true);
select throws_ok(
  $$select public.revert_unit_ownership_transfer('36410000-0000-4000-8000-000000000001',(select id from public.ownership_transfers where notes='Traspaso equivocado'),'Intento board')$$,
  'P0001',
  'permission denied',
  'a board member cannot revert an ownership transfer'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036401', true);

select throws_ok(
  $$select public.revert_unit_ownership_transfer('36410000-0000-4000-8000-000000000001',(select id from public.ownership_transfers where notes='Traspaso equivocado'),'no')$$,
  'P0001',
  'invalid ownership revert',
  'a revert requires a written reason'
);

select lives_ok(
  $$select public.revert_unit_ownership_transfer('36410000-0000-4000-8000-000000000001',(select id from public.ownership_transfers where notes='Traspaso equivocado'),'Se registro la unidad equivocada')$$,
  'the administrator reverts the mistaken transfer'
);
select is(
  (select person_id from public.unit_owners where unit_id='36430000-0000-4000-8000-000000000001' and ends_at is null),
  '36440000-0000-4000-8000-000000000001'::uuid,
  'the previous owner holds the unit again'
);
select is(
  (select count(*) from public.unit_owners where unit_id='36430000-0000-4000-8000-000000000001'),
  3::bigint,
  'the revert opens a fresh row instead of reopening closed history'
);
select is(
  (select count(*) from public.ownership_transfers where unit_id='36430000-0000-4000-8000-000000000001'),
  2::bigint,
  'the original transfer is preserved and a compensating one is recorded'
);
select is(
  (select notes from public.ownership_transfers where reverts_transfer_id is not null),
  'Reverso de traspaso: Se registro la unidad equivocada',
  'the compensating transfer states why it exists'
);
select throws_ok(
  $$select public.revert_unit_ownership_transfer('36410000-0000-4000-8000-000000000001',(select id from public.ownership_transfers where notes='Traspaso equivocado'),'Segundo intento')$$,
  'P0001',
  'only the latest ownership transfer can be reverted',
  'an older transfer can no longer be reverted once a newer one exists'
);
select throws_ok(
  $$update public.ownership_transfers set notes='bypass' where notes='Traspaso equivocado'$$,
  '42501',
  'permission denied for table ownership_transfers',
  'the original transfer still cannot be rewritten by a client'
);

-- Solvency certificates

select lives_ok(
  $$select public.issue_solvency_certificate('36410000-0000-4000-8000-000000000001','36430000-0000-4000-8000-000000000001',current_date)$$,
  'a solvency certificate is issued for a unit without debt'
);
select is(
  ((select public.verify_solvency_certificate((select verification_id from public.solvency_certificates limit 1))) ->> 'annulled')::boolean,
  false,
  'public verification reports a live certificate as valid'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036402', true);
select throws_ok(
  $$select public.annul_solvency_certificate('36410000-0000-4000-8000-000000000001',(select id from public.solvency_certificates limit 1),'Intento board')$$,
  'P0001',
  'permission denied',
  'a board member cannot annul a certificate'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000036401', true);

select lives_ok(
  $$select public.annul_solvency_certificate('36410000-0000-4000-8000-000000000001',(select id from public.solvency_certificates limit 1),'Emitida sobre la unidad equivocada')$$,
  'the administrator annuls the certificate'
);
select is(
  ((select public.verify_solvency_certificate((select verification_id from public.solvency_certificates limit 1))) ->> 'annulled')::boolean,
  true,
  'public verification stops vouching for an annulled certificate'
);
select is(
  ((select public.verify_solvency_certificate((select verification_id from public.solvency_certificates limit 1))) ->> 'within_validity_window')::boolean,
  false,
  'an annulled certificate is outside its validity window even before it expires'
);
select is(
  (select count(*) from public.solvency_certificates),
  1::bigint,
  'the certificate is preserved, never deleted'
);
select throws_ok(
  $$select public.annul_solvency_certificate('36410000-0000-4000-8000-000000000001',(select id from public.solvency_certificates limit 1),'Segundo intento')$$,
  'P0001',
  'solvency certificate already annulled',
  'a certificate cannot be annulled twice'
);
select throws_ok(
  $$update public.solvency_certificates set as_of_date=current_date - 5 where annulled_at is not null$$,
  '42501',
  'permission denied for table solvency_certificates',
  'annulment never opens the certificate itself to client rewriting'
);

-- Guards the API translates for the administrator but that nothing exercised at runtime.

select throws_ok(
  $$select public.revert_unit_ownership_transfer('36410000-0000-4000-8000-000000000001','36499999-0000-4000-8000-000000000999','Traspaso inexistente')$$,
  'P0001',
  'ownership transfer not found',
  'a transfer id outside this condominium is refused by name'
);
select throws_ok(
  $$select public.annul_solvency_certificate('36410000-0000-4000-8000-000000000001','36499999-0000-4000-8000-000000000998','Certificado inexistente')$$,
  'P0001',
  'solvency certificate not found',
  'a certificate id outside this condominium is refused by name'
);
select throws_ok(
  $$select public.annul_solvency_certificate('36410000-0000-4000-8000-000000000001',(select id from public.solvency_certificates limit 1),'no')$$,
  'P0001',
  'invalid solvency annulment',
  'an annulment still requires a written reason even on an annulled certificate'
);

-- A unit whose first transfer has no prior owners cannot be reverted: there is nothing to restore.
insert into public.units (id, condominium_id, building_id, code, type, ownership_percentage, created_by)
values ('36430000-0000-4000-8000-000000000002', '36410000-0000-4000-8000-000000000001', '36420000-0000-4000-8000-000000000001', 'O-02', 'apartment', 100, '00000000-0000-0000-0000-000000036401');

select lives_ok(
  $$select public.transfer_unit_ownership('36410000-0000-4000-8000-000000000001','36430000-0000-4000-8000-000000000002',current_date - 1,'[{"person_id":"36440000-0000-4000-8000-000000000001","ownership_percentage":100,"is_primary_contact":true}]'::jsonb,null,'Primer duenio')$$,
  'a unit receives its first owner'
);
select throws_ok(
  $$select public.revert_unit_ownership_transfer('36410000-0000-4000-8000-000000000001',(select id from public.ownership_transfers where notes='Primer duenio'),'Sin nada que restaurar')$$,
  'P0001',
  'ownership transfer has no previous owners to restore',
  'the first transfer of a unit cannot be reverted into an owner that never existed'
);

select * from finish();
rollback;

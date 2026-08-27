begin;
select plan(22);

select has_table('public','customer_invitations','the new-customer invitation exists');
select has_function('public','create_customer_invitation',array['text','text','text','text','timestamptz'],'issuing RPC exists');
select has_function('public','get_customer_invitation_preview',array['text'],'preview RPC exists');
select has_function('public','accept_customer_invitation',array['text'],'redeem RPC exists');

-- The table holds prospective customers' addresses and is reached only through the RPCs.
select is(
  (select count(*) from pg_policies where schemaname='public' and tablename='customer_invitations'),
  0::bigint,
  'no policy exposes the invitation table directly'
);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','operador@habitta.test','x',now(),now()),
('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cliente@nuevo.test','x',now(),now()),
('40000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','intruso@otro.test','x',now(),now());
insert into public.platform_admins(user_id) values ('40000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);

-- Only a platform operator may issue one: at this point there is no condominium to administer.
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.create_customer_invitation('otro@cliente.test','pro',null,null,null)$$,
  'P0001','platform administrator required',
  'an ordinary account cannot issue a customer invitation'
);

select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.create_customer_invitation('no-es-un-correo','pro',null,null,null)$$,
  'P0001','invalid email','a malformed address is refused'
);
select throws_ok(
  $$select public.create_customer_invitation('cliente@nuevo.test','pro',null,null,now() + interval '200 days')$$,
  'P0001','invalid expiration','an expiration beyond ninety days is refused'
);

select lives_ok(
  $$select public.create_customer_invitation('cliente@nuevo.test','pro','TRF-001','Pago confirmado por transferencia',null)$$,
  'the operator issues the invitation'
);
select set_config('hab400.token',(select public.create_customer_invitation('cliente@nuevo.test','pro','TRF-002',null,null) ->> 'token'),true);

-- The table is unreadable by a client role by design, so inspect it from outside one.
reset role;

-- Resending supersedes rather than duplicating: two live tokens for one address is how a revoked
-- invitation stays usable.
select is(
  (select count(*) from public.customer_invitations where email='cliente@nuevo.test' and status='pending'),
  1::bigint,
  'resending leaves exactly one live invitation'
);

select is(
  (select count(*) from public.customer_invitations where email='cliente@nuevo.test' and status='revoked'),
  1::bigint,
  'the superseded invitation is revoked, not deleted'
);
select is(
  (select count(*) from public.customer_invitations where token_hash = current_setting('hab400.token')),
  0::bigint,
  'only the hash is stored, never the raw token'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok(
  $$select count(*) from public.customer_invitations$$,
  '42501',
  'permission denied for table customer_invitations',
  'a client role cannot read prospective customers straight from the table'
);
reset role;

-- Anyone holding the link may read who it is for, before they have an account.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select is(
  (select public.get_customer_invitation_preview(current_setting('hab400.token')) ->> 'email'),
  'cliente@nuevo.test',
  'the landing page can show who the invitation is for'
);
select is(
  (select public.get_customer_invitation_preview('token-inventado') ->> 'found'),
  'false',
  'an unknown token reveals nothing'
);

-- Redemption is bound to the address it was issued to.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',true);
select throws_ok(
  format($q$select public.accept_customer_invitation('%s')$q$, current_setting('hab400.token')),
  'P0001','invitation belongs to another email',
  'a leaked link cannot be redeemed by somebody else'
);

select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
select lives_ok(
  format($q$select public.accept_customer_invitation('%s')$q$, current_setting('hab400.token')),
  'the invited customer redeems their own invitation'
);
select throws_ok(
  format($q$select public.accept_customer_invitation('%s')$q$, current_setting('hab400.token')),
  'P0001','invalid invitation',
  'a redeemed invitation cannot be replayed'
);

-- HAB-402. An invitation sent to a mistyped address stays live until it expires, and whoever owns
-- that inbox can redeem it. Resending only helps when the address was right.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
select set_config('hab400.wrong',(select public.create_customer_invitation('erroneo@tecleado.test','pro',null,null,null) ->> 'id'),true);

select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',true);
select throws_ok(
  format($q$select public.revoke_customer_invitation('%s'::uuid,'intento')$q$, current_setting('hab400.wrong')),
  'P0001','platform administrator required',
  'an ordinary account cannot revoke a customer invitation'
);

select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
select lives_ok(
  format($q$select public.revoke_customer_invitation('%s'::uuid,'Direccion mal tecleada')$q$, current_setting('hab400.wrong')),
  'the operator retires an invitation sent to the wrong address'
);
select throws_ok(
  format($q$select public.revoke_customer_invitation('%s'::uuid,null)$q$, current_setting('hab400.wrong')),
  'P0001','customer invitation is not pending',
  'a revoked invitation cannot be revoked twice'
);
reset role;
select is(
  (select status::text from public.customer_invitations where id = current_setting('hab400.wrong')::uuid),
  'revoked',
  'the record is retired, never deleted, so the mistake stays auditable'
);

select * from finish();
rollback;

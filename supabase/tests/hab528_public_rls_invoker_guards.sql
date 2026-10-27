begin;
select plan(4);

-- HAB-528: fail closed when future public relations accidentally expose rows.
-- Inspect effective schema state after replaying every migration in CI.
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity),
  0::bigint,
  'every public table, including partitions, has RLS enabled'
);

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='v'
     and not coalesce('security_invoker=true'=any(c.reloptions),false)),
  0::bigint,
  'every public view executes with invoker privileges'
);

-- A registered public view may be exposed to anon only if its underlying
-- invoker permissions and RLS allow access; never silently drop that boundary.
select ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p')) > 0,
  'audit examined a non-empty set of public tables'
);

select ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='v') > 0,
  'audit examined a non-empty set of public views'
);

select * from finish();
rollback;

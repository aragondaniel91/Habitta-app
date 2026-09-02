-- HAB-433: narrow, read-only public catalogue contract.
--
-- The underlying commercial tables remain protected exactly as HAB-410 designed them. Anonymous
-- callers receive only catalogue data that is intentionally public; customer subscriptions,
-- contracted terms, negotiated amounts and commercial events stay unreachable.

-- Supabase grants table privileges to newly-created tables by default. HAB-410 intentionally made
-- these catalogue policies authenticated-only, so remove the residual anonymous SELECT ACL rather
-- than relying on RLS alone to hide the underlying tables. Authenticated catalogue reads remain
-- unchanged; anonymous acquisition goes only through the narrow RPC below.
revoke select on public.capabilities, public.plans, public.plan_capabilities from anon;

create or replace function public.get_public_plan_catalog()
returns table (
  code text,
  name text,
  catalog_monthly_usd numeric(10, 2),
  catalog_annual_usd numeric(10, 2),
  default_unit_limit integer,
  sort_order smallint,
  capabilities jsonb
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    p.code,
    p.name,
    p.catalog_monthly_usd,
    p.catalog_annual_usd,
    p.default_unit_limit,
    p.sort_order,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'code', c.code,
            'domain', c.domain,
            'name', c.name
          )
          order by c.domain, c.name, c.code
        )
        from public.plan_capabilities pc
        join public.capabilities c on c.code = pc.capability
        where pc.plan_code = p.code
          and c.status = 'available'
      ),
      '[]'::jsonb
    ) as capabilities
  from public.plans p
  where p.is_public
  order by p.sort_order, p.code;
$$;

comment on function public.get_public_plan_catalog() is
  'Returns only the intentionally public Habitta catalogue; never customer-specific commercial terms.';

revoke all on function public.get_public_plan_catalog() from public, anon, authenticated, service_role;
grant execute on function public.get_public_plan_catalog() to anon, authenticated, service_role;

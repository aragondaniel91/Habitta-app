-- HAB-410, part two: the catalogue's contents, the access rules, and the resolver.

-- ------------------------------------------------------------------ capability catalogue

-- Only capabilities backed by a module that exists today. Vehicles, pets, amenity bookings and
-- staff are on the roadmap and deliberately absent: a capability nobody can grant is a promise
-- waiting to be broken.
insert into public.capabilities (code, domain, name, description) values
  ('people.directory',        'people',     'Directorio de personas',    'Propietarios, inquilinos y ocupantes de cada unidad.'),
  ('people.bulk_import',      'people',     'Carga masiva',              'Importación de personas y estructura con validación previa.'),
  ('finance.receivables',     'finance',    'Cuentas por cobrar',        'Cuotas, cargos, estados de cuenta y morosidad.'),
  ('finance.payments',        'finance',    'Pagos',                     'Registro y revisión de pagos con comprobante.'),
  ('finance.recurring_dues',  'finance',    'Cuotas recurrentes',        'Cuotas ordinarias que se programan y revisan antes de publicarse.'),
  ('finance.late_fees',       'finance',    'Recargos por mora',         'Cálculo automático de recargos según política.'),
  ('finance.solvency',        'finance',    'Certificados de solvencia', 'Emisión y verificación pública de solvencia.'),
  ('finance.treasury',        'finance',    'Tesorería',                 'Cuentas, movimientos y transferencias conciliadas.'),
  ('finance.budgets',         'finance',    'Presupuestos',              'Presupuesto anual y ejecución contra lo aprobado.'),
  ('finance.expenses',        'finance',    'Gastos',                    'Egresos, categorías y soportes.'),
  ('operations.requests',     'operations', 'Solicitudes',               'Solicitudes y reclamos de residentes con seguimiento.'),
  ('operations.maintenance',  'operations', 'Mantenimiento',             'Activos, planes preventivos y órdenes de trabajo.'),
  ('operations.documents',    'operations', 'Documentos',                'Documentos privados con versiones y auditoría de descarga.'),
  ('operations.announcements','operations', 'Anuncios',                  'Comunicaciones al condominio con audiencia segmentada.'),
  ('operations.reports',      'operations', 'Reportes',                  'Reportes operativos y exportaciones.'),
  ('governance.assemblies',   'governance', 'Asambleas',                 'Convocatorias, agenda y documentos de asamblea.'),
  ('governance.voting',       'governance', 'Votaciones',                'Votación, quórum, resultados e historial.'),
  ('structure.multi_building','structure',  'Varias torres',             'Estructuras con más de un edificio.'),
  ('structure.ownership',     'structure',  'Traspaso de propiedad',     'Cambio de propietario con historial inmutable.'),
  ('platform.team_roles',     'platform',   'Equipo y permisos',         'Varios administradores con roles y permisos.'),
  ('platform.audit',          'platform',   'Auditoría',                 'Registro de acciones administrativas sensibles.'),
  ('platform.multi_condo',    'platform',   'Multi-condominio',          'Administración consolidada de varios condominios.');

-- ------------------------------------------------------------------ plans

insert into public.plans (code, name, catalog_monthly_usd, catalog_annual_usd, default_unit_limit, sort_order) values
  ('esencial',   'Habitta Esencial',   29.00,  290.00,   30, 1),
  ('comunidad',  'Habitta Comunidad',  49.00,  490.00,   80, 2),
  ('pro',        'Habitta Pro',        79.00,  790.00,  150, 3),
  ('plus',       'Habitta Plus',      129.00, 1290.00,  300, 4),
  ('enterprise', 'Habitta Enterprise',169.00, 1690.00,  500, 5);

-- Esencial: run a small condominium's money and talk to its residents.
insert into public.plan_capabilities (plan_code, capability)
select 'esencial', code from public.capabilities where code in (
  'people.directory', 'finance.receivables', 'finance.payments', 'finance.expenses',
  'operations.announcements', 'operations.documents'
);

-- Comunidad inherits Esencial and adds the operational day-to-day. Late fees live here on purpose:
-- it is the module that pays for the subscription, and hiding it higher up would be selling
-- against ourselves. Assemblies land here too -- a 40-unit building holds assemblies just like a
-- 200-unit one, and that need has nothing to do with size.
insert into public.plan_capabilities (plan_code, capability)
select 'comunidad', code from public.capabilities where code in (
  'people.directory', 'people.bulk_import', 'finance.receivables', 'finance.payments',
  'finance.expenses', 'finance.recurring_dues', 'finance.late_fees', 'finance.solvency',
  'operations.announcements', 'operations.documents', 'operations.requests',
  'operations.maintenance', 'governance.assemblies'
);

-- Pro adds what a professional administrator needs: reconciliation, budgets, a real team, and the
-- governance that produces binding decisions.
insert into public.plan_capabilities (plan_code, capability)
select 'pro', code from public.capabilities where code in (
  'people.directory', 'people.bulk_import', 'finance.receivables', 'finance.payments',
  'finance.expenses', 'finance.recurring_dues', 'finance.late_fees', 'finance.solvency',
  'finance.treasury', 'finance.budgets', 'operations.announcements', 'operations.documents',
  'operations.requests', 'operations.maintenance', 'operations.reports',
  'governance.assemblies', 'governance.voting', 'platform.team_roles', 'platform.audit'
);

-- Plus adds structural complexity: several towers and ownership that changes hands.
insert into public.plan_capabilities (plan_code, capability)
select 'plus', code from public.capabilities where code in (
  'people.directory', 'people.bulk_import', 'finance.receivables', 'finance.payments',
  'finance.expenses', 'finance.recurring_dues', 'finance.late_fees', 'finance.solvency',
  'finance.treasury', 'finance.budgets', 'operations.announcements', 'operations.documents',
  'operations.requests', 'operations.maintenance', 'operations.reports',
  'governance.assemblies', 'governance.voting', 'platform.team_roles', 'platform.audit',
  'structure.multi_building', 'structure.ownership'
);

-- Enterprise is everything, including the consolidated view an agency lives in.
insert into public.plan_capabilities (plan_code, capability)
select 'enterprise', code from public.capabilities;

-- ------------------------------------------------------------------ access

alter table public.capabilities enable row level security;
alter table public.plans enable row level security;
alter table public.plan_capabilities enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_terms enable row level security;
alter table public.subscription_events enable row level security;

-- The catalogue is public pricing. Reading it leaks nothing about any customer.
create policy capabilities_read on public.capabilities for select to authenticated using (true);
create policy plans_read on public.plans for select to authenticated using (true);
create policy plan_capabilities_read on public.plan_capabilities for select to authenticated using (true);

grant select on public.capabilities, public.plans, public.plan_capabilities to authenticated;
revoke insert, update, delete on public.capabilities, public.plans, public.plan_capabilities
  from anon, authenticated;

-- Contracts are not. No policy at all: RLS with no policy denies every client role, and these
-- tables are reached only through the functions below. `subscription_terms` in particular carries
-- what each customer negotiated, which no other customer -- and no ordinary user -- should read.
revoke all on public.subscriptions, public.subscription_terms, public.subscription_events
  from anon, authenticated;

-- ------------------------------------------------------------------ resolution

-- The single source of truth. Internal: it reads any tenant's contract with RLS off, so it must
-- never be reachable from a client role.
--
-- HAB-SEC-001, 008 and 009 were all one mistake in different directions -- a revoke that named
-- `public, authenticated` and forgot `anon`, then two that named `public, anon` and forgot
-- `authenticated`. All three roles are named explicitly below, in one statement, for that reason.
create or replace function public.resolve_entitlements(target_condominium uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  subscription public.subscriptions;
  term public.subscription_terms;
  plan public.plans;
  active_units integer;
  effective_limit integer;
begin
  select * into subscription
  from public.subscriptions s
  where s.condominium_id = target_condominium;

  if subscription.id is null then
    -- Fail closed. A condominium with no subscription has contracted nothing, which is different
    -- from having contracted everything.
    return jsonb_build_object(
      'found', false,
      'capabilities', '[]'::jsonb,
      'may_operate', false
    );
  end if;

  select * into term
  from public.subscription_terms t
  where t.subscription_id = subscription.id
    and t.effective_from <= current_date
    and (t.effective_to is null or t.effective_to > current_date)
  limit 1;

  select * into plan from public.plans p where p.code = term.plan_code;

  select count(*) into active_units
  from public.units u
  where u.condominium_id = target_condominium
    and u.status = 'active';

  -- Unlimited is only ever what a contract says out loud.
  effective_limit := case
    when term.unlimited_units then null
    else coalesce(term.contracted_unit_limit, plan.default_unit_limit)
  end;

  return jsonb_build_object(
    'found', true,
    'condominium_id', target_condominium,
    'plan_code', term.plan_code,
    'plan_name', plan.name,
    'status', subscription.status,
    'commercial_status', subscription.commercial_status,
    'trial_ends_at', subscription.trial_ends_at,
    'billing_period', term.billing_period,
    'contracted_period_amount', term.contracted_period_amount,
    'currency', term.currency,
    'term_origin', term.origin,
    'unlimited_units', term.unlimited_units,
    'unit_limit', effective_limit,
    'active_units', active_units,
    'within_limit', term.unlimited_units or active_units <= effective_limit,
    'capabilities', coalesce(
      (select jsonb_agg(pc.capability order by pc.capability)
       from public.plan_capabilities pc
       where pc.plan_code = term.plan_code),
      '[]'::jsonb
    ),
    -- Commercial state only. It says nothing about whether a given user may act, which stays
    -- entirely with the existing `can_*` helpers.
    'may_operate', subscription.status in ('trialing', 'active', 'past_due')
  );
end;
$$;

revoke all on function public.resolve_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.resolve_entitlements(uuid) to service_role;

-- The tenant-facing entry point. It takes no arguments on purpose: there is no identifier in the
-- request to tamper with, and the caller cannot ask about a condominium they do not belong to
-- because they cannot ask about a condominium at all.
create or replace function public.my_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'authentication required';
  end if;

  return coalesce(
    (
      select jsonb_agg(public.resolve_entitlements(c.condominium_id) order by c.condominium_id)
      from (
        select distinct m.condominium_id
        from public.condominium_memberships m
        where m.user_id = caller
        union
        select c2.id
        from public.condominiums c2
        join public.organization_memberships om on om.organization_id = c2.organization_id
        where om.user_id = caller
      ) c
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.my_entitlements() from public, anon;
grant execute on function public.my_entitlements() to authenticated, service_role;

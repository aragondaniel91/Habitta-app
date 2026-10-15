-- HAB-PAYMENT-CONNECTOR-HUB-001 / Phase 1
-- Metadata-only connector catalog and lifecycle. This migration deliberately does not create
-- credentials, webhook destinations, payment intents, or any route into the financial ledger.

create table public.collection_provider_catalog (
  provider_key text not null check (provider_key ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  capabilities jsonb not null check (jsonb_typeof(capabilities) = 'array'),
  lifecycle_status text not null default 'pending' check (lifecycle_status = 'pending'),
  source_url text not null check (source_url ~ '^https://'),
  reviewed_at date not null,
  primary key (provider_key, country_code)
);

-- Only markets whose provider documentation was reviewed are listed. Absence is not a claim of
-- availability. All entries stay PENDING until a separately approved adapter is implemented.
insert into public.collection_provider_catalog
  (provider_key, country_code, display_name, capabilities, lifecycle_status, source_url, reviewed_at)
values
  ('mercado_pago', 'AR', 'Mercado Pago', '["card","wallet","bank_transfer"]', 'pending', 'https://www.mercadopago.com/', current_date),
  ('mercado_pago', 'BR', 'Mercado Pago', '["card","wallet","bank_transfer"]', 'pending', 'https://www.mercadopago.com/', current_date),
  ('mercado_pago', 'CL', 'Mercado Pago', '["card","wallet","bank_transfer"]', 'pending', 'https://www.mercadopago.com/', current_date),
  ('mercado_pago', 'CO', 'Mercado Pago', '["card","wallet","bank_transfer"]', 'pending', 'https://www.mercadopago.com/', current_date),
  ('mercado_pago', 'MX', 'Mercado Pago', '["card","wallet","bank_transfer"]', 'pending', 'https://www.mercadopago.com/', current_date),
  ('mercado_pago', 'PE', 'Mercado Pago', '["card","wallet","bank_transfer"]', 'pending', 'https://www.mercadopago.com/', current_date),
  ('mercado_pago', 'UY', 'Mercado Pago', '["card","wallet","bank_transfer"]', 'pending', 'https://www.mercadopago.com/', current_date),
  ('stripe_connect', 'AU', 'Stripe Connect', '["card","bank_transfer"]', 'pending', 'https://docs.stripe.com/connect/separate-charges-and-transfers', current_date),
  ('stripe_connect', 'CA', 'Stripe Connect', '["card","bank_transfer"]', 'pending', 'https://docs.stripe.com/connect/separate-charges-and-transfers', current_date),
  ('stripe_connect', 'MX', 'Stripe Connect', '["card","bank_transfer"]', 'pending', 'https://docs.stripe.com/connect/separate-charges-and-transfers', current_date),
  ('stripe_connect', 'US', 'Stripe Connect', '["card","bank_transfer"]', 'pending', 'https://docs.stripe.com/connect/separate-charges-and-transfers', current_date)
on conflict (provider_key, country_code) do nothing;

alter table public.collection_provider_catalog enable row level security;
create policy collection_provider_catalog_authenticated_read on public.collection_provider_catalog
  for select to authenticated using (true);
revoke all on public.collection_provider_catalog from public, anon;
grant select on public.collection_provider_catalog to authenticated;

alter table public.condominium_collection_provider_connections
  add column if not exists connector_country_code text check (connector_country_code is null or connector_country_code ~ '^[A-Z]{2}$');
-- The original foundation accepted a future connected status. New Phase 1 writes are prevented
-- from representing an operational integration even if a historical row exists.
alter table public.condominium_collection_provider_connections
  add constraint collection_provider_connections_phase1_non_operational
  check (connection_status in ('pending', 'disabled')) not valid;

create table public.collection_provider_connection_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.condominium_collection_provider_connections(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('created', 'disabled')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);
create index collection_provider_connection_events_connection_idx
  on public.collection_provider_connection_events (connection_id, occurred_at desc);
alter table public.collection_provider_connection_events enable row level security;
create policy collection_provider_connection_events_read on public.collection_provider_connection_events
  for select to authenticated using (public.can_read_collection_provider_connections(organization_id));
revoke all on public.collection_provider_connection_events from public, anon, authenticated;
grant select on public.collection_provider_connection_events to authenticated;

create function public.can_manage_collection_provider_connections(target_organization uuid, target_condominiums uuid[])
returns boolean language sql stable security definer set search_path = public set row_security = off as $$
  select auth.uid() is not null and (
    public.is_organization_owner(target_organization)
    or (
      cardinality(target_condominiums) > 0
      and not exists (
        select 1 from unnest(target_condominiums) condominium_id
        where not exists (
          select 1 from public.condominiums c
          where c.id = condominium_id and c.organization_id = target_organization
        ) or not public.can_manage_receivables(condominium_id)
      )
    )
  );
$$;

create function public.create_collection_provider_connection(
  target_organization uuid, target_provider_key text, target_country_code text,
  target_display_label text, target_environment text, target_condominiums uuid[]
) returns public.condominium_collection_provider_connections
language plpgsql security definer set search_path = public set row_security = off as $$
declare connection public.condominium_collection_provider_connections; target_condominium uuid;
begin
  if target_condominiums is null or cardinality(target_condominiums) = 0
    or array_length(target_condominiums, 1) <> cardinality(array(select distinct x from unnest(target_condominiums) x))
    or not public.can_manage_collection_provider_connections(target_organization, target_condominiums) then
    raise exception 'collection provider connection denied' using errcode = '42501';
  end if;
  if target_environment not in ('sandbox', 'production')
    or not exists (select 1 from public.collection_provider_catalog c where c.provider_key = target_provider_key and c.country_code = target_country_code and c.lifecycle_status = 'pending') then
    raise exception 'unsupported pending provider capability' using errcode = '22023';
  end if;
  insert into public.condominium_collection_provider_connections
    (organization_id, provider_key, display_label, environment, connection_status, connector_country_code, created_by, updated_by)
  values (target_organization, target_provider_key, btrim(target_display_label), target_environment, 'pending', target_country_code, auth.uid(), auth.uid())
  returning * into connection;
  foreach target_condominium in array target_condominiums loop
    insert into public.condominium_collection_provider_connection_assignments
      (connection_id, condominium_id, organization_id, assigned_by)
    values (connection.id, target_condominium, target_organization, auth.uid());
  end loop;
  insert into public.collection_provider_connection_events(connection_id, organization_id, actor_user_id, event_type, metadata)
  values (connection.id, target_organization, auth.uid(), 'created', jsonb_build_object('provider_key', target_provider_key, 'country_code', target_country_code, 'environment', target_environment, 'assignment_count', cardinality(target_condominiums)));
  return connection;
end;
$$;

create function public.disable_collection_provider_connection(target_connection uuid)
returns public.condominium_collection_provider_connections
language plpgsql security definer set search_path = public set row_security = off as $$
declare connection public.condominium_collection_provider_connections; assigned_condominiums uuid[];
begin
  select * into connection from public.condominium_collection_provider_connections where id = target_connection for update;
  select array_agg(condominium_id order by condominium_id) into assigned_condominiums from public.condominium_collection_provider_connection_assignments where connection_id = target_connection;
  if connection.id is null or not public.can_manage_collection_provider_connections(connection.organization_id, assigned_condominiums) then
    raise exception 'collection provider connection denied' using errcode = '42501';
  end if;
  if connection.connection_status = 'disabled' then return connection; end if;
  update public.condominium_collection_provider_connections set connection_status = 'disabled', updated_by = auth.uid(), updated_at = now() where id = connection.id returning * into connection;
  insert into public.collection_provider_connection_events(connection_id, organization_id, actor_user_id, event_type, metadata)
  values (connection.id, connection.organization_id, auth.uid(), 'disabled', '{}'::jsonb);
  return connection;
end;
$$;

revoke all on function public.can_manage_collection_provider_connections(uuid, uuid[]), public.create_collection_provider_connection(uuid, text, text, text, text, uuid[]), public.disable_collection_provider_connection(uuid) from public, anon;
grant execute on function public.can_manage_collection_provider_connections(uuid, uuid[]), public.create_collection_provider_connection(uuid, text, text, text, text, uuid[]), public.disable_collection_provider_connection(uuid) to authenticated, service_role;

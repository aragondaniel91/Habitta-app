-- HAB-436: Stripe Checkout compatibility on top of the provider-neutral billing foundation.
--
-- Stripe may not create its Customer until a setup-mode Checkout Session is completed. Habitta
-- therefore binds the provider setup/session first and accepts the customer reference later from
-- the verified completion webhook. No provider secret, card data or raw webhook payload enters
-- PostgreSQL.

create or replace function public.attach_billing_provider_setup_v1(
  p_attempt_id uuid,
  p_provider text,
  p_provider_setup_ref text,
  p_provider_customer_ref text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  attempt habitta_internal.billing_setup_attempts;
  normalized_provider text := lower(btrim(p_provider));
  normalized_customer_ref text := nullif(btrim(coalesce(p_provider_customer_ref, '')), '');
begin
  select * into attempt
  from habitta_internal.billing_setup_attempts a
  where a.id = p_attempt_id
  for update;

  if attempt.id is null then
    raise exception using errcode = 'P0002', message = 'billing setup attempt not found';
  end if;
  if normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,31}$' then
    raise exception using errcode = '22023', message = 'invalid billing provider';
  end if;
  if nullif(btrim(coalesce(p_provider_setup_ref, '')), '') is null then
    raise exception using errcode = '22023', message = 'provider setup reference is required';
  end if;

  if attempt.status = 'provider_created' then
    if attempt.provider = normalized_provider
      and attempt.provider_setup_ref = btrim(p_provider_setup_ref)
      and attempt.provider_customer_ref is not distinct from normalized_customer_ref
    then
      return pg_catalog.jsonb_build_object(
        'attempt_id', attempt.id,
        'status', attempt.status,
        'idempotent_replay', true
      );
    end if;
    raise exception using errcode = '23514', message = 'billing setup attempt already attached to different provider state';
  end if;
  if attempt.status <> 'pending' then
    raise exception using errcode = '23514', message = 'billing setup attempt is not attachable';
  end if;

  update habitta_internal.billing_setup_attempts
     set provider = normalized_provider,
         provider_setup_ref = btrim(p_provider_setup_ref),
         provider_customer_ref = normalized_customer_ref,
         status = 'provider_created',
         expires_at = p_expires_at,
         updated_at = now()
   where id = attempt.id;

  return pg_catalog.jsonb_build_object(
    'attempt_id', attempt.id,
    'status', 'provider_created',
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.attach_billing_provider_setup_v1(uuid,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.attach_billing_provider_setup_v1(uuid,text,text,text,timestamptz)
  to service_role;

-- A verified provider event such as Stripe payment_method.detached can arrive without the Habitta
-- subscription id. Resolve it only through the opaque provider references Habitta already owns.
create or replace function public.resolve_saas_billing_subscription_v1(
  p_provider text,
  p_provider_customer_ref text default null,
  p_payment_method_ref text default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  normalized_provider text := lower(btrim(p_provider));
  normalized_customer_ref text := nullif(btrim(coalesce(p_provider_customer_ref, '')), '');
  normalized_method_ref text := nullif(btrim(coalesce(p_payment_method_ref, '')), '');
  resolved uuid;
begin
  if normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,31}$' then
    raise exception using errcode = '22023', message = 'invalid billing provider';
  end if;
  if normalized_customer_ref is null and normalized_method_ref is null then
    raise exception using errcode = '22023', message = 'provider customer or payment method reference is required';
  end if;

  select a.subscription_id into resolved
  from habitta_internal.saas_billing_accounts a
  where a.provider = normalized_provider
    and (
      (normalized_method_ref is not null and a.payment_method_ref = normalized_method_ref)
      or
      (normalized_customer_ref is not null and a.provider_customer_ref = normalized_customer_ref)
    )
  order by case when normalized_method_ref is not null and a.payment_method_ref = normalized_method_ref then 0 else 1 end
  limit 1;

  return resolved;
end;
$$;

revoke all on function public.resolve_saas_billing_subscription_v1(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_saas_billing_subscription_v1(text,text,text) to service_role;

comment on function public.attach_billing_provider_setup_v1(uuid,text,text,text,timestamptz) is
  'HAB-436 service-only attachment of an opaque provider setup reference. Customer reference may arrive later from the verified setup completion webhook.';
comment on function public.resolve_saas_billing_subscription_v1(text,text,text) is
  'HAB-436 service-only lookup from opaque provider references to Habitta SaaS subscription id for verified provider events.';

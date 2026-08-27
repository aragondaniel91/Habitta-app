-- HAB-410: the commercial foundation. Additive, and deliberately inert.
--
-- Nothing in this migration is consulted by any existing code path. It creates the vocabulary --
-- what a plan is, what a customer contracted, what state the relationship is in -- and stops
-- there. Enforcement arrives in its own change, once these resolutions can be checked against
-- real tenants.
--
-- Two separations carry the whole design:
--
--   Catalogue against contract. `plans` says what a plan costs today; `subscription_terms` says
--   what this customer actually pays. Raising a catalogue price must never silently change an
--   existing customer's bill, which is exactly what a single price column would have done.
--
--   Authorization against entitlement. The 52 `can_*` helpers answer "may this user". Nothing
--   here touches them. These tables answer "what did this tenant contract", a different question
--   with a different lifetime; mixing the two would make a price change alter the meaning of a
--   permission.

create extension if not exists "btree_gist" with schema extensions;

-- ------------------------------------------------------------------ capability registry

-- A registry rather than free strings. `plan_capabilities` references it, so a typo is a foreign
-- key violation at migration time instead of a capability that silently never matches anything.
create table public.capabilities (
  code text primary key,
  domain text not null,
  name text not null,
  description text not null,
  status text not null default 'available',
  created_at timestamptz not null default now(),
  constraint capabilities_code_shape check (code ~ '^[a-z]+[.][a-z_]+$'),
  constraint capabilities_status_shape check (status in ('available', 'planned', 'deprecated'))
);

-- ------------------------------------------------------------------ catalogue

create table public.plans (
  code text primary key,
  name text not null,
  catalog_monthly_usd numeric(10, 2) not null,
  catalog_annual_usd numeric(10, 2) not null,
  -- Not nullable on purpose. A plan always carries a commercial ceiling; "unlimited" is a decision
  -- recorded on a contract, never the meaning of an absent value here.
  default_unit_limit integer not null,
  is_public boolean not null default true,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  constraint plans_prices_positive check (catalog_monthly_usd > 0 and catalog_annual_usd > 0),
  constraint plans_unit_limit_positive check (default_unit_limit > 0)
);

create table public.plan_capabilities (
  plan_code text not null references public.plans(code) on delete cascade,
  capability text not null references public.capabilities(code),
  primary key (plan_code, capability)
);

-- ------------------------------------------------------------------ subscription state

create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'suspended', 'cancelled'
);

-- Whether a human actually agreed to this commercially. The migration below places every existing
-- condominium on a plan so the resolver has something to answer with, and that placement is not a
-- contract. Without this column a `$79` row six months from now reads as an accepted price.
create type public.commercial_status as enum ('not_yet_confirmed', 'confirmed');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null unique references public.condominiums(id) on delete cascade,
  status public.subscription_status not null,
  commercial_status public.commercial_status not null default 'not_yet_confirmed',
  trial_ends_at timestamptz,
  current_period_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_trial_has_end check (status <> 'trialing' or trial_ends_at is not null)
);

-- ------------------------------------------------------------------ contracted terms

-- Append-only. One row per contractual period, and the database refuses to hold two that overlap.
create table public.subscription_terms (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  plan_code text not null references public.plans(code),

  -- The amount actually charged for one whole period: monthly means per month, annual means per
  -- year. The name is long so nobody five years from now has to guess which one it is.
  contracted_period_amount numeric(10, 2) not null,
  currency text not null default 'USD',
  billing_period text not null,

  -- Null inherits the plan ceiling. Unlimited is never inferred from null.
  contracted_unit_limit integer,
  unlimited_units boolean not null default false,

  origin text not null,
  -- The list price the day this was signed, in the same period as the amount above, so a discount
  -- stays legible without reconstructing what the catalogue used to say.
  catalog_reference_amount numeric(10, 2) not null,
  authorized_by uuid references auth.users(id),

  effective_from date not null,
  effective_to date,
  note text,
  created_at timestamptz not null default now(),

  constraint terms_amount_positive check (contracted_period_amount >= 0),
  constraint terms_reference_positive check (catalog_reference_amount > 0),
  constraint terms_currency_shape check (currency ~ '^[A-Z]{3}$'),
  constraint terms_period_shape check (billing_period in ('monthly', 'annual')),
  constraint terms_origin_shape check (
    origin in ('catalog', 'founders', 'grandfathered', 'negotiated', 'promotion')
  ),
  constraint terms_unit_limit_positive check (
    contracted_unit_limit is null or contracted_unit_limit > 0
  ),
  constraint terms_dates_ordered check (effective_to is null or effective_to > effective_from),
  -- Anything other than the list price is somebody's decision, and a decision has an author.
  constraint terms_exception_is_authorized check (origin = 'catalog' or authorized_by is not null)
);

-- The guarantee that does not depend on the code behaving itself: two terms for one subscription
-- cannot cover the same day. `daterange` with an open upper bound models "still in force", and
-- btree_gist is what lets the equality on subscription_id share an index with the range overlap.
alter table public.subscription_terms
  add constraint subscription_terms_no_overlap
  exclude using gist (
    subscription_id with =,
    daterange(effective_from, effective_to, '[)') with &&
  );

create index subscription_terms_lookup
  on public.subscription_terms (subscription_id, effective_from desc);

-- ------------------------------------------------------------------ events

-- Follows the `*_events` shape the other sixteen domains already use.
create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  event_type text not null,
  from_status public.subscription_status,
  to_status public.subscription_status,
  from_plan text,
  to_plan text,
  actor_user_id uuid references auth.users(id),
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint subscription_events_type_shape check (char_length(btrim(event_type)) between 1 and 60)
);

create index subscription_events_lookup
  on public.subscription_events (condominium_id, created_at desc);

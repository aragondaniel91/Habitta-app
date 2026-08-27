-- HAB-400: the invitation a paying customer receives before they have anything.
--
-- Every invitation in Habitta today hangs off a condominium. `admin_invitations` requires
-- `condominium_id`, `invitations` requires a condominium and a person. Both answer the question
-- "join this condominium", which cannot be asked of someone who has just paid and owns nothing yet.
--
-- That gap is why public signup has to stay open: a new customer's only route in is to register
-- themselves. This table is the first half of closing it -- the record that says "this address paid
-- and may create a workspace" -- so signup can later be closed without removing the front door.
--
-- Deliberately not modelled here: the payment itself. How Habitta charges is undecided, and the
-- invitation is the same record whether a card cleared or an administrator confirmed a transfer.
-- `reference` carries whatever the operator needs to reconcile it later, `plan_code` records what
-- was sold. When billing exists it writes those two fields; nothing else has to change.

create type public.customer_invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.customer_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plan_code text,
  reference text,
  notes text,
  token_hash text not null unique,
  status public.customer_invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint customer_invitations_email_shape
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' and email = lower(email)),
  constraint customer_invitations_plan_shape
    check (plan_code is null or char_length(btrim(plan_code)) between 1 and 60),
  constraint customer_invitations_reference_shape
    check (reference is null or char_length(btrim(reference)) between 1 and 120),
  constraint customer_invitations_notes_shape
    check (notes is null or char_length(btrim(notes)) between 1 and 500),
  constraint customer_invitations_accepted_complete
    check ((status = 'accepted') = (accepted_at is not null and accepted_by is not null)),
  constraint customer_invitations_revoked_complete
    check ((status = 'revoked') = (revoked_at is not null))
);

-- One live invitation per address. A second send supersedes rather than duplicates, so an operator
-- resending after a bounced email cannot accidentally leave two valid tokens outstanding.
create unique index customer_invitations_one_pending
  on public.customer_invitations (email)
  where status = 'pending';

create index customer_invitations_status_created
  on public.customer_invitations (status, created_at desc);

alter table public.customer_invitations enable row level security;

-- No policy: this table is reached only through the RPCs below. A client role holding a stray
-- SELECT grant would be able to read every prospective customer's address.
revoke all on public.customer_invitations from anon, authenticated;

-- Issuing is a platform operation, not a condominium one: at this point no condominium exists to
-- be an administrator of. `is_platform_admin` is the only identity that fits.
create or replace function public.create_customer_invitation(
  target_email text,
  target_plan_code text default null,
  target_reference text default null,
  target_notes text default null,
  target_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  normalized_email text := lower(btrim(coalesce(target_email, '')));
  raw_token text;
  resolved_expiration timestamptz;
  created public.customer_invitations;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'platform administrator required';
  end if;

  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'invalid email';
  end if;

  resolved_expiration := coalesce(target_expires_at, now() + interval '14 days');
  if resolved_expiration <= now() + interval '1 hour'
    or resolved_expiration > now() + interval '90 days'
  then
    raise exception 'invalid expiration';
  end if;

  -- Resending supersedes the previous token instead of leaving two valid ones outstanding.
  update public.customer_invitations
  set status = 'revoked', revoked_at = now()
  where email = normalized_email and status = 'pending';

  raw_token := encode(gen_random_bytes(32), 'hex');

  insert into public.customer_invitations (
    email, plan_code, reference, notes, token_hash, expires_at, created_by
  ) values (
    normalized_email,
    nullif(btrim(coalesce(target_plan_code, '')), ''),
    nullif(btrim(coalesce(target_reference, '')), ''),
    nullif(btrim(coalesce(target_notes, '')), ''),
    encode(digest(raw_token, 'sha256'), 'hex'),
    resolved_expiration,
    auth.uid()
  ) returning * into created;

  -- The raw token is returned exactly once, here. Only its hash is stored, so an operator who
  -- loses it must resend rather than recover it.
  return jsonb_build_object(
    'id', created.id,
    'email', created.email,
    'plan_code', created.plan_code,
    'expires_at', created.expires_at,
    'token', raw_token
  );
end;
$$;

revoke all on function public.create_customer_invitation(text, text, text, text, timestamptz) from public, anon;
grant execute on function public.create_customer_invitation(text, text, text, text, timestamptz) to authenticated;

-- Read before you have an account: the landing page shows who the invitation is for. It answers
-- with the address and the plan and nothing else, and never reveals whether an unknown token was
-- wrong or merely expired.
create or replace function public.get_customer_invitation_preview(raw_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
set row_security = off
as $$
  select coalesce(
    (select jsonb_build_object(
       'found', true,
       'email', ci.email,
       'plan_code', ci.plan_code,
       'expires_at', ci.expires_at
     )
     from public.customer_invitations ci
     where ci.token_hash = encode(digest(coalesce(raw_token, ''), 'sha256'), 'hex')
       and ci.status = 'pending'
       and ci.expires_at > now()),
    jsonb_build_object('found', false)
  );
$$;

revoke all on function public.get_customer_invitation_preview(text) from public;
grant execute on function public.get_customer_invitation_preview(text) to anon, authenticated;

-- Redeemed by the signed-in account the invitation was issued for. It records who accepted and
-- retires the token; creating the workspace stays with the onboarding flow that already exists.
create or replace function public.accept_customer_invitation(raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  invitation public.customer_invitations;
  actor_email text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into invitation
  from public.customer_invitations
  where token_hash = encode(digest(coalesce(raw_token, ''), 'sha256'), 'hex')
  for update;

  if invitation.id is null or invitation.status <> 'pending' or invitation.expires_at <= now() then
    raise exception 'invalid invitation';
  end if;

  select lower(u.email) into actor_email from auth.users u where u.id = auth.uid();

  -- An invitation is addressed to a person. Letting any signed-in account redeem someone else's
  -- token would turn a leaked link into a free subscription.
  if actor_email is distinct from invitation.email then
    raise exception 'invitation belongs to another email';
  end if;

  update public.customer_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = invitation.id;

  return jsonb_build_object(
    'id', invitation.id,
    'email', invitation.email,
    'plan_code', invitation.plan_code
  );
end;
$$;

revoke all on function public.accept_customer_invitation(text) from public, anon;
grant execute on function public.accept_customer_invitation(text) to authenticated;

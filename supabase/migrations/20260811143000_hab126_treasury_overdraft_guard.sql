-- HAB-126: protect explicit Treasury debits from accidental overdrafts.
--
-- Habitta must still be able to represent a real negative balance. Instead of pretending that
-- negative balances cannot exist, explicit Treasury withdrawals/fees/transfers require an
-- auditable authorization when the projected account balance would be below zero.
--
-- Financial lifecycle movements (for example a paid expense or payment reversal) are not blocked
-- here. Those workflows remain truthful representations of financial events and may legitimately
-- make a real account negative. Their movements stay fully visible in the immutable ledger.

create table public.treasury_overdraft_authorizations (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  account_id uuid not null,
  movement_request_key text not null check (char_length(movement_request_key) between 8 and 180),
  amount numeric(18, 2) not null check (amount > 0),
  balance_before numeric(18, 2) not null,
  projected_balance numeric(18, 2) not null check (projected_balance < 0),
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  authorized_by uuid not null references auth.users(id),
  authorized_at timestamptz not null default now(),
  unique (condominium_id, movement_request_key),
  foreign key (account_id, condominium_id)
    references public.treasury_accounts(id, condominium_id)
);

create index treasury_overdraft_authorizations_account_idx
  on public.treasury_overdraft_authorizations (account_id, authorized_at desc);

alter table public.treasury_overdraft_authorizations enable row level security;

create policy treasury_overdraft_authorizations_read
on public.treasury_overdraft_authorizations
for select using (public.can_read_treasury(condominium_id));

create function public.treasury_overdraft_authorization_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'treasury overdraft authorizations are immutable';
end;
$$;

create trigger treasury_overdraft_authorizations_append_only
before update or delete on public.treasury_overdraft_authorizations
for each row execute function public.treasury_overdraft_authorization_append_only();

create function public.authorize_treasury_overdraft(
  target_condominium uuid,
  target_account uuid,
  debit_amount numeric,
  movement_request_key text,
  authorization_reason text
)
returns public.treasury_overdraft_authorizations
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  account_record public.treasury_accounts;
  current_balance numeric(18, 2);
  projected numeric(18, 2);
  existing public.treasury_overdraft_authorizations;
  created public.treasury_overdraft_authorizations;
begin
  if auth.uid() is null or not public.can_manage_treasury(target_condominium) then
    raise exception 'treasury management denied';
  end if;
  if debit_amount is null or debit_amount <= 0
    or char_length(trim(movement_request_key)) not between 8 and 180
    or char_length(trim(authorization_reason)) not between 5 and 500 then
    raise exception 'invalid overdraft authorization';
  end if;

  select * into account_record
  from public.treasury_accounts a
  where a.id = target_account
    and a.condominium_id = target_condominium
  for update;

  if account_record.id is null then raise exception 'treasury account not found'; end if;
  if not account_record.is_active then raise exception 'treasury account is inactive'; end if;

  select coalesce(sum(case m.direction when 'credit' then m.amount else -m.amount end), 0)::numeric(18, 2)
    into current_balance
  from public.treasury_movements m
  where m.account_id = target_account;

  projected := round(current_balance - debit_amount, 2);
  if projected >= 0 then
    raise exception 'overdraft authorization is not required';
  end if;

  select * into existing
  from public.treasury_overdraft_authorizations a
  where a.condominium_id = target_condominium
    and a.movement_request_key = trim(movement_request_key);

  if existing.id is not null then
    if existing.account_id <> target_account
      or existing.amount <> round(debit_amount, 2)
      or existing.authorized_by <> auth.uid() then
      raise exception 'overdraft authorization key conflict';
    end if;
    return existing;
  end if;

  insert into public.treasury_overdraft_authorizations (
    condominium_id,
    account_id,
    movement_request_key,
    amount,
    balance_before,
    projected_balance,
    reason,
    authorized_by
  ) values (
    target_condominium,
    target_account,
    trim(movement_request_key),
    round(debit_amount, 2),
    current_balance,
    projected,
    trim(authorization_reason),
    auth.uid()
  ) returning * into created;

  return created;
end;
$$;

create function public.guard_explicit_treasury_overdraft()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_balance numeric(18, 2);
  authorization public.treasury_overdraft_authorizations;
begin
  -- Only explicit Treasury operations are guarded. Financial lifecycle movements must continue
  -- to represent reality even when the actual account is already negative.
  if new.direction <> 'debit'::public.treasury_movement_direction
     or new.source_type not in ('manual'::public.treasury_source_type, 'transfer'::public.treasury_source_type) then
    return new;
  end if;

  perform 1
  from public.treasury_accounts a
  where a.id = new.account_id
    and a.condominium_id = new.condominium_id
  for update;

  select coalesce(sum(case m.direction when 'credit' then m.amount else -m.amount end), 0)::numeric(18, 2)
    into current_balance
  from public.treasury_movements m
  where m.account_id = new.account_id;

  if round(current_balance - new.amount, 2) >= 0 then
    return new;
  end if;

  select * into authorization
  from public.treasury_overdraft_authorizations a
  where a.condominium_id = new.condominium_id
    and a.account_id = new.account_id
    and a.movement_request_key = new.idempotency_key
    and a.amount = new.amount
    and a.authorized_by = new.created_by;

  if authorization.id is null then
    raise exception 'treasury overdraft confirmation required';
  end if;

  return new;
end;
$$;

drop trigger if exists treasury_explicit_overdraft_guard on public.treasury_movements;
create trigger treasury_explicit_overdraft_guard
before insert on public.treasury_movements
for each row execute function public.guard_explicit_treasury_overdraft();

revoke all on function public.authorize_treasury_overdraft(uuid,uuid,numeric,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.authorize_treasury_overdraft(uuid,uuid,numeric,text,text)
  to authenticated, service_role;

revoke all on function public.guard_explicit_treasury_overdraft()
  from public, anon, authenticated, service_role;

comment on table public.treasury_overdraft_authorizations is
  'Immutable confirmations for explicit Treasury debits that intentionally leave an account negative.';

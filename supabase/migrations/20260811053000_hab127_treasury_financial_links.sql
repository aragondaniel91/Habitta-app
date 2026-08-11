-- HAB-127: keep Treasury synchronized with approved payments and paid expenses.
--
-- The integration is intentionally append-only: financial lifecycle transitions remain
-- the source of truth, and their treasury side-effects are written in the same database
-- transaction. If the treasury movement cannot be recorded, the transition fails too.

alter table public.payments
  add column if not exists treasury_account_id uuid;

alter table public.expenses
  add column if not exists treasury_account_id uuid;

alter table public.payments
  drop constraint if exists payments_treasury_account_fk;
alter table public.payments
  add constraint payments_treasury_account_fk
  foreign key (treasury_account_id, condominium_id)
  references public.treasury_accounts(id, condominium_id);

alter table public.expenses
  drop constraint if exists expenses_treasury_account_fk;
alter table public.expenses
  add constraint expenses_treasury_account_fk
  foreign key (treasury_account_id, condominium_id)
  references public.treasury_accounts(id, condominium_id);

-- One source transaction produces one original treasury movement. Reversals are
-- represented separately through reversal_of and source_type='reversal'.
create unique index if not exists treasury_movements_financial_source_unique
  on public.treasury_movements (condominium_id, source_type, source_id)
  where source_type in ('payment'::public.treasury_source_type, 'expense'::public.treasury_source_type)
    and source_id is not null
    and reversal_of is null;

create or replace function public.hab127_resolve_treasury_account(
  target_condominium uuid,
  target_currency text,
  requested_account uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  resolved uuid;
  candidates uuid[];
begin
  if requested_account is not null then
    select ta.id
      into resolved
      from public.treasury_accounts ta
      where ta.id = requested_account
        and ta.condominium_id = target_condominium
        and ta.currency_code = target_currency
        and ta.is_active;

    if resolved is null then
      raise exception 'invalid treasury account for financial transaction';
    end if;

    return resolved;
  end if;

  select array_agg(ta.id order by ta.id::text)
    into candidates
    from public.treasury_accounts ta
    where ta.condominium_id = target_condominium
      and ta.currency_code = target_currency
      and ta.is_active;

  if candidates is null or cardinality(candidates) = 0 then
    raise exception 'an active treasury account is required for currency %', target_currency;
  end if;

  if cardinality(candidates) > 1 then
    raise exception 'treasury account selection is required for currency %', target_currency;
  end if;

  return candidates[1];
end;
$$;

revoke all on function public.hab127_resolve_treasury_account(uuid,text,uuid) from public, anon, authenticated, service_role;

create or replace function public.hab127_prepare_payment_treasury()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if old.status is distinct from 'approved'::public.payment_status
     and new.status = 'approved'::public.payment_status then
    new.treasury_account_id := public.hab127_resolve_treasury_account(
      new.condominium_id,
      new.original_currency_code,
      new.treasury_account_id
    );
  end if;
  return new;
end;
$$;

create or replace function public.hab127_record_payment_treasury()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  movement public.treasury_movements;
  original_movement public.treasury_movements;
  actor uuid;
begin
  actor := coalesce(auth.uid(), new.approved_by, new.submitted_by_user_id);

  if old.status is distinct from 'approved'::public.payment_status
     and new.status = 'approved'::public.payment_status then
    insert into public.treasury_movements(
      condominium_id,
      account_id,
      direction,
      movement_kind,
      amount,
      currency_code,
      occurred_on,
      description,
      reference,
      source_type,
      source_id,
      idempotency_key,
      created_by
    ) values (
      new.condominium_id,
      new.treasury_account_id,
      'credit',
      'deposit',
      new.original_amount,
      new.original_currency_code,
      new.payment_date,
      'Pago aprobado: ' || left(new.payer_name, 450),
      new.reference,
      'payment',
      new.id,
      'payment:' || new.id::text || ':approved',
      actor
    )
    on conflict (condominium_id, idempotency_key) do update
      set idempotency_key = excluded.idempotency_key
    returning * into movement;

    if movement.account_id <> new.treasury_account_id
       or movement.amount <> new.original_amount
       or movement.currency_code <> new.original_currency_code
       or movement.direction <> 'credit'::public.treasury_movement_direction then
      raise exception 'payment treasury idempotency conflict';
    end if;

    insert into public.treasury_events(
      condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
    )
    select
      new.condominium_id,
      'movement',
      movement.id,
      'movement_recorded',
      actor,
      jsonb_build_object('source_type','payment','source_id',new.id)
    where not exists (
      select 1 from public.treasury_events te
      where te.entity_type = 'movement'
        and te.entity_id = movement.id
        and te.event_type = 'movement_recorded'
    );
  end if;

  if old.status = 'approved'::public.payment_status
     and new.status = 'reversed'::public.payment_status then
    select tm.*
      into original_movement
      from public.treasury_movements tm
      where tm.condominium_id = new.condominium_id
        and tm.source_type = 'payment'
        and tm.source_id = new.id
        and tm.reversal_of is null
      for update;

    -- Legacy approved payments created before HAB-127 have no treasury movement.
    -- Do not invent an account during reversal; new approvals are guaranteed to have one.
    if original_movement.id is not null then
      insert into public.treasury_movements(
        condominium_id,
        account_id,
        direction,
        movement_kind,
        amount,
        currency_code,
        occurred_on,
        description,
        reference,
        source_type,
        source_id,
        reversal_of,
        idempotency_key,
        created_by
      ) values (
        new.condominium_id,
        original_movement.account_id,
        case original_movement.direction when 'credit' then 'debit'::public.treasury_movement_direction else 'credit'::public.treasury_movement_direction end,
        'reversal',
        original_movement.amount,
        original_movement.currency_code,
        current_date,
        'Reverso de pago: ' || left(new.payer_name, 450),
        new.reference,
        'reversal',
        original_movement.id,
        original_movement.id,
        'payment:' || new.id::text || ':reversed',
        coalesce(auth.uid(), new.submitted_by_user_id)
      )
      on conflict (condominium_id, idempotency_key) do update
        set idempotency_key = excluded.idempotency_key
      returning * into movement;

      if movement.reversal_of <> original_movement.id
         or movement.amount <> original_movement.amount
         or movement.account_id <> original_movement.account_id then
        raise exception 'payment treasury reversal idempotency conflict';
      end if;

      insert into public.treasury_events(
        condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
      )
      select
        new.condominium_id,
        'movement',
        movement.id,
        'movement_reversed',
        coalesce(auth.uid(), new.submitted_by_user_id),
        jsonb_build_object(
          'source_type','payment',
          'source_id',new.id,
          'reversal_of',original_movement.id
        )
      where not exists (
        select 1 from public.treasury_events te
        where te.entity_type = 'movement'
          and te.entity_id = movement.id
          and te.event_type = 'movement_reversed'
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.hab127_prepare_expense_treasury()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if old.status is distinct from 'paid'::public.expense_status
     and new.status = 'paid'::public.expense_status then
    new.treasury_account_id := public.hab127_resolve_treasury_account(
      new.condominium_id,
      new.currency_code,
      new.treasury_account_id
    );
  end if;
  return new;
end;
$$;

create or replace function public.hab127_record_expense_treasury()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  movement public.treasury_movements;
  actor uuid;
begin
  if old.status is distinct from 'paid'::public.expense_status
     and new.status = 'paid'::public.expense_status then
    actor := coalesce(auth.uid(), new.approved_by, new.created_by);

    insert into public.treasury_movements(
      condominium_id,
      account_id,
      direction,
      movement_kind,
      amount,
      currency_code,
      occurred_on,
      description,
      reference,
      source_type,
      source_id,
      idempotency_key,
      created_by
    ) values (
      new.condominium_id,
      new.treasury_account_id,
      'debit',
      'withdrawal',
      new.amount,
      new.currency_code,
      current_date,
      'Gasto pagado: ' || left(new.description, 450),
      new.payment_reference,
      'expense',
      new.id,
      'expense:' || new.id::text || ':paid',
      actor
    )
    on conflict (condominium_id, idempotency_key) do update
      set idempotency_key = excluded.idempotency_key
    returning * into movement;

    if movement.account_id <> new.treasury_account_id
       or movement.amount <> new.amount
       or movement.currency_code <> new.currency_code
       or movement.direction <> 'debit'::public.treasury_movement_direction then
      raise exception 'expense treasury idempotency conflict';
    end if;

    insert into public.treasury_events(
      condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
    )
    select
      new.condominium_id,
      'movement',
      movement.id,
      'movement_recorded',
      actor,
      jsonb_build_object('source_type','expense','source_id',new.id)
    where not exists (
      select 1 from public.treasury_events te
      where te.entity_type = 'movement'
        and te.entity_id = movement.id
        and te.event_type = 'movement_recorded'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.hab127_prepare_payment_treasury() from public, anon, authenticated, service_role;
revoke all on function public.hab127_record_payment_treasury() from public, anon, authenticated, service_role;
revoke all on function public.hab127_prepare_expense_treasury() from public, anon, authenticated, service_role;
revoke all on function public.hab127_record_expense_treasury() from public, anon, authenticated, service_role;

drop trigger if exists hab127_prepare_payment_treasury on public.payments;
create trigger hab127_prepare_payment_treasury
before update on public.payments
for each row
when (old.status is distinct from new.status)
execute function public.hab127_prepare_payment_treasury();

drop trigger if exists hab127_record_payment_treasury on public.payments;
create trigger hab127_record_payment_treasury
after update on public.payments
for each row
when (old.status is distinct from new.status)
execute function public.hab127_record_payment_treasury();

drop trigger if exists hab127_prepare_expense_treasury on public.expenses;
create trigger hab127_prepare_expense_treasury
before update on public.expenses
for each row
when (old.status is distinct from new.status)
execute function public.hab127_prepare_expense_treasury();

drop trigger if exists hab127_record_expense_treasury on public.expenses;
create trigger hab127_record_expense_treasury
after update on public.expenses
for each row
when (old.status is distinct from new.status)
execute function public.hab127_record_expense_treasury();

comment on column public.payments.treasury_account_id is
  'Treasury account snapshot selected/resolved when the payment is approved.';
comment on column public.expenses.treasury_account_id is
  'Treasury account snapshot selected/resolved when the expense is marked paid.';

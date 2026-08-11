-- HAB-127: explicit account selection for condominiums that keep multiple accounts
-- in the same currency. Selection happens before the financial lifecycle transition;
-- the subsequent approval/mark-paid operation and Treasury movement remain atomic.

create or replace function public.select_payment_treasury_account(
  target_condominium uuid,
  target_payment uuid,
  target_account uuid
)
returns public.payments
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  payment public.payments;
  resolved uuid;
begin
  if not public.can_review_payments(target_condominium) then
    raise exception 'payment treasury selection denied';
  end if;

  select *
    into payment
    from public.payments
    where id = target_payment
      and condominium_id = target_condominium
    for update;

  if payment.id is null then
    raise exception 'payment not found';
  end if;

  if payment.status not in ('submitted', 'under_review') then
    raise exception 'treasury account can only be selected while payment is under review';
  end if;

  resolved := public.hab127_resolve_treasury_account(
    target_condominium,
    payment.original_currency_code,
    target_account
  );

  update public.payments
    set treasury_account_id = resolved,
        updated_at = now()
    where id = payment.id
    returning * into payment;

  return payment;
end;
$$;

create or replace function public.select_expense_treasury_account(
  target_condominium uuid,
  target_expense uuid,
  target_account uuid
)
returns public.expenses
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  expense public.expenses;
  resolved uuid;
begin
  if not public.can_manage_expenses(target_condominium) then
    raise exception 'expense treasury selection denied';
  end if;

  select *
    into expense
    from public.expenses
    where id = target_expense
      and condominium_id = target_condominium
    for update;

  if expense.id is null then
    raise exception 'expense not found';
  end if;

  if expense.status <> 'approved' then
    raise exception 'treasury account can only be selected for an approved expense';
  end if;

  resolved := public.hab127_resolve_treasury_account(
    target_condominium,
    expense.currency_code,
    target_account
  );

  update public.expenses
    set treasury_account_id = resolved,
        updated_at = now()
    where id = expense.id
    returning * into expense;

  insert into public.expense_events(
    expense_id,
    condominium_id,
    event_type,
    actor_user_id,
    metadata
  ) values (
    expense.id,
    target_condominium,
    'updated',
    auth.uid(),
    jsonb_build_object('treasury_account_selected', resolved)
  );

  return expense;
end;
$$;

revoke all on function public.select_payment_treasury_account(uuid,uuid,uuid) from public, anon;
revoke all on function public.select_expense_treasury_account(uuid,uuid,uuid) from public, anon;
grant execute on function public.select_payment_treasury_account(uuid,uuid,uuid) to authenticated, service_role;
grant execute on function public.select_expense_treasury_account(uuid,uuid,uuid) to authenticated, service_role;

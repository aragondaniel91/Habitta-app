-- Keep maintenance-to-expense references immutable while making repeated link requests idempotent.

create or replace function public.link_maintenance_expense(
  target_condominium uuid,
  target_work_order uuid,
  target_expense uuid,
  target_quote uuid default null
)
returns public.maintenance_work_order_expenses
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  expense_row public.expenses;
  created public.maintenance_work_order_expenses;
  inserted boolean := false;
begin
  if auth.uid() is null
    or not public.can_manage_maintenance(target_condominium)
    or not public.can_manage_expenses(target_condominium) then
    raise exception 'maintenance expense link denied';
  end if;
  if not exists (
    select 1 from public.maintenance_work_orders w
    where w.id = target_work_order and w.condominium_id = target_condominium
  ) then
    raise exception 'maintenance work order not found';
  end if;

  select * into expense_row
  from public.expenses e
  where e.id = target_expense and e.condominium_id = target_condominium;

  if expense_row.id is null or expense_row.status = 'void' then
    raise exception 'invalid maintenance expense';
  end if;
  if target_quote is not null and not exists (
    select 1 from public.maintenance_quotes q
    where q.id = target_quote
      and q.condominium_id = target_condominium
      and q.work_order_id = target_work_order
      and q.status = 'approved'
  ) then
    raise exception 'approved maintenance quote required';
  end if;

  insert into public.maintenance_work_order_expenses (
    condominium_id, work_order_id, expense_id, quote_id, linked_by
  ) values (
    target_condominium, target_work_order, target_expense, target_quote, auth.uid()
  )
  on conflict (work_order_id, expense_id) do nothing
  returning * into created;

  if created.id is null then
    select * into created
    from public.maintenance_work_order_expenses l
    where l.work_order_id = target_work_order
      and l.expense_id = target_expense;

    if created.quote_id is distinct from target_quote then
      raise exception 'maintenance expense link already exists with different quote';
    end if;

    return created;
  end if;

  inserted := true;

  if inserted then
    insert into public.maintenance_events (
      condominium_id, entity_type, entity_id, event_type, actor_user_id, metadata
    ) values (
      target_condominium,
      'work_order',
      target_work_order,
      'updated',
      auth.uid(),
      jsonb_build_object(
        'change', 'expense_linked',
        'expense_id', created.expense_id,
        'quote_id', created.quote_id,
        'amount', expense_row.amount,
        'currency_code', expense_row.currency_code
      )
    );
  end if;

  return created;
end;
$$;

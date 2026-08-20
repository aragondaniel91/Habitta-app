create or replace function public.reverse_receivable_item(target uuid,target_item uuid,reason text) returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare
  item public.receivable_items;
  entry public.receivable_ledger_entries;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) or coalesce(trim(reason),'')='' then
    raise exception 'invalid reversal';
  end if;

  select * into item
  from public.receivable_items
  where id=target_item and condominium_id=target
  for update;

  if item.id is null or item.lifecycle_status<>'active' then
    raise exception 'receivable unavailable';
  end if;

  if exists (
    select 1
    from public.receivable_ledger_entries e
    where e.receivable_item_id=item.id
      and e.entry_type='payment_credit'
      and not exists (
        select 1
        from public.receivable_ledger_entries r
        where r.reversal_of_entry_id=e.id
      )
  ) then
    raise exception using errcode='P0001', message='receivable_has_active_payment_credit';
  end if;

  for entry in
    select e.*
    from public.receivable_ledger_entries e
    where e.receivable_item_id=item.id
      and e.entry_type<>'reversal'
      and not exists (
        select 1 from public.receivable_ledger_entries r where r.reversal_of_entry_id=e.id
      )
    for update
  loop
    insert into public.receivable_ledger_entries(
      condominium_id,unit_id,receivable_item_id,entry_type,direction,amount,currency_code,
      effective_date,description,reversal_of_entry_id,created_by
    ) values (
      entry.condominium_id,entry.unit_id,entry.receivable_item_id,'reversal',
      case entry.direction when 'debit' then 'credit'::public.ledger_direction else 'debit'::public.ledger_direction end,
      entry.amount,entry.currency_code,current_date,trim(reason),entry.id,auth.uid()
    );
  end loop;

  update public.receivable_items
  set lifecycle_status='reversed',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=trim(reason)
  where id=item.id;
  return jsonb_build_object('id',item.id,'status','reversed');
end $$;

-- Read-only reconciliation workspace.  Matching and closing remain governed by their existing
-- append-only RPCs; this function only provides a complete, paginated view and close preview.
create function public.get_treasury_reconciliation_workspace(
  target_condominium uuid,
  target_reconciliation uuid,
  page_size integer default 50,
  page_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  reconciliation_record public.treasury_reconciliations;
  resolved_book_balance numeric(18, 2);
  matched_total numeric(18, 2);
  total_candidates integer;
begin
  if auth.uid() is null or not public.can_read_treasury(target_condominium) then
    raise exception 'treasury access denied';
  end if;
  if page_size not between 1 and 100 or page_offset < 0 then
    raise exception 'invalid reconciliation page';
  end if;

  select * into reconciliation_record
  from public.treasury_reconciliations
  where id = target_reconciliation and condominium_id = target_condominium;
  if reconciliation_record.id is null then raise exception 'reconciliation not found'; end if;

  select coalesce(sum(case m.direction when 'credit' then m.amount else -m.amount end), 0)::numeric(18, 2)
  into resolved_book_balance
  from public.treasury_movements m
  where m.account_id = reconciliation_record.account_id
    and m.occurred_on <= reconciliation_record.period_end;

  select count(*), coalesce(sum(m.amount), 0)::numeric(18, 2)
  into total_candidates, matched_total
  from public.treasury_movements m
  join public.treasury_reconciliation_items i
    on i.movement_id = m.id and i.reconciliation_id = reconciliation_record.id
  where m.account_id = reconciliation_record.account_id
    and m.occurred_on between reconciliation_record.period_start and reconciliation_record.period_end;

  return jsonb_build_object(
    'total_count', (
      select count(*)
      from public.treasury_movements m
      where m.account_id = reconciliation_record.account_id
        and m.occurred_on between reconciliation_record.period_start and reconciliation_record.period_end
    ),
    'matched_count', total_candidates,
    'matched_amount', matched_total,
    'book_closing_balance', resolved_book_balance,
    'difference', round(reconciliation_record.statement_closing_balance - resolved_book_balance, 2),
    'items', coalesce((
      select jsonb_agg(to_jsonb(candidate) order by candidate.occurred_on, candidate.created_at, candidate.id)
      from (
        select m.id, m.direction, m.movement_kind, m.amount, m.currency_code, m.occurred_on,
          m.description, m.reference, m.created_at,
          (current_item.movement_id is not null) as matched_in_reconciliation,
          other_item.reconciliation_id as matched_reconciliation_id
        from public.treasury_movements m
        left join public.treasury_reconciliation_items current_item
          on current_item.movement_id = m.id and current_item.reconciliation_id = reconciliation_record.id
        left join public.treasury_reconciliation_items other_item
          on other_item.movement_id = m.id and other_item.reconciliation_id <> reconciliation_record.id
        where m.account_id = reconciliation_record.account_id
          and m.occurred_on between reconciliation_record.period_start and reconciliation_record.period_end
        order by m.occurred_on, m.created_at, m.id
        limit page_size offset page_offset
      ) candidate
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_treasury_reconciliation_workspace(uuid, uuid, integer, integer) from public;
grant execute on function public.get_treasury_reconciliation_workspace(uuid, uuid, integer, integer) to authenticated, service_role;

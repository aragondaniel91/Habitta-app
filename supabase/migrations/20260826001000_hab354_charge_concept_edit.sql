create or replace function public.update_charge_concept(
  target uuid,
  target_concept uuid,
  next_code text,
  next_name text,
  next_description text,
  next_category public.charge_concept_category,
  next_default_currency text,
  next_default_amount numeric,
  next_is_active boolean
)
returns public.charge_concepts
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_concept public.charge_concepts;
  updated_concept public.charge_concepts;
  has_financial_history boolean;
  has_active_recurring_plan boolean;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then
    raise exception 'permission denied';
  end if;

  select * into current_concept
  from public.charge_concepts
  where id = target_concept
    and condominium_id = target
  for update;

  if current_concept.id is null then
    raise exception 'charge concept unavailable';
  end if;

  if trim(next_code) = ''
    or trim(next_name) = ''
    or (next_default_currency is not null and upper(next_default_currency) !~ '^[A-Z]{3}$')
    or (next_default_amount is not null and (
      next_default_amount <= 0
      or next_default_amount <> round(next_default_amount, 2)
    ))
  then
    raise exception 'invalid charge concept';
  end if;

  select exists (
    select 1
    from public.receivable_items r
    where r.condominium_id = target
      and r.concept_id = target_concept
  ) or exists (
    select 1
    from public.charge_batches b
    where b.condominium_id = target
      and b.concept_id = target_concept
      and b.status <> 'draft'
  ) into has_financial_history;

  select exists (
    select 1
    from public.recurring_charge_plans p
    where p.condominium_id = target
      and p.concept_id = target_concept
      and p.status = 'active'
  ) into has_active_recurring_plan;

  if has_financial_history and (
    trim(next_code) is distinct from current_concept.code
    or trim(next_name) is distinct from current_concept.name
    or next_category is distinct from current_concept.category
  ) then
    raise exception 'historical charge concept semantics are immutable';
  end if;

  if has_active_recurring_plan and not next_is_active then
    raise exception 'active recurring plan requires concept';
  end if;

  if has_active_recurring_plan and next_category is distinct from current_concept.category then
    raise exception 'active recurring plan requires stable concept category';
  end if;

  update public.charge_concepts
  set code = trim(next_code),
      name = trim(next_name),
      description = nullif(trim(coalesce(next_description, '')), ''),
      category = next_category,
      default_currency_code = case
        when next_default_currency is null or trim(next_default_currency) = '' then null
        else upper(trim(next_default_currency))
      end,
      default_amount = next_default_amount,
      is_active = next_is_active,
      updated_at = now()
  where id = current_concept.id
  returning * into updated_concept;

  return updated_concept;
end;
$$;

revoke update on public.charge_concepts from authenticated;

revoke all on function public.update_charge_concept(
  uuid,
  uuid,
  text,
  text,
  text,
  public.charge_concept_category,
  text,
  numeric,
  boolean
) from public, anon;

grant execute on function public.update_charge_concept(
  uuid,
  uuid,
  text,
  text,
  text,
  public.charge_concept_category,
  text,
  numeric,
  boolean
) to authenticated;

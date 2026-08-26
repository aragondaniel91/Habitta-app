create or replace function public.protect_charge_concept_history()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  has_financial_history boolean;
  has_active_recurring_plan boolean;
begin
  if new.condominium_id is distinct from old.condominium_id then
    raise exception 'charge concept tenant is immutable';
  end if;

  if trim(new.code) = '' or trim(new.name) = '' then
    raise exception 'invalid charge concept';
  end if;

  select exists (
    select 1
    from public.receivable_items r
    where r.condominium_id = old.condominium_id
      and r.concept_id = old.id
  ) or exists (
    select 1
    from public.charge_batches b
    where b.condominium_id = old.condominium_id
      and b.concept_id = old.id
      and b.status <> 'draft'
  ) into has_financial_history;

  select exists (
    select 1
    from public.recurring_charge_plans p
    where p.condominium_id = old.condominium_id
      and p.concept_id = old.id
      and p.status = 'active'
  ) into has_active_recurring_plan;

  if has_financial_history and (
    trim(new.code) is distinct from old.code
    or trim(new.name) is distinct from old.name
    or new.category is distinct from old.category
  ) then
    raise exception 'historical charge concept semantics are immutable';
  end if;

  if has_active_recurring_plan and not new.is_active then
    raise exception 'active recurring plan requires concept';
  end if;

  if has_active_recurring_plan and new.category is distinct from old.category then
    raise exception 'active recurring plan requires stable concept category';
  end if;

  new.code := trim(new.code);
  new.name := trim(new.name);
  new.description := nullif(trim(coalesce(new.description, '')), '');
  new.default_currency_code := case
    when new.default_currency_code is null or trim(new.default_currency_code) = '' then null
    else upper(trim(new.default_currency_code))
  end;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists charge_concept_history_guard on public.charge_concepts;
create trigger charge_concept_history_guard
before update on public.charge_concepts
for each row execute function public.protect_charge_concept_history();

revoke all on function public.protect_charge_concept_history() from public, anon, authenticated;

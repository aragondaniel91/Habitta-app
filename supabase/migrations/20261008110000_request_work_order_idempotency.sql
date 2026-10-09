-- Request-created work orders are durable/idempotent without restricting distinct interventions.
alter table public.maintenance_work_orders
  add column if not exists source_request_intent_key uuid,
  add column if not exists additional_scope text;

do $$ begin
  alter table public.maintenance_work_orders add constraint maintenance_work_orders_additional_scope_check
    check (additional_scope is null or char_length(trim(additional_scope)) between 3 and 500);
exception when duplicate_object then null;
end $$;

create unique index if not exists maintenance_work_orders_request_intent_unique
  on public.maintenance_work_orders (condominium_id, request_id, source_request_intent_key)
  where request_id is not null and source_request_intent_key is not null;

drop function if exists public.create_maintenance_work_order(uuid, uuid, uuid, uuid, uuid, public.maintenance_work_order_kind, public.maintenance_priority, text, text, timestamptz, date);

create or replace function public.create_maintenance_work_order(
  target_condominium uuid, target_asset uuid, target_request uuid, target_vendor uuid,
  target_assignee uuid, work_kind public.maintenance_work_order_kind,
  work_priority public.maintenance_priority, work_title text, work_description text,
  scheduled_at timestamptz default null, due_date date default null,
  idempotency_key uuid default null, additional_scope text default null
) returns public.maintenance_work_orders language plpgsql security definer
set search_path = public set row_security = off as $$
declare created public.maintenance_work_orders; normalized_scope text := nullif(trim(additional_scope), '');
begin
  if auth.uid() is null or not public.can_manage_maintenance(target_condominium) then raise exception 'maintenance management denied'; end if;
  if char_length(trim(work_title)) not between 3 and 180 or char_length(trim(work_description)) not between 3 and 5000 then raise exception 'invalid maintenance work order'; end if;
  if target_request is not null and idempotency_key is null then raise exception 'request work order idempotency key required'; end if;
  if normalized_scope is not null and char_length(normalized_scope) not between 3 and 500 then raise exception 'invalid additional maintenance scope'; end if;
  if target_asset is not null and not exists (select 1 from public.maintenance_assets a where a.id=target_asset and a.condominium_id=target_condominium and a.status <> 'retired') then raise exception 'invalid maintenance asset'; end if;
  if target_request is not null and not exists (select 1 from public.service_requests r where r.id=target_request and r.condominium_id=target_condominium) then raise exception 'invalid maintenance request'; end if;
  if target_vendor is not null and not exists (select 1 from public.vendors v where v.id=target_vendor and v.condominium_id=target_condominium and v.is_active) then raise exception 'invalid maintenance vendor'; end if;
  if target_assignee is not null and not public.is_valid_maintenance_assignee(target_condominium, target_assignee) then raise exception 'invalid maintenance assignee'; end if;
  if scheduled_at is not null and due_date is not null and due_date < scheduled_at::date then raise exception 'maintenance due date must not precede schedule'; end if;
  if target_request is not null then
    perform pg_advisory_xact_lock(hashtextextended(target_request::text, 0));
    select * into created from public.maintenance_work_orders w where w.condominium_id=target_condominium and w.request_id=target_request and w.source_request_intent_key=idempotency_key;
    if created.id is not null then return created; end if;
    if normalized_scope is null then
      select * into created from public.maintenance_work_orders w where w.condominium_id=target_condominium and w.request_id=target_request and w.status not in ('completed','cancelled') and w.kind=work_kind and w.priority=work_priority and w.title=trim(work_title) and w.description=trim(work_description) order by w.created_at asc limit 1;
      if created.id is not null then return created; end if;
    end if;
  end if;
  insert into public.maintenance_work_orders (condominium_id,asset_id,request_id,vendor_id,assigned_to_user_id,kind,priority,title,description,scheduled_for,due_on,source_request_intent_key,additional_scope,created_by)
  values (target_condominium,target_asset,target_request,target_vendor,target_assignee,work_kind,work_priority,trim(work_title),trim(work_description),scheduled_at,due_date,idempotency_key,normalized_scope,auth.uid()) returning * into created;
  insert into public.maintenance_events (condominium_id,entity_type,entity_id,event_type,actor_user_id,to_value) values (target_condominium,'work_order',created.id,'created',auth.uid(),jsonb_build_object('work_order_number',created.work_order_number,'status',created.status,'asset_id',created.asset_id,'request_id',created.request_id,'idempotency_key',created.source_request_intent_key,'additional_scope',created.additional_scope));
  return created;
end;
$$;
revoke execute on function public.create_maintenance_work_order(uuid,uuid,uuid,uuid,uuid,public.maintenance_work_order_kind,public.maintenance_priority,text,text,timestamptz,date,uuid,text) from public;
grant execute on function public.create_maintenance_work_order(uuid,uuid,uuid,uuid,uuid,public.maintenance_work_order_kind,public.maintenance_priority,text,text,timestamptz,date,uuid,text) to authenticated, service_role;

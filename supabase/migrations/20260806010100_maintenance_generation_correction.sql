-- Corrects recurrence advancement and closes maintenance authorization gaps.

create or replace function public.generate_due_maintenance_work_orders(
  target_condominium uuid,
  through_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_plan public.maintenance_plans;
  current_due date;
  next_due date;
  created_order public.maintenance_work_orders;
  generated_count integer := 0;
  iteration_count integer;
begin
  if through_date is null then
    raise exception 'maintenance generation date required';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    and (auth.uid() is null or not public.can_manage_maintenance(target_condominium)) then
    raise exception 'maintenance generation denied';
  end if;

  for current_plan in
    select p.*
    from public.maintenance_plans p
    join public.maintenance_assets a
      on a.id = p.asset_id and a.condominium_id = p.condominium_id
    where p.condominium_id = target_condominium
      and p.is_active
      and p.next_due_on <= through_date
      and a.status <> 'retired'
    order by p.next_due_on, p.id
    for update of p
  loop
    current_due := current_plan.next_due_on;
    iteration_count := 0;

    while current_due <= through_date loop
      iteration_count := iteration_count + 1;
      if iteration_count > 60 then
        raise exception 'maintenance plan backlog exceeds generation limit';
      end if;

      created_order := null;
      insert into public.maintenance_work_orders (
        condominium_id,
        asset_id,
        plan_id,
        plan_due_on,
        vendor_id,
        assigned_to_user_id,
        kind,
        priority,
        status,
        title,
        description,
        due_on,
        created_by
      ) values (
        target_condominium,
        current_plan.asset_id,
        current_plan.id,
        current_due,
        current_plan.default_vendor_id,
        current_plan.assigned_to_user_id,
        case current_plan.kind
          when 'preventive' then 'preventive'::public.maintenance_work_order_kind
          when 'inspection' then 'inspection'::public.maintenance_work_order_kind
        end,
        'normal',
        'scheduled',
        current_plan.name,
        current_plan.instructions,
        current_due,
        auth.uid()
      )
      on conflict (plan_id, plan_due_on)
        where plan_id is not null and plan_due_on is not null
      do nothing
      returning * into created_order;

      if created_order.id is not null then
        generated_count := generated_count + 1;
        insert into public.maintenance_events (
          condominium_id,
          entity_type,
          entity_id,
          event_type,
          actor_user_id,
          to_value,
          metadata
        ) values (
          target_condominium,
          'work_order',
          created_order.id,
          'generated',
          auth.uid(),
          jsonb_build_object(
            'status', created_order.status,
            'asset_id', created_order.asset_id,
            'plan_id', created_order.plan_id,
            'plan_due_on', created_order.plan_due_on
          ),
          jsonb_build_object('work_order_number', created_order.work_order_number)
        );
      end if;

      next_due := public.maintenance_next_due(
        current_due,
        current_plan.frequency_value,
        current_plan.frequency_unit
      );
      if next_due <= current_due then
        raise exception 'maintenance recurrence did not advance';
      end if;
      current_due := next_due;
    end loop;

    update public.maintenance_plans
    set last_generated_due_on = (
          select max(w.plan_due_on)
          from public.maintenance_work_orders w
          where w.plan_id = current_plan.id
        ),
        next_due_on = current_due,
        version = version + 1,
        updated_at = now()
    where id = current_plan.id;
  end loop;

  return generated_count;
end;
$$;

revoke execute on function public.generate_due_maintenance_work_orders(uuid, date) from public;
grant execute on function public.generate_due_maintenance_work_orders(uuid, date)
  to authenticated, service_role;

-- Statement-level guards reject every mutation attempt, including statements
-- that RLS would otherwise reduce to zero visible rows.
drop trigger if exists maintenance_service_logs_append_only
  on public.maintenance_service_logs;
create trigger maintenance_service_logs_append_only
before update or delete on public.maintenance_service_logs
for each statement execute function public.maintenance_append_only();

drop trigger if exists maintenance_events_append_only
  on public.maintenance_events;
create trigger maintenance_events_append_only
before update or delete on public.maintenance_events
for each statement execute function public.maintenance_append_only();

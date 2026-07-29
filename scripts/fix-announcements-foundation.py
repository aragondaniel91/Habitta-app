from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    value = file.read_text()
    if old not in value:
        raise SystemExit(f'marker not found in {path}')
    file.write_text(value.replace(old, new, 1))


replace_once(
    'packages/validation/src/index.ts',
    "  value: { audience?: string; buildingId?: string; unitId?: string },",
    "  value: {\n    audience?: string | undefined;\n    buildingId?: string | undefined;\n    unitId?: string | undefined;\n  },",
)

scope_guard = r'''
create or replace function public.validate_notification_event_scope()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  expected_unit uuid;
  aggregate_found boolean := false;
begin
  if new.aggregate_type = 'receivable' then
    select unit_id, true
      into expected_unit, aggregate_found
      from public.receivable_items
      where id = new.aggregate_id
        and condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'payment' then
    select unit_id, true
      into expected_unit, aggregate_found
      from public.payments
      where id = new.aggregate_id
        and condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'receipt' then
    select p.unit_id, true
      into expected_unit, aggregate_found
      from public.payment_receipts r
      join public.payments p on p.id = r.payment_id
      where r.id = new.aggregate_id
        and r.condominium_id = new.condominium_id
        and p.condominium_id = new.condominium_id;
  elsif new.aggregate_type = 'announcement' then
    select null::uuid, true
      into expected_unit, aggregate_found
      from public.announcements a
      where a.id = new.aggregate_id
        and a.condominium_id = new.condominium_id;
  else
    raise exception 'invalid notification aggregate type';
  end if;

  if not coalesce(aggregate_found, false) then
    raise exception 'notification aggregate does not belong to condominium';
  end if;

  if new.unit_id is distinct from expected_unit then
    raise exception 'notification unit does not match aggregate';
  end if;

  return new;
end;
$$;

'''
replace_once(
    'supabase/migrations/20260729002010_announcements_foundation.sql',
    'create function public.can_manage_announcements(target uuid)\n',
    scope_guard + 'create function public.can_manage_announcements(target uuid)\n',
)

old_counts = r'''select is((select status::text from public.announcements where title='Mantenimiento de ascensores'), 'published', 'publication changes status');
select is((select count(*) from public.announcement_recipients where announcement_id=(select id from public.announcements where title='Mantenimiento de ascensores')), 5::bigint, 'publication snapshots the five audience members');
select is((select count(*) from public.notifications where notification_type='announcement_published'), 5::bigint, 'publication creates in-app notifications');
select is((select count(*) from public.notification_deliveries where template_key='announcement_published'), 5::bigint, 'publication creates email deliveries');
select is((select count(*) from public.announcement_events where event_type='published'), 1::bigint, 'publication is audited');
update public.announcements set priority='normal' where title='Mantenimiento de ascensores';
'''
new_counts = r'''select is((select status::text from public.announcements where title='Mantenimiento de ascensores'), 'published', 'publication changes status');
reset role;
select is((select count(*) from public.announcement_recipients where announcement_id=(select id from public.announcements where title='Mantenimiento de ascensores')), 5::bigint, 'publication snapshots the five audience members');
select is((select count(*) from public.notifications where notification_type='announcement_published'), 5::bigint, 'publication creates in-app notifications');
select is((select count(*) from public.notification_deliveries where template_key='announcement_published'), 5::bigint, 'publication creates email deliveries');
select is((select count(*) from public.announcement_events where event_type='published'), 1::bigint, 'publication is audited');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
update public.announcements set priority='normal' where title='Mantenimiento de ascensores';
'''
replace_once('supabase/tests/announcements.sql', old_counts, new_counts)

from pathlib import Path

path = Path('supabase/tests/announcements.sql')
value = path.read_text()
old = """update public.announcements set priority='normal' where title='Mantenimiento de ascensores';
select is((select priority::text from public.announcements where title='Mantenimiento de ascensores'), 'urgent', 'published announcement cannot be directly updated');
"""
new = """select throws_ok(
  $$update public.announcements set priority='normal' where title='Mantenimiento de ascensores'$$,
  null,
  'permission denied for table announcements',
  'authenticated users cannot directly update announcements'
);
"""
if old not in value:
    raise SystemExit('direct update assertion not found')
path.write_text(value.replace(old, new, 1))

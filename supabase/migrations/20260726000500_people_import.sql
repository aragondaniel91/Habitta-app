create table public.people_imports (id uuid primary key default gen_random_uuid(), condominium_id uuid not null references public.condominiums(id), idempotency_key text not null, result jsonb not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(condominium_id,idempotency_key));
alter table public.people_imports enable row level security;
create policy people_imports_read on public.people_imports for select using(public.can_manage_people(condominium_id));
create function public.import_people_csv(target uuid, rows jsonb, key text) returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; unit_row public.units; person_row public.people; result jsonb:=jsonb_build_object('created',0,'reused',0,'rejected',0);
begin
 if auth.uid() is null or not public.can_manage_people(target) then raise exception 'permission denied'; end if;
 select result into result from people_imports where condominium_id=target and idempotency_key=key; if found then return result; end if;
 for item in select * from jsonb_array_elements(rows) loop
  select * into unit_row from units where condominium_id=target and code=item->>'unit_code'; if unit_row.id is null then raise exception 'unknown unit %',item->>'unit_code'; end if;
  select * into person_row from people where condominium_id=target and lower(email)=lower(nullif(item->>'email','')) limit 1;
  if person_row.id is null then insert into people(condominium_id,first_name,last_name,email,phone,created_by) values(target,item->>'first_name',item->>'last_name',nullif(lower(item->>'email'),''),nullif(item->>'phone',''),auth.uid()) returning * into person_row; result:=jsonb_set(result,'{created}',to_jsonb((result->>'created')::int+1)); else result:=jsonb_set(result,'{reused}',to_jsonb((result->>'reused')::int+1)); end if;
  if item->>'relationship' in ('owner','owner_occupant') then insert into unit_owners(unit_id,person_id,ownership_percentage,created_by) values(unit_row.id,person_row.id,nullif(item->>'ownership_percentage','')::numeric,auth.uid()) on conflict do nothing; end if;
  if item->>'relationship' in ('owner_occupant','tenant','family_member','authorized_occupant') then insert into unit_occupancies(unit_id,person_id,occupancy_type,created_by) values(unit_row.id,person_row.id,case when item->>'relationship'='owner_occupant' then 'owner_occupant' else (item->>'relationship')::occupancy_type end,auth.uid()) on conflict do nothing; end if;
 end loop;
 insert into people_imports(condominium_id,idempotency_key,result,created_by) values(target,key,result,auth.uid()); return result;
end $$;
revoke execute on function public.import_people_csv(uuid,jsonb,text) from public; grant execute on function public.import_people_csv(uuid,jsonb,text) to authenticated;

-- HAB-225: preserve the established financial RPC security boundary while
-- resolving a unit deterministically after HAB-209 made codes building-aware.
create function public.resolve_opening_balance_unit(target uuid, row_data jsonb)
returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare resolved public.units; supplied uuid; code_value text := btrim(coalesce(row_data ->> 'unit_code','')); building_value text := btrim(coalesce(row_data ->> 'building_name','')); matches integer;
begin
 if nullif(row_data ->> 'unit_id','') is not null then
  begin supplied := (row_data ->> 'unit_id')::uuid; exception when invalid_text_representation then return jsonb_build_object('error','Invalid unit id'); end;
  select u.* into resolved from public.units u where u.id = supplied;
  if not found then return jsonb_build_object('error','Unknown unit'); end if;
  if resolved.condominium_id <> target then return jsonb_build_object('error','Unit does not belong to this condominium'); end if;
  if code_value <> '' and resolved.code <> code_value then return jsonb_build_object('error','Unit code does not match unit id'); end if;
  if building_value <> '' and not exists(select 1 from public.buildings b where b.id = resolved.building_id and b.condominium_id = target and lower(b.name) = lower(building_value)) then return jsonb_build_object('error','Building does not match unit id'); end if;
 elsif building_value <> '' then
  select count(*) into matches from public.units u join public.buildings b on b.id = u.building_id where u.condominium_id = target and u.code = code_value and lower(b.name) = lower(building_value);
  if matches = 0 then return jsonb_build_object('error','Unknown unit or building'); end if;
  if matches > 1 then return jsonb_build_object('error','Ambiguous unit code'); end if;
  select u.* into resolved from public.units u join public.buildings b on b.id = u.building_id where u.condominium_id = target and u.code = code_value and lower(b.name) = lower(building_value);
 else
  select count(*) into matches from public.units u where u.condominium_id = target and u.code = code_value;
  if matches = 0 then return jsonb_build_object('error','Unknown unit'); end if;
  if matches > 1 then return jsonb_build_object('error','Ambiguous unit code; specify building_name'); end if;
  select u.* into resolved from public.units u where u.condominium_id = target and u.code = code_value;
 end if;
 return jsonb_build_object('unit_id',resolved.id,'unit_code',resolved.code);
end $$;

create or replace function public.preview_opening_balances(target uuid,rows jsonb) returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare valid jsonb := '[]'; errors jsonb := '[]'; row_data jsonb; resolved jsonb; n int := 1; issue text; seen text[] := '{}'; row_key text;
begin
 if auth.uid() is null or not public.can_manage_receivables(target) then raise exception 'permission denied'; end if;
 for row_data in select value from jsonb_array_elements(rows) loop
  n := n + 1; resolved := public.resolve_opening_balance_unit(target,row_data); issue := resolved ->> 'error';
  if issue is null and row_data ->> 'balance_type' not in ('debit','credit') then issue := 'Invalid balance type'; elsif issue is null and upper(row_data ->> 'currency_code') !~ '^[A-Z]{3}$' then issue := 'Invalid currency'; elsif issue is null and (coalesce(row_data ->> 'amount','') !~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,2})?$' or (row_data ->> 'amount')::numeric <= 0) then issue := 'Invalid amount'; elsif issue is null then begin perform (row_data ->> 'effective_date')::date; exception when others then issue := 'Invalid date'; end; end if;
  row_key := concat_ws(':',resolved ->> 'unit_id',row_data ->> 'balance_type',upper(row_data ->> 'currency_code'));
  if issue is null and row_key = any(seen) then issue := 'Duplicate row'; end if;
  if issue is null then seen := array_append(seen,row_key); valid := valid || jsonb_build_array(row_data || jsonb_build_object('unit_id',resolved ->> 'unit_id','unit_code',resolved ->> 'unit_code','currency_code',upper(row_data ->> 'currency_code'))); else errors := errors || jsonb_build_array(jsonb_build_object('row',n,'error',issue)); end if;
 end loop;
 return jsonb_build_object('valid',valid,'errors',errors);
end $$;

create or replace function public.import_opening_balances(target uuid,rows jsonb,key text,import_filename text default null) returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
declare row_data jsonb; item public.receivable_items; result_payload jsonb; existing jsonb; metadata jsonb;
begin
 if auth.uid() is null or not public.can_manage_receivables(target) then raise exception 'permission denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text || ':' || key,0)); select result into existing from public.opening_balance_imports where condominium_id = target and idempotency_key = key; if found then return existing; end if;
 metadata := public.preview_opening_balances(target,rows); if jsonb_array_length(metadata -> 'errors') > 0 or jsonb_array_length(metadata -> 'valid') <> jsonb_array_length(rows) then raise exception 'invalid opening balances'; end if;
 for row_data in select value from jsonb_array_elements(metadata -> 'valid') loop
  if row_data ->> 'balance_type' = 'debit' then item := public.insert_receivable_item_and_entry(target,(row_data ->> 'unit_id')::uuid,null,null,'opening_balance','opening_debit','debit',coalesce(nullif(row_data ->> 'description',''),'Opening balance'),(row_data ->> 'amount')::numeric,upper(row_data ->> 'currency_code'),(row_data ->> 'effective_date')::date,null); else insert into public.receivable_ledger_entries(condominium_id,unit_id,entry_type,direction,amount,currency_code,effective_date,description,created_by) values(target,(row_data ->> 'unit_id')::uuid,'opening_credit','credit',(row_data ->> 'amount')::numeric,upper(row_data ->> 'currency_code'),(row_data ->> 'effective_date')::date,coalesce(nullif(row_data ->> 'description',''),'Opening balance'),auth.uid()); end if;
 end loop;
 result_payload := jsonb_build_object('created',jsonb_array_length(rows)); insert into public.opening_balance_imports(condominium_id,idempotency_key,filename,currency_codes,effective_date_min,effective_date_max,result,created_by) select target,key,import_filename,array_agg(distinct upper(x ->> 'currency_code')),min((x ->> 'effective_date')::date),max((x ->> 'effective_date')::date),result_payload,auth.uid() from jsonb_array_elements(metadata -> 'valid') x; return result_payload;
end $$;

revoke all on function public.resolve_opening_balance_unit(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.preview_opening_balances(uuid,jsonb),public.import_opening_balances(uuid,jsonb,text,text) from public;
grant execute on function public.preview_opening_balances(uuid,jsonb),public.import_opening_balances(uuid,jsonb,text,text) to authenticated,service_role;

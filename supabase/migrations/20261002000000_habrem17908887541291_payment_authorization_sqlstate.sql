-- Remediate payment authorization SQLSTATE mappings in deployed environments.
-- Historical migrations remain immutable; these replacements preserve all other behavior.

create or replace function public.create_payment_draft(
  target uuid,
  target_unit uuid,
  target_method uuid,
  submitted_for uuid,
  payment_on date,
  amount numeric,
  currency text,
  payer text,
  reference_value text,
  notes_value text,
  key text
) returns public.payments
language plpgsql security definer set search_path=public set row_security=off as $$
declare
  existing public.payments;
  created public.payments;
  method public.condominium_payment_methods;
  own_person uuid;
  is_staff boolean;
begin
  if auth.uid() is null or target is null or target_unit is null or payment_on is null
    or amount is null or amount<=0 or amount<>round(amount,2)
    or currency !~ '^[A-Z]{3}$' or coalesce(trim(payer),'')=''
    or coalesce(trim(key),'')='' then
    raise exception 'invalid payment draft';
  end if;

  is_staff:=public.can_register_payment_for(target);
  perform pg_advisory_xact_lock(hashtextextended(target::text||':'||key,0));
  select * into existing from public.payments
    where condominium_id=target and idempotency_key=key;
  if found then
    if not is_staff and submitted_for is null then
      submitted_for:=existing.submitted_for_person_id;
    end if;
    if (existing.unit_id,existing.payment_method_id,existing.submitted_for_person_id,
        existing.payment_date,existing.original_amount,existing.original_currency_code,
        existing.payer_name,existing.reference,existing.notes)
       is distinct from
       (target_unit,target_method,submitted_for,payment_on,amount,currency,
        trim(payer),nullif(trim(reference_value),''),nullif(trim(notes_value),'')) then
      raise exception 'idempotency conflict' using errcode='23505';
    end if;
    return existing;
  end if;

  select * into method from public.condominium_payment_methods
    where id=target_method and condominium_id=target and is_active;
  if method.id is null or method.currency_code<>currency
    or not exists(select 1 from public.units where id=target_unit and condominium_id=target) then
    raise exception 'invalid payment method or unit';
  end if;

  if is_staff then
    if submitted_for is not null and not exists(
      select 1 from public.people p
      where p.id=submitted_for and p.condominium_id=target and p.status='active'
        and (
          exists(select 1 from public.unit_owners o where o.unit_id=target_unit and o.person_id=p.id
            and o.starts_at<=current_date and (o.ends_at is null or o.ends_at>=current_date))
          or exists(select 1 from public.unit_occupancies o where o.unit_id=target_unit and o.person_id=p.id
            and o.starts_at<=current_date and (o.ends_at is null or o.ends_at>=current_date))
        )
    ) then raise exception 'invalid represented person'; end if;
  else
    select p.id into own_person from public.people p
      where p.condominium_id=target and p.auth_user_id=auth.uid() and p.status='active'
        and (
          exists(select 1 from public.unit_owners o where o.unit_id=target_unit and o.person_id=p.id
            and o.starts_at<=current_date and (o.ends_at is null or o.ends_at>=current_date))
          or exists(select 1 from public.unit_occupancies o where o.unit_id=target_unit and o.person_id=p.id
            and o.occupancy_type in ('owner_occupant','tenant','authorized_occupant')
            and o.starts_at<=current_date and (o.ends_at is null or o.ends_at>=current_date))
        ) limit 1;
    if own_person is null or (submitted_for is not null and submitted_for<>own_person) then
      raise exception using errcode='42501', message='payment submission denied';
    end if;
    submitted_for:=coalesce(submitted_for,own_person);
  end if;

  insert into public.payments(
    condominium_id,unit_id,submitted_by_user_id,submitted_for_person_id,payment_method_id,
    payment_date,original_amount,original_currency_code,payer_name,reference,notes,idempotency_key
  ) values (
    target,target_unit,auth.uid(),submitted_for,target_method,payment_on,amount,currency,
    trim(payer),nullif(trim(reference_value),''),nullif(trim(notes_value),''),key
  ) returning * into created;
  return created;
end $$;

create or replace function public.update_payment_draft(
  target uuid,target_payment uuid,target_method uuid,payment_on date,amount numeric,
  currency text,payer text,reference_value text,notes_value text
) returns public.payments
language plpgsql security definer set search_path=public set row_security=off as $$
declare p public.payments; method public.condominium_payment_methods;
begin
  select * into p from public.payments
    where id=target_payment and condominium_id=target for update;
  if p.id is null then
    raise exception 'payment update denied';
  end if;
  -- The submitter, or staff allowed to register payments on behalf of residents.
  if p.submitted_by_user_id is distinct from auth.uid()
    and not public.can_register_payment_for(target) then
    raise exception using errcode='42501', message='payment update denied';
  end if;
  if p.status not in ('draft','correction_requested')
    or payment_on is null or amount is null or amount<=0 or amount<>round(amount,2)
    or currency !~ '^[A-Z]{3}$' or coalesce(trim(payer),'')='' then
    raise exception 'payment update denied';
  end if;
  select * into method from public.condominium_payment_methods
    where id=target_method and condominium_id=target and is_active;
  if method.id is null or method.currency_code<>currency then
    raise exception 'invalid payment method or currency';
  end if;
  update public.payments set
    payment_method_id=target_method,payment_date=payment_on,original_amount=amount,
    original_currency_code=currency,payer_name=trim(payer),
    reference=nullif(trim(reference_value),''),notes=nullif(trim(notes_value),''),
    updated_at=now(),status='draft',correction_reason=null
  where id=p.id returning * into p;
  return p;
end $$;

-- Submission uses the same authority as editing a draft: the submitter, or staff allowed to
-- register payments on behalf of residents. Each unmet requirement raises its own message so the
-- API can tell the administrator what is missing.
create or replace function public.submit_payment(
  target uuid,target_payment uuid
) returns public.payments
language plpgsql security definer set search_path=public set row_security=off as $$
declare p public.payments; m public.condominium_payment_methods;
begin
  select * into p from public.payments
    where id=target_payment and condominium_id=target for update;
  if p.id is null then
    raise exception 'payment cannot be submitted';
  end if;
  if p.submitted_by_user_id is distinct from auth.uid()
    and not public.can_register_payment_for(target) then
    raise exception using errcode='42501', message='payment submission denied';
  end if;
  if p.status not in ('draft','correction_requested') then
    raise exception 'payment cannot be submitted';
  end if;
  select * into m from public.condominium_payment_methods where id=p.payment_method_id;
  if m.requires_reference and coalesce(trim(p.reference),'')='' then
    raise exception 'payment reference required';
  end if;
  if m.requires_proof and not exists(
    select 1 from public.payment_proofs where payment_id=p.id and superseded_at is null
  ) then
    raise exception 'payment proof required';
  end if;
  update public.payments set status='submitted',submitted_at=now(),updated_at=now()
    where id=p.id returning * into p;
  return p;
end $$;

-- Payment methods referenced by any payment are part of that payment's history and receipt
-- snapshot, so they can only be deactivated. An unused method may be deleted outright.
create or replace function public.delete_payment_method(target uuid,target_method uuid)
returns uuid
language plpgsql security definer set search_path=public set row_security=off as $$
declare m public.condominium_payment_methods;
begin
  if not public.can_manage_receivables(target) then
    raise exception using errcode='42501', message='payment method management denied';
  end if;
  select * into m from public.condominium_payment_methods
    where id=target_method and condominium_id=target for update;
  if m.id is null then
    raise exception 'payment method not found';
  end if;
  if exists(select 1 from public.payments where payment_method_id=m.id) then
    raise exception 'payment method in use';
  end if;
  delete from public.condominium_payment_methods where id=m.id;
  return m.id;
end $$;

revoke all on function public.delete_payment_method(uuid,uuid) from public;
grant execute on function public.delete_payment_method(uuid,uuid) to authenticated,service_role;

create or replace function public.payment_transition(target uuid,target_payment uuid,next_status public.payment_status,reason text default null) returns public.payments language plpgsql security definer set search_path=public set row_security=off as $$ declare p public.payments; begin if not public.can_review_payments(target) then raise exception using errcode='42501', message='review denied'; end if; select * into p from public.payments where id=target_payment and condominium_id=target for update; if next_status='under_review' and p.status='submitted' then update public.payments set status=next_status,reviewed_by=auth.uid(),reviewed_at=now() where id=p.id returning * into p; elsif next_status='correction_requested' and p.status in ('submitted','under_review') and coalesce(trim(reason),'')<>'' then update public.payments set status=next_status,correction_reason=trim(reason) where id=p.id returning * into p; elsif next_status='rejected' and p.status in ('submitted','under_review') and coalesce(trim(reason),'')<>'' then update public.payments set status=next_status,rejected_by=auth.uid(),rejected_at=now(),rejection_reason=trim(reason) where id=p.id returning * into p; else raise exception 'invalid transition'; end if; return p; end $$;

create or replace function public.validate_payment_allocations(
  target uuid,target_payment uuid,proposals jsonb,lock_rows boolean default false
) returns jsonb
language plpgsql security definer set search_path=public set row_security=off as $$
declare
  p public.payments; u public.units; a jsonb; item public.receivable_items;
  outstanding numeric; payment_value numeric; receivable_value numeric; rate_value numeric;
  used numeric:=0; errors jsonb:='[]'::jsonb; rows_value jsonb:='[]'::jsonb;
  recognized jsonb; duplicate_warning boolean;
begin
  if not public.can_review_payments(target) then raise exception using errcode='42501', message='review denied'; end if;
  if jsonb_typeof(proposals)<>'array' then raise exception 'allocations must be an array'; end if;
  if lock_rows then
    select * into p from public.payments where id=target_payment and condominium_id=target for update;
  else
    select * into p from public.payments where id=target_payment and condominium_id=target;
  end if;
  if p.id is null then raise exception 'payment not found'; end if;
  select * into u from public.units where id=p.unit_id and condominium_id=target;
  if p.status not in ('submitted','under_review') then
    errors:=errors||jsonb_build_array('invalid payment status');
  end if;
  if exists(select 1 from jsonb_array_elements(proposals) x
    group by x->>'receivable_item_id' having count(*)>1) then
    errors:=errors||jsonb_build_array('duplicate receivable item');
  end if;

  for a in select value from jsonb_array_elements(proposals) loop
    begin
      payment_value:=(a->>'payment_amount')::numeric;
      receivable_value:=(a->>'receivable_amount')::numeric;
      rate_value:=nullif(a->>'receivable_per_payment_rate','')::numeric;
    exception when others then
      errors:=errors||jsonb_build_array('invalid decimal allocation');
      continue;
    end;
    if lock_rows then
      select * into item from public.receivable_items
        where id=(a->>'receivable_item_id')::uuid and condominium_id=target
          and unit_id=p.unit_id and lifecycle_status='active' for update;
    else
      select * into item from public.receivable_items
        where id=(a->>'receivable_item_id')::uuid and condominium_id=target
          and unit_id=p.unit_id and lifecycle_status='active';
    end if;
    if item.id is null then
      errors:=errors||jsonb_build_array('invalid receivable item');
      continue;
    end if;
    select coalesce(sum(case direction when 'debit' then amount else -amount end),0)
      into outstanding from public.receivable_ledger_entries where receivable_item_id=item.id;
    if payment_value<=0 or receivable_value<=0 then
      errors:=errors||jsonb_build_array('allocation amounts must be positive');
    elsif (a->>'payment_currency_code')<>p.original_currency_code
      or (a->>'receivable_currency_code')<>item.currency_code then
      errors:=errors||jsonb_build_array('allocation currency mismatch');
    elsif p.original_currency_code=item.currency_code
      and (payment_value<>receivable_value or (rate_value is not null and rate_value<>1)) then
      errors:=errors||jsonb_build_array('same currency allocation must be one to one');
    elsif p.original_currency_code<>item.currency_code
      and (rate_value is null or rate_value<=0 or receivable_value<>round(payment_value*rate_value,2)) then
      errors:=errors||jsonb_build_array('cross currency allocation requires an exact rate');
    elsif receivable_value>outstanding then
      errors:=errors||jsonb_build_array('allocation exceeds outstanding');
    end if;
    used:=used+payment_value;
    rows_value:=rows_value||jsonb_build_array(jsonb_build_object(
      'receivable_item_id',item.id,'description',item.description,
      'outstanding',to_char(outstanding,'FM999999999999990.00'),
      'payment_amount',to_char(payment_value,'FM999999999999990.00'),
      'receivable_amount',to_char(receivable_value,'FM999999999999990.00'),
      'payment_currency_code',p.original_currency_code,
      'receivable_currency_code',item.currency_code,
      'receivable_per_payment_rate',case when rate_value is null then null else to_char(rate_value,'FM99999999999990.0000000000') end
    ));
  end loop;
  if used>p.original_amount then errors:=errors||jsonb_build_array('payment amount exceeded'); end if;
  select coalesce(jsonb_object_agg(currency_code,total),'{}'::jsonb) into recognized
  from (
    select x->>'receivable_currency_code' currency_code,
      to_char(sum((x->>'receivable_amount')::numeric),'FM999999999999990.00') total
    from jsonb_array_elements(rows_value) x group by x->>'receivable_currency_code'
  ) totals;
  select exists(
    select 1 from public.payments other where other.condominium_id=target
      and other.id<>p.id and other.unit_id=p.unit_id and other.payment_date=p.payment_date
      and other.original_amount=p.original_amount
      and other.original_currency_code=p.original_currency_code
      and other.reference is not distinct from p.reference
      and other.payment_method_id=p.payment_method_id
      and other.status not in ('rejected','reversed')
  ) into duplicate_warning;
  return jsonb_build_object(
    'payment',jsonb_build_object('id',p.id,'status',p.status,'amount',to_char(p.original_amount,'FM999999999999990.00'),'currency_code',p.original_currency_code),
    'unit',jsonb_build_object('id',u.id,'code',u.code),
    'allocations',rows_value,'total_used',to_char(used,'FM999999999999990.00'),
    'recognized_by_currency',recognized,
    'remaining',to_char(p.original_amount-used,'FM999999999999990.00'),
    'errors',errors,
    'warnings',case when duplicate_warning then jsonb_build_array('possible duplicate payment') else '[]'::jsonb end
  );
end $$;

create or replace function public.approve_payment(target uuid,target_payment uuid,allocations jsonb)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare
  p public.payments; a jsonb; allocation public.payment_allocations;
  validation jsonb; used numeric:=0; remaining numeric; year_value integer;
  seq integer; receipt public.payment_receipts; condo public.condominiums;
  unit_value public.units; method public.condominium_payment_methods; person public.people;
  approved_time timestamptz:=now(); snapshot_value jsonb;
begin
  if not public.can_review_payments(target) then raise exception using errcode='42501', message='approval denied'; end if;
  if jsonb_typeof(allocations)<>'array' then raise exception 'allocations must be an array'; end if;
  select * into p from public.payments where id=target_payment and condominium_id=target for update;
  if p.id is null then raise exception 'payment not found'; end if;
  if p.status='approved' then
    select * into receipt from public.payment_receipts where payment_id=p.id;
    return jsonb_build_object('payment_id',p.id,'receipt_number',receipt.receipt_number,'idempotent',true);
  end if;
  if p.status not in ('submitted','under_review') then raise exception 'invalid payment status'; end if;
  validation:=public.validate_payment_allocations(target,target_payment,allocations,true);
  if jsonb_array_length(validation->'errors')>0 then raise exception 'invalid payment allocations'; end if;

  for a in select value from jsonb_array_elements(allocations) loop
    insert into public.payment_allocations(
      condominium_id,payment_id,receivable_item_id,payment_currency_code,receivable_currency_code,
      payment_amount,receivable_amount,receivable_per_payment_rate,fx_rate_source,fx_rate_at,created_by
    ) values (
      target,p.id,(a->>'receivable_item_id')::uuid,p.original_currency_code,a->>'receivable_currency_code',
      (a->>'payment_amount')::numeric,(a->>'receivable_amount')::numeric,
      nullif(a->>'receivable_per_payment_rate','')::numeric,nullif(a->>'fx_rate_source',''),
      nullif(a->>'fx_rate_at','')::timestamptz,auth.uid()
    ) returning * into allocation;
    insert into public.receivable_ledger_entries(
      condominium_id,unit_id,receivable_item_id,entry_type,direction,amount,currency_code,
      effective_date,description,payment_id,payment_allocation_id,created_by
    ) values (
      target,p.unit_id,allocation.receivable_item_id,'payment_credit','credit',
      allocation.receivable_amount,allocation.receivable_currency_code,p.payment_date,
      'Payment application',p.id,allocation.id,auth.uid()
    );
    used:=used+allocation.payment_amount;
  end loop;
  remaining:=p.original_amount-used;
  if remaining>0 then
    insert into public.receivable_ledger_entries(
      condominium_id,unit_id,entry_type,direction,amount,currency_code,effective_date,
      description,payment_id,created_by
    ) values (
      target,p.unit_id,'payment_credit','credit',remaining,p.original_currency_code,
      p.payment_date,'Unapplied payment credit',p.id,auth.uid()
    );
  end if;

  year_value:=extract(year from approved_time);
  insert into public.payment_receipt_sequences(condominium_id,year,last_number)
    values(target,year_value,0) on conflict(condominium_id,year) do nothing;
  update public.payment_receipt_sequences set last_number=last_number+1
    where condominium_id=target and year=year_value returning last_number into seq;
  select * into condo from public.condominiums where id=target;
  select * into unit_value from public.units where id=p.unit_id;
  select * into method from public.condominium_payment_methods where id=p.payment_method_id;
  if p.submitted_for_person_id is not null then
    select * into person from public.people where id=p.submitted_for_person_id;
  end if;
  snapshot_value:=jsonb_build_object(
    'condominium',jsonb_build_object('id',condo.id,'name',condo.name),
    'unit',jsonb_build_object('id',unit_value.id,'code',unit_value.code),
    'method',jsonb_build_object(
      'id',method.id,'type',method.method_type,'display_name',method.display_name,
      'currency_code',method.currency_code,'account_holder',method.account_holder,
      'bank_name',method.bank_name,'account_identifier_masked',method.account_identifier_masked,
      'phone_masked',method.phone_masked,'email_masked',method.email_masked
    ),
    'payment',jsonb_build_object(
      'payer',p.payer_name,'submitted_for_person',
        case when person.id is null then null else jsonb_build_object('id',person.id,'name',trim(person.first_name||' '||person.last_name)) end,
      'date',p.payment_date,'amount',to_char(p.original_amount,'FM999999999999990.00'),
      'currency_code',p.original_currency_code,'reference',p.reference,'notes',p.notes
    ),
    'approval',jsonb_build_object(
      'approved_by',auth.uid(),'approved_at',approved_time,
      'allocations',coalesce((select jsonb_agg(jsonb_build_object(
        'receivable_item_id',x.receivable_item_id,'payment_amount',to_char(x.payment_amount,'FM999999999999990.00'),
        'receivable_amount',to_char(x.receivable_amount,'FM999999999999990.00'),
        'payment_currency_code',x.payment_currency_code,'receivable_currency_code',x.receivable_currency_code,
        'receivable_per_payment_rate',case when x.receivable_per_payment_rate is null then null else to_char(x.receivable_per_payment_rate,'FM99999999999990.0000000000') end,
        'fx_rate_source',x.fx_rate_source,'fx_rate_at',x.fx_rate_at
      )) from public.payment_allocations x where x.payment_id=p.id),'[]'::jsonb),
      'unapplied_credit',to_char(remaining,'FM999999999999990.00')
    )
  );
  insert into public.payment_receipts(
    condominium_id,payment_id,receipt_number,sequence_year,sequence_number,issued_at,issued_by,snapshot
  ) values (
    target,p.id,format('REC-%s-%s',year_value,lpad(seq::text,6,'0')),
    year_value,seq,approved_time,auth.uid(),snapshot_value
  ) returning * into receipt;
  update public.payments set status='approved',approved_by=auth.uid(),approved_at=approved_time,updated_at=approved_time where id=p.id;
  return jsonb_build_object('payment_id',p.id,'receipt_number',receipt.receipt_number,'unapplied_credit',to_char(remaining,'FM999999999999990.00'));
end $$;

create or replace function public.reverse_payment(target uuid,target_payment uuid,reason text) returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$ declare p public.payments; e public.receivable_ledger_entries; begin if not public.can_review_payments(target) then raise exception using errcode='42501', message='reversal denied'; end if; if coalesce(trim(reason),'')='' then raise exception 'reversal reason required'; end if; select * into p from public.payments where id=target_payment and condominium_id=target for update; if p.status<>'approved' then raise exception 'payment not reversible'; end if; for e in select * from public.receivable_ledger_entries where payment_id=p.id and entry_type='payment_credit' for update loop insert into public.receivable_ledger_entries(condominium_id,unit_id,receivable_item_id,entry_type,direction,amount,currency_code,effective_date,description,reversal_of_entry_id,payment_id,created_by) values(e.condominium_id,e.unit_id,e.receivable_item_id,'reversal','debit',e.amount,e.currency_code,current_date,trim(reason),e.id,p.id,auth.uid()); end loop; update public.payments set status='reversed',reversed_by=auth.uid(),reversed_at=now(),reversal_reason=trim(reason) where id=p.id; return jsonb_build_object('payment_id',p.id,'status','reversed'); end $$;

create or replace function public.select_payment_treasury_account(
  target_condominium uuid,
  target_payment uuid,
  target_account uuid
)
returns public.payments
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  payment public.payments;
  resolved uuid;
begin
  if not public.can_review_payments(target_condominium) then
    raise exception using errcode = '42501', message = 'payment treasury selection denied';
  end if;

  select *
    into payment
    from public.payments
    where id = target_payment
      and condominium_id = target_condominium
    for update;

  if payment.id is null then
    raise exception 'payment not found';
  end if;

  if payment.status not in ('submitted', 'under_review') then
    raise exception 'treasury account can only be selected while payment is under review';
  end if;

  resolved := public.hab127_resolve_treasury_account(
    target_condominium,
    payment.original_currency_code,
    target_account
  );

  update public.payments
    set treasury_account_id = resolved,
        updated_at = now()
    where id = payment.id
    returning * into payment;

  return payment;
end;
$$;

create or replace function public.payment_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and public.is_condominium_purge_authorized(old.condominium_id) then
    return old;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'payments cannot be deleted';
  end if;

  if old.status = 'reversed' then
    raise exception 'financial payment is immutable';
  end if;

  if old.status = 'approved' and new.status <> 'reversed' then
    raise exception 'financial payment is immutable';
  end if;

  if new.treasury_account_id is distinct from old.treasury_account_id then
    if old.status not in ('submitted', 'under_review') then
      raise exception 'treasury account can only be selected during payment review';
    end if;

    if not public.can_review_payments(old.condominium_id) then
      raise exception using errcode = '42501', message = 'payment treasury selection denied';
    end if;
  end if;

  if old.status not in ('draft', 'correction_requested')
     and (
       new.original_amount,
       new.original_currency_code,
       new.payment_method_id,
       new.payment_date,
       new.payer_name,
       new.reference,
       new.notes
     ) is distinct from (
       old.original_amount,
       old.original_currency_code,
       old.payment_method_id,
       old.payment_date,
       old.payer_name,
       old.reference,
       old.notes
     ) then
    raise exception 'submitted payment financial data is locked';
  end if;

  return new;
end;
$$;

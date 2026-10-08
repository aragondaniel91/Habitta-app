-- A correction request remains active until the submitter explicitly resubmits the payment.
-- Saving corrected financial details must not silently turn it back into a draft or discard the
-- reviewer's instruction. The existing authorization and financial-data validation are retained.

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
    updated_at=now()
  where id=p.id returning * into p;
  return p;
end $$;

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
  update public.payments set
    status='submitted',submitted_at=now(),updated_at=now(),correction_reason=null
  where id=p.id returning * into p;
  return p;
end $$;

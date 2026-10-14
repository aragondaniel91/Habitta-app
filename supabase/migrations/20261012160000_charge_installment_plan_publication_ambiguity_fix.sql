-- P6-009: repair the already-applied P6-007 publication function without replaying financial writes.
-- Fresh databases receive the same definition from 20261012150000; this is only for databases
-- that recorded that migration before the PL/pgSQL name-resolution repair.
create or replace function public.post_charge_installment_plans(
  target uuid, target_concept uuid, batch_name text, batch_currency text, issue_on date, due_on date,
  fixed_amount numeric, rows jsonb, target_schedule jsonb, key text
) returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare preview jsonb; publication_result jsonb; batch public.charge_batches; row_data jsonb; unit_row public.units; obligor uuid;
  item public.receivable_items; agreement public.payment_agreements; agreements jsonb := '[]'::jsonb; items jsonb := '[]'::jsonb; result_payload jsonb;
begin
  if auth.uid() is null or not public.can_manage_receivables(target) then raise exception 'permission denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text||':charge-plan:'||key,0));
  select publication.result into publication_result from public.charge_installment_plan_publications publication where publication.condominium_id=target and publication.idempotency_key=key;
  if found then return publication_result; end if;
  preview := public.preview_charge_installment_plans(target,target_concept,batch_currency,issue_on,due_on,fixed_amount,rows,target_schedule);
  if jsonb_array_length(preview->'blockers') > 0 or jsonb_array_length(preview->'valid') <> jsonb_array_length(rows) then raise exception 'one or more selected units cannot be charged' using errcode='22023'; end if;
  insert into public.charge_batches(condominium_id,concept_id,name,issue_date,due_date,currency_code,distribution_method,idempotency_key,created_by)
  values(target,target_concept,trim(batch_name),issue_on,due_on,batch_currency,'fixed_per_unit','plan:'||key,auth.uid()) returning * into batch;
  for row_data in select value from jsonb_array_elements(rows) loop
    select * into unit_row from public.units where id=(row_data->>'unit_id')::uuid and condominium_id=target and status='active' for key share;
    select o.person_id into obligor from public.unit_owners o join public.people p on p.id=o.person_id
    where o.unit_id=unit_row.id and p.condominium_id=target and p.status='active' and o.starts_at<=current_date and (o.ends_at is null or o.ends_at>=current_date)
    order by o.is_primary_contact desc,o.created_at asc limit 1;
    if obligor is null then raise exception 'verified legal owner changed before publication' using errcode='40001'; end if;
    item := public.insert_receivable_item_and_entry(target,unit_row.id,target_concept,batch.id,'charge','charge','debit',trim(batch_name),fixed_amount,batch_currency,issue_on,due_on);
    insert into public.payment_agreements(condominium_id,unit_id,legal_obligor_person_id,initiated_by,proposing_actor_kind,proposed_by_user_id,currency_code,status,schedule,reason,idempotency_key)
    values(target,unit_row.id,obligor,'administrator','administrator',auth.uid(),batch_currency,'pending',target_schedule,'Propuesta creada junto con el cargo original','charge-plan:'||key||':'||unit_row.id::text)
    returning * into agreement;
    insert into public.payment_agreement_receivables(agreement_id,receivable_item_id) values(agreement.id,item.id);
    perform public.assert_payment_agreement_sources(agreement.id);
    insert into public.payment_agreement_events(agreement_id,sequence_number,event_type,actor_user_id,previous_status,new_status,reason,schedule)
    values(agreement.id,1,'proposed',auth.uid(),null,'pending',agreement.reason,agreement.schedule);
    items := items || jsonb_build_array(item.id); agreements := agreements || jsonb_build_array(agreement.id);
  end loop;
  result_payload := preview || jsonb_build_object('status','posted','batch_id',batch.id,'receivable_ids',items,'agreement_ids',agreements);
  update public.charge_batches as charge_batch set status='posted',posted_at=now(),posted_by=auth.uid(),result=result_payload where charge_batch.id=batch.id;
  insert into public.charge_installment_plan_publications(condominium_id,idempotency_key,result,created_by) values(target,key,result_payload,auth.uid());
  return result_payload;
end $$;

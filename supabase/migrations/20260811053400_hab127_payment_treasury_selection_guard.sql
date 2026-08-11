-- HAB-127: treasury routing is part of financial review, not resident-editable payment data.
-- Preserve the existing payment immutability rules while ensuring only an authorized reviewer
-- can set/change the Treasury account and only before approval.

create or replace function public.payment_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('approved', 'reversed') then
    raise exception 'financial payment is immutable';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'payments cannot be deleted';
  end if;

  if new.treasury_account_id is distinct from old.treasury_account_id then
    if old.status not in ('submitted', 'under_review') then
      raise exception 'treasury account can only be selected during payment review';
    end if;

    if not public.can_review_payments(old.condominium_id) then
      raise exception 'payment treasury selection denied';
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

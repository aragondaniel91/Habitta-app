-- Audit trail for payment state transitions.
-- Payments were the only sensitive flow without an events table: the payments row keeps
-- reviewed_by / approved_by / rejected_by / reversed_by, but each column holds only the most
-- recent actor, so the sequence of transitions could not be reconstructed during a dispute.
-- The capture runs as a trigger rather than inside create_payment_draft, submit_payment,
-- payment_transition, approve_payment and reverse_payment so that the financial functions stay
-- untouched and every future write path is covered automatically.

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  -- now() is the transaction timestamp, so several transitions applied inside one transaction
  -- would share it and leave the trail without a defined order. The identity column gives the
  -- audit trail a total order regardless of how transactions are grouped.
  sequence_number bigint generated always as identity,
  payment_id uuid not null,
  condominium_id uuid not null,
  event_type text not null check (
    event_type in (
      'created',
      'updated',
      'submitted',
      'under_review',
      'correction_requested',
      'approved',
      'rejected',
      'reversed'
    )
  ),
  previous_status public.payment_status,
  new_status public.payment_status not null,
  actor_user_id uuid references auth.users(id),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (payment_id, condominium_id) references public.payments(id, condominium_id)
);

create index payment_events_payment_idx
  on public.payment_events (payment_id, sequence_number asc);
create index payment_events_condominium_idx
  on public.payment_events (condominium_id, sequence_number desc);

create function public.capture_payment_event()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  kind text;
  reason_value text;
begin
  if tg_op = 'INSERT' then
    kind := 'created';
  elsif old.status is distinct from new.status then
    -- update_payment_draft moves correction_requested back to draft; that is an edit, not a
    -- lifecycle state worth naming after the target status.
    kind := case when new.status = 'draft' then 'updated' else new.status::text end;
  elsif (
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
    kind := 'updated';
  else
    return null;
  end if;

  reason_value := case new.status
    when 'correction_requested' then new.correction_reason
    when 'rejected' then new.rejection_reason
    when 'reversed' then new.reversal_reason
    else null
  end;

  insert into public.payment_events (
    payment_id,
    condominium_id,
    event_type,
    previous_status,
    new_status,
    actor_user_id,
    reason,
    metadata
  ) values (
    new.id,
    new.condominium_id,
    kind,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    -- auth.uid() is null for service_role writes; fall back to whichever actor the row records.
    coalesce(
      auth.uid(),
      new.reversed_by,
      new.approved_by,
      new.rejected_by,
      new.reviewed_by,
      new.submitted_by_user_id
    ),
    reason_value,
    jsonb_build_object(
      'unit_id', new.unit_id,
      'amount', to_char(new.original_amount, 'FM999999999999990.00'),
      'currency_code', new.original_currency_code
    )
  );
  return null;
end $$;

create trigger payments_capture_event
after insert or update on public.payments
for each row execute function public.capture_payment_event();

-- An audit trail that can be edited is not an audit trail. RLS already denies writes to
-- authenticated users, but service_role bypasses RLS, so the guard has to live in a trigger.
create function public.payment_event_immutable()
returns trigger
language plpgsql
as $$ begin raise exception 'payment events are immutable'; end $$;

create trigger payment_events_immutable
before update or delete on public.payment_events
for each row execute function public.payment_event_immutable();

alter table public.payment_events enable row level security;

-- Reasons attached to corrections, rejections and reversals are internal review notes, so the
-- trail follows the same audience as the payment review queue.
create policy payment_events_read on public.payment_events
for select using (public.can_review_payments(condominium_id));

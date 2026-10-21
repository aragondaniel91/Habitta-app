-- HAB-PAYMENT-METRICS-001: caller-authorized full-history payment indicators.
-- Security invoker inherits payments SELECT RLS, including private resident drafts.
create function public.get_payment_metrics(target uuid)
returns table (
  currency_code text,
  approved_amount text,
  reversed_amount text,
  pending_review_count bigint,
  own_attention_count bigint
)
language sql
stable
security invoker
set search_path = public
set row_security = on
as $$
  select
    p.original_currency_code as currency_code,
    coalesce(sum(p.original_amount) filter (where p.status = 'approved'), 0)::text,
    coalesce(sum(p.original_amount) filter (where p.status = 'reversed'), 0)::text,
    count(*) filter (where p.status in ('submitted', 'under_review')),
    count(*) filter (
      where p.status in ('draft', 'correction_requested')
        and p.submitted_by_user_id = auth.uid()
    )
  from public.payments p
  where p.condominium_id = target
  group by p.original_currency_code
  order by p.original_currency_code
$$;

revoke all on function public.get_payment_metrics(uuid) from public, anon, authenticated;
grant execute on function public.get_payment_metrics(uuid) to authenticated, service_role;

comment on function public.get_payment_metrics(uuid) is
  'Full-history payment totals by currency using caller RLS; no payment mutations or JS float summations.';

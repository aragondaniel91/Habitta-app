-- HAB-411: let a system placement exist without an author, without letting a discount do the same.
--
-- `terms_exception_is_authorized` was written as `origin = 'catalog' or authorized_by is not null`,
-- and it is wrong in both directions.
--
-- Too strict: the HAB-410 tenant migration writes `grandfathered` rows at exactly the list price.
-- There is no human to name as their author, because no human decided anything -- the migration
-- placed each condominium on the smallest plan covering the units it already had. Production
-- refused the whole migration on the first such row, correctly by the letter of the rule and
-- wrongly by its intent.
--
-- Too loose: it accepted `origin = 'catalog'` at any amount at all, so a term claiming to be the
-- list price while charging half of it needed no author -- which is exactly the case the rule
-- exists to catch.
--
-- The property actually worth enforcing is about money, not about the label: a term that departs
-- from the list price is somebody's decision, and a decision has an author. Only the two origins
-- that mean "nobody negotiated this" may be authorless, and only while the amount matches the
-- reference exactly.

alter table public.subscription_terms
  drop constraint terms_exception_is_authorized;

alter table public.subscription_terms
  add constraint terms_exception_is_authorized check (
    (
      origin in ('catalog', 'grandfathered')
      and contracted_period_amount = catalog_reference_amount
    )
    or authorized_by is not null
  );

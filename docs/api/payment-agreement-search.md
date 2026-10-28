# Payment-agreement search

`GET /v1/condominiums/:id/payment-agreements` performs filtering, exact schedule-total comparison, sorting, pagination, and total counting in `public.list_payment_agreement_ids`. The function is `SECURITY INVOKER`; the authenticated caller's existing agreement RLS policy remains the authorization boundary.

Money query parameters (`minAmount`, `maxAmount`) are decimal strings with up to two fraction digits. PostgreSQL computes schedule sums as `numeric`, so a two-installment schedule of `0.10` and `0.20` matches an exact `0.30` filter.

Paginated callers receive `{ items, page, pageSize, total, totalPages, hasNextPage, hasPreviousPage }`. The Worker makes one RPC request for ordered IDs and then only four bounded reads for those selected agreements and their sources, events, and progress; it does not scan the tenant's agreement history.

The legacy response shape (when neither `page` nor `pageSize` is supplied) remains an array for compatibility, but is deliberately capped at the first 100 matching rows. New clients must use pagination to retrieve beyond that cap.

# HAB-133 maintenance financial workspace

This increment exposes the maintenance financial/evidence foundation through the PWA without replacing the existing maintenance operations page.

## Browser behavior

- `Operaciones` keeps the existing assets, preventive plans, work orders and service-log UI intact.
- `Finanzas y evidencias` selects a maintenance work order and exposes submitted/approved/rejected/superseded quotes.
- Quote creation uses an active vendor, amount, currency, optional reference, validity date and notes.
- Quote decisions use the dedicated decision endpoint; rejection requires a note at the API/database boundary.
- Maintenance evidence stays private in R2 and is recorded through immutable PostgreSQL metadata.
- Quote files carry `X-Quote-Id`; the API CORS allowlist explicitly permits that header.
- Existing expenses may be linked to a work order and optionally to a quote by identifiers only. The maintenance UI never sends an expense amount or Treasury account mutation.

## Security boundaries

The browser is not authoritative for maintenance permissions. Existing database/RPC rules continue to decide who can create quotes, approve/reject quotes, upload evidence, read expense links and link expenses.

This is part of #104 and does not close HAB-133 by itself; operational notification wiring remains a separate final increment.

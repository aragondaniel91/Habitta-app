# Maintenance feature

`MaintenanceFinancialWorkspace.tsx` owns the quote/evidence/expense-linking surface added by HAB-133. The legacy operations workspace remains in `pages/MaintenancePageBase.tsx`; `pages/MaintenancePage.tsx` is intentionally a small composition wrapper so future financial/evidence work does not require rewriting the large operations page.

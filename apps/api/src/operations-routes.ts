import { adminAuditRoutes } from './admin-audit-routes';
import { assembliesRoutes } from './assemblies-routes';
import { operationsRoutes as baseOperationsRoutes } from './operations-routes-base';
import { maintenanceFinancialRoutes } from './maintenance-financial-routes';

baseOperationsRoutes.route('/', maintenanceFinancialRoutes);
baseOperationsRoutes.route('/', assembliesRoutes);
baseOperationsRoutes.route('/', adminAuditRoutes);

export const operationsRoutes = baseOperationsRoutes;

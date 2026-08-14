import { assembliesRoutes } from './assemblies-routes';
import { operationsRoutes as baseOperationsRoutes } from './operations-routes-base';
import { maintenanceFinancialRoutes } from './maintenance-financial-routes';

baseOperationsRoutes.route('/', maintenanceFinancialRoutes);
baseOperationsRoutes.route('/', assembliesRoutes);

export const operationsRoutes = baseOperationsRoutes;

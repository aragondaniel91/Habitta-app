import { operationsRoutes as baseOperationsRoutes } from './operations-routes-base';
import { maintenanceFinancialRoutes } from './maintenance-financial-routes';

baseOperationsRoutes.route('/', maintenanceFinancialRoutes);

export const operationsRoutes = baseOperationsRoutes;

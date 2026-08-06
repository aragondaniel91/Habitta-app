import { operationsRoutes } from './operations-core-routes';
import { registerMaintenanceRoutes } from './maintenance-routes';

registerMaintenanceRoutes(operationsRoutes);

export { operationsRoutes };

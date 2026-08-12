import { privateDocumentRoutes as basePrivateDocumentRoutes } from './private-document-routes-base';
import { maintenanceDocumentRoutes } from './maintenance-document-routes';

basePrivateDocumentRoutes.route('/', maintenanceDocumentRoutes);

export const privateDocumentRoutes = basePrivateDocumentRoutes;

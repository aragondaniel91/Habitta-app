import { Hono } from 'hono';
import { adminAuditRoutes } from './admin-audit-routes';
import { assembliesRoutes } from './assemblies-routes';
import { budgetRoutes } from './budget-routes';
import { governanceThresholdRoutes } from './governance-threshold-routes';
import { operationsRoutes as baseOperationsRoutes } from './operations-routes-base';
import { maintenanceFinancialRoutes } from './maintenance-financial-routes';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };

baseOperationsRoutes.route('/', maintenanceFinancialRoutes);
baseOperationsRoutes.route('/', assembliesRoutes);
baseOperationsRoutes.route('/', adminAuditRoutes);
baseOperationsRoutes.route('/', budgetRoutes);

export const operationsRoutes = new Hono<AppEnvironment>();
operationsRoutes.route('/', governanceThresholdRoutes);
operationsRoutes.route('/', baseOperationsRoutes);

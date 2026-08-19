import { Hono } from 'hono';
import { adminAuditRoutes } from './admin-audit-routes';
import { assembliesRoutes } from './assemblies-routes';
import { budgetRoutes } from './budget-routes';
import { condominiumDeletionRoutes } from './condominium-deletion-routes';
import { governanceThresholdRoutes } from './governance-threshold-routes';
import { maintenanceFinancialRoutes } from './maintenance-financial-routes';
import type { NotificationBindings } from './notifications/types';
import { operationsRoutes as baseOperationsRoutes } from './operations-routes-base';
import { personAdminNoteRoutes } from './person-admin-note-routes';
import { residentInvitationRoutes } from './resident-invitations';
import { topologyRemediationRoutes } from './topology-remediation-routes';

type Variables = { token: string; userId: string };
type AppEnvironment = { Bindings: NotificationBindings; Variables: Variables };

baseOperationsRoutes.route('/', maintenanceFinancialRoutes);
baseOperationsRoutes.route('/', assembliesRoutes);
baseOperationsRoutes.route('/', adminAuditRoutes);
baseOperationsRoutes.route('/', budgetRoutes);
baseOperationsRoutes.route('/', condominiumDeletionRoutes);
baseOperationsRoutes.route('/', residentInvitationRoutes);
baseOperationsRoutes.route('/', personAdminNoteRoutes);
baseOperationsRoutes.route('/', topologyRemediationRoutes);

export const operationsRoutes = new Hono<AppEnvironment>();
operationsRoutes.route('/', governanceThresholdRoutes);
operationsRoutes.route('/', baseOperationsRoutes);

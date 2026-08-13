import { Hono } from 'hono';
import { privateDocumentRoutes as basePrivateDocumentRoutes } from './private-document-routes-base';
import { maintenanceDocumentRoutes } from './maintenance-document-routes';
import { withinRateLimit } from './http-security';
import type { NotificationBindings } from './notifications/types';

type Variables = { token: string; userId: string };
type PrivateDocumentEnvironment = { Bindings: NotificationBindings; Variables: Variables };

export const privateDocumentRoutes = new Hono<PrivateDocumentEnvironment>();

// All private document uploads share the distributed upload budget with payment proofs.
// Enforce this before a route reads/buffers up to 20 MB or writes anything to R2.
privateDocumentRoutes.use('*', async (c, next) => {
  if (
    c.req.method === 'PUT' &&
    !(await withinRateLimit(c.env.PROOF_UPLOAD_LIMIT, c.get('userId')))
  ) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  await next();
});

privateDocumentRoutes.route('/', basePrivateDocumentRoutes);
privateDocumentRoutes.route('/', maintenanceDocumentRoutes);

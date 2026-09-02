import { Hono } from 'hono';
import { z } from 'zod';
import type { NotificationBindings } from './notifications/types';

const publicCapabilitySchema = z.object({
  code: z.string().min(1),
  domain: z.string().min(1),
  name: z.string().min(1),
});

const publicPlanSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  catalog_monthly_usd: z.number().positive(),
  catalog_annual_usd: z.number().positive(),
  default_unit_limit: z.number().int().positive(),
  sort_order: z.number().int(),
  capabilities: z.array(publicCapabilitySchema),
});

const publicCatalogSchema = z.array(publicPlanSchema);

export const publicPlanCatalogRoutes = new Hono<{ Bindings: NotificationBindings }>();

publicPlanCatalogRoutes.get('/v1/plans', async (c) => {
  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/get_public_plan_catalog`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!response.ok) {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'Catalogue unavailable' }, 503);
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'Catalogue unavailable' }, 502);
  }

  const parsed = publicCatalogSchema.safeParse(value);
  if (!parsed.success) {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'Catalogue unavailable' }, 502);
  }

  c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
  return c.json({ currency: 'USD' as const, plans: parsed.data });
});

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const routeUrl = new URL('./operations-routes-base.ts', import.meta.url);
const apiUrl = new URL('./index.ts', import.meta.url);

describe('expenses and governance API routes', () => {
  it('mounts the operations router behind authenticated condominium routes', async () => {
    const source = await readFile(apiUrl, 'utf8');
    expect(source).toContain("app.use('/v1/*'");
    expect(source).toContain("app.route('/v1/condominiums', operationsRoutes)");
  });

  it('uses server-side transition RPCs and never a service-role key', async () => {
    const source = await readFile(routeUrl, 'utf8');
    expect(source).toContain("rpc(c, 'transition_expense'");
    expect(source).toContain("rpc(c, 'transition_governance_proposal'");
    expect(source).toContain("rpc(c, 'cast_governance_vote'");
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('scopes expense-category edit/archive to the RLS policy, not API code', async () => {
    const source = await readFile(routeUrl, 'utf8');
    const patchSignature = "operationsRoutes.patch('/:id/expense-categories/:categoryId'";

    // The PATCH route backs the web Catalogs/ExpenseCategoryManager edit-and-archive UI and, like
    // every other write in this router, forwards through `rest()`, which signs the request with
    // the caller's own JWT instead of a service-role key. Role scoping is therefore the
    // database's `expense_categories_manage` RLS policy, not a check the Worker could drift away
    // from or forget on a future route.
    expect(source).toContain(patchSignature);
    const patchRoute = source.slice(source.indexOf(patchSignature));
    const patchBody = patchRoute.slice(0, patchRoute.indexOf('\n\noperationsRoutes'));
    expect(patchBody).toContain('rest(');
    expect(patchBody).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(patchBody).toContain('expenseCategorySchema.partial()');

    // Contract parity: the web ExpenseCategoryManager only ever sends these three fields, and the
    // route must keep accepting exactly them so an edit/archive click cannot silently no-op.
    expect(patchBody).toContain('name: parsed.name');
    expect(patchBody).toContain('description: parsed.description');
    expect(patchBody).toContain('is_active: parsed.isActive');
  });
});

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const routeUrl = new URL('./condominium-deletion-routes.ts', import.meta.url);
const wrapperUrl = new URL('./operations-routes.ts', import.meta.url);

describe('condominium deletion API contract', () => {
  it('mounts the danger-zone route under authenticated condominium operations', async () => {
    const source = await readFile(wrapperUrl, 'utf8');
    expect(source).toContain("import { condominiumDeletionRoutes } from './condominium-deletion-routes'");
    expect(source).toContain("baseOperationsRoutes.route('/', condominiumDeletionRoutes)");
  });

  it('delegates destructive authorization to the owner-only RPC and never uses service role', async () => {
    const source = await readFile(routeUrl, 'utf8');
    expect(source).toContain("rpc(c, 'request_condominium_deletion'");
    expect(source).toContain("rpc(c, 'finish_condominium_deletion_storage_cleanup'");
    expect(source).toContain("rpc(c, 'get_condominium_deletion_storage_keys'");
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('deletes R2 objects in bounded batches and never returns storage keys to the browser', async () => {
    const source = await readFile(routeUrl, 'utf8');
    expect(source).toContain('index += 1000');
    expect(source).toContain('PAYMENT_PROOFS.delete');
    expect(source).not.toContain('storageKeys: job.storage_keys');
  });
});

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  HABITTA_PROD_PROJECT_REF,
  validateDevelopmentSupabaseProjectRef,
  validateWranglerDevelopmentConfig,
} from '../../../scripts/release/validate-development-release.mjs';

describe('development and production Supabase isolation', () => {
  it('rejects the canonical production project from development releases', () => {
    expect(validateDevelopmentSupabaseProjectRef(HABITTA_PROD_PROJECT_REF)).toContain(
      'development_cannot_use_production_supabase_project',
    );
    expect(validateDevelopmentSupabaseProjectRef('future-habitta-development-ref')).toEqual([]);
  });

  it('keeps checked-in remote development parked until it has its own database', async () => {
    const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    expect(validateWranglerDevelopmentConfig(wrangler)).toEqual([]);
  });
});

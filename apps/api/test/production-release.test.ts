import { describe, expect, it } from 'vitest';
import {
  HABITTA_PROD_PROJECT_REF,
  HABITTA_PROD_SUPABASE_URL,
  validateProductionRelease,
} from '../../../scripts/release/validate-production-release.mjs';

const valid = {
  appEnv: 'production',
  emailMode: 'live',
  projectRef: HABITTA_PROD_PROJECT_REF,
  supabaseUrl: HABITTA_PROD_SUPABASE_URL,
  viteSupabaseUrl: HABITTA_PROD_SUPABASE_URL,
  workerUrl: 'https://habitta-api-prod.aragondaniel91.workers.dev',
  pagesUrl: 'https://app.mihabitta.com',
  corsAllowedOrigins: 'https://app.mihabitta.com',
};

describe('production release validation', () => {
  it('accepts the canonical Habitta production environment', () => {
    expect(validateProductionRelease(valid)).toEqual([]);
  });

  it('fails closed when production points at any other Supabase project', () => {
    expect(
      validateProductionRelease({
        ...valid,
        projectRef: 'differentprojectref123',
        supabaseUrl: 'https://differentprojectref123.supabase.co',
        viteSupabaseUrl: 'https://differentprojectref123.supabase.co',
      }),
    ).toEqual(
      expect.arrayContaining([
        'production_project_ref_mismatch',
        'production_supabase_url_mismatch',
      ]),
    );
  });

  it('rejects mismatched browser and database project URLs', () => {
    expect(
      validateProductionRelease({
        ...valid,
        viteSupabaseUrl: 'https://other.supabase.co',
      }),
    ).toContain('vite_supabase_url_mismatch');
    expect(
      validateProductionRelease({
        ...valid,
        supabaseUrl: 'https://wrong.supabase.co',
        viteSupabaseUrl: 'https://wrong.supabase.co',
      }),
    ).toContain('supabase_url_project_ref_mismatch');
  });

  it('requires canonical production Worker, Pages and CORS configuration', () => {
    expect(
      validateProductionRelease({
        ...valid,
        workerUrl: 'https://habitta-api-dev.example',
        pagesUrl: 'https://preview.mihabitta.com',
        corsAllowedOrigins: 'https://preview.mihabitta.com',
      }),
    ).toEqual(
      expect.arrayContaining(['invalid_production_worker_url', 'invalid_production_pages_url']),
    );
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const preRelease = readFileSync(
  new URL('../../../scripts/release/pre-migration-production-backup.sh', import.meta.url),
  'utf8',
);
const scheduled = readFileSync(
  new URL('../../../.github/workflows/database-backup.yml', import.meta.url),
  'utf8',
);

describe('production pre-migration backup restore contract (HAB-417)', () => {
  it('derives the owned-schema allowlist just like the scheduled backup', () => {
    for (const source of [preRelease, scheduled]) {
      expect(source).toContain('OWNED_SCHEMAS="public"');
      expect(source).toContain('OWNED_SCHEMAS="$OWNED_SCHEMAS,$schema"');
      expect(source).toContain('--schema "$OWNED_SCHEMAS"');
      expect(source).toMatch(/grep -oE ['"]\^CREATE SCHEMA/);
    }
  });

  it('exports Auth only into a dedicated separate file', () => {
    expect(preRelease).toMatch(/supabase db dump --linked --schema auth --data-only --use-copy/);
    expect(preRelease).toContain("-x 'auth.schema_migrations'");
    expect(preRelease).toContain('--schema "$OWNED_SCHEMAS"');
    expect(preRelease).not.toContain("-x 'storage.buckets_vectors'");
    expect(preRelease).not.toContain("-x 'storage.vector_indexes'");
  });

  it('fails closed before encryption/upload if managed schemas appear in application data', () => {
    const guard = preRelease.indexOf(
      'for managed in auth storage supabase_functions vault graphql realtime',
    );
    const encryption = preRelease.indexOf('openssl enc -aes-256-cbc');
    const upload = preRelease.indexOf('wrangler r2 object put');
    expect(guard).toBeGreaterThan(0);
    expect(encryption).toBeGreaterThan(guard);
    expect(upload).toBeGreaterThan(encryption);
    expect(preRelease.slice(guard, encryption)).toContain('exit 1');
    expect(preRelease.slice(guard, encryption)).toContain('.backup-pre-release/plain/data.sql');
  });
});

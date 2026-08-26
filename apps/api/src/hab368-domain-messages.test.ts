import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiDir = fileURLToPath(new URL('.', import.meta.url));
const migrationsDir = fileURLToPath(new URL('../../../supabase/migrations', import.meta.url));
const testsDir = fileURLToPath(new URL('../../../supabase/tests', import.meta.url));

const readAll = (dir: string) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n');

const migrations = readAll(migrationsDir);
const pgTapTests = readAll(testsDir);

const ROUTE_FILES = [
  'tenancy-routes.ts',
  'treasury-routes.ts',
  'community-document-routes.ts',
  'ownership-finance-routes.ts',
  'recurring-dues-routes.ts',
  'structure-routes.ts',
  'people-relationships-routes.ts',
];

const raisedInSql = new Set(
  [...migrations.matchAll(/raise exception '([^']+)'/g)].map((m) => m[1]),
);

const mapKeys = (file: string) =>
  [
    ...readFileSync(join(apiDir, file), 'utf8').matchAll(/^\s*'([a-z][a-z0-9 _-]{3,})':\s*\{/gm),
  ].map((m) => m[1] as string);

/*
 * Three guards are unreachable at runtime and are therefore not required to carry a pgTAP case.
 * Each is shadowed by a check that fires first:
 *   - 'condominium unavailable' / 'organization unavailable': the permission check rejects an id
 *     that does not exist, because permission is derived from a membership row that cannot exist.
 *   - 'ownership transfer already reverted': once a compensating transfer exists it becomes the
 *     newest, so 'only the latest ownership transfer can be reverted' fires first.
 * They are defensive guards against a concurrent delete, not dead code, but they cannot be driven
 * from a test without simulating that race.
 */
const UNREACHABLE = new Set([
  'condominium unavailable',
  'organization unavailable',
  'ownership transfer already reverted',
]);

describe('HAB-368 domain messages the API promises to translate', () => {
  it('backs every mapped message with a real exception in the schema', () => {
    // If SQL renames an exception, the map stops matching and the administrator silently gets the
    // generic fallback instead of the message written for that situation.
    const orphaned: string[] = [];
    for (const file of ROUTE_FILES) {
      for (const key of mapKeys(file)) {
        if (!raisedInSql.has(key)) orphaned.push(`${file} :: ${key}`);
      }
    }
    expect(orphaned).toEqual([]);
  });

  it('proves each reachable message at runtime with pgTAP', () => {
    const unproven: string[] = [];
    for (const file of ROUTE_FILES) {
      for (const key of mapKeys(file)) {
        if (UNREACHABLE.has(key)) continue;
        if (!pgTapTests.includes(key)) unproven.push(`${file} :: ${key}`);
      }
    }
    expect(unproven).toEqual([]);
  });

  it('keeps the unreachable list honest', () => {
    // Every entry here must still be a real guard in the schema. If one disappears, the exemption
    // has to go with it rather than quietly excusing a message nobody maps any more.
    for (const message of UNREACHABLE) {
      expect(raisedInSql.has(message)).toBe(true);
    }
    expect(UNREACHABLE.size).toBeLessThanOrEqual(3);
  });
});

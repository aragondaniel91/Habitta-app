import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LIFECYCLE_CONTRACT, lifecycleGaps } from './lifecycle-contract';

const sourceDirectory = fileURLToPath(new URL('.', import.meta.url));
const sources = readdirSync(sourceDirectory)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => readFileSync(`${sourceDirectory}${name}`, 'utf8'))
  .join('\n');

type Route = { verb: string; path: string };

const routes: Route[] = [...sources.matchAll(/\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)].map(
  (match) => ({ verb: match[1]!, path: match[2]! }),
);

const routeExists = (path: string, verbs: string[]) =>
  routes.some((route) => route.path === path && verbs.includes(route.verb));

/**
 * Suffixes that express an action on an existing entity rather than the creation of a new one.
 * A POST ending in one of these is a lifecycle transition, an idempotent upsert or a read-only
 * computation, so it does not need its own row in the contract.
 */
const ACTION_SUFFIXES = [
  'accept',
  'account',
  'acknowledge',
  'action-items',
  'activate',
  'agenda',
  'allocation-preview',
  'apply',
  'approve',
  'archive',
  'attendance',
  'cancel',
  'clear',
  'close',
  'commit',
  'comments',
  'community-document-link',
  'condominium-relationships',
  'create-with-context',
  'deactivate',
  'decision',
  'download',
  'expenses',
  'export',
  'generate-due',
  'import',
  'links',
  'match',
  'minutes',
  'occupancies',
  'override-decision',
  'owners',
  'ownerships',
  'post',
  'prepare',
  'preview',
  'proof',
  'publish',
  'read',
  'read-all',
  'reject',
  'reopen',
  'request-correction',
  'resend',
  'resolutions',
  'restore',
  'retry',
  'retry-storage-cleanup',
  'reverse',
  'revisions',
  'revoke',
  'rollback',
  'runs',
  'schedule',
  'service-logs',
  'start-review',
  'submit',
  'topology-remediation',
  'transition',
  'unschedule',
  'upload',
  'versions',
  'vote',
  'votes',
];

const isActionRoute = (path: string) => {
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  return (
    ACTION_SUFFIXES.includes(last) || path.includes('/danger-zone') || path.startsWith('/telemetry')
  );
};

const declaredCreates = new Set(LIFECYCLE_CONTRACT.map((entry) => entry.create));

describe('HAB-356 lifecycle completeness contract', () => {
  it('covers every administrative module that owns creatable entities', () => {
    const modules = new Set(LIFECYCLE_CONTRACT.map((entry) => entry.module));
    for (const expected of [
      'units',
      'people',
      'fees',
      'payments',
      'treasury',
      'expenses',
      'budgets',
      'documents',
      'governance',
      'requests',
      'announcements',
      'maintenance',
      'settings',
      'team',
    ]) {
      expect(modules, `${expected} is missing from the lifecycle contract`).toContain(expected);
    }
  });

  it('declares a real route for every create it claims', () => {
    for (const entry of LIFECYCLE_CONTRACT) {
      expect(
        routeExists(entry.create, ['post', 'put']),
        `${entry.module}/${entry.entity}: create route ${entry.create} is not registered`,
      ).toBe(true);
    }
  });

  it('declares a real route for every correction it claims', () => {
    for (const entry of LIFECYCLE_CONTRACT) {
      if (!entry.correction) continue;
      expect(
        routeExists(entry.correction, ['patch', 'put', 'post']),
        `${entry.module}/${entry.entity}: correction route ${entry.correction} is not registered`,
      ).toBe(true);
    }
  });

  it('never leaves an administrator without a correction path silently', () => {
    for (const entry of lifecycleGaps()) {
      expect(
        entry.knownGap,
        `${entry.module}/${entry.entity} has no correction path and no issue tracking it`,
      ).toMatch(/^#\d+$/);
    }
  });

  it('classifies immutable history with an additive correction, never an edit', () => {
    for (const entry of LIFECYCLE_CONTRACT) {
      if (entry.classification !== 'history' || !entry.correction) continue;
      expect(
        routeExists(entry.correction, ['post']),
        `${entry.module}/${entry.entity}: history must be corrected by an action, not a PATCH`,
      ).toBe(true);
    }
  });

  it('forces every new entity-creating route to be classified', () => {
    const undeclared = routes
      .filter((route) => route.verb === 'post')
      .map((route) => route.path)
      .filter((path) => !isActionRoute(path))
      .filter((path) => !declaredCreates.has(path));

    expect(
      [...new Set(undeclared)].sort(),
      'add these creates to LIFECYCLE_CONTRACT with their correction path (see #351)',
    ).toEqual([]);
  });
});

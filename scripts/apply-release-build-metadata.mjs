import { readFileSync, writeFileSync } from 'node:fs';

const replaceOnce = (source, search, replacement, label) => {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(search, replacement);
};

const update = (path, transform) => {
  const source = readFileSync(path, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`${path}: no changes applied`);
  writeFileSync(path, next);
};

writeFileSync(
  'apps/api/src/build-metadata.ts',
  `import type { NotificationBindings } from './notifications/types';

declare const HABITTA_BUILD_COMMIT: string;
declare const HABITTA_BUILD_TIMESTAMP: string;
declare const HABITTA_APP_VERSION: string;

const compiled = (read: () => string, fallback?: string) => {
  try {
    const value = read();
    return value || fallback || 'unknown';
  } catch {
    return fallback || 'unknown';
  }
};

export const getWorkerBuildMetadata = (env?: Partial<NotificationBindings>) => ({
  commit: compiled(() => HABITTA_BUILD_COMMIT, env?.BUILD_COMMIT),
  version: compiled(() => HABITTA_APP_VERSION, env?.APP_VERSION),
  buildTimestamp: compiled(() => HABITTA_BUILD_TIMESTAMP, env?.BUILD_TIMESTAMP),
  workerVersionId: env?.CF_VERSION_METADATA?.id ?? 'unknown',
  workerVersionTag: env?.CF_VERSION_METADATA?.tag ?? 'unknown',
});
`,
);

update('apps/api/src/index.ts', (source) => {
  let next = replaceOnce(
    source,
    "import { privateDocumentRoutes } from './private-document-routes';\n",
    "import { privateDocumentRoutes } from './private-document-routes';\nimport { getWorkerBuildMetadata } from './build-metadata';\n",
    'build metadata import',
  );
  next = replaceOnce(
    next,
    "app.get('/health', (c) =>\n  c.json({\n    status: 'ok' as const,\n    environment: c.env?.APP_ENV ?? 'development',\n    commit: c.env?.BUILD_COMMIT ?? 'unknown',\n    version: c.env?.APP_VERSION ?? 'unknown',\n    buildTimestamp: c.env?.BUILD_TIMESTAMP ?? 'unknown',\n    notificationsEmailMode: c.env?.NOTIFICATIONS_EMAIL_MODE ?? 'disabled',\n  }),\n);\n",
    "app.get('/health', (c) => {\n  const metadata = getWorkerBuildMetadata(c.env);\n  c.header('Cache-Control', 'no-store, max-age=0');\n  c.header('X-Habitta-Commit', metadata.commit);\n  c.header('X-Habitta-Worker-Version', metadata.workerVersionId);\n  return c.json({\n    status: 'ok' as const,\n    environment: c.env?.APP_ENV ?? 'development',\n    ...metadata,\n    notificationsEmailMode: c.env?.NOTIFICATIONS_EMAIL_MODE ?? 'disabled',\n  });\n});\n",
    'health metadata response',
  );
  return next;
});

update('apps/api/src/notifications/types.ts', (source) =>
  replaceOnce(
    source,
    "  APP_VERSION?: string;\n",
    "  APP_VERSION?: string;\n  CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };\n",
    'version metadata binding type',
  ),
);

update('apps/api/wrangler.jsonc', (source) =>
  replaceOnce(
    source,
    '  "compatibility_date": "2026-07-26",\n',
    '  "compatibility_date": "2026-07-26",\n  "version_metadata": { "binding": "CF_VERSION_METADATA" },\n',
    'version metadata binding config',
  ),
);

update('scripts/release/development-smoke.mjs', (source) =>
  replaceOnce(
    source,
    "  const headers = { Origin: expectedWebOrigin };\n  const health = await request(`${apiUrl}/health`, { headers });\n",
    "  const headers = { Origin: expectedWebOrigin, 'Cache-Control': 'no-cache' };\n  const health = await request(`${apiUrl}/health`, { headers });\n",
    'non-cached health smoke',
  ),
);

update('apps/api/test/health.test.ts', (source) =>
  replaceOnce(
    source,
    "      buildTimestamp: 'unknown',\n      notificationsEmailMode: 'disabled',\n",
    "      buildTimestamp: 'unknown',\n      workerVersionId: 'unknown',\n      workerVersionTag: 'unknown',\n      notificationsEmailMode: 'disabled',\n",
    'health version metadata expectation',
  ),
);

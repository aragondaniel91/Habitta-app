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

update('.github/workflows/development-release-apply.yml', (source) => {
  let next = replaceOnce(
    source,
    '            --var "BUILD_COMMIT:$SHA"\n            --var "BUILD_TIMESTAMP:$BUILD_TIMESTAMP"\n            --var "APP_VERSION:$APP_VERSION"\n',
    '            --define "HABITTA_BUILD_COMMIT:\u0027$SHA\u0027"\n            --define "HABITTA_BUILD_TIMESTAMP:\u0027$BUILD_TIMESTAMP\u0027"\n            --define "HABITTA_APP_VERSION:\u0027$APP_VERSION\u0027"\n',
    'compile-time release metadata',
  );
  return next;
});

update('scripts/release/development-smoke.mjs', (source) =>
  replaceOnce(
    source,
    "  const headers = { Origin: expectedWebOrigin };\n  const health = await request(`${apiUrl}/health`, { headers });\n",
    "  const headers = { Origin: expectedWebOrigin };\n  const health = await request(`${apiUrl}/health?smoke=${Date.now()}`, {\n    headers: { ...headers, 'Cache-Control': 'no-cache' },\n  });\n",
    'cache-busted health smoke',
  ),
);

import { describe, expect, it } from 'vitest';
import { getWorkerBuildMetadata } from './build-metadata';
import type { NotificationBindings } from './notifications/types';

describe('Worker build metadata', () => {
  it('falls back to runtime bindings outside the release bundle', () => {
    const metadata = getWorkerBuildMetadata({
      APP_ENV: 'development',
      BUILD_COMMIT: 'test-commit',
      BUILD_TIMESTAMP: '2026-08-05T10:00:00Z',
      APP_VERSION: '0.1.0',
      CF_VERSION_METADATA: {
        id: 'version-id',
        tag: 'release-test',
        timestamp: '2026-08-05T10:00:00Z',
      },
    } as NotificationBindings);

    expect(metadata).toEqual({
      commit: 'test-commit',
      version: '0.1.0',
      buildTimestamp: '2026-08-05T10:00:00Z',
      workerVersionId: 'version-id',
      workerVersionTag: 'release-test',
    });
  });
});

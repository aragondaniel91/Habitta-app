import type { NotificationBindings } from './notifications/types';

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

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { MODULE_HELP, MODULE_HELP_CONTENT_VERSION } from './features/help/module-help';

const manualUrls = {
  readme: new URL('../../../docs/manual/README.md', import.meta.url),
  administrator: new URL('../../../docs/manual/admin-quick-start.md', import.meta.url),
  resident: new URL('../../../docs/manual/resident-quick-start.md', import.meta.url),
  status: new URL('../../../docs/manual/feature-status.md', import.meta.url),
};

describe('manual help authority', () => {
  it('links every manual to the canonical MODULE_HELP source and content version', async () => {
    const manuals = await Promise.all(
      Object.values(manualUrls).map((manualUrl) => readFile(manualUrl, 'utf8')),
    );

    for (const manual of manuals) {
      expect(manual).toContain('MODULE_HELP');
      expect(manual).toContain('module-help.<route>');
      expect(manual).toContain('MODULE_HELP_CONTENT_VERSION');
      expect(manual).toContain('apps/web/src/features/help/module-help.ts');
    }

    expect(MODULE_HELP.dashboard.contentVersion).toBe(MODULE_HELP_CONTENT_VERSION);
    expect(MODULE_HELP.payments.contentVersion).toBe(MODULE_HELP_CONTENT_VERSION);
  });

  it('keeps representative Administrator and Resident references tied to real topics', async () => {
    const [administrator, resident] = await Promise.all([
      readFile(manualUrls.administrator, 'utf8'),
      readFile(manualUrls.resident, 'utf8'),
    ]);

    for (const topicId of [
      MODULE_HELP.dashboard.topicId,
      MODULE_HELP.units.topicId,
      MODULE_HELP.payments.topicId,
      MODULE_HELP.team.topicId,
    ])
      expect(administrator).toContain(topicId);

    for (const topicId of [
      MODULE_HELP.dashboard.topicId,
      MODULE_HELP.fees.topicId,
      MODULE_HELP.payments.topicId,
      MODULE_HELP.requests.topicId,
    ])
      expect(resident).toContain(topicId);
  });
});

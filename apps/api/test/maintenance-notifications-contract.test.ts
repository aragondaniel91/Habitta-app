import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260812020100_hab133_maintenance_notifications.sql',
  import.meta.url,
);
const templateUrl = new URL('../src/notifications/templates.ts', import.meta.url);

describe('HAB-133 maintenance operational notifications', () => {
  it('captures all financial and evidence events once', async () => {
    const source = await readFile(migrationUrl, 'utf8');
    expect(source).toContain('maintenance_quote_submitted');
    expect(source).toContain('maintenance_quote_approved');
    expect(source).toContain('maintenance_quote_rejected');
    expect(source).toContain('maintenance_evidence_added');
    expect(source).toContain('maintenance_expense_linked');
    expect(source).toContain('on conflict(deduplication_key) do nothing');
  });

  it('creates in-app notifications and email deliveries behind HAB-130', async () => {
    const source = await readFile(migrationUrl, 'utf8');
    expect(source).toContain('insert into public.notifications');
    expect(source).toContain('insert into public.notification_deliveries');
    expect(source).toContain("'pending'");
    expect(source).toContain("HAB-130's before-insert guard converts this to skipped");
    expect(source).not.toContain('live_email_enabled = true');
  });

  it('provides renderer templates for every maintenance delivery', async () => {
    const source = await readFile(templateUrl, 'utf8');
    for (const key of [
      'maintenance_quote_submitted',
      'maintenance_quote_approved',
      'maintenance_quote_rejected',
      'maintenance_evidence_added',
      'maintenance_expense_linked',
    ]) {
      expect(source).toContain(`${key}:`);
    }
  });
});

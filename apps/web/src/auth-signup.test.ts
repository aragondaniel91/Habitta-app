import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const passwordAuthExperienceUrl = new URL(
  './components/PasswordAuthExperience.tsx',
  import.meta.url,
);

describe('administrator password signup', () => {
  it('creates an account with password and redirects confirmation to Habitta', async () => {
    const source = await readFile(passwordAuthExperienceUrl, 'utf8');

    expect(source).toContain('supabase.auth.signUp');
    expect(source).toContain('emailRedirectTo: window.location.origin');
    expect(source).toContain("registration_source: 'public_admin_onboarding'");
    expect(source).not.toContain('signInWithOtp');
    expect(source).not.toContain('shouldCreateUser');
  });
});

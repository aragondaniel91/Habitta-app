import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const appEntryUrl = new URL('./main.tsx', import.meta.url);

describe('email OTP signup', () => {
  it('allows Supabase to create a new user and redirects to the current app origin', async () => {
    const source = await readFile(appEntryUrl, 'utf8');

    expect(source).toContain('emailRedirectTo: location.origin');
    expect(source).toContain('shouldCreateUser: true');
    expect(source).not.toContain('shouldCreateUser: false');
  });
});

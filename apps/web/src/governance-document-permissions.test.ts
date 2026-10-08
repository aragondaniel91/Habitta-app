import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./pages/GovernancePage.tsx', import.meta.url), 'utf8');

describe('governance document permissions', () => {
  it('only renders the private-document handoff for governance managers', () => {
    const uploader = source.indexOf('<PrivateDocumentUploader');
    expect(uploader).toBeGreaterThan(-1);
    expect(source.lastIndexOf('{manage ? (', uploader)).toBeGreaterThan(-1);
  });
});

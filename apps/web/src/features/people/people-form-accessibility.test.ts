import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Personas form accessibility', () => {
  it('marks the unit selector required at the actual control through the shared Field', async () => {
    const source = await read('./PersonUnitRelationshipDrawerV3.tsx');

    expect(source).toContain('<Field label="Unidad" required>');
    expect(source).toContain('<Select');
  });

  it('delegates percentage validation semantics to Field and returns focus to its control', async () => {
    const [panel, relationship] = await Promise.all([
      read('./PeoplePanelV3.tsx'),
      read('./PersonUnitRelationshipDrawerV3.tsx'),
    ]);

    expect(panel).toContain('const adminNoteInputRef = useRef<HTMLTextAreaElement>(null);');
    expect(panel).toContain('adminNoteInputRef.current?.focus();');
    expect(panel).toContain('error={adminNoteError}');
    expect(relationship).toContain('const percentageInputRef = useRef<HTMLInputElement>(null);');
    expect(relationship).toContain('percentageInputRef.current?.focus();');
    expect(relationship).toContain('error={percentageError}');
    expect(relationship).not.toContain('relationship-percentage-error');
    expect(relationship).not.toContain('aria-invalid={Boolean(percentageError)}');
    expect(relationship).not.toContain('aria-describedby={');
  });
});

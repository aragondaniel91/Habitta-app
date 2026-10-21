import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../../scripts/release/prepare-auth-restore.mjs', import.meta.url),
);

const copy = (table: string, rows: string[] = []) =>
  [`COPY auth.${table} (id) FROM stdin;`, ...rows, '\\.', ''].join('\n');

function run(source: string, targets: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'habitta-auth-compat-'));
  const input = join(dir, 'input.sql');
  const tables = join(dir, 'tables.txt');
  const output = join(dir, 'output.sql');
  try {
    writeFileSync(input, source);
    writeFileSync(tables, targets.join('\n') + '\n');
    try {
      const stdout = execFileSync(process.execPath, [script, input, tables, output], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { stdout, content: readFileSync(output, 'utf8'), error: '' };
    } catch (err) {
      const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? String(err);
      return { stdout: '', content: '', error: stderr };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('restore drill Auth managed-schema compatibility', () => {
  it('preserves all data and source SQL for tables existing in target', () => {
    const source = 'SET statement_timeout = 0;\n' + copy('users', ['user-one']) + copy('sessions');
    const result = run(source, ['users', 'sessions']);
    expect(result.error).toBe('');
    expect(result.content).toBe(source);
    expect(result.stdout).toContain('0 missing empty managed table(s)');
  });

  it('omits only empty blocks for managed Auth tables absent in the local target', () => {
    const source =
      'SET statement_timeout = 0;\n' +
      copy('users', ['user-one']) +
      copy('mfa_recovery_code_sets') +
      copy('webauthn_credentials') +
      copy('sessions', ['session-one']);
    const result = run(source, ['users', 'sessions']);
    expect(result.error).toBe('');
    expect(result.content).toContain('user-one');
    expect(result.content).toContain('session-one');
    expect(result.content).not.toContain('mfa_recovery_code_sets');
    expect(result.content).not.toContain('webauthn_credentials');
    expect(result.stdout).toContain('2 missing empty managed table(s)');
  });

  it('fails closed when a missing managed Auth table contains any data', () => {
    const result = run(copy('users', ['u1']) + copy('mfa_recovery_code_sets', ['sensitive-row']), [
      'users',
    ]);
    expect(result.error).toContain('Cannot omit nonempty Auth COPY');
    expect(result.error).toContain('source has 1 rows');
  });

  it('fails closed when the target lacks auth.users', () => {
    const result = run(copy('users', ['u1']), ['sessions']);
    expect(result.error).toContain('missing auth.users');
  });

  it('rejects unexpected COPY syntax rather than silently dropping data', () => {
    const result = run('COPY auth.webauthn_credentials FROM stdin;\n\\.\n', ['users']);
    expect(result.error).toContain('Unexpected Auth COPY format');
  });

  it('fails on an unterminated missing-table COPY block', () => {
    const result = run('COPY auth.webauthn_credentials (id) FROM stdin;\n', ['users']);
    expect(result.error).toContain('Unterminated COPY');
  });
});

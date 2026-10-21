#!/usr/bin/env node
/**
 * Adapt an encrypted-backup's decrypted Auth data to a *disposable* Supabase
 * restore target running an older managed Auth schema.
 *
 * Only empty COPY blocks for Auth tables missing from the target may be omitted.
 * A missing table with even one source row is a hard failure: we never quietly
 * discard users, credentials, MFA records, or other recoverable Auth data.
 *
 * The original auth-data.sql remains untouched and checksum verified. The
 * derived file is short-lived, inside the restore drill's cleanup directory.
 */
import { readFileSync, writeFileSync } from 'node:fs';

export function prepareAuthRestore(sourceText, targetTables) {
  if (!targetTables.has('users')) throw new Error('Restore target is missing auth.users');
  const lines = sourceText.split('\n');
  const output = [];
  const omitted = [];
  let missingTable = null;
  let missingCount = 0;

  for (const line of lines) {
    if (missingTable !== null) {
      if (line === '\\.') {
        if (missingCount !== 0) {
          throw new Error(
            `Cannot omit nonempty Auth COPY for missing table auth.${missingTable}; ` +
              `source has ${missingCount} rows`,
          );
        }
        omitted.push(missingTable);
        missingTable = null;
        missingCount = 0;
        continue;
      }
      if (line.length > 0) missingCount += 1;
      continue;
    }

    if (/^COPY\s+(?:"auth"|auth)\./.test(line)) {
      const match =
        /^COPY\s+(?:"auth"|auth)\.(?:"([^"]+)"|([a-z_][a-z_0-9]*))\s+\(.+\)\s+FROM stdin;$/.exec(
          line,
        );
      if (!match) throw new Error('Unexpected Auth COPY format: refusing unsafe rewrite');
      const table = match[1] ?? match[2];
      if (!targetTables.has(table)) {
        missingTable = table;
        continue;
      }
    }
    output.push(line);
  }

  if (missingTable !== null) {
    throw new Error(`Unterminated COPY for missing Auth table: ${missingTable}`);
  }
  return { content: output.join('\n'), omitted };
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href
) {
  try {
    const [sourceFile, targetTablesFile, outputFile] = process.argv.slice(2);
    if (!sourceFile || !targetTablesFile || !outputFile) {
      throw new Error(
        'Usage: prepare-auth-restore.mjs SOURCE_SQL AUTH_TABLE_NAMES_FILE OUTPUT_SQL',
      );
    }
    const tables = new Set(
      readFileSync(targetTablesFile, 'utf8')
        .split(/\r?\n/)
        .filter((name) => /^[a-z_][a-z_0-9]*$/.test(name)),
    );
    const { content, omitted } = prepareAuthRestore(readFileSync(sourceFile, 'utf8'), tables);
    writeFileSync(outputFile, content, { encoding: 'utf8', mode: 0o600 });
    console.log(
      `Auth restore compatibility: ${omitted.length} missing empty managed table(s) omitted: ${omitted.join(', ') || 'none'}`,
    );
  } catch (error) {
    console.error(`Auth restore compatibility failed: ${error.message}`);
    process.exitCode = 1;
  }
}

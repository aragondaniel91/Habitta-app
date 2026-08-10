/** Quotes a field only when it would otherwise break the row. */
export const escapeCsv = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const toCsv = (header: readonly string[], rows: readonly (string | number)[][]) =>
  [header.map(escapeCsv).join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Filenames come from condominium names, which carry accents, spaces and punctuation. */
export const csvFileName = (...parts: (string | number)[]) =>
  `${['habitta', ...parts]
    .map((part) =>
      String(part)
        .normalize('NFD')
        .replaceAll(COMBINING_MARKS, '')
        .toLocaleLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '-')
        .replaceAll(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('-')}.csv`;

/**
 * Excel reads a CSV as the system codepage unless the file opens with a byte order mark, which
 * turns every accented character in a Venezuelan condominium's data into mojibake.
 */
const BYTE_ORDER_MARK = '﻿';

export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob([`${BYTE_ORDER_MARK}${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

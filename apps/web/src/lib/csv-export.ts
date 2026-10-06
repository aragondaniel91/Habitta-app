// Spreadsheet apps treat a cell starting with =, +, - or @ as a formula, so a user-controlled
// value (a unit code, a charge description) exported verbatim can execute code or link out when
// a board member opens the CSV in Excel/Sheets. A leading apostrophe forces text interpretation
// without altering what is displayed. Genuinely numeric strings (e.g. "-125.00" from a negative
// balance) are exempt so amount columns are never corrupted.
const FORMULA_TRIGGER = /^[=+\-@]/;
const NUMERIC_FIELD = /^[+-]?\d+(\.\d+)?$/;

/** Quotes a field only when it would otherwise break the row. */
export const escapeCsv = (value: string | number) => {
  const text = String(value);
  const needsFormulaGuard =
    typeof value === 'string' && FORMULA_TRIGGER.test(text) && !NUMERIC_FIELD.test(text);
  const safeText = needsFormulaGuard ? `'${text}` : text;
  return /[",\n]/.test(safeText) ? `"${safeText.replaceAll('"', '""')}"` : safeText;
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

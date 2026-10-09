// Minimal XLSX writer for Workers. It deliberately uses ZIP "store" entries (no compression),
// which keeps the implementation dependency-free and compatible with workerd. Callers must
// enforce a byte cap before returning the result.

const encoder = new TextEncoder();

type Cell = { type: 'date' | 'number' | 'text'; value: number | string };
export type XlsxSheet = { name: string; rows: Cell[][]; tableName?: string };

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Excel treats values beginning with these characters as a formula, even in a text-like column.
const safeText = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
const columnName = (index: number) => {
  let value = '';
  for (let current = index; current >= 0; current = Math.floor(current / 26) - 1)
    value = String.fromCharCode(65 + (current % 26)) + value;
  return value;
};
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const u16 = (value: number) => Uint8Array.of(value & 255, (value >>> 8) & 255);
const u32 = (value: number) => Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
const join = (chunks: Uint8Array[]) => {
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};

const zip = (files: Array<{ name: string; contents: string }>) => {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), contents = encoder.encode(file.contents), crc = crc32(contents);
    const header = join([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(contents.length), u32(contents.length), u16(name.length), u16(0), name]);
    local.push(header, contents);
    central.push(join([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(contents.length), u32(contents.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += header.length + contents.length;
  }
  const directory = join(central);
  return join([...local, directory, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(directory.length), u32(offset), u16(0)]);
};

const cellXml = (cell: Cell, reference: string) => {
  if (cell.type === 'number') return `<c r="${reference}"><v>${cell.value}</v></c>`;
  if (cell.type === 'date') return `<c r="${reference}" s="1"><v>${Math.floor(Date.parse(`${cell.value}T00:00:00Z`) / 86400000) + 25569}</v></c>`;
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(safeText(String(cell.value)))}</t></is></c>`;
};

const worksheetXml = (sheet: XlsxSheet, tableId?: number) => {
  const rows = sheet.rows.map((cells, rowIndex) => `<row r="${rowIndex + 1}">${cells.map((cell, columnIndex) => cellXml(cell, `${columnName(columnIndex)}${rowIndex + 1}`)).join('')}</row>`).join('');
  const dimension = `A1:${columnName(Math.max(0, (sheet.rows[0]?.length ?? 1) - 1))}${Math.max(1, sheet.rows.length)}`;
  const tableParts = tableId ? `<tableParts count="1"><tablePart r:id="rId1"/></tableParts>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rows}</sheetData>${tableParts}</worksheet>`;
};

export const buildXlsx = (sheets: XlsxSheet[]) => {
  const tableSheets = sheets.filter((sheet) => sheet.tableName && sheet.rows.length > 1);
  const files: Array<{ name: string; contents: string }> = [
    { name: '[Content_Types].xml', contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${tableSheets.map((_, index) => `<Override PartName="/xl/tables/table${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/styles.xml', contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf numFmtId="164" applyNumberFormat="1" xfId="0"/></cellXfs></styleSheet>` },
    { name: 'xl/workbook.xml', contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="0"/><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
  ];
  let tableIndex = 0;
  sheets.forEach((sheet, sheetIndex) => {
    const hasTable = Boolean(sheet.tableName && sheet.rows.length > 1);
    const currentTable = hasTable ? ++tableIndex : undefined;
    files.push({ name: `xl/worksheets/sheet${sheetIndex + 1}.xml`, contents: worksheetXml(sheet, currentTable) });
    if (currentTable) {
      const ref = `A1:${columnName(sheet.rows[0]!.length - 1)}${sheet.rows.length}`;
      files.push({ name: `xl/worksheets/_rels/sheet${sheetIndex + 1}.xml.rels`, contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${currentTable}.xml"/></Relationships>` });
      files.push({ name: `xl/tables/table${currentTable}.xml`, contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${currentTable}" name="${sheet.tableName}" displayName="${sheet.tableName}" ref="${ref}" totalsRowShown="0"><autoFilter ref="${ref}"/><tableColumns count="${sheet.rows[0]!.length}">${sheet.rows[0]!.map((cell, column) => `<tableColumn id="${column + 1}" name="${escapeXml(String(cell.value))}"/>`).join('')}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>` });
    }
  });
  return zip(files);
};

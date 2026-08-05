import type { ImportKind } from '../help/module-help';

export type ImportDefinition = {
  title: string;
  description: string;
  headers: string[];
  sample: Record<string, string>;
  instructions: string[];
};

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export type ValidatedImportRow = {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
};

export const IMPORT_DEFINITIONS: Record<ImportKind, ImportDefinition> = {
  units: {
    title: 'Estructura y unidades',
    description: 'Crea torres o edificios faltantes y registra sus unidades.',
    headers: [
      'building_name',
      'unit_code',
      'unit_type',
      'floor',
      'ownership_percentage',
      'status',
    ],
    sample: {
      building_name: 'Torre A',
      unit_code: 'A-101',
      unit_type: 'apartment',
      floor: '1',
      ownership_percentage: '2.50',
      status: 'active',
    },
    instructions: [
      'Código de unidad (unit_code): debe ser único, por ejemplo A-101.',
      'Tipo (unit_type): usa apartment, house, commercial, parking o storage.',
      'Estado (status): usa active para activa o inactive para inactiva.',
      'Torre, piso y alícuota (building_name, floor y ownership_percentage) son opcionales.',
    ],
  },
  people: {
    title: 'Personas y relaciones',
    description: 'Registra personas y las relaciona con unidades existentes.',
    headers: [
      'unit_code',
      'first_name',
      'last_name',
      'email',
      'phone',
      'relationship',
      'ownership_percentage',
    ],
    sample: {
      unit_code: 'A-101',
      first_name: 'María',
      last_name: 'Pérez',
      email: 'maria@example.com',
      phone: '+58 412 0000000',
      relationship: 'owner_occupant',
      ownership_percentage: '100',
    },
    instructions: [
      'La unidad indicada en unit_code debe existir antes de importar personas.',
      'Relación (relationship): owner, owner_occupant, tenant, family_member o authorized_occupant.',
      'Alícuota de propiedad (ownership_percentage): solo se usa para propietarios.',
      'Incluye el correo siempre que sea posible para evitar personas duplicadas.',
    ],
  },
  opening_balances: {
    title: 'Saldos iniciales',
    description: 'Migra saldos deudores o créditos existentes por unidad y moneda.',
    headers: [
      'unit_code',
      'balance_type',
      'amount',
      'currency_code',
      'effective_date',
      'description',
    ],
    sample: {
      unit_code: 'A-101',
      balance_type: 'debit',
      amount: '125.50',
      currency_code: 'USD',
      effective_date: '2026-08-01',
      description: 'Saldo anterior a la migración',
    },
    instructions: [
      'Tipo de saldo (balance_type): debit para deuda o credit para saldo a favor.',
      'Monto (amount): debe ser positivo y usar punto decimal, por ejemplo 125.50.',
      'Moneda (currency_code): usa tres letras, por ejemplo USD, VES o EUR.',
      'Fecha efectiva (effective_date): usa el formato YYYY-MM-DD.',
    ],
  },
};

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replaceAll(' ', '_');

const detectDelimiter = (text: string) => {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index];
    if (character === '"') quoted = !quoted;
    if (!quoted && character === ',') commas += 1;
    if (!quoted && character === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
};

export function parseCsv(text: string): ParsedCsv {
  const source = text.replace(/^\uFEFF/, '').trim();
  if (!source) throw new Error('El archivo está vacío.');
  const delimiter = detectDelimiter(source);
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const pushCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value.length > 0)) matrix.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      pushCell();
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      pushRow();
    } else {
      cell += character ?? '';
    }
  }
  if (quoted) throw new Error('Hay una celda con comillas sin cerrar.');
  if (cell.length || row.length) pushRow();
  if (matrix.length < 2) throw new Error('El archivo debe incluir encabezados y al menos una fila.');

  const headerRow = matrix[0] ?? [];
  const headers = headerRow.map(normalizeHeader);
  if (new Set(headers).size !== headers.length)
    throw new Error('El archivo contiene encabezados duplicados.');

  return {
    headers,
    rows: matrix.slice(1).map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])),
    ),
  };
}

const valueFor = (data: Record<string, string>, key: string) => data[key]?.trim() ?? '';
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isPositiveMoney = (value: string) =>
  /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(value) && Number(value) > 0;
const isPercentage = (value: string) =>
  value === '' ||
  (/^(?:100(?:\.0+)?|(?:[0-9]|[1-9][0-9])(?:\.\d+)?)$/.test(value) &&
    Number(value) > 0);

export function validateImportRows(kind: ImportKind, parsed: ParsedCsv): ValidatedImportRow[] {
  const definition = IMPORT_DEFINITIONS[kind];
  const missing = definition.headers.filter((header) => !parsed.headers.includes(header));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}.`);

  const seenUnits = new Set<string>();
  const seenPeople = new Set<string>();

  return parsed.rows.map((data, index) => {
    const errors: string[] = [];
    const rowNumber = index + 2;
    const unitCode = valueFor(data, 'unit_code');
    const ownershipPercentage = valueFor(data, 'ownership_percentage');

    if (kind === 'units') {
      const unitType = valueFor(data, 'unit_type');
      const status = valueFor(data, 'status');
      if (!unitCode) errors.push('unit_code es obligatorio');
      if (unitCode && seenUnits.has(unitCode.toLocaleLowerCase('en-US')))
        errors.push('unit_code está duplicado dentro del archivo');
      if (unitCode) seenUnits.add(unitCode.toLocaleLowerCase('en-US'));
      if (!['apartment', 'house', 'commercial', 'parking', 'storage'].includes(unitType))
        errors.push('unit_type no es válido');
      if (status && !['active', 'inactive'].includes(status)) errors.push('status no es válido');
      if (!isPercentage(ownershipPercentage))
        errors.push('ownership_percentage debe ser mayor que 0 y hasta 100');
    }

    if (kind === 'people') {
      const firstName = valueFor(data, 'first_name');
      const lastName = valueFor(data, 'last_name');
      const email = valueFor(data, 'email');
      const relationship = valueFor(data, 'relationship');
      if (!unitCode) errors.push('unit_code es obligatorio');
      if (!firstName) errors.push('first_name es obligatorio');
      if (!lastName) errors.push('last_name es obligatorio');
      if (
        !['owner', 'owner_occupant', 'tenant', 'family_member', 'authorized_occupant'].includes(
          relationship,
        )
      )
        errors.push('relationship no es válido');
      if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push('email no es válido');
      const identity = email
        ? email.toLocaleLowerCase('en-US')
        : `${unitCode}|${firstName}|${lastName}`.toLocaleLowerCase('es');
      if (seenPeople.has(identity)) errors.push('la persona está duplicada dentro del archivo');
      seenPeople.add(identity);
      if (!isPercentage(ownershipPercentage))
        errors.push('ownership_percentage debe ser mayor que 0 y hasta 100');
      if (ownershipPercentage && !['owner', 'owner_occupant'].includes(relationship))
        errors.push('ownership_percentage solo aplica a propietarios');
    }

    if (kind === 'opening_balances') {
      const balanceType = valueFor(data, 'balance_type');
      const amount = valueFor(data, 'amount');
      const currencyCode = valueFor(data, 'currency_code');
      const effectiveDate = valueFor(data, 'effective_date');
      if (!unitCode) errors.push('unit_code es obligatorio');
      if (!['debit', 'credit'].includes(balanceType))
        errors.push('balance_type debe ser debit o credit');
      if (!isPositiveMoney(amount))
        errors.push('amount debe ser un monto positivo con hasta 2 decimales');
      if (!/^[A-Za-z]{3}$/.test(currencyCode))
        errors.push('currency_code debe tener tres letras');
      if (!isDate(effectiveDate)) errors.push('effective_date debe usar YYYY-MM-DD');
    }

    return { rowNumber, data, errors };
  });
}

const escapeCsv = (value: string) =>
  /[",\n\r;]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export function createTemplateCsv(kind: ImportKind) {
  const definition = IMPORT_DEFINITIONS[kind];
  return [
    definition.headers.join(','),
    definition.headers.map((header) => escapeCsv(definition.sample[header] ?? '')).join(','),
  ].join('\n');
}

export function downloadTemplate(kind: ImportKind) {
  const blob = new Blob([`\uFEFF${createTemplateCsv(kind)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `habitta-${kind.replaceAll('_', '-')}-template.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

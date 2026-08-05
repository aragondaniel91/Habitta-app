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
      'unit_code debe ser único dentro del condominio.',
      'unit_type acepta apartment, house, commercial, parking o storage.',
      'status acepta active o inactive.',
      'building_name, floor y ownership_percentage son opcionales.',
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
      'La unidad debe existir antes de importar personas.',
      'relationship acepta owner, owner_occupant, tenant, family_member o authorized_occupant.',
      'ownership_percentage solo se usa para owner u owner_occupant.',
      'El correo permite reutilizar una persona existente y evitar duplicados.',
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
      'balance_type acepta debit para deuda o credit para saldo a favor.',
      'amount debe ser positivo y usar punto decimal.',
      'currency_code debe tener tres letras, por ejemplo USD, VES o EUR.',
      'effective_date debe usar formato YYYY-MM-DD.',
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
      cell += character;
    }
  }
  if (quoted) throw new Error('Hay una celda con comillas sin cerrar.');
  if (cell.length || row.length) pushRow();
  if (matrix.length < 2) throw new Error('El archivo debe incluir encabezados y al menos una fila.');

  const headers = matrix[0].map(normalizeHeader);
  if (new Set(headers).size !== headers.length)
    throw new Error('El archivo contiene encabezados duplicados.');

  return {
    headers,
    rows: matrix.slice(1).map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])),
    ),
  };
}

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isPositiveMoney = (value: string) => /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(value) && Number(value) > 0;
const isPercentage = (value: string) =>
  value === '' || (/^(?:100(?:\.0+)?|(?:[0-9]|[1-9][0-9])(?:\.\d+)?)$/.test(value) && Number(value) > 0);

export function validateImportRows(kind: ImportKind, parsed: ParsedCsv): ValidatedImportRow[] {
  const definition = IMPORT_DEFINITIONS[kind];
  const missing = definition.headers.filter((header) => !parsed.headers.includes(header));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}.`);

  const seenUnits = new Set<string>();
  const seenPeople = new Set<string>();

  return parsed.rows.map((data, index) => {
    const errors: string[] = [];
    const rowNumber = index + 2;

    if (kind === 'units') {
      const code = data.unit_code?.trim();
      if (!code) errors.push('unit_code es obligatorio');
      if (code && seenUnits.has(code.toLocaleLowerCase('en-US')))
        errors.push('unit_code está duplicado dentro del archivo');
      if (code) seenUnits.add(code.toLocaleLowerCase('en-US'));
      if (!['apartment', 'house', 'commercial', 'parking', 'storage'].includes(data.unit_type))
        errors.push('unit_type no es válido');
      if (data.status && !['active', 'inactive'].includes(data.status))
        errors.push('status no es válido');
      if (!isPercentage(data.ownership_percentage))
        errors.push('ownership_percentage debe ser mayor que 0 y hasta 100');
    }

    if (kind === 'people') {
      if (!data.unit_code) errors.push('unit_code es obligatorio');
      if (!data.first_name) errors.push('first_name es obligatorio');
      if (!data.last_name) errors.push('last_name es obligatorio');
      if (
        !['owner', 'owner_occupant', 'tenant', 'family_member', 'authorized_occupant'].includes(
          data.relationship,
        )
      )
        errors.push('relationship no es válido');
      if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) errors.push('email no es válido');
      const identity = data.email
        ? data.email.toLocaleLowerCase('en-US')
        : `${data.unit_code}|${data.first_name}|${data.last_name}`.toLocaleLowerCase('es');
      if (seenPeople.has(identity)) errors.push('la persona está duplicada dentro del archivo');
      seenPeople.add(identity);
      if (!isPercentage(data.ownership_percentage))
        errors.push('ownership_percentage debe ser mayor que 0 y hasta 100');
      if (
        data.ownership_percentage &&
        !['owner', 'owner_occupant'].includes(data.relationship)
      )
        errors.push('ownership_percentage solo aplica a propietarios');
    }

    if (kind === 'opening_balances') {
      if (!data.unit_code) errors.push('unit_code es obligatorio');
      if (!['debit', 'credit'].includes(data.balance_type))
        errors.push('balance_type debe ser debit o credit');
      if (!isPositiveMoney(data.amount)) errors.push('amount debe ser un monto positivo con hasta 2 decimales');
      if (!/^[A-Za-z]{3}$/.test(data.currency_code))
        errors.push('currency_code debe tener tres letras');
      if (!isDate(data.effective_date)) errors.push('effective_date debe usar YYYY-MM-DD');
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

from pathlib import Path


def replace_once(path: str, old: str, new: str):
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected snippet not found in {path}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "packages/validation/src/index.ts",
    """          effective_date: z.string().date(),
          description: z.string().optional(),
        })
        .superRefine((row, context) => {
          if (!row.unit_id && !row.unit_code)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'unit_id or unit_code is required',
            });
        }),""",
    """          effective_date: z.string().date(),
          due_date: z.string().date().optional(),
          debt_date: z.string().date().optional(),
          description: z.string().optional(),
        })
        .superRefine((row, context) => {
          if (!row.unit_id && !row.unit_code)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'unit_id or unit_code is required',
            });
          if (row.due_date && row.debt_date && row.due_date !== row.debt_date)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['due_date'],
              message: 'due_date and debt_date must match when both are provided',
            });
        }),""",
)

replace_once(
    "apps/web/src/features/imports/csv.ts",
    """  headers: string[];
  sample: Record<string, string>;""",
    """  headers: string[];
  templateHeaders?: string[];
  sample: Record<string, string>;""",
)
replace_once(
    "apps/web/src/features/imports/csv.ts",
    """    headers: [
      'unit_code',
      'balance_type',
      'amount',
      'currency_code',
      'effective_date',
      'description',
    ],
    sample: {""",
    """    headers: [
      'unit_code',
      'balance_type',
      'amount',
      'currency_code',
      'effective_date',
      'description',
    ],
    templateHeaders: [
      'unit_code',
      'balance_type',
      'amount',
      'currency_code',
      'effective_date',
      'due_date',
      'description',
    ],
    sample: {""",
)
replace_once(
    "apps/web/src/features/imports/csv.ts",
    """      effective_date: '2026-08-01',
      description: 'Saldo anterior a la migración',""",
    """      effective_date: '2026-08-01',
      due_date: '2026-07-01',
      description: 'Saldo anterior a la migración',""",
)
replace_once(
    "apps/web/src/features/imports/csv.ts",
    """      'Fecha efectiva (effective_date): usa el formato YYYY-MM-DD.',
    ],""",
    """      'Fecha efectiva (effective_date): usa el formato YYYY-MM-DD.',
      'Fecha de deuda/vencimiento (due_date): opcional; usa YYYY-MM-DD. También se acepta debt_date como alias.',
      'Si no indicas fecha de deuda en un saldo deudor histórico, Habitta usará effective_date para el envejecimiento.',
    ],""",
)
replace_once(
    "apps/web/src/features/imports/csv.ts",
    """      const effectiveDate = valueFor(data, 'effective_date');
      if (!unitCode) errors.push('unit_code es obligatorio');""",
    """      const effectiveDate = valueFor(data, 'effective_date');
      const dueDate = valueFor(data, 'due_date');
      const debtDate = valueFor(data, 'debt_date');
      if (!unitCode) errors.push('unit_code es obligatorio');""",
)
replace_once(
    "apps/web/src/features/imports/csv.ts",
    """      if (!isDate(effectiveDate)) errors.push('effective_date debe usar YYYY-MM-DD');
    }""",
    """      if (!isDate(effectiveDate)) errors.push('effective_date debe usar YYYY-MM-DD');
      if (dueDate && !isDate(dueDate)) errors.push('due_date debe usar YYYY-MM-DD');
      if (debtDate && !isDate(debtDate)) errors.push('debt_date debe usar YYYY-MM-DD');
      if (dueDate && debtDate && dueDate !== debtDate)
        errors.push('due_date y debt_date deben coincidir si se incluyen ambos');
    }""",
)
replace_once(
    "apps/web/src/features/imports/csv.ts",
    """export function createTemplateCsv(kind: ImportKind) {
  const definition = IMPORT_DEFINITIONS[kind];
  return [
    definition.headers.join(','),
    definition.headers.map((header) => escapeCsv(definition.sample[header] ?? '')).join(','),
  ].join('\\n');
}""",
    """export function createTemplateCsv(kind: ImportKind) {
  const definition = IMPORT_DEFINITIONS[kind];
  const headers = definition.templateHeaders ?? definition.headers;
  return [
    headers.join(','),
    headers.map((header) => escapeCsv(definition.sample[header] ?? '')).join(','),
  ].join('\\n');
}""",
)

replace_once(
    "apps/web/src/features/imports/CsvImportWizard.tsx",
    """  'Invalid date': 'La fecha no es válida',
};""",
    """  'Invalid date': 'La fecha no es válida',
  'Invalid due date': 'La fecha de deuda o vencimiento no es válida',
  'Conflicting debt dates': 'due_date y debt_date deben coincidir si se incluyen ambos',
};""",
)
replace_once(
    "apps/web/src/features/imports/CsvImportWizard.tsx",
    """  effective_date: row.effective_date?.trim() ?? '',
  description: row.description?.trim() || undefined,""",
    """  effective_date: row.effective_date?.trim() ?? '',
  due_date: row.due_date?.trim() || row.debt_date?.trim() || undefined,
  description: row.description?.trim() || undefined,""",
)

replace_once(
    "supabase/migrations/20260825195500_hab344_opening_balance_aging.sql",
    """    if issue is null and nullif(btrim(coalesce(row_data ->> 'due_date','')), '') is not null then
      begin
        perform (row_data ->> 'due_date')::date;
      exception when others then
        issue := 'Invalid due date';
      end;
    end if;""",
    """    if issue is null
      and nullif(btrim(coalesce(row_data ->> 'due_date','')), '') is not null
      and nullif(btrim(coalesce(row_data ->> 'debt_date','')), '') is not null
      and btrim(row_data ->> 'due_date') <> btrim(row_data ->> 'debt_date') then
      issue := 'Conflicting debt dates';
    end if;

    if issue is null and coalesce(
      nullif(btrim(coalesce(row_data ->> 'due_date','')), ''),
      nullif(btrim(coalesce(row_data ->> 'debt_date','')), '')
    ) is not null then
      begin
        perform coalesce(
          nullif(btrim(coalesce(row_data ->> 'due_date','')), ''),
          nullif(btrim(coalesce(row_data ->> 'debt_date','')), '')
        )::date;
      exception when others then
        issue := 'Invalid due date';
      end;
    end if;""",
)
replace_once(
    "supabase/migrations/20260825195500_hab344_opening_balance_aging.sql",
    """    item_due := case
      when nullif(btrim(coalesce(row_data ->> 'due_date','')), '') is null then null
      else (row_data ->> 'due_date')::date
    end;""",
    """    item_due := coalesce(
      nullif(btrim(coalesce(row_data ->> 'due_date','')), ''),
      nullif(btrim(coalesce(row_data ->> 'debt_date','')), '')
    )::date;""",
)

replace_once(
    "apps/web/src/features/imports/csv.test.ts",
    """  it('generates an editable template with the exact supported headers', () => {""",
    """  it('accepts optional opening-balance aging dates without breaking legacy CSVs', () => {
    const legacy = parseCsv(
      'unit_code,balance_type,amount,currency_code,effective_date,description\\n' +
        'A-101,debit,25.00,USD,2026-01-01,Legacy',
    );
    const withDueDate = parseCsv(
      'unit_code,balance_type,amount,currency_code,effective_date,due_date,description\\n' +
        'A-101,debit,25.00,USD,2026-01-01,2025-12-01,Historical debt',
    );
    const withDebtDate = parseCsv(
      'unit_code,balance_type,amount,currency_code,effective_date,debt_date,description\\n' +
        'A-101,debit,25.00,USD,2026-01-01,2025-12-01,Alias',
    );

    expect(validateImportRows('opening_balances', legacy)[0]?.errors).toEqual([]);
    expect(validateImportRows('opening_balances', withDueDate)[0]?.errors).toEqual([]);
    expect(validateImportRows('opening_balances', withDebtDate)[0]?.errors).toEqual([]);
  });

  it('includes due_date in the new opening-balance template while keeping it optional', () => {
    const parsed = parseCsv(createTemplateCsv('opening_balances'));

    expect(parsed.headers).toContain('due_date');
    expect(parsed.headers).not.toContain('debt_date');
    expect(validateImportRows('opening_balances', parsed)[0]?.errors).toEqual([]);
  });

  it('generates an editable template with the exact supported headers', () => {""",
)

Path("supabase/tests/hab344_opening_balance_aging.sql").write_text(
    """begin;
select plan(10);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) values
('73440000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@hab344.test','x',now(),now());
insert into public.organizations(id,name,created_by) values
('73441000-0000-0000-0000-000000000001','HAB344 Org','73440000-0000-0000-0000-000000000001');
insert into public.condominiums(id,organization_id,name,created_by) values
('73442000-0000-0000-0000-000000000001','73441000-0000-0000-0000-000000000001','HAB344 Condo','73440000-0000-0000-0000-000000000001');
insert into public.condominium_memberships(condominium_id,user_id,role) values
('73442000-0000-0000-0000-000000000001','73440000-0000-0000-0000-000000000001','condominium_admin');
insert into public.units(id,condominium_id,code,type,created_by) values
('73443000-0000-0000-0000-000000000001','73442000-0000-0000-0000-000000000001','A-1','apartment','73440000-0000-0000-0000-000000000001');
insert into public.charge_concepts(id,condominium_id,code,name,category,created_by) values
('73445000-0000-0000-0000-000000000001','73442000-0000-0000-0000-000000000001','MANUAL','Manual charge','other','73440000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','73440000-0000-0000-0000-000000000001',true);

select lives_ok(format($sql$
  select public.import_opening_balances(
    '73442000-0000-0000-0000-000000000001',
    '[{\"unit_code\":\"A-1\",\"balance_type\":\"debit\",\"amount\":\"40.00\",\"currency_code\":\"USD\",\"effective_date\":\"%s\"}]',
    'hab344-legacy', 'legacy.csv')
$sql$, (current_date - 45)::text), 'legacy opening debit imports without due_date');
select is((select days_31_60 from public.get_receivables_aging('73442000-0000-0000-0000-000000000001') where currency_code='USD'),'40.00','legacy opening debit ages from effective/issue date');

select lives_ok(format($sql$
  select public.import_opening_balances(
    '73442000-0000-0000-0000-000000000001',
    '[{\"unit_code\":\"A-1\",\"balance_type\":\"debit\",\"amount\":\"20.00\",\"currency_code\":\"EUR\",\"effective_date\":\"%s\",\"due_date\":\"%s\"}]',
    'hab344-due', 'due.csv')
$sql$, (current_date - 10)::text, (current_date - 95)::text), 'opening debit accepts explicit due_date');
select is((select over_90 from public.get_receivables_aging('73442000-0000-0000-0000-000000000001') where currency_code='EUR'),'20.00','explicit due_date controls aging bucket');
select is((select due_date::text from public.receivable_items where item_type='opening_balance' and currency_code='EUR'),(current_date - 95)::text,'explicit due_date is persisted on opening debit');

select lives_ok(format($sql$
  select public.import_opening_balances(
    '73442000-0000-0000-0000-000000000001',
    '[{\"unit_code\":\"A-1\",\"balance_type\":\"debit\",\"amount\":\"15.00\",\"currency_code\":\"GBP\",\"effective_date\":\"%s\",\"debt_date\":\"%s\"}]',
    'hab344-debt-alias', 'debt.csv')
$sql$, (current_date - 5)::text, (current_date - 65)::text), 'opening debit accepts debt_date alias');
select is((select days_61_90 from public.get_receivables_aging('73442000-0000-0000-0000-000000000001') where currency_code='GBP'),'15.00','debt_date alias controls aging bucket');

select lives_ok($$select public.create_receivable_item('73442000-0000-0000-0000-000000000001','73443000-0000-0000-0000-000000000001','73445000-0000-0000-0000-000000000001','Manual no due',30.00,'VES',current_date-120,null)$$,'manual charge without due date remains allowed');
select is((select current_amount from public.get_receivables_aging('73442000-0000-0000-0000-000000000001') where currency_code='VES'),'30.00','manual no-due charge remains current');
select is((select over_90 from public.get_receivables_aging('73442000-0000-0000-0000-000000000001') where currency_code='VES'),'0.00','manual no-due charge is not reclassified as overdue');

select * from finish();
rollback;
"""
)

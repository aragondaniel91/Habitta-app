export type RecurringPlanDraft = {
  conceptId: string;
  financialScopeId: string;
  name: string;
  distribution: 'fixed_per_unit' | 'participation_percentage';
  amount: string;
  currencyCode: string;
  startsOn: string;
  endsOn: string;
  issueDay: string;
  dueDay: string;
};

export type RecurringPlanValidation = {
  valid: boolean;
  errors: Partial<Record<keyof RecurringPlanDraft, string>>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const moneyPattern = /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/;
const currencyPattern = /^[A-Z]{3}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseDay(value: string) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 28 ? day : null;
}

export function validateRecurringPlanDraft(draft: RecurringPlanDraft): RecurringPlanValidation {
  const errors: RecurringPlanValidation['errors'] = {};

  if (!uuidPattern.test(draft.conceptId)) errors.conceptId = 'Selecciona un concepto.';
  if (!uuidPattern.test(draft.financialScopeId)) {
    errors.financialScopeId = 'Selecciona un ámbito financiero.';
  }

  const name = draft.name.trim();
  if (!name) errors.name = 'Escribe un nombre para el plan.';
  else if (name.length > 160) errors.name = 'Usa un máximo de 160 caracteres.';

  if (!moneyPattern.test(draft.amount) || Number(draft.amount) <= 0) {
    errors.amount = 'Ingresa un monto mayor que 0 con hasta 2 decimales.';
  }

  if (!currencyPattern.test(draft.currencyCode)) {
    errors.currencyCode = 'Usa un código de moneda de 3 letras, por ejemplo USD.';
  }

  if (!isIsoDate(draft.startsOn)) errors.startsOn = 'Selecciona una fecha de inicio válida.';
  if (draft.endsOn && !isIsoDate(draft.endsOn)) {
    errors.endsOn = 'Selecciona una fecha de finalización válida.';
  } else if (draft.endsOn && isIsoDate(draft.startsOn) && draft.endsOn < draft.startsOn) {
    errors.endsOn = 'La fecha final no puede ser anterior al inicio.';
  }

  const issueDay = parseDay(draft.issueDay);
  const dueDay = parseDay(draft.dueDay);
  if (issueDay === null) errors.issueDay = 'El día de emisión debe estar entre 1 y 28.';
  if (dueDay === null) errors.dueDay = 'El día de vencimiento debe estar entre 1 y 28.';
  else if (issueDay !== null && dueDay < issueDay) {
    errors.dueDay = 'El vencimiento no puede ser anterior al día de emisión.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

import type { DashboardBuilding } from './dashboard';
import { unitReferenceLabel } from './unit-domain';

// HAB-427: an owner may hold several units in the same condominium, so "your unit" stops being a
// single thing. Everything here is pure so the rules can be tested as rules -- which units exist,
// which of them the resident may pay for, and what each one's balance means -- rather than through
// the markup that happens to display them.

/**
 * One row of `get_resident_financial_units`: a unit, in one currency, as the ledger sees it.
 *
 * A unit with no movement arrives once with a null currency and zeros -- it is still a property the
 * resident holds, and dropping it would make the unit disappear from their own list.
 */
export type ResidentFinancialUnit = {
  unit_id: string;
  can_submit_payment: boolean;
  currency_code: string | null;
  total_debits: string;
  total_credits: string;
  net_outstanding: string;
  overdue_amount: string;
  upcoming_amount: string;
};

export type ResidentUnitOption = {
  id: string;
  label: string;
};

type UnitLike = { id: string; code: string; building_id?: string | null };

/**
 * Readable names for the units the resident holds.
 *
 * `/units` returns `building_id`, not `building_name`, so the building has to be resolved against
 * the buildings list. Without it every label silently degraded to a bare code, which in a complex
 * with a Torre A and a Torre B says nothing: both have an apartment 101.
 */
export function residentUnitLabels(
  units: UnitLike[],
  buildings: DashboardBuilding[],
): Map<string, string> {
  const buildingNames = new Map(buildings.map((building) => [building.id, building.name]));
  return new Map(
    units.map((unit) => [
      unit.id,
      unitReferenceLabel({
        code: unit.code,
        buildingName: unit.building_id ? (buildingNames.get(unit.building_id) ?? null) : null,
      }),
    ]),
  );
}

/**
 * A label that is always safe to render. Never the identifier: a uuid tells the resident nothing
 * and looks like a leak, so a unit whose name is unknown is described rather than identified.
 */
export function residentUnitLabel(labels: Map<string, string>, unitId: string): string {
  return labels.get(unitId) ?? 'Unidad sin identificar';
}

/** The units the resident has a financial view of, in label order, each listed once. */
export function financialUnitOptions(
  rows: ResidentFinancialUnit[],
  labels: Map<string, string>,
): ResidentUnitOption[] {
  const ids = [...new Set(rows.map((row) => row.unit_id))];
  return ids
    .map((id) => ({ id, label: residentUnitLabel(labels, id) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'es'));
}

/**
 * The units the resident may actually register a payment for.
 *
 * This is `can_submit_payment` as the database answered it, never "every unit I can see". The two
 * differ often enough to matter: a unit can be financially visible and not payable, and offering it
 * as a payment destination would only produce a refusal after the resident had filled the form.
 */
export function payableUnitOptions(
  rows: ResidentFinancialUnit[],
  labels: Map<string, string>,
): ResidentUnitOption[] {
  return financialUnitOptions(
    rows.filter((row) => row.can_submit_payment),
    labels,
  );
}

/** The rows for one unit, or every row when no unit is selected. */
export function rowsForSelection(
  rows: ResidentFinancialUnit[],
  selectedUnitId: string,
): ResidentFinancialUnit[] {
  return selectedUnitId ? rows.filter((row) => row.unit_id === selectedUnitId) : rows;
}

export type UnitBalanceStanding = {
  tone: 'warning' | 'success' | 'info';
  label: string;
};

/**
 * What a balance means, in the resident's words.
 *
 * Sign matters and is not cosmetic: a negative net is money the condominium owes back, and calling
 * that "al día" would quietly write off a credit the resident is entitled to.
 */
export function unitBalanceStanding(netOutstanding: string): UnitBalanceStanding {
  const net = Number(netOutstanding);
  if (!Number.isFinite(net) || net === 0) return { tone: 'success', label: 'Al día' };
  if (net > 0) return { tone: 'warning', label: 'Pendiente' };
  return { tone: 'info', label: 'Saldo a favor' };
}

/** A row that really has a currency, so callers can format it without asserting anything away. */
export type ResidentCurrencyBalance = ResidentFinancialUnit & { currency_code: string };

/** Rows of one unit that carry a currency. A unit with no movement has none, and that is not an error. */
export function currencyRows(rows: ResidentFinancialUnit[]): ResidentCurrencyBalance[] {
  return rows.filter((row): row is ResidentCurrencyBalance => row.currency_code !== null);
}

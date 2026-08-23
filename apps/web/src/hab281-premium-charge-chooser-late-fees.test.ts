import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const count = (value: string, needle: string) => value.split(needle).length - 1;

const chooser = source('./features/receivables/ChargeCreationChooser.tsx');
const chooserCss = source('./features/receivables/charge-creation-chooser.css');
const lateFees = source('./features/receivables/LateFeeSettingsDrawer.tsx');
const lateFeesCss = source('./late-fees.css');

describe('HAB-281 premium charge chooser and late-fee settings', () => {
  it('gives charge creation a coherent premium hierarchy without changing flow callbacks', () => {
    expect(chooser).not.toContain('optionStyle');
    expect(chooser).not.toContain('style={{');
    expect(count(chooser, 'className="charge-creation-option"')).toBe(3);
    expect(chooser).toContain('onClick={onOrdinary}');
    expect(chooser).toContain('onClick={onExtraordinary}');
    expect(chooser).toContain('onClick={onOneOff}');
    expect(chooser).toContain('Ordinaria recurrente');
    expect(chooser).toContain('Extraordinaria de una sola vez');
    expect(chooser).toContain('Cargo puntual');
    expect(chooserCss).toContain('.charge-creation-option');
  });

  it('moves compatible late-fee layout and controls onto the premium shared form contract', () => {
    expect(lateFees).toContain('className="late-fees-drawer__content ux-form"');
    expect(count(lateFees, '<FormGrid>')).toBe(1);
    expect(count(lateFees, '<FormActions>')).toBe(1);
    expect(count(lateFees, 'className="input"')).toBe(4);
    expect(lateFees).not.toContain('late-fees-drawer__grid');
    expect(lateFees).not.toContain('late-fees-drawer__actions');
    expect(lateFeesCss).not.toContain('.late-fees-drawer__grid');
    expect(lateFeesCss).not.toContain('.late-fees-drawer__actions');
    expect(lateFeesCss).not.toContain('min-height: 40px');
  });

  it('preserves the late-fee policy payload exactly', () => {
    expect(lateFees).toContain('const ratePercent = Number(form.ratePercent)');
    expect(lateFees).toContain('const gracePeriodDays = Number(form.gracePeriodDays)');
    expect(lateFees).toContain(
      "const capPercent = form.capPercent.trim() === '' ? null : Number(form.capPercent)",
    );
    expect(lateFees).toContain('enabled: form.enabled');
    expect(lateFees).toContain('ratePercent,');
    expect(lateFees).toContain('gracePeriodDays,');
    expect(lateFees).toContain('capPercent,');
    expect(lateFees).toContain('localCurrencyCode: form.localCurrencyCode.trim().toUpperCase()');
    expect(lateFees).toContain('appliesToForeignCurrency: form.appliesToForeignCurrency');
  });

  it('keeps saving policy separate from explicitly generating charges', () => {
    expect(lateFees).toContain('await updateLateFeeSettings(condominiumId, session, {');
    expect(lateFees).toContain('const count = await applyLateFees(condominiumId, session)');
    expect(lateFees).toContain('disabled={applying || !form.enabled}');
    expect(lateFees).toContain("setMessage('Política de mora actualizada.')");
    expect(lateFees).toContain('Generar recargos ahora');
    expect(count(lateFees, 'disabled={!canManage}')).toBeGreaterThanOrEqual(6);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../platform-admin/platform-shell.css', import.meta.url),
  'utf8',
);

/*
 * Fase 11 UX audit (HAB-486 pilot readiness) found that the "success" and "warning" status-badge
 * tones — the most frequent states rendered in the onboarding queue ("Completada"/"Sin bloqueo" and
 * "Invitada"/"Esperando cliente") — fell below the WCAG 2.1 AA 4.5:1 contrast minimum for small text
 * (badge text renders at 0.66rem, well under the 18.66px-bold "large text" threshold, so the relaxed
 * 3:1 ratio never applies here). Lock every semantic badge tone to AA so this class of regression
 * fails CI instead of shipping silently to a page every Platform Admin operator uses daily.
 */

function readToken(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match?.[1]) throw new Error(`token --${name} not found in platform-shell.css`);
  return match[1];
}

function linearize(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_SMALL_TEXT_MINIMUM = 4.5;

describe('Platform Admin status-badge tones meet WCAG AA contrast', () => {
  const tones = [
    { name: 'success', fg: 'habitta-green', bg: 'habitta-green-soft' },
    { name: 'warning', fg: 'habitta-amber', bg: 'habitta-amber-soft' },
    { name: 'danger', fg: 'habitta-red', bg: 'habitta-red-soft' },
    { name: 'info', fg: 'habitta-blue', bg: 'habitta-blue-soft' },
    { name: 'demo', fg: 'habitta-purple', bg: 'habitta-purple-soft' },
  ];

  for (const tone of tones) {
    it(`"${tone.name}" badge text clears ${AA_SMALL_TEXT_MINIMUM}:1 against its background`, () => {
      const fg = readToken(tone.fg);
      const bg = readToken(tone.bg);
      const ratio = contrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(AA_SMALL_TEXT_MINIMUM);
    });
  }
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  consumeDirectoryDetailHint,
  directoryDetailHref,
  directoryRequestedCondominium,
  directoryRequestedId,
} from './directory-deep-links';

const unit = '33333333-3333-4333-8333-333333333331';
const person = '22222222-2222-4222-8222-222222222221';
const condominium = '44444444-4444-4444-8444-444444444441';

describe('One-shot directory details', () => {
  beforeEach(() => {
    window.history.replaceState({ checkpoint: 'existing' }, '', '/app/units');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/app/units');
  });

  it('opens a legitimate contextual unit link once, then refresh sees the list only', () => {
    window.history.replaceState(
      { checkpoint: 'existing' },
      '',
      directoryDetailHref('units', unit, condominium) + '&filter=active#directory',
    );
    expect(directoryRequestedId('units', window.location.search)).toBe(unit);
    expect(consumeDirectoryDetailHint('units', unit)).toBe(true);
    expect(window.location.pathname).toBe('/app/units');
    expect(window.location.search).toBe('?condominium=' + condominium + '&filter=active');
    expect(window.location.hash).toBe('#directory');
    expect(window.history.state).toEqual({ checkpoint: 'existing' });
    expect(directoryRequestedCondominium(window.location.search)).toBe(condominium);
    // A page refresh initializes the detail from location.search.
    expect(directoryRequestedId('units', window.location.search)).toBeNull();
    expect(consumeDirectoryDetailHint('units', unit)).toBe(false);
  });

  it('applies the same one-shot behavior when navigating from Units to Personas', () => {
    window.history.replaceState(null, '', directoryDetailHref('people', person, condominium));
    expect(directoryRequestedId('people', window.location.search)).toBe(person);
    expect(consumeDirectoryDetailHint('people', person)).toBe(true);
    expect(window.location.search).toBe('?condominium=' + condominium);
    expect(directoryRequestedId('people', window.location.search)).toBeNull();
  });

  it('never removes another route or a newer detail selection', () => {
    window.history.replaceState(null, '', directoryDetailHref('units', unit));
    expect(consumeDirectoryDetailHint('people', person)).toBe(false);
    expect(consumeDirectoryDetailHint('units', person)).toBe(false);
    expect(directoryRequestedId('units', window.location.search)).toBe(unit);
  });

  it('refuses duplicate or malformed detail identifiers without altering the URL', () => {
    const duplicate = '/app/units?unit=' + unit + '&unit=' + unit;
    window.history.replaceState(null, '', duplicate);
    expect(consumeDirectoryDetailHint('units', unit)).toBe(false);
    expect(window.location.pathname + window.location.search).toBe(duplicate);

    const malformed = '/app/units?unit=not-a-uuid';
    window.history.replaceState(null, '', malformed);
    expect(consumeDirectoryDetailHint('units', unit)).toBe(false);
    expect(window.location.pathname + window.location.search).toBe(malformed);
  });
});

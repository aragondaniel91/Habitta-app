// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ChargeCreationChooser } from './ChargeCreationChooser';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function NavigationHarness() {
  const [destination, setDestination] = useState('');
  return (
    <>
      <ChargeCreationChooser
        onAgreement={() => setDestination('agreement')}
        onClose={() => setDestination('closed')}
        onExtraordinary={() => setDestination('legacy-batch-all-active')}
        onInstallmentPlan={() => setDestination('installment-wizard')}
        onOneOff={() => setDestination('legacy-manual')}
        onOrdinary={() => setDestination('ordinary')}
      />
      <output aria-label="destination">{destination}</output>
    </>
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ChargeCreationChooser navigation', () => {
  it('keeps the legacy extraordinary batch path and exposes a separate installment wizard entry', async () => {
    const element = document.createElement('div');
    const root = createRoot(element);
    document.body.append(element);
    await act(async () => root.render(<NavigationHarness />));
    const option = (kind: string) =>
      element.querySelector(`[data-kind="${kind}"] button`) as HTMLButtonElement;
    await act(async () => option('extraordinary').click());
    expect(element.querySelector('[aria-label="destination"]')?.textContent).toBe(
      'legacy-batch-all-active',
    );
    await act(async () => option('installment-plan').click());
    expect(element.querySelector('[aria-label="destination"]')?.textContent).toBe(
      'installment-wizard',
    );
    await act(async () => option('one-off').click());
    expect(element.querySelector('[aria-label="destination"]')?.textContent).toBe('legacy-manual');
    await act(async () => root.unmount());
  });
});

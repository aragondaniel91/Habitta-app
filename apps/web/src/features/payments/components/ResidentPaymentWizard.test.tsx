// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paymentApi, paymentProof } from '../api';
import type { ChargeConcept, Payment, PaymentMethod, Receivable } from '../types';
import { ResidentPaymentWizard } from './ResidentPaymentWizard';

vi.mock('../api', () => ({
  paymentApi: vi.fn(),
  paymentProof: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.mocked(paymentApi);
const proofMock = vi.mocked(paymentProof);
const session = { access_token: 'test-token', user: { id: 'resident-1' } } as Session;

const source = () =>
  readFile(
    resolve(process.cwd(), 'src/features/payments/components/ResidentPaymentWizard.tsx'),
    'utf8',
  );

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    'value',
  );
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const setSelectValue = (select: HTMLSelectElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const setFileInput = (input: HTMLInputElement, file: File) => {
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const sampleUnits = [
  { id: 'unit-1', label: 'Unidad A-101' },
  { id: 'unit-2', label: 'Unidad B-202' },
];

const sampleReceivables: Receivable[] = [
  {
    id: 'rec-1',
    unit_id: 'unit-1',
    description: 'Mantenimiento Octubre',
    outstanding_amount: '100.00',
    currency_code: 'USD',
  },
  {
    id: 'rec-2',
    unit_id: 'unit-1',
    description: 'Fondo de reserva Octubre',
    outstanding_amount: '50.00',
    currency_code: 'USD',
  },
  {
    id: 'rec-3',
    unit_id: 'unit-1',
    description: 'Cuota extraordinaria EUR',
    outstanding_amount: '80.00',
    currency_code: 'EUR',
  },
  {
    id: 'rec-4',
    unit_id: 'unit-2',
    description: 'Mantenimiento Unidad 202',
    outstanding_amount: '120.00',
    currency_code: 'USD',
  },
];

const sampleMethods: PaymentMethod[] = [
  {
    id: 'method-transfer',
    currency_code: 'USD',
    display_name: 'Transferencia bancaria USD',
    is_active: true,
    method_type: 'bank_transfer',
    requires_reference: true,
    requires_proof: true,
    instructions: 'Banco Nacional, Cta 12345678',
  },
  {
    id: 'method-cash',
    currency_code: 'USD',
    display_name: 'Efectivo USD',
    is_active: true,
    method_type: 'cash',
    requires_reference: false,
    requires_proof: false,
  },
];

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ResidentPaymentWizard source integrity', () => {
  it('collects multi-charge same-currency proposals without presenting them as ledger allocations', async () => {
    const wizard = await source();
    expect(wizard).toContain('Selecciona uno o más cargos');
    expect(wizard).toContain('item.unit_id === unitId');
    expect(wizard).toContain('item.currency_code === currency');
    expect(wizard).toContain('<h3>Vista previa</h3>');
    expect(wizard).toContain('No cambia los saldos pendientes');
    expect(wizard).toContain('/allocation-intent');
    expect(wizard).toContain('aún no se ha aplicado ningún cargo');
  });

  it('retains conditional reference, proof, draft and submit paths', async () => {
    const wizard = await source();
    expect(wizard).toContain('selectedMethod?.requires_reference');
    expect(wizard).toContain('selectedMethod?.requires_proof');
    expect(wizard).toContain('paymentProof(');
    expect(wizard).toContain('Guardar borrador');
    expect(wizard).toContain('Enviar a revisión');
  });

  it('rehydrates and replaces an editable draft proposal rather than sending it to legacy capture', async () => {
    const wizard = await source();
    expect(wizard).toContain("method: 'PATCH'");
    expect(wizard).toContain('/allocation-intent');
    expect(wizard).toContain('payment?.unit_id');
    expect(wizard).toContain("payment ? 'Corregir pago'");
  });
});

describe('ResidentPaymentWizard interactive flow', () => {
  const findButton = (container: HTMLElement, label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(label),
    );

  const getFieldInput = (container: HTMLElement, labelSubstring: string) => {
    const fields = container.querySelectorAll('.field');
    for (const field of fields) {
      if (field.textContent?.includes(labelSubstring)) {
        return field.querySelector<HTMLInputElement>('input');
      }
    }
    return null;
  };

  it('filters charges using administered concepts without losing selected installments', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);
    const concepts: ChargeConcept[] = [
      { id: 'regular', name: 'Gastos comunes', category: 'regular_dues', is_active: true },
      { id: 'special', name: 'Fondo especial', category: 'extraordinary_dues', is_active: true },
    ];
    const receivables = sampleReceivables.map((item) => ({
      ...item,
      concept_id: item.id === 'rec-1' ? 'regular' : item.id === 'rec-2' ? 'special' : null,
    }));

    await act(async () => {
      root.render(
        <ResidentPaymentWizard
          condominiumId="condominium-1"
          concepts={concepts}
          methods={sampleMethods}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDraftCreated={vi.fn()}
          receivables={receivables}
          session={session}
          units={[sampleUnits[0]!]}
        />,
      );
    });

    await act(async () => {
      setSelectValue(host.querySelectorAll<HTMLSelectElement>('select')[1]!, 'USD');
    });
    const chargeList = () => host.querySelector('.resident-payment-wizard__charges')!;
    expect(chargeList().textContent).toContain('Mantenimiento Octubre');
    expect(chargeList().textContent).toContain('Fondo de reserva Octubre');
    await act(async () => {
      chargeList().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    });

    const filters = host.querySelectorAll<HTMLSelectElement>(
      '.resident-payment-wizard__charge-filters select',
    );
    await act(async () => {
      setSelectValue(filters[0]!, 'extraordinary_dues');
    });
    expect(chargeList().textContent).not.toContain('Mantenimiento Octubre');
    expect(chargeList().textContent).toContain('Fondo de reserva Octubre');
    expect(Array.from(filters[1]!.options).map((option) => option.text)).toContain(
      'Fondo especial',
    );
    expect(Array.from(filters[1]!.options).map((option) => option.text)).not.toContain(
      'Gastos comunes',
    );

    await act(async () => {
      setSelectValue(filters[1]!, 'special');
      setInputValue(
        host.querySelector<HTMLInputElement>('input[type="search"]')!,
        'sin coincidencia',
      );
    });
    expect(chargeList().textContent).not.toContain('Fondo de reserva Octubre');
    await act(async () => {
      setInputValue(host.querySelector<HTMLInputElement>('input[type="search"]')!, '');
      setSelectValue(filters[0]!, '');
    });
    const selectedCheckbox = Array.from(
      chargeList().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ).find((input) => input.closest('label')?.textContent?.includes('Mantenimiento Octubre'));
    expect(selectedCheckbox?.checked).toBe(true);

    await act(async () => root.unmount());
  });

  it('validates unit, currency, and charges selection at step 1 before proceeding', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);

    await act(async () => {
      root.render(
        <ResidentPaymentWizard
          condominiumId="condominium-1"
          methods={sampleMethods}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDraftCreated={vi.fn()}
          receivables={sampleReceivables}
          session={session}
          units={sampleUnits}
        />,
      );
    });

    // Try to advance without selecting unit
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Completa los datos obligatorios para continuar.',
    );

    // Select unit 1
    const selects = host.querySelectorAll<HTMLSelectElement>('select');
    await act(async () => {
      setSelectValue(selects[0]!, 'unit-1');
    });

    // Select currency USD
    const currencySelect = host.querySelectorAll<HTMLSelectElement>('select')[1]!;
    await act(async () => {
      setSelectValue(currencySelect, 'USD');
    });

    // Verify charges for unit-1 and USD are shown (unit-2 and EUR must not be present)
    expect(host.textContent).toContain('Mantenimiento Octubre');
    expect(host.textContent).toContain('Fondo de reserva Octubre');
    expect(host.textContent).not.toContain('Cuota extraordinaria EUR');
    expect(host.textContent).not.toContain('Mantenimiento Unidad 202');

    // Trying to continue without checking any charge should fail
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Completa los datos obligatorios para continuar.',
    );

    // Select both charges
    const checkboxes = host.querySelectorAll<HTMLInputElement>(
      '.resident-payment-wizard__charges input[type="checkbox"]',
    );
    expect(checkboxes.length).toBe(2);
    await act(async () => {
      checkboxes[0]!.click();
      checkboxes[1]!.click();
    });

    // Advance to Step 2
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });
    expect(host.textContent).toContain('¿Cuánto deseas pagar?');

    await act(async () => root.unmount());
  });

  it('handles full payment and custom partial payment allocation in step 2 with amount guards', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);

    await act(async () => {
      root.render(
        <ResidentPaymentWizard
          condominiumId="condominium-1"
          methods={sampleMethods}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDraftCreated={vi.fn()}
          receivables={sampleReceivables}
          session={session}
          units={[{ id: 'unit-1', label: 'Unidad A-101' }]} // Single unit auto-selects
        />,
      );
    });

    // Currency select (second select when single unit auto-selects)
    const currencySelect = host.querySelectorAll<HTMLSelectElement>('select')[1]!;
    await act(async () => {
      setSelectValue(currencySelect, 'USD');
    });

    // Select both charges
    const checkboxes = host.querySelectorAll<HTMLInputElement>(
      '.resident-payment-wizard__charges input[type="checkbox"]',
    );
    expect(checkboxes.length).toBe(2);
    await act(async () => {
      checkboxes[0]!.click();
      checkboxes[1]!.click();
    });

    // Advance to Step 2
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });
    expect(host.textContent).toContain('¿Cuánto deseas pagar?');
    expect(host.textContent).toContain('Total: 150.00 USD');
    expect(host.textContent).toContain('Mantenimiento Octubre');
    expect(host.textContent).toContain('100.00 USD');
    expect(host.textContent).toContain('Fondo de reserva Octubre');
    expect(host.textContent).toContain('50.00 USD');

    // Switch to custom amount mode
    const customRadio = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
      (r) => r.parentElement?.textContent?.includes('Abonar un total'),
    )!;
    await act(async () => {
      customRadio.click();
    });

    // Enter amount greater than outstanding total (150.00)
    const amountInput = host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
    await act(async () => {
      setInputValue(amountInput, '200.00');
    });

    // Verifies amount guard
    expect(host.textContent).toContain('El monto no puede superar el pendiente seleccionado.');
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Completa los datos obligatorios para continuar.',
    );

    // Enter partial amount (125.00) -> greedy allocation gives 100 to first and 25 to second
    await act(async () => {
      setInputValue(amountInput, '125.00');
    });
    expect(host.textContent).toContain('Total: 125.00 USD');
    expect(host.textContent).toContain('Mantenimiento Octubre');
    expect(host.textContent).toContain('100.00 USD');
    expect(host.textContent).toContain('Fondo de reserva Octubre');
    expect(host.textContent).toContain('25.00 USD');

    // Exact cents: a one-cent remainder must not be lost to floating-point arithmetic.
    await act(async () => setInputValue(amountInput, '100.01'));
    expect(host.textContent).toContain('Mantenimiento Octubre');
    expect(host.textContent).toContain('Fondo de reserva Octubre');
    expect(host.textContent).toContain('100.00 USD');
    expect(host.textContent).toContain('0.01 USD');
    expect(host.textContent).toContain('Total: 100.01 USD');

    // Reject fractional cents instead of silently rounding what a resident entered.
    await act(async () => setInputValue(amountInput, '100.001'));
    expect(host.textContent).toContain('Introduce un monto válido con máximo dos decimales.');
    await act(async () => findButton(host, 'Continuar')?.click());
    expect(host.textContent).toContain('¿Cuánto deseas pagar?');

    await act(async () => setInputValue(amountInput, '125.00'));

    // Advance to Step 3
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });
    expect(host.textContent).toContain('Método compatible');

    await act(async () => root.unmount());
  });

  it('allocates exact amounts per charge and saves the full plus half-payment proposal', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);
    api.mockResolvedValueOnce({ id: 'p-2', status: 'draft' } as never);
    api.mockResolvedValueOnce({ id: 'intent-p-2', proposals: [] } as never);
    const onComplete = vi.fn(async () => undefined);
    await act(async () =>
      root.render(
        <ResidentPaymentWizard
          condominiumId="condominium-1"
          methods={sampleMethods}
          onClose={vi.fn()}
          onComplete={onComplete}
          onDraftCreated={vi.fn()}
          receivables={sampleReceivables}
          session={session}
          units={[{ id: 'unit-1', label: 'Unidad A-101' }]}
        />,
      ),
    );
    await act(async () =>
      setSelectValue(host.querySelectorAll<HTMLSelectElement>('select')[1]!, 'USD'),
    );
    await act(async () => {
      const boxes = host.querySelectorAll<HTMLInputElement>(
        '.resident-payment-wizard__charges input[type="checkbox"]',
      );
      boxes[0]!.click();
      boxes[1]!.click();
    });
    await act(async () => findButton(host, 'Continuar')?.click());
    const option = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
      (radio) => radio.parentElement?.textContent?.includes('Personalizar por cuota'),
    );
    expect(option).toBeDefined();
    await act(async () => option!.click());
    expect(host.textContent).toContain('Total: 150.00 USD');
    const reserve = host.querySelector<HTMLInputElement>(
      'input[aria-label="Abono para Fondo de reserva Octubre (USD)"]',
    )!;
    await act(async () => setInputValue(reserve, '25.00'));
    expect(host.textContent).toContain('Total: 125.00 USD');
    expect(host.textContent).toContain('Mantenimiento Octubre');
    expect(host.textContent).toContain('100.00 USD');
    expect(host.textContent).toContain('Fondo de reserva Octubre');
    expect(host.textContent).toContain('25.00 USD');
    await act(async () => setInputValue(reserve, '25.001'));
    expect(host.textContent).toContain('Corrige los importes de cada cuota antes de continuar.');
    await act(async () => findButton(host, 'Continuar')?.click());
    expect(host.textContent).toContain('¿Cuánto deseas pagar?');
    await act(async () => setInputValue(reserve, '25.00'));
    await act(async () => findButton(host, 'Continuar')?.click());
    await act(async () =>
      setSelectValue(host.querySelector<HTMLSelectElement>('select')!, 'method-cash'),
    );
    await act(async () =>
      setInputValue(getFieldInput(host, 'Nombre del pagador')!, 'Residente QA'),
    );
    await act(async () => findButton(host, 'Continuar')?.click());
    expect(host.textContent).toContain('2 cuota(s)');
    expect(host.textContent).toContain('Total: 125.00 USD');
    await act(async () => findButton(host, 'Guardar borrador')?.click());
    const create = api.mock.calls.find(
      ([url, , init]) => String(url).endsWith('/payments') && init?.method === 'POST',
    );
    expect(JSON.parse(String(create?.[2]?.body)).originalAmount).toBe('125.00');
    const intent = api.mock.calls.find(
      ([url, , init]) => String(url).endsWith('/allocation-intent') && init?.method === 'PUT',
    );
    expect(JSON.parse(String(intent?.[2]?.body)).allocations).toEqual([
      expect.objectContaining({ receivableItemId: 'rec-1', paymentAmount: '100.00' }),
      expect.objectContaining({ receivableItemId: 'rec-2', paymentAmount: '25.00' }),
    ]);
    expect(onComplete).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it('clears stale payment methods when the resident changes currency', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);
    await act(async () => {
      root.render(
        <ResidentPaymentWizard
          condominiumId="condominium-1"
          methods={sampleMethods}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onDraftCreated={vi.fn()}
          receivables={sampleReceivables}
          session={session}
          units={[{ id: 'unit-1', label: 'Unidad A-101' }]}
        />,
      );
    });
    await act(async () =>
      setSelectValue(host.querySelectorAll<HTMLSelectElement>('select')[1]!, 'USD'),
    );
    await act(async () =>
      host
        .querySelector<HTMLInputElement>(
          '.resident-payment-wizard__charges input[type="checkbox"]',
        )!
        .click(),
    );
    await act(async () => findButton(host, 'Continuar')?.click());
    await act(async () => findButton(host, 'Continuar')?.click());
    await act(async () =>
      setSelectValue(host.querySelector<HTMLSelectElement>('select')!, 'method-cash'),
    );
    await act(async () => setInputValue(getFieldInput(host, 'Nombre del pagador')!, 'Pagador'));

    await act(async () => findButton(host, 'Atrás')?.click());
    await act(async () => findButton(host, 'Atrás')?.click());
    await act(async () =>
      setSelectValue(host.querySelectorAll<HTMLSelectElement>('select')[1]!, 'EUR'),
    );
    await act(async () =>
      host
        .querySelector<HTMLInputElement>(
          '.resident-payment-wizard__charges input[type="checkbox"]',
        )!
        .click(),
    );
    await act(async () => findButton(host, 'Continuar')?.click());
    await act(async () => findButton(host, 'Continuar')?.click());

    const method = host.querySelector<HTMLSelectElement>('select')!;
    expect(method.value).toBe('');
    expect([...method.options].map((option) => option.value)).toEqual(['']);
    await act(async () => findButton(host, 'Continuar')?.click());
    expect(host.textContent).toContain('Completa los datos obligatorios para continuar.');
    expect(api).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('enforces method requirements and supports draft saving vs submission', async () => {
    const onDraftCreated = vi.fn(async () => undefined);
    const onComplete = vi.fn(async () => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);

    api.mockResolvedValueOnce({ id: 'payment-101', status: 'draft' } as never); // POST payment
    api.mockResolvedValueOnce({ id: 'payment-101', proposals: [] } as never); // PUT allocation-intent
    proofMock.mockResolvedValueOnce(new Blob(['proof'], { type: 'image/png' }));

    await act(async () => {
      root.render(
        <ResidentPaymentWizard
          condominiumId="condominium-1"
          methods={sampleMethods}
          onClose={vi.fn()}
          onComplete={onComplete}
          onDraftCreated={onDraftCreated}
          receivables={sampleReceivables}
          session={session}
          units={[{ id: 'unit-1', label: 'Unidad A-101' }]}
        />,
      );
    });

    // Step 1: select currency & charge
    const currencySelect = host.querySelectorAll<HTMLSelectElement>('select')[1]!;
    await act(async () => {
      setSelectValue(currencySelect, 'USD');
    });
    const checkboxes = host.querySelectorAll<HTMLInputElement>(
      '.resident-payment-wizard__charges input[type="checkbox"]',
    );
    await act(async () => {
      checkboxes[0]!.click();
    });
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });

    // Step 2: Full payment ($100), continue
    expect(host.textContent).toContain('Total: 100.00 USD');
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });

    // Step 3: Select method requiring reference and proof
    const methodSelect = host.querySelector<HTMLSelectElement>('select')!;
    await act(async () => {
      setSelectValue(methodSelect, 'method-transfer');
    });
    expect(host.textContent).toContain('Banco Nacional, Cta 12345678');

    // Without payerName, reference and proof, advance must fail
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Completa los datos obligatorios para continuar.',
    );

    // Fill payer name
    const payerInput = getFieldInput(host, 'Nombre del pagador')!;
    await act(async () => {
      setInputValue(payerInput, 'Carlos Residente');
    });

    // Fill reference
    const refInput = getFieldInput(host, 'Referencia')!;
    await act(async () => {
      setInputValue(refInput, 'TRF-554433');
    });

    // Still missing proof
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Completa los datos obligatorios para continuar.',
    );

    // Attach proof file
    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const dummyFile = new File(['proof image'], 'voucher.png', { type: 'image/png' });
    await act(async () => {
      setFileInput(fileInput, dummyFile);
    });

    // Advance to Step 4 (Confirm)
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });
    expect(host.textContent).toContain('Confirma tu propuesta');
    expect(host.textContent).toContain('1 cuota(s)');
    expect(host.textContent).toContain('Total: 100.00 USD');
    expect(host.textContent).toContain(
      'Guardar o enviar conserva una intención de aplicación para revisión; ningún saldo cambia hasta que administración apruebe el pago.',
    );

    // Save as draft (not submitting)
    const draftButton = findButton(host, 'Guardar borrador')!;
    await act(async () => {
      draftButton.click();
    });

    expect(api).toHaveBeenCalledWith(
      '/v1/condominiums/condominium-1/payments',
      session,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"originalAmount":"100.00"'),
      }),
    );
    expect(api).toHaveBeenCalledWith(
      '/v1/condominiums/condominium-1/payments/payment-101/allocation-intent',
      session,
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"receivableItemId":"rec-1"'),
      }),
    );
    expect(proofMock).toHaveBeenCalledWith(
      '/v1/condominiums/condominium-1/payments/payment-101/proof',
      session,
      dummyFile,
    );
    expect(onDraftCreated).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith(
      expect.stringContaining('Borrador guardado con su propuesta'),
    );

    // Verify /submit was NOT called
    expect(api).not.toHaveBeenCalledWith(
      '/v1/condominiums/condominium-1/payments/payment-101/submit',
      expect.anything(),
      expect.anything(),
    );

    await act(async () => root.unmount());
  });

  it('submits payment to review and calls /submit endpoint', async () => {
    const onComplete = vi.fn(async () => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);

    api.mockResolvedValueOnce({ id: 'payment-202', status: 'draft' } as never); // POST payment
    api.mockResolvedValueOnce({ id: 'payment-202', proposals: [] } as never); // PUT allocation-intent
    api.mockResolvedValueOnce({ id: 'payment-202', status: 'submitted' } as never); // POST submit

    await act(async () => {
      root.render(
        <ResidentPaymentWizard
          condominiumId="condominium-1"
          methods={sampleMethods}
          onClose={vi.fn()}
          onComplete={onComplete}
          onDraftCreated={vi.fn()}
          receivables={sampleReceivables}
          session={session}
          units={[{ id: 'unit-1', label: 'Unidad A-101' }]}
        />,
      );
    });

    // Step 1: currency & charge
    const currencySelect = host.querySelectorAll<HTMLSelectElement>('select')[1]!;
    await act(async () => {
      setSelectValue(currencySelect, 'USD');
    });
    const checkboxes = host.querySelectorAll<HTMLInputElement>(
      '.resident-payment-wizard__charges input[type="checkbox"]',
    );
    await act(async () => {
      checkboxes[0]!.click();
    });
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });

    // Step 2: continue
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });

    // Step 3: Cash method (no reference/proof required)
    await act(async () => {
      setSelectValue(host.querySelector<HTMLSelectElement>('select')!, 'method-cash');
    });
    const payerInput = getFieldInput(host, 'Nombre del pagador')!;
    await act(async () => {
      setInputValue(payerInput, 'Ana Residente');
    });
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });

    // Step 4: Click Enviar a revisión
    await act(async () => {
      findButton(host, 'Enviar a revisión')?.click();
    });

    expect(api).toHaveBeenCalledWith(
      '/v1/condominiums/condominium-1/payments/payment-202/submit',
      session,
      { method: 'POST' },
    );
    expect(onComplete).toHaveBeenCalledWith(expect.stringContaining('Pago enviado a revisión'));

    await act(async () => root.unmount());
  });

  it('displays error alert when saving payment fails', async () => {
    const onComplete = vi.fn(async () => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);

    api.mockRejectedValueOnce(new Error('Fallo de red en la pasarela'));

    await act(async () => {
      root.render(
        <ResidentPaymentWizard
          condominiumId="condominium-1"
          methods={sampleMethods}
          onClose={vi.fn()}
          onComplete={onComplete}
          onDraftCreated={vi.fn()}
          receivables={sampleReceivables}
          session={session}
          units={[{ id: 'unit-1', label: 'Unidad A-101' }]}
        />,
      );
    });

    const currencySelect = host.querySelectorAll<HTMLSelectElement>('select')[1]!;
    await act(async () => {
      setSelectValue(currencySelect, 'USD');
    });
    const checkboxes = host.querySelectorAll<HTMLInputElement>(
      '.resident-payment-wizard__charges input[type="checkbox"]',
    );
    await act(async () => {
      checkboxes[0]!.click();
    });
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });
    await act(async () => {
      setSelectValue(host.querySelector<HTMLSelectElement>('select')!, 'method-cash');
    });
    const payerInput = getFieldInput(host, 'Nombre del pagador')!;
    await act(async () => {
      setInputValue(payerInput, 'Ana Residente');
    });
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });

    // Step 4: Click Guardar borrador -> should catch error
    await act(async () => {
      findButton(host, 'Guardar borrador')?.click();
    });

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Fallo de red en la pasarela',
    );
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('rehydrates an existing draft payment with proposals and updates via PATCH', async () => {
    proofMock.mockResolvedValueOnce(null);
    const existingPayment: Payment = {
      id: 'payment-edit-1',
      status: 'draft',
      original_amount: '100.00',
      original_currency_code: 'USD',
      payment_date: '2026-10-18',
      payer_name: 'Residente Corrección',
      payment_method_id: 'method-cash',
      reference: 'REF-EDIT',
      unit_id: 'unit-1',
    };

    api.mockResolvedValueOnce({
      payment_id: 'payment-edit-1',
      proposals: [
        {
          receivable_item_id: 'rec-1',
          payment_amount: '100.00',
          receivable_amount: '100.00',
          payment_currency_code: 'USD',
          receivable_currency_code: 'USD',
        },
      ],
      updated_at: '2026-10-18T10:00:00.000Z',
    } as never);

    api.mockResolvedValueOnce({ ...existingPayment, original_amount: '100.00' } as never); // PATCH
    api.mockResolvedValueOnce({ ok: true } as never); // PUT allocation-intent

    const onComplete = vi.fn(async () => undefined);
    const host = document.createElement('div');
    const root = createRoot(host);
    document.body.append(host);

    await act(async () => {
      root.render(
        <ResidentPaymentWizard
          condominiumId="condominium-1"
          methods={sampleMethods}
          onClose={vi.fn()}
          onComplete={onComplete}
          onDraftCreated={vi.fn()}
          payment={existingPayment}
          receivables={sampleReceivables}
          session={session}
          units={sampleUnits}
        />,
      );
    });

    // Flush async allocation-intent fetch effect
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Corregir pago');

    // Step 1: charges are rehydrated from existing proposals
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });

    // Step 2: saved per-charge allocations are restored verbatim
    expect(host.textContent).toContain('Total: 100.00 USD');
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });

    // Step 3: method and payer name are rehydrated
    await act(async () => {
      findButton(host, 'Continuar')?.click();
    });

    // Step 4: Confirm and save
    await act(async () => {
      findButton(host, 'Guardar borrador')?.click();
    });

    // Must call PATCH instead of POST
    expect(api).toHaveBeenCalledWith(
      '/v1/condominiums/condominium-1/payments/payment-edit-1',
      session,
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"originalAmount":"100.00"'),
      }),
    );

    expect(onComplete).toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});

import { describe, expect, it } from 'vitest';
import { paymentNotesCopy, paymentReferenceCopy } from './payment-field-copy';

describe('payment field copy', () => {
  it('explains a required transfer reference without treating it as a Habitta id', () => {
    expect(paymentReferenceCopy({ requires_reference: true })).toEqual({
      label: 'Referencia de la operación (obligatoria)',
      hint: expect.stringContaining('número interno de Habitta'),
    });
  });

  it('keeps a cash or card-style method reference optional', () => {
    expect(paymentReferenceCopy({ requires_reference: false }).label).toBe(
      'Referencia de la operación (opcional)',
    );
    expect(paymentReferenceCopy({ requires_reference: false }).hint).toContain('puedes');
  });

  it('keeps the review comment distinct from reference and proof', () => {
    expect(paymentNotesCopy.label).toBe('Comentario para revisión (opcional)');
    expect(paymentNotesCopy.hint).toContain('No sustituye la referencia ni el comprobante.');
  });
});

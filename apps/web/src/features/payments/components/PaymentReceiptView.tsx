import type { Payment, PaymentReceipt } from '../types';
export function PaymentReceiptView({
  payment,
  receipt,
  onClose,
}: {
  payment: Payment;
  receipt: PaymentReceipt;
  onClose: () => void;
}) {
  return (
    <article className="payment-receipt">
      {payment.status === 'reversed' && <h1>PAGO REVERSADO</h1>}
      <h2>Recibo Habitta</h2>
      <p>{receipt.receipt_number}</p>
      <p>{receipt.snapshot.condominium.name}</p>
      <p>Unidad {receipt.snapshot.unit.code}</p>
      <p>{receipt.snapshot.method.display_name}</p>
      <p>
        {receipt.snapshot.payment.currency_code} {receipt.snapshot.payment.amount}
      </p>
      <p>Pagador: {receipt.snapshot.payment.payer}</p>
      <button onClick={() => window.print()}>Imprimir</button>
      <button onClick={onClose}>Cerrar</button>
    </article>
  );
}

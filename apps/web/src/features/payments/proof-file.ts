/** Client preflight; server repeats all limits and validates the authenticated payment. */
export function paymentProofFileError(file: File): string | null {
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type))
    return 'Solo se permiten imágenes JPG, PNG, WebP o archivos PDF.';
  if (file.size === 0) return 'El comprobante está vacío.';
  if (file.size > 10 * 1024 * 1024) return 'El comprobante no puede superar 10 MB.';
  return null;
}

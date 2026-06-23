/**
 * Assinatura bilateral — contratos de venda (comprador primeiro, vendedor depois).
 */

import type { SaleSignatureStatus } from '@/lib/saleContractSignatureStatus';

export function isSaleClientSignatureComplete(
  status?: SaleSignatureStatus | string | null,
): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'CLIENT_SIGNED' || key === 'SIGNED';
}

export function isSaleFullySigned(
  status?: SaleSignatureStatus | string | null,
  vendorSignedAt?: string | null,
): boolean {
  const key = String(status || '').toUpperCase();
  if (key !== 'SIGNED') return false;
  return true;
}

/** Contratos antigos: SIGNED sem vendor_signed_at (assinatura automática legada). */
export function isSaleLegacyAutoSigned(
  status?: SaleSignatureStatus | string | null,
  vendorSignedAt?: string | null,
): boolean {
  return (
    String(status || '').toUpperCase() === 'SIGNED' &&
    !String(vendorSignedAt || '').trim()
  );
}

export function canVendorSignSaleContract(
  status?: SaleSignatureStatus | string | null,
): boolean {
  return String(status || '').toUpperCase() === 'CLIENT_SIGNED';
}

export function isPublicSaleSignBlocked(
  status?: SaleSignatureStatus | string | null,
): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'CLIENT_SIGNED' || key === 'SIGNED' || key === 'EXPIRED' || key === 'CANCELLED';
}

export function canShowVendorSignButton(
  status?: SaleSignatureStatus | string | null,
): boolean {
  return canVendorSignSaleContract(status);
}

export function isSaleSignatureSendBlocked(
  status?: SaleSignatureStatus | string | null,
): boolean {
  return isSaleClientSignatureComplete(status);
}

export function shouldIssueSaleCertificate(
  status?: SaleSignatureStatus | string | null,
  vendorSignedAt?: string | null,
): boolean {
  const key = String(status || '').toUpperCase();
  if (key !== 'SIGNED') return false;
  if (isSaleLegacyAutoSigned(status, vendorSignedAt)) return true;
  return Boolean(String(vendorSignedAt || '').trim());
}

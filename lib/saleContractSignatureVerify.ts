/**
 * URLs e constantes do certificado digital de assinatura — contratos de venda.
 * QR Code e link público usam /sign/sale/[token] (página já existente).
 */

import { buildSaleSignUrl } from '@/lib/saleContractUrls';

export const SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE =
  'CERTIFICADO DIGITAL DE ASSINATURA SV LOTES';

export const SALE_CONTRACT_SIGNATURE_CERTIFICATE_SUBTITLE =
  'Documento assinado eletronicamente.';

/**
 * URL pública do contrato assinado — mesma rota usada no envio por WhatsApp/e-mail.
 */
export function resolveSaleContractCertificatePublicUrl(
  token: string,
  signatureUrl?: string | null,
): string {
  const stored = String(signatureUrl || '').trim();
  if (stored) return stored;
  const trimmed = String(token || '').trim();
  if (!trimmed) return '';
  return buildSaleSignUrl(trimmed);
}

/** URL usada no QR Code do certificado (página pública /sign/sale/[token]). */
export function resolveSaleContractCertificateQrUrl(
  token: string,
  signatureUrl?: string | null,
): string {
  return resolveSaleContractCertificatePublicUrl(token, signatureUrl);
}

/** @deprecated Use SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE */
export const SV_LOTES_2_CERTIFICATE_TITLE = SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE;

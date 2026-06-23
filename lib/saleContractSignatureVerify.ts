/**
 * URLs e constantes do certificado digital de assinatura — contratos de venda.
 * QR Code e link público usam /verify/[token] (validação pública).
 */

import { buildSignatureVerifyUrl } from '@/lib/signatureVerifyUrls';
import { buildSaleSignUrl } from '@/lib/saleContractUrls';

export const SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE =
  'CERTIFICADO DIGITAL DE ASSINATURA SV LOTES';

export const SALE_CONTRACT_SIGNATURE_CERTIFICATE_SUBTITLE =
  'Documento assinado eletronicamente.';

/**
 * URL pública de validação do documento assinado.
 */
export function resolveSaleContractCertificatePublicUrl(
  token: string,
  signatureUrl?: string | null,
  validationPublicUrl?: string | null,
): string {
  const validation = String(validationPublicUrl || '').trim();
  if (validation) return validation;
  const trimmed = String(token || '').trim();
  if (trimmed) return buildSignatureVerifyUrl(trimmed);
  const stored = String(signatureUrl || '').trim();
  if (stored) return stored;
  return '';
}

/** URL usada no QR Code do certificado (/verify/[token]). */
export function resolveSaleContractCertificateQrUrl(
  token: string,
  signatureUrl?: string | null,
  validationPublicUrl?: string | null,
): string {
  return resolveSaleContractCertificatePublicUrl(token, signatureUrl, validationPublicUrl);
}

/** Rota de assinatura (fluxo interativo). */
export function resolveSaleContractSignPageUrl(token: string): string {
  return buildSaleSignUrl(token);
}

/** @deprecated Use SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE */
export const SV_LOTES_2_CERTIFICATE_TITLE = SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE;

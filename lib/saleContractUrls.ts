/**
 * URLs públicas de assinatura de contratos de compra e venda.
 */

import {
  buildSignatureVerifyUrl,
  isNonProductionPublicUrl,
  resolvePublicBaseUrl,
} from '@/lib/signatureVerifyUrls';

export function buildSaleSignUrl(token: string): string {
  const trimmed = String(token || '').trim();
  if (!trimmed) return '';
  return `${resolvePublicBaseUrl()}/sign/sale/${encodeURIComponent(trimmed)}`;
}

/** Reconstrói URL de assinatura a partir do token (corrige previews gravados no banco). */
export function resolveSaleSignUrl(token: string, storedUrl?: string | null): string {
  const built = buildSaleSignUrl(token);
  if (!built) return String(storedUrl || '').trim();
  const stored = String(storedUrl || '').trim();
  if (!stored || isNonProductionPublicUrl(stored)) return built;
  return stored;
}

export function resolveSaleValidationPublicUrl(
  token: string,
  storedUrl?: string | null,
): string {
  const built = buildSignatureVerifyUrl(token);
  const stored = String(storedUrl || '').trim();
  if (!stored || isNonProductionPublicUrl(stored)) return built;
  return stored;
}

export function buildSaleSignApiUrl(token: string): string {
  return `/api/sign/sale/${encodeURIComponent(token)}`;
}

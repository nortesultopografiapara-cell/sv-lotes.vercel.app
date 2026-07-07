/**
 * URLs públicas de assinatura de contratos de compra e venda.
 */

import { resolvePublicBaseUrl } from '@/lib/signatureVerifyUrls';

export function buildSaleSignUrl(token: string): string {
  const base =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : resolvePublicBaseUrl();
  return `${base}/sign/sale/${encodeURIComponent(token)}`;
}

export function buildSaleSignApiUrl(token: string): string {
  return `/api/sign/sale/${encodeURIComponent(token)}`;
}

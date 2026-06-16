/**
 * URLs públicas de assinatura de contratos de compra e venda.
 */

import { getAppBaseUrl } from '@/lib/pdfValidation';

export function buildSaleSignUrl(token: string): string {
  return `${getAppBaseUrl()}/sign/sale/${encodeURIComponent(token)}`;
}

export function buildSaleSignApiUrl(token: string): string {
  return `/api/sign/sale/${encodeURIComponent(token)}`;
}

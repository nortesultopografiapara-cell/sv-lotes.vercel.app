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

/** Extrai o token plaintext de uma URL `/sign/sale/{token}` (hosts antigos inclusive). */
export function extractSaleSignTokenFromUrl(url?: string | null): string | null {
  const stored = String(url || '').trim();
  if (!stored) return null;
  try {
    const parsed = new URL(stored);
    const match = parsed.pathname.match(/\/sign\/sale\/([^/]+)\/?$/i);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    const match = stored.match(/\/sign\/sale\/([^/?#]+)/i);
    if (!match?.[1]) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
}

/**
 * Reconstrói URL de assinatura a partir do token com o host atual do ambiente.
 * Ignora host antigo persistido (ex.: Preview lz3cb1kev após redeploy).
 */
export function resolveSaleSignUrl(token: string, storedUrl?: string | null): string {
  const built = buildSaleSignUrl(token);
  if (built) return built;
  return String(storedUrl || '').trim();
}

/**
 * Resolve URL de party a partir da URL persistida (token no path) + host atual.
 * Não altera o token — só o host/base.
 */
export function resolvePartySignatureUrl(storedUrl?: string | null): string | null {
  const stored = String(storedUrl || '').trim();
  if (!stored) return null;
  const token = extractSaleSignTokenFromUrl(stored);
  if (!token) {
    // Sem token extraível: se for host não-prod, não devolver URL stale
    if (isNonProductionPublicUrl(stored)) return null;
    return stored;
  }
  return resolveSaleSignUrl(token, stored);
}

export function resolveSaleValidationPublicUrl(
  token: string,
  storedUrl?: string | null,
): string {
  const built = buildSignatureVerifyUrl(token);
  if (built) return built;
  return String(storedUrl || '').trim();
}

export function buildSaleSignApiUrl(token: string): string {
  return `/api/sign/sale/${encodeURIComponent(token)}`;
}

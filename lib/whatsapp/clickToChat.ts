/**
 * Click-to-chat WhatsApp — infraestrutura única do SV Lotes.
 *
 * Desktop: web.whatsapp.com/send?phone=&text= (evita wa.me → /resolve 404 no Windows).
 * Mobile:  wa.me/{phone}?text=
 *
 * Mensagem: encodeURIComponent uma única vez.
 * Z-API / envio automático NÃO passa por aqui.
 */

import { onlyDigits } from '@/lib/inputMasks';

export type WhatsAppOpenTarget = 'desktop' | 'mobile';

const MOBILE_UA_RE =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

function isValidBrLocalNumber(local: string): boolean {
  return local.length === 10 || local.length === 11;
}

function isValidBrInternational(digits: string): boolean {
  if (!digits.startsWith('55')) return false;
  return isValidBrLocalNumber(digits.slice(2));
}

/**
 * Normaliza telefone brasileiro para DDI 55 + DDD + número (só dígitos).
 * Não inventa DDD. Números inseguros retornam null.
 */
export function normalizeWhatsAppPhone(phone?: string | null): string | null {
  let digits = onlyDigits(phone);
  if (!digits) return null;

  digits = digits.replace(/^0+/, '');
  if (!digits) return null;

  while (digits.startsWith('55') && digits.length >= 14) {
    const rest = digits.slice(2);
    if (isValidBrInternational(rest) || rest.startsWith('55')) {
      digits = rest;
      continue;
    }
    break;
  }

  if (digits.startsWith('55')) {
    return isValidBrInternational(digits) ? digits : null;
  }

  if (isValidBrLocalNumber(digits)) {
    return `55${digits}`;
  }

  return null;
}

export function canShareViaWhatsApp(phone?: string | null): boolean {
  return Boolean(normalizeWhatsAppPhone(phone));
}

export function detectWhatsAppOpenTarget(
  userAgent?: string | null,
): WhatsAppOpenTarget {
  const ua =
    userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return 'desktop';
  return MOBILE_UA_RE.test(ua) ? 'mobile' : 'desktop';
}

function encodeWhatsAppMessage(message: string): string {
  return encodeURIComponent(String(message || ''));
}

/**
 * Monta a URL de click-to-chat. Sem telefone válido → null (nunca gera URL inválida).
 * `target` omisso: detecta pelo user-agent; em SSR/Node assume desktop.
 */
export function buildWhatsAppUrl(
  phone: string | null | undefined,
  message: string,
  target?: WhatsAppOpenTarget,
): string | null {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;

  const text = encodeWhatsAppMessage(message);
  const env = target ?? detectWhatsAppOpenTarget();

  if (env === 'mobile') {
    return `https://wa.me/${normalized}?text=${text}`;
  }

  return `https://web.whatsapp.com/send?phone=${normalized}&text=${text}`;
}

/** Alias estável para chamadas de compartilhamento (assinatura, cobrança, etc.). */
export function buildSignatureShareWhatsAppUrl(
  phone: string | null | undefined,
  message: string,
  target?: WhatsAppOpenTarget,
): string | null {
  return buildWhatsAppUrl(phone, message, target);
}

export function isWhatsAppClickToChatUrl(url?: string | null): boolean {
  const trimmed = String(url || '').trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'wa.me') {
      return Boolean(normalizeWhatsAppPhone(parsed.pathname.replace(/^\//, '')));
    }
    if (parsed.hostname === 'web.whatsapp.com') {
      return (
        parsed.pathname.replace(/\/$/, '') === '/send' &&
        Boolean(normalizeWhatsAppPhone(parsed.searchParams.get('phone')))
      );
    }
    return false;
  } catch {
    return false;
  }
}

export function parseWhatsAppClickToChatUrl(
  url?: string | null,
): { phone: string; message: string } | null {
  const trimmed = String(url || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    let rawPhone = '';
    if (parsed.hostname === 'wa.me') {
      rawPhone = parsed.pathname.replace(/^\//, '');
    } else if (
      parsed.hostname === 'web.whatsapp.com' &&
      parsed.pathname.replace(/\/$/, '') === '/send'
    ) {
      rawPhone = parsed.searchParams.get('phone') || '';
    } else {
      return null;
    }
    const phone = normalizeWhatsAppPhone(rawPhone);
    if (!phone) return null;
    return {
      phone,
      message: parsed.searchParams.get('text') || '',
    };
  } catch {
    return null;
  }
}

function openUrlInBrowser(url: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) return true;
  } catch {
    // fallback âncora
  }

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}

/** Reconstrói a URL para o dispositivo atual e abre. */
export function openWhatsAppClickToChatUrl(url?: string | null): boolean {
  const parsed = parseWhatsAppClickToChatUrl(url);
  const finalUrl = parsed
    ? buildWhatsAppUrl(parsed.phone, parsed.message)
    : isWhatsAppClickToChatUrl(url)
      ? String(url).trim()
      : null;
  if (!finalUrl) return false;
  return openUrlInBrowser(finalUrl);
}

/** Abre a conversa com mensagem preenchida (detecta desktop/mobile no clique). */
export function openWhatsApp(
  phone: string | null | undefined,
  message: string,
): boolean {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;
  return openUrlInBrowser(url);
}

/**
 * Remetente/Reply-To da Central de Cobranças (e-mail ao comprador).
 * O endereço técnico nunca vem do tenant. O nome exibido é sanitizado.
 */

import {
  extractEmailAddressFromFromHeader,
  resolveResendFromAddress,
} from '@/lib/email/resendSend';
import { isValidReminderEmail } from '@/lib/charges/buyerReminderEligibility';
import { formatBuyerDisplayName } from '@/lib/charges/buyerCollectionMessages';

export const SV_LOTES_TECHNICAL_FROM_EMAIL = 'suporte@svlotes.com.br';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeEmailFromDisplayName(name?: string | null): string {
  const cleaned = String(name || '')
    .replace(/[\r\n\0]/g, ' ')
    .replace(/[<>":@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 78);
  return cleaned || 'SV Lotes';
}

export function resolveBuyerCollectionTechnicalMailbox(): string | null {
  const configured = resolveResendFromAddress();
  if (!configured) return null;
  const email = extractEmailAddressFromFromHeader(configured);
  if (!email || !EMAIL_RE.test(email)) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  if (domain === 'svlotes.com.br') return SV_LOTES_TECHNICAL_FROM_EMAIL;
  return email.toLowerCase();
}

export function buildBuyerCollectionFromHeader(companyName?: string | null): string | null {
  const mailbox = resolveBuyerCollectionTechnicalMailbox();
  if (!mailbox) return null;
  const display = `${sanitizeEmailFromDisplayName(formatBuyerDisplayName(companyName))} via SV Lotes`;
  return `${display} <${mailbox}>`;
}

export function resolveBuyerCollectionReplyTo(companyEmail?: string | null): string {
  const raw = String(companyEmail || '').trim();
  if (isValidReminderEmail(raw)) return raw;
  return SV_LOTES_TECHNICAL_FROM_EMAIL;
}

export function fromHeaderMailbox(fromHeader?: string | null): string | null {
  return extractEmailAddressFromFromHeader(String(fromHeader || '')) || null;
}

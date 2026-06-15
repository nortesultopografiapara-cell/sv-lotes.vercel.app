/**
 * Compartilhamento do link de assinatura eletrônica (WhatsApp, e-mail, mensagens).
 */

import type { SignatureHistoryEvent } from '@/lib/saasContractSignatureService';
import type { SignatureStatus } from '@/lib/saasContractStatus';
import { onlyDigits } from '@/lib/inputMasks';

export type SignatureShareMessageInput = {
  signerName: string;
  companyName: string;
  contractNumber: string;
  signatureUrl: string;
  expiresAt: string;
};

export type LocalSignatureTimelineEvent = {
  at: string;
  event: string;
  details: string;
};

export function formatSignatureExpiresAtBr(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function formatSignatureTimelineDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/** Normaliza telefone brasileiro para wa.me (DDI 55). */
export function normalizeWhatsAppPhone(phone?: string | null): string | null {
  const digits = onlyDigits(phone);
  if (!digits) return null;

  if (digits.length >= 12 && digits.startsWith('55')) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  if (digits.length > 11) {
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  return null;
}

export function canShareViaWhatsApp(phone?: string | null): boolean {
  return Boolean(normalizeWhatsAppPhone(phone));
}

export function canShareViaEmail(email?: string | null): boolean {
  const value = String(email || '').trim();
  return value.includes('@');
}

export function buildSignatureShareMessage(input: SignatureShareMessageInput): string {
  const responsible = input.signerName.trim() || 'responsável';
  const expires = formatSignatureExpiresAtBr(input.expiresAt);

  return [
    `Olá, ${responsible}.`,
    '',
    'Segue o contrato SaaS da plataforma SV LOTES para assinatura eletrônica.',
    '',
    `Empresa: ${input.companyName}`,
    `Contrato: ${input.contractNumber}`,
    '',
    'Acesse o link abaixo para visualizar e assinar:',
    input.signatureUrl,
    '',
    `Este link é individual e possui validade até ${expires}.`,
    '',
    'Atenciosamente,',
    'SV LOTES',
  ].join('\n');
}

export function buildSignatureShareEmailSubject(companyName: string): string {
  return `Contrato SV LOTES para assinatura eletrônica — ${companyName}`;
}

export function buildSignatureShareWhatsAppUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function buildSignatureShareMailtoUrl(
  email: string | null | undefined,
  subject: string,
  body: string,
): string | null {
  const to = String(email || '').trim();
  if (!canShareViaEmail(to)) return null;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** QR Code deve representar exatamente o link público de assinatura. */
export function qrCodePayloadForSignatureUrl(signatureUrl: string): string {
  return String(signatureUrl || '').trim();
}

export function isContractSignatureSendBlocked(
  status?: SignatureStatus | string | null,
): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'SIGNED';
}

export function canResendOrShareSignature(
  status?: SignatureStatus | string | null,
): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'PENDING' || key === 'VIEWED';
}

export function mergeSignatureTimeline(
  serverEvents: SignatureHistoryEvent[],
  localEvents: LocalSignatureTimelineEvent[] = [],
): Array<{ at: string; event: string; details: string }> {
  const mappedServer = serverEvents.map((evt) => ({
    at: evt.at,
    event: evt.event,
    details:
      evt.details ||
      (evt.ip ? `IP ${evt.ip}` : evt.user && evt.user !== 'Sistema' ? evt.user : '—'),
  }));

  const mappedLocal = localEvents.map((evt) => ({
    at: evt.at,
    event: evt.event,
    details: evt.details,
  }));

  return [...mappedServer, ...mappedLocal].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

export type SendSignatureApiResponse = {
  success?: boolean;
  signUrl?: string;
  signature?: {
    signature_url?: string;
    signature_status?: string;
    expires_at?: string;
  };
};

export function resolveSignatureUrlFromSendResponse(
  json: SendSignatureApiResponse,
): string | null {
  return json.signUrl || json.signature?.signature_url || null;
}

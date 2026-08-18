/**
 * Resolução única de telefone/e-mail para compartilhar assinatura (seção + modal).
 * Não afrouxa normalizeWhatsAppPhone.
 */

import { onlyDigits } from '@/lib/inputMasks';
import {
  canShareViaEmail,
  canShareViaWhatsApp,
} from '@/lib/saasContractSignatureShare';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/clickToChat';

export type SalePartyShareContactFields = {
  role?: string | null;
  phone?: string | null;
  signer_phone?: string | null;
  email?: string | null;
  signer_email?: string | null;
};

export type SalePartyShareContact = {
  /** Valor bruto escolhido (ainda normalizável). */
  phone: string | null;
  email: string | null;
  canShareWhatsApp: boolean;
  canShareEmail: boolean;
  phoneLast4: string | null;
  /** Havia dígitos, mas nenhum candidato passou na normalização. */
  phoneInvalidHint: boolean;
};

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (value) return value;
  }
  return null;
}

/** Primeiro candidato que a normalização central aceita. */
export function pickFirstNormalizableWhatsAppPhone(
  candidates: Array<string | null | undefined>,
): string | null {
  for (const raw of candidates) {
    const value = String(raw || '').trim();
    if (value && normalizeWhatsAppPhone(value)) return value;
  }
  return null;
}

export function partySharePhoneCandidates(
  party?: SalePartyShareContactFields | null,
): Array<string | null | undefined> {
  if (!party) return [];
  return [party.phone, party.signer_phone];
}

export function partyShareEmailCandidates(
  party?: SalePartyShareContactFields | null,
): Array<string | null | undefined> {
  if (!party) return [];
  return [party.email, party.signer_email];
}

export function resolveSalePartySharePhone(
  party?: SalePartyShareContactFields | null,
  fallbackPhone?: string | null,
): string | null {
  const role = String(party?.role || '').toUpperCase();
  const fallback =
    role === 'BUYER' || !party?.role ? fallbackPhone : null;
  return pickFirstNormalizableWhatsAppPhone([
    ...partySharePhoneCandidates(party),
    fallback,
  ]);
}

export function resolveSalePartyShareEmail(
  party?: SalePartyShareContactFields | null,
): string | null {
  for (const raw of partyShareEmailCandidates(party)) {
    const value = String(raw || '').trim();
    if (canShareViaEmail(value)) return value;
  }
  return null;
}

export function resolveSalePartyShareContact(
  party?: SalePartyShareContactFields | null,
  options?: { fallbackPhone?: string | null },
): SalePartyShareContact {
  const phone = resolveSalePartySharePhone(party, options?.fallbackPhone);
  const email = resolveSalePartyShareEmail(party);
  const rawPartyPhone = firstNonEmpty(...partySharePhoneCandidates(party));
  const allowFallback =
    String(party?.role || '').toUpperCase() === 'BUYER' || !party?.role;
  const rawFallback = allowFallback
    ? String(options?.fallbackPhone || '').trim() || null
    : null;
  const hadAnyDigits = Boolean(
    onlyDigits(rawPartyPhone) || onlyDigits(rawFallback),
  );

  return {
    phone,
    email,
    canShareWhatsApp: canShareViaWhatsApp(phone),
    canShareEmail: canShareViaEmail(email),
    phoneLast4: phone ? onlyDigits(phone).slice(-4) : null,
    phoneInvalidHint: !phone && hadAnyDigits,
  };
}

/** Linha de contato da seção/modal — não mostra final se o número for inválido. */
export function formatSalePartyShareContactLine(
  contact: SalePartyShareContact,
): string | null {
  if (contact.canShareWhatsApp && contact.phoneLast4) {
    return `WhatsApp final ${contact.phoneLast4}`;
  }
  if (contact.phoneInvalidHint) {
    return 'Telefone inválido para WhatsApp';
  }
  if (contact.canShareEmail && contact.email) {
    return contact.email;
  }
  return null;
}

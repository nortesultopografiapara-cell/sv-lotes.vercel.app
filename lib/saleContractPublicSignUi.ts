/**
 * Estado da UI pública /sign/sale — baseado na party do token, não no agregado.
 */

import { normalizeWhatsAppPhone } from '@/lib/whatsapp/clickToChat';

export type SalePublicSignPanel =
  | 'fully_signed'
  | 'awaiting_other_buyers'
  | 'awaiting_vendor'
  | 'form'
  | 'unavailable';

export type SalePublicSignUiInput = {
  processStatus: string;
  /** Status da party resolvida pelo token (BUYER/SPOUSE). Ausente = legado bilateral. */
  partyStatus?: string | null;
  partyRole?: string | null;
  canSign: boolean;
  /** Só true quando ESTA party já assinou e ainda faltam outros compradores. */
  awaitingOtherBuyers?: boolean;
  awaitingVendor?: boolean;
};

/**
 * Abrir o link nunca deve mostrar "Sua assinatura foi registrada".
 * PARTIALLY_SIGNED no processo = alguém assinou; só a party SIGNED vê confirmação.
 */
export function resolveSalePublicSignPanel(
  input: SalePublicSignUiInput,
): SalePublicSignPanel {
  const process = String(input.processStatus || '').toUpperCase();
  const party = input.partyStatus
    ? String(input.partyStatus).toUpperCase()
    : null;
  const hasParty = Boolean(input.partyRole);

  const currentPartySigned = hasParty
    ? party === 'SIGNED'
    : process === 'SIGNED' || process === 'CLIENT_SIGNED';

  if (process === 'SIGNED') {
    return 'fully_signed';
  }

  if (
    input.awaitingOtherBuyers === true ||
    (currentPartySigned && process === 'PARTIALLY_SIGNED')
  ) {
    return 'awaiting_other_buyers';
  }

  if (
    currentPartySigned &&
    (process === 'CLIENT_SIGNED' || input.awaitingVendor === true)
  ) {
    return 'awaiting_vendor';
  }

  if (input.canSign) {
    return 'form';
  }

  if (!hasParty && (process === 'CLIENT_SIGNED' || input.awaitingVendor)) {
    return 'awaiting_vendor';
  }

  return 'unavailable';
}

const CUSTOMER_PHONE_FIELDS_FOR_SIGNATURE = [
  'phone',
  'whatsapp',
  'mobile',
  'celular',
  'contact_phone',
  'telefone',
] as const;

function customerPhoneCandidates(
  customer?: Record<string, unknown> | null,
): string[] {
  if (!customer) return [];
  const values: string[] = [];
  for (const key of CUSTOMER_PHONE_FIELDS_FOR_SIGNATURE) {
    const value = String(customer[key] ?? '').trim();
    if (value) values.push(value);
  }
  return values;
}

/** Telefone do comprador a partir do cadastro (vários campos possíveis). */
export function pickCustomerPhoneForSignature(
  customer?: Record<string, unknown> | null,
): string | null {
  return customerPhoneCandidates(customer)[0] || null;
}

/**
 * Primeiro telefone do cadastro aceito por normalizeWhatsAppPhone.
 * Não afrouxa a normalização: campo preenchido inválido não bloqueia o próximo.
 */
export function pickCustomerWhatsAppPhoneForSignature(
  customer?: Record<string, unknown> | null,
): string | null {
  for (const value of customerPhoneCandidates(customer)) {
    if (normalizeWhatsAppPhone(value)) return value;
  }
  return null;
}

function partyHasNormalizableWhatsAppPhone(party: {
  signer_phone?: string | null;
  phone?: string | null;
}): boolean {
  return Boolean(
    normalizeWhatsAppPhone(party.phone) ||
      normalizeWhatsAppPhone(party.signer_phone),
  );
}

/** Enriquece party BUYER sem telefone WhatsApp válido com o telefone do cliente. */
export function enrichBuyerPartyPhone<
  T extends {
    role: string;
    signer_phone?: string | null;
    phone?: string | null;
  },
>(parties: T[], buyerPhone?: string | null): T[] {
  const fallback = String(buyerPhone || '').trim();
  if (!fallback || !normalizeWhatsAppPhone(fallback)) return parties;

  return parties.map((party) => {
    if (String(party.role || '').toUpperCase() !== 'BUYER') return party;
    if (partyHasNormalizableWhatsAppPhone(party)) return party;
    return {
      ...party,
      phone: fallback,
      signer_phone: fallback,
    };
  });
}

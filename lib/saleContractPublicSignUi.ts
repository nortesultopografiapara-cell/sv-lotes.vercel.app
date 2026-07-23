/**
 * Estado da UI pública /sign/sale — baseado na party do token, não no agregado.
 */

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

/** Telefone do comprador a partir do cadastro (vários campos possíveis). */
export function pickCustomerPhoneForSignature(
  customer?: Record<string, unknown> | null,
): string | null {
  if (!customer) return null;
  const candidates = [
    customer.phone,
    customer.whatsapp,
    customer.mobile,
    customer.celular,
    customer.contact_phone,
    customer.telefone,
  ];
  for (const raw of candidates) {
    const value = String(raw || '').trim();
    if (value) return value;
  }
  return null;
}

/** Enriquece party BUYER sem telefone com o telefone do cliente (WhatsApp). */
export function enrichBuyerPartyPhone<
  T extends {
    role: string;
    signer_phone?: string | null;
    phone?: string | null;
  },
>(parties: T[], buyerPhone?: string | null): T[] {
  const fallback = String(buyerPhone || '').trim();
  if (!fallback) return parties;

  return parties.map((party) => {
    if (String(party.role || '').toUpperCase() !== 'BUYER') return party;
    const current = String(party.phone || party.signer_phone || '').trim();
    if (current) return party;
    return {
      ...party,
      phone: fallback,
      signer_phone: fallback,
    };
  });
}

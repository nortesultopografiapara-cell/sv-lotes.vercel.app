/**
 * Signatários eletrônicos — modelo ARAGUAIA (isolado).
 * Dois PROMITENTES VENDEDORES PF + BUYER + SPOUSE opcional.
 * R R Negócios NÃO assina.
 */

import { onlyDigits } from '@/lib/inputMasks';
import {
  ARAGUAIA_DEFAULT_SELLERS,
  formatSellerCpfDisplay,
} from '@/lib/projectContractSellers';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/clickToChat';

export type AraguaiaEsignVendor = {
  order: number;
  name: string;
  cpf: string;
  /** Dígitos brutos informados (DDD+número); normalizar via helper WhatsApp. */
  phoneRaw: string;
  email: string | null;
};

/** Contatos confirmados — Daniel mantém e-mail operacional; Aldenise sem e-mail pessoal. */
export const ARAGUAIA_DANIEL_ESIGN_EMAIL = 'rrnegocioseservicos@gmail.com';

export const ARAGUAIA_ESIGN_VENDORS: AraguaiaEsignVendor[] = [
  {
    order: 1,
    name: ARAGUAIA_DEFAULT_SELLERS[0].name,
    cpf: ARAGUAIA_DEFAULT_SELLERS[0].cpf || '820.912.262-20',
    phoneRaw: '94991254320',
    email: ARAGUAIA_DANIEL_ESIGN_EMAIL,
  },
  {
    order: 2,
    name: ARAGUAIA_DEFAULT_SELLERS[1].name,
    cpf: ARAGUAIA_DEFAULT_SELLERS[1].cpf || '856.560.112-91',
    phoneRaw: '94991252923',
    email: null,
  },
];

export function isAraguaiaSaleContractModel(
  model?: string | null,
): boolean {
  const key = String(model || '')
    .trim()
    .toUpperCase();
  return key === 'ARAGUAIA' || key.includes('ARAGUAIA');
}

export function resolveAraguaiaEsignVendorPhone(
  phoneRaw: string,
): string | null {
  return normalizeWhatsAppPhone(phoneRaw);
}

/** Parties VENDOR a criar no envio ARAGUAIA. */
export function buildAraguaiaEsignVendorPartyInputs(): Array<{
  name: string;
  cpf: string;
  phone: string | null;
  email: string | null;
  order: number;
}> {
  return ARAGUAIA_ESIGN_VENDORS.map((v) => ({
    name: v.name,
    cpf: onlyDigits(v.cpf) || v.cpf,
    phone: resolveAraguaiaEsignVendorPhone(v.phoneRaw),
    email: v.email,
    order: v.order,
  }));
}

export function formatAraguaiaEsignVendorCpfDisplay(cpf: string): string {
  return formatSellerCpfDisplay(cpf) || cpf;
}

export function araguaiaVendorCpfDigits(cpf?: string | null): string {
  return onlyDigits(cpf || '');
}

/** VENDOR PF ARAGUAIA conhecido (Daniel / Aldenise) pelo CPF. */
export function findAraguaiaEsignVendorByCpf(
  cpf?: string | null,
): AraguaiaEsignVendor | null {
  const digits = araguaiaVendorCpfDigits(cpf);
  if (!digits) return null;
  return (
    ARAGUAIA_ESIGN_VENDORS.find(
      (v) => araguaiaVendorCpfDigits(v.cpf) === digits,
    ) || null
  );
}

/**
 * E-mail persistido/exibido para VENDOR ARAGUAIA.
 * Aldenise (email configurado NULL): nunca herda buyer/customer/outro.
 * Daniel: mantém e-mail configurado se o submetido for inválido/vazio.
 * Demais VENDORs: sem override.
 */
export function resolveAraguaiaVendorSignerEmail(input: {
  cpf?: string | null;
  submittedEmail?: string | null;
}): string | null | undefined {
  const known = findAraguaiaEsignVendorByCpf(input.cpf);
  if (!known) return undefined;
  if (known.email === null) return null;
  const submitted = String(input.submittedEmail || '')
    .trim()
    .toLowerCase();
  if (submitted.includes('@')) return submitted;
  return known.email;
}

/**
 * Prefill público de e-mail no link de assinatura.
 * VENDOR nunca recebe fallback de customer/buyer.
 */
export function resolveSalePublicSignPrefillEmail(input: {
  partyRole?: string | null;
  partyEmail?: string | null;
  customerEmail?: string | null;
}): string | null {
  const role = String(input.partyRole || '')
    .trim()
    .toUpperCase();
  const partyEmail = String(input.partyEmail || '').trim() || null;
  if (role === 'VENDOR') return partyEmail;
  return (
    partyEmail ||
    String(input.customerEmail || '').trim() ||
    null
  );
}

/** Ordena VENDORs: Daniel (order 1) → Aldenise (order 2) → demais. */
export function sortAraguaiaVendorParties<
  T extends { signer_name?: string | null; signer_cpf?: string | null; created_at?: string },
>(parties: T[]): T[] {
  const orderOf = (p: T): number => {
    const cpf = araguaiaVendorCpfDigits(p.signer_cpf);
    const name = String(p.signer_name || '').toLowerCase();
    const known = ARAGUAIA_ESIGN_VENDORS.find(
      (v) =>
        araguaiaVendorCpfDigits(v.cpf) === cpf ||
        name.includes(v.name.split(' ')[0].toLowerCase()),
    );
    return known?.order ?? 99;
  };
  return [...parties].sort((a, b) => {
    const d = orderOf(a) - orderOf(b);
    if (d !== 0) return d;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

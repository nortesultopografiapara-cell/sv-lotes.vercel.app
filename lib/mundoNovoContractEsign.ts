/**
 * Signatários eletrônicos — modelo MUNDO_NOVO (isolado).
 * Destino: Maria + Adenil VENDOR + BUYER + INTERVENIENT (R R) + WITNESS_1 + WITNESS_2.
 * Sem SPOUSE. Daniel NUNCA é party VENDOR — só representante da INTERVENIENT.
 *
 * NÃO importar lib/araguaia* nem buildAraguaiaEsignVendorPartyInputs.
 */

import { getCpfCnpjValidationState, onlyDigits } from '@/lib/inputMasks';
import { isValidSignerEmail, normalizeSignerEmail } from '@/lib/saleContractEmailValidation';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/clickToChat';
import type { ProjectContractSellerParty } from '@/lib/projectContractSellers';
import { resolveMundoNovoPromitenteVendors } from '@/lib/mundoNovoContractSellers';
import type { SaleSignaturePartyRole } from '@/lib/saleContractSignaturePartyTypes';
import {
  MUNDO_NOVO_ESIGN_DISABLED_MESSAGE,
  shouldEnableMundoNovoEsign,
  type MundoNovoEsignGateInput,
} from '@/lib/mundoNovoEsignGate';

export { MUNDO_NOVO_ESIGN_DISABLED_MESSAGE, shouldEnableMundoNovoEsign };

/** CPF de Daniel Roberto Rivelino de Sousa — proibido como VENDOR no Mundo Novo. */
export const MUNDO_NOVO_FORBIDDEN_VENDOR_CPF_DIGITS = '82091226220';
export const MUNDO_NOVO_FORBIDDEN_VENDOR_NAME =
  'Daniel Roberto Rivelino de Sousa';

export const MUNDO_NOVO_INTERVENIENT_FALLBACK_COMPANY_NAME =
  'R R NEGÓCIOS & SERVIÇOS LTDA';
export const MUNDO_NOVO_INTERVENIENT_FALLBACK_COMPANY_CNPJ = '57.590.706/0001-78';

export const MUNDO_NOVO_MISSING_LEGAL_REPRESENTATIVE_MESSAGE =
  'E-sign Mundo Novo: cadastre o Representante Legal da INTERVENIENTE nas Configurações da empresa (nome e CPF).';

export const MUNDO_NOVO_DANIEL_VENDOR_FORBIDDEN_MESSAGE =
  'E-sign Mundo Novo: Daniel Roberto Rivelino de Sousa não pode ser criado como VENDOR. Ele assina somente como representante da INTERVENIENTE (R R NEGÓCIOS & SERVIÇOS LTDA).';

export class MundoNovoEsignValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MundoNovoEsignValidationError';
  }
}

export type MundoNovoEsignVendorPartyInput = {
  name: string;
  cpf: string;
  phone: string;
  email: string;
  order: number;
};

export type MundoNovoIntervenientSignatureData = {
  party_kind: 'LEGAL_ENTITY';
  company_name: string;
  company_cnpj: string;
  representative_name: string;
  representative_cpf: string;
};

export type MundoNovoIntervenientPartyInput = {
  role: 'INTERVENIENT';
  name: string;
  cnpj: string;
  phone: string | null;
  email: string | null;
  withPublicToken: false;
  signatureData: MundoNovoIntervenientSignatureData;
};

export type MundoNovoWitnessPartyInput = {
  role: 'WITNESS_1' | 'WITNESS_2';
  name: null;
  cpf: null;
  phone: null;
  email: null;
  withPublicToken: true;
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    const s = clean(v);
    if (s) return s;
  }
  return '';
}

export function isMundoNovoSaleContractModel(model?: string | null): boolean {
  const key = String(model || '')
    .trim()
    .toUpperCase();
  return key === 'MUNDO_NOVO' || key.includes('MUNDO_NOVO');
}

export function shouldPersistMundoNovoIntervenientParty(
  params: MundoNovoEsignGateInput = {},
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return shouldEnableMundoNovoEsign(params, env);
}

export function shouldPersistMundoNovoWitnessParties(
  params: MundoNovoEsignGateInput = {},
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return shouldEnableMundoNovoEsign(params, env);
}

export function isMundoNovoForbiddenVendorCpf(cpf?: string | null): boolean {
  return onlyDigits(cpf || '') === MUNDO_NOVO_FORBIDDEN_VENDOR_CPF_DIGITS;
}

export function isMundoNovoForbiddenVendorName(name?: string | null): boolean {
  const key = clean(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return key.includes('daniel roberto rivelino');
}

export function sortMundoNovoVendorParties<T extends { signer_cpf?: string | null; signer_name?: string | null }>(
  parties: T[],
): T[] {
  const rank = (p: T): number => {
    const name = clean(p.signer_name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (name.includes('maria elvira')) return 1;
    if (name.includes('adenil')) return 2;
    return 9;
  };
  return [...parties].sort((a, b) => rank(a) - rank(b));
}

function resolveCompanyLegalRepresentative(company?: Record<string, unknown> | null): {
  name: string;
  cpfDigits: string;
  email: string | null;
  phone: string | null;
  usedCompanySource: boolean;
} {
  const c = company && typeof company === 'object' ? company : {};
  const name = pickString(
    c.legal_representative,
    c.responsible_name,
    c.legal_representative_name,
  );
  const cpfDigits = onlyDigits(
    pickString(
      c.representative_cpf,
      c.responsible_cpf,
      c.legal_representative_cpf,
    ),
  );
  const email =
    pickString(c.legal_representative_email, c.representative_email) || null;
  const phoneRaw = pickString(
    c.legal_representative_phone,
    c.representative_phone,
    c.phone,
  );
  const phone = phoneRaw ? normalizeWhatsAppPhone(phoneRaw) || phoneRaw : null;
  const usedCompanySource = Boolean(name && cpfDigits.length >= 11);
  return {
    name: usedCompanySource ? name : '',
    cpfDigits: usedCompanySource ? cpfDigits : '',
    email: usedCompanySource ? (email ? normalizeSignerEmail(email) : null) : null,
    phone: usedCompanySource ? phone : null,
    usedCompanySource,
  };
}

function resolveIntervenientCompanyIdentity(company?: Record<string, unknown> | null): {
  name: string;
  cnpjDigits: string;
} {
  const c = company && typeof company === 'object' ? company : {};
  const name =
    pickString(c.razao_social, c.legal_name, c.fantasy_name, c.trade_name, c.name) ||
    MUNDO_NOVO_INTERVENIENT_FALLBACK_COMPANY_NAME;
  const cnpjDigits =
    onlyDigits(pickString(c.cnpj, c.document)) ||
    onlyDigits(MUNDO_NOVO_INTERVENIENT_FALLBACK_COMPANY_CNPJ);
  return { name, cnpjDigits };
}

export function formatMundoNovoVendorContactMissingMessage(
  sellers: Array<{ name: string; missing: string[] }>,
): string {
  const lines = sellers
    .filter((s) => s.missing.length > 0)
    .map((s) => `- ${s.name}: falta ${s.missing.join(', ')}`);
  return [
    'E-sign Mundo Novo: cadastre o contato do(s) vendedor(es) no empreendimento antes de enviar.',
    ...lines,
  ].join('\n');
}

function inspectVendorContact(seller: ProjectContractSellerParty): {
  name: string;
  missing: string[];
  cpfDigits: string;
  email: string;
  phone: string;
} {
  const name = clean(seller.name) || 'Vendedor';
  const missing: string[] = [];
  const cpfDigits = onlyDigits(seller.cpf || '');
  const cpfState = getCpfCnpjValidationState(cpfDigits);
  if (!cpfState.isCompleteCpf) missing.push('CPF válido');

  const email = normalizeSignerEmail(seller.email);
  if (!isValidSignerEmail(email)) missing.push('e-mail');

  const phone = normalizeWhatsAppPhone(seller.phone || '') || '';
  if (!phone) missing.push('telefone');

  return { name, missing, cpfDigits, email, phone };
}

export function assertMundoNovoEsignVendorsReady(input: {
  project?: Record<string, unknown> | null;
}): MundoNovoEsignVendorPartyInput[] {
  const sellers = resolveMundoNovoPromitenteVendors({ project: input.project });
  const inspected = sellers.map((s) => ({ seller: s, ...inspectVendorContact(s) }));
  const incomplete = inspected.filter((row) => row.missing.length > 0);
  if (incomplete.length > 0) {
    throw new MundoNovoEsignValidationError(
      formatMundoNovoVendorContactMissingMessage(incomplete),
    );
  }

  const vendors = inspected.map((row, idx) => ({
    name: row.name,
    cpf: row.cpfDigits,
    phone: row.phone,
    email: row.email,
    order: row.seller.order || idx + 1,
  }));

  const daniel = vendors.find(
    (v) =>
      isMundoNovoForbiddenVendorCpf(v.cpf) ||
      isMundoNovoForbiddenVendorName(v.name),
  );
  if (daniel) {
    throw new MundoNovoEsignValidationError(
      MUNDO_NOVO_DANIEL_VENDOR_FORBIDDEN_MESSAGE,
    );
  }

  return vendors;
}

export function buildMundoNovoEsignVendorPartyInputs(input: {
  project?: Record<string, unknown> | null;
}): MundoNovoEsignVendorPartyInput[] {
  return assertMundoNovoEsignVendorsReady(input);
}

export function assertMundoNovoIntervenientReady(input?: {
  company?: Record<string, unknown> | null;
}): string | null {
  const legal = resolveCompanyLegalRepresentative(input?.company);
  if (!legal.usedCompanySource) {
    return MUNDO_NOVO_MISSING_LEGAL_REPRESENTATIVE_MESSAGE;
  }
  return null;
}

export function buildMundoNovoIntervenientSignatureData(input?: {
  company?: Record<string, unknown> | null;
}): MundoNovoIntervenientSignatureData {
  const legalBlock = assertMundoNovoIntervenientReady(input);
  if (legalBlock) {
    throw new MundoNovoEsignValidationError(legalBlock);
  }
  const legal = resolveCompanyLegalRepresentative(input?.company);
  const company = resolveIntervenientCompanyIdentity(input?.company);
  return {
    party_kind: 'LEGAL_ENTITY',
    company_name: company.name,
    company_cnpj: company.cnpjDigits,
    representative_name: legal.name,
    representative_cpf: legal.cpfDigits,
  };
}

export function buildMundoNovoIntervenientPartyInput(input?: {
  company?: Record<string, unknown> | null;
}): MundoNovoIntervenientPartyInput {
  const data = buildMundoNovoIntervenientSignatureData(input);
  const legal = resolveCompanyLegalRepresentative(input?.company);
  return {
    role: 'INTERVENIENT',
    name: data.company_name,
    cnpj: data.company_cnpj,
    phone: legal.phone,
    email: legal.email,
    withPublicToken: false,
    signatureData: data,
  };
}

export function buildMundoNovoWitnessPartyInputs(): MundoNovoWitnessPartyInput[] {
  return [
    {
      role: 'WITNESS_1',
      name: null,
      cpf: null,
      phone: null,
      email: null,
      withPublicToken: true,
    },
    {
      role: 'WITNESS_2',
      name: null,
      cpf: null,
      phone: null,
      email: null,
      withPublicToken: true,
    },
  ];
}

export function buildMundoNovoEsignExpectedPartyRoles(input: {
  project?: Record<string, unknown> | null;
}): SaleSignaturePartyRole[] {
  const vendors = buildMundoNovoEsignVendorPartyInputs(input);
  return [
    ...vendors.map(() => 'VENDOR' as const),
    'BUYER',
    'INTERVENIENT',
    'WITNESS_1',
    'WITNESS_2',
  ];
}

export function readMundoNovoIntervenientFromSignatureData(
  signatureData?: Record<string, unknown> | null,
): MundoNovoIntervenientSignatureData | null {
  if (!signatureData || typeof signatureData !== 'object') return null;
  const companyName = clean(signatureData.company_name);
  const companyCnpj = onlyDigits(String(signatureData.company_cnpj || ''));
  const representativeName = clean(signatureData.representative_name);
  const representativeCpf = onlyDigits(
    String(signatureData.representative_cpf || ''),
  );
  if (!companyName || companyCnpj.length < 14) return null;
  return {
    party_kind: 'LEGAL_ENTITY',
    company_name: companyName,
    company_cnpj: companyCnpj,
    representative_name: representativeName,
    representative_cpf: representativeCpf,
  };
}

export function findDisallowedMundoNovoDanielVendor(parties: Array<{
  role?: string | null;
  signer_name?: string | null;
  signer_cpf?: string | null;
}>): { role: string; name: string; cpf: string } | null {
  for (const party of parties) {
    const role = String(party.role || '').toUpperCase();
    if (role !== 'VENDOR') continue;
    if (
      isMundoNovoForbiddenVendorCpf(party.signer_cpf) ||
      isMundoNovoForbiddenVendorName(party.signer_name)
    ) {
      return {
        role,
        name: clean(party.signer_name),
        cpf: onlyDigits(party.signer_cpf || ''),
      };
    }
  }
  return null;
}

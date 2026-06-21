/**
 * Fonte única de dados da CONTRATANTE para contrato SaaS, PDF, assinatura e painel.
 */

import {
  extractAddressPartsFromCompany,
  formatSaasContractAddress,
} from '@/lib/saasContractAddress';
import {
  contractPartyDigits,
  formatContractPartyDocument,
  resolveCompanyContractDocument,
  resolveSaasContractorParty,
  type SaasContractorParty,
} from '@/lib/saasContractParty';

const PLACEHOLDER_VALUES = new Set([
  'representante legal',
  'responsável',
  'responsavel',
  'responsavel legal',
  'não informado',
  'nao informado',
  '—',
  '-',
]);

export function isSaasContractPlaceholderValue(value?: string | null): boolean {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return true;
  return PLACEHOLDER_VALUES.has(s);
}

/** Corrige typos conhecidos em razão social (ex.: PEOJETOS → PROJETOS). */
export function normalizeSaasContractCompanyName(name?: string | null): string {
  return String(name ?? '')
    .trim()
    .replace(/\bPEOJETOS\b/gi, 'PROJETOS');
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const s = String(value ?? '').trim();
    if (s) return s;
  }
  return '';
}

export type SaasContractCompanyProfile = {
  id?: string;
  name: string;
  documentRaw: string;
  documentFormatted: string;
  documentDigits: string;
  documentLabel: 'CPF' | 'CNPJ';
  party: SaasContractorParty;
  legalRepresentative: string;
  email: string;
  phone: string;
  addressStreet: string;
  addressNeighborhood: string;
  addressCityState: string;
  addressCep?: string;
  addressQualificationInline: string;
};

export function resolveSaasContractLegalRepresentative(
  company: {
    legal_representative?: string | null;
    responsible_name?: string | null;
  },
  party: SaasContractorParty,
): string {
  if (party.isNaturalPerson) return '';

  for (const raw of [company.legal_representative, company.responsible_name]) {
    const value = String(raw ?? '').trim();
    if (!value || isSaasContractPlaceholderValue(value)) continue;
    return value;
  }
  return '';
}

/** Perfil contratual unificado — sempre a partir do cadastro atual da empresa. */
export function resolveSaasContractCompanyProfile(
  company: Record<string, unknown> & {
    id?: string;
    name?: string | null;
    cnpj?: string | null;
    cpf?: string | null;
    document?: string | null;
    legal_representative?: string | null;
    responsible_name?: string | null;
    email?: string | null;
    phone?: string | null;
    telefone?: string | null;
    cep?: string | null;
  },
): SaasContractCompanyProfile {
  const name = normalizeSaasContractCompanyName(pickString(company.name));
  const documentRaw = resolveCompanyContractDocument(company);
  const party = resolveSaasContractorParty(company);
  const legalRepresentative = resolveSaasContractLegalRepresentative(company, party);
  const formattedAddress = formatSaasContractAddress(extractAddressPartsFromCompany(company));

  return {
    id: company.id,
    name,
    documentRaw,
    documentFormatted: party.documentFormatted,
    documentDigits: contractPartyDigits(documentRaw),
    documentLabel: party.documentLabel,
    party,
    legalRepresentative,
    email: pickString(company.email),
    phone: pickString(company.phone, company.telefone),
    addressStreet: formattedAddress.streetLine,
    addressNeighborhood: formattedAddress.neighborhood,
    addressCityState: formattedAddress.cityStateLine,
    addressCep: pickString(company.cep) || undefined,
    addressQualificationInline: formattedAddress.qualificationInline,
  };
}

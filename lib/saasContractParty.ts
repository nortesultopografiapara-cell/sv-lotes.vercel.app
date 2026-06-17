/**
 * Pessoa Física vs Pessoa Jurídica no contrato SaaS.
 */

import { formatContractCnpj } from '@/lib/saasContractFormat';

export type SaasContractPartyType = 'PF' | 'PJ';

export function contractPartyDigits(raw?: string | null): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/** CPF = 11 dígitos; CNPJ = 14 dígitos (ignora máscara). */
export function resolveSaasContractPartyType(document?: string | null): SaasContractPartyType {
  const len = contractPartyDigits(document).length;
  if (len === 11) return 'PF';
  if (len === 14) return 'PJ';
  if (len > 0 && len < 14) return 'PF';
  return 'PJ';
}

export function formatContractCpf(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === 'Não informado' || raw === '—') return raw;
  const digits = contractPartyDigits(raw).slice(0, 11);
  if (digits.length !== 11) return raw;
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

export function formatContractPartyDocument(raw?: string | null): string {
  const type = resolveSaasContractPartyType(raw);
  return type === 'PF' ? formatContractCpf(raw) : formatContractCnpj(raw);
}

export function resolveCompanyContractDocument(company: {
  cnpj?: string | null;
  cpf?: string | null;
  document?: string | null;
}): string {
  const cnpj = String(company.cnpj ?? '').trim();
  const cpf = String(company.cpf ?? '').trim();
  const document = String(company.document ?? '').trim();
  if (cnpj) return cnpj;
  if (cpf) return cpf;
  return document;
}

export type SaasContractorParty = {
  partyType: SaasContractPartyType;
  documentLabel: 'CPF' | 'CNPJ';
  documentFormatted: string;
  documentDigits: string;
  isNaturalPerson: boolean;
  showRepresentative: boolean;
  nameLabel: 'Nome' | 'Empresa';
};

export function resolveSaasContractorParty(
  company: {
    cnpj?: string | null;
    cpf?: string | null;
    document?: string | null;
    name?: string | null;
    legal_representative?: string | null;
    responsible_name?: string | null;
  },
  options?: { responsibleFallback?: string },
): SaasContractorParty {
  const rawDocument = resolveCompanyContractDocument(company);
  const partyType = resolveSaasContractPartyType(rawDocument);
  const isNaturalPerson = partyType === 'PF';

  return {
    partyType,
    documentLabel: isNaturalPerson ? 'CPF' : 'CNPJ',
    documentFormatted: formatContractPartyDocument(rawDocument),
    documentDigits: contractPartyDigits(rawDocument),
    isNaturalPerson,
    showRepresentative: !isNaturalPerson,
    nameLabel: isNaturalPerson ? 'Nome' : 'Empresa',
  };
}

export function buildSaasContractorQualificationText(params: {
  name: string;
  party: SaasContractorParty;
  responsible: string;
  address: string;
  cityState: string;
  cep?: string;
  phone: string;
  email: string;
}): string {
  const { name, party, responsible, address, cityState, cep, phone, email } = params;
  const cepPart = cep ? `, CEP ${cep}` : '';
  const addressBlock = `com endereço em ${address}, ${cityState}${cepPart}, telefone ${phone}, e-mail ${email}`;

  if (party.isNaturalPerson) {
    return (
      `CONTRATANTE: ${name}, inscrito(a) no CPF sob nº ${party.documentFormatted}, ${addressBlock}, ` +
      'doravante denominado(a) simplesmente CONTRATANTE.'
    );
  }

  return (
    `CONTRATANTE: ${name}, inscrita no CNPJ sob nº ${party.documentFormatted}, representada por ${responsible}, ${addressBlock}, ` +
    'doravante denominada simplesmente CONTRATANTE.'
  );
}

export function buildSaasContractorHeaderLine(params: {
  name: string;
  party: SaasContractorParty;
}): string {
  if (params.party.isNaturalPerson) {
    return `CONTRATANTE: ${params.name} — CPF ${params.party.documentFormatted}`;
  }
  return `CONTRATANTE: ${params.name} — CNPJ ${params.party.documentFormatted}`;
}

export function resolveSaasContractRepresentative(
  company: {
    legal_representative?: string | null;
    responsible_name?: string | null;
  },
  party: SaasContractorParty,
): string {
  if (party.isNaturalPerson) return '';
  const rep = String(company.legal_representative || company.responsible_name || '').trim();
  return rep || 'Representante legal';
}

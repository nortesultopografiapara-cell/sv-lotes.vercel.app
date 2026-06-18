/**
 * Perfil cadastral do contrato Recanto Primavera — somente Configurações → Empresa.
 */

import { formatRecantoPhone, formatRecantoCep } from '@/lib/recantoPrimaveraContractFormat';

export type RecantoPrimaveraCompanyProfile = {
  vendorName: string;
  nationality: string;
  maritalStatus: string;
  profession: string;
  rg: string;
  rgIssuer: string;
  documentRaw: string;
  documentFmt: string;
  documentLabel: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  logoUrl: string;
  signatureUrl: string;
  bankName: string;
  bankBranch: string;
  bankAccount: string;
  bankPix: string;
  bankBeneficiary: string;
};

const EMPTY_TOKENS = new Set([
  '',
  'undefined',
  'null',
  'nan',
  'n/a',
  'na',
  '-',
  '—',
  'não informado',
  'nao informado',
]);

export function sanitizeContractField(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isNaN(value)) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (EMPTY_TOKENS.has(text.toLowerCase())) return '';
  return text;
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const clean = sanitizeContractField(value);
    if (clean) return clean;
  }
  return '';
}

function formatCNPJCPF(val: string): string {
  const numeric = val.replace(/\D/g, '');
  if (numeric.length === 14) {
    return numeric.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5',
    );
  }
  if (numeric.length === 11) {
    return numeric.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return val;
}

/** 11 dígitos → CPF; 14 dígitos → CNPJ. */
export function resolveContractDocumentLabel(documentRaw: string): string {
  const digits = documentRaw.replace(/\D/g, '');
  if (digits.length === 11) return 'CPF';
  if (digits.length === 14) return 'CNPJ';
  return 'CPF/CNPJ';
}

function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase())
    .replace(/\bS\/n\b/g, 'S/N');
}

export function normalizeRecantoPrimaveraCompanyProfile(
  company: Record<string, unknown> | null | undefined,
): RecantoPrimaveraCompanyProfile {
  const c = company && typeof company === 'object' ? company : {};

  const vendorName = toTitleCase(
    pickString(c.fantasy_name, c.name, c.legal_representative),
  );
  const documentRaw = pickString(c.cnpj, c.document);
  const documentFmt = documentRaw ? formatCNPJCPF(documentRaw) : '';
  const documentLabel = resolveContractDocumentLabel(documentRaw);

  return {
    vendorName,
    nationality: pickString(c.contract_legal_nationality, 'Brasileira'),
    maritalStatus: toTitleCase(pickString(c.contract_legal_marital_status)),
    profession: toTitleCase(pickString(c.contract_legal_profession)),
    rg: pickString(c.contract_legal_rg, c.representative_rg),
    rgIssuer: pickString(c.contract_legal_rg_issuer),
    documentRaw,
    documentFmt,
    documentLabel,
    phone: formatRecantoPhone(pickString(c.contract_legal_phone, c.phone)),
    email: pickString(c.contract_legal_email, c.email),
    address: toTitleCase(
      pickString(c.contract_legal_address, c.address, c.endereco),
    ),
    city: toTitleCase(pickString(c.city, c.cidade)),
    state: pickString(c.state, c.uf).toUpperCase(),
    zip: formatRecantoCep(pickString(c.zip_code, c.cep)),
    logoUrl: pickString(c.logo_url),
    signatureUrl: pickString(c.signature_url),
    bankName: pickString(c.contract_bank_name),
    bankBranch: pickString(c.contract_bank_branch),
    bankAccount: pickString(c.contract_bank_account),
    bankPix: pickString(c.contract_bank_pix),
    bankBeneficiary: toTitleCase(pickString(c.contract_bank_beneficiary, c.fantasy_name, c.name)),
  };
}

export function buildRecantoVendorFieldLine(
  label: string,
  value: string,
): string {
  const clean = sanitizeContractField(value);
  if (!clean) return '';
  return `<p style="margin: 0 0 4px 0;"><strong>${label}:</strong> ${clean}</p>`;
}

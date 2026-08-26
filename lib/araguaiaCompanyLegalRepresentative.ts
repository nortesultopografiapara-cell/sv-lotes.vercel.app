/**
 * Representante Legal da company — fonte do PROMITENTE VENDEDOR ARAGUAIA
 * e do representante da INTERVENIENTE (Configurações da empresa).
 *
 * Campos persistidos pela UI (CompanySettingsV2Shell):
 * - legal_representative
 * - representative_cpf
 * - legal_representative_email
 * - legal_representative_phone
 * - legal_representative_role
 * - contract_legal_rg / contract_legal_rg_issuer / contract_legal_rg_uf
 * - contract_legal_nationality / contract_legal_marital_status / contract_legal_profession
 * - legal_representative_address (residência pessoal; NÃO é sede)
 *
 * Path V2 e V1 com Representante Legal cadastrado: Configurações
 * (sem sobrescrever por ARAGUAIA_DEFAULT_SELLERS).
 */

import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import {
  ARAGUAIA_DEFAULT_SELLERS,
  type ProjectContractSellerParty,
  resolveProjectContractSellers,
} from '@/lib/projectContractSellers';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/clickToChat';
import {
  ARAGUAIA_MISSING_LEGAL_REPRESENTATIVE_MESSAGE,
  isContractSecondVendorComplete,
  parseContractSecondVendorJson,
} from '@/lib/contractSecondVendor';

export type AraguaiaCompanyLegalRepresentative = {
  name: string;
  cpfDisplay: string;
  cpfDigits: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  /** true quando nome + CPF vieram do cadastro da company. */
  usedCompanySource: boolean;
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

export function composeAraguaiaConfiguredRg(input: {
  rg?: string | null;
  rgIssuer?: string | null;
  rgUf?: string | null;
}): string | null {
  const rgNum = clean(input.rg);
  if (!rgNum) return null;
  const rgIssuer = clean(input.rgIssuer);
  const rgUf = clean(input.rgUf).toUpperCase();
  let rg = rgIssuer ? `${rgNum}-${rgIssuer}` : rgNum;
  if (rgUf && !rg.toUpperCase().endsWith(`/${rgUf}`)) {
    rg = `${rg}/${rgUf}`;
  }
  return rg;
}

/**
 * Lê Representante Legal da company (mesmos campos da tela de Configurações).
 */
export function resolveAraguaiaCompanyLegalRepresentative(
  company?: Record<string, unknown> | null,
): AraguaiaCompanyLegalRepresentative {
  const c = company && typeof company === 'object' ? company : {};
  const name = pickString(
    c.legal_representative,
    c.responsible_name,
    c.legal_representative_name,
  );
  const cpfRaw = pickString(
    c.representative_cpf,
    c.responsible_cpf,
    c.legal_representative_cpf,
  );
  const cpfDigits = onlyDigits(cpfRaw);
  const email =
    pickString(c.legal_representative_email, c.representative_email) || null;
  const phoneRaw = pickString(
    c.legal_representative_phone,
    c.representative_phone,
    c.phone,
  );
  const phone = phoneRaw ? normalizeWhatsAppPhone(phoneRaw) || phoneRaw : null;
  const role = pickString(c.legal_representative_role) || null;
  const usedCompanySource = Boolean(name && cpfDigits.length >= 11);

  return {
    name: usedCompanySource ? name : '',
    cpfDisplay: usedCompanySource
      ? formatCpfCnpj(cpfDigits) || cpfRaw || cpfDigits
      : '',
    cpfDigits: usedCompanySource ? cpfDigits : '',
    email: usedCompanySource ? email : null,
    phone: usedCompanySource ? phone : null,
    role: usedCompanySource ? role : null,
    usedCompanySource,
  };
}

function buildVendor1FromLegalRep(
  company?: Record<string, unknown> | null,
): ProjectContractSellerParty | null {
  const legal = resolveAraguaiaCompanyLegalRepresentative(company);
  if (!legal.usedCompanySource) return null;
  const c = company || {};
  const rg = composeAraguaiaConfiguredRg({
    rg: pickString(c.contract_legal_rg),
    rgIssuer: pickString(c.contract_legal_rg_issuer),
    rgUf: pickString(c.contract_legal_rg_uf),
  });

  return {
    role: 'PROMITENTE_VENDEDOR',
    order: 1,
    name: legal.name,
    cpf: legal.cpfDisplay || legal.cpfDigits,
    address: pickString(c.legal_representative_address) || null,
    nationality: pickString(c.contract_legal_nationality) || null,
    maritalStatus: pickString(c.contract_legal_marital_status) || null,
    profession: pickString(c.contract_legal_profession) || null,
    rg,
  };
}

function buildVendor2FromSecondJson(
  company?: Record<string, unknown> | null,
): ProjectContractSellerParty | null {
  const fields = parseContractSecondVendorJson(
    company?.contract_second_vendor_json,
  );
  if (!isContractSecondVendorComplete(fields)) return null;
  const rg = composeAraguaiaConfiguredRg({
    rg: fields.rg,
    rgIssuer: fields.rgIssuer,
    rgUf: fields.rgUf,
  });

  return {
    role: 'PROMITENTE_VENDEDOR',
    order: 2,
    name: fields.name,
    cpf: fields.cpf,
    address: clean(fields.address) || null,
    nationality: clean(fields.nationality) || null,
    maritalStatus: clean(fields.maritalStatus) || null,
    profession: clean(fields.profession) || null,
    rg,
  };
}

export type ResolveCompanyContractVendorsResult = {
  vendors: ProjectContractSellerParty[];
  vendor1: ProjectContractSellerParty | null;
  vendor2: ProjectContractSellerParty | null;
  error: string | null;
};

/**
 * Vendedores a partir das Configurações:
 * Vendedor 1 = Representante Legal (obrigatório).
 * Vendedor 2 = contract_second_vendor_json se completo.
 * Sem sede da empresa como residência. Sem fallback cargo → profissão.
 */
export function resolveCompanyContractVendors(input?: {
  company?: Record<string, unknown> | null;
}): ResolveCompanyContractVendorsResult {
  const vendor1 = buildVendor1FromLegalRep(input?.company);
  if (!vendor1) {
    return {
      vendors: [],
      vendor1: null,
      vendor2: null,
      error: ARAGUAIA_MISSING_LEGAL_REPRESENTATIVE_MESSAGE,
    };
  }
  const vendor2 = buildVendor2FromSecondJson(input?.company);
  return {
    vendors: vendor2 ? [vendor1, vendor2] : [vendor1],
    vendor1,
    vendor2,
    error: null,
  };
}

/**
 * PROMITENTES VENDEDORES do contrato ARAGUAIA.
 *
 * mode 'v2' (ARAGUAIA e-sign V2):
 *   Representante Legal + Segundo Promitente opcional.
 *   seller_parties_json NÃO sobrescreve. Sem fallback Daniel/Aldenise.
 *
 * mode 'legacy' (default / V1):
 *   1. Configurações (Representante Legal + contract_second_vendor_json);
 *   2. projects.seller_parties_json;
 *   3. ARAGUAIA_DEFAULT_SELLERS (último fallback).
 */
export function resolveAraguaiaPromitenteVendors(input?: {
  company?: Record<string, unknown> | null;
  project?: Record<string, unknown> | null;
  contractModel?: string | null;
  /** 'v2' = path ARAGUAIA e-sign V2 (Configurações). */
  mode?: 'legacy' | 'v2';
}): ProjectContractSellerParty[] {
  const fromSettings = resolveCompanyContractVendors({ company: input?.company });
  if (fromSettings.vendor1) {
    return fromSettings.vendors;
  }

  if (input?.mode === 'v2') {
    return [];
  }

  const fromProject = resolveProjectContractSellers({
    project: input?.project,
    contractModel: 'ARAGUAIA',
    allowAraguaiaDefault: false,
  });
  if (fromProject.length > 0) {
    return fromProject;
  }

  const model = String(input?.contractModel || '')
    .trim()
    .toUpperCase();
  if (model === 'ARAGUAIA' || model.includes('ARAGUAIA') || !input?.contractModel) {
    return ARAGUAIA_DEFAULT_SELLERS.map((s) => ({ ...s }));
  }
  return [];
}

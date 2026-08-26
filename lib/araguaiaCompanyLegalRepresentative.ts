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
 *
 * Path V2: resolveCompanyContractVendors (sem seller_parties_json / sem Daniel-Aldenise).
 */

import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import { formatAraguaiaSeatAddressFromCompany } from '@/lib/araguaiaContractQualification';
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

function companyAddress(company?: Record<string, unknown> | null): string {
  return formatAraguaiaSeatAddressFromCompany(company);
}

function buildVendor1FromLegalRep(
  company?: Record<string, unknown> | null,
): ProjectContractSellerParty | null {
  const legal = resolveAraguaiaCompanyLegalRepresentative(company);
  if (!legal.usedCompanySource) return null;
  const c = company || {};
  const rgNum = pickString(c.contract_legal_rg);
  const rgIssuer = pickString(c.contract_legal_rg_issuer);
  const rg =
    rgNum && rgIssuer
      ? `${rgNum}-${rgIssuer}`
      : rgNum || null;

  return {
    role: 'PROMITENTE_VENDEDOR',
    order: 1,
    name: legal.name,
    cpf: legal.cpfDisplay || legal.cpfDigits,
    address: companyAddress(company),
    nationality: pickString(c.contract_legal_nationality) || null,
    maritalStatus: pickString(c.contract_legal_marital_status) || null,
    profession:
      pickString(c.contract_legal_profession) || legal.role || null,
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
  const rgNum = clean(fields.rg);
  const rgIssuer = clean(fields.rgIssuer);
  const rgUf = clean(fields.rgUf);
  let rg: string | null = null;
  if (rgNum) {
    rg = rgIssuer ? `${rgNum}-${rgIssuer}` : rgNum;
    if (rgUf) rg = `${rg}/${rgUf}`;
  }

  return {
    role: 'PROMITENTE_VENDEDOR',
    order: 2,
    name: fields.name,
    cpf: fields.cpf,
    address: clean(fields.address) || companyAddress(company),
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
 * Vendedores do path ARAGUAIA V2:
 * Vendedor 1 = Representante Legal (obrigatório).
 * Vendedor 2 = contract_second_vendor_json se completo.
 * NÃO usa seller_parties_json nem ARAGUAIA_DEFAULT_SELLERS.
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
 *   1. projects.seller_parties_json;
 *   2. Representante Legal;
 *   3. ARAGUAIA_DEFAULT_SELLERS.
 */
export function resolveAraguaiaPromitenteVendors(input?: {
  company?: Record<string, unknown> | null;
  project?: Record<string, unknown> | null;
  contractModel?: string | null;
  /** 'v2' = path ARAGUAIA e-sign V2 (Configurações). */
  mode?: 'legacy' | 'v2';
}): ProjectContractSellerParty[] {
  if (input?.mode === 'v2') {
    return resolveCompanyContractVendors({ company: input.company }).vendors;
  }

  const fromProject = resolveProjectContractSellers({
    project: input?.project,
    contractModel: 'ARAGUAIA',
    allowAraguaiaDefault: false,
  });
  if (fromProject.length > 0) {
    return fromProject;
  }

  const fromLegal = buildVendor1FromLegalRep(input?.company);
  if (fromLegal) {
    return [fromLegal];
  }

  const model = String(input?.contractModel || '')
    .trim()
    .toUpperCase();
  if (model === 'ARAGUAIA' || model.includes('ARAGUAIA') || !input?.contractModel) {
    return ARAGUAIA_DEFAULT_SELLERS.map((s) => ({ ...s }));
  }
  return [];
}

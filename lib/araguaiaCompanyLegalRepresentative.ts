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
 */

import { formatCpfCnpj, onlyDigits } from '@/lib/inputMasks';
import {
  ARAGUAIA_DEFAULT_SELLERS,
  ARAGUAIA_SELLERS_ADDRESS,
  type ProjectContractSellerParty,
  resolveProjectContractSellers,
} from '@/lib/projectContractSellers';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/clickToChat';

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

/**
 * PROMITENTES VENDEDORES do contrato ARAGUAIA.
 *
 * Prioridade:
 * 1. `projects.seller_parties_json` (empreendimento explícito);
 * 2. Representante Legal da company (Configurações);
 * 3. fallback legado ARAGUAIA_DEFAULT_SELLERS (somente sem company/projeto).
 */
export function resolveAraguaiaPromitenteVendors(input?: {
  company?: Record<string, unknown> | null;
  project?: Record<string, unknown> | null;
  contractModel?: string | null;
}): ProjectContractSellerParty[] {
  const fromProject = resolveProjectContractSellers({
    project: input?.project,
    contractModel: 'ARAGUAIA',
    allowAraguaiaDefault: false,
  });
  if (fromProject.length > 0) {
    return fromProject;
  }

  const legal = resolveAraguaiaCompanyLegalRepresentative(input?.company);
  if (legal.usedCompanySource) {
    const company = input?.company || {};
    const address =
      pickString(company.address, company.endereco) || ARAGUAIA_SELLERS_ADDRESS;
    return [
      {
        role: 'PROMITENTE_VENDEDOR',
        order: 1,
        name: legal.name,
        cpf: legal.cpfDisplay || legal.cpfDigits,
        address,
        nationality: null,
        maritalStatus: null,
        profession: legal.role || null,
        rg: null,
      },
    ];
  }

  const model = String(input?.contractModel || '')
    .trim()
    .toUpperCase();
  if (model === 'ARAGUAIA' || model.includes('ARAGUAIA') || !input?.contractModel) {
    return ARAGUAIA_DEFAULT_SELLERS.map((s) => ({ ...s }));
  }
  return [];
}

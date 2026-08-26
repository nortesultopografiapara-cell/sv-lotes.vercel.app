/**
 * Colunas e payload de save — Configurações da Empresa.
 */

import { normalizeSaleContractModel } from '@/lib/contractModel';
import {
  extractAddressPartsFromCompany,
  formatSaasContractAddress,
} from '@/lib/saasContractAddress';
import { isSaasContractPlaceholderValue } from '@/lib/saasContractCompanyProfile';
import { normalizeContractSecondVendorForSave } from '@/lib/contractSecondVendor';

/**
 * Colunas base — idênticas à lista funcional pré-v2 (COMPANY_TECHNICAL_COLUMNS).
 * Não incluir `cpf`: companies usa `cnpj` (PF armazena CPF em cnpj).
 */
export const COMPANY_SETTINGS_COLUMNS_BASE =
  'id, name, fantasy_name, cnpj, phone, email, address, city, state, zip_code, legal_representative, representative_cpf, logo_url, signature_url, contract_model, contract_legal_nationality, contract_legal_marital_status, contract_legal_profession, contract_legal_rg, contract_legal_rg_issuer, contract_legal_phone, contract_legal_email, contract_legal_address, contract_enterprise_name, contract_enterprise_location, contract_enterprise_municipality, contract_enterprise_uf, contract_forum_city, contract_bank_name, contract_bank_branch, contract_bank_account, contract_bank_pix, contract_bank_beneficiary, technical_responsible_name, technical_responsible_role, technical_responsible_crea, technical_responsible_cau, technical_responsible_cft, technical_responsible_cpf, technical_responsible_phone, technical_responsible_email, technical_signature_url, technical_stamp_url';

/** Colunas extras v2 — nullable; fallback para BASE se migration ausente. */
export const COMPANY_SETTINGS_COLUMNS_EXTENDED_CORE =
  'cep, created_at, bairro, company_stamp_url, legal_representative_role, legal_representative_email, legal_representative_phone, use_technical_as_legal_rep, settings_layout';

/** Qualificação civil do Representante Legal (RG UF + residência pessoal). */
export const COMPANY_SETTINGS_LEGAL_QUAL_COLUMNS =
  'contract_legal_rg_uf, legal_representative_address';

export const COMPANY_SETTINGS_COLUMNS_EXTENDED = `${COMPANY_SETTINGS_COLUMNS_EXTENDED_CORE}, ${COMPANY_SETTINGS_LEGAL_QUAL_COLUMNS}`;

/** Coluna Etapa 8.4 — nullable; select separado se migration ainda não aplicada. */
export const COMPANY_SETTINGS_SECOND_VENDOR_COLUMN = 'contract_second_vendor_json';

export const COMPANY_SETTINGS_COLUMNS = `${COMPANY_SETTINGS_COLUMNS_BASE}, ${COMPANY_SETTINGS_COLUMNS_EXTENDED}, ${COMPANY_SETTINGS_SECOND_VENDOR_COLUMN}`;

export const COMPANY_SETTINGS_COLUMNS_WITHOUT_SECOND_VENDOR = `${COMPANY_SETTINGS_COLUMNS_BASE}, ${COMPANY_SETTINGS_COLUMNS_EXTENDED}`;

export const COMPANY_SETTINGS_COLUMNS_WITHOUT_LEGAL_QUAL = `${COMPANY_SETTINGS_COLUMNS_BASE}, ${COMPANY_SETTINGS_COLUMNS_EXTENDED_CORE}, ${COMPANY_SETTINGS_SECOND_VENDOR_COLUMN}`;

export const COMPANY_SETTINGS_COLUMNS_EXTENDED_CORE_ONLY = `${COMPANY_SETTINGS_COLUMNS_BASE}, ${COMPANY_SETTINGS_COLUMNS_EXTENDED_CORE}`;

export type TechnicalResponsibleFormState = {
  name: string;
  title: string;
  crea: string;
  cau: string;
  cft: string;
  cpf: string;
  phone: string;
  email: string;
  signature_url: string;
  stamp_url: string;
};

export function technicalFromCompanyRow(data: Record<string, unknown>): TechnicalResponsibleFormState {
  return {
    name: String(data.technical_responsible_name || '').trim(),
    title: String(data.technical_responsible_role || '').trim(),
    crea: String(data.technical_responsible_crea || '').trim(),
    cau: String(data.technical_responsible_cau || '').trim(),
    cft: String(data.technical_responsible_cft || '').trim(),
    cpf: String(data.technical_responsible_cpf || '').trim(),
    phone: String(data.technical_responsible_phone || '').trim(),
    email: String(data.technical_responsible_email || '').trim(),
    signature_url: String(data.technical_signature_url || '').trim(),
    stamp_url: String(data.technical_stamp_url || '').trim(),
  };
}

export function normalizeCompanyAddressForSave(company: Record<string, unknown>): {
  address: string;
  city: string;
  state: string;
  zip_code: string;
} {
  const formatted = formatSaasContractAddress(extractAddressPartsFromCompany(company));
  const cep = String(company.zip_code || company.cep || '').trim();
  return {
    address: formatted.streetLine,
    city: String(company.city || '').trim(),
    state: String(company.state || '').trim().toUpperCase(),
    zip_code: cep,
  };
}

export function resolveLegalRepresentativeForSave(
  company: Record<string, unknown>,
  technical: TechnicalResponsibleFormState,
): {
  legal_representative: string | null;
  representative_cpf: string | null;
  legal_representative_role: string | null;
  legal_representative_email: string | null;
  legal_representative_phone: string | null;
  use_technical_as_legal_rep: boolean;
} {
  const useTechnical = Boolean(company.use_technical_as_legal_rep);

  if (useTechnical) {
    return {
      legal_representative: technical.name.trim() || null,
      representative_cpf: technical.cpf.trim() || null,
      legal_representative_role: technical.title.trim() || null,
      legal_representative_email: technical.email.trim() || null,
      legal_representative_phone: technical.phone.trim() || null,
      use_technical_as_legal_rep: true,
    };
  }

  const name = String(company.legal_representative ?? '').trim();
  const cpf = String(company.representative_cpf ?? '').trim();
  const role = String(company.legal_representative_role ?? '').trim();
  const email = String(company.legal_representative_email ?? '').trim();
  const phone = String(company.legal_representative_phone ?? '').trim();

  return {
    legal_representative: isSaasContractPlaceholderValue(name) ? null : name || null,
    representative_cpf: cpf || null,
    legal_representative_role: role || null,
    legal_representative_email: email || null,
    legal_representative_phone: phone || null,
    use_technical_as_legal_rep: false,
  };
}

export function buildCompanySettingsSavePayload(
  company: Record<string, unknown>,
  technical: TechnicalResponsibleFormState,
  options?: { normalizeAddress?: boolean; syncNameFromFantasy?: boolean },
):
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string } {
  const addressNorm = options?.normalizeAddress
    ? normalizeCompanyAddressForSave(company)
    : {
        address: String(company.address ?? '').trim(),
        city: String(company.city ?? '').trim(),
        state: String(company.state ?? '').trim(),
        zip_code: String(company.zip_code ?? company.cep ?? '').trim(),
      };
  const legalRep = resolveLegalRepresentativeForSave(company, technical);
  const signatureUrl =
    (technical.signature_url || company.technical_signature_url || '').toString().trim() || null;
  const stampUrl =
    (technical.stamp_url || company.technical_stamp_url || '').toString().trim() || null;

  const secondVendor = normalizeContractSecondVendorForSave(
    company.contract_second_vendor_json,
  );
  if (!secondVendor.ok) {
    return { ok: false, error: secondVendor.error };
  }

  return {
    ok: true,
    payload: {
      ...(options?.syncNameFromFantasy
        ? { name: String(company.fantasy_name || company.name || '').trim() || company.name }
        : {}),
      fantasy_name: company.fantasy_name,
      phone: company.phone,
      email: company.email,
      address: addressNorm.address,
      city: addressNorm.city,
      state: addressNorm.state,
      zip_code: addressNorm.zip_code,
      bairro: String(company.bairro ?? '').trim() || null,
      ...legalRep,
      logo_url: company.logo_url,
      signature_url: company.signature_url,
      company_stamp_url: company.company_stamp_url || null,
      contract_model: normalizeSaleContractModel(company.contract_model as string),
      contract_legal_nationality: company.contract_legal_nationality || null,
      contract_legal_marital_status: company.contract_legal_marital_status || null,
      contract_legal_profession: company.contract_legal_profession || null,
      contract_legal_rg: company.contract_legal_rg || null,
      contract_legal_rg_issuer: company.contract_legal_rg_issuer || null,
      contract_legal_rg_uf: String(company.contract_legal_rg_uf ?? '')
        .trim()
        .toUpperCase() || null,
      contract_legal_phone: company.contract_legal_phone || null,
      contract_legal_email: company.contract_legal_email || null,
      contract_legal_address: company.contract_legal_address || null,
      legal_representative_address:
        String(company.legal_representative_address ?? '').trim() || null,
      contract_second_vendor_json: secondVendor.value,
      contract_bank_name: company.contract_bank_name || null,
      contract_bank_branch: company.contract_bank_branch || null,
      contract_bank_account: company.contract_bank_account || null,
      contract_bank_pix: company.contract_bank_pix || null,
      contract_bank_beneficiary: company.contract_bank_beneficiary || null,
      technical_responsible_name: technical.name.trim() || null,
      technical_responsible_role: technical.title.trim() || null,
      technical_responsible_crea: technical.crea.trim() || null,
      technical_responsible_cau: technical.cau.trim() || null,
      technical_responsible_cft: technical.cft.trim() || null,
      technical_responsible_cpf: technical.cpf.trim() || null,
      technical_responsible_phone: technical.phone.trim() || null,
      technical_responsible_email: technical.email.trim() || null,
      technical_signature_url: signatureUrl,
      technical_stamp_url: stampUrl,
    },
  };
}

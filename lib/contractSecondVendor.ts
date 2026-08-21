/**
 * Segundo Promitente Vendedor — companies.contract_second_vendor_json
 * Helper central de parse/validação/save (não espalhar parsing JSON).
 *
 * Resolução de vendedores V2: resolveCompanyContractVendors
 * (reexportado de araguaiaCompanyLegalRepresentative).
 */

import { formatCpfCnpj, getCpfCnpjValidationState, onlyDigits } from '@/lib/inputMasks';
import { isValidSignerEmail, normalizeSignerEmail } from '@/lib/saleContractEmailValidation';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/clickToChat';

export const CONTRACT_SECOND_VENDOR_EMPTY: ContractSecondVendorFields = {
  name: '',
  cpf: '',
  rg: '',
  rgIssuer: '',
  rgUf: '',
  nationality: '',
  maritalStatus: '',
  profession: '',
  email: '',
  phone: '',
  address: '',
};

export type ContractSecondVendorFields = {
  name: string;
  cpf: string;
  rg: string;
  rgIssuer: string;
  rgUf: string;
  nationality: string;
  maritalStatus: string;
  profession: string;
  email: string;
  phone: string;
  address: string;
};

export const ARAGUAIA_MISSING_LEGAL_REPRESENTATIVE_MESSAGE =
  'Cadastre o Representante Legal da empresa em Configurações.';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function pickClean(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = clean(obj[k]);
    if (v) return v;
  }
  return '';
}

export function emptyContractSecondVendorFields(): ContractSecondVendorFields {
  return { ...CONTRACT_SECOND_VENDOR_EMPTY };
}

export function isContractSecondVendorFieldsEmpty(
  fields: ContractSecondVendorFields,
): boolean {
  return Object.values(fields).every((v) => !clean(v));
}

/**
 * Parse jsonb / objeto / string → campos tipados (sempre strings).
 * NULL/inválido → campos vazios (não lança).
 */
export function parseContractSecondVendorJson(
  raw: unknown,
): ContractSecondVendorFields {
  if (raw == null || raw === '') {
    return emptyContractSecondVendorFields();
  }
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return emptyContractSecondVendorFields();
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyContractSecondVendorFields();
  }
  const o = parsed as Record<string, unknown>;
  return {
    name: pickClean(o, 'name', 'nome'),
    cpf: pickClean(o, 'cpf'),
    rg: pickClean(o, 'rg'),
    rgIssuer: pickClean(o, 'rgIssuer', 'rg_issuer', 'orgaoEmissor'),
    rgUf: pickClean(o, 'rgUf', 'rg_uf'),
    nationality: pickClean(o, 'nationality', 'nacionalidade'),
    maritalStatus: pickClean(o, 'maritalStatus', 'marital_status', 'estadoCivil'),
    profession: pickClean(o, 'profession', 'profissao'),
    email: pickClean(o, 'email'),
    phone: pickClean(o, 'phone', 'telefone', 'whatsapp'),
    address: pickClean(o, 'address', 'endereco'),
  };
}

/** Nome + CPF completo (11 dígitos) — critério de Vendedor 2 ativo. */
export function isContractSecondVendorComplete(
  fields: ContractSecondVendorFields | null | undefined,
): boolean {
  if (!fields) return false;
  const name = clean(fields.name);
  const cpfState = getCpfCnpjValidationState(fields.cpf);
  return Boolean(name) && cpfState.isCompleteCpf;
}

/**
 * Normaliza para save em companies.contract_second_vendor_json.
 * Tudo vazio → null.
 * Nome + CPF válido → objeto limpo.
 * Parcial / CPF inválido / e-mail ou telefone inválidos quando preenchidos → erro.
 */
export function normalizeContractSecondVendorForSave(
  input: unknown,
):
  | { ok: true; value: ContractSecondVendorFields | null }
  | { ok: false; error: string } {
  const fields = parseContractSecondVendorJson(input);

  if (isContractSecondVendorFieldsEmpty(fields)) {
    return { ok: true, value: null };
  }

  const name = clean(fields.name);
  const cpfState = getCpfCnpjValidationState(fields.cpf);

  if (!name || !cpfState.isCompleteCpf) {
    return {
      ok: false,
      error:
        'Segundo Promitente Vendedor: informe nome completo e CPF válido, ou deixe todos os campos vazios.',
    };
  }

  const emailRaw = clean(fields.email);
  if (emailRaw && !isValidSignerEmail(emailRaw)) {
    return {
      ok: false,
      error: 'Segundo Promitente Vendedor: informe um e-mail válido ou deixe em branco.',
    };
  }

  const phoneRaw = clean(fields.phone);
  let phone = '';
  if (phoneRaw) {
    const normalized = normalizeWhatsAppPhone(phoneRaw);
    if (!normalized) {
      return {
        ok: false,
        error:
          'Segundo Promitente Vendedor: informe um telefone/WhatsApp válido ou deixe em branco.',
      };
    }
    phone = normalized;
  }

  const cpfDigits = onlyDigits(fields.cpf).slice(0, 11);
  const value: ContractSecondVendorFields = {
    name,
    cpf: formatCpfCnpj(cpfDigits) || cpfDigits,
    rg: clean(fields.rg),
    rgIssuer: clean(fields.rgIssuer),
    rgUf: clean(fields.rgUf).toUpperCase(),
    nationality: clean(fields.nationality),
    maritalStatus: clean(fields.maritalStatus),
    profession: clean(fields.profession),
    email: emailRaw ? normalizeSignerEmail(emailRaw) : '',
    phone,
    address: clean(fields.address),
  };

  return { ok: true, value };
}

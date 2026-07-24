/**
 * Campos de cônjuge vinculados à venda (sale_spouse_*).
 * Fonte de verdade: venda + dados preenchidos — não o estado civil do comprador.
 */

import { onlyDigits } from '@/lib/inputMasks';

export const SALE_SPOUSE_DB_FIELDS = [
  'sale_spouse_name',
  'sale_spouse_nationality',
  'sale_spouse_marital_status',
  'sale_spouse_profession',
  'sale_spouse_rg',
  'sale_spouse_rg_issuer',
  'sale_spouse_cpf',
  'sale_spouse_phone',
  'sale_spouse_email',
  'sale_spouse_address',
] as const;

export type SaleSpouseDbField = (typeof SALE_SPOUSE_DB_FIELDS)[number];

export type SaleSpouseFormFields = {
  has_spouse: boolean;
  sale_spouse_name: string;
  sale_spouse_nationality: string;
  sale_spouse_marital_status: string;
  sale_spouse_profession: string;
  sale_spouse_rg: string;
  sale_spouse_rg_issuer: string;
  sale_spouse_cpf: string;
  sale_spouse_phone: string;
  sale_spouse_email: string;
  sale_spouse_address: string;
};

export type RecantoSpouseSource = {
  name: string;
  nationality: string;
  maritalStatus: string;
  profession: string;
  rg: string;
  rgIssuer: string;
  cpf: string;
  phone: string;
  email: string;
  address: string;
};

export type SaleSpouseContextPerson = {
  name: string;
  cpf: string;
  rg?: string;
  issuer?: string;
  nationality?: string;
  maritalStatus?: string;
  profession?: string;
  email?: string;
  phone?: string;
  address?: string;
};

export type SaleSpouseContext = {
  hasSpouse: boolean;
  spouse: SaleSpouseContextPerson | null;
};

function clean(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || text === 'undefined' || text === 'null') return '';
  return text;
}

/** Interpreta has_spouse da UI/API: true / false / ausente (null). */
export function parseSaleHasSpouseFlag(
  value: unknown,
): boolean | null {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'sim' || normalized === 'yes') {
      return true;
    }
    if (
      normalized === 'false' ||
      normalized === 'nao' ||
      normalized === 'não' ||
      normalized === 'no' ||
      normalized === '0'
    ) {
      return false;
    }
  }
  if (value === false || value === 0) return false;
  return null;
}

/**
 * Helper global — todos os modelos de contrato e o fluxo eletrônico devem usar isto.
 *
 * hasSpouse =
 *   (has_spouse !== false) &&
 *   nome preenchido &&
 *   CPF com 11 dígitos
 *
 * - Checkbox desmarcado (has_spouse=false) → sem cônjuge, mesmo com lixo residual.
 * - Coluna ausente no DB (flag null) → infere por nome + CPF da venda.
 */
export function resolveSaleSpouseContext(
  sale: Record<string, unknown> | null | undefined,
): SaleSpouseContext {
  if (!sale || typeof sale !== 'object') {
    return { hasSpouse: false, spouse: null };
  }

  const flag = parseSaleHasSpouseFlag(sale.has_spouse);
  if (flag === false) {
    return { hasSpouse: false, spouse: null };
  }

  const name = clean(sale.sale_spouse_name);
  const cpfRaw = clean(sale.sale_spouse_cpf);
  const cpfDigits = onlyDigits(cpfRaw);
  const hasSpouse = Boolean(name) && cpfDigits.length === 11;

  if (!hasSpouse) {
    return { hasSpouse: false, spouse: null };
  }

  return {
    hasSpouse: true,
    spouse: {
      name,
      cpf: cpfRaw || cpfDigits,
      rg: clean(sale.sale_spouse_rg) || undefined,
      issuer: clean(sale.sale_spouse_rg_issuer) || undefined,
      nationality: clean(sale.sale_spouse_nationality) || undefined,
      maritalStatus: clean(sale.sale_spouse_marital_status) || undefined,
      profession: clean(sale.sale_spouse_profession) || undefined,
      email: clean(sale.sale_spouse_email) || undefined,
      phone: clean(sale.sale_spouse_phone) || undefined,
      address: clean(sale.sale_spouse_address) || undefined,
    },
  };
}

export function emptySaleSpouseFormFields(): SaleSpouseFormFields {
  return {
    has_spouse: false,
    sale_spouse_name: '',
    sale_spouse_nationality: '',
    sale_spouse_marital_status: '',
    sale_spouse_profession: '',
    sale_spouse_rg: '',
    sale_spouse_rg_issuer: '',
    sale_spouse_cpf: '',
    sale_spouse_phone: '',
    sale_spouse_email: '',
    sale_spouse_address: '',
  };
}

export function saleSpouseFormFieldsFromSale(
  sale: Record<string, unknown> | null | undefined,
): SaleSpouseFormFields {
  const empty = emptySaleSpouseFormFields();
  const ctx = resolveSaleSpouseContext(sale);
  if (!ctx.hasSpouse || !ctx.spouse) return empty;

  return {
    has_spouse: true,
    sale_spouse_name: ctx.spouse.name,
    sale_spouse_nationality: ctx.spouse.nationality || '',
    sale_spouse_marital_status: ctx.spouse.maritalStatus || '',
    sale_spouse_profession: ctx.spouse.profession || '',
    sale_spouse_rg: ctx.spouse.rg || '',
    sale_spouse_rg_issuer: ctx.spouse.issuer || '',
    sale_spouse_cpf: ctx.spouse.cpf || '',
    sale_spouse_phone: ctx.spouse.phone || '',
    sale_spouse_email: ctx.spouse.email || '',
    sale_spouse_address: ctx.spouse.address || '',
  };
}

export function buildSaleSpouseDbPatch(
  data: Partial<SaleSpouseFormFields>,
): Record<SaleSpouseDbField, string | null> {
  const merged = {
    ...emptySaleSpouseFormFields(),
    ...data,
  };
  const ctx = resolveSaleSpouseContext({
    has_spouse: merged.has_spouse,
    sale_spouse_name: merged.sale_spouse_name,
    sale_spouse_cpf: merged.sale_spouse_cpf,
    sale_spouse_nationality: merged.sale_spouse_nationality,
    sale_spouse_marital_status: merged.sale_spouse_marital_status,
    sale_spouse_profession: merged.sale_spouse_profession,
    sale_spouse_rg: merged.sale_spouse_rg,
    sale_spouse_rg_issuer: merged.sale_spouse_rg_issuer,
    sale_spouse_phone: merged.sale_spouse_phone,
    sale_spouse_email: merged.sale_spouse_email,
    sale_spouse_address: merged.sale_spouse_address,
  });

  if (!ctx.hasSpouse || !ctx.spouse) {
    return Object.fromEntries(
      SALE_SPOUSE_DB_FIELDS.map((field) => [field, null]),
    ) as Record<SaleSpouseDbField, string | null>;
  }

  return {
    sale_spouse_name: clean(ctx.spouse.name) || null,
    sale_spouse_nationality: clean(ctx.spouse.nationality) || null,
    sale_spouse_marital_status: clean(ctx.spouse.maritalStatus) || null,
    sale_spouse_profession: clean(ctx.spouse.profession) || null,
    sale_spouse_rg: clean(ctx.spouse.rg) || null,
    sale_spouse_rg_issuer: clean(ctx.spouse.issuer) || null,
    sale_spouse_cpf: clean(ctx.spouse.cpf) || null,
    sale_spouse_phone: clean(ctx.spouse.phone) || null,
    sale_spouse_email: clean(ctx.spouse.email) || null,
    sale_spouse_address: clean(ctx.spouse.address) || null,
  };
}

/** Alias — mesma regra de resolveSaleSpouseContext.hasSpouse. */
export function hasSaleSpouseData(
  sale: Record<string, unknown> | null | undefined,
): boolean {
  return resolveSaleSpouseContext(sale).hasSpouse;
}

export function extractRecantoSpouseSource(
  sale: Record<string, unknown> | null | undefined,
  _customer?: Record<string, unknown> | null | undefined,
): RecantoSpouseSource | null {
  const ctx = resolveSaleSpouseContext(sale);
  if (!ctx.hasSpouse || !ctx.spouse) return null;

  return {
    name: ctx.spouse.name,
    nationality: ctx.spouse.nationality || '',
    maritalStatus: ctx.spouse.maritalStatus || '',
    profession: ctx.spouse.profession || '',
    rg: ctx.spouse.rg || '',
    rgIssuer: ctx.spouse.issuer || '',
    cpf: ctx.spouse.cpf || '',
    phone: ctx.spouse.phone || '',
    email: ctx.spouse.email || '',
    address: ctx.spouse.address || '',
  };
}

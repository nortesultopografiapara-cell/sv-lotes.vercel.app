/**
 * Campos de cônjuge vinculados à venda (sale_spouse_*).
 */

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

function clean(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || text === 'undefined' || text === 'null') return '';
  return text;
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
  if (!sale || typeof sale !== 'object') return empty;

  const name = clean(sale.sale_spouse_name);
  if (!name) return empty;

  return {
    has_spouse: true,
    sale_spouse_name: name,
    sale_spouse_nationality: clean(sale.sale_spouse_nationality),
    sale_spouse_marital_status: clean(sale.sale_spouse_marital_status),
    sale_spouse_profession: clean(sale.sale_spouse_profession),
    sale_spouse_rg: clean(sale.sale_spouse_rg),
    sale_spouse_rg_issuer: clean(sale.sale_spouse_rg_issuer),
    sale_spouse_cpf: clean(sale.sale_spouse_cpf),
    sale_spouse_phone: clean(sale.sale_spouse_phone),
    sale_spouse_email: clean(sale.sale_spouse_email),
    sale_spouse_address: clean(sale.sale_spouse_address),
  };
}

export function buildSaleSpouseDbPatch(
  data: Partial<SaleSpouseFormFields>,
): Record<SaleSpouseDbField, string | null> {
  const hasSpouse = !!data.has_spouse && !!clean(data.sale_spouse_name);
  if (!hasSpouse) {
    return Object.fromEntries(
      SALE_SPOUSE_DB_FIELDS.map((field) => [field, null]),
    ) as Record<SaleSpouseDbField, string | null>;
  }

  return {
    sale_spouse_name: clean(data.sale_spouse_name) || null,
    sale_spouse_nationality: clean(data.sale_spouse_nationality) || null,
    sale_spouse_marital_status: clean(data.sale_spouse_marital_status) || null,
    sale_spouse_profession: clean(data.sale_spouse_profession) || null,
    sale_spouse_rg: clean(data.sale_spouse_rg) || null,
    sale_spouse_rg_issuer: clean(data.sale_spouse_rg_issuer) || null,
    sale_spouse_cpf: clean(data.sale_spouse_cpf) || null,
    sale_spouse_phone: clean(data.sale_spouse_phone) || null,
    sale_spouse_email: clean(data.sale_spouse_email) || null,
    sale_spouse_address: clean(data.sale_spouse_address) || null,
  };
}

/** Recanto Primavera: cônjuge só quando a venda tem sale_spouse_name ou sale_spouse_cpf. */
export function hasSaleSpouseData(
  sale: Record<string, unknown> | null | undefined,
): boolean {
  if (!sale || typeof sale !== 'object') return false;
  return !!(clean(sale.sale_spouse_name) || clean(sale.sale_spouse_cpf));
}

export function extractRecantoSpouseSource(
  sale: Record<string, unknown> | null | undefined,
  _customer?: Record<string, unknown> | null | undefined,
): RecantoSpouseSource | null {
  if (!hasSaleSpouseData(sale)) return null;

  return {
    name: clean(sale?.sale_spouse_name),
    nationality: clean(sale?.sale_spouse_nationality),
    maritalStatus: clean(sale?.sale_spouse_marital_status),
    profession: clean(sale?.sale_spouse_profession),
    rg: clean(sale?.sale_spouse_rg),
    rgIssuer: clean(sale?.sale_spouse_rg_issuer),
    cpf: clean(sale?.sale_spouse_cpf),
    phone: clean(sale?.sale_spouse_phone),
    email: clean(sale?.sale_spouse_email),
    address: clean(sale?.sale_spouse_address),
  };
}

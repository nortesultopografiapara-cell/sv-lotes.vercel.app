/** Tipos — Financeiro Corporativo Master (Fase 6.1 — fundação). */

export const CORPORATE_ACCOUNT_TYPES = [
  'CHECKING',
  'SAVINGS',
  'CASH',
  'DIGITAL_WALLET',
  'OTHER',
] as const;

export type CorporateAccountType = (typeof CORPORATE_ACCOUNT_TYPES)[number];

export const CORPORATE_CATEGORY_TYPES = ['INCOME', 'EXPENSE'] as const;
export type CorporateCategoryType = (typeof CORPORATE_CATEGORY_TYPES)[number];

export type MasterCorporateFinancialAccount = {
  id: string;
  name: string;
  account_type: CorporateAccountType;
  institution_name: string | null;
  branch: string | null;
  account_number: string | null;
  pix_key: string | null;
  opening_balance: number;
  opening_balance_date: string | null;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterCorporateFinancialAccountInput = {
  name: string;
  account_type: CorporateAccountType;
  institution_name: string | null;
  branch: string | null;
  account_number: string | null;
  pix_key: string | null;
  opening_balance: number;
  opening_balance_date: string | null;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
};

export type MasterCorporateFinancialCategory = {
  id: string;
  name: string;
  type: CorporateCategoryType;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MasterCorporateFinancialCategoryInput = {
  name: string;
  type: CorporateCategoryType;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number;
};

export type MasterCorporateCostCenter = {
  id: string;
  code: string;
  name: string;
  project_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MasterCorporateCostCenterInput = {
  code?: string | null;
  name: string;
  project_id: string | null;
  is_active: boolean;
};

export type MasterCorporateFinanceFoundationKpis = {
  accountsTotal: number;
  accountsActive: number;
  categoriesTotal: number;
  categoriesIncome: number;
  categoriesExpense: number;
  costCentersTotal: number;
  costCentersActive: number;
  openingBalanceSum: number;
};

export function corporateAccountTypeLabel(type: string): string {
  switch (type) {
    case 'CHECKING':
      return 'Conta corrente';
    case 'SAVINGS':
      return 'Poupança';
    case 'CASH':
      return 'Caixa';
    case 'DIGITAL_WALLET':
      return 'Carteira digital';
    case 'OTHER':
      return 'Outra';
    default:
      return type;
  }
}

export function corporateCategoryTypeLabel(type: string): string {
  return type === 'INCOME' ? 'Receita' : type === 'EXPENSE' ? 'Despesa' : type;
}

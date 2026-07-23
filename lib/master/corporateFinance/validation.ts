import {
  CORPORATE_ACCOUNT_TYPES,
  CORPORATE_CATEGORY_TYPES,
  type CorporateAccountType,
  type CorporateCategoryType,
  type MasterCorporateCostCenterInput,
  type MasterCorporateFinancialAccountInput,
  type MasterCorporateFinancialCategoryInput,
} from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value: unknown, max = 500): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function cleanRequired(value: unknown, field: string, max = 200): string {
  const s = cleanText(value, max);
  if (!s) throw new Error(`${field} é obrigatório.`);
  return s;
}

function parseOptionalDate(value: unknown, field: string): string | null {
  const s = cleanText(value, 32);
  if (!s) return null;
  if (!DATE_RE.test(s)) throw new Error(`${field} inválida.`);
  return s;
}

function parseMoney(value: unknown, field: string, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} inválido.`);
  return Math.round(n * 100) / 100;
}

function parseBool(value: unknown, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return Boolean(value);
}

function parseAccountType(value: unknown): CorporateAccountType {
  const s = String(value || 'CHECKING').trim().toUpperCase();
  if (!(CORPORATE_ACCOUNT_TYPES as readonly string[]).includes(s)) {
    throw new Error('Tipo de conta inválido.');
  }
  return s as CorporateAccountType;
}

function parseCategoryType(value: unknown): CorporateCategoryType {
  const s = String(value || '').trim().toUpperCase();
  if (!(CORPORATE_CATEGORY_TYPES as readonly string[]).includes(s)) {
    throw new Error('Tipo de categoria inválido (INCOME ou EXPENSE).');
  }
  return s as CorporateCategoryType;
}

export function validateCorporateAccountInput(
  raw: Record<string, unknown>,
): MasterCorporateFinancialAccountInput {
  const name = cleanRequired(raw.name, 'Nome da conta', 200);
  const account_type = parseAccountType(raw.account_type ?? raw.accountType);
  const opening_balance = parseMoney(
    raw.opening_balance ?? raw.openingBalance,
    'Saldo inicial',
    0,
  );
  const opening_balance_date = parseOptionalDate(
    raw.opening_balance_date ?? raw.openingBalanceDate,
    'Data do saldo inicial',
  );

  if (opening_balance !== 0 && !opening_balance_date) {
    throw new Error('Informe a data de referência do saldo inicial.');
  }

  return {
    name,
    account_type,
    institution_name: cleanText(raw.institution_name ?? raw.institutionName, 200),
    branch: cleanText(raw.branch, 50),
    account_number: cleanText(raw.account_number ?? raw.accountNumber, 80),
    pix_key: cleanText(raw.pix_key ?? raw.pixKey, 200),
    opening_balance,
    opening_balance_date,
    is_default: parseBool(raw.is_default ?? raw.isDefault, false),
    is_active: parseBool(raw.is_active ?? raw.isActive, true),
    notes: cleanText(raw.notes, 2000),
  };
}

export function validateCorporateCategoryInput(
  raw: Record<string, unknown>,
): MasterCorporateFinancialCategoryInput {
  const name = cleanRequired(raw.name, 'Nome da categoria', 200);
  const type = parseCategoryType(raw.type);
  const parentRaw = raw.parent_id ?? raw.parentId;
  const parent_id =
    parentRaw == null || parentRaw === '' ? null : cleanRequired(parentRaw, 'Categoria pai', 64);

  const sortRaw = raw.sort_order ?? raw.sortOrder;
  let sort_order = 0;
  if (sortRaw != null && sortRaw !== '') {
    const n = Number(sortRaw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new Error('Ordem inválida.');
    }
    sort_order = n;
  }

  return {
    name,
    type,
    parent_id,
    is_active: parseBool(raw.is_active ?? raw.isActive, true),
    sort_order,
  };
}

export function validateCorporateCostCenterInput(
  raw: Record<string, unknown>,
): MasterCorporateCostCenterInput {
  const name = cleanRequired(raw.name, 'Nome do centro', 200);
  const code = cleanText(raw.code, 40);
  const projectRaw = raw.project_id ?? raw.projectId;
  const project_id =
    projectRaw == null || projectRaw === ''
      ? null
      : cleanRequired(projectRaw, 'Projeto', 64);

  return {
    code,
    name,
    project_id,
    is_active: parseBool(raw.is_active ?? raw.isActive, true),
  };
}

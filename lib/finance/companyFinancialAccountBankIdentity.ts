/**
 * Identificação bancária cadastral da conta financeira.
 * Não é credencial: nunca senha, token, API key, client secret ou private key.
 * Titular continua em beneficiary_name — não duplicar.
 */

export const COMPANY_BANK_ACCOUNT_KINDS = ['CORRENTE', 'POUPANCA', 'PAGAMENTO'] as const;
export type CompanyBankAccountKind = (typeof COMPANY_BANK_ACCOUNT_KINDS)[number];

export const COMPANY_BANK_ACCOUNT_KIND_LABELS: Record<CompanyBankAccountKind, string> = {
  CORRENTE: 'Corrente',
  POUPANCA: 'Poupança',
  PAGAMENTO: 'Pagamento',
};

export type CompanyFinancialAccountBankIdentity = {
  bankName: string | null;
  bankCode: string | null;
  agency: string | null;
  accountNumber: string | null;
  accountDigit: string | null;
  bankAccountKind: CompanyBankAccountKind | null;
};

export const EMPTY_BANK_IDENTITY: CompanyFinancialAccountBankIdentity = {
  bankName: null,
  bankCode: null,
  agency: null,
  accountNumber: null,
  accountDigit: null,
  bankAccountKind: null,
};

const INVALID_BANK_KIND_MESSAGE = 'Tipo da conta bancária inválido.';

function cleanLimited(value: unknown, max: number): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, max);
}

function cleanBankCode(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.slice(0, 10);
}

export function isCompanyBankAccountKind(value: unknown): value is CompanyBankAccountKind {
  return (COMPANY_BANK_ACCOUNT_KINDS as readonly string[]).includes(String(value ?? '').trim());
}

export function parseBankAccountKind(value: unknown): CompanyBankAccountKind | null {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (!raw) return null;
  if (raw === 'CORRENTE') return 'CORRENTE';
  if (raw === 'POUPANCA') return 'POUPANCA';
  if (raw === 'PAGAMENTO') return 'PAGAMENTO';
  throw new Error(INVALID_BANK_KIND_MESSAGE);
}

export function sanitizeBankIdentity(input: {
  bankName?: unknown;
  bankCode?: unknown;
  agency?: unknown;
  accountNumber?: unknown;
  accountDigit?: unknown;
  bankAccountKind?: unknown;
}): CompanyFinancialAccountBankIdentity {
  return {
    bankName: cleanLimited(input.bankName, 120),
    bankCode: cleanBankCode(input.bankCode),
    agency: cleanLimited(input.agency, 20),
    accountNumber: cleanLimited(input.accountNumber, 20),
    accountDigit: cleanLimited(input.accountDigit, 4),
    bankAccountKind: parseBankAccountKind(input.bankAccountKind),
  };
}

export function bankIdentityToDbPatch(identity: CompanyFinancialAccountBankIdentity): {
  bank_name: string | null;
  bank_code: string | null;
  agency: string | null;
  account_number: string | null;
  account_digit: string | null;
  bank_account_kind: CompanyBankAccountKind | null;
} {
  return {
    bank_name: identity.bankName,
    bank_code: identity.bankCode,
    agency: identity.agency,
    account_number: identity.accountNumber,
    account_digit: identity.accountDigit,
    bank_account_kind: identity.bankAccountKind,
  };
}

export function pickBankIdentityFromBody(
  body: Record<string, unknown>,
): Partial<CompanyFinancialAccountBankIdentity> | undefined {
  const has =
    body.bankName !== undefined ||
    body.bank_name !== undefined ||
    body.bankCode !== undefined ||
    body.bank_code !== undefined ||
    body.agency !== undefined ||
    body.accountNumber !== undefined ||
    body.account_number !== undefined ||
    body.accountDigit !== undefined ||
    body.account_digit !== undefined ||
    body.bankAccountKind !== undefined ||
    body.bank_account_kind !== undefined;
  if (!has) return undefined;

  const patch: Partial<CompanyFinancialAccountBankIdentity> = {};
  if (body.bankName !== undefined || body.bank_name !== undefined) {
    patch.bankName = cleanLimited(body.bankName ?? body.bank_name, 120);
  }
  if (body.bankCode !== undefined || body.bank_code !== undefined) {
    patch.bankCode = cleanBankCode(body.bankCode ?? body.bank_code);
  }
  if (body.agency !== undefined) {
    patch.agency = cleanLimited(body.agency, 20);
  }
  if (body.accountNumber !== undefined || body.account_number !== undefined) {
    patch.accountNumber = cleanLimited(body.accountNumber ?? body.account_number, 20);
  }
  if (body.accountDigit !== undefined || body.account_digit !== undefined) {
    patch.accountDigit = cleanLimited(body.accountDigit ?? body.account_digit, 4);
  }
  if (body.bankAccountKind !== undefined || body.bank_account_kind !== undefined) {
    patch.bankAccountKind = parseBankAccountKind(body.bankAccountKind ?? body.bank_account_kind);
  }
  return patch;
}

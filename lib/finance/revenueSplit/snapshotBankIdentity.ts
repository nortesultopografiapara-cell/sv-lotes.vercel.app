/**
 * Congelamento cadastral no snapshot imutável da venda.
 * Copia o cadastro vigente no freeze. Nunca sincroniza depois.
 * Não é credencial: sem senha, token, API key, client secret ou private key.
 */
import {
  formatFinancialAccountProviderLabel,
  isAsaasFinancialProvider,
  isInterFinancialProvider,
} from '@/lib/finance/companyFinancialAccountTypes';
import {
  isCompanyBankAccountKind,
  type CompanyBankAccountKind,
} from '@/lib/finance/companyFinancialAccountBankIdentity';

export type SaleRevenueSplitSnapshotBankIdentity = {
  destBeneficiaryName: string | null;
  destInstitution: string | null;
  destBankName: string | null;
  destBankCode: string | null;
  destAgency: string | null;
  destAccountMasked: string | null;
  destBankAccountKind: CompanyBankAccountKind | null;
};

export const EMPTY_SNAPSHOT_BANK_IDENTITY: SaleRevenueSplitSnapshotBankIdentity = {
  destBeneficiaryName: null,
  destInstitution: null,
  destBankName: null,
  destBankCode: null,
  destAgency: null,
  destAccountMasked: null,
  destBankAccountKind: null,
};

export type RevenueSplitFinancialAccountFreezeSource = {
  id: string;
  companyId: string;
  beneficiaryName: string | null;
  provider: string | null;
  bankName: string | null;
  bankCode: string | null;
  agency: string | null;
  accountNumber: string | null;
  accountDigit: string | null;
  bankAccountKind: string | null;
};

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

/**
 * Instituição/gateway a partir do provider existente.
 * Asaas ≠ banco cadastral (bank_name). Sem provider → null, não inventa.
 */
export function freezeInstitutionFromProvider(provider: string | null | undefined): string | null {
  const raw = String(provider || '').trim();
  if (!raw) return null;
  if (isAsaasFinancialProvider(raw) || isInterFinancialProvider(raw)) {
    const label = formatFinancialAccountProviderLabel(raw);
    return label === 'Sem provider' ? null : label;
  }
  return raw;
}

/**
 * Representação segura e determinística da conta no freeze.
 * 8098370 + dígito 3 → ••••8370-3
 */
export function maskBankAccountForSnapshot(
  accountNumber: string | null | undefined,
  accountDigit: string | null | undefined,
): string | null {
  const number = String(accountNumber ?? '').replace(/\D/g, '');
  const digit = String(accountDigit ?? '').trim();
  if (!number && !digit) return null;
  const last4 = number.slice(-4);
  const masked = `••••${last4}`;
  return digit ? `${masked}-${digit}` : masked;
}

export function freezeSnapshotBankIdentityFromAccount(
  account: RevenueSplitFinancialAccountFreezeSource | null | undefined,
): SaleRevenueSplitSnapshotBankIdentity {
  if (!account) return { ...EMPTY_SNAPSHOT_BANK_IDENTITY };
  return {
    destBeneficiaryName: cleanText(account.beneficiaryName),
    destInstitution: freezeInstitutionFromProvider(account.provider),
    destBankName: cleanText(account.bankName),
    destBankCode: cleanText(account.bankCode),
    destAgency: cleanText(account.agency),
    destAccountMasked: maskBankAccountForSnapshot(account.accountNumber, account.accountDigit),
    destBankAccountKind: isCompanyBankAccountKind(account.bankAccountKind)
      ? account.bankAccountKind
      : null,
  };
}

export function snapshotBankIdentityToDbPayload(
  identity: SaleRevenueSplitSnapshotBankIdentity,
): Record<string, string | null> {
  return {
    dest_beneficiary_name: identity.destBeneficiaryName,
    dest_institution: identity.destInstitution,
    dest_bank_name: identity.destBankName,
    dest_bank_code: identity.destBankCode,
    dest_agency: identity.destAgency,
    dest_account_masked: identity.destAccountMasked,
    dest_bank_account_kind: identity.destBankAccountKind,
  };
}

export function mapSnapshotBankIdentity(
  row: Record<string, unknown>,
): SaleRevenueSplitSnapshotBankIdentity {
  const kind = String(row.dest_bank_account_kind ?? row.destBankAccountKind ?? '').trim();
  return {
    destBeneficiaryName: cleanText(row.dest_beneficiary_name ?? row.destBeneficiaryName),
    destInstitution: cleanText(row.dest_institution ?? row.destInstitution),
    destBankName: cleanText(row.dest_bank_name ?? row.destBankName),
    destBankCode: cleanText(row.dest_bank_code ?? row.destBankCode),
    destAgency: cleanText(row.dest_agency ?? row.destAgency),
    destAccountMasked: cleanText(row.dest_account_masked ?? row.destAccountMasked),
    destBankAccountKind: isCompanyBankAccountKind(kind) ? kind : null,
  };
}

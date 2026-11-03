/**
 * Identificação bancária congelada no snapshot da venda.
 * Fonte exclusiva: dest_* de sale_revenue_split_snapshot_participants.
 * Nunca consulta company_financial_accounts nem preenche NULL com cadastro vivo.
 */
import {
  COMPANY_BANK_ACCOUNT_KIND_LABELS,
  isCompanyBankAccountKind,
} from '@/lib/finance/companyFinancialAccountBankIdentity';

export const FROZEN_BANK_IDENTITY_MISSING_LABEL =
  'Dados bancários não registrados no congelamento.';

export const FROZEN_BANK_IDENTITY_EXCEL_NOTE =
  'Dados bancários representam a identificação congelada no snapshot da venda.';

export type FrozenBankIdentityFields = {
  destBeneficiaryName: string | null;
  destInstitution: string | null;
  destBankName: string | null;
  destBankCode: string | null;
  destAgency: string | null;
  destAccountMasked: string | null;
  destBankAccountKind: string | null;
};

export const EMPTY_FROZEN_BANK_IDENTITY: FrozenBankIdentityFields = {
  destBeneficiaryName: null,
  destInstitution: null,
  destBankName: null,
  destBankCode: null,
  destAgency: null,
  destAccountMasked: null,
  destBankAccountKind: null,
};

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

export function readFrozenBankIdentityFromSnapshotRow(
  row: Record<string, unknown> | null | undefined,
): FrozenBankIdentityFields {
  if (!row) return { ...EMPTY_FROZEN_BANK_IDENTITY };
  const kind = cleanText(row.destBankAccountKind ?? row.dest_bank_account_kind);
  return {
    destBeneficiaryName: cleanText(row.destBeneficiaryName ?? row.dest_beneficiary_name),
    destInstitution: cleanText(row.destInstitution ?? row.dest_institution),
    destBankName: cleanText(row.destBankName ?? row.dest_bank_name),
    destBankCode: cleanText(row.destBankCode ?? row.dest_bank_code),
    destAgency: cleanText(row.destAgency ?? row.dest_agency),
    destAccountMasked: cleanText(row.destAccountMasked ?? row.dest_account_masked),
    destBankAccountKind: kind && isCompanyBankAccountKind(kind) ? kind : kind,
  };
}

export function hasFrozenBankIdentity(fields: FrozenBankIdentityFields | null | undefined): boolean {
  if (!fields) return false;
  return Boolean(
    fields.destBeneficiaryName ||
      fields.destInstitution ||
      fields.destBankName ||
      fields.destBankCode ||
      fields.destAgency ||
      fields.destAccountMasked ||
      fields.destBankAccountKind,
  );
}

export function frozenBankAccountKindLabel(kind: string | null | undefined): string | null {
  const raw = String(kind || '').trim();
  if (!raw) return null;
  if (isCompanyBankAccountKind(raw)) {
    return `Conta ${COMPANY_BANK_ACCOUNT_KIND_LABELS[raw].toLocaleLowerCase('pt-BR')}`;
  }
  return raw;
}

export function formatFrozenBankAgencyAccountLine(
  fields: FrozenBankIdentityFields,
): string | null {
  const parts: string[] = [];
  if (fields.destAgency) parts.push(`Ag. ${fields.destAgency}`);
  if (fields.destAccountMasked) parts.push(`Conta ${fields.destAccountMasked}`);
  return parts.length ? parts.join(' • ') : null;
}

export function formatFrozenBankInstitutionBankLine(
  fields: FrozenBankIdentityFields,
): string | null {
  const parts = [fields.destInstitution, fields.destBankName].filter(Boolean);
  return parts.length ? parts.join(' • ') : null;
}

/** Linhas da tela Parcelas — sem wallet UUID, sem IDs técnicos. */
export function formatFrozenBankIdentityUiLines(
  fields: FrozenBankIdentityFields | null | undefined,
): string[] {
  if (!hasFrozenBankIdentity(fields)) return [FROZEN_BANK_IDENTITY_MISSING_LABEL];
  const f = fields!;
  const lines: string[] = [];
  if (f.destBeneficiaryName) lines.push(f.destBeneficiaryName);
  const inst = formatFrozenBankInstitutionBankLine(f);
  if (inst) lines.push(inst);
  const ag = formatFrozenBankAgencyAccountLine(f);
  if (ag) lines.push(ag);
  if (f.destBankAccountKind) lines.push(f.destBankAccountKind);
  return lines.length ? lines : [FROZEN_BANK_IDENTITY_MISSING_LABEL];
}

/** Bloco do PDF Completo — Destino congelado. */
export function formatFrozenBankIdentityPdfLines(
  fields: FrozenBankIdentityFields | null | undefined,
): string[] {
  if (!hasFrozenBankIdentity(fields)) return [FROZEN_BANK_IDENTITY_MISSING_LABEL];
  const f = fields!;
  const lines: string[] = [];
  if (f.destBeneficiaryName) lines.push(f.destBeneficiaryName);
  const inst = formatFrozenBankInstitutionBankLine(f);
  if (inst) lines.push(inst);
  if (f.destBankCode) lines.push(`Banco ${f.destBankCode}`);
  const ag = formatFrozenBankAgencyAccountLine(f);
  if (ag) lines.push(ag);
  const kind = frozenBankAccountKindLabel(f.destBankAccountKind);
  if (kind) lines.push(kind);
  return lines.length ? lines : [FROZEN_BANK_IDENTITY_MISSING_LABEL];
}

/** Célula enxuta do PDF Resumido. */
export function formatFrozenBankIdentityCompact(
  fields: FrozenBankIdentityFields | null | undefined,
): string {
  if (!hasFrozenBankIdentity(fields)) return FROZEN_BANK_IDENTITY_MISSING_LABEL;
  const f = fields!;
  const bits: string[] = [];
  if (f.destInstitution) bits.push(f.destInstitution);
  if (f.destAgency) bits.push(`Ag. ${f.destAgency}`);
  if (f.destAccountMasked) bits.push(f.destAccountMasked);
  if (bits.length) return bits.join(' • ');
  return formatFrozenBankIdentityUiLines(f).join(' • ');
}

export function formatPaidAtDisplay(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  if (!/T\d{2}:/.test(raw)) {
    const part = raw.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
      const [y, m, d] = part.split('-');
      return `${d}/${m}/${y}`;
    }
    return raw;
  }
  if (/T00:00:00(\.0+)?(Z|[+-]\d{2}:?\d{2})?$/i.test(raw)) {
    const part = raw.split('T')[0];
    const [y, m, d] = part.split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const part = raw.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
      const [y, m, d] = part.split('-');
      return `${d}/${m}/${y}`;
    }
    return '—';
  }
  return parsed.toLocaleString('pt-BR');
}

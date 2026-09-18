/**
 * Formatação visual do split — não altera dataset, persistência nem totais.
 */
import { formatMoneyBr } from './financeReportFormat';
import { formatReportSharePercent } from './splitForReport';
import type { CanonicalSplitLeg } from './canonicalFinanceTypes';
import { formatFrozenBankIdentityPdfLines } from './frozenBankIdentity';

const ISSUER_DISPLAY_LABEL = 'Administradora';

export function formatSplitBeneficiaryLabel(name: string | null | undefined): string {
  const raw = String(name || '').trim();
  if (!raw) return 'Beneficiário';
  if (raw.toLocaleLowerCase('pt-BR') === ISSUER_DISPLAY_LABEL.toLocaleLowerCase('pt-BR')) {
    return ISSUER_DISPLAY_LABEL;
  }
  return raw.toLocaleUpperCase('pt-BR');
}

export function formatSplitSharePercentLabel(value: number): string {
  return formatReportSharePercent(value);
}

export type SplitStatusTone = 'settled' | 'pending' | 'other';

export function splitStatusPresentationTone(label: string): SplitStatusTone {
  const s = String(label || '').trim().toLocaleLowerCase('pt-BR');
  if (
    s === 'recebido' ||
    s === 'repassado' ||
    s === 'liquidado' ||
    s === 'concluído' ||
    s === 'concluido'
  ) {
    return 'settled';
  }
  if (
    s.includes('previsto') ||
    s.includes('estimado') ||
    s.includes('pendente') ||
    s.includes('processando')
  ) {
    return 'pending';
  }
  return 'other';
}

/** Linha da distribuição no PDF Completo — sem UUID/wallet técnica. */
export function formatFinancePdfSplitLegLine(leg: CanonicalSplitLeg): string {
  const liquido = leg.netAmount == null ? '—' : formatMoneyBr(leg.netAmount);
  const header = [
    formatSplitBeneficiaryLabel(leg.beneficiaryName),
    formatSplitSharePercentLabel(leg.sharePercent),
    `bruto ${formatMoneyBr(leg.grossAmount)}`,
    `líquido ${liquido}`,
    leg.amountKindLabel,
    leg.statusLabel,
  ].join(' | ');
  const destLines = formatFrozenBankIdentityPdfLines(leg.frozenBankIdentity);
  return `${header} · Destino congelado: ${destLines.join(' · ')}`;
}

export function formatFinancePdfSplitLegBlock(
  leg: CanonicalSplitLeg,
  paidAtLabel?: string | null,
): string {
  const liquido = leg.netAmount == null ? '—' : formatMoneyBr(leg.netAmount);
  const lines = [
    `${formatSplitBeneficiaryLabel(leg.beneficiaryName)} — ${formatSplitSharePercentLabel(leg.sharePercent)}`,
    `Bruto: ${formatMoneyBr(leg.grossAmount)}`,
    `Valor informado: ${liquido}`,
    `Situação: ${leg.statusLabel} / ${leg.amountKindLabel}`,
  ];
  if (paidAtLabel && paidAtLabel !== '—') {
    lines.push(`Data de pagamento: ${paidAtLabel}`);
  }
  lines.push('Destino congelado:');
  lines.push(...formatFrozenBankIdentityPdfLines(leg.frozenBankIdentity));
  return lines.join('\n');
}

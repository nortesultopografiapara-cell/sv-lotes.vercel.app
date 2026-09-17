/**
 * Distribuição de recebimento para relatórios.
 * Mesma prioridade da tela Parcelas (ChargeRevenueSplitDistribution):
 * 1. charge_revenue_split_legs da installment_id
 * 2. snapshot da venda, se ainda não houver legs
 * 3. sem snapshot → o chamador usa a conta financeira da parcela
 *
 * Split NÃO é receita. As pernas são destinos da receita original.
 */
import {
  estimateShareAmount,
  formatSharePercent,
} from '@/lib/finance/revenueSplit/shareFormat';
import {
  revenueSplitLegParticipantStatusLabel,
  REVENUE_SPLIT_LEG_STATUS_LABELS,
} from '@/lib/finance/revenueSplit/display';
import type { RevenueSplitLegStatus } from '@/lib/finance/revenueSplit/types';
import type {
  CanonicalSaleSplitView,
  CanonicalSplitLeg,
  CanonicalSplitLegInput,
  CanonicalSplitParticipantInput,
  DestinationAmountKind,
} from './canonicalFinanceTypes';

export const AMOUNT_KIND_LABELS: Record<DestinationAmountKind, string> = {
  settled: 'Liquidado',
  estimated: 'Previsto/Estimado',
  account: 'Conta financeira',
};

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function participantDisplayName(row: CanonicalSplitParticipantInput): string {
  return str(row.displayName || row.display_name) || 'Beneficiário';
}

export function participantSharePercent(row: CanonicalSplitParticipantInput): number {
  const n = num(row.sharePercent ?? row.share_percent);
  return n == null ? 0 : n;
}

export function participantIsIssuerRemainder(row: CanonicalSplitParticipantInput): boolean {
  return Boolean(row.isIssuerRemainder ?? row.is_issuer_remainder);
}

function participantAccountId(row: CanonicalSplitParticipantInput): string {
  return str(row.financialAccountId || row.financial_account_id);
}

function participantWallet(row: CanonicalSplitParticipantInput): string {
  return str(row.destinationIdentifier || row.destination_identifier);
}

function legInstallmentId(row: CanonicalSplitLegInput): string {
  return str(row.installmentId || row.installment_id);
}

function isLegStatus(value: string): value is RevenueSplitLegStatus {
  return value in REVENUE_SPLIT_LEG_STATUS_LABELS;
}

export function formatReportSharePercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  if (Math.abs(value - Math.round(value)) < 0.00005) return `${Math.round(value)}%`;
  return `${formatSharePercent(value)}%`;
}

function accountOrWallet(
  row: CanonicalSplitParticipantInput,
  accountLabels: Record<string, string>,
): string | null {
  const accountId = participantAccountId(row);
  const account = accountId ? accountLabels[accountId] || accountId : '';
  const wallet = participantWallet(row);
  const parts = [account, wallet].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function resolveLegGrossAndNet(
  row: CanonicalSplitLegInput,
  grossPaid: number,
): { grossAmount: number; netAmount: number | null; amountKind: DestinationAmountKind } {
  const estimate = num(row.grossAmountEstimate ?? row.gross_amount_estimate);
  const grossAmount = Math.round(
    (estimate != null ? estimate : estimateShareAmount(grossPaid, participantSharePercent(row))) *
      100,
  ) / 100;
  const netRaw = num(row.netAmount ?? row.net_amount);
  const netAmount = netRaw == null ? null : Math.round(netRaw * 100) / 100;
  return {
    grossAmount,
    netAmount,
    amountKind: netAmount != null ? 'settled' : 'estimated',
  };
}

function toCanonicalLeg(
  row: CanonicalSplitLegInput,
  grossPaid: number,
  accountLabels: Record<string, string>,
  fallbackStatus: RevenueSplitLegStatus,
): CanonicalSplitLeg {
  const { grossAmount, netAmount, amountKind } = resolveLegGrossAndNet(row, grossPaid);
  const rawStatus = str(row.status || fallbackStatus).toUpperCase();
  const status: RevenueSplitLegStatus = isLegStatus(rawStatus) ? rawStatus : fallbackStatus;
  const isIssuerRemainder = participantIsIssuerRemainder(row);
  return {
    beneficiaryName: participantDisplayName(row),
    sharePercent: participantSharePercent(row),
    amount: grossAmount,
    grossAmount,
    netAmount,
    amountKind,
    amountKindLabel: AMOUNT_KIND_LABELS[amountKind],
    statusLabel: revenueSplitLegParticipantStatusLabel({
      status,
      isIssuerRemainder,
    }),
    accountOrWallet: accountOrWallet(row, accountLabels),
    isIssuerRemainder,
  };
}

/**
 * Resolve destinos de UMA parcela. Array vazio = sem split (usar conta da parcela).
 */
export function resolveInstallmentSplitDistribution(input: {
  saleId?: string | null;
  installmentId: string;
  paidAmount: number;
  splitView?: CanonicalSaleSplitView | null;
  accountLabels?: Record<string, string>;
}): CanonicalSplitLeg[] {
  const view = input.splitView;
  if (!view?.snapshot) return [];
  const accountLabels = input.accountLabels || {};
  const installmentId = str(input.installmentId);
  const legs = (view.legs || []).filter(
    (leg) => !installmentId || legInstallmentId(leg) === installmentId,
  );
  const usingPersistedLegs = legs.length > 0;
  const source: CanonicalSplitLegInput[] = usingPersistedLegs
    ? legs
    : view.participants || [];
  if (!source.length) return [];
  const fallbackStatus: RevenueSplitLegStatus = 'PENDING';
  const gross = Number(input.paidAmount) || 0;
  const resolved = source.map((row) =>
    toCanonicalLeg(row, gross, accountLabels, fallbackStatus),
  );
  if (!usingPersistedLegs) {
    const issuer = resolved.find((row) => row.isIssuerRemainder);
    if (issuer) {
      const others = resolved
        .filter((row) => row !== issuer)
        .reduce((sum, row) => sum + row.grossAmount, 0);
      const remainder = Math.round((gross - others) * 100) / 100;
      issuer.amount = remainder;
      issuer.grossAmount = remainder;
    }
  }
  return resolved.sort((a, b) => a.beneficiaryName.localeCompare(b.beneficiaryName, 'pt-BR'));
}

export type AggregatedDestinationRow = {
  beneficiaryName: string;
  sharePercent: number | null;
  amount: number;
  grossAmount: number;
  netAmount: number | null;
  amountKind: DestinationAmountKind;
  amountKindLabel: string;
};

export function aggregateDestinationTotals(legs: CanonicalSplitLeg[]): AggregatedDestinationRow[] {
  const map = new Map<
    string,
    {
      beneficiaryName: string;
      sharePercent: number | null;
      shareMismatch: boolean;
      grossAmount: number;
      netSum: number;
      hasNet: boolean;
      allSettled: boolean;
    }
  >();
  for (const leg of legs) {
    const key = leg.beneficiaryName;
    const prev = map.get(key);
    const net = leg.netAmount;
    if (prev) {
      prev.grossAmount = Math.round((prev.grossAmount + leg.grossAmount) * 100) / 100;
      if (net != null) {
        prev.netSum = Math.round((prev.netSum + net) * 100) / 100;
        prev.hasNet = true;
      } else {
        prev.allSettled = false;
      }
      if (prev.sharePercent != null && prev.sharePercent !== leg.sharePercent) {
        prev.shareMismatch = true;
      }
    } else {
      map.set(key, {
        beneficiaryName: leg.beneficiaryName,
        sharePercent: leg.sharePercent,
        shareMismatch: false,
        grossAmount: leg.grossAmount,
        netSum: net == null ? 0 : net,
        hasNet: net != null,
        allSettled: net != null,
      });
    }
  }
  return [...map.values()]
    .map((row) => {
      const amountKind: DestinationAmountKind = row.allSettled ? 'settled' : 'estimated';
      return {
        beneficiaryName: row.beneficiaryName,
        sharePercent: row.shareMismatch ? null : row.sharePercent,
        amount: row.grossAmount,
        grossAmount: row.grossAmount,
        netAmount: row.hasNet ? row.netSum : null,
        amountKind,
        amountKindLabel: AMOUNT_KIND_LABELS[amountKind],
      };
    })
    .sort((a, b) => a.beneficiaryName.localeCompare(b.beneficiaryName, 'pt-BR'));
}

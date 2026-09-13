/**
 * Adapter Asaas Company para Split de Recebimentos.
 *
 * A regra comercial (percentuais, emissor, snapshot) permanece no SV Lotes.
 * Este módulo só traduz legs locais para o payload Asaas e estados remotos.
 *
 * Decisões da Fase 3:
 * - Uma única cobrança com o valor integral da parcela.
 * - Array remoto = participantes NÃO emissores (N-1).
 * - Emissor NÃO entra no array; fica com o restante na conta Asaas emissora.
 * - percentualValue apenas — sem fixedValue.
 * - externalReference = id da charge_revenue_split_leg.
 * - Leg local do emissor existe para o financeiro mostrar 100%; sem provider_split_id.
 * - Emissão com split somente SANDBOX nesta fase.
 */
import type { BankEnvironment } from '@/lib/banking/types';
import { RevenueSplitError, type ChargeRevenueSplitLeg, type RevenueSplitLegStatus } from './types';

export const ASAAS_COMPANY_SPLIT_PROVIDER = 'ASAAS_COMPANY';

export const ASAAS_COMPANY_SPLIT_ADAPTER = {
  supportsSplit: true as const,
  provider: ASAAS_COMPANY_SPLIT_PROVIDER,
};

export const ASAAS_PRODUCTION_SPLIT_BLOCKED_MESSAGE =
  'Split de Recebimentos nesta fase só emite no Asaas Sandbox. A conta selecionada está em Production.';

export const ASAAS_SPLIT_MISSING_WALLET_MESSAGE =
  'Não é possível emitir a cobrança: há participante do Split sem Wallet ID Asaas.';

export type AsaasCompanyRemoteSplitInput = {
  walletId: string;
  percentualValue: number;
  externalReference: string;
  description?: string;
};

export type AsaasCompanyRemoteSplitState = {
  id?: string | null;
  walletId?: string | null;
  percentualValue?: number | null;
  totalValue?: number | null;
  status?: string | null;
  externalReference?: string | null;
};

const ASAAS_REMOTE_STATUS_MAP: Record<string, RevenueSplitLegStatus> = {
  PENDING: 'PENDING',
  AWAITING_CREDIT: 'PROCESSING',
  DONE: 'SETTLED',
  REFUSED: 'FAILED',
  BLOCKED: 'FAILED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
  CANCELED: 'CANCELLED',
};

export function isAsaasCompanySplitProvider(provider: string | null | undefined): boolean {
  return String(provider || '').trim().toUpperCase() === ASAAS_COMPANY_SPLIT_PROVIDER;
}

export function assertAsaasSandboxForSplit(environment: BankEnvironment): void {
  if (environment === 'PRODUCTION') {
    throw new RevenueSplitError('SANDBOX_ONLY', ASAAS_PRODUCTION_SPLIT_BLOCKED_MESSAGE);
  }
}

export function mapAsaasRemoteSplitStatus(status: string | null | undefined): RevenueSplitLegStatus {
  const key = String(status || '').trim().toUpperCase();
  return ASAAS_REMOTE_STATUS_MAP[key] || 'PENDING';
}

export function remoteLegsForAsaasCompany(legs: ChargeRevenueSplitLeg[]): ChargeRevenueSplitLeg[] {
  return legs.filter((leg) => !leg.isIssuerRemainder);
}

export function assertAsaasCompanySplitWalletsPresent(legs: ChargeRevenueSplitLeg[]): void {
  const missing = remoteLegsForAsaasCompany(legs).find(
    (leg) => !String(leg.destinationIdentifier || '').trim(),
  );
  if (!missing) return;
  throw new RevenueSplitError(
    'WALLET_MISSING',
    `${ASAAS_SPLIT_MISSING_WALLET_MESSAGE} Participante: ${missing.displayName || 'sem nome'}.`,
  );
}

/**
 * Monta o array `split` da API Asaas (campo singular no POST /payments).
 * Nunca inclui a wallet do emissor.
 */
export function buildAsaasCompanyRemoteSplits(
  legs: ChargeRevenueSplitLeg[],
): AsaasCompanyRemoteSplitInput[] {
  return remoteLegsForAsaasCompany(legs).map((leg) => {
    const walletId = String(leg.destinationIdentifier || '').trim();
    return {
      walletId,
      percentualValue: Number(leg.sharePercent),
      externalReference: leg.id,
      description: `SV LOTES split — ${leg.displayName}`.slice(0, 500),
    };
  });
}

export function matchLegToRemoteSplit(
  leg: ChargeRevenueSplitLeg,
  remotes: AsaasCompanyRemoteSplitState[],
): AsaasCompanyRemoteSplitState | null {
  const byExternal = remotes.find(
    (item) => String(item.externalReference || '').trim() === leg.id,
  );
  if (byExternal) return byExternal;
  if (leg.providerSplitId) {
    const byId = remotes.find((item) => String(item.id || '').trim() === leg.providerSplitId);
    if (byId) return byId;
  }
  if (leg.isIssuerRemainder) return null;
  const wallet = String(leg.destinationIdentifier || '').trim();
  if (!wallet) return null;
  const byWallet = remotes.filter((item) => String(item.walletId || '').trim() === wallet);
  return byWallet.length === 1 ? byWallet[0] : null;
}

export function extractAsaasPaymentSplits(payment: unknown): AsaasCompanyRemoteSplitState[] {
  if (!payment || typeof payment !== 'object') return [];
  const row = payment as Record<string, unknown>;
  const raw = Array.isArray(row.split) ? row.split : Array.isArray(row.splits) ? row.splits : [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: item.id == null ? null : String(item.id),
      walletId: item.walletId == null ? null : String(item.walletId),
      percentualValue:
        item.percentualValue == null || item.percentualValue === ''
          ? null
          : Number(item.percentualValue),
      totalValue:
        item.totalValue == null || item.totalValue === '' ? null : Number(item.totalValue),
      status: item.status == null ? null : String(item.status),
      externalReference:
        item.externalReference == null ? null : String(item.externalReference),
    }));
}

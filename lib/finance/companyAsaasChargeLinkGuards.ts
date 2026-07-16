/**
 * Proteções de vínculo Asaas Company — status sync e geração.
 * Sem migration: ENVIRONMENT_MISMATCH vive em erro tipado + raw_payload.
 */

import type { CompanyAsaasChargeResponse, CompanyAsaasChargeStatus } from '@/lib/finance/companyAsaasChargeTypes';

export class CompanyAsaasEnvironmentMismatchError extends Error {
  readonly code = 'ENVIRONMENT_MISMATCH' as const;
  readonly asaasPaymentId: string;
  readonly chargeId: string;

  constructor(message: string, opts: { asaasPaymentId: string; chargeId: string }) {
    super(message);
    this.name = 'CompanyAsaasEnvironmentMismatchError';
    this.asaasPaymentId = opts.asaasPaymentId;
    this.chargeId = opts.chargeId;
  }
}

export function isAsaasNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('não encontrad') ||
    lower.includes('nao encontrad')
  );
}

/** Nunca rebaixa PAID → outro status a partir de sync remoto. */
export function resolveSafeSyncedChargeStatus(params: {
  localStatus: CompanyAsaasChargeStatus;
  remoteMappedStatus: CompanyAsaasChargeStatus;
}): CompanyAsaasChargeStatus {
  if (params.localStatus === 'PAID') return 'PAID';
  return params.remoteMappedStatus;
}

export function shouldPreserveLocalPaidAt(params: {
  localStatus: CompanyAsaasChargeStatus;
  nextStatus: CompanyAsaasChargeStatus;
  localPaidAt: string | null | undefined;
  remotePaidAt: string | null | undefined;
}): string | null {
  if (params.nextStatus === 'PAID') {
    return params.remotePaidAt || params.localPaidAt || new Date().toISOString();
  }
  if (params.localStatus === 'PAID') {
    return params.localPaidAt ?? null;
  }
  return params.localPaidAt ?? null;
}

/** Gerar cobrança só quando não há vínculo ativo/pago/não resolvido. */
export function canGenerateAsaasChargeWithHistory(params: {
  installmentPaid: boolean;
  integrationActive: boolean;
  companyAsaasEnabled: boolean;
  ownerReadOnly: boolean;
  charge: CompanyAsaasChargeResponse | null | undefined;
  hasPaidChargeHistory?: boolean;
  hasUnresolvedChargeLink?: boolean;
  installmentsDataReady?: boolean;
  installmentId?: string;
}): boolean {
  if (params.installmentsDataReady === false) return false;
  if (params.installmentId !== undefined && !String(params.installmentId).trim()) return false;
  if (!params.companyAsaasEnabled || !params.integrationActive || params.ownerReadOnly) {
    return false;
  }
  if (params.installmentPaid) return false;
  if (params.hasPaidChargeHistory) return false;
  if (params.hasUnresolvedChargeLink) return false;
  if (params.charge) {
    if (params.charge.status === 'PAID') return false;
    if (params.charge.status === 'PENDING' || params.charge.status === 'REGISTERED' || params.charge.status === 'OVERDUE') {
      return false;
    }
    // CANCELLED / EXPIRED / FAILED → regeneração, não "gerar nova" sem fluxo explícito
    return false;
  }
  return true;
}

export type RefreshAllChargesBlockReason =
  | 'loading'
  | 'busy'
  | 'owner_readonly'
  | 'integration_unavailable'
  | 'no_active_charges'
  | 'environment_mismatch'
  | 'inconsistent_links'
  | null;

export function resolveRefreshAllChargesBlockReason(params: {
  loading: boolean;
  bulkBusy: boolean;
  ownerReadOnly: boolean;
  integrationReady: boolean;
  visibleChargeCount: number;
  hasEnvironmentMismatch?: boolean;
  hasInconsistentLinks?: boolean;
}): RefreshAllChargesBlockReason {
  if (params.ownerReadOnly) return 'owner_readonly';
  if (!params.integrationReady) return 'integration_unavailable';
  if (params.loading) return 'loading';
  if (params.bulkBusy) return 'busy';
  if (params.hasEnvironmentMismatch) return 'environment_mismatch';
  if (params.hasInconsistentLinks) return 'inconsistent_links';
  if (params.visibleChargeCount <= 0) return 'no_active_charges';
  return null;
}

export function formatRefreshAllChargesBlockReason(
  reason: RefreshAllChargesBlockReason,
): string | null {
  switch (reason) {
    case 'loading':
      return 'Carregando cobranças…';
    case 'busy':
      return 'Atualização em andamento…';
    case 'owner_readonly':
      return 'Perfil somente leitura — atualização indisponível.';
    case 'integration_unavailable':
      return 'Integração Asaas indisponível.';
    case 'no_active_charges':
      return 'Nenhuma cobrança ativa para atualizar.';
    case 'environment_mismatch':
      return 'Existem cobranças de outro ambiente.';
    case 'inconsistent_links':
      return 'Cobranças com vínculo inconsistente.';
    default:
      return null;
  }
}

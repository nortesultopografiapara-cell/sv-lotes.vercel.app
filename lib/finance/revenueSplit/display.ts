import type {
  RevenueSplitConfigStatus,
  RevenueSplitLegStatus,
  RevenueSplitPartyKind,
} from './types';

export const REVENUE_SPLIT_PARTY_KIND_LABELS: Record<RevenueSplitPartyKind, string> = {
  ISSUER: 'Administradora / emissor',
  OWNER: 'Proprietário / sócio',
  PARTNER: 'Parceiro',
  SPE: 'SPE',
};

export const REVENUE_SPLIT_STATUS_LABELS: Record<RevenueSplitConfigStatus, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
};

export const REVENUE_SPLIT_GATEWAY_ESTIMATE_WARNING =
  'Valor estimado. O valor efetivo depende das tarifas do gateway.';

export const REVENUE_SPLIT_MISSING_WALLET_MESSAGE =
  'Este participante ainda não possui uma carteira Asaas configurada.';

export const REVENUE_SPLIT_LEG_STATUS_LABELS: Record<RevenueSplitLegStatus, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  SETTLED: 'Concluído',
  FAILED: 'Falhou',
  REFUNDED: 'Estornado',
  CANCELLED: 'Cancelado',
};

export function revenueSplitLegParticipantStatusLabel(input: {
  status: RevenueSplitLegStatus;
  isIssuerRemainder: boolean;
}): string {
  if (input.status === 'SETTLED') {
    return input.isIssuerRemainder ? 'Recebido' : 'Repassado';
  }
  return REVENUE_SPLIT_LEG_STATUS_LABELS[input.status];
}

export function summarizeRevenueSplitLegsStatus(
  statuses: RevenueSplitLegStatus[],
): RevenueSplitLegStatus | null {
  if (!statuses.length) return null;
  if (statuses.some((status) => status === 'FAILED')) return 'FAILED';
  if (statuses.some((status) => status === 'REFUNDED')) return 'REFUNDED';
  if (statuses.every((status) => status === 'CANCELLED')) return 'CANCELLED';
  if (statuses.every((status) => status === 'SETTLED')) return 'SETTLED';
  if (statuses.some((status) => status === 'PROCESSING')) return 'PROCESSING';
  return 'PENDING';
}

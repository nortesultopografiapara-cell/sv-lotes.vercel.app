import type { RevenueSplitConfigStatus, RevenueSplitPartyKind } from './types';

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
  'Os valores são estimativas. O Split real será calculado pelo gateway sobre o valor líquido após tarifas.';

export const REVENUE_SPLIT_MISSING_WALLET_MESSAGE =
  'Este participante ainda não possui uma carteira Asaas configurada.';

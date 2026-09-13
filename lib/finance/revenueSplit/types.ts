/**
 * Split de Recebimentos — tipos da fundação (Fase 1).
 * Regra comercial do SV Lotes; provider (Asaas etc.) só entra na emissão futura.
 */

export const REVENUE_SPLIT_CONFIG_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;
export type RevenueSplitConfigStatus = (typeof REVENUE_SPLIT_CONFIG_STATUSES)[number];

export const REVENUE_SPLIT_PARTY_KINDS = ['ISSUER', 'OWNER', 'PARTNER', 'SPE'] as const;
export type RevenueSplitPartyKind = (typeof REVENUE_SPLIT_PARTY_KINDS)[number];

export const REVENUE_SPLIT_LEG_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SETTLED',
  'FAILED',
  'REFUNDED',
  'CANCELLED',
] as const;
export type RevenueSplitLegStatus = (typeof REVENUE_SPLIT_LEG_STATUSES)[number];

export const REVENUE_SPLIT_DESTINATION_TYPES = ['WALLET_ID', 'EXTERNAL_ACCOUNT_ID', 'OTHER'] as const;
export type RevenueSplitDestinationType = (typeof REVENUE_SPLIT_DESTINATION_TYPES)[number];

export const REVENUE_SPLIT_DESTINATION_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type RevenueSplitDestinationStatus = (typeof REVENUE_SPLIT_DESTINATION_STATUSES)[number];

/** 4 casas decimais (numeric(7,4)). 100.0000% = 1_000_000 unidades. */
export const REVENUE_SPLIT_SHARE_SCALE = 10_000;
export const REVENUE_SPLIT_FULL_SHARE_UNITS = 100 * REVENUE_SPLIT_SHARE_SCALE;

export const REVENUE_SPLIT_DEFAULT_CURRENCY = 'BRL';

export type RevenueSplitActor = {
  role?: string | null;
  companyId: string;
  userId?: string | null;
};

export type ProjectRevenueSplitConfig = {
  id: string;
  companyId: string;
  projectId: string;
  enabled: boolean;
  status: RevenueSplitConfigStatus;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRevenueSplitParticipant = {
  id: string;
  configId: string;
  companyId: string;
  projectId: string;
  displayName: string;
  partyKind: RevenueSplitPartyKind;
  userId: string | null;
  financialAccountId: string | null;
  sharePercent: number;
  isIssuerRemainder: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRevenueSplitParticipantInput = {
  displayName: string;
  partyKind: RevenueSplitPartyKind;
  userId?: string | null;
  financialAccountId?: string | null;
  sharePercent: number;
  isIssuerRemainder?: boolean;
  sortOrder?: number;
  active?: boolean;
};

export type FinancialAccountProviderDestination = {
  id: string;
  companyId: string;
  financialAccountId: string;
  provider: string;
  destinationType: RevenueSplitDestinationType;
  destinationIdentifier: string;
  status: RevenueSplitDestinationStatus;
  createdAt: string;
  updatedAt: string;
};

export type SaleRevenueSplitSnapshot = {
  id: string;
  companyId: string;
  projectId: string;
  saleId: string;
  sourceConfigId: string | null;
  provider: string | null;
  currency: string;
  frozenAt: string;
  createdAt: string;
};

export type SaleRevenueSplitSnapshotParticipant = {
  id: string;
  snapshotId: string;
  companyId: string;
  sourceParticipantId: string | null;
  displayName: string;
  partyKind: RevenueSplitPartyKind;
  userId: string | null;
  financialAccountId: string | null;
  destinationProvider: string | null;
  destinationType: string | null;
  destinationIdentifier: string | null;
  sharePercent: number;
  isIssuerRemainder: boolean;
  sortOrder: number;
  createdAt: string;
};

export type ChargeRevenueSplitLegDraft = {
  companyId: string;
  saleId: string;
  installmentId: string;
  chargeId: string | null;
  snapshotId: string;
  snapshotParticipantId: string;
  provider: string;
  providerSplitId: string | null;
  destinationType: string | null;
  destinationIdentifier: string | null;
  sharePercent: number;
  isIssuerRemainder: boolean;
  displayName: string;
  grossAmountEstimate: number | null;
  netAmount: number | null;
  status: RevenueSplitLegStatus;
  failureReason: string | null;
};

export type RevenueSplitProjectRecord = {
  id: string;
  companyId: string;
};

export type RevenueSplitSaleRecord = {
  id: string;
  companyId: string;
  projectId: string;
};

export type RevenueSplitUserRecord = {
  id: string;
  companyId: string;
};

export type RevenueSplitFinancialAccountRecord = {
  id: string;
  companyId: string;
  active: boolean;
};

export type GetProjectRevenueSplitResult = {
  present: boolean;
  operational: boolean;
  config: ProjectRevenueSplitConfig | null;
  participants: ProjectRevenueSplitParticipant[];
};

export type FreezeSaleRevenueSplitResult = {
  frozen: boolean;
  duplicated: boolean;
  reason: 'SPLIT_NOT_ENABLED' | 'SNAPSHOT_CREATED' | 'SNAPSHOT_ALREADY_EXISTS';
  snapshot: SaleRevenueSplitSnapshot | null;
  participants: SaleRevenueSplitSnapshotParticipant[];
};

export type RevenueSplitValidationIssue = {
  code: string;
  message: string;
};

export type RevenueSplitValidationResult = {
  ok: boolean;
  issues: RevenueSplitValidationIssue[];
};

export class RevenueSplitError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RevenueSplitError';
    this.code = code;
  }
}

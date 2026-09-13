import { isCompanyAsaasPaidWebhookEvent } from '@/lib/finance/companyAsaasPaymentReconciliation';
import { mapAsaasRemoteSplitStatus } from './asaasCompanySplitAdapter';
import type { ChargeRevenueSplitLeg, RevenueSplitLegStatus } from './types';

export const ASAAS_SPLIT_WEBHOOK_EVENTS = [
  'PAYMENT_SPLIT_DONE',
  'PAYMENT_SPLIT_CANCELLED',
  'PAYMENT_SPLIT_DIVERGENCE_BLOCKED',
] as const;

export type CompanyAsaasWebhookKind = 'split' | 'paid' | 'cancelled' | 'ignore';

const CANCELLED_CHARGE_EVENTS = new Set(['PAYMENT_DELETED', 'PAYMENT_REFUNDED']);

const SPLIT_EVENT_STATUS: Record<string, RevenueSplitLegStatus> = {
  PAYMENT_SPLIT_DONE: 'SETTLED',
  PAYMENT_SPLIT_CANCELLED: 'CANCELLED',
  PAYMENT_SPLIT_DIVERGENCE_BLOCKED: 'FAILED',
};

export function isAsaasSplitWebhookEvent(eventType: string): boolean {
  return (ASAAS_SPLIT_WEBHOOK_EVENTS as readonly string[]).includes(eventType);
}

export function classifyCompanyAsaasWebhookEvent(eventType: string): CompanyAsaasWebhookKind {
  if (isAsaasSplitWebhookEvent(eventType)) return 'split';
  if (CANCELLED_CHARGE_EVENTS.has(eventType)) return 'cancelled';
  if (isCompanyAsaasPaidWebhookEvent(eventType)) return 'paid';
  return 'ignore';
}

export function shouldReconcileCompanyAsaasPayment(eventType: string): boolean {
  return classifyCompanyAsaasWebhookEvent(eventType) === 'paid';
}

export function splitStatusForWebhookEvent(eventType: string): RevenueSplitLegStatus | null {
  return SPLIT_EVENT_STATUS[eventType] || null;
}

export function chargeCancelLegStatus(eventType: string): RevenueSplitLegStatus {
  return eventType === 'PAYMENT_REFUNDED' ? 'REFUNDED' : 'CANCELLED';
}

export function resolveSplitWebhookTargetLegIds(input: {
  legs: ChargeRevenueSplitLeg[];
  eventType: string;
  splitId?: string | null;
  externalReference?: string | null;
  walletId?: string | null;
}): string[] {
  const splitId = String(input.splitId || '').trim();
  const external = String(input.externalReference || '').trim();
  const wallet = String(input.walletId || '').trim();
  const remotes = input.legs.filter((leg) => !leg.isIssuerRemainder);

  if (external) {
    const match = remotes.find((leg) => leg.id === external);
    if (match) return [match.id];
  }
  if (splitId) {
    const match = remotes.find((leg) => String(leg.providerSplitId || '').trim() === splitId);
    if (match) return [match.id];
  }
  if (wallet) {
    const matches = remotes.filter(
      (leg) => String(leg.destinationIdentifier || '').trim() === wallet,
    );
    if (matches.length === 1) return [matches[0].id];
  }
  if (input.eventType === 'PAYMENT_SPLIT_DONE' || input.eventType === 'PAYMENT_SPLIT_CANCELLED') {
    return remotes.map((leg) => leg.id);
  }
  return remotes.map((leg) => leg.id);
}

export function nextLegStatusFromRemote(
  current: RevenueSplitLegStatus,
  remoteStatus: string | null | undefined,
): RevenueSplitLegStatus {
  return mapAsaasRemoteSplitStatus(remoteStatus) || current;
}

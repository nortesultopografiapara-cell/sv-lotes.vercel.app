/**
 * Orquestração da emissão Asaas Company com Split.
 * freeze → legs locais (incluindo emissor) → payload remoto N-1.
 */
import type { BankEnvironment } from '@/lib/banking/types';
import {
  ASAAS_COMPANY_SPLIT_PROVIDER,
  assertAsaasCompanySplitWalletsPresent,
  assertAsaasSandboxForSplit,
  buildAsaasCompanyRemoteSplits,
  extractAsaasPaymentSplits,
  matchLegToRemoteSplit,
  mapAsaasRemoteSplitStatus,
  type AsaasCompanyRemoteSplitInput,
} from './asaasCompanySplitAdapter';
import { createRevenueSplitService } from './service';
import type { RevenueSplitStore } from './store';
import type {
  ChargeRevenueSplitLeg,
  RevenueSplitLegStatus,
} from './types';

export type PreparedAsaasCompanyChargeSplit = {
  enabled: boolean;
  remoteSplits: AsaasCompanyRemoteSplitInput[];
  legs: ChargeRevenueSplitLeg[];
};

export async function prepareAsaasCompanyChargeSplit(input: {
  store: RevenueSplitStore;
  companyId: string;
  saleId: string | null | undefined;
  installmentId: string;
  grossAmount: number;
  environment: BankEnvironment;
}): Promise<PreparedAsaasCompanyChargeSplit> {
  const saleId = String(input.saleId || '').trim();
  if (!saleId) {
    return { enabled: false, remoteSplits: [], legs: [] };
  }

  const service = createRevenueSplitService(input.store);
  const frozen = await service.ensureSaleRevenueSplitSnapshot({
    companyId: input.companyId,
    saleId,
    provider: ASAAS_COMPANY_SPLIT_PROVIDER,
  });
  if (!frozen.frozen || !frozen.snapshot) {
    return { enabled: false, remoteSplits: [], legs: [] };
  }

  const legs = await service.materializeChargeRevenueSplitLegs({
    snapshot: frozen.snapshot,
    participants: frozen.participants,
    installmentId: input.installmentId,
    chargeId: null,
    provider: ASAAS_COMPANY_SPLIT_PROVIDER,
    grossAmount: input.grossAmount,
  });
  assertAsaasCompanySplitWalletsPresent(legs);
  const remoteSplits = buildAsaasCompanyRemoteSplits(legs);
  if (remoteSplits.length > 0) {
    assertAsaasSandboxForSplit(input.environment);
  }
  return { enabled: true, remoteSplits, legs };
}

export async function attachAsaasChargeToSplitLegs(input: {
  store: RevenueSplitStore;
  companyId: string;
  installmentId: string;
  chargeId: string;
  payment?: unknown;
}): Promise<ChargeRevenueSplitLeg[]> {
  const legs = await input.store.listLegsByInstallment(input.installmentId);
  const remotes = extractAsaasPaymentSplits(input.payment);
  const out: ChargeRevenueSplitLeg[] = [];
  for (const leg of legs) {
    if (leg.companyId !== input.companyId) continue;
    const remote = matchLegToRemoteSplit(leg, remotes);
    out.push(
      await input.store.updateLeg(leg.id, input.companyId, {
        chargeId: input.chargeId,
        providerSplitId: remote?.id || (leg.isIssuerRemainder ? null : leg.providerSplitId),
        netAmount:
          remote?.totalValue == null || !Number.isFinite(Number(remote.totalValue))
            ? null
            : Number(remote.totalValue),
        status: remote?.status ? mapAsaasRemoteSplitStatus(remote.status) : 'PENDING',
        failureReason: null,
      }),
    );
  }
  return out;
}

export async function syncChargeRevenueSplitLegsFromAsaasPayment(input: {
  store: RevenueSplitStore;
  companyId: string;
  chargeId: string;
  payment?: unknown;
  chargePaid?: boolean;
}): Promise<ChargeRevenueSplitLeg[]> {
  const legs = await input.store.listLegsByCharge(input.chargeId);
  if (!legs.length) return [];
  const remotes = extractAsaasPaymentSplits(input.payment);
  const out: ChargeRevenueSplitLeg[] = [];
  for (const leg of legs) {
    if (leg.companyId !== input.companyId) continue;
    const remote = matchLegToRemoteSplit(leg, remotes);
    let status: RevenueSplitLegStatus = leg.status;
    let netAmount = leg.netAmount;
    let providerSplitId = leg.providerSplitId;
    if (remote?.status) status = mapAsaasRemoteSplitStatus(remote.status);
    if (remote?.id) providerSplitId = String(remote.id);
    if (remote?.totalValue != null && Number.isFinite(Number(remote.totalValue))) {
      netAmount = Number(remote.totalValue);
    }
    if (input.chargePaid && leg.isIssuerRemainder && status === 'PENDING') {
      status = 'SETTLED';
    }
    if (input.chargePaid && !leg.isIssuerRemainder && status === 'PENDING') {
      status = 'PROCESSING';
    }
    out.push(
      await input.store.updateLeg(leg.id, input.companyId, {
        providerSplitId,
        netAmount,
        status,
      }),
    );
  }
  return out;
}

export async function setChargeRevenueSplitLegsStatus(input: {
  store: RevenueSplitStore;
  companyId: string;
  chargeId?: string | null;
  installmentId?: string | null;
  status: RevenueSplitLegStatus;
  failureReason?: string | null;
}): Promise<void> {
  const legs = input.chargeId
    ? await input.store.listLegsByCharge(input.chargeId)
    : input.installmentId
      ? await input.store.listLegsByInstallment(input.installmentId)
      : [];
  for (const leg of legs) {
    if (leg.companyId !== input.companyId) continue;
    await input.store.updateLeg(leg.id, input.companyId, {
      status: input.status,
      failureReason: input.failureReason ?? null,
    });
  }
}

export async function applyAsaasSplitWebhookToLegs(input: {
  store: RevenueSplitStore;
  companyId: string;
  chargeId: string;
  eventType: string;
  targetLegIds: string[];
  status: RevenueSplitLegStatus;
  providerSplitId?: string | null;
  netAmount?: number | null;
}): Promise<ChargeRevenueSplitLeg[]> {
  const legs = await input.store.listLegsByCharge(input.chargeId);
  const targets = new Set(input.targetLegIds);
  const out: ChargeRevenueSplitLeg[] = [];
  for (const leg of legs) {
    if (leg.companyId !== input.companyId) continue;
    if (targets.size && !targets.has(leg.id)) continue;
    if (leg.isIssuerRemainder && input.status === 'SETTLED') continue;
    out.push(
      await input.store.updateLeg(leg.id, input.companyId, {
        status: input.status,
        providerSplitId: input.providerSplitId || leg.providerSplitId,
        netAmount: input.netAmount == null ? leg.netAmount : input.netAmount,
        failureReason: input.status === 'FAILED' ? input.eventType : null,
      }),
    );
  }
  return out;
}

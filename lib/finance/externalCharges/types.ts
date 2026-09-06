/**
 * Camada genérica de cobrança externa (Fase 5A).
 * A Troca de lote fala só com esta interface. Novos bancos entram como adapter.
 *
 * Fase 5A: listar + classificar.
 * Fase 5B: cancel/generate nos adapters Asaas/Inter via services oficiais.
 * C6/Bradesco/Nubank e futuros: unimplemented, non_cancelable, sem API.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExternalChargeCancelResult,
  ExternalChargeGenerateResult,
} from '@/lib/finance/externalCharges/mutationTypes';

export const EXTERNAL_CHARGE_PROVIDER_ASAAS = 'ASAAS';
export const EXTERNAL_CHARGE_PROVIDER_INTER = 'INTER';

export const LOT_SWAP_CHARGES_MUTATION_DISABLED = 'LOT_SWAP_CHARGES_MUTATION_DISABLED';
export const LOT_SWAP_CHARGES_MUTATION_DISABLED_MESSAGE =
  'Este provider ainda não implementa cancelamento/geração de cobrança.';

export type ExternalChargeClassification =
  | 'paid'
  | 'cancelable'
  | 'non_cancelable'
  | 'absent';

export type ExternalChargeRecord = {
  provider: string;
  companyId: string;
  chargeId: string;
  saleId: string | null;
  receiptId: string | null;
  status: string | null;
  externalId: string | null;
  classification: ExternalChargeClassification;
};

export type ListExternalChargesInput = {
  companyId: string;
  saleId?: string | null;
  receiptIds?: string[];
};

export type ExternalChargeProvider = {
  code: string;
  displayName: string;
  supportsCancellation: boolean;
  supportsGeneration: boolean;
  classifyChargeStatus(status?: string | null): ExternalChargeClassification;
  listChargesForReceipts(
    admin: SupabaseClient,
    input: ListExternalChargesInput,
  ): Promise<ExternalChargeRecord[]>;
  cancelCancelableCharge(
    admin: SupabaseClient,
    input: { companyId: string; chargeId: string },
  ): Promise<ExternalChargeCancelResult>;
  generateMissingCharges(
    admin: SupabaseClient,
    input: { companyId: string; saleId: string; receiptIds: string[] },
  ): Promise<ExternalChargeGenerateResult>;
};

export class ExternalChargeMutationDisabledError extends Error {
  code = LOT_SWAP_CHARGES_MUTATION_DISABLED;

  constructor(message = LOT_SWAP_CHARGES_MUTATION_DISABLED_MESSAGE) {
    super(message);
    this.name = 'ExternalChargeMutationDisabledError';
  }
}

export function rejectExternalChargeMutation(): never {
  throw new ExternalChargeMutationDisabledError();
}

export function normalizeExternalChargeProviderCode(
  raw?: string | null,
): string | null {
  const code = String(raw || '')
    .trim()
    .toUpperCase();
  if (!code) return null;
  if (code === 'ASAAS_COMPANY' || code === 'ASAAS') return EXTERNAL_CHARGE_PROVIDER_ASAAS;
  if (code === 'INTER') return EXTERNAL_CHARGE_PROVIDER_INTER;
  return code;
}

export function mapReleaseBucketToExternalClassification(
  bucket: 'paid' | 'open' | 'cancelled' | 'refunded' | 'other',
): ExternalChargeClassification {
  if (bucket === 'paid') return 'paid';
  if (bucket === 'open') return 'cancelable';
  if (bucket === 'cancelled' || bucket === 'refunded') return 'absent';
  return 'non_cancelable';
}

/**
 * Camada genérica de cobrança externa (Fase 5A).
 * A Troca de lote fala só com esta interface. Novos bancos entram como adapter.
 *
 * Fase 5A: listar + classificar. cancel/generate existem no contrato e
 * recusam mutação até a Fase 5B. Sem API bancária real nesta fase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const EXTERNAL_CHARGE_PROVIDER_ASAAS = 'ASAAS';
export const EXTERNAL_CHARGE_PROVIDER_INTER = 'INTER';

export const LOT_SWAP_CHARGES_MUTATION_DISABLED = 'LOT_SWAP_CHARGES_MUTATION_DISABLED';
export const LOT_SWAP_CHARGES_MUTATION_DISABLED_MESSAGE =
  'Cancelamento e geração de cobrança externa ficam para a Fase 5B. A Fase 5A só classifica.';

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
  ): Promise<never>;
  generateMissingCharges(
    admin: SupabaseClient,
    input: { companyId: string; saleId: string; receiptIds: string[] },
  ): Promise<never>;
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

/**
 * Injeção de mutações oficiais para testes (APIs mockadas).
 * Produção/Preview usam os services reais só quando LOT_SWAP_EXTERNAL_CHARGES_LIVE=true.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExternalChargeCancelResult,
  ExternalChargeGenerateResult,
} from '@/lib/finance/externalCharges/mutationTypes';

export type ExternalChargeMutationFns = {
  cancelAsaasCharge?: (
    admin: SupabaseClient,
    companyId: string,
    chargeId: string,
  ) => Promise<ExternalChargeCancelResult>;
  generateAsaasCharges?: (
    admin: SupabaseClient,
    input: { companyId: string; saleId: string; receiptIds: string[] },
  ) => Promise<ExternalChargeGenerateResult>;
  cancelInterCharge?: (
    admin: SupabaseClient,
    companyId: string,
    chargeId: string,
  ) => Promise<ExternalChargeCancelResult>;
  generateInterCharges?: (
    admin: SupabaseClient,
    input: { companyId: string; saleId: string; receiptIds: string[] },
  ) => Promise<ExternalChargeGenerateResult>;
};

let injected: ExternalChargeMutationFns = {};

export function setExternalChargeMutationFnsForTests(
  fns: ExternalChargeMutationFns,
): void {
  injected = { ...fns };
}

export function resetExternalChargeMutationFnsForTests(): void {
  injected = {};
}

export function getExternalChargeMutationFns(): ExternalChargeMutationFns {
  return injected;
}

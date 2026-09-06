/**
 * Bootstrap do registry de cobrança externa.
 * Registrar um banco novo: criar adapter e chamar registerExternalChargeProvider.
 */

import { asaasExternalChargeProvider } from '@/lib/finance/externalCharges/asaasAdapter';
import { interExternalChargeProvider } from '@/lib/finance/externalCharges/interAdapter';
import {
  getExternalChargeProvider,
  getRegisteredExternalChargeProvider,
  listRegisteredExternalChargeProviders,
  registerExternalChargeProvider,
} from '@/lib/finance/externalCharges/registry';

let bootstrapped = false;

export function ensureExternalChargeProvidersRegistered(): void {
  if (bootstrapped && listRegisteredExternalChargeProviders().length > 0) return;
  if (!getRegisteredExternalChargeProvider(asaasExternalChargeProvider.code)) {
    registerExternalChargeProvider(asaasExternalChargeProvider);
  }
  if (!getRegisteredExternalChargeProvider(interExternalChargeProvider.code)) {
    registerExternalChargeProvider(interExternalChargeProvider);
  }
  bootstrapped = true;
}

ensureExternalChargeProvidersRegistered();

export {
  asaasExternalChargeProvider,
  interExternalChargeProvider,
  getExternalChargeProvider,
  getRegisteredExternalChargeProvider,
  listRegisteredExternalChargeProviders,
  registerExternalChargeProvider,
};
export { createUnimplementedExternalChargeProvider } from '@/lib/finance/externalCharges/unimplementedAdapter';
export { resetExternalChargeProviderRegistryForTests } from '@/lib/finance/externalCharges/registry';
export {
  resetExternalChargeMutationFnsForTests,
  setExternalChargeMutationFnsForTests,
} from '@/lib/finance/externalCharges/mutationDeps';
export {
  EXTERNAL_CHARGE_PROVIDER_ASAAS,
  EXTERNAL_CHARGE_PROVIDER_INTER,
  LOT_SWAP_CHARGES_MUTATION_DISABLED,
  ExternalChargeMutationDisabledError,
  normalizeExternalChargeProviderCode,
  rejectExternalChargeMutation,
} from '@/lib/finance/externalCharges/types';
export type {
  ExternalChargeClassification,
  ExternalChargeProvider,
  ExternalChargeRecord,
  ListExternalChargesInput,
} from '@/lib/finance/externalCharges/types';
export type {
  ExternalChargeCancelResult,
  ExternalChargeGenerateResult,
} from '@/lib/finance/externalCharges/mutationTypes';

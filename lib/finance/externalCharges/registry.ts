/**
 * Registry de providers de cobrança externa.
 * Novos bancos: implementar ExternalChargeProvider e registrar aqui.
 * Sem switch espalhado na Troca de lote.
 */

import type { ExternalChargeProvider } from '@/lib/finance/externalCharges/types';
import {
  normalizeExternalChargeProviderCode,
} from '@/lib/finance/externalCharges/types';
import { createUnimplementedExternalChargeProvider } from '@/lib/finance/externalCharges/unimplementedAdapter';

const providers = new Map<string, ExternalChargeProvider>();
const unimplementedCache = new Map<string, ExternalChargeProvider>();

export function registerExternalChargeProvider(provider: ExternalChargeProvider): void {
  const code = normalizeExternalChargeProviderCode(provider.code);
  if (!code) {
    throw new Error('Provider de cobrança externa sem código.');
  }
  providers.set(code, { ...provider, code });
}

export function unregisterExternalChargeProvider(code: string): void {
  const normalized = normalizeExternalChargeProviderCode(code);
  if (normalized) providers.delete(normalized);
}

export function listRegisteredExternalChargeProviders(): ExternalChargeProvider[] {
  return [...providers.values()];
}

export function getRegisteredExternalChargeProvider(
  code?: string | null,
): ExternalChargeProvider | null {
  const normalized = normalizeExternalChargeProviderCode(code);
  if (!normalized) return null;
  return providers.get(normalized) || null;
}

export function getExternalChargeProvider(
  code?: string | null,
): ExternalChargeProvider {
  const normalized = normalizeExternalChargeProviderCode(code);
  const registered = getRegisteredExternalChargeProvider(normalized);
  if (registered) return registered;
  if (!normalized) {
    return createUnimplementedExternalChargeProvider('UNKNOWN');
  }
  const cached = unimplementedCache.get(normalized);
  if (cached) return cached;
  const created = createUnimplementedExternalChargeProvider(normalized);
  unimplementedCache.set(normalized, created);
  return created;
}

export function resetExternalChargeProviderRegistryForTests(): void {
  providers.clear();
  unimplementedCache.clear();
}

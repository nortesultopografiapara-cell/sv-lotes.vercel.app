import { AsaasPaymentProvider, isAsaasConfigured } from './asaas';
import { MockPaymentProvider } from './mock';
import type { PaymentProvider } from './types';
import {
  assertSaasPaymentGatewayConfigured,
  isProductionPaymentEnvironment,
  isRealPaymentProviderConfigured,
} from '@/lib/saasPaymentGateway';

export type PaymentProviderName = 'asaas' | 'efi' | 'mercadopago' | 'pagbank' | 'mock';

export function resolvePaymentProviderName(): PaymentProviderName {
  if (isAsaasConfigured()) return 'asaas';
  if (!isProductionPaymentEnvironment()) return 'mock';
  return 'mock';
}

export function getPaymentProvider(): PaymentProvider {
  assertSaasPaymentGatewayConfigured();

  const name = resolvePaymentProviderName();
  switch (name) {
    case 'asaas':
      return new AsaasPaymentProvider();
    default:
      return new MockPaymentProvider();
  }
}

export function isPaymentProviderReal(name: PaymentProviderName): boolean {
  return name !== 'mock';
}

export { isRealPaymentProviderConfigured, isAsaasConfigured };

export * from './types';
export { AsaasPaymentProvider } from './asaas';
export { MockPaymentProvider } from './mock';

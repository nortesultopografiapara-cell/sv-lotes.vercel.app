/**
 * Regras de gateway SaaS — mock só em development/test; produção exige provider real.
 */

import { isAsaasConfigured } from '@/lib/payments/providers/asaas';
import type { PaymentProviderName } from '@/lib/payments/providers/index';

export const SAAS_PAYMENT_GATEWAY_NOT_CONFIGURED_MESSAGE =
  'Gateway de pagamento não configurado. Configure ASAAS_API_KEY.';

export function isProductionPaymentEnvironment(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isRealPaymentProviderConfigured(): boolean {
  if (isAsaasConfigured()) return true;
  const forced = String(process.env.SAAS_PAYMENT_PROVIDER || '').trim().toLowerCase();
  if (forced === 'asaas' && isAsaasConfigured()) return true;
  // Stubs (efi, mercadopago, pagbank) exigirão chaves próprias em fases futuras.
  return false;
}

/** Gateway pronto para gerar cobrança PIX. */
export function isSaasPaymentGatewayConfigured(): boolean {
  if (isRealPaymentProviderConfigured()) return true;
  if (!isProductionPaymentEnvironment()) return true;
  return false;
}

export function assertSaasPaymentGatewayConfigured(): void {
  if (isSaasPaymentGatewayConfigured()) return;
  throw new Error(SAAS_PAYMENT_GATEWAY_NOT_CONFIGURED_MESSAGE);
}

export function resolvePaymentProviderNameForBilling(): PaymentProviderName {
  if (isAsaasConfigured()) return 'asaas';
  if (!isProductionPaymentEnvironment()) return 'mock';
  return 'mock';
}

export function getSaasPaymentGatewayStatus(): {
  configured: boolean;
  provider: PaymentProviderName | null;
  environment: 'production' | 'development';
  message: string | null;
} {
  const configured = isSaasPaymentGatewayConfigured();
  return {
    configured,
    provider: configured ? resolvePaymentProviderNameForBilling() : null,
    environment: isProductionPaymentEnvironment() ? 'production' : 'development',
    message: configured ? null : SAAS_PAYMENT_GATEWAY_NOT_CONFIGURED_MESSAGE,
  };
}

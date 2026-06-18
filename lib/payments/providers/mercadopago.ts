import type { PaymentProvider } from './types';
import { MockPaymentProvider } from './mock';

/** Stub Mercado Pago — implementação futura. */
export class MercadoPagoPaymentProvider extends MockPaymentProvider {
  readonly providerName = 'mercadopago';

  async createPixCharge(_input: Parameters<PaymentProvider['createPixCharge']>[0]) {
    throw new Error('Provider Mercado Pago ainda não implementado. Configure ASAAS ou use mock.');
  }
}

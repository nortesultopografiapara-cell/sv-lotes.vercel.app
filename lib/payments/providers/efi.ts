import type { PaymentProvider } from './types';
import { MockPaymentProvider } from './mock';

/** Stub Efí Bank (Gerencianet) — implementação futura. */
export class EfiPaymentProvider extends MockPaymentProvider {
  readonly providerName = 'efi';

  async createPixCharge(input: Parameters<PaymentProvider['createPixCharge']>[0]) {
    throw new Error('Provider Efí Bank ainda não implementado. Configure ASAAS ou use mock.');
  }
}

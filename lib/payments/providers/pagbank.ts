import type { PaymentProvider } from './types';
import { MockPaymentProvider } from './mock';

/** Stub PagBank — implementação futura. */
export class PagBankPaymentProvider extends MockPaymentProvider {
  readonly providerName = 'pagbank';

  async createPixCharge(_input: Parameters<PaymentProvider['createPixCharge']>[0]) {
    throw new Error('Provider PagBank ainda não implementado. Configure ASAAS ou use mock.');
  }
}

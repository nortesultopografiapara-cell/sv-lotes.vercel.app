/**

 * Interface de gateway de cobrança SaaS — delega para lib/payments/providers.

 */



import {

  getPaymentProvider,

  mapProviderStatusToChargeStatus,

} from '@/lib/payments/providers';

import type { PaymentProvider } from '@/lib/payments/providers/types';



export type PixChargeInput = {

  companyId: string;

  invoiceId: string;

  invoiceNumber: string;

  amount: number;

  dueDate: string;

  description: string;

  payerName?: string;

  payerDocument?: string;

};



export type PixChargeResult = {

  externalChargeId: string;

  pixCode: string;

  pixQrCode: string;

  status: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'CANCELADO';

  provider: string;

};



export type ChargeStatusResult = {

  externalChargeId: string;

  status: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'CANCELADO';

  paidAt?: string | null;

};



export interface GatewayBillingProvider {

  readonly providerName: string;

  createPixCharge(input: PixChargeInput): Promise<PixChargeResult>;

  cancelCharge(externalChargeId: string): Promise<void>;

  getChargeStatus(externalChargeId: string): Promise<ChargeStatusResult>;

}



function adaptProvider(provider: PaymentProvider): GatewayBillingProvider {

  return {

    providerName: provider.providerName,

    async createPixCharge(input: PixChargeInput): Promise<PixChargeResult> {

      const result = await provider.createPixCharge({

        companyId: input.companyId,

        chargeId: input.invoiceId,

        amount: input.amount,

        dueDate: input.dueDate,

        description: input.description,

        payerName: input.payerName,

        payerDocument: input.payerDocument,

      });

      const status = mapProviderStatusToChargeStatus(result.status);

      const legacyStatus =

        status === 'PAID'

          ? 'PAGO'

          : status === 'OVERDUE'

            ? 'VENCIDO'

            : status === 'CANCELLED'

              ? 'CANCELADO'

              : 'PENDENTE';

      return {

        externalChargeId: result.paymentId,

        pixCode: result.pixCopyPaste,

        pixQrCode: result.pixQrCode,

        status: legacyStatus,

        provider: result.provider,

      };

    },

    cancelCharge: (id) => provider.cancelCharge(id),

    async getChargeStatus(externalChargeId: string): Promise<ChargeStatusResult> {

      const result = await provider.getChargeStatus(externalChargeId);

      const status = mapProviderStatusToChargeStatus(result.status);

      const legacyStatus =

        status === 'PAID'

          ? 'PAGO'

          : status === 'OVERDUE'

            ? 'VENCIDO'

            : status === 'CANCELLED'

              ? 'CANCELADO'

              : 'PENDENTE';

      return { externalChargeId, status: legacyStatus, paidAt: result.paidAt ?? null };

    },

  };

}



/** Provider mock — compatibilidade com testes legados. */

export class MockGatewayBillingProvider implements GatewayBillingProvider {
  readonly providerName = 'mock';

  private get inner() {
    return adaptProvider(getPaymentProvider());
  }

  createPixCharge(input: PixChargeInput) {
    return this.inner.createPixCharge(input);
  }
  cancelCharge(id: string) {
    return this.inner.cancelCharge(id);
  }
  getChargeStatus(id: string) {
    return this.inner.getChargeStatus(id);
  }
}

let defaultProvider: GatewayBillingProvider | null = null;

export function getGatewayBillingProvider(): GatewayBillingProvider {
  if (!defaultProvider) {
    defaultProvider = adaptProvider(getPaymentProvider());
  }
  return defaultProvider;
}



export function setGatewayBillingProvider(provider: GatewayBillingProvider): void {

  defaultProvider = provider;

}


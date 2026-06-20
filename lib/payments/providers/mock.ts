import type {
  ChargeStatusProviderResult,
  CreatePixChargeInput,
  PaymentDeleteResult,
  PaymentProvider,
  PixChargeProviderResult,
} from './types';
import { normalizeSaasBillingType } from './types';

/** Provider mock — desenvolvimento e fallback sem gateway configurado. */
export class MockPaymentProvider implements PaymentProvider {
  readonly providerName = 'mock';

  async createPixCharge(input: CreatePixChargeInput): Promise<PixChargeProviderResult> {
    const billingType = normalizeSaasBillingType(input.billingType);
    const paymentId = `mock_${input.chargeId}_${Date.now()}`;

    if (billingType === 'BOLETO') {
      return {
        paymentId,
        pixCopyPaste: '',
        pixQrCode: '',
        paymentUrl: `https://sandbox.asaas.com/i/${paymentId}`,
        invoiceUrl: `https://sandbox.asaas.com/i/${paymentId}`,
        bankSlipUrl: `https://sandbox.asaas.com/b/pdf/${paymentId}`,
        bankSlipIdentification: `23790.00000 00000.000000 00000.000000 0 00000000000000`,
        billingType: 'BOLETO',
        status: 'PENDING',
        provider: this.providerName,
      };
    }

    const pixCopyPaste = `00020126580014BR.GOV.BCB.PIX0136${paymentId}520400005303986540${input.amount.toFixed(2)}5802BR5925SV LOTES SAAS6009PARAUAPEBAS62070503***6304MOCK`;
    const pixQrCode = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#fff"/><text x="12" y="80" font-size="12" fill="#111">PIX MOCK</text></svg>`,
    )}`;

    return {
      paymentId,
      pixCopyPaste,
      pixQrCode,
      paymentUrl: `https://sandbox.asaas.com/i/${paymentId}`,
      invoiceUrl: `https://sandbox.asaas.com/i/${paymentId}`,
      billingType: 'PIX',
      status: 'PENDING',
      provider: this.providerName,
    };
  }

  async getChargeStatus(paymentId: string): Promise<ChargeStatusProviderResult> {
    return { paymentId, status: 'PENDING', paidAt: null };
  }

  async cancelCharge(_paymentId: string): Promise<void> {
    /* mock — sem efeito externo */
  }

  async deleteCharge(_paymentId: string): Promise<PaymentDeleteResult> {
    return {
      ok: true,
      httpStatus: 200,
      blocking: false,
      status: 'deleted',
      message: 'Mock delete ok',
    };
  }
}

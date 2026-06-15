/**
 * Interface de gateway de cobrança SaaS — preparada para Fase 2 (Asaas, Mercado Pago, etc.).
 */

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

/** Provider mock — Fase 1 sem integração bancária real. */
export class MockGatewayBillingProvider implements GatewayBillingProvider {
  readonly providerName = 'mock';

  async createPixCharge(input: PixChargeInput): Promise<PixChargeResult> {
    const externalChargeId = `mock_${input.invoiceId}_${Date.now()}`;
    const pixCode = `00020126580014BR.GOV.BCB.PIX0136${externalChargeId}520400005303986540${input.amount.toFixed(2)}5802BR5925SV LOTES SAAS6009PARAUAPEBAS62070503***6304MOCK`;
    const pixQrCode = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#fff"/><text x="10" y="60" font-size="10">PIX MOCK</text></svg>`,
    )}`;

    return {
      externalChargeId,
      pixCode,
      pixQrCode,
      status: 'PENDENTE',
      provider: this.providerName,
    };
  }

  async cancelCharge(_externalChargeId: string): Promise<void> {
    /* mock — sem efeito externo */
  }

  async getChargeStatus(externalChargeId: string): Promise<ChargeStatusResult> {
    return {
      externalChargeId,
      status: 'PENDENTE',
      paidAt: null,
    };
  }
}

let defaultProvider: GatewayBillingProvider = new MockGatewayBillingProvider();

export function getGatewayBillingProvider(): GatewayBillingProvider {
  return defaultProvider;
}

export function setGatewayBillingProvider(provider: GatewayBillingProvider): void {
  defaultProvider = provider;
}

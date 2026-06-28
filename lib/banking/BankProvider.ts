import type {
  BankBoletoPayload,
  BankCharge,
  BankConnectionTestResult,
  BankPixPayload,
  BankProvider,
  BankReconcileResult,
  BankWebhookEvent,
  BankWebhookParseResult,
  CreateBankBoletoInput,
  CreateBankPixInput,
} from './types';

/** Contexto mínimo para operações do adapter bancário. */
export type BankProviderContext = {
  integrationId: string;
  companyId: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  /** Configuração específica do provider (ex.: snapshot Sicoob para validação). */
  config?: Record<string, unknown>;
};

/**
 * Contrato genérico de provedor bancário (Sicoob, Sicredi, MOCK, …).
 * Implementações reais chegam nas Fases 2+.
 */
export interface IBankProvider {
  readonly providerCode: BankProvider;

  testConnection(context: BankProviderContext): Promise<BankConnectionTestResult>;

  createBoleto(input: CreateBankBoletoInput, context: BankProviderContext): Promise<BankBoletoPayload>;

  createPix(input: CreateBankPixInput, context: BankProviderContext): Promise<BankPixPayload>;

  getCharge(externalId: string, context: BankProviderContext): Promise<BankCharge | null>;

  cancelCharge(externalId: string, context: BankProviderContext): Promise<BankCharge>;

  parseWebhook(
    payload: unknown,
    context: BankProviderContext,
    headers?: Record<string, string>,
  ): BankWebhookParseResult;

  reconcilePayment(event: BankWebhookEvent, charge: BankCharge): BankReconcileResult;
}

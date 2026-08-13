/**
 * Provider INTER — Fase D: emissão real via interSaleChargeService (Cobrança V3).
 * createBoleto genérico permanece desabilitado; use /api/finance/inter/sale-charges.
 */

import type { IBankProvider, BankProviderContext } from '@/lib/banking/BankProvider';
import type {
  BankBoletoPayload,
  BankCharge,
  BankConnectionTestResult,
  BankPixPayload,
  BankReconcileResult,
  BankWebhookEvent,
  BankWebhookParseResult,
  CreateBankBoletoInput,
  CreateBankPixInput,
} from '@/lib/banking/types';

export const INTER_BOLETO_NOT_ENABLED_MESSAGE =
  'Use a aba Cobranças da venda (fluxo Inter → bank_charges). createBoleto genérico não é o caminho de emissão.';

export const INTER_NOT_IMPLEMENTED_MESSAGE =
  'Operação Inter ainda não implementada neste provider genérico.';

export class InterBankProvider implements IBankProvider {
  readonly providerCode = 'INTER' as const;

  /**
   * Preferir runCompanyInterConnectionTest na API.
   * Aqui: validação estrutural rápida sem rede.
   */
  async testConnection(context: BankProviderContext): Promise<BankConnectionTestResult> {
    const started = Date.now();
    const cfg = context.config || {};
    const hasClientId = Boolean(String(cfg.clientId || '').trim());
    const hasSecret = Boolean(cfg.hasClientSecret);
    const hasCert = Boolean(cfg.hasCertificate);
    const hasKey = Boolean(cfg.hasPrivateKey);

    if (hasClientId && hasSecret && hasCert && hasKey) {
      return {
        ok: true,
        message:
          'Credenciais locais presentes. Use POST ?action=test-connection para OAuth+mTLS real.',
        latencyMs: Date.now() - started,
      };
    }

    return {
      ok: false,
      message:
        'Configuração Inter incompleta. Informe Client ID, Secret, certificado e chave privada.',
      latencyMs: Date.now() - started,
    };
  }

  async createBoleto(
    _input: CreateBankBoletoInput,
    _context: BankProviderContext,
  ): Promise<BankBoletoPayload> {
    throw new Error(INTER_BOLETO_NOT_ENABLED_MESSAGE);
  }

  async createPix(
    _input: CreateBankPixInput,
    _context: BankProviderContext,
  ): Promise<BankPixPayload> {
    throw new Error(INTER_BOLETO_NOT_ENABLED_MESSAGE);
  }

  async getCharge(_externalId: string, _context: BankProviderContext): Promise<BankCharge | null> {
    throw new Error(INTER_NOT_IMPLEMENTED_MESSAGE);
  }

  async cancelCharge(_externalId: string, _context: BankProviderContext): Promise<BankCharge> {
    throw new Error(INTER_NOT_IMPLEMENTED_MESSAGE);
  }

  parseWebhook(
    _payload: unknown,
    _context: BankProviderContext,
    _headers?: Record<string, string>,
  ): BankWebhookParseResult {
    return {
      event: null,
      duplicate: false,
      error: INTER_NOT_IMPLEMENTED_MESSAGE,
    };
  }

  reconcilePayment(_event: BankWebhookEvent, _charge: BankCharge): BankReconcileResult {
    throw new Error(INTER_NOT_IMPLEMENTED_MESSAGE);
  }
}

export const interBankProvider = new InterBankProvider();

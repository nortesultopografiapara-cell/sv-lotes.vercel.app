import type { IBankProvider, BankProviderContext } from '../BankProvider';
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
} from '../types';
import {
  validateSicoobConfig,
  type SicoobConfigValidationInput,
} from '../sicoobConfigValidation';

export const SICOOB_BOLETO_NOT_ENABLED_MESSAGE =
  'Sicoob boleto real ainda não habilitado nesta fase.';

export const SICOOB_PIX_NOT_ENABLED_MESSAGE =
  'Sicoob Pix real ainda não habilitado nesta fase.';

export const SICOOB_NOT_IMPLEMENTED_MESSAGE =
  'Operação Sicoob ainda não implementada nesta fase.';

export type SicoobProviderContextConfig = SicoobConfigValidationInput;

function notImplementedError(): Error {
  return new Error(SICOOB_NOT_IMPLEMENTED_MESSAGE);
}

function readSicoobConfig(context: BankProviderContext): SicoobProviderContextConfig {
  const raw = context.config;
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  return raw as SicoobProviderContextConfig;
}

/** Provider Sicoob — Fase 2.0: estrutura e validação local, sem API real. */
export class SicoobBankProvider implements IBankProvider {
  readonly providerCode = 'SICOOB' as const;

  async testConnection(context: BankProviderContext): Promise<BankConnectionTestResult> {
    const started = Date.now();
    const validation = validateSicoobConfig(readSicoobConfig(context));

    return {
      ok: validation.ok,
      message: validation.message,
      latencyMs: Date.now() - started,
    };
  }

  async createBoleto(
    _input: CreateBankBoletoInput,
    _context: BankProviderContext,
  ): Promise<BankBoletoPayload> {
    throw new Error(SICOOB_BOLETO_NOT_ENABLED_MESSAGE);
  }

  async createPix(
    _input: CreateBankPixInput,
    _context: BankProviderContext,
  ): Promise<BankPixPayload> {
    throw new Error(SICOOB_PIX_NOT_ENABLED_MESSAGE);
  }

  async getCharge(_externalId: string, _context: BankProviderContext): Promise<BankCharge | null> {
    throw notImplementedError();
  }

  async cancelCharge(_externalId: string, _context: BankProviderContext): Promise<BankCharge> {
    throw notImplementedError();
  }

  parseWebhook(
    _payload: unknown,
    _context: BankProviderContext,
    _headers?: Record<string, string>,
  ): BankWebhookParseResult {
    return {
      event: null,
      duplicate: false,
      error: SICOOB_NOT_IMPLEMENTED_MESSAGE,
    };
  }

  reconcilePayment(_event: BankWebhookEvent, _charge: BankCharge): BankReconcileResult {
    throw notImplementedError();
  }
}

export const sicoobBankProvider = new SicoobBankProvider();

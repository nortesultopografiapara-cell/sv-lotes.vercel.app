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
  validateSicrediConfig,
  type SicrediConfigValidationInput,
} from '../sicrediConfigValidation';

export const SICREDI_BOLETO_NOT_ENABLED_MESSAGE =
  'Sicredi boleto real ainda não habilitado nesta fase.';

export const SICREDI_PIX_NOT_ENABLED_MESSAGE =
  'Sicredi Pix real ainda não habilitado nesta fase.';

export const SICREDI_NOT_IMPLEMENTED_MESSAGE =
  'Operação Sicredi ainda não implementada nesta fase.';

export type SicrediProviderContextConfig = SicrediConfigValidationInput;

function notImplementedError(): Error {
  return new Error(SICREDI_NOT_IMPLEMENTED_MESSAGE);
}

function readSicrediConfig(context: BankProviderContext): SicrediProviderContextConfig {
  const raw = context.config;
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  return raw as SicrediProviderContextConfig;
}

/** Provider Sicredi — Fase 2.0-Sicredi: estrutura e validação local, sem API real. */
export class SicrediBankProvider implements IBankProvider {
  readonly providerCode = 'SICREDI' as const;

  async testConnection(context: BankProviderContext): Promise<BankConnectionTestResult> {
    const started = Date.now();
    const validation = validateSicrediConfig(readSicrediConfig(context));

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
    throw new Error(SICREDI_BOLETO_NOT_ENABLED_MESSAGE);
  }

  async createPix(
    _input: CreateBankPixInput,
    _context: BankProviderContext,
  ): Promise<BankPixPayload> {
    throw new Error(SICREDI_PIX_NOT_ENABLED_MESSAGE);
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
      error: SICREDI_NOT_IMPLEMENTED_MESSAGE,
    };
  }

  reconcilePayment(_event: BankWebhookEvent, _charge: BankCharge): BankReconcileResult {
    throw notImplementedError();
  }
}

export const sicrediBankProvider = new SicrediBankProvider();

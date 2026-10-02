/**
 * Capability financeira reutilizável da venda — não depende do nome textual
 * do empreendimento.
 *
 * allow_split_down_payment: sinal contratado + pago no ato + restante
 * diluído nas parcelas (motor homologado do Recanto Primavera).
 *
 * Catálogo:
 * - RECANTO_PRIMAVERA: sempre ligado
 * - ESTRELA_DO_SUL: ligado por padrão (operação LF / Estrela do Sul)
 * - demais: desligado, salvo override explícito no JSON do projeto/venda
 */

import { normalizeSaleContractModel } from '@/lib/contractModel';

export type SaleFinanceConfig = {
  allowSplitDownPayment: boolean;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null || raw === '') return null;
  let parsed: unknown = raw;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function parseBoolFlag(raw: unknown): boolean | null {
  if (raw === true || raw === 1 || raw === 'true' || raw === 'TRUE') return true;
  if (raw === false || raw === 0 || raw === 'false' || raw === 'FALSE') return false;
  return null;
}

/** Lê allow_split_down_payment de lf_contract_config_json / snapshot / sale_finance_config. */
export function readAllowSplitDownPaymentOverride(raw: unknown): boolean | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const nested =
    asRecord(obj.sale_finance_config) ||
    asRecord(obj.saleFinanceConfig) ||
    obj;
  return parseBoolFlag(
    nested.allow_split_down_payment ?? nested.allowSplitDownPayment,
  );
}

export type SplitDownPaymentFinanceInput = {
  contractModel?: unknown;
  projectLfConfig?: unknown;
  saleSnapshot?: unknown;
  allowSplitDownPayment?: boolean | null;
};

function asSplitInput(
  input?: SplitDownPaymentFinanceInput | unknown,
): SplitDownPaymentFinanceInput {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { contractModel: input };
  }
  const rec = input as Record<string, unknown>;
  if (
    'contractModel' in rec ||
    'projectLfConfig' in rec ||
    'saleSnapshot' in rec ||
    'allowSplitDownPayment' in rec
  ) {
    return input as SplitDownPaymentFinanceInput;
  }
  return { contractModel: input };
}

/**
 * Liga o fluxo de sinal/entrada do Recanto (sem segunda implementação).
 * Recanto não pode ser desligado por override.
 */
export function usesSplitDownPaymentFinance(
  input?: SplitDownPaymentFinanceInput | unknown,
): boolean {
  const opts = asSplitInput(input);
  const model = normalizeSaleContractModel(opts.contractModel);
  if (model === 'RECANTO_PRIMAVERA') return true;

  const explicit =
    opts.allowSplitDownPayment === true
      ? true
      : opts.allowSplitDownPayment === false
        ? false
        : readAllowSplitDownPaymentOverride(opts.saleSnapshot) ??
          readAllowSplitDownPaymentOverride(opts.projectLfConfig);

  if (explicit === false) return false;
  if (explicit === true) return true;
  return model === 'ESTRELA_DO_SUL';
}

export function resolveSaleFinanceConfig(
  input?: SplitDownPaymentFinanceInput | unknown,
): SaleFinanceConfig {
  return { allowSplitDownPayment: usesSplitDownPaymentFinance(input) };
}

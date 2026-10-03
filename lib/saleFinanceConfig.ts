/**
 * Capability financeira reutilizável da venda — não depende do nome textual
 * do empreendimento.
 *
 * allow_split_down_payment: sinal contratado + pago no ato + restante
 * diluído nas parcelas (motor homologado do Recanto Primavera).
 *
 * installment_correction_type: índice das parcelas (FIXED / IGPM / IPCA / INCC).
 * Independente do split de sinal/entrada. Recanto continua forçando FIXED.
 *
 * Catálogo:
 * - RECANTO_PRIMAVERA: sempre ligado; correção FIXED
 * - ESTRELA_DO_SUL: split ligado por padrão; correção IGP-M por padrão
 * - demais: split desligado, salvo override; correção FIXED salvo JSON do projeto
 */

import { normalizeSaleContractModel } from '@/lib/contractModel';
import {
  DEFAULT_INSTALLMENT_CORRECTION_TYPE,
  parseInstallmentCorrectionType,
  type InstallmentCorrectionType,
} from '@/lib/installmentCorrectionType';

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

/** Recanto Primavera: o seletor de correção permanece oculto e persiste FIXED. */
export function shouldForceFixedInstallmentCorrection(contractModel?: unknown): boolean {
  return normalizeSaleContractModel(contractModel) === 'RECANTO_PRIMAVERA';
}

export const ESTRELA_DO_SUL_DEFAULT_INSTALLMENT_CORRECTION_TYPE: InstallmentCorrectionType =
  'IGPM';

/**
 * LF ESTRELA homologado descreve IGP-M nas cláusulas 2.3, 2.4, 2.5(a) e 7.3.
 * Sem redação condicional autorizada, a venda só pode ser concluída com IGPM.
 */
export const LF_ESTRELA_HARDCODED_IGPM_LEGAL_MESSAGE =
  'O contrato LF ESTRELA homologado descreve reajuste anual pelo IGP-M nas cláusulas 2.3, 2.4, 2.5(a) e 7.3. Enquanto esses trechos não forem condicionais ao índice da venda, este modelo só pode ser concluído com IGP-M. FIXED, IPCA e INCC ficam disponíveis no seletor para outros empreendimentos, mas não podem ser gravados nesta venda.';

export const LF_ESTRELA_CORRECTION_SELECTOR_HINT =
  'O modelo LF ESTRELA atual exige IGP-M. Parcelas fixas, IPCA e INCC ficam para outros empreendimentos quando o jurídico for condicional.';

/** Lê installment_correction_type de lf_contract_config_json / sale_finance_config. */
export function readProjectInstallmentCorrectionType(
  raw: unknown,
): InstallmentCorrectionType | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const nested =
    asRecord(obj.sale_finance_config) ||
    asRecord(obj.saleFinanceConfig) ||
    obj;
  return parseInstallmentCorrectionType(
    nested.installment_correction_type ?? nested.installmentCorrectionType,
  );
}

export function catalogDefaultInstallmentCorrectionType(
  contractModel?: unknown,
): InstallmentCorrectionType {
  if (shouldForceFixedInstallmentCorrection(contractModel)) {
    return DEFAULT_INSTALLMENT_CORRECTION_TYPE;
  }
  if (normalizeSaleContractModel(contractModel) === 'ESTRELA_DO_SUL') {
    return ESTRELA_DO_SUL_DEFAULT_INSTALLMENT_CORRECTION_TYPE;
  }
  return DEFAULT_INSTALLMENT_CORRECTION_TYPE;
}

export function resolveProjectInstallmentCorrectionType(input: {
  contractModel?: unknown;
  projectLfConfig?: unknown;
}): InstallmentCorrectionType {
  if (shouldForceFixedInstallmentCorrection(input.contractModel)) {
    return DEFAULT_INSTALLMENT_CORRECTION_TYPE;
  }
  if (lfEstrelaRequiresHardcodedIgpm(input.contractModel)) {
    return ESTRELA_DO_SUL_DEFAULT_INSTALLMENT_CORRECTION_TYPE;
  }
  return (
    readProjectInstallmentCorrectionType(input.projectLfConfig) ??
    catalogDefaultInstallmentCorrectionType(input.contractModel)
  );
}

/**
 * Valor a persistir em sales.installment_correction_type.
 * Split de sinal/entrada NÃO sobrescreve o índice (exceto Recanto = FIXED).
 * LF ESTRELA homologado grava sempre IGPM, alinhado às cláusulas 2.3–2.5(a) e 7.3.
 */
export function resolvePersistInstallmentCorrectionType(input: {
  contractModel?: unknown;
  selected?: unknown;
  projectLfConfig?: unknown;
}): InstallmentCorrectionType {
  if (shouldForceFixedInstallmentCorrection(input.contractModel)) {
    return DEFAULT_INSTALLMENT_CORRECTION_TYPE;
  }
  if (lfEstrelaRequiresHardcodedIgpm(input.contractModel)) {
    return ESTRELA_DO_SUL_DEFAULT_INSTALLMENT_CORRECTION_TYPE;
  }
  return (
    parseInstallmentCorrectionType(input.selected) ??
    resolveProjectInstallmentCorrectionType({
      contractModel: input.contractModel,
      projectLfConfig: input.projectLfConfig,
    })
  );
}

export function lfEstrelaRequiresHardcodedIgpm(contractModel?: unknown): boolean {
  return normalizeSaleContractModel(contractModel) === 'ESTRELA_DO_SUL';
}

export function isInstallmentCorrectionOptionEnabled(
  contractModel: unknown,
  option: InstallmentCorrectionType,
): boolean {
  if (lfEstrelaRequiresHardcodedIgpm(contractModel)) {
    return option === 'IGPM';
  }
  return true;
}

export function assertLfEstrelaCorrectionCoherentWithHardcodedLegal(
  contractModel: unknown,
  correctionType: unknown,
): void {
  if (!lfEstrelaRequiresHardcodedIgpm(contractModel)) return;
  const normalized =
    parseInstallmentCorrectionType(correctionType) ??
    catalogDefaultInstallmentCorrectionType(contractModel);
  if (normalized === 'IGPM') return;
  throw new Error(LF_ESTRELA_HARDCODED_IGPM_LEGAL_MESSAGE);
}

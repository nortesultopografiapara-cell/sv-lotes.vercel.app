/**
 * Mapeamento de movimentações do extrato Asaas → Caixa SaaS.
 */

import type {
  SaasCashMovementSource,
  SaasCashMovementType,
} from '@/lib/saasCashMovements';
import type { AsaasFinancialTransaction } from '@/lib/payments/providers/asaas';

export type MappedAsaasCashMovement = {
  skip: boolean;
  skipReason?: string;
  type?: SaasCashMovementType;
  source?: SaasCashMovementSource;
  category?: string;
  description?: string;
  amount?: number;
  movement_date?: string;
  asaas_payment_id?: string | null;
  metadata?: Record<string, unknown>;
};

/** Tipos já registrados como entrada via webhook SaaS — não reimportar. */
const WEBHOOK_INCOME_TYPES = new Set([
  'PAYMENT_RECEIVED',
  'PAYMENT_RECEIVED_IN_CASH',
  'PARTIAL_PAYMENT',
]);

/** Saques, transferências bancárias e Pix enviado para chave/conta externa. */
const WITHDRAWAL_TYPES = new Set([
  'TRANSFER',
  'BACEN_JUDICIAL_TRANSFER',
  'PIX_TRANSACTION_DEBIT',
  'BILL_PAYMENT',
]);

const TRANSFER_TYPES = new Set(['INTERNAL_TRANSFER_DEBIT']);

/** Pix recebido fora do fluxo webhook de cobrança SaaS. */
const SYNC_INCOME_TYPES = new Set(['PIX_TRANSACTION_CREDIT']);

const EXPLICIT_FEE_TYPES = new Set([
  'PAYMENT_FEE',
  'TRANSFER_FEE',
  'PIX_TRANSACTION_DEBIT_FEE',
  'PIX_TRANSACTION_CREDIT_FEE',
  'BILL_PAYMENT_FEE',
  'INVOICE_FEE',
  'PRODUCT_INVOICE_FEE',
  'CONSUMER_INVOICE_FEE',
  'PAYMENT_SMS_NOTIFICATION_FEE',
  'PAYMENT_MESSAGING_NOTIFICATION_FEE',
  'PAYMENT_INSTANT_TEXT_MESSAGE_FEE',
  'PHONE_CALL_NOTIFICATION_FEE',
  'POSTAL_SERVICE_FEE',
  'RECEIVABLE_ANTICIPATION_FEE',
  'REFUND_REQUEST_FEE',
  'PAYMENT_DUNNING_REQUEST_FEE',
  'PAYMENT_DUNNING_RECEIVED_FEE',
  'PAYMENT_DUNNING_RECEIVED_IN_CASH_FEE',
  'PAYMENT_DUNNING_CANCELLATION_FEE',
  'CHARGED_FEE',
  'CONTRACTED_CUSTOMER_PLAN_FEE',
  'ACCOUNT_INACTIVITY_FEE',
]);

const EXPLICIT_REFUND_TYPES = new Set([
  'PAYMENT_REVERSAL',
  'TRANSFER_REVERSAL',
  'PIX_TRANSACTION_DEBIT_REFUND',
  'PIX_TRANSACTION_CREDIT_REFUND',
  'BILL_PAYMENT_REFUNDED',
  'INTERNAL_TRANSFER_REVERSAL',
]);

/** Descontos/estornos positivos de tarifas — entram como ENTRADA/AJUSTE. */
const POSITIVE_ADJUSTMENT_TYPES = new Set([
  'PAYMENT_FEE_REVERSAL',
  'CHARGED_FEE_REFUND',
  'REFUND_REQUEST_FEE_REVERSAL',
]);

const SKIP_NEUTRAL_TYPES = new Set([
  'INTERNAL_TRANSFER_CREDIT',
  'PAYMENT_CUSTODY_BLOCK',
  'PAYMENT_CUSTODY_BLOCK_REVERSAL',
  'PAYMENT_REFUND_CANCELLED',
  'REFUND_REQUEST_CANCELLED',
]);

function normalizeAsaasType(type?: string | null): string {
  return String(type || '').trim().toUpperCase();
}

function asaasOriginalDescription(
  tx: AsaasFinancialTransaction,
  fallback: string,
): string {
  const original = String(tx.description || '').trim();
  return original || fallback;
}

function isFeeType(type: string): boolean {
  if (EXPLICIT_FEE_TYPES.has(type)) return true;
  if (
    type.endsWith('_FEE_REVERSAL') ||
    type.includes('FEE_REFUND') ||
    type.includes('FEE_CANCELLED')
  ) {
    return false;
  }
  return type.endsWith('_FEE');
}

function isRefundType(type: string): boolean {
  if (EXPLICIT_REFUND_TYPES.has(type)) return true;
  if (type.includes('FEE_REVERSAL') || type.includes('FEE_REFUND')) return false;
  return type.includes('_REVERSAL') || type.includes('_REFUND');
}

function isPositiveAdjustmentType(type: string): boolean {
  if (POSITIVE_ADJUSTMENT_TYPES.has(type)) return true;
  return type.includes('FEE_REVERSAL') || type.includes('FEE_REFUND');
}

function isBalanceAdjustmentType(type: string): boolean {
  return type.includes('BALANCE') || type.includes('ADJUST');
}

function isPixDebitType(type: string): boolean {
  return type.includes('PIX') && type.includes('DEBIT') && !type.includes('REFUND');
}

function isPixCreditType(type: string): boolean {
  return type.includes('PIX') && type.includes('CREDIT') && !type.includes('REFUND');
}

function buildMappedMovement(
  tx: AsaasFinancialTransaction,
  mapped: Omit<MappedAsaasCashMovement, 'skip'>,
): MappedAsaasCashMovement {
  const movementId = String(tx.id || '').trim();
  const asaasType = normalizeAsaasType(tx.type);
  const value = Number(tx.value || 0);

  return {
    skip: false,
    ...mapped,
    description: asaasOriginalDescription(tx, mapped.description || 'Movimentação Asaas'),
    movement_date: String(mapped.movement_date || tx.date || '').split('T')[0],
    asaas_payment_id: mapped.asaas_payment_id ?? (tx.paymentId ? String(tx.paymentId) : null),
    metadata: {
      ...(mapped.metadata || {}),
      asaas_movement_id: movementId,
      asaas_type: asaasType,
      asaas_value: value,
      asaas_description: tx.description || null,
      asaas_transfer_id: tx.transferId || null,
      sync: 'asaas_financial_transactions',
    },
  };
}

/** Transforma lançamento do extrato Asaas em movimento do Caixa SaaS (ou skip). */
export function mapAsaasFinancialTransaction(
  tx: AsaasFinancialTransaction,
): MappedAsaasCashMovement {
  const movementId = String(tx.id || '').trim();
  const asaasType = normalizeAsaasType(tx.type);
  const value = Number(tx.value || 0);
  const absAmount = Math.abs(value);

  if (!movementId) {
    return { skip: true, skipReason: 'missing_id' };
  }
  if (!asaasType) {
    return { skip: true, skipReason: 'missing_type' };
  }
  if (absAmount <= 0) {
    return { skip: true, skipReason: 'zero_amount' };
  }

  if (WEBHOOK_INCOME_TYPES.has(asaasType)) {
    return { skip: true, skipReason: 'webhook_income' };
  }

  if (asaasType === 'FREE_PAYMENT_USE' && value > 0) {
    return buildMappedMovement(tx, {
      type: 'income',
      source: 'asaas_webhook',
      category: 'Ajuste positivo',
      description: 'Desconto/ajuste Asaas',
      amount: absAmount,
      movement_date: tx.date,
    });
  }

  if (SKIP_NEUTRAL_TYPES.has(asaasType)) {
    return { skip: true, skipReason: 'neutral_type' };
  }

  if (WITHDRAWAL_TYPES.has(asaasType) || isPixDebitType(asaasType)) {
    const isPix = asaasType === 'PIX_TRANSACTION_DEBIT' || isPixDebitType(asaasType);
    return buildMappedMovement(tx, {
      type: 'expense',
      source: 'asaas_transfer',
      category: isPix ? 'Transferência Pix' : 'Saque',
      description: isPix
        ? 'Transação via Pix'
        : 'Saque / transferência bancária Asaas',
      amount: absAmount,
      movement_date: tx.date,
    });
  }

  if (TRANSFER_TYPES.has(asaasType)) {
    return buildMappedMovement(tx, {
      type: 'expense',
      source: 'asaas_transfer',
      category: 'Transferência',
      description: 'Transferência Asaas',
      amount: absAmount,
      movement_date: tx.date,
    });
  }

  if (SYNC_INCOME_TYPES.has(asaasType) || isPixCreditType(asaasType)) {
    return buildMappedMovement(tx, {
      type: 'income',
      source: 'asaas_webhook',
      category: 'Entrada Pix',
      description: 'Pix recebido',
      amount: absAmount,
      movement_date: tx.date,
    });
  }

  if (isPositiveAdjustmentType(asaasType)) {
    const movementType: SaasCashMovementType = value >= 0 ? 'income' : 'expense';
    return buildMappedMovement(tx, {
      type: movementType,
      source: movementType === 'income' ? 'asaas_webhook' : 'asaas_fee',
      category: movementType === 'income' ? 'Ajuste positivo' : 'Tarifa Asaas',
      description: movementType === 'income' ? 'Desconto/ajuste Asaas' : 'Tarifa Asaas',
      amount: absAmount,
      movement_date: tx.date,
    });
  }

  if (isFeeType(asaasType)) {
    return buildMappedMovement(tx, {
      type: 'expense',
      source: 'asaas_fee',
      category: 'Tarifa Asaas',
      description: 'Tarifa Asaas',
      amount: absAmount,
      movement_date: tx.date,
    });
  }

  if (isRefundType(asaasType)) {
    const movementType: SaasCashMovementType = value > 0 ? 'income' : 'expense';
    return buildMappedMovement(tx, {
      type: movementType,
      source: 'asaas_refund',
      category: movementType === 'income' ? 'Ajuste positivo' : 'Estorno',
      description: movementType === 'income' ? 'Estorno/ajuste Asaas' : 'Estorno Asaas',
      amount: absAmount,
      movement_date: tx.date,
    });
  }

  if (isBalanceAdjustmentType(asaasType)) {
    const movementType: SaasCashMovementType = value >= 0 ? 'income' : 'expense';
    return buildMappedMovement(tx, {
      type: movementType,
      source: value >= 0 ? 'asaas_webhook' : 'asaas_transfer',
      category: 'Ajuste de saldo',
      description: 'Ajuste de saldo Asaas',
      amount: absAmount,
      movement_date: tx.date,
    });
  }

  return {
    skip: true,
    skipReason: 'unknown_type',
    metadata: {
      asaas_movement_id: movementId,
      asaas_type: asaasType,
      asaas_value: value,
      asaas_description: tx.description || null,
    },
  };
}

export function isAsaasCashSyncExpenseMapping(
  mapped: MappedAsaasCashMovement,
): boolean {
  return !mapped.skip && mapped.type === 'expense';
}

export function isAsaasCashSyncIncomeMapping(
  mapped: MappedAsaasCashMovement,
): boolean {
  return !mapped.skip && mapped.type === 'income';
}

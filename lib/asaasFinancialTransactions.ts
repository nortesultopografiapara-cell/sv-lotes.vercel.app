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

/** Saques/transferências bancárias explícitas (fora do P&L — type transfer). */
const WITHDRAWAL_TYPES = new Set([
  'TRANSFER',
  'BACEN_JUDICIAL_TRANSFER',
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

const TRANSFER_DESC_RE =
  /\b(saque|transfer[eê]ncia|retirada|resgate|para\s+conta|conta\s+pr[oó]pria|ted|doc)\b/i;
const EXPENSE_PIX_DESC_RE =
  /\b(pagamento|pagto|boleto|conta\s+de|fornecedor|compra|assinatura|aluguel|sal[aá]rio|despesa)\b/i;

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
  return type.includes('PIX') && type.includes('DEBIT') && !type.includes('REFUND') && !type.includes('FEE');
}

function isPixCreditType(type: string): boolean {
  return type.includes('PIX') && type.includes('CREDIT') && !type.includes('REFUND') && !type.includes('FEE');
}

/**
 * PIX de saída NÃO vira transfer automaticamente.
 * Evidências: transferId Asaas, descrição de saque/transferência, ou descrição de pagamento.
 * Ambíguo: transfer com needs_classification (afeta saldo, fora do P&L) para revisão.
 */
function classifyPixDebit(tx: AsaasFinancialTransaction): MappedAsaasCashMovement {
  const desc = String(tx.description || '');
  const hasTransferId = Boolean(String(tx.transferId || '').trim());
  const absAmount = Math.abs(Number(tx.value || 0));

  if (hasTransferId || TRANSFER_DESC_RE.test(desc)) {
    return buildMappedMovement(tx, {
      type: 'transfer',
      source: 'asaas_transfer',
      category: 'Transferência Pix',
      description: 'Transação via Pix (transferência/saque)',
      amount: absAmount,
      movement_date: tx.date,
      metadata: {
        classification_rule: hasTransferId
          ? 'pix_debit+transferId'
          : 'pix_debit+description_transfer',
      },
    });
  }

  if (EXPENSE_PIX_DESC_RE.test(desc)) {
    return buildMappedMovement(tx, {
      type: 'expense',
      source: 'asaas_transfer',
      category: 'Pagamento Pix',
      description: 'Pagamento via Pix',
      amount: absAmount,
      movement_date: tx.date,
      metadata: {
        classification_rule: 'pix_debit+description_expense',
      },
    });
  }

  return buildMappedMovement(tx, {
    type: 'transfer',
    source: 'asaas_transfer',
    category: 'Saída Pix (a classificar)',
    description: 'Saída Pix — classificação pendente',
    amount: absAmount,
    movement_date: tx.date,
    metadata: {
      classification_rule: 'pix_debit+pending_review',
      needs_classification: true,
    },
  });
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

  // BILL_PAYMENT = pagamento de boleto/conta (despesa operacional).
  if (asaasType === 'BILL_PAYMENT') {
    return buildMappedMovement(tx, {
      type: 'expense',
      source: 'asaas_transfer',
      category: 'Pagamento de conta',
      description: 'Pagamento de conta via Asaas',
      amount: absAmount,
      movement_date: tx.date,
      metadata: { classification_rule: 'bill_payment' },
    });
  }

  // Saques/transferências bancárias explícitas (reduzem saldo, fora do resultado).
  if (WITHDRAWAL_TYPES.has(asaasType)) {
    return buildMappedMovement(tx, {
      type: 'transfer',
      source: 'asaas_transfer',
      category: 'Saque',
      description: 'Saque / transferência bancária Asaas',
      amount: absAmount,
      movement_date: tx.date,
      metadata: { classification_rule: 'withdrawal_type' },
    });
  }

  if (TRANSFER_TYPES.has(asaasType)) {
    return buildMappedMovement(tx, {
      type: 'transfer',
      source: 'asaas_transfer',
      category: 'Transferência',
      description: 'Transferência Asaas',
      amount: absAmount,
      movement_date: tx.date,
      metadata: { classification_rule: 'internal_transfer_debit' },
    });
  }

  // PIX debit: classificar por evidência (não automático).
  if (asaasType === 'PIX_TRANSACTION_DEBIT' || isPixDebitType(asaasType)) {
    return classifyPixDebit(tx);
  }

  if (SYNC_INCOME_TYPES.has(asaasType) || isPixCreditType(asaasType)) {
    return buildMappedMovement(tx, {
      type: 'income',
      source: 'asaas_webhook',
      category: String(tx.paymentId || '').trim()
        ? 'Entrada Pix'
        : 'Crédito Pix (a conciliar)',
      description: String(tx.paymentId || '').trim()
        ? 'Pix recebido'
        : 'Pix recebido sem cobrança SaaS vinculada',
      amount: absAmount,
      movement_date: tx.date,
      metadata: {
        classification_rule: 'pix_credit',
        needs_classification: !String(tx.paymentId || '').trim(),
        orphan_credit: !String(tx.paymentId || '').trim(),
      },
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
      metadata: { classification_rule: 'fee_type' },
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
      metadata: {
        classification_rule: 'refund_type',
        related_asaas_payment_id: tx.paymentId || null,
      },
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
      needs_classification: true,
    },
  };
}

export function isAsaasCashSyncExpenseMapping(
  mapped: MappedAsaasCashMovement,
): boolean {
  return !mapped.skip && mapped.type === 'expense';
}

export function isAsaasCashSyncTransferMapping(
  mapped: MappedAsaasCashMovement,
): boolean {
  return !mapped.skip && mapped.type === 'transfer';
}

export function isAsaasCashSyncIncomeMapping(
  mapped: MappedAsaasCashMovement,
): boolean {
  return !mapped.skip && mapped.type === 'income';
}

/** Contribui para receita/despesa do resultado (exclui transferências). */
export function saasCashAffectsPnl(type?: string | null): boolean {
  const t = String(type || '').toLowerCase();
  return t === 'income' || t === 'expense';
}

/**
 * Baixa manual de parcela com autorização do Administrador Principal.
 * A senha nunca sai desta requisição. Sem challenge reutilizável.
 */

import {
  PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE,
  maskPrimaryAdminEmail,
  primaryAdminDisplayName,
  readPrimaryAdminVerifyRequest,
  verifyPrimaryAdminPassword,
  type PrimaryAdminReauthDeps,
  type PrimaryAdminVerifyResult,
} from '@/lib/primaryAdminReauth';
import { isPaidFinanceReceipt } from '@/lib/saleEditFinanceRecalc';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import { buildManualFinanceReceiptCashMovement } from '@/lib/finance/cashMovementsSchema';

export const MANUAL_PAYMENT_ALREADY_PAID_MESSAGE =
  'Esta parcela já está registrada como paga.';
export const MANUAL_PAYMENT_SUCCESS_MESSAGE = 'Pagamento registrado com sucesso!';
export const MANUAL_PAYMENT_LOAD_FAILED_MESSAGE =
  'Não foi possível carregar a autorização do Administrador Principal.';
export const MANUAL_PAYMENT_PERSISTENCE_FAILED_MESSAGE =
  'Não foi possível registrar o pagamento. Tente novamente.';
export const MANUAL_PAYMENT_AUTHORIZED_ACTION = 'MANUAL_PAYMENT_AUTHORIZED';
export const MANUAL_PAYMENT_FAILED_ACTION = 'MANUAL_PAYMENT_AUTHORIZATION_FAILED';
export const MANUAL_PAYMENT_PERSISTENCE_FAILED_ACTION = 'MANUAL_PAYMENT_PERSISTENCE_FAILED';
export const MANUAL_PAYMENT_AUDIT_MODULE = 'FINANCE';

export type ManualReceiptRow = {
  id: string;
  tenant_id?: string | null;
  company_id?: string | null;
  status?: string | null;
  amount?: number | string | null;
  paid_amount?: number | string | null;
  paid_at?: string | null;
  due_date?: string | null;
  installment_number?: number | string | null;
  sale_id?: string | null;
  customer_id?: string | null;
  project_id?: string | null;
  block_id?: string | null;
  customer_name?: string | null;
  contract_id?: string | null;
  contract_number?: string | null;
  installments_count?: number | string | null;
};

export type ManualPaymentReceiptPreview = {
  contractNumber: string;
  customerName: string;
  installmentLabel: string;
  dueDateLabel: string;
  amountLabel: string;
  amount: number;
};

export type ManualPaymentPrincipalPreview = {
  displayName: string;
  maskedEmail: string;
};

export type ManualPaymentExecuteResult =
  | {
      ok: true;
      receiptId: string;
      cashMovementId: string | null;
      requestedBy: string;
      authorizedBy: string;
      authorizedByName: string;
      authorizedByMaskedEmail: string;
      tenantId: string;
      alreadyPaid: false;
    }
  | {
      ok: false;
      code:
        | 'denied'
        | 'unauthenticated'
        | 'already_paid'
        | 'not_found'
        | 'wrong_tenant'
        | 'cancelled'
        | 'persistence_failed';
      requestedBy?: string;
      tenantId?: string;
      receiptId?: string;
      reason?: string;
    };

export type ManualPaymentPersistResult = {
  ok: boolean;
  code?: 'already_paid' | 'not_found' | 'rpc_failure';
  cashMovementId?: string | null;
  receiptId?: string;
};

export type ManualPaymentDeps = PrimaryAdminReauthDeps & {
  loadReceipt: (receiptId: string) => Promise<ManualReceiptRow | null>;
  persistAuthorizedPayment: (input: {
    receipt: ManualReceiptRow;
    operatorId: string;
    paidAt: string;
    amount: number;
  }) => Promise<ManualPaymentPersistResult>;
};

export function receiptTenantId(row: ManualReceiptRow | null | undefined): string | null {
  const value = String(row?.tenant_id || row?.company_id || '').trim();
  return value || null;
}

export function formatManualInstallmentLabel(
  installmentNumber?: number | string | null,
  installmentsCount?: number | string | null,
): string {
  const n = Number(installmentNumber);
  if (n === 0) return 'Entrada';
  if (n === -1) return 'Sinal';
  const count = Number(installmentsCount);
  if (Number.isFinite(n) && Number.isFinite(count) && count > 0) {
    return `${n}/${count}`;
  }
  return String(Number.isFinite(n) ? n : installmentNumber || '1');
}

export function formatManualDueDateLabel(dueDate?: string | null): string {
  const raw = String(dueDate || '').trim();
  if (!raw) return '—';
  const day = raw.includes('T') ? raw.slice(0, 10) : raw;
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function buildManualPaymentReceiptPreview(
  row: ManualReceiptRow,
): ManualPaymentReceiptPreview {
  const amount = Number(row.amount) || 0;
  return {
    contractNumber: String(row.contract_number || '').trim() || 'S/N',
    customerName: String(row.customer_name || '').trim() || 'Cliente',
    installmentLabel: formatManualInstallmentLabel(row.installment_number, row.installments_count),
    dueDateLabel: formatManualDueDateLabel(row.due_date),
    amountLabel: formatCurrencyBRL(amount) || 'R$ 0,00',
    amount,
  };
}

export function isCancelledReceipt(row: ManualReceiptRow): boolean {
  const st = String(row.status || '').toLowerCase().trim();
  return st === 'cancelado' || st === 'cancelled';
}

export function toPublicManualPaymentError(result: ManualPaymentExecuteResult): {
  ok: false;
  error: string;
} {
  if (!result.ok && result.code === 'already_paid') {
    return { ok: false, error: MANUAL_PAYMENT_ALREADY_PAID_MESSAGE };
  }
  if (!result.ok && result.code === 'unauthenticated') {
    return { ok: false, error: 'Não autenticado.' };
  }
  if (!result.ok && result.code === 'persistence_failed') {
    return { ok: false, error: MANUAL_PAYMENT_PERSISTENCE_FAILED_MESSAGE };
  }
  return { ok: false, error: PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE };
}

export type ManualPaymentPreviewFailureCode =
  | 'denied'
  | 'unauthenticated'
  | 'not_found'
  | 'wrong_tenant'
  | 'load_failed';

/** GET do modal: nunca devolve "Autorização não concedida." — isso é só recusa de senha no POST. */
export function toPublicManualPaymentPreviewError(code: ManualPaymentPreviewFailureCode): {
  ok: false;
  error: string;
  code: 'unauthenticated' | 'load_failed';
} {
  if (code === 'unauthenticated') {
    return { ok: false, error: 'Não autenticado.', code: 'unauthenticated' };
  }
  return { ok: false, error: MANUAL_PAYMENT_LOAD_FAILED_MESSAGE, code: 'load_failed' };
}

export function buildManualPaymentAuditDescription(input: {
  result: 'authorized' | 'failed';
  stage?: 'AUTHORIZED' | 'AUTHORIZATION' | 'PERSISTENCE';
  reason?: string | null;
  receiptId: string;
  saleId?: string | null;
  contractId?: string | null;
  contractNumber?: string | null;
  installmentNumber?: number | string | null;
  amount?: number;
  requestedBy: string;
  authorizedBy?: string;
  cashMovementId?: string | null;
}): string {
  const stage =
    input.stage ||
    (input.result === 'authorized' ? 'AUTHORIZED' : 'AUTHORIZATION');
  return JSON.stringify({
    receipt_id: input.receiptId,
    sale_id: input.saleId || null,
    contract_id: input.contractId || null,
    contract_number: input.contractNumber || null,
    installment_number: input.installmentNumber ?? null,
    amount: input.amount ?? null,
    requested_by_user_id: input.requestedBy,
    authorized_by_user_id: input.authorizedBy || null,
    cash_movement_id: input.cashMovementId || null,
    result: input.result,
    stage,
    reason: input.reason || null,
  });
}

export async function previewManualReceiptPayment(
  deps: Pick<ManualPaymentDeps, 'loadOperator' | 'loadCompanyPrimaryAdminUserId' | 'loadUser' | 'loadReceipt'>,
  input: { operatorUserId: string | null | undefined; receiptId: string },
): Promise<
  | {
      ok: true;
      receipt: ManualPaymentReceiptPreview;
      principal: ManualPaymentPrincipalPreview;
    }
  | { ok: false; code: 'denied' | 'unauthenticated' | 'not_found' | 'wrong_tenant' }
> {
  if (!input.operatorUserId) return { ok: false, code: 'unauthenticated' };
  const operator = await deps.loadOperator(input.operatorUserId);
  const tenantId = String(operator?.tenant_id || '').trim();
  if (!tenantId) return { ok: false, code: 'denied' };

  let receipt: ManualReceiptRow | null = null;
  try {
    receipt = await deps.loadReceipt(input.receiptId);
  } catch (err) {
    console.warn(
      '[manual-payment-preview] loadReceipt',
      err instanceof Error ? err.message : err,
    );
    return { ok: false, code: 'not_found' };
  }
  if (!receipt?.id) return { ok: false, code: 'not_found' };
  if (receiptTenantId(receipt) !== tenantId) return { ok: false, code: 'wrong_tenant' };

  let primaryId: string | null = null;
  try {
    primaryId = await deps.loadCompanyPrimaryAdminUserId(tenantId);
  } catch (err) {
    console.warn(
      '[manual-payment-preview] primary_admin_user_id',
      err instanceof Error ? err.message : err,
    );
    return { ok: false, code: 'denied' };
  }
  const primary = primaryId ? await deps.loadUser(primaryId) : null;
  if (!primary?.id || !primary.email) return { ok: false, code: 'denied' };

  return {
    ok: true,
    receipt: buildManualPaymentReceiptPreview(receipt),
    principal: {
      displayName: primaryAdminDisplayName(primary),
      maskedEmail: maskPrimaryAdminEmail(primary.email),
    },
  };
}

export async function authorizeAndExecuteManualReceiptPayment(
  deps: ManualPaymentDeps,
  input: {
    operatorUserId: string | null | undefined;
    receiptId: string;
    password: string;
    now?: string;
  },
): Promise<{ result: ManualPaymentExecuteResult; verify?: PrimaryAdminVerifyResult }> {
  if (!input.operatorUserId) {
    return { result: { ok: false, code: 'unauthenticated' } };
  }

  const operator = await deps.loadOperator(input.operatorUserId);
  const tenantId = String(operator?.tenant_id || '').trim();
  if (!tenantId) {
    return {
      result: { ok: false, code: 'denied', requestedBy: input.operatorUserId },
    };
  }

  const receipt = await deps.loadReceipt(input.receiptId);
  if (!receipt?.id) {
    return {
      result: {
        ok: false,
        code: 'not_found',
        requestedBy: input.operatorUserId,
        tenantId,
        receiptId: input.receiptId,
      },
    };
  }
  if (receiptTenantId(receipt) !== tenantId) {
    return {
      result: {
        ok: false,
        code: 'wrong_tenant',
        requestedBy: input.operatorUserId,
        tenantId,
        receiptId: receipt.id,
      },
    };
  }
  if (isCancelledReceipt(receipt)) {
    return {
      result: {
        ok: false,
        code: 'cancelled',
        requestedBy: input.operatorUserId,
        tenantId,
        receiptId: receipt.id,
      },
    };
  }
  if (isPaidFinanceReceipt(receipt)) {
    return {
      result: {
        ok: false,
        code: 'already_paid',
        requestedBy: input.operatorUserId,
        tenantId,
        receiptId: receipt.id,
      },
    };
  }

  const verify = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: input.operatorUserId,
    password: input.password,
  });
  if (!verify.ok || !verify.authorizedByUserId || !verify.authorizedBy) {
    return {
      verify,
      result: {
        ok: false,
        code: 'denied',
        requestedBy: input.operatorUserId,
        tenantId,
        receiptId: receipt.id,
        reason: verify.reason,
      },
    };
  }

  const paidAt = input.now || new Date().toISOString();
  const amount = Number(receipt.amount) || 0;
  const persisted = await deps.persistAuthorizedPayment({
    receipt,
    operatorId: input.operatorUserId,
    paidAt,
    amount,
  });

  if (!persisted.ok && persisted.code === 'already_paid') {
    return {
      verify,
      result: {
        ok: false,
        code: 'already_paid',
        requestedBy: input.operatorUserId,
        tenantId,
        receiptId: receipt.id,
      },
    };
  }
  if (!persisted.ok) {
    return {
      verify,
      result: {
        ok: false,
        code: 'persistence_failed',
        requestedBy: input.operatorUserId,
        tenantId,
        receiptId: receipt.id,
        reason: 'RPC_FAILURE',
      },
    };
  }

  return {
    verify,
    result: {
      ok: true,
      receiptId: receipt.id,
      cashMovementId: persisted.cashMovementId || null,
      requestedBy: input.operatorUserId,
      authorizedBy: verify.authorizedByUserId,
      authorizedByName: verify.authorizedBy.displayName,
      authorizedByMaskedEmail: verify.authorizedBy.maskedEmail,
      tenantId,
      alreadyPaid: false,
    },
  };
}

export function expectedManualCashMovementPayload(input: {
  tenantId: string;
  receipt: ManualReceiptRow;
  operatorId: string;
  paidAt: string;
  amount: number;
}) {
  return buildManualFinanceReceiptCashMovement({
    tenantId: input.tenantId,
    receiptId: input.receipt.id,
    amount: input.amount,
    installmentNumber: input.receipt.installment_number,
    contractNumber: input.receipt.contract_number,
    customerId: input.receipt.customer_id,
    saleId: input.receipt.sale_id,
    projectId: input.receipt.project_id,
    userId: input.operatorId,
    paidAt: input.paidAt,
  });
}

export { readPrimaryAdminVerifyRequest, PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE };

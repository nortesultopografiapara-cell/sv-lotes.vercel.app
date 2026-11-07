/**
 * Decisão da baixa manual. Não grava e não distingue o valor de SIGNAL, LOT ou venda antiga.
 * A escrita segue as travas já usadas no Financeiro: proprietário somente leitura,
 * corretor fora do módulo e somente administrador da empresa ou da plataforma.
 * canViewEnterpriseValues permanece só para exibir valores. A gravação usa a RPC no servidor.
 */

import { canManageGisProject, isBrokerRole } from '@/lib/rolePermissions';
import { guardOwnerWriteRole } from '@/lib/ownerWriteGuard';
import { isPlatformAdmin } from '@/lib/rls';
import { isCanceledFinanceReceipt } from '@/lib/finance/saleChargesShared';

export type ManualReceiptMarkPaidRow = {
  id?: string | null;
  tenantId?: string | null;
  companyId?: string | null;
  status?: string | null;
  paidAt?: string | null;
  amount?: number | string | null;
  scheduleGroup?: string | null;
};

export type ManualReceiptMarkPaidDecision =
  | { ok: true; receiptId: string; amount: number }
  | {
      ok: false;
      code: 'invalid' | 'not_found' | 'tenant_mismatch' | 'already_paid' | 'cancelled' | 'forbidden';
    };

/**
 * Quem já grava no Financeiro. Não usa a permissão de visualização de valores
 * e não inclui papel fora de ADMIN, ADMIN_EMPRESA, COMPANY_ADMIN e administrador de plataforma.
 */
export function canRegisterManualFinancePayment(role?: string | null): boolean {
  if (!guardOwnerWriteRole(role)) return false;
  if (isBrokerRole(role)) return false;
  return canManageGisProject(role);
}

/** Middleware e cadastro tratam vazio como ativo e só bloqueiam INACTIVE. */
export function isActiveFinanceOperator(status?: string | null): boolean {
  return String(status || 'ACTIVE').trim().toUpperCase() !== 'INACTIVE';
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function isManualReceiptAlreadyPaid(row: {
  status?: string | null;
  paidAt?: string | null;
}): boolean {
  const status = text(row.status).toLowerCase();
  if (status === 'pago' || status === 'paid' || status === 'paga') return true;
  return Boolean(text(row.paidAt));
}

export function isCancelledManualReceipt(row: { status?: string | null }): boolean {
  return isCanceledFinanceReceipt(row);
}

export function decideManualReceiptMarkPaid(input: {
  operatorTenantId?: string | null;
  operatorRole?: string | null;
  operatorStatus?: string | null;
  receipt: ManualReceiptMarkPaidRow | null;
}): ManualReceiptMarkPaidDecision {
  if (!isActiveFinanceOperator(input.operatorStatus)) return { ok: false, code: 'forbidden' };
  if (!canRegisterManualFinancePayment(input.operatorRole)) return { ok: false, code: 'forbidden' };

  const receiptId = text(input.receipt?.id);
  if (!input.receipt || !receiptId) return { ok: false, code: 'not_found' };
  if (isCancelledManualReceipt(input.receipt)) return { ok: false, code: 'cancelled' };
  if (isManualReceiptAlreadyPaid(input.receipt)) return { ok: false, code: 'already_paid' };

  const operatorTenant = text(input.operatorTenantId);
  const receiptTenant = text(input.receipt.tenantId);
  const receiptCompany = text(input.receipt.companyId);
  const sameCompany = Boolean(operatorTenant)
    && (operatorTenant === receiptTenant || operatorTenant === receiptCompany);
  if (!isPlatformAdmin(input.operatorRole) && !sameCompany) {
    return { ok: false, code: 'tenant_mismatch' };
  }

  const amount = Number(input.receipt.amount);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, code: 'invalid' };
  return { ok: true, receiptId, amount };
}

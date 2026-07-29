/**
 * Orquestração servidor: Liberar lote e encerrar venda.
 * Fases: plano → cancelar Asaas abertas → aplicar local → auditoria.
 * Sem migration — usa status existentes (cancelado / CANCELLED / Disponível).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cancelCompanyCharge,
  getCompanyChargeStatus,
} from '@/lib/finance/asaasCompanyChargeService';
import {
  CompanyAsaasEnvironmentMismatchError,
} from '@/lib/finance/companyAsaasChargeLinkGuards';
import {
  buildReleaseLotIdempotencyKey,
  classifyRemoteAsaasStatusForRelease,
  CONTRACT_CANCELLED_STATUS,
  isActiveUnpaidFinanceReceipt,
  isAlreadyCancelledAsaasChargeStatus,
  isAvailableLotStatus,
  isCanceledContractStatus,
  isCanceledSaleStatus,
  isLocalAsaasCancelCandidateStatus,
  isPaidAsaasChargeStatus,
  isPaidFinanceReceiptStatus,
  isSoldOrReservedLotStatus,
  LOT_AVAILABLE_STATUS,
  normalizeAsaasRemoteStatus,
  RECEIPT_CANCELLED_STATUS,
  SALE_CANCELLED_STATUS,
  resolveBlockLotLabel,
  resolveBlockQuadraLabel,
  summarizeReleaseCharges,
  summarizeReleaseReceipts,
  validateReleaseLotMotive,
  type ReleaseAsaasDisposition,
  type ReleaseLotMotiveCode,
  type ReleaseLotPreview,
} from '@/lib/finance/releaseLotShared';
import { isCanceledBrokerCommission, isPaidBrokerCommission } from '@/lib/brokerCommission';
import { logLotAuditEvent } from '@/lib/lotAudit';
import { isPlatformAdmin, tenantOrClause } from '@/lib/rls';
import {
  isTenantEnterpriseAdminRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';
import { cancelOpenSaleSignatures } from '@/lib/saleContractSignatureService';
import { resolveCallerProfile } from '@/lib/supabase/server';

export type { ReleaseLotPreview };
export { resolveBlockLotLabel, resolveBlockQuadraLabel };
export type ReleaseLotStage =
  | 'auth'
  | 'load_lot'
  | 'load_preview'
  | 'validate_motive'
  | 'cancel_asaas'
  | 'cancel_receipts'
  | 'cancel_commissions'
  | 'cancel_signatures'
  | 'cancel_contract'
  | 'cancel_sale'
  | 'clear_lot'
  | 'audit';

export class ReleaseLotError extends Error {
  status: number;
  code?: string;
  stage?: ReleaseLotStage;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status = 400,
    code?: string,
    details?: Record<string, unknown>,
    stage?: ReleaseLotStage,
  ) {
    super(message);
    this.name = 'ReleaseLotError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.stage = stage;
  }
}

function releaseErr(
  message: string,
  status: number,
  code: string,
  stage: ReleaseLotStage,
  details?: Record<string, unknown>,
): ReleaseLotError {
  return new ReleaseLotError(message, status, code, details, stage);
}

export type ReleaseLotExecuteInput = {
  lotId: string;
  userId: string;
  motiveCode: string;
  motiveDetail?: string | null;
  acknowledged: boolean;
  idempotencyKey?: string | null;
  /** Quando true, tenta novamente cancelar cobranças Asaas e concluir local. */
  retry?: boolean;
};

export type ReleaseLotExecuteResult = {
  ok: true;
  alreadyReleased: boolean;
  lotId: string;
  saleId: string | null;
  contractId: string | null;
  mode: ReleaseLotPreview['mode'];
  preservedPaidReceipts: number;
  cancelledUnpaidReceipts: number;
  cancelledAsaasCharges: number;
  failedAsaasCharges: Array<{ chargeId: string; error: string }>;
  totalPaidAmount: number;
  motiveCode: ReleaseLotMotiveCode;
  motiveLabel: string;
  message: string;
};

type BlockRow = {
  id: string;
  status?: string | null;
  price?: number | null;
  customer_id?: string | null;
  sale_id?: string | null;
  contract_id?: string | null;
  broker_id?: string | null;
  project_id?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
  /** Quadra — coluna real: block_name (fallback name). */
  block_name?: string | null;
  name?: string | null;
  /** Lote — coluna real: number (fallback lot_number). */
  number?: string | null;
  lot_number?: string | null;
};

type ReceiptRow = {
  id: string;
  sale_id?: string | null;
  status?: string | null;
  paid_at?: string | null;
  amount?: number | string | null;
};

type ChargeRow = {
  id: string;
  sale_id?: string | null;
  installment_id?: string | null;
  status?: string | null;
  company_id?: string | null;
};

function assertCanReleaseLot(role?: string | null): void {
  const normalized = normalizeUserRole(role);
  if (isPlatformAdmin(normalized) || isTenantEnterpriseAdminRole(normalized)) {
    return;
  }
  throw releaseErr(
    'Apenas administradores da empresa podem liberar lote e encerrar venda.',
    403,
    'FORBIDDEN',
    'auth',
  );
}

/**
 * Carrega o lote (registro em `blocks`) com colunas reais do schema.
 * Quadra = block_name || name; Lote = number || lot_number.
 * Não seleciona `blocks.block` (coluna inexistente).
 */
async function loadBlock(
  admin: SupabaseClient,
  lotId: string,
): Promise<BlockRow> {
  const { data, error } = await admin
    .from('blocks')
    .select(
      'id, status, price, customer_id, sale_id, contract_id, broker_id, project_id, tenant_id, company_id, block_name, name, number, lot_number',
    )
    .eq('id', lotId)
    .maybeSingle();

  if (error) {
    console.error('[releaseLot] LOAD_LOT_FAILED', {
      lotId: lotId.slice(0, 8),
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw releaseErr(
      'Não foi possível carregar os dados do lote.',
      500,
      'LOT_CONTEXT_LOAD_FAILED',
      'load_lot',
    );
  }
  if (!data) {
    throw releaseErr('Lote não encontrado.', 404, 'LOT_NOT_FOUND', 'load_lot');
  }
  return data as BlockRow;
}

async function assertLotTenantAccess(
  admin: SupabaseClient,
  userId: string,
  block: BlockRow,
): Promise<{ companyId: string; role: string }> {
  const profile = await resolveCallerProfile(admin, userId);
  if (!profile) {
    throw releaseErr('Perfil de usuário não encontrado.', 403, 'NO_PROFILE', 'auth');
  }
  assertCanReleaseLot(profile.role);

  const companyId = String(block.tenant_id || block.company_id || '').trim();
  if (!companyId) {
    throw releaseErr('Lote sem empresa vinculada.', 400, 'LOT_NO_TENANT', 'auth');
  }

  const callerTenant = String(
    profile.tenant_id || (profile as { company_id?: string }).company_id || '',
  ).trim();
  const role = normalizeUserRole(profile.role);
  if (!isPlatformAdmin(role) && callerTenant && callerTenant !== companyId) {
    throw releaseErr('Sem permissão para este lote.', 403, 'CROSS_TENANT', 'auth');
  }

  return { companyId, role };
}

async function resolveSaleIdForBlock(
  admin: SupabaseClient,
  block: BlockRow,
  companyId: string,
): Promise<string | null> {
  if (block.sale_id) return String(block.sale_id);

  if (block.contract_id) {
    const { data: contract } = await admin
      .from('contracts')
      .select('id, sale_id')
      .eq('id', block.contract_id)
      .maybeSingle();
    if (contract?.sale_id) return String(contract.sale_id);
  }

  const { data: sales } = await admin
    .from('sales')
    .select('id, status, created_at')
    .eq('block_id', block.id)
    .or(tenantOrClause(companyId))
    .order('created_at', { ascending: false })
    .limit(5);

  const rows = (sales || []) as Array<{ id: string; status?: string | null }>;
  const active = rows.find((s) => !isCanceledSaleStatus(s.status));
  if (active) return String(active.id);
  if (rows[0]?.id) return String(rows[0].id);
  return null;
}

async function loadSaleContext(
  admin: SupabaseClient,
  saleId: string | null,
  companyId: string,
): Promise<{
  sale: Record<string, unknown> | null;
  contract: Record<string, unknown> | null;
  receipts: ReceiptRow[];
  charges: ChargeRow[];
  customerName: string | null;
  documentsPreserved: number;
}> {
  if (!saleId) {
    return {
      sale: null,
      contract: null,
      receipts: [],
      charges: [],
      customerName: null,
      documentsPreserved: 0,
    };
  }

  const { data: sale, error: saleErr } = await admin
    .from('sales')
    .select('id, status, customer_id, contract_id, block_id, tenant_id, company_id, created_at')
    .eq('id', saleId)
    .maybeSingle();
  if (saleErr) {
    console.error('[releaseLot] LOAD_SALE_FAILED', saleErr.message);
    throw releaseErr(
      'Não foi possível carregar os dados da venda.',
      500,
      'LOAD_SALE_FAILED',
      'load_preview',
    );
  }
  if (!sale) {
    throw releaseErr('Venda vinculada não encontrada.', 404, 'SALE_NOT_FOUND', 'load_preview');
  }

  const saleTenant = String(
    (sale as { tenant_id?: string }).tenant_id ||
      (sale as { company_id?: string }).company_id ||
      '',
  );
  if (saleTenant && saleTenant !== companyId) {
    throw releaseErr(
      'Venda não pertence à empresa do lote.',
      403,
      'SALE_TENANT_MISMATCH',
      'load_preview',
    );
  }

  let contract: Record<string, unknown> | null = null;
  const contractId =
    String((sale as { contract_id?: string }).contract_id || '').trim() || null;

  async function loadContractBy(
    filter: { column: 'id' | 'sale_id'; value: string },
  ): Promise<Record<string, unknown> | null> {
    // Preferência: campos de assinatura; fallback se coluna não existir no ambiente.
    const full = await admin
      .from('contracts')
      .select('id, status, contract_number, sale_id, signed_at, signature_status')
      .eq(filter.column, filter.value)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!full.error && full.data) return full.data as Record<string, unknown>;

    const lean = await admin
      .from('contracts')
      .select('id, status, contract_number, sale_id')
      .eq(filter.column, filter.value)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lean.error) {
      console.warn('[releaseLot] load contract', lean.error.message);
      return null;
    }
    return (lean.data as Record<string, unknown>) || null;
  }

  if (contractId) {
    contract = await loadContractBy({ column: 'id', value: contractId });
  }
  if (!contract) {
    contract = await loadContractBy({ column: 'sale_id', value: saleId });
  }

  const { data: receiptRows, error: receiptErr } = await admin
    .from('finance_receipts')
    .select('id, sale_id, status, paid_at, amount')
    .eq('sale_id', saleId)
    .or(tenantOrClause(companyId));
  if (receiptErr) {
    console.error('[releaseLot] LOAD_RECEIPTS_FAILED', receiptErr.message);
    throw releaseErr(
      'Não foi possível carregar as parcelas do lote.',
      500,
      'LOAD_RECEIPTS_FAILED',
      'load_preview',
    );
  }
  const receipts = (receiptRows || []) as ReceiptRow[];

  const { data: chargeRows } = await admin
    .from('company_asaas_charges')
    .select('id, sale_id, installment_id, status, company_id')
    .eq('sale_id', saleId)
    .eq('company_id', companyId);
  const charges = (chargeRows || []) as ChargeRow[];

  let customerName: string | null = null;
  const customerId = String((sale as { customer_id?: string }).customer_id || '').trim();
  if (customerId) {
    const { data: customer } = await admin
      .from('customers')
      .select('id, name')
      .eq('id', customerId)
      .maybeSingle();
    customerName = String((customer as { name?: string })?.name || '').trim() || null;
  }

  let documentsPreserved = 0;
  try {
    const { count } = await admin
      .from('sale_documents')
      .select('id', { count: 'exact', head: true })
      .eq('sale_id', saleId)
      .is('deleted_at', null);
    documentsPreserved = Number(count || 0);
  } catch {
    documentsPreserved = 0;
  }

  return {
    sale: sale as Record<string, unknown>,
    contract,
    receipts,
    charges,
    customerName,
    documentsPreserved,
  };
}

function buildPreviewFromContext(params: {
  block: BlockRow;
  companyId: string;
  saleId: string | null;
  sale: Record<string, unknown> | null;
  contract: Record<string, unknown> | null;
  receipts: ReceiptRow[];
  charges: ChargeRow[];
  customerName: string | null;
  documentsPreserved: number;
}): ReleaseLotPreview {
  const { block, companyId, saleId, sale, contract, receipts, charges } = params;
  const receiptSummary = summarizeReleaseReceipts(receipts);
  const chargeSummary = summarizeReleaseCharges(charges);

  const unpaidReceiptIds = receipts
    .filter((r) => isActiveUnpaidFinanceReceipt(r))
    .map((r) => r.id);
  const paidReceiptIds = receipts
    .filter((r) => isPaidFinanceReceiptStatus(r))
    .map((r) => r.id);
  // Candidatas locais (PENDING/REGISTERED/OVERDUE) — a contagem cancelável
  // efetiva vem após sync remoto em resolveCancelableAsaasCharges.
  const candidateChargeIds = charges
    .filter((c) => isLocalAsaasCancelCandidateStatus(c.status))
    .map((c) => c.id);

  const saleStatus = sale ? String(sale.status || '') : null;
  const lotAvailable = isAvailableLotStatus(block.status);
  const saleCancelled = saleStatus ? isCanceledSaleStatus(saleStatus) : true;

  let mode: ReleaseLotPreview['mode'] = 'full_release';
  if (lotAvailable && (saleCancelled || !saleId) && !block.sale_id && !block.contract_id && !block.customer_id) {
    mode = 'already_released';
  } else if (!saleId) {
    mode = 'simple_clear';
  } else if (saleCancelled && lotAvailable && !block.sale_id && !block.customer_id) {
    mode = 'already_released';
  }

  const contractStatus = contract ? String(contract.status || '') : null;
  const signedAt = contract?.signed_at ? String(contract.signed_at) : '';
  const sigStatus = String(contract?.signature_status || '').toUpperCase();
  const contractSigned = Boolean(signedAt) || sigStatus === 'SIGNED';

  return {
    lotId: block.id,
    companyId,
    projectId: block.project_id ? String(block.project_id) : null,
    status: block.status ? String(block.status) : null,
    quadra: resolveBlockQuadraLabel(block),
    lote: resolveBlockLotLabel(block),
    price: block.price != null ? Number(block.price) : null,
    customerId: block.customer_id ? String(block.customer_id) : null,
    customerName: params.customerName,
    saleId,
    saleStatus,
    contractId: contract?.id ? String(contract.id) : block.contract_id ? String(block.contract_id) : null,
    contractNumber:
      contract?.contract_number != null ? String(contract.contract_number) : null,
    contractStatus,
    contractSigned,
    documentsPreserved: params.documentsPreserved,
    mode,
    idempotencyKey: buildReleaseLotIdempotencyKey(block.id, saleId),
    paidReceipts: receiptSummary.paidReceipts,
    pendingReceipts: receiptSummary.pendingReceipts,
    overdueReceipts: receiptSummary.overdueReceipts,
    unpaidToCancel: receiptSummary.unpaidToCancel,
    totalPaidAmount: receiptSummary.totalPaidAmount,
    lastPaidAt: receiptSummary.lastPaidAt,
    hasPreservedPayments: receiptSummary.hasPreservedPayments,
    openAsaasCharges: chargeSummary.openAsaasCharges,
    paidAsaasCharges: chargeSummary.paidAsaasCharges,
    alreadyCanceledAsaasCharges: chargeSummary.alreadyCanceledAsaasCharges,
    asaasBlockedCharges: 0,
    asaasBlockedDetails: [],
    openChargeIds: candidateChargeIds,
    unpaidReceiptIds,
    paidReceiptIds,
  };
}

export async function getReleaseLotPreview(
  admin: SupabaseClient,
  lotId: string,
  userId: string,
): Promise<ReleaseLotPreview> {
  const block = await loadBlock(admin, lotId);
  const { companyId } = await assertLotTenantAccess(admin, userId, block);
  const saleId = await resolveSaleIdForBlock(admin, block, companyId);
  const ctx = await loadSaleContext(admin, saleId, companyId);

  if (!ctx.customerName && block.customer_id) {
    const { data: customer } = await admin
      .from('customers')
      .select('name')
      .eq('id', block.customer_id)
      .maybeSingle();
    ctx.customerName =
      String((customer as { name?: string })?.name || '').trim() || null;
  }

  const preview = buildPreviewFromContext({
    block,
    companyId,
    saleId,
    sale: ctx.sale,
    contract: ctx.contract,
    receipts: ctx.receipts,
    charges: ctx.charges,
    customerName: ctx.customerName,
    documentsPreserved: ctx.documentsPreserved,
  });

  // Sync Asaas: conta apenas cobranças realmente canceláveis (PENDING/OVERDUE remoto).
  if (preview.openChargeIds.length > 0) {
    const asaasPlan = await resolveAsaasChargesForRelease(
      admin,
      companyId,
      preview.openChargeIds,
      { executeCancel: false },
    );
    preview.openChargeIds = asaasPlan.cancelableIds;
    preview.openAsaasCharges = asaasPlan.cancelableIds.length;
    preview.paidAsaasCharges += asaasPlan.preservedPaid;
    preview.alreadyCanceledAsaasCharges +=
      asaasPlan.alreadyCancelled + asaasPlan.preservedRefunded;
    preview.asaasBlockedCharges = asaasPlan.failed.length;
    preview.asaasBlockedDetails = asaasPlan.failed.map((f) => ({
      chargeId: f.chargeId,
      error: f.error,
      localStatus: f.localStatus ?? null,
      remoteStatus: f.remoteStatus ?? null,
    }));
    if (asaasPlan.preservedPaid > 0) {
      preview.hasPreservedPayments = true;
    }
  }

  return preview;
}

type AsaasReleaseProcessResult = {
  cancelableIds: string[];
  cancelled: number;
  preservedPaid: number;
  preservedRefunded: number;
  alreadyCancelled: number;
  failed: Array<{
    chargeId: string;
    error: string;
    localStatus?: string | null;
    remoteStatus?: string | null;
    disposition?: ReleaseAsaasDisposition;
  }>;
};

/**
 * Consulta o status real no Asaas antes de decidir.
 * - PENDING/OVERDUE → cancelável (DELETE)
 * - RECEIVED/CONFIRMED → preservar paga (atualiza local)
 * - REFUNDED → preservar estornada
 * - DELETED/CANCELLED → já cancelada
 * - demais não removíveis → falha crítica (não limpa local)
 */
async function resolveAsaasChargesForRelease(
  admin: SupabaseClient,
  companyId: string,
  candidateIds: string[],
  options?: { executeCancel?: boolean },
): Promise<AsaasReleaseProcessResult> {
  const executeCancel = options?.executeCancel === true;
  const cancelableIds: string[] = [];
  const failed: AsaasReleaseProcessResult['failed'] = [];
  let cancelled = 0;
  let preservedPaid = 0;
  let preservedRefunded = 0;
  let alreadyCancelled = 0;

  for (const chargeId of candidateIds) {
    const { data: localRow } = await admin
      .from('company_asaas_charges')
      .select('id, status, asaas_payment_id')
      .eq('id', chargeId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!localRow) {
      alreadyCancelled += 1;
      continue;
    }

    const localBefore = String((localRow as { status?: string }).status || '');
    const asaasPaymentId = String(
      (localRow as { asaas_payment_id?: string }).asaas_payment_id || '',
    );

    if (isPaidAsaasChargeStatus(localBefore)) {
      preservedPaid += 1;
      console.log('[releaseLot][asaas] preserve_paid_local', {
        chargeId: chargeId.slice(0, 8),
        localBefore,
        asaasPaymentId,
      });
      continue;
    }
    if (isAlreadyCancelledAsaasChargeStatus(localBefore)) {
      alreadyCancelled += 1;
      continue;
    }

    let remoteStatus: string | null = null;
    let disposition: ReleaseAsaasDisposition = 'block_non_removable';

    try {
      const synced = await getCompanyChargeStatus(admin, companyId, chargeId);
      remoteStatus =
        normalizeAsaasRemoteStatus(synced.asaasRemoteStatus) ||
        normalizeAsaasRemoteStatus(synced.status);
      disposition = classifyRemoteAsaasStatusForRelease(
        synced.asaasRemoteStatus || synced.status,
      );

      console.log('[releaseLot][asaas] synced', {
        chargeId: chargeId.slice(0, 8),
        asaasPaymentId,
        localBefore,
        localAfter: synced.status,
        remoteStatus,
        disposition,
      });
    } catch (err) {
      // 404 / mismatch de ambiente: NÃO marcar CANCELLED cegamente — falha crítica.
      const msg = err instanceof Error ? err.message : String(err);
      const isMismatch = err instanceof CompanyAsaasEnvironmentMismatchError;
      failed.push({
        chargeId,
        error: isMismatch
          ? `Cobrança não encontrada no ambiente Asaas atual (possível mismatch de chave/ambiente). Local=${localBefore}. ${msg}`
          : msg,
        localStatus: localBefore,
        remoteStatus: null,
        disposition: 'block_non_removable',
      });
      console.warn('[releaseLot][asaas] sync_failed', {
        chargeId: chargeId.slice(0, 8),
        asaasPaymentId,
        localBefore,
        isMismatch,
        error: msg,
      });
      continue;
    }

    if (disposition === 'preserve_paid') {
      preservedPaid += 1;
      continue;
    }
    if (disposition === 'preserve_refunded') {
      preservedRefunded += 1;
      continue;
    }
    if (disposition === 'already_cancelled') {
      alreadyCancelled += 1;
      continue;
    }
    if (disposition === 'block_non_removable') {
      failed.push({
        chargeId,
        error: `Cobrança Asaas com status remoto "${remoteStatus || 'desconhecido'}" não é removível (só PENDING/OVERDUE). Local era ${localBefore}.`,
        localStatus: localBefore,
        remoteStatus,
        disposition,
      });
      continue;
    }

    // disposition === 'cancel' — só PENDING/OVERDUE remoto
    cancelableIds.push(chargeId);
    if (!executeCancel) continue;

    try {
      await cancelCompanyCharge(admin, companyId, chargeId);
      cancelled += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Não repetir DELETE: reconsultar Asaas e reclassificar uma vez.
      if (/não pode ser removida|nao pode ser removida|pendentes ou vencidas/i.test(msg)) {
        try {
          const resynced = await getCompanyChargeStatus(admin, companyId, chargeId);
          const remoteAfter =
            normalizeAsaasRemoteStatus(resynced.asaasRemoteStatus) ||
            normalizeAsaasRemoteStatus(resynced.status);
          const dispositionAfter = classifyRemoteAsaasStatusForRelease(
            resynced.asaasRemoteStatus || resynced.status,
          );
          console.log('[releaseLot][asaas] delete_rejected_reclassified', {
            chargeId: chargeId.slice(0, 8),
            localBefore,
            remoteAfter,
            dispositionAfter,
            asaasMessage: msg,
          });
          if (dispositionAfter === 'preserve_paid') {
            preservedPaid += 1;
            continue;
          }
          if (dispositionAfter === 'preserve_refunded') {
            preservedRefunded += 1;
            continue;
          }
          if (dispositionAfter === 'already_cancelled') {
            alreadyCancelled += 1;
            continue;
          }
          failed.push({
            chargeId,
            error: `Asaas recusou remoção (status remoto ${remoteAfter || 'desconhecido'}). Local era ${localBefore}. ${msg}`,
            localStatus: localBefore,
            remoteStatus: remoteAfter,
            disposition: 'block_non_removable',
          });
        } catch (reErr) {
          const reMsg = reErr instanceof Error ? reErr.message : String(reErr);
          failed.push({
            chargeId,
            error: `${msg} (reconsulta falhou: ${reMsg})`,
            localStatus: localBefore,
            remoteStatus,
            disposition: 'block_non_removable',
          });
        }
      } else if (/404|not found/i.test(msg)) {
        failed.push({
          chargeId,
          error: `Cobrança Asaas não encontrada ao cancelar (não marcar local). Local=${localBefore}. ${msg}`,
          localStatus: localBefore,
          remoteStatus,
          disposition: 'block_non_removable',
        });
      } else {
        failed.push({
          chargeId,
          error: msg,
          localStatus: localBefore,
          remoteStatus,
          disposition: 'cancel',
        });
      }
    }
  }

  return {
    cancelableIds,
    cancelled,
    preservedPaid,
    preservedRefunded,
    alreadyCancelled,
    failed,
  };
}

async function cancelOpenAsaasCharges(
  admin: SupabaseClient,
  companyId: string,
  openChargeIds: string[],
): Promise<{ cancelled: number; failed: Array<{ chargeId: string; error: string }> }> {
  const result = await resolveAsaasChargesForRelease(admin, companyId, openChargeIds, {
    executeCancel: true,
  });
  return {
    cancelled: result.cancelled + result.alreadyCancelled,
    failed: result.failed.map((f) => ({
      chargeId: f.chargeId,
      error: f.error,
      ...(f.localStatus ? { localStatus: f.localStatus } : {}),
      ...(f.remoteStatus ? { remoteStatus: f.remoteStatus } : {}),
    })) as Array<{ chargeId: string; error: string }>,
  };
}

async function applyLocalRelease(
  admin: SupabaseClient,
  params: {
    companyId: string;
    block: BlockRow;
    preview: ReleaseLotPreview;
    userId: string;
    motiveCode: ReleaseLotMotiveCode;
    motiveLabel: string;
    motiveDetail: string | null;
  },
): Promise<{ cancelledUnpaidReceipts: number }> {
  const { companyId, block, preview, userId, motiveCode, motiveLabel, motiveDetail } = params;
  const now = new Date().toISOString();
  let cancelledUnpaidReceipts = 0;

  if (preview.unpaidReceiptIds.length > 0) {
    const { data: updated, error } = await admin
      .from('finance_receipts')
      .update({ status: RECEIPT_CANCELLED_STATUS })
      .in('id', preview.unpaidReceiptIds)
      .select('id');
    if (error) {
      console.error('[releaseLot] CANCEL_RECEIPTS_FAILED', error.message);
      throw releaseErr(
        'Não foi possível cancelar as parcelas pendentes.',
        500,
        'CANCEL_RECEIPTS_FAILED',
        'cancel_receipts',
      );
    }
    cancelledUnpaidReceipts = (updated || []).length;

    if (preview.paidReceiptIds.length > 0) {
      const { data: stillPaidCheck } = await admin
        .from('finance_receipts')
        .select('id, status, paid_at')
        .in('id', preview.paidReceiptIds);
      for (const row of stillPaidCheck || []) {
        if (!isPaidFinanceReceiptStatus(row as ReceiptRow)) {
          throw releaseErr(
            'Inconsistência: parcela paga foi alterada indevidamente.',
            500,
            'PAID_RECEIPT_CORRUPTED',
            'cancel_receipts',
          );
        }
      }
    }
  }

  if (preview.saleId) {
    const { data: commissions } = await admin
      .from('broker_commissions')
      .select('id, status')
      .eq('sale_id', preview.saleId);

    const toCancel = (commissions || [])
      .filter((c) => {
        const st = String((c as { status?: string }).status || '');
        return !isPaidBrokerCommission(st) && !isCanceledBrokerCommission(st);
      })
      .map((c) => String((c as { id: string }).id));

    if (toCancel.length > 0) {
      const { error: commissionErr } = await admin
        .from('broker_commissions')
        .update({ status: 'cancelado' })
        .in('id', toCancel);
      if (commissionErr) {
        console.warn('[releaseLot] cancel commissions', commissionErr.message);
      }
    }
  }

  if (preview.contractId) {
    try {
      await cancelOpenSaleSignatures(admin, preview.contractId);
    } catch (err) {
      console.warn('[releaseLot] cancelOpenSaleSignatures', err);
    }

    if (!isCanceledContractStatus(preview.contractStatus)) {
      const { error: contractErr } = await admin
        .from('contracts')
        .update({ status: CONTRACT_CANCELLED_STATUS })
        .eq('id', preview.contractId);
      if (contractErr) {
        console.error('[releaseLot] CANCEL_CONTRACT_FAILED', contractErr.message);
        throw releaseErr(
          'Não foi possível cancelar o contrato.',
          500,
          'CANCEL_CONTRACT_FAILED',
          'cancel_contract',
        );
      }
    }
  }

  if (preview.saleId && !isCanceledSaleStatus(preview.saleStatus)) {
    const { error: saleErr } = await admin
      .from('sales')
      .update({ status: SALE_CANCELLED_STATUS })
      .eq('id', preview.saleId);
    if (saleErr) {
      console.error('[releaseLot] CANCEL_SALE_FAILED', saleErr.message);
      throw releaseErr(
        'Não foi possível encerrar a venda.',
        500,
        'CANCEL_SALE_FAILED',
        'cancel_sale',
      );
    }
  }

  const clearCore = {
    status: LOT_AVAILABLE_STATUS,
    customer_id: null,
    sale_id: null,
    contract_id: null,
    broker_id: null,
    reservation_expires_at: null,
    reservation_date: null,
  };

  let blockErr = (
    await admin
      .from('blocks')
      .update({
        ...clearCore,
        signal_amount: null,
        signal_date: null,
        signal_payment_method: null,
        signal_notes: null,
      })
      .eq('id', block.id)
  ).error;

  if (blockErr && /signal_|column/i.test(blockErr.message)) {
    // Schema sem campos de sinal — limpa só vínculos comerciais.
    blockErr = (await admin.from('blocks').update(clearCore).eq('id', block.id)).error;
  }

  if (blockErr) {
    console.error('[releaseLot] CLEAR_LOT_FAILED', blockErr.message);
    throw releaseErr(
      'Não foi possível liberar o lote.',
      500,
      'CLEAR_LOT_FAILED',
      'clear_lot',
    );
  }

  const auditPayload = {
    motiveCode,
    motiveLabel,
    motiveDetail,
    saleId: preview.saleId,
    contractId: preview.contractId,
    preservedPaidReceipts: preview.paidReceipts,
    totalPaidAmount: preview.totalPaidAmount,
    cancelledUnpaidReceipts: preview.unpaidToCancel,
    openAsaasCharges: preview.openAsaasCharges,
    idempotencyKey: preview.idempotencyKey,
    releasedAt: now,
  };

  await logLotAuditEvent(admin, {
    companyId,
    projectId: preview.projectId,
    blockId: block.id,
    saleId: preview.saleId,
    contractId: preview.contractId,
    userId,
    action: preview.saleId ? 'sale_cancelled' : 'status_changed',
    title: preview.saleId
      ? 'Lote liberado — venda encerrada'
      : 'Lote liberado (Disponível)',
    description: `${motiveLabel}${motiveDetail ? `: ${motiveDetail}` : ''} · ${block.status || '—'} → ${LOT_AVAILABLE_STATUS}`,
    oldData: {
      status: block.status,
      customer_id: block.customer_id,
      sale_id: block.sale_id,
      contract_id: block.contract_id,
    },
    newData: auditPayload,
    source: 'gis_map',
  });

  try {
    await admin.from('audit_logs').insert({
      tenant_id: companyId,
      company_id: companyId,
      user_id: userId,
      action: 'LOT_RELEASED',
      module: 'gis',
      description: `Liberar lote ${preview.quadra || ''}/${preview.lote || ''} — ${motiveLabel}`,
      reference_id: block.id,
      metadata: auditPayload,
    });
  } catch (err) {
    console.warn('[releaseLot] audit_logs', err);
  }

  try {
    await admin.from('logs').insert({
      tenant_id: companyId,
      user_id: userId,
      action: LOT_AVAILABLE_STATUS,
      details: {
        title: `Lote Quadra ${preview.quadra} Lote ${preview.lote} liberado`,
        subtitle: motiveLabel,
        ...auditPayload,
      },
    });
  } catch {
    /* logs opcional */
  }

  return { cancelledUnpaidReceipts };
}

export async function executeReleaseLot(
  admin: SupabaseClient,
  input: ReleaseLotExecuteInput,
): Promise<ReleaseLotExecuteResult> {
  if (!input.acknowledged) {
    throw releaseErr(
      'Confirme que está ciente de que o lote será liberado e as obrigações não pagas serão canceladas.',
      400,
      'ACK_REQUIRED',
      'validate_motive',
    );
  }

  const motive = validateReleaseLotMotive({
    motiveCode: input.motiveCode,
    motiveDetail: input.motiveDetail,
  });
  if (!motive.ok) {
    throw releaseErr(motive.error, 400, 'MOTIVE_REQUIRED', 'validate_motive');
  }

  const preview = await getReleaseLotPreview(admin, input.lotId, input.userId);

  if (
    input.idempotencyKey &&
    input.idempotencyKey !== preview.idempotencyKey &&
    preview.mode !== 'already_released'
  ) {
    // Aceita chave do preview atual; chave antiga de outra venda no mesmo lote é rejeitada
    console.warn('[releaseLot] idempotency key mismatch', {
      expected: preview.idempotencyKey,
      got: input.idempotencyKey,
    });
  }

  if (preview.mode === 'already_released') {
    return {
      ok: true,
      alreadyReleased: true,
      lotId: preview.lotId,
      saleId: preview.saleId,
      contractId: preview.contractId,
      mode: preview.mode,
      preservedPaidReceipts: preview.paidReceipts,
      cancelledUnpaidReceipts: 0,
      cancelledAsaasCharges: 0,
      failedAsaasCharges: [],
      totalPaidAmount: preview.totalPaidAmount,
      motiveCode: motive.motiveCode,
      motiveLabel: motive.motiveLabel,
      message: 'Lote já estava disponível e a venda já estava encerrada.',
    };
  }

  if (
    preview.mode === 'full_release' &&
    !isSoldOrReservedLotStatus(preview.status) &&
    !preview.saleId
  ) {
    throw releaseErr(
      'Status do lote não permite liberação comercial neste fluxo.',
      409,
      'INVALID_STATUS',
      'load_preview',
    );
  }

  const block = await loadBlock(admin, input.lotId);

  // Fase Asaas: reconsulta TODAS as candidatas locais (não só IDs da prévia).
  // Sync remoto antes de qualquer DELETE; falha crítica bloqueia limpeza local.
  let cancelledAsaasCharges = 0;
  let failedAsaasCharges: Array<{
    chargeId: string;
    error: string;
    localStatus?: string | null;
    remoteStatus?: string | null;
  }> = [];

  if (preview.saleId) {
    const liveCtx = await loadSaleContext(admin, preview.saleId, preview.companyId);
    const candidateIds = liveCtx.charges
      .filter((c) => isLocalAsaasCancelCandidateStatus(c.status))
      .map((c) => c.id);

    if (candidateIds.length > 0) {
      const asaasResult = await resolveAsaasChargesForRelease(
        admin,
        preview.companyId,
        candidateIds,
        { executeCancel: true },
      );
      cancelledAsaasCharges = asaasResult.cancelled + asaasResult.alreadyCancelled;
      failedAsaasCharges = asaasResult.failed.map((f) => ({
        chargeId: f.chargeId,
        error: f.error,
        localStatus: f.localStatus ?? null,
        remoteStatus: f.remoteStatus ?? null,
      }));

      if (failedAsaasCharges.length > 0) {
        throw releaseErr(
          `Não foi possível concluir o Asaas para ${failedAsaasCharges.length} cobrança(s). A limpeza local não foi aplicada. Reprocesse após corrigir.`,
          502,
          'ASAAS_CANCEL_FAILED',
          'cancel_asaas',
          { failedAsaasCharges },
        );
      }
    }
  } else if (preview.openChargeIds.length > 0) {
    const asaasResult = await cancelOpenAsaasCharges(
      admin,
      preview.companyId,
      preview.openChargeIds,
    );
    cancelledAsaasCharges = asaasResult.cancelled;
    failedAsaasCharges = asaasResult.failed;
    if (failedAsaasCharges.length > 0) {
      throw releaseErr(
        `Não foi possível concluir o Asaas para ${failedAsaasCharges.length} cobrança(s). A limpeza local não foi aplicada. Reprocesse após corrigir.`,
        502,
        'ASAAS_CANCEL_FAILED',
        'cancel_asaas',
        { failedAsaasCharges },
      );
    }
  }

  const local = await applyLocalRelease(admin, {
    companyId: preview.companyId,
    block,
    preview,
    userId: input.userId,
    motiveCode: motive.motiveCode,
    motiveLabel: motive.motiveLabel,
    motiveDetail: motive.motiveDetail,
  });

  return {
    ok: true,
    alreadyReleased: false,
    lotId: preview.lotId,
    saleId: preview.saleId,
    contractId: preview.contractId,
    mode: preview.mode,
    preservedPaidReceipts: preview.paidReceipts,
    cancelledUnpaidReceipts: local.cancelledUnpaidReceipts,
    cancelledAsaasCharges,
    failedAsaasCharges: [],
    totalPaidAmount: preview.totalPaidAmount,
    motiveCode: motive.motiveCode,
    motiveLabel: motive.motiveLabel,
    message:
      preview.hasPreservedPayments
        ? 'Lote liberado. Pagamentos preservados no Financeiro para histórico e eventual devolução.'
        : 'Lote liberado e venda encerrada. Obrigações não pagas canceladas.',
  };
}

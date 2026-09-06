/**
 * Carrega a prévia da Troca de lote (Fase 2).
 * Somente leitura. Não grava sale_lot_swaps, sales, blocks, receipts ou contratos.
 *
 * Fase 4 (não implementada): repetir estas validações com SELECT … FOR UPDATE
 * em transação RPC. Este preview não usa lock.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatInstallmentCorrectionLabel } from '@/lib/installmentCorrectionType';
import {
  deriveLotSwapPreviewFinancials,
  evaluateLotSwapDestination,
  assertOriginBelongsToSale,
  assertSaleEligibleForLotSwapPreview,
  isLotSwapFutureReceipt,
  lotSwapPreviewBlockMessage,
  simulateLotSwapSchedule,
  sumLotSwapPaidAmount,
  LOT_SWAP_ORIGIN_MISMATCH,
  type LotSwapBlockSnapshot,
  type LotSwapReceiptLike,
  type LotSwapSchedulePreview,
} from '@/lib/finance/saleLotSwapPreview';
import {
  LOT_SWAP_CREDIT_EXCEEDS_PRICE,
  type SaleLotSwapFinancialFields,
} from '@/lib/finance/saleLotSwap';
import { resolveCallerProfile } from '@/lib/supabase/server';

const PLATFORM_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MASTER',
  'MASTER_ADMIN',
  'MASTER-ADMIN',
]);

export class LotSwapPreviewError extends Error {
  status: number;
  code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'LotSwapPreviewError';
    this.code = code;
    this.status = status;
  }
}

export type LotSwapPreviewCurrentSale = {
  saleId: string;
  saleStatus: string | null;
  companyId: string;
  projectId: string | null;
  projectName: string | null;
  customerId: string | null;
  customerName: string | null;
  brokerId: string | null;
  brokerName: string | null;
  contractId: string | null;
  contractNumber: string | null;
  origin: LotSwapBlockSnapshot;
  oldSalePrice: number;
  totalPaid: number;
  paidCount: number;
  oldBalance: number;
  correctionLabel: string | null;
  financialAccountId: string | null;
  financialAccountName: string | null;
};

export type LotSwapPreviewDestinationOption = LotSwapBlockSnapshot;

export type LotSwapPreviewComparison = {
  financials: SaleLotSwapFinancialFields;
  blocked: boolean;
  blockCode: string | null;
  blockMessage: string | null;
  schedule: LotSwapSchedulePreview;
  destination: LotSwapBlockSnapshot;
};

export type LotSwapPreviewPayload = {
  mutation: false;
  persistSwap: false;
  current: LotSwapPreviewCurrentSale;
  destinations: LotSwapPreviewDestinationOption[];
  comparison: LotSwapPreviewComparison | null;
  lockNote: string;
};

function money2(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function text(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

function quadraOf(row: Record<string, unknown>): string | null {
  return text(row.block_name) || text(row.name);
}

function loteOf(row: Record<string, unknown>): string | null {
  return text(row.number) || text(row.lot_number);
}

function snapshotBlock(row: Record<string, unknown>): LotSwapBlockSnapshot {
  const areaRaw = row.area ?? row.area_m2;
  const areaNum = Number(areaRaw);
  return {
    id: String(row.id),
    projectId: text(row.project_id),
    status: text(row.status),
    saleId: text(row.sale_id),
    contractId: text(row.contract_id),
    quadra: quadraOf(row),
    lote: loteOf(row),
    area: Number.isFinite(areaNum) && areaNum > 0 ? money2(areaNum) : null,
    price: money2(row.price),
  };
}

async function loadBlock(
  admin: SupabaseClient,
  blockId: string,
): Promise<Record<string, unknown>> {
  const full = await admin
    .from('blocks')
    .select(
      'id, status, price, sale_id, contract_id, project_id, tenant_id, company_id, block_name, name, number, lot_number, area',
    )
    .eq('id', blockId)
    .maybeSingle();
  if (!full.error && full.data) return full.data as Record<string, unknown>;
  const core = await admin
    .from('blocks')
    .select(
      'id, status, price, sale_id, contract_id, project_id, tenant_id, company_id, block_name, name, number, lot_number',
    )
    .eq('id', blockId)
    .maybeSingle();
  if (core.error || !core.data) {
    throw new LotSwapPreviewError('Lote não encontrado.', 'LOT_NOT_FOUND', 404);
  }
  return core.data as Record<string, unknown>;
}

export async function loadSaleLotSwapPreview(
  admin: SupabaseClient,
  input: { saleId: string; userId: string; toBlockId?: string | null },
): Promise<LotSwapPreviewPayload> {
  const saleId = String(input.saleId || '').trim();
  const userId = String(input.userId || '').trim();
  if (!saleId) {
    throw new LotSwapPreviewError('saleId obrigatório.', 'SALE_ID_REQUIRED', 400);
  }
  if (!userId) {
    throw new LotSwapPreviewError('Não autenticado.', 'UNAUTHORIZED', 401);
  }

  const profile = await resolveCallerProfile(admin, userId);
  if (!profile) {
    throw new LotSwapPreviewError('Perfil de usuário não encontrado.', 'NO_PROFILE', 403);
  }
  const callerRole = String(profile.role || '').toUpperCase();
  const callerTenant = String(
    profile.tenant_id || (profile as { company_id?: string }).company_id || '',
  ).trim();
  const isSuperAdmin = PLATFORM_ADMIN_ROLES.has(callerRole);

  const saleFull = await admin
    .from('sales')
    .select(
      'id, status, customer_id, broker_id, contract_id, block_id, lot_id, project_id, tenant_id, company_id, agreed_price, sale_price, lot_price, financial_account_id, installment_correction_type',
    )
    .eq('id', saleId)
    .maybeSingle();
  const saleMid = saleFull.error
    ? await admin
        .from('sales')
        .select(
          'id, status, customer_id, broker_id, contract_id, block_id, project_id, tenant_id, company_id, agreed_price, sale_price, lot_price, financial_account_id, installment_correction_type',
        )
        .eq('id', saleId)
        .maybeSingle()
    : saleFull;
  const saleQuery = saleMid.error
    ? await admin
        .from('sales')
        .select(
          'id, status, customer_id, broker_id, contract_id, block_id, project_id, tenant_id, company_id, agreed_price, sale_price, lot_price',
        )
        .eq('id', saleId)
        .maybeSingle()
    : saleMid;
  if (saleQuery.error) {
    throw new LotSwapPreviewError(
      'Não foi possível carregar a venda.',
      'LOAD_SALE_FAILED',
      500,
    );
  }
  const sale = saleQuery.data as Record<string, unknown> | null;
  if (!sale) {
    throw new LotSwapPreviewError('Venda não encontrada.', 'SALE_NOT_FOUND', 404);
  }

  const companyId = String(sale.company_id || sale.tenant_id || '').trim();
  if (!isSuperAdmin && callerTenant && companyId && callerTenant !== companyId) {
    throw new LotSwapPreviewError('Sem permissão para esta venda.', 'CROSS_TENANT', 403);
  }

  const saleEligible = assertSaleEligibleForLotSwapPreview({
    saleStatus: text(sale.status),
  });
  if (!saleEligible.ok) {
    throw new LotSwapPreviewError(
      lotSwapPreviewBlockMessage(saleEligible.code) || 'Venda inelegível para troca.',
      saleEligible.code || 'SALE_INELIGIBLE',
      409,
    );
  }

  const originId = String(sale.block_id || sale.lot_id || '').trim();
  if (!originId) {
    throw new LotSwapPreviewError(
      'A venda não possui lote de origem.',
      'ORIGIN_MISSING',
      400,
    );
  }
  const originRow = await loadBlock(admin, originId);
  const origin = snapshotBlock(originRow);
  const originCheck = assertOriginBelongsToSale({
    saleId,
    saleBlockId: text(sale.block_id) || text(sale.lot_id),
    origin,
  });
  if (!originCheck.ok) {
    throw new LotSwapPreviewError(
      lotSwapPreviewBlockMessage(originCheck.code) || 'Lote de origem inválido.',
      originCheck.code || LOT_SWAP_ORIGIN_MISMATCH,
      409,
    );
  }

  const projectId = origin.projectId || text(sale.project_id);
  const [{ data: project }, { data: customer }, { data: broker }, { data: account }] =
    await Promise.all([
      projectId
        ? admin.from('projects').select('id, name').eq('id', projectId).maybeSingle()
        : Promise.resolve({ data: null }),
      sale.customer_id
        ? admin
            .from('customers')
            .select('id, name')
            .eq('id', String(sale.customer_id))
            .maybeSingle()
        : Promise.resolve({ data: null }),
      sale.broker_id
        ? admin
            .from('brokers')
            .select('id, name')
            .eq('id', String(sale.broker_id))
            .maybeSingle()
        : Promise.resolve({ data: null }),
      sale.financial_account_id
        ? admin
            .from('company_financial_accounts')
            .select('id, name')
            .eq('id', String(sale.financial_account_id))
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  let contract: Record<string, unknown> | null = null;
  const currentContract = await admin
    .from('contracts')
    .select('id, contract_number, status, sale_id, is_current')
    .eq('sale_id', saleId)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!currentContract.error && currentContract.data) {
    contract = currentContract.data as Record<string, unknown>;
  } else if (sale.contract_id) {
    const byId = await admin
      .from('contracts')
      .select('id, contract_number, status, sale_id')
      .eq('id', String(sale.contract_id))
      .maybeSingle();
    if (!byId.error && byId.data) contract = byId.data as Record<string, unknown>;
  }

  const receiptsQuery = await admin
    .from('finance_receipts')
    .select('id, installment_number, status, paid_at, amount, due_date')
    .eq('sale_id', saleId);
  const receipts = (receiptsQuery.data || []) as LotSwapReceiptLike[];
  const paid = sumLotSwapPaidAmount(receipts);
  const oldSalePrice = money2(
    sale.agreed_price ?? sale.sale_price ?? sale.lot_price ?? origin.price,
  );

  const destSelect =
    'id, status, price, sale_id, contract_id, project_id, block_name, name, number, lot_number, area';
  let destQuery = await admin
    .from('blocks')
    .select(destSelect)
    .eq('project_id', projectId || '')
    .eq('status', 'Disponível')
    .is('sale_id', null)
    .neq('id', origin.id)
    .order('block_name', { ascending: true })
    .order('number', { ascending: true });
  if (destQuery.error) {
    destQuery = await admin
      .from('blocks')
      .select(
        'id, status, price, sale_id, contract_id, project_id, block_name, name, number, lot_number',
      )
      .eq('project_id', projectId || '')
      .eq('status', 'Disponível')
      .is('sale_id', null)
      .neq('id', origin.id)
      .order('number', { ascending: true });
  }

  const destinations = ((destQuery.data || []) as Record<string, unknown>[])
    .map(snapshotBlock)
    .filter((block) => evaluateLotSwapDestination(block, origin).ok);

  const balloonsQuery = await admin
    .from('sale_balloon_installments')
    .select('installment_number, additional_amount, due_date')
    .eq('sale_id', saleId)
    .order('installment_number', { ascending: true });
  const balloons = balloonsQuery.error ? [] : balloonsQuery.data || [];

  const correctionLabel = formatInstallmentCorrectionLabel(sale.installment_correction_type);

  let comparison: LotSwapPreviewComparison | null = null;
  const toBlockId = String(input.toBlockId || '').trim();
  if (toBlockId) {
    const destRow = await loadBlock(admin, toBlockId);
    const destination = snapshotBlock(destRow);
    const verdict = evaluateLotSwapDestination(destination, origin);
    if (!verdict.ok) {
      throw new LotSwapPreviewError(
        lotSwapPreviewBlockMessage(verdict.code) || 'Lote destino inválido.',
        verdict.code || 'DESTINATION_INVALID',
        409,
      );
    }
    const financials = deriveLotSwapPreviewFinancials({
      oldSalePrice,
      newLotPrice: destination.price,
      appropriatedToAcquisitionPrice: paid.totalPaid,
    });
    comparison = {
      financials: financials.fields,
      blocked: financials.blocked,
      blockCode: financials.blockCode,
      blockMessage: financials.blocked
        ? lotSwapPreviewBlockMessage(LOT_SWAP_CREDIT_EXCEEDS_PRICE)
        : null,
      schedule: simulateLotSwapSchedule({
        newBalance: financials.fields.new_balance,
        blocked: financials.blocked,
        futureReceipts: receipts.filter(isLotSwapFutureReceipt),
        balloons,
        correctionLabel,
      }),
      destination,
    };
  }

  return {
    mutation: false,
    persistSwap: false,
    current: {
      saleId,
      saleStatus: text(sale.status),
      companyId,
      projectId,
      projectName: text((project as { name?: string } | null)?.name),
      customerId: text(sale.customer_id),
      customerName: text((customer as { name?: string } | null)?.name),
      brokerId: text(sale.broker_id),
      brokerName: text((broker as { name?: string } | null)?.name),
      contractId: text(contract?.id) || text(sale.contract_id),
      contractNumber: text(contract?.contract_number),
      origin,
      oldSalePrice,
      totalPaid: paid.totalPaid,
      paidCount: paid.paidCount,
      oldBalance: money2(oldSalePrice - paid.totalPaid),
      correctionLabel,
      financialAccountId: text(sale.financial_account_id),
      financialAccountName: text((account as { name?: string } | null)?.name),
    },
    destinations,
    comparison,
    lockNote:
      'A execução futura (Fase 4) repetirá estas validações com SELECT FOR UPDATE em transação RPC. Este preview é stateless e não persiste sale_lot_swaps.',
  };
}

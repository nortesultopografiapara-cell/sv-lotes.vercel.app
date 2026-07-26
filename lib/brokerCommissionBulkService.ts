/**
 * Preview/apply de ajuste em massa de broker_commissions (tenant-scoped).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatSaleLotsLabel } from '@/lib/saleBlockLotLabel';
import {
  assertBulkAdjustConfirm,
  buildBulkAdjustPreview,
  buildCashOverlapKeySet,
  BULK_ADJUST_AUDIT_ACTION,
  eligibleIdsFromPreview,
  groupEligiblePatches,
  normalizeBulkAdjustTarget,
  type BulkAdjustFilters,
  type BulkAdjustPreviewSummary,
  type BulkAdjustTarget,
  type BulkCommissionCandidate,
} from '@/lib/brokerCommissionBulkAdjust';
import { BROKER_COMMISSION_API_SELECT } from '@/lib/brokerCommissionSchema';
import { SaleBrokerCommissionError } from '@/lib/saleBrokerCommissionManage';

/**
 * Colunas reais de public.sales usadas no bulk adjust.
 * Evitar colunas fantasma no SELECT (PostgREST rejeita).
 * Base comercial canônica: agreed_price → lot_price → total_value
 * (via resolveSaleValueForCommission).
 */
export const BULK_ADJUST_SALES_SELECT =
  'id, project_id, customer_id, broker_id, lot_id, block_id, sale_date, created_at, agreed_price, lot_price, total_value, status' as const;

export type BulkAdjustServiceInput = {
  tenantId: string;
  actorUserId: string;
  filters: BulkAdjustFilters;
  /** Preferir `target`. newPercent mantido para compat. */
  target?: BulkAdjustTarget;
  newPercent?: number;
  newFixedAmount?: number;
  commissionMode?: string | null;
  mode: 'preview' | 'apply';
  confirmed?: boolean;
  confirmText?: string | null;
};

function resolveTarget(input: BulkAdjustServiceInput): BulkAdjustTarget {
  if (input.target) return input.target;
  return normalizeBulkAdjustTarget({
    mode: input.commissionMode,
    newPercent: input.newPercent,
    newFixedAmount: input.newFixedAmount,
  });
}

function normalizeFilters(filters: BulkAdjustFilters): BulkAdjustFilters {
  return {
    brokerIds: filters.brokerIds?.filter(Boolean) ?? null,
    projectId: filters.projectId || null,
    dateFrom: filters.dateFrom || null,
    dateTo: filters.dateTo || null,
    pendingOnly: filters.pendingOnly !== false,
  };
}

async function loadTenantCommissionCandidates(
  admin: SupabaseClient,
  tenantId: string,
): Promise<BulkCommissionCandidate[]> {
  const { data: commissions, error } = await admin
    .from('broker_commissions')
    .select(
      `${BROKER_COMMISSION_API_SELECT}, company_id, tenant_id, created_at`,
    )
    .or(`company_id.eq.${tenantId},tenant_id.eq.${tenantId}`);

  if (error) {
    throw new SaleBrokerCommissionError(
      error.message,
      'COMMISSION_LOAD_ERROR',
      500,
    );
  }

  const rows = (commissions || []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const saleIds = [
    ...new Set(
      rows
        .map((r) => (r.sale_id ? String(r.sale_id) : null))
        .filter((id): id is string => !!id),
    ),
  ];
  const brokerIds = [
    ...new Set(
      rows
        .map((r) => (r.broker_id ? String(r.broker_id) : null))
        .filter((id): id is string => !!id),
    ),
  ];

  const [salesRes, brokersRes] = await Promise.all([
    saleIds.length
      ? admin
          .from('sales')
          .select(BULK_ADJUST_SALES_SELECT)
          .in('id', saleIds)
      : Promise.resolve({ data: [], error: null }),
    brokerIds.length
      ? admin.from('brokers').select('id, name').in('id', brokerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (salesRes.error) {
    throw new SaleBrokerCommissionError(
      salesRes.error.message,
      'SALE_LOAD_ERROR',
      500,
    );
  }
  if (brokersRes.error) {
    throw new SaleBrokerCommissionError(
      brokersRes.error.message,
      'BROKER_LOAD_ERROR',
      500,
    );
  }

  const sales = (salesRes.data || []) as Array<Record<string, unknown>>;
  const saleById = new Map(sales.map((s) => [String(s.id), s]));

  const customerIds = [
    ...new Set(
      sales
        .map((s) => (s.customer_id ? String(s.customer_id) : null))
        .filter((id): id is string => !!id),
    ),
  ];
  const projectIds = [
    ...new Set(
      sales
        .map((s) => (s.project_id ? String(s.project_id) : null))
        .filter((id): id is string => !!id),
    ),
  ];

  const [customersRes, projectsRes, blocksRes] = await Promise.all([
    customerIds.length
      ? admin.from('customers').select('id, name').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? admin.from('projects').select('id, name').in('id', projectIds)
      : Promise.resolve({ data: [], error: null }),
    saleIds.length
      ? admin
          .from('blocks')
          .select(
            'id, sale_id, project_id, quadra, quadra_number, block_number, block, block_name, lote, lot_number, number, lot, name',
          )
          .in('sale_id', saleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const customerById = new Map(
    ((customersRes.data || []) as Array<Record<string, unknown>>).map((c) => [
      String(c.id),
      String(c.name || ''),
    ]),
  );
  const projectById = new Map(
    ((projectsRes.data || []) as Array<Record<string, unknown>>).map((p) => [
      String(p.id),
      String(p.name || ''),
    ]),
  );
  const brokerById = new Map(
    ((brokersRes.data || []) as Array<Record<string, unknown>>).map((b) => [
      String(b.id),
      String(b.name || ''),
    ]),
  );
  const blockData = (blocksRes.data || []) as Array<{
    id?: string;
    sale_id?: string | null;
    project_id?: string | null;
    quadra?: string | null;
    quadra_number?: string | null;
    block_number?: string | null;
    block?: string | null;
    block_name?: string | null;
    lote?: string | null;
    lot_number?: string | null;
    number?: string | null;
    lot?: string | null;
    name?: string | null;
  }>;

  return rows.map((row) => {
    const saleId = row.sale_id ? String(row.sale_id) : null;
    const sale = saleId ? saleById.get(saleId) || null : null;
    const brokerId = row.broker_id ? String(row.broker_id) : null;
    const projectId = sale?.project_id ? String(sale.project_id) : null;
    const customerId = sale?.customer_id ? String(sale.customer_id) : null;
    const lotLabel = sale
      ? formatSaleLotsLabel(
          {
            id: String(sale.id),
            block_id: (sale.block_id as string | null) ?? null,
            lot_id: (sale.lot_id as string | null) ?? null,
          },
          blockData,
        ) || null
      : null;

    return {
      id: String(row.id),
      sale_id: saleId,
      broker_id: brokerId,
      amount: row.amount as number | string | null,
      commission_percent: row.commission_percent as number | string | null,
      commission_mode: row.commission_mode as string | null | undefined,
      commission_fixed_amount: row.commission_fixed_amount as
        | number
        | string
        | null
        | undefined,
      calculation_base: row.calculation_base as number | string | null | undefined,
      status: row.status as string | null,
      paid_at: row.paid_at as string | null,
      company_id: row.company_id as string | null,
      tenant_id: row.tenant_id as string | null,
      sale,
      broker_name: brokerId ? brokerById.get(brokerId) || null : null,
      customer_name: customerId ? customerById.get(customerId) || null : null,
      project_name: projectId ? projectById.get(projectId) || null : null,
      lot_label: lotLabel,
      sale_date: sale
        ? String(sale.sale_date || sale.created_at || '').slice(0, 10) || null
        : null,
    } satisfies BulkCommissionCandidate;
  });
}

async function loadCashOverlapKeys(
  admin: SupabaseClient,
  tenantId: string,
  saleIds: string[],
): Promise<Set<string>> {
  if (saleIds.length === 0) return new Set();

  const { data, error } = await admin
    .from('cash_movements')
    .select('sale_id, broker_id, type, status, category, description, amount')
    .or(`company_id.eq.${tenantId},tenant_id.eq.${tenantId}`)
    .in('sale_id', saleIds);

  if (error) {
    // Sem cash_movements acessível: fail-safe — não bloqueia preview, mas loga.
    console.warn('[bulk-adjust] cash_movements load', error.message);
    return new Set();
  }

  return buildCashOverlapKeySet(data || []);
}

export async function previewBulkBrokerCommissionAdjust(
  admin: SupabaseClient,
  input: Omit<BulkAdjustServiceInput, 'mode' | 'confirmed' | 'confirmText'>,
): Promise<BulkAdjustPreviewSummary> {
  const filters = normalizeFilters(input.filters);
  const candidates = await loadTenantCommissionCandidates(admin, input.tenantId);
  const saleIds = [
    ...new Set(
      candidates
        .map((c) => c.sale_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const cashOverlapKeys = await loadCashOverlapKeys(admin, input.tenantId, saleIds);

  const target = resolveTarget(input as BulkAdjustServiceInput);
  return buildBulkAdjustPreview({
    rows: candidates,
    filters,
    target,
    cashOverlapKeys,
  });
}

export async function applyBulkBrokerCommissionAdjust(
  admin: SupabaseClient,
  input: BulkAdjustServiceInput,
): Promise<{
  batch_id: string;
  preview: BulkAdjustPreviewSummary;
  updated_count: number;
  updated_ids: string[];
}> {
  const target = resolveTarget(input);
  assertBulkAdjustConfirm({
    target,
    confirmText: input.confirmText,
    confirmed: input.confirmed,
  });

  const preview = await previewBulkBrokerCommissionAdjust(admin, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    filters: input.filters,
    target,
  });

  const eligibleIds = eligibleIdsFromPreview(preview);
  if (eligibleIds.length === 0) {
    return {
      batch_id: crypto.randomUUID(),
      preview,
      updated_count: 0,
      updated_ids: [],
    };
  }

  const groups = groupEligiblePatches(preview);
  const updatedIds: string[] = [];

  for (const group of groups) {
    const { error } = await admin
      .from('broker_commissions')
      .update(group.patch)
      .in('id', group.ids)
      .or(`company_id.eq.${input.tenantId},tenant_id.eq.${input.tenantId}`);

    if (error) {
      throw new SaleBrokerCommissionError(
        error.message,
        'COMMISSION_BULK_UPDATE_ERROR',
        500,
      );
    }
    updatedIds.push(...group.ids);
  }

  const batchId = crypto.randomUUID();
  const sample = preview.rows
    .filter((r) => r.eligible)
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      sale_id: r.sale_id,
      broker_id: r.broker_id,
      before: {
        mode: r.current_mode,
        percent: r.current_percent,
        fixed: r.current_fixed_amount,
        amount: r.current_amount,
      },
      after: {
        mode: r.new_mode,
        percent: r.new_percent,
        fixed: r.new_fixed_amount,
        amount: r.new_amount,
        status: r.new_status,
      },
    }));

  try {
    await admin.from('audit_logs').insert({
      tenant_id: input.tenantId,
      company_id: input.tenantId,
      user_id: input.actorUserId,
      module: 'BROKERS',
      action: BULK_ADJUST_AUDIT_ACTION,
      reference_id: batchId,
      description: JSON.stringify({
        batch_id: batchId,
        target,
        filters: normalizeFilters(input.filters),
        eligible_count: preview.eligible_count,
        ignored_count: preview.ignored_count,
        ignored_by_reason: preview.ignored_by_reason,
        current_total: preview.current_total,
        new_total: preview.new_total,
        updated_count: updatedIds.length,
        sample,
      }),
    });
  } catch (auditErr) {
    console.warn('[bulk-adjust] audit_logs', auditErr);
  }

  return {
    batch_id: batchId,
    preview,
    updated_count: updatedIds.length,
    updated_ids: updatedIds,
  };
}

export async function runBulkBrokerCommissionAdjust(
  admin: SupabaseClient,
  input: BulkAdjustServiceInput,
) {
  if (input.mode === 'preview') {
    const preview = await previewBulkBrokerCommissionAdjust(admin, input);
    return { mode: 'preview' as const, preview };
  }
  if (input.mode !== 'apply') {
    throw new SaleBrokerCommissionError('mode inválido', 'INVALID_MODE', 400);
  }
  const result = await applyBulkBrokerCommissionAdjust(admin, input);
  return { mode: 'apply' as const, ...result };
}

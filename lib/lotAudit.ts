/**
 * Auditoria operacional por lote (lot_audit_logs).
 * Falhas de log são silenciosas — não interrompem o fluxo principal.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatCurrencyBRL as formatCurrencyBRLShared } from '@/lib/currencyBrl';

export type LotAuditAction =
  | 'lot_created'
  | 'front_identified'
  | 'front_corrected'
  | 'confrontation_auto'
  | 'confrontation_manual'
  | 'status_changed'
  | 'reserved'
  | 'sold'
  | 'sale_edited'
  | 'sale_cancelled'
  | 'value_changed'
  | 'contract_generated'
  | 'contract_regenerated'
  | 'contract_viewed'
  | 'finance_created'
  | 'payment_received'
  | 'payment_reversed'
  | 'customer_changed'
  | 'note_added'
  | 'official_measure_side_changed';

export type LotAuditSource =
  | 'gis_map'
  | 'sale_flow'
  | 'contract_flow'
  | 'finance_flow'
  | 'customer_flow'
  | 'system';

export type LotAuditLogRow = {
  id: string;
  company_id: string | null;
  project_id: string | null;
  block_id: string | null;
  lot_id: string | null;
  sale_id: string | null;
  contract_id: string | null;
  user_id: string | null;
  action: LotAuditAction;
  title: string;
  description: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  source: LotAuditSource;
};

export type LotAuditEventInput = {
  companyId?: string | null;
  projectId?: string | null;
  blockId: string;
  lotId?: string | null;
  saleId?: string | null;
  contractId?: string | null;
  userId?: string | null;
  action: LotAuditAction;
  title: string;
  description?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  source: LotAuditSource;
};

export type FormattedLotAuditEvent = {
  id: string;
  createdAt: string;
  action: LotAuditAction;
  actionLabel: string;
  badgeClass: string;
  title: string;
  description: string | null;
  userId: string | null;
  source: LotAuditSource;
  sourceLabel: string;
  saleId: string | null;
  motiveCode: string | null;
  improvementsTotal: number | null;
};

const ACTION_LABELS: Record<LotAuditAction, string> = {
  lot_created: 'Lote criado',
  front_identified: 'Frente identificada',
  front_corrected: 'Frente corrigida',
  confrontation_auto: 'Confrontação automática',
  confrontation_manual: 'Confrontação manual',
  status_changed: 'Status alterado',
  reserved: 'Reserva',
  sold: 'Venda',
  sale_edited: 'Venda editada',
  sale_cancelled: 'Venda cancelada',
  value_changed: 'Valor alterado',
  contract_generated: 'Contrato',
  contract_regenerated: 'Regeneração',
  contract_viewed: 'Visualização',
  finance_created: 'Financeiro',
  payment_received: 'Pagamento',
  payment_reversed: 'Estorno',
  customer_changed: 'Cliente',
  note_added: 'Observação',
  official_measure_side_changed: 'Medida oficial',
};

const SOURCE_LABELS: Record<LotAuditSource, string> = {
  gis_map: 'Mapa GIS',
  sale_flow: 'Venda',
  contract_flow: 'Contrato',
  finance_flow: 'Financeiro',
  customer_flow: 'Cliente',
  system: 'Sistema',
};

const ACTION_BADGE_CLASS: Record<LotAuditAction, string> = {
  lot_created: 'bg-slate-100 text-slate-700',
  front_identified: 'bg-sky-100 text-sky-800',
  front_corrected: 'bg-sky-100 text-sky-900',
  confrontation_auto: 'bg-indigo-100 text-indigo-800',
  confrontation_manual: 'bg-indigo-100 text-indigo-900',
  status_changed: 'bg-amber-100 text-amber-900',
  reserved: 'bg-orange-100 text-orange-900',
  sold: 'bg-emerald-100 text-emerald-900',
  sale_edited: 'bg-violet-100 text-violet-900',
  sale_cancelled: 'bg-red-100 text-red-800',
  value_changed: 'bg-yellow-100 text-yellow-900',
  contract_generated: 'bg-blue-100 text-blue-900',
  contract_regenerated: 'bg-blue-100 text-blue-800',
  contract_viewed: 'bg-gray-100 text-gray-700',
  finance_created: 'bg-teal-100 text-teal-900',
  payment_received: 'bg-green-100 text-green-800',
  payment_reversed: 'bg-rose-100 text-rose-900',
  customer_changed: 'bg-purple-100 text-purple-900',
  note_added: 'bg-gray-100 text-gray-600',
  official_measure_side_changed: 'bg-violet-100 text-violet-900',
};

export function formatLotAuditSource(source: string): string {
  return SOURCE_LABELS[source as LotAuditSource] || source;
}

export function formatLotAuditAction(action: string): string {
  return ACTION_LABELS[action as LotAuditAction] || action;
}

export function buildLotAuditPayload(
  input: LotAuditEventInput,
): Record<string, unknown> {
  const blockId = String(input.blockId || '').trim();
  return {
    company_id: input.companyId || null,
    project_id: input.projectId || null,
    block_id: blockId || null,
    lot_id: input.lotId || blockId || null,
    sale_id: input.saleId || null,
    contract_id: input.contractId || null,
    user_id: input.userId || null,
    action: input.action,
    title: input.title,
    description: input.description || null,
    old_data: input.oldData || null,
    new_data: input.newData || null,
    source: input.source,
    created_at: new Date().toISOString(),
  };
}

export function formatLotAuditEvent(row: LotAuditLogRow): FormattedLotAuditEvent {
  const action = row.action as LotAuditAction;
  const newData =
    row.new_data && typeof row.new_data === 'object' && !Array.isArray(row.new_data)
      ? row.new_data
      : null;
  const motiveRaw = newData?.motiveCode;
  const improvementsTotalRaw =
    newData?.improvementsTotal ??
    (newData?.obligation && typeof newData.obligation === 'object'
      ? (newData.obligation as { improvementsTotal?: unknown }).improvementsTotal
      : null);
  const improvementsTotalNum = Number(improvementsTotalRaw);
  return {
    id: row.id,
    createdAt: row.created_at,
    action,
    actionLabel: formatLotAuditAction(action),
    badgeClass: ACTION_BADGE_CLASS[action] || 'bg-gray-100 text-gray-700',
    title: row.title,
    description: row.description,
    userId: row.user_id,
    source: row.source as LotAuditSource,
    sourceLabel: formatLotAuditSource(row.source),
    saleId: row.sale_id ? String(row.sale_id) : null,
    motiveCode: motiveRaw != null && String(motiveRaw).trim() ? String(motiveRaw).trim() : null,
    improvementsTotal:
      Number.isFinite(improvementsTotalNum) && improvementsTotalNum > 0
        ? improvementsTotalNum
        : null,
  };
}

export function lotAuditContextFromBlock(
  block: Record<string, unknown>,
  extras?: Partial<LotAuditEventInput>,
): Pick<
  LotAuditEventInput,
  | 'companyId'
  | 'projectId'
  | 'blockId'
  | 'lotId'
  | 'saleId'
  | 'contractId'
> {
  const blockId = String(block.id || extras?.blockId || '');
  return {
    companyId:
      extras?.companyId ??
      (block.tenant_id as string) ??
      (block.company_id as string) ??
      null,
    projectId:
      extras?.projectId ?? (block.project_id as string) ?? null,
    blockId,
    lotId: extras?.lotId ?? blockId,
    saleId:
      extras?.saleId ??
      (block.sale_id as string) ??
      (block.saleId as string) ??
      null,
    contractId:
      extras?.contractId ??
      (block.contract_id as string) ??
      (block.contractId as string) ??
      null,
  };
}

export function formatCurrencyBRL(value: number | null | undefined): string {
  return formatCurrencyBRLShared(value);
}

export async function logLotAuditEvent(
  supabase: SupabaseClient,
  input: LotAuditEventInput,
): Promise<void> {
  try {
    if (!input.blockId?.trim()) {
      console.warn('LOT_AUDIT_LOG_SKIP', 'blockId ausente');
      return;
    }
    const row = buildLotAuditPayload(input);
    const { error } = await supabase.from('lot_audit_logs').insert([row]);
    if (error) {
      console.warn('LOT_AUDIT_LOG_WARN', error.message);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('LOT_AUDIT_LOG_WARN', msg);
  }
}

export async function getLotAuditHistory(
  supabase: SupabaseClient,
  blockId: string,
  limit = 50,
): Promise<LotAuditLogRow[]> {
  if (!blockId?.trim()) return [];
  try {
    const { data, error } = await supabase
      .from('lot_audit_logs')
      .select('*')
      .eq('block_id', blockId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('LOT_AUDIT_HISTORY_WARN', error.message);
      return [];
    }
    return (data || []) as LotAuditLogRow[];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('LOT_AUDIT_HISTORY_WARN', msg);
    return [];
  }
}

export function sortLotAuditHistory(
  rows: LotAuditLogRow[],
): LotAuditLogRow[] {
  return [...rows].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

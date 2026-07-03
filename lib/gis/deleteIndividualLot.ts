import type { SupabaseClient } from '@supabase/supabase-js';
import { clearProjectMapOfflineCache } from '@/lib/offline/store';
import {
  canManageGisProject,
  isBrokerRole,
  isOwnerRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';

export const INDIVIDUAL_LOT_DELETE_CONFIRM_MESSAGE =
  'Excluir definitivamente este lote? Esta ação removerá permanentemente este lote do mapa.';

/** Rótulo curto para confirmação (ex.: QD 02 LT 04). */
export function formatIndividualLotDeleteLabel(
  blockName?: string | null,
  lotNumber?: string | null,
): string {
  const q = String(blockName || '')
    .trim()
    .replace(/^QUADRA\s+/i, '')
    .toUpperCase() || '—';
  const n = String(lotNumber || '').trim() || '—';
  return `QD ${q} LT ${n}`;
}

export function buildIndividualLotDeleteConfirmMessage(
  blockName?: string | null,
  lotNumber?: string | null,
): string {
  const label = formatIndividualLotDeleteLabel(blockName, lotNumber);
  return `Excluir definitivamente o lote ${label}?\n\nEsta ação removerá permanentemente este lote do mapa.`;
}

export type IndividualLotBlockRow = {
  id: string;
  project_id: string;
  tenant_id?: string | null;
  company_id?: string | null;
  block_name?: string | null;
  number?: string | null;
  status?: string | null;
  customer_id?: string | null;
  sale_id?: string | null;
  contract_id?: string | null;
  broker_id?: string | null;
};

export type IndividualLotDeleteCode =
  | 'NOT_FOUND'
  | 'NOT_AVAILABLE'
  | 'SOLD'
  | 'RESERVED'
  | 'CUSTOMER'
  | 'SALE'
  | 'CONTRACT'
  | 'FINANCE'
  | 'BROKER'
  | 'FORBIDDEN';

export type IndividualLotDeleteValidation = {
  allowed: boolean;
  reason?: string;
  code?: IndividualLotDeleteCode;
};

function applyBlocksTenantFilter<T extends { or: (filter: string) => T }>(
  query: T,
  user: { role?: string; tenant_id?: string | null } | null | undefined,
): T {
  if (user?.role === 'SUPER_ADMIN' || !user?.tenant_id) return query;
  return query.or(
    `tenant_id.eq.${user.tenant_id},company_id.eq.${user.tenant_id}`,
  );
}

export function isLotStatusAvailableForDelete(status?: string | null): boolean {
  const normalized = String(status || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalized === 'disponivel' || normalized === 'available';
}

export function isLotStatusReservedForDelete(status?: string | null): boolean {
  const normalized = String(status || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalized === 'reservado' || normalized === 'reserved';
}

export function isLotStatusSoldForDelete(status?: string | null): boolean {
  const normalized = String(status || '').trim().toLowerCase();
  return ['vendido', 'sold', 'venda', 'sold_out'].includes(normalized);
}

export function canDeleteIndividualLotRole(role?: string | null): IndividualLotDeleteValidation {
  if (isOwnerRole(role)) {
    return {
      allowed: false,
      reason: 'Perfil OWNER possui acesso somente leitura. Esta ação não é permitida.',
      code: 'FORBIDDEN',
    };
  }
  if (isBrokerRole(role)) {
    return {
      allowed: false,
      reason: 'Corretores não podem excluir lotes.',
      code: 'FORBIDDEN',
    };
  }
  if (!canManageGisProject(role)) {
    return {
      allowed: false,
      reason: 'Sem permissão para excluir lotes.',
      code: 'FORBIDDEN',
    };
  }
  return { allowed: true };
}

export function assertCanDeleteIndividualLotRole(role?: string | null): void {
  const result = canDeleteIndividualLotRole(role);
  if (!result.allowed) {
    throw new Error(result.reason || 'Sem permissão para excluir lotes.');
  }
}

export function validateIndividualLotDelete(params: {
  lot: IndividualLotBlockRow | null | undefined;
  linkedSalesCount?: number;
  linkedContractsCount?: number;
  linkedFinanceReceiptsCount?: number;
}): IndividualLotDeleteValidation {
  const { lot } = params;
  if (!lot?.id) {
    return { allowed: false, reason: 'Lote não encontrado.', code: 'NOT_FOUND' };
  }

  if (isLotStatusSoldForDelete(lot.status)) {
    return {
      allowed: false,
      reason: 'Não é possível excluir lote vendido.',
      code: 'SOLD',
    };
  }

  if (isLotStatusReservedForDelete(lot.status)) {
    return {
      allowed: false,
      reason: 'Não é possível excluir lote reservado.',
      code: 'RESERVED',
    };
  }

  if (!isLotStatusAvailableForDelete(lot.status)) {
    return {
      allowed: false,
      reason: 'Somente lotes disponíveis podem ser excluídos.',
      code: 'NOT_AVAILABLE',
    };
  }

  if (lot.customer_id) {
    return {
      allowed: false,
      reason: 'Lote possui cliente vinculado.',
      code: 'CUSTOMER',
    };
  }
  if (lot.sale_id) {
    return {
      allowed: false,
      reason: 'Lote possui venda vinculada.',
      code: 'SALE',
    };
  }
  if (lot.contract_id) {
    return {
      allowed: false,
      reason: 'Lote possui contrato vinculado.',
      code: 'CONTRACT',
    };
  }
  if (lot.broker_id) {
    return {
      allowed: false,
      reason: 'Lote possui corretor vinculado.',
      code: 'BROKER',
    };
  }

  const linkedSalesCount = params.linkedSalesCount ?? 0;
  const linkedContractsCount = params.linkedContractsCount ?? 0;
  const linkedFinanceReceiptsCount = params.linkedFinanceReceiptsCount ?? 0;

  if (linkedSalesCount > 0) {
    return {
      allowed: false,
      reason: 'Existem vendas vinculadas a este lote.',
      code: 'SALE',
    };
  }
  if (linkedContractsCount > 0) {
    return {
      allowed: false,
      reason: 'Existem contratos vinculados a este lote.',
      code: 'CONTRACT',
    };
  }
  if (linkedFinanceReceiptsCount > 0) {
    return {
      allowed: false,
      reason: 'Existem parcelas financeiras vinculadas a este lote.',
      code: 'FINANCE',
    };
  }

  return { allowed: true };
}

/** Garante que a exclusão atinge somente um lote (id), não a quadra inteira. */
export function individualLotDeleteTargetsSingleBlock(lotId: string): {
  byId: true;
  lotId: string;
  blockNameFilter: null;
} {
  const normalizedLotId = String(lotId || '').trim();
  if (!normalizedLotId) {
    throw new Error('ID do lote é obrigatório.');
  }
  return {
    byId: true,
    lotId: normalizedLotId,
    blockNameFilter: null,
  };
}

export type IndividualLotDeleteCaller = {
  id?: string;
  role?: string | null;
  tenant_id?: string | null;
};

async function countLinkedRows(
  supabase: SupabaseClient,
  table: 'sales' | 'contracts' | 'finance_receipts',
  lotId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('block_id', lotId);

  if (error) {
    console.warn(`[LOT_DELETE] falha ao contar ${table}`, error);
    throw new Error(`Não foi possível validar vínculos do lote (${table}).`);
  }

  return count ?? 0;
}

export async function deleteIndividualLot(
  supabase: SupabaseClient,
  projectId: string,
  lotId: string,
  caller?: IndividualLotDeleteCaller | null,
): Promise<{ lotId: string; blockName: string | null }> {
  assertCanDeleteIndividualLotRole(caller?.role);

  const normalizedProjectId = String(projectId || '').trim();
  const deleteScope = individualLotDeleteTargetsSingleBlock(lotId);

  if (!normalizedProjectId) {
    throw new Error('ID do projeto é obrigatório.');
  }

  let lotQuery = supabase
    .from('blocks')
    .select(
      'id, project_id, tenant_id, company_id, block_name, number, status, customer_id, sale_id, contract_id, broker_id',
    )
    .eq('id', deleteScope.lotId)
    .eq('project_id', normalizedProjectId);

  lotQuery = applyBlocksTenantFilter(lotQuery, caller);

  const { data: lotRow, error: lotError } = await lotQuery.maybeSingle();
  if (lotError) throw lotError;

  const [linkedSalesCount, linkedContractsCount, linkedFinanceReceiptsCount] =
    await Promise.all([
      countLinkedRows(supabase, 'sales', deleteScope.lotId),
      countLinkedRows(supabase, 'contracts', deleteScope.lotId),
      countLinkedRows(supabase, 'finance_receipts', deleteScope.lotId),
    ]);

  const validation = validateIndividualLotDelete({
    lot: lotRow as IndividualLotBlockRow | null,
    linkedSalesCount,
    linkedContractsCount,
    linkedFinanceReceiptsCount,
  });

  if (!validation.allowed) {
    throw new Error(validation.reason || 'Não é possível excluir este lote.');
  }

  const { error: segError } = await supabase
    .from('lot_segments')
    .delete()
    .eq('lot_id', deleteScope.lotId);
  if (segError) {
    console.warn('[LOT_DELETE] lot_segments (ignorado se tabela ausente)', segError);
  }

  let deleteQuery = supabase
    .from('blocks')
    .delete()
    .eq('id', deleteScope.lotId)
    .eq('project_id', normalizedProjectId);

  deleteQuery = applyBlocksTenantFilter(deleteQuery, caller);

  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;

  try {
    await clearProjectMapOfflineCache(normalizedProjectId);
  } catch (cacheErr) {
    console.warn('[LOT_DELETE] falha ao limpar cache offline', cacheErr);
  }

  const blockName = (lotRow as IndividualLotBlockRow | null)?.block_name ?? null;

  console.log('[LOT_DELETE] lote excluído', {
    projectId: normalizedProjectId,
    lotId: deleteScope.lotId,
    blockName,
    callerRole: normalizeUserRole(caller?.role),
  });

  return {
    lotId: deleteScope.lotId,
    blockName,
  };
}

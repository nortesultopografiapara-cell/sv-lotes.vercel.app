import type { SupabaseClient } from '@supabase/supabase-js';
import { isTenantAdminRole } from '@/lib/ownerProjectAccess';
import { applyTenantFilter, type RlsContext } from '@/lib/rls';

export type BrokerRow = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  active?: boolean | null;
  status?: string | null;
  deleted_at?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
  vendas_mes_qtd?: number;
  vendas_mes_valor?: number;
  comissao_pendente?: number;
  comissao_paga?: number;
};

export type BrokerDeleteMode = 'soft' | 'hard';

export type BrokerDeleteResult = {
  mode: BrokerDeleteMode;
  brokerId: string;
  brokerName: string;
  effectiveTenantId: string;
};

export type BrokerDeleteUserContext = {
  userId: string;
  userRole: string;
  userTenantId: string | null;
  activeTenantId: string | null;
};

export type BrokerDashboardStats = {
  activeCount: number;
  totalVendasMes: number;
  totalComissoesPagas: number;
  totalComissoesPendentes: number;
};

export type ResolvedBrokerMutationScope = {
  effectiveTenantId: string;
  tenantColumn: 'tenant_id' | 'company_id';
  source: 'active_tenant' | 'broker_tenant' | 'user_tenant';
};

export class BrokerDeleteError extends Error {
  readonly diagnostic: Record<string, unknown>;

  constructor(message: string, diagnostic: Record<string, unknown> = {}) {
    super(message);
    this.name = 'BrokerDeleteError';
    this.diagnostic = diagnostic;
  }
}

/** Corretor visível na listagem padrão (ativos, não excluídos). */
export function isBrokerActiveForList(broker: Pick<BrokerRow, 'active' | 'status' | 'deleted_at'>): boolean {
  if (broker.deleted_at) return false;
  if (broker.active === false) return false;
  if (broker.status) {
    const st = String(broker.status).trim().toLowerCase();
    if (st && !['ativo', 'active'].includes(st)) return false;
  }
  return true;
}

/** Lista padrão do painel: somente corretores ativos e não excluídos. */
export function filterBrokersForActiveList<T extends BrokerRow>(brokers: T[]): T[] {
  return brokers.filter(isBrokerActiveForList);
}

export function buildBrokerSoftDeletePatch(now: Date = new Date()): Record<string, unknown> {
  return {
    active: false,
    status: 'inativo',
    deleted_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

export function resolveBrokerDeleteMode(
  salesCount: number,
  commissionsCount: number,
): BrokerDeleteMode {
  if (salesCount > 0 || commissionsCount > 0) return 'soft';
  return 'hard';
}

export function resolveBrokerRowTenantId(
  broker: Pick<BrokerRow, 'tenant_id' | 'company_id'>,
): string | null {
  const tenant = broker.tenant_id ? String(broker.tenant_id).trim() : '';
  const company = broker.company_id ? String(broker.company_id).trim() : '';
  return tenant || company || null;
}

export function resolveBrokerTenantColumn(
  broker: Pick<BrokerRow, 'tenant_id' | 'company_id'>,
): 'tenant_id' | 'company_id' {
  if (broker.tenant_id && String(broker.tenant_id).trim()) return 'tenant_id';
  if (broker.company_id && String(broker.company_id).trim()) return 'company_id';
  return 'tenant_id';
}

export function canManageBrokerInTenant(params: {
  isSuperAdmin: boolean;
  userRole: string;
  userTenantId: string | null;
  brokerTenantId: string;
}): boolean {
  if (params.isSuperAdmin) return true;
  if (!isTenantAdminRole(params.userRole)) return false;
  const userTenant = params.userTenantId ? String(params.userTenantId).trim() : '';
  return !!userTenant && userTenant === params.brokerTenantId;
}

/**
 * Alinha o tenant da mutação com o registro do corretor (mesma lógica do loadBrokers).
 * Usa activeTenantId quando coincide; senão broker.tenant_id se o usuário for admin da empresa.
 */
export function resolveEffectiveBrokerTenant(params: {
  broker: Pick<BrokerRow, 'tenant_id' | 'company_id'>;
  activeTenantId: string | null;
  userRole: string;
  userTenantId: string | null;
  isSuperAdmin: boolean;
}): ResolvedBrokerMutationScope {
  const brokerTenantId = resolveBrokerRowTenantId(params.broker);
  if (!brokerTenantId) {
    throw new BrokerDeleteError('Corretor sem empresa vinculada.', {
      brokerTenantId: null,
      broker,
    });
  }

  const activeTenantId = params.activeTenantId ? String(params.activeTenantId).trim() : '';
  const userTenantId = params.userTenantId ? String(params.userTenantId).trim() : '';
  const tenantColumn = resolveBrokerTenantColumn(params.broker);

  if (activeTenantId && activeTenantId === brokerTenantId) {
    return {
      effectiveTenantId: brokerTenantId,
      tenantColumn,
      source: 'active_tenant',
    };
  }

  if (canManageBrokerInTenant({
    isSuperAdmin: params.isSuperAdmin,
    userRole: params.userRole,
    userTenantId: params.userTenantId,
    brokerTenantId,
  })) {
    return {
      effectiveTenantId: brokerTenantId,
      tenantColumn,
      source: userTenantId === brokerTenantId ? 'user_tenant' : 'broker_tenant',
    };
  }

  throw new BrokerDeleteError(
    'Você não tem permissão para excluir corretores desta empresa.',
    {
      activeTenantId: activeTenantId || null,
      brokerTenantId,
      userTenantId: userTenantId || null,
      userRole: params.userRole,
      isSuperAdmin: params.isSuperAdmin,
    },
  );
}

export function computeBrokerDashboardStats(brokers: BrokerRow[]): BrokerDashboardStats {
  const active = filterBrokersForActiveList(brokers);
  return {
    activeCount: active.length,
    totalVendasMes: active.reduce((acc, b) => acc + (Number(b.vendas_mes_qtd) || 0), 0),
    totalComissoesPagas: active.reduce((acc, b) => acc + (Number(b.comissao_paga) || 0), 0),
    totalComissoesPendentes: active.reduce((acc, b) => acc + (Number(b.comissao_pendente) || 0), 0),
  };
}

export function rankBrokersByMonthlySales<T extends BrokerRow>(brokers: T[], limit = 3): T[] {
  return [...filterBrokersForActiveList(brokers)]
    .filter((b) => (Number(b.vendas_mes_valor) || 0) > 0)
    .sort((a, b) => (Number(b.vendas_mes_valor) || 0) - (Number(a.vendas_mes_valor) || 0))
    .slice(0, limit);
}

export function removeBrokerFromList<T extends BrokerRow>(brokers: T[], brokerId: string): T[] {
  return brokers.filter((b) => b.id !== brokerId);
}

function buildScopedBrokerMutation(
  supabase: SupabaseClient,
  brokerId: string,
  scope: ResolvedBrokerMutationScope,
  operation: 'update' | 'delete',
  patch?: Record<string, unknown>,
) {
  if (operation === 'update') {
    return supabase
      .from('brokers')
      .update(patch ?? {})
      .eq('id', brokerId)
      .eq(scope.tenantColumn, scope.effectiveTenantId);
  }

  return supabase
    .from('brokers')
    .delete()
    .eq('id', brokerId)
    .eq(scope.tenantColumn, scope.effectiveTenantId);
}

/** Verifica vendas/comissões vinculadas ao corretor no tenant do corretor. */
export async function brokerHasCriticalHistory(
  supabase: SupabaseClient,
  ctx: RlsContext,
  brokerId: string,
  effectiveTenantId: string,
): Promise<{ salesCount: number; commissionsCount: number }> {
  const scopedCtx: RlsContext = {
    ...ctx,
    tenantId: effectiveTenantId,
  };

  let salesQuery = supabase
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .eq('broker_id', brokerId);
  salesQuery = applyTenantFilter(salesQuery, scopedCtx, 'sales');

  let commQuery = supabase
    .from('broker_commissions')
    .select('id', { count: 'exact', head: true })
    .eq('broker_id', brokerId);
  commQuery = applyTenantFilter(commQuery, scopedCtx, 'broker_commissions');

  const [{ count: salesCount, error: salesErr }, { count: commissionsCount, error: commErr }] =
    await Promise.all([salesQuery, commQuery]);

  if (salesErr) throw salesErr;
  if (commErr) throw commErr;

  return {
    salesCount: salesCount ?? 0,
    commissionsCount: commissionsCount ?? 0,
  };
}

async function fetchBrokerForDelete(
  supabase: SupabaseClient,
  brokerId: string,
): Promise<BrokerRow> {
  const { data, error } = await supabase
    .from('brokers')
    .select('id, name, tenant_id, company_id, active, status, deleted_at')
    .eq('id', brokerId)
    .maybeSingle();

  if (error) {
    throw new BrokerDeleteError('Não foi possível localizar o corretor.', {
      brokerId,
      supabaseError: error.message,
      code: error.code,
    });
  }

  if (!data) {
    throw new BrokerDeleteError('Corretor não encontrado.', { brokerId });
  }

  return data as BrokerRow;
}

export async function deactivateOrDeleteBroker(
  supabase: SupabaseClient,
  ctx: RlsContext,
  brokerId: string,
  brokerName: string,
  userCtx: BrokerDeleteUserContext,
): Promise<BrokerDeleteResult> {
  const brokerRow = await fetchBrokerForDelete(supabase, brokerId);
  const resolvedName = brokerName || brokerRow.name || brokerRow.full_name || 'Corretor';

  const scope = resolveEffectiveBrokerTenant({
    broker: brokerRow,
    activeTenantId: userCtx.activeTenantId,
    userRole: userCtx.userRole,
    userTenantId: userCtx.userTenantId,
    isSuperAdmin: ctx.isSuperAdmin,
  });

  const diagnosticBase = {
    brokerId,
    brokerTenantId: resolveBrokerRowTenantId(brokerRow),
    activeTenantId: userCtx.activeTenantId,
    userTenantId: userCtx.userTenantId,
    effectiveTenantId: scope.effectiveTenantId,
    tenantColumn: scope.tenantColumn,
    tenantSource: scope.source,
    userRole: userCtx.userRole,
    isSuperAdmin: ctx.isSuperAdmin,
  };

  console.info('[BROKER_DELETE] tenant diagnostic', diagnosticBase);

  const { salesCount, commissionsCount } = await brokerHasCriticalHistory(
    supabase,
    ctx,
    brokerId,
    scope.effectiveTenantId,
  );
  const mode = resolveBrokerDeleteMode(salesCount, commissionsCount);

  console.info('[BROKER_DELETE] mode', {
    ...diagnosticBase,
    mode,
    salesCount,
    commissionsCount,
  });

  if (mode === 'soft') {
    const patch = buildBrokerSoftDeletePatch();
    const { data, error } = await buildScopedBrokerMutation(
      supabase,
      brokerId,
      scope,
      'update',
      patch,
    ).select('id');

    if (error) {
      console.error('[BROKER_DELETE] soft delete failed', { ...diagnosticBase, error });
      throw new BrokerDeleteError(
        'Não foi possível desativar o corretor. Tente novamente ou contate o suporte.',
        { ...diagnosticBase, supabaseError: error.message, code: error.code, mode },
      );
    }

    if (!data?.length) {
      console.error('[BROKER_DELETE] soft delete zero rows', diagnosticBase);
      throw new BrokerDeleteError(
        'Não foi possível desativar o corretor. Verifique permissões ou tenant ativo.',
        { ...diagnosticBase, mode, rowsAffected: 0 },
      );
    }
  } else {
    const { data, error } = await buildScopedBrokerMutation(
      supabase,
      brokerId,
      scope,
      'delete',
    ).select('id');

    if (error) {
      console.error('[BROKER_DELETE] hard delete failed', { ...diagnosticBase, error });
      throw new BrokerDeleteError(
        'Não foi possível excluir o corretor. Tente novamente ou contate o suporte.',
        { ...diagnosticBase, supabaseError: error.message, code: error.code, mode },
      );
    }

    if (!data?.length) {
      console.error('[BROKER_DELETE] hard delete zero rows', diagnosticBase);
      throw new BrokerDeleteError(
        'Não foi possível excluir o corretor. Verifique permissões ou tenant ativo.',
        { ...diagnosticBase, mode, rowsAffected: 0 },
      );
    }
  }

  return {
    mode,
    brokerId,
    brokerName: resolvedName,
    effectiveTenantId: scope.effectiveTenantId,
  };
}

export async function logBrokerDeleteAudit(
  supabase: SupabaseClient,
  params: {
    tenantId: string | null;
    userId: string;
    result: BrokerDeleteResult;
  },
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert([
      {
        tenant_id: params.tenantId,
        company_id: params.tenantId,
        user_id: params.userId,
        action: params.result.mode === 'soft' ? 'BROKER_DEACTIVATED' : 'BROKER_DELETED',
        module: 'BROKERS',
        description:
          params.result.mode === 'soft'
            ? `Corretor ${params.result.brokerName} desativado (histórico de vendas/comissões preservado).`
            : `Corretor ${params.result.brokerName} excluído permanentemente.`,
        reference_id: params.result.brokerId,
      },
    ]);
  } catch {
    // auditoria não deve bloquear exclusão
  }
}

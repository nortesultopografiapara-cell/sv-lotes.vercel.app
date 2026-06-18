import type { SupabaseClient } from '@supabase/supabase-js';
import { applyTenantFilter, type RlsContext, tenantOrClause } from '@/lib/rls';

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
};

export type BrokerDashboardStats = {
  activeCount: number;
  totalVendasMes: number;
  totalComissoesPagas: number;
  totalComissoesPendentes: number;
};

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

function scopedBrokerMutationQuery(
  supabase: SupabaseClient,
  ctx: RlsContext,
  brokerId: string,
  operation: 'update' | 'delete',
) {
  if (operation === 'update') {
    let query = supabase.from('brokers').update({}).eq('id', brokerId);
    if (!ctx.isSuperAdmin && ctx.tenantId) {
      query = query.or(tenantOrClause(ctx.tenantId));
    }
    return query;
  }

  let query = supabase.from('brokers').delete().eq('id', brokerId);
  if (!ctx.isSuperAdmin && ctx.tenantId) {
    query = query.or(tenantOrClause(ctx.tenantId));
  }
  return query;
}

/** Verifica vendas/comissões vinculadas ao corretor (escopo tenant quando aplicável). */
export async function brokerHasCriticalHistory(
  supabase: SupabaseClient,
  ctx: RlsContext,
  brokerId: string,
): Promise<{ salesCount: number; commissionsCount: number }> {
  let salesQuery = supabase
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .eq('broker_id', brokerId);
  salesQuery = applyTenantFilter(salesQuery, ctx, 'sales');

  let commQuery = supabase
    .from('broker_commissions')
    .select('id', { count: 'exact', head: true })
    .eq('broker_id', brokerId);
  commQuery = applyTenantFilter(commQuery, ctx, 'broker_commissions');

  const [{ count: salesCount }, { count: commissionsCount }] = await Promise.all([
    salesQuery,
    commQuery,
  ]);

  return {
    salesCount: salesCount ?? 0,
    commissionsCount: commissionsCount ?? 0,
  };
}

export async function deactivateOrDeleteBroker(
  supabase: SupabaseClient,
  ctx: RlsContext,
  brokerId: string,
  brokerName: string,
): Promise<BrokerDeleteResult> {
  if (!ctx.isSuperAdmin && !ctx.tenantId) {
    throw new Error('Usuário não tem empresa associada.');
  }

  const { salesCount, commissionsCount } = await brokerHasCriticalHistory(supabase, ctx, brokerId);
  const mode = resolveBrokerDeleteMode(salesCount, commissionsCount);

  if (mode === 'soft') {
    const patch = buildBrokerSoftDeletePatch();
    let query = supabase.from('brokers').update(patch).eq('id', brokerId);
    if (!ctx.isSuperAdmin && ctx.tenantId) {
      query = query.or(tenantOrClause(ctx.tenantId));
    }
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!data?.length) {
      throw new Error('Não foi possível desativar o corretor. Verifique permissões ou tenant ativo.');
    }
  } else {
    const query = scopedBrokerMutationQuery(supabase, ctx, brokerId, 'delete');
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!data?.length) {
      throw new Error('Não foi possível excluir o corretor. Verifique permissões ou tenant ativo.');
    }
  }

  return { mode, brokerId, brokerName };
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

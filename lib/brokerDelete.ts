/**
 * Exclusão segura de corretores (soft/hard) e estatísticas do painel.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { rankBrokersBySalesValue } from '@/lib/brokerDashboardStats';
import { canReactivateBroker } from '@/lib/saasPlanEnforcement';
import { isPlatformAdmin, type RlsContext } from '@/lib/rls';
import { isTenantEnterpriseAdminRole } from '@/lib/rolePermissions';

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
};

export type BrokerDashboardStats = {
  activeCount: number;
  totalVendasMes: number;
  totalComissoesPagas: number;
  totalComissoesPendentes: number;
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

export function buildBrokerActivatePatch(now: Date = new Date()): Record<string, unknown> {
  return {
    active: true,
    status: 'ativo',
    deleted_at: null,
    updated_at: now.toISOString(),
  };
}

export type BrokerActiveToggleResult = {
  brokerId: string;
  brokerName: string;
  effectiveTenantId: string;
  active: boolean;
  status: string;
};

export function resolveBrokerDeleteMode(
  salesCount: number,
  commissionsCount: number,
): BrokerDeleteMode {
  if (salesCount > 0 || commissionsCount > 0) return 'soft';
  return 'hard';
}

/** Lê o tenant real do corretor (tenant_id canônico; company_id só como legado). */
export function readBrokerTenantId(
  broker: Pick<BrokerRow, 'tenant_id' | 'company_id'>,
): string | null {
  const tenantId = broker.tenant_id ? String(broker.tenant_id).trim() : '';
  if (tenantId) return tenantId;
  const companyId = broker.company_id ? String(broker.company_id).trim() : '';
  return companyId || null;
}

/** Coluna usada na mutação: tenant_id quando existir no registro. */
export function resolveBrokerMutationColumn(
  broker: Pick<BrokerRow, 'tenant_id' | 'company_id'>,
): 'tenant_id' | 'company_id' {
  if (broker.tenant_id && String(broker.tenant_id).trim()) return 'tenant_id';
  return 'company_id';
}

/** ADMIN da empresa ou SUPER_ADMIN no tenant do corretor. */
export function canDeleteBrokerInTenant(params: {
  userRole: string;
  userTenantId: string | null;
  brokerTenantId: string;
  isSuperAdmin: boolean;
}): boolean {
  if (params.isSuperAdmin || isPlatformAdmin(params.userRole)) return true;
  if (!isTenantEnterpriseAdminRole(params.userRole)) return false;
  const userTenant = params.userTenantId ? String(params.userTenantId).trim() : '';
  return !!userTenant && userTenant === params.brokerTenantId;
}

export function assertCanDeleteBrokerInTenant(params: {
  userRole: string;
  userTenantId: string | null;
  brokerTenantId: string;
  isSuperAdmin: boolean;
}): void {
  if (canDeleteBrokerInTenant(params)) return;

  if (!isTenantEnterpriseAdminRole(params.userRole) && !isPlatformAdmin(params.userRole)) {
    throw new BrokerDeleteError('Somente administradores podem excluir corretores.', {
      userRole: params.userRole,
      brokerTenantId: params.brokerTenantId,
    });
  }

  throw new BrokerDeleteError('Você não tem permissão para excluir corretores desta empresa.', {
    userRole: params.userRole,
    userTenantId: params.userTenantId,
    brokerTenantId: params.brokerTenantId,
    isSuperAdmin: params.isSuperAdmin,
  });
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

export function rankBrokersByMonthlySales<T extends { vendas_mes_valor?: number }>(
  brokers: T[],
  limit = 3,
): T[] {
  return rankBrokersBySalesValue(filterBrokersForActiveList(brokers), limit);
}

export { rankBrokersBySalesValue } from '@/lib/brokerDashboardStats';

export function removeBrokerFromList<T extends BrokerRow>(brokers: T[], brokerId: string): T[] {
  return brokers.filter((b) => b.id !== brokerId);
}

/** Passo 1 — busca corretor pelo id (RLS do Supabase aplica isolamento). */
export async function fetchBrokerById(
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

/** Passo 4 — vendas/comissões no tenant real do corretor. */
export async function brokerHasCriticalHistory(
  supabase: SupabaseClient,
  brokerId: string,
  brokerTenantId: string,
): Promise<{ salesCount: number; commissionsCount: number }> {
  const tenantScope = `tenant_id.eq.${brokerTenantId},company_id.eq.${brokerTenantId}`;

  const [{ count: salesCount, error: salesErr }, { count: commissionsCount, error: commErr }] =
    await Promise.all([
      supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('broker_id', brokerId)
        .or(tenantScope),
      supabase
        .from('broker_commissions')
        .select('id', { count: 'exact', head: true })
        .eq('broker_id', brokerId)
        .or(tenantScope),
    ]);

  if (salesErr) throw salesErr;
  if (commErr) throw commErr;

  return {
    salesCount: salesCount ?? 0,
    commissionsCount: commissionsCount ?? 0,
  };
}

function buildBrokerMutation(
  supabase: SupabaseClient,
  broker: BrokerRow,
  brokerTenantId: string,
  operation: 'update' | 'delete',
  patch?: Record<string, unknown>,
) {
  const column = resolveBrokerMutationColumn(broker);
  if (operation === 'update') {
    return supabase
      .from('brokers')
      .update(patch ?? {})
      .eq('id', broker.id)
      .eq(column, brokerTenantId);
  }

  return supabase
    .from('brokers')
    .delete()
    .eq('id', broker.id)
    .eq(column, brokerTenantId);
}

/**
 * Fluxo completo:
 * 1. Buscar broker pelo id
 * 2. Ler broker.tenant_id real
 * 3. Confirmar ADMIN/SUPER_ADMIN do tenant
 * 4. Consultar vendas/comissões no tenant do broker
 * 5. Soft ou hard delete
 */
export async function deactivateOrDeleteBroker(
  supabase: SupabaseClient,
  ctx: RlsContext,
  brokerId: string,
  brokerName: string,
  userCtx: BrokerDeleteUserContext,
): Promise<BrokerDeleteResult> {
  // 1. Buscar broker pelo id
  const brokerRow = await fetchBrokerById(supabase, brokerId);

  // 2. Ler tenant real do corretor
  const brokerTenantId = readBrokerTenantId(brokerRow);
  if (!brokerTenantId) {
    throw new BrokerDeleteError('Corretor sem empresa vinculada.', { brokerId, broker: brokerRow });
  }

  // 3. Confirmar permissão ADMIN/SUPER_ADMIN no tenant do broker
  assertCanDeleteBrokerInTenant({
    userRole: userCtx.userRole,
    userTenantId: userCtx.userTenantId,
    brokerTenantId,
    isSuperAdmin: ctx.isSuperAdmin,
  });

  const resolvedName = brokerName || brokerRow.name || brokerRow.full_name || 'Corretor';
  const diagnosticBase = {
    brokerId,
    brokerTenantId,
    brokerTenantColumn: resolveBrokerMutationColumn(brokerRow),
    userTenantId: userCtx.userTenantId,
    userRole: userCtx.userRole,
    isSuperAdmin: ctx.isSuperAdmin,
  };

  console.info('[BROKER_DELETE] start', diagnosticBase);

  // 4. Vendas/comissões no tenant do broker
  const { salesCount, commissionsCount } = await brokerHasCriticalHistory(
    supabase,
    brokerId,
    brokerTenantId,
  );

  // 5. Soft ou hard delete
  const mode = resolveBrokerDeleteMode(salesCount, commissionsCount);
  console.info('[BROKER_DELETE] mode', { ...diagnosticBase, mode, salesCount, commissionsCount });

  if (mode === 'soft') {
    const { data, error } = await buildBrokerMutation(
      supabase,
      brokerRow,
      brokerTenantId,
      'update',
      buildBrokerSoftDeletePatch(),
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
    const { data, error } = await buildBrokerMutation(
      supabase,
      brokerRow,
      brokerTenantId,
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
    effectiveTenantId: brokerTenantId,
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

// Compatibilidade com testes anteriores
export const resolveBrokerRowTenantId = readBrokerTenantId;
export const resolveBrokerTenantColumn = resolveBrokerMutationColumn;
export const canManageBrokerInTenant = canDeleteBrokerInTenant;

export function resolveEffectiveBrokerTenant(params: {
  broker: Pick<BrokerRow, 'tenant_id' | 'company_id'>;
  activeTenantId: string | null;
  userRole: string;
  userTenantId: string | null;
  isSuperAdmin: boolean;
}) {
  const brokerTenantId = readBrokerTenantId(params.broker);
  if (!brokerTenantId) {
    throw new BrokerDeleteError('Corretor sem empresa vinculada.', { broker: params.broker });
  }
  assertCanDeleteBrokerInTenant({
    userRole: params.userRole,
    userTenantId: params.userTenantId,
    brokerTenantId,
    isSuperAdmin: params.isSuperAdmin,
  });
  return {
    effectiveTenantId: brokerTenantId,
    tenantColumn: resolveBrokerMutationColumn(params.broker),
    source: 'broker_tenant' as const,
  };
}

function resolveUsersTenantId(row?: { tenant_id?: string | null; company_id?: string | null } | null): string | null {
  const tenantId = row?.tenant_id || row?.company_id;
  return tenantId ? String(tenantId).trim() : null;
}

/** Corretor operacional — bloqueia promoção a administrador. */
export function isBrokerRecordActive(
  broker: Pick<BrokerRow, 'active' | 'status' | 'deleted_at'> | null | undefined,
): boolean {
  if (!broker) return false;
  return isBrokerActiveForList(broker);
}

export async function findBrokerForUserInTenant(
  admin: SupabaseClient,
  userId: string,
  tenantId: string,
): Promise<BrokerRow | null> {
  const { data, error } = await admin
    .from('brokers')
    .select('id, tenant_id, company_id, email, active, status, deleted_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const brokerTenantId = readBrokerTenantId(data as BrokerRow);
  if (brokerTenantId !== tenantId) return null;
  return data as BrokerRow;
}

export type BrokerAdminEmailConflictState =
  | 'available'
  | 'same_tenant_admin'
  | 'same_tenant_active_broker'
  | 'same_tenant_inactive_broker_promotable'
  | 'other_tenant';

export function resolveBrokerAdminEmailConflict(params: {
  existingUser: Record<string, unknown> | null;
  brokerRecord: BrokerRow | null;
  tenantId: string;
  isAdminRole: (role: string) => boolean;
}): BrokerAdminEmailConflictState {
  const { existingUser, brokerRecord, tenantId, isAdminRole } = params;
  if (!existingUser) return 'available';

  const existingTenant = resolveUsersTenantId(existingUser);
  if (existingTenant && existingTenant !== tenantId) return 'other_tenant';
  if (existingTenant !== tenantId) return 'available';

  const role = String(existingUser.role || '').toUpperCase();
  if (isAdminRole(role)) return 'same_tenant_admin';

  if (brokerRecord && isBrokerRecordActive(brokerRecord)) {
    return 'same_tenant_active_broker';
  }

  return 'same_tenant_inactive_broker_promotable';
}

export function brokerAdminEmailConflictMessage(state: BrokerAdminEmailConflictState): string | null {
  switch (state) {
    case 'other_tenant':
      return 'Este e-mail já está vinculado a outra empresa.';
    case 'same_tenant_active_broker':
      return 'Este e-mail pertence a um corretor ativo. Desative ou exclua o corretor antes de cadastrar como administrador.';
    case 'same_tenant_admin':
      return 'Este e-mail já é administrador desta empresa.';
    default:
      return null;
  }
}

/** Exclusão via service role — somente tabela brokers; nunca auth.users/users admin. */
export async function deleteBrokerViaAdmin(
  admin: SupabaseClient,
  brokerId: string,
  userCtx: BrokerDeleteUserContext,
  isSuperAdmin: boolean,
): Promise<BrokerDeleteResult> {
  const { data, error } = await admin
    .from('brokers')
    .select('id, name, full_name, tenant_id, company_id, active, status, deleted_at')
    .eq('id', brokerId)
    .maybeSingle();

  if (error) {
    throw new BrokerDeleteError('Não foi possível localizar o corretor.', {
      brokerId,
      supabaseError: error.message,
    });
  }
  if (!data) {
    throw new BrokerDeleteError('Corretor não encontrado.', { brokerId });
  }

  const brokerRow = data as BrokerRow;
  const brokerTenantId = readBrokerTenantId(brokerRow);
  if (!brokerTenantId) {
    throw new BrokerDeleteError('Corretor sem empresa vinculada.', { brokerId });
  }

  assertCanDeleteBrokerInTenant({
    userRole: userCtx.userRole,
    userTenantId: userCtx.userTenantId,
    brokerTenantId,
    isSuperAdmin,
  });

  const resolvedName = brokerRow.name || brokerRow.full_name || 'Corretor';
  const { salesCount, commissionsCount } = await brokerHasCriticalHistory(
    admin,
    brokerId,
    brokerTenantId,
  );
  const mode = resolveBrokerDeleteMode(salesCount, commissionsCount);

  if (mode === 'soft') {
    const { data: updated, error: upErr } = await buildBrokerMutation(
      admin,
      brokerRow,
      brokerTenantId,
      'update',
      buildBrokerSoftDeletePatch(),
    ).select('id');

    if (upErr || !updated?.length) {
      throw new BrokerDeleteError(
        'Não foi possível desativar o corretor. Verifique permissões ou tenant ativo.',
        { brokerId, mode },
      );
    }
  } else {
    const { data: deleted, error: delErr } = await buildBrokerMutation(
      admin,
      brokerRow,
      brokerTenantId,
      'delete',
    ).select('id');

    if (delErr || !deleted?.length) {
      throw new BrokerDeleteError(
        'Não foi possível excluir o corretor. Verifique permissões ou tenant ativo.',
        { brokerId, mode },
      );
    }
  }

  return {
    mode,
    brokerId,
    brokerName: resolvedName,
    effectiveTenantId: brokerTenantId,
  };
}

/** Ativa/desativa corretor via service role — somente tabela brokers; nunca auth.users. */
export async function setBrokerActiveViaAdmin(
  admin: SupabaseClient,
  brokerId: string,
  active: boolean,
  userCtx: BrokerDeleteUserContext,
  isSuperAdmin: boolean,
): Promise<BrokerActiveToggleResult> {
  const { data, error } = await admin
    .from('brokers')
    .select('id, name, full_name, tenant_id, company_id, active, status, deleted_at')
    .eq('id', brokerId)
    .maybeSingle();

  if (error) {
    throw new BrokerDeleteError('Não foi possível localizar o corretor.', {
      brokerId,
      supabaseError: error.message,
    });
  }
  if (!data) {
    throw new BrokerDeleteError('Corretor não encontrado.', { brokerId });
  }

  const brokerRow = data as BrokerRow;
  const brokerTenantId = readBrokerTenantId(brokerRow);
  if (!brokerTenantId) {
    throw new BrokerDeleteError('Corretor sem empresa vinculada.', { brokerId });
  }

  assertCanDeleteBrokerInTenant({
    userRole: userCtx.userRole,
    userTenantId: userCtx.userTenantId,
    brokerTenantId,
    isSuperAdmin,
  });

  if (active && !isSuperAdmin) {
    const enforcement = await canReactivateBroker(admin, brokerTenantId, {
      isPlatformAdmin: false,
    });
    if (!enforcement.allowed) {
      throw new BrokerDeleteError(enforcement.message || 'Limite de corretores atingido.', {
        brokerId,
        code: enforcement.code,
      });
    }
  }

  const resolvedName = brokerRow.name || brokerRow.full_name || 'Corretor';
  const patch = active ? buildBrokerActivatePatch() : buildBrokerSoftDeletePatch();

  const { data: updated, error: upErr } = await buildBrokerMutation(
    admin,
    brokerRow,
    brokerTenantId,
    'update',
    patch,
  ).select('id, active, status');

  if (upErr || !updated?.length) {
    throw new BrokerDeleteError(
      active
        ? 'Não foi possível reativar o corretor. Verifique permissões ou tenant ativo.'
        : 'Não foi possível desativar o corretor. Verifique permissões ou tenant ativo.',
      { brokerId, active },
    );
  }

  const row = updated[0] as { active?: boolean; status?: string };
  return {
    brokerId,
    brokerName: resolvedName,
    effectiveTenantId: brokerTenantId,
    active: row.active !== false,
    status: String(row.status || (active ? 'ativo' : 'inativo')),
  };
}

/**
 * Resolve o cadastro de corretor vinculado ao usuário autenticado.
 * Não assume user_id === broker_id; usa auth_user_id (padrão GIS) com fallbacks.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBrokerActiveForList, type BrokerRow } from '@/lib/brokerDelete';

export type AuthenticatedBrokerRecord = {
  id: string;
  name: string | null;
  companyId: string;
  authUserId: string | null;
};

export type ResolveAuthenticatedBrokerResult =
  | { ok: true; broker: AuthenticatedBrokerRecord }
  | { ok: false; reason: 'unlinked' | 'inactive' | 'wrong_company' };

function tenantMatches(row: Record<string, unknown>, companyId: string): boolean {
  const cid = String(row.company_id || '').trim();
  const tid = String(row.tenant_id || '').trim();
  return cid === companyId || tid === companyId;
}

function mapBrokerRow(row: Record<string, unknown>, companyId: string): AuthenticatedBrokerRecord {
  return {
    id: String(row.id),
    name: (row.name || row.full_name || null) as string | null,
    companyId,
    authUserId: row.auth_user_id
      ? String(row.auth_user_id)
      : row.user_id
        ? String(row.user_id)
        : null,
  };
}

/**
 * Busca corretor ativo da empresa para o auth user.
 * Ordem: auth_user_id → user_id → id = userId (legado create).
 */
export async function resolveAuthenticatedBroker(
  admin: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<ResolveAuthenticatedBrokerResult> {
  const normalizedUserId = String(userId || '').trim();
  const normalizedCompanyId = String(companyId || '').trim();
  if (!normalizedUserId || !normalizedCompanyId) {
    return { ok: false, reason: 'unlinked' };
  }

  const selectCols =
    'id, name, full_name, auth_user_id, user_id, company_id, tenant_id, active, status, deleted_at';

  const tryMatch = async (
    column: 'auth_user_id' | 'user_id' | 'id',
  ): Promise<Record<string, unknown> | null> => {
    const { data, error } = await admin
      .from('brokers')
      .select(selectCols)
      .eq(column, normalizedUserId)
      .limit(10);
    if (error) {
      console.warn('[resolveAuthenticatedBroker]', column, error.message);
      return null;
    }
    const rows = (data || []) as Record<string, unknown>[];
    const inCompany = rows.filter((r) => tenantMatches(r, normalizedCompanyId));
    return inCompany[0] ?? null;
  };

  let row =
    (await tryMatch('auth_user_id')) ||
    (await tryMatch('user_id')) ||
    (await tryMatch('id'));

  if (!row) {
    return { ok: false, reason: 'unlinked' };
  }

  if (!tenantMatches(row, normalizedCompanyId)) {
    return { ok: false, reason: 'wrong_company' };
  }

  if (!isBrokerActiveForList(row as BrokerRow)) {
    return { ok: false, reason: 'inactive' };
  }

  return { ok: true, broker: mapBrokerRow(row, normalizedCompanyId) };
}

export const BROKER_UNLINKED_MESSAGE =
  'Seu usuário ainda não está vinculado a um cadastro de corretor. Entre em contato com o administrador da empresa.';

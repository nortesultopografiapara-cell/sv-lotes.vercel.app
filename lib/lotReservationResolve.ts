/**
 * Resolve o nome do responsável pela reserva (histórico / legado).
 * Nunca usa o usuário atualmente logado.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { LOT_RESERVATION_UNKNOWN_ACTOR } from '@/lib/lotReservationDisplay';

export async function resolveReservationResponsibleName(
  supabase: SupabaseClient,
  input: {
    companyId?: string | null;
    blockId: string;
    reservedByUserId?: string | null;
    reservedByName?: string | null;
    brokerId?: string | null;
    brokerName?: string | null;
  },
): Promise<string> {
  const snapshot = String(input.reservedByName || '').trim();
  if (snapshot) return snapshot;

  const userId = String(input.reservedByUserId || '').trim();
  if (userId) {
    const fromUser = await lookupUserDisplayName(supabase, userId, input.companyId);
    if (fromUser) return fromUser;
    const fromBrokerAuth = await lookupBrokerNameByAuthUser(
      supabase,
      userId,
      input.companyId,
    );
    if (fromBrokerAuth) return fromBrokerAuth;
  }

  // Auditoria: último evento "reserved" do lote (usuário autenticado na ação)
  try {
    let q = supabase
      .from('lot_audit_logs')
      .select('user_id')
      .eq('block_id', input.blockId)
      .eq('action', 'reserved')
      .order('created_at', { ascending: false })
      .limit(1);
    if (input.companyId) {
      q = q.eq('company_id', input.companyId);
    }
    const { data } = await q.maybeSingle();
    const auditUserId = data?.user_id ? String(data.user_id) : '';
    if (auditUserId) {
      const name =
        (await lookupUserDisplayName(supabase, auditUserId, input.companyId)) ||
        (await lookupBrokerNameByAuthUser(supabase, auditUserId, input.companyId));
      if (name) return name;
    }
  } catch {
    /* ignore */
  }

  // Não presumir broker_id do bloco (pode ser corretor selecionado, não o ator).
  return LOT_RESERVATION_UNKNOWN_ACTOR;
}

async function lookupUserDisplayName(
  supabase: SupabaseClient,
  userId: string,
  companyId?: string | null,
): Promise<string | null> {
  try {
    let q = supabase.from('users').select('name').eq('id', userId).limit(1);
    if (companyId) {
      q = q.or(`tenant_id.eq.${companyId},company_id.eq.${companyId}`);
    }
    const { data } = await q.maybeSingle();
    const name = String(data?.name || '').trim();
    return name || null;
  } catch {
    return null;
  }
}

async function lookupBrokerNameByAuthUser(
  supabase: SupabaseClient,
  authUserId: string,
  companyId?: string | null,
): Promise<string | null> {
  try {
    let q = supabase
      .from('brokers')
      .select('name')
      .eq('auth_user_id', authUserId)
      .limit(1);
    if (companyId) {
      q = q.or(`tenant_id.eq.${companyId},company_id.eq.${companyId}`);
    }
    const { data } = await q.maybeSingle();
    const name = String(data?.name || '').trim();
    return name || null;
  } catch {
    return null;
  }
}

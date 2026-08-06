/**
 * Executa ações da fila offline no Supabase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveOrCreateCustomer,
  type CustomerFormValues,
} from '@/lib/customerIdentity';
import type { OfflineSyncAction } from '@/lib/offline/types';

function isLotAvailableStatus(status: unknown): boolean {
  const s = String(status || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return !s || s === 'disponivel' || s === 'available' || s === 'livre';
}

function isReservedBySameCustomer(
  block: Record<string, unknown>,
  customerId: string,
): boolean {
  const s = String(block.status || '').toLowerCase();
  return (
    (s.includes('reserv') || s === 'reserved') &&
    String(block.customer_id) === customerId
  );
}

export type ExecuteOfflineOptions = { forceConfirm?: boolean };

async function executeBlockReserve(
  supabase: SupabaseClient,
  action: OfflineSyncAction,
  options?: ExecuteOfflineOptions,
): Promise<{ ok: true } | { ok: false; conflict?: boolean; message: string }> {
  const p = action.payload;
  const blockId = String(p.block_id || '');
  const projectId = String(p.project_id || '');
  const tenantId = String(p.tenant_id || '');
  const userId = String(p.user_id || '');
  const userName =
    String(p.user_name || '').trim() ||
    (userId ? 'usuário' : '');
  const customerData = (p.customer_data || {}) as CustomerFormValues;
  const finalPrice = Number(p.final_price) || 0;
  const brokerId = (p.broker_id as string | null) || null;

  const { data: block, error: blockErr } = await supabase
    .from('blocks')
    .select('id, status, customer_id, project_id, tenant_id')
    .eq('id', blockId)
    .maybeSingle();

  if (blockErr || !block) {
    return { ok: false, message: blockErr?.message || 'Lote não encontrado.' };
  }

  const { customerId } = await resolveOrCreateCustomer(supabase, {
    form: customerData,
    tenantId,
    projectId,
    isSuperAdmin: Boolean(p.is_super_admin),
    lotTenantId: block.tenant_id as string,
  });

  const available = isLotAvailableStatus(block.status);
  const sameReserve = isReservedBySameCustomer(
    block as Record<string, unknown>,
    customerId,
  );

  if (!options?.forceConfirm && !available && !sameReserve) {
    return {
      ok: false,
      conflict: true,
      message:
        'Conflito: o lote já foi vendido ou reservado por outro usuário. O administrador deve decidir.',
    };
  }

  const d = new Date();
  d.setHours(d.getHours() + 48);
  const expirationTime = d.toISOString();
  const reservationAt = new Date().toISOString();

  const signalAmount =
    customerData.signal_amount != null && customerData.signal_amount !== ''
      ? Number(customerData.signal_amount)
      : null;

  const { error: updateError } = await supabase
    .from('blocks')
    .update({
      status: 'Reservado',
      price: finalPrice,
      customer_id: customerId,
      broker_id: brokerId,
      reservation_expires_at: expirationTime,
      reservation_date: reservationAt,
      reserved_by_user_id: userId || null,
      reserved_by_name: userName || null,
      signal_amount: signalAmount,
      signal_date: customerData.signal_date || null,
      signal_payment_method: customerData.signal_payment_method || null,
      signal_notes: customerData.signal_notes || null,
    })
    .eq('id', blockId)
    .eq('project_id', projectId);

  if (updateError) {
    if (/reserved_by|column/i.test(updateError.message || '')) {
      const { error: legacyErr } = await supabase
        .from('blocks')
        .update({
          status: 'Reservado',
          price: finalPrice,
          customer_id: customerId,
          broker_id: brokerId,
          reservation_expires_at: expirationTime,
          reservation_date: reservationAt,
          signal_amount: signalAmount,
          signal_date: customerData.signal_date || null,
          signal_payment_method: customerData.signal_payment_method || null,
          signal_notes: customerData.signal_notes || null,
        })
        .eq('id', blockId)
        .eq('project_id', projectId);
      if (legacyErr) {
        return { ok: false, message: legacyErr.message };
      }
    } else {
      return { ok: false, message: updateError.message };
    }
  }

  try {
    await supabase.from('reservation_logs').insert({
      company_id: tenantId,
      tenant_id: tenantId,
      broker_id: brokerId,
      block_id: blockId,
      customer_id: customerId,
      expiration_time: expirationTime,
      status: 'active',
      signal_amount: signalAmount,
      signal_date: customerData.signal_date || null,
      signal_payment_method: customerData.signal_payment_method || null,
      signal_notes: customerData.signal_notes || null,
      created_by_user_id: userId || null,
      created_by_name: userName || null,
    });
  } catch {
    /* não bloqueia sync */
  }

  try {
    await supabase.from('logs').insert({
      tenant_id: tenantId,
      user_id: userId || null,
      action: 'Reservado',
      details: {
        title: `Reserva offline sincronizada — lote ${p.lot_number || blockId}`,
        subtitle: 'SV LOTES PWA offline',
        offline_action_id: action.id,
      },
    });
  } catch {
    /* ignore */
  }

  return { ok: true };
}

export async function executeOfflineAction(
  supabase: SupabaseClient,
  action: OfflineSyncAction,
  options?: ExecuteOfflineOptions,
): Promise<{ ok: true } | { ok: false; conflict?: boolean; message: string }> {
  if (action.type === 'BLOCK_RESERVE') {
    return executeBlockReserve(supabase, action, options);
  }
  return {
    ok: false,
    message: `Tipo de ação não suportado: ${action.type}`,
  };
}

export function createOfflineSyncExecutor(
  supabase: SupabaseClient,
): (
  action: OfflineSyncAction,
  options?: ExecuteOfflineOptions,
) => Promise<{ ok: true } | { ok: false; conflict?: boolean; message: string }> {
  return (action, options) => executeOfflineAction(supabase, action, options);
}

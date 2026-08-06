/**
 * Reserva de lote em modo offline (fila + atualização local do mapa).
 */

import { saveOfflineAction } from '@/lib/offline/offlineSync';
import { getMapProjectCache, saveMapProjectCache } from '@/lib/offline/store';

export type OfflineReservationInput = {
  lot: Record<string, unknown>;
  finalPrice: number;
  customerData: Record<string, unknown>;
  user: {
    id: string;
    tenant_id?: string | null;
    role?: string;
    name?: string | null;
    email?: string | null;
  };
  brokerId?: string | null;
};

export async function queueOfflineReservation(
  input: OfflineReservationInput,
): Promise<{ localActionId: string }> {
  const lot = input.lot;
  const projectId = String(lot.project_id || '');
  const tenantId = String(input.user.tenant_id || lot.tenant_id || '');
  const reservedByName =
    String(input.user.name || input.user.email || '').trim() || 'usuário';
  const reservationAt = new Date().toISOString();
  const expires = new Date(reservationAt);
  expires.setHours(expires.getHours() + 48);

  const action = await saveOfflineAction({
    type: 'BLOCK_RESERVE',
    table: 'blocks',
    payload: {
      block_id: lot.id,
      project_id: projectId,
      tenant_id: tenantId,
      user_id: input.user.id,
      user_name: reservedByName,
      is_super_admin: input.user.role === 'SUPER_ADMIN',
      final_price: input.finalPrice,
      broker_id: input.brokerId ?? null,
      lot_number: lot.number,
      block_name: lot.block,
      customer_data: input.customerData,
    },
  });

  await patchLocalMapLot(projectId, String(lot.id), {
    status: 'Reservado',
    customerName: String(input.customerData.name || 'Cliente (offline)'),
    customerId: `offline-pending-${action.id}`,
    price: input.finalPrice,
    offlinePending: true,
    reservation_date: reservationAt,
    reservation_expires_at: expires.toISOString(),
    reserved_by_user_id: input.user.id,
    reserved_by_name: reservedByName,
  });

  console.log('OFFLINE_RESERVATION_QUEUED', {
    actionId: action.id,
    blockId: lot.id,
  });

  return { localActionId: action.id };
}

async function patchLocalMapLot(
  projectId: string,
  lotId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const cache = await getMapProjectCache(projectId);
  if (!cache) return;

  const lots = cache.lots.map((l) =>
    String(l.id) === lotId ? { ...l, ...patch } : l,
  );

  await saveMapProjectCache({
    ...cache,
    lots,
    updatedAt: new Date().toISOString(),
  });
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export function blockOfflineSale(): void {
  alert(
    'Sem conexão: venda definitiva não é permitida offline.\n\nUse RESERVA OFFLINE. Ao voltar a internet, o sistema sincroniza e valida se o lote ainda está disponível.',
  );
}

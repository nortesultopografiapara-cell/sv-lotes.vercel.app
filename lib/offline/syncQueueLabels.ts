import type { OfflineActionType, OfflineSyncAction } from '@/lib/offline/types';
import { isOfflineActionConflict } from '@/lib/offline/offlineSync';

export const OFFLINE_ACTION_TYPE_LABELS: Record<OfflineActionType, string> = {
  BLOCK_RESERVE: 'Reserva de lote (offline)',
  BLOCK_RELEASE: 'Liberação de lote',
  CUSTOMER_UPSERT: 'Cliente (offline)',
};

export function formatOfflineActionStatus(action: OfflineSyncAction): string {
  if (action.status === 'pending') return 'Pendente';
  if (action.status === 'synced') return 'Sincronizado';
  if (action.status === 'ignored') return 'Ignorado';
  if (isOfflineActionConflict(action)) return 'Conflito';
  if (action.status === 'error') return 'Erro';
  return action.status;
}

export function extractLotContext(payload: Record<string, unknown>): {
  block: string;
  lot: string;
  project: string;
} {
  const block = String(payload.block_name ?? payload.block ?? '—');
  const lot = String(payload.lot_number ?? payload.number ?? '—');
  const project = String(
    payload.project_name ?? payload.project_id ?? '—',
  );
  return { block, lot, project };
}

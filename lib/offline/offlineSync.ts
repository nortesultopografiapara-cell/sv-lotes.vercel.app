/**
 * Fila de sincronização offline — ações pendentes no IndexedDB.
 */

import { getOfflineDb } from '@/lib/offline/db';
import type {
  OfflineActionStatus,
  OfflineActionType,
  OfflineSyncAction,
} from '@/lib/offline/types';

export type SaveOfflineActionInput = {
  type: OfflineActionType;
  table: string;
  payload: Record<string, unknown>;
  id?: string;
};

function newLocalId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function saveOfflineAction(
  action: SaveOfflineActionInput,
): Promise<OfflineSyncAction> {
  const db = await getOfflineDb();
  const row: OfflineSyncAction = {
    id: action.id || newLocalId(),
    type: action.type,
    table: action.table,
    payload: action.payload,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  await db.put('sync_queue', row);
  console.log('OFFLINE_ACTION_QUEUED', {
    id: row.id,
    type: row.type,
    table: row.table,
  });
  return row;
}

export async function getPendingActions(): Promise<OfflineSyncAction[]> {
  const db = await getOfflineDb();
  const all = await db.getAllFromIndex('sync_queue', 'by-status', 'pending');
  return all.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export async function markActionSynced(id: string): Promise<void> {
  const db = await getOfflineDb();
  const row = await db.get('sync_queue', id);
  if (!row) return;
  await db.put('sync_queue', {
    ...row,
    status: 'synced',
    synced_at: new Date().toISOString(),
    error_message: null,
  });
  console.log('OFFLINE_ACTION_SYNCED', { id });
}

export async function markActionFailed(
  id: string,
  errorMessage: string,
): Promise<void> {
  const db = await getOfflineDb();
  const row = await db.get('sync_queue', id);
  if (!row) return;
  await db.put('sync_queue', {
    ...row,
    status: 'error',
    error_message: errorMessage,
  });
  console.log('OFFLINE_ACTION_FAILED', { id, errorMessage });
}

export async function updateActionStatus(
  id: string,
  status: OfflineActionStatus,
  errorMessage?: string,
): Promise<void> {
  if (status === 'synced') {
    await markActionSynced(id);
    return;
  }
  if (status === 'error') {
    await markActionFailed(id, errorMessage || 'Erro desconhecido');
  }
}

export type SyncResult = {
  synced: number;
  failed: number;
  conflicts: Array<{ id: string; message: string }>;
};

export type SyncExecutor = (
  action: OfflineSyncAction,
) => Promise<{ ok: true } | { ok: false; conflict?: boolean; message: string }>;

/**
 * Processa fila pendente (executor injetado para evitar dependência circular).
 */
export async function syncPendingActions(
  executor: SyncExecutor,
): Promise<SyncResult> {
  const pending = await getPendingActions();
  const result: SyncResult = { synced: 0, failed: 0, conflicts: [] };

  console.log('OFFLINE_SYNC_START', { pending: pending.length });

  for (const action of pending) {
    try {
      const outcome = await executor(action);
      if (outcome.ok) {
        await markActionSynced(action.id);
        result.synced += 1;
      } else {
        await markActionFailed(action.id, outcome.message);
        result.failed += 1;
        if (outcome.conflict) {
          result.conflicts.push({ id: action.id, message: outcome.message });
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await markActionFailed(action.id, msg);
      result.failed += 1;
    }
  }

  console.log('OFFLINE_SYNC_DONE', result);
  return result;
}

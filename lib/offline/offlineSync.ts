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
  options?: { conflict?: boolean },
): Promise<void> {
  const db = await getOfflineDb();
  const row = await db.get('sync_queue', id);
  if (!row) return;
  await db.put('sync_queue', {
    ...row,
    status: 'error',
    error_message: errorMessage,
    conflict: Boolean(options?.conflict),
  });
  console.log('OFFLINE_ACTION_FAILED', { id, errorMessage, conflict: options?.conflict });
}

export async function getAllSyncQueueActions(): Promise<OfflineSyncAction[]> {
  const db = await getOfflineDb();
  const all = await db.getAll('sync_queue');
  return all.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export type SyncQueueSummary = {
  pending: number;
  synced: number;
  error: number;
  conflict: number;
  ignored: number;
  total: number;
};

export function isOfflineActionConflict(action: OfflineSyncAction): boolean {
  if (action.conflict) return true;
  if (action.status !== 'error') return false;
  return /conflito/i.test(String(action.error_message || ''));
}

export function summarizeSyncQueue(
  actions: OfflineSyncAction[],
): SyncQueueSummary {
  let pending = 0;
  let synced = 0;
  let error = 0;
  let conflict = 0;
  let ignored = 0;

  for (const a of actions) {
    if (a.status === 'pending') pending += 1;
    else if (a.status === 'synced') synced += 1;
    else if (a.status === 'ignored') ignored += 1;
    else if (a.status === 'error') {
      if (isOfflineActionConflict(a)) conflict += 1;
      else error += 1;
    }
  }

  return {
    pending,
    synced,
    error,
    conflict,
    ignored,
    total: actions.length,
  };
}

export async function getSyncQueueSummary(): Promise<SyncQueueSummary> {
  const actions = await getAllSyncQueueActions();
  return summarizeSyncQueue(actions);
}

export async function resetActionToPending(id: string): Promise<void> {
  const db = await getOfflineDb();
  const row = await db.get('sync_queue', id);
  if (!row) return;
  await db.put('sync_queue', {
    ...row,
    status: 'pending',
    error_message: null,
    conflict: false,
    synced_at: null,
    ignored_at: null,
    manual_confirmed_at: null,
  });
  console.log('OFFLINE_ACTION_RESET_PENDING', { id });
}

export async function markActionIgnored(id: string): Promise<void> {
  const db = await getOfflineDb();
  const row = await db.get('sync_queue', id);
  if (!row) return;
  await db.put('sync_queue', {
    ...row,
    status: 'ignored',
    ignored_at: new Date().toISOString(),
    error_message: row.error_message || 'Ignorado pelo administrador',
  });
  console.log('OFFLINE_ACTION_IGNORED', { id });
}

export async function markActionManualConfirmed(id: string): Promise<void> {
  const db = await getOfflineDb();
  const row = await db.get('sync_queue', id);
  if (!row) return;
  await db.put('sync_queue', {
    ...row,
    manual_confirmed_at: new Date().toISOString(),
  });
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

export type SyncExecutorOptions = { forceConfirm?: boolean };

export type SyncExecutor = (
  action: OfflineSyncAction,
  options?: SyncExecutorOptions,
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
        await markActionFailed(action.id, outcome.message, {
          conflict: outcome.conflict,
        });
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

export type SyncSingleResult =
  | { ok: true }
  | { ok: false; conflict?: boolean; message: string };

/**
 * Sincroniza uma única ação (reprocessar ou confirmar manualmente).
 */
export async function syncSingleAction(
  id: string,
  executor: SyncExecutor,
  options?: { forceConfirm?: boolean },
): Promise<SyncSingleResult> {
  const db = await getOfflineDb();
  const action = await db.get('sync_queue', id);
  if (!action) {
    return { ok: false, message: 'Ação não encontrada na fila local.' };
  }
  if (action.status === 'synced' || action.status === 'ignored') {
    return { ok: false, message: 'Esta ação já foi finalizada ou ignorada.' };
  }

  try {
    const outcome = await executor(action, options);
    if (outcome.ok) {
      await markActionSynced(action.id);
      if (options?.forceConfirm) {
        await markActionManualConfirmed(action.id);
      }
      return { ok: true };
    }
    await markActionFailed(action.id, outcome.message, {
      conflict: outcome.conflict,
    });
    return {
      ok: false,
      conflict: outcome.conflict,
      message: outcome.message,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await markActionFailed(action.id, msg);
    return { ok: false, message: msg };
  }
}

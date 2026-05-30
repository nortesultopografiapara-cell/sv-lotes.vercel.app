'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { syncPendingActions } from '@/lib/offline/offlineSync';
import { createOfflineSyncExecutor } from '@/lib/offline/syncExecutor';
import type { OfflineConnectivityState } from '@/lib/offline/types';

export type OnlineStatusState = {
  /** Compat: navigator.onLine */
  isOnline: boolean;
  connectivity: OfflineConnectivityState;
  pendingCount: number;
  lastSyncAt: string | null;
  lastConflicts: Array<{ id: string; message: string }>;
  syncNow: () => Promise<void>;
};

export function useOnlineStatus(): OnlineStatusState {
  const [isOnline, setIsOnline] = useState(true);
  const [connectivity, setConnectivity] =
    useState<OfflineConnectivityState>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastConflicts, setLastConflicts] = useState<
    Array<{ id: string; message: string }>
  >([]);

  const refreshPendingCount = useCallback(async () => {
    try {
      const { getPendingActions } = await import('@/lib/offline/offlineSync');
      const pending = await getPendingActions();
      setPendingCount(pending.length);
    } catch {
      setPendingCount(0);
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return;
    setConnectivity('syncing');
    try {
      const result = await syncPendingActions(createOfflineSyncExecutor(supabase));
      setLastConflicts(result.conflicts);
      setLastSyncAt(new Date().toISOString());
      await refreshPendingCount();
      setConnectivity(result.failed > 0 && result.synced === 0 ? 'online' : 'synced');
      if (result.conflicts.length > 0) {
        const lines = result.conflicts.map((c) => `• ${c.message}`).join('\n');
        alert(
          `Sincronização concluída com conflitos (${result.conflicts.length}). O administrador deve decidir:\n\n${lines}`,
        );
      }
    } catch (e) {
      console.error('OFFLINE_SYNC_ERROR', e);
      setConnectivity('online');
    } finally {
      setTimeout(() => {
        if (navigator.onLine) setConnectivity('online');
      }, 2500);
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    const apply = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      setConnectivity(online ? 'online' : 'offline');
      void refreshPendingCount();
      if (online) void syncNow();
    };

    setIsOnline(navigator.onLine);
    setConnectivity(navigator.onLine ? 'online' : 'offline');
    void refreshPendingCount();

    window.addEventListener('online', apply);
    window.addEventListener('offline', apply);
    const interval = setInterval(refreshPendingCount, 30_000);

    return () => {
      window.removeEventListener('online', apply);
      window.removeEventListener('offline', apply);
      clearInterval(interval);
    };
  }, [refreshPendingCount, syncNow]);

  return {
    isOnline,
    connectivity,
    pendingCount,
    lastSyncAt,
    lastConflicts,
    syncNow,
  };
}

'use client';

import { Cloud, CloudOff, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

const LABELS = {
  online: 'Online',
  offline: 'Offline',
  syncing: 'Sincronizando',
  synced: 'Sincronização concluída',
} as const;

export function OfflineStatusBar() {
  const { connectivity, pendingCount, syncNow, isOnline } = useOnlineStatus();

  const Icon =
    connectivity === 'offline'
      ? CloudOff
      : connectivity === 'syncing'
        ? Loader2
        : connectivity === 'synced'
          ? CheckCircle2
          : Cloud;

  const iconClass =
    connectivity === 'syncing' ? 'animate-spin' : connectivity === 'offline' ? 'text-amber-300' : 'text-emerald-300';

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700 text-[11px] text-slate-100"
      title="Status de conexão SV LOTES PWA"
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${iconClass}`} />
      <span className="font-semibold">{LABELS[connectivity]}</span>
      {pendingCount > 0 && (
        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 font-bold">
          {pendingCount} pend.
        </span>
      )}
      {isOnline && pendingCount > 0 && connectivity !== 'syncing' && (
        <button
          type="button"
          onClick={() => void syncNow()}
          className="p-0.5 rounded hover:bg-slate-700"
          title="Sincronizar agora"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

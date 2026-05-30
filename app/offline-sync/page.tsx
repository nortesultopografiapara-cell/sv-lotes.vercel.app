'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CloudOff,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { isPartnerPanelAdmin } from '@/lib/partnerPanelAdmin';
import { supabase } from '@/lib/supabase';
import { isIndexedDbAvailable } from '@/lib/offline/db';
import {
  getAllSyncQueueActions,
  getSyncQueueSummary,
  isOfflineActionConflict,
  markActionIgnored,
  resetActionToPending,
  syncPendingActions,
  syncSingleAction,
  type OfflineSyncAction,
  type SyncQueueSummary,
} from '@/lib/offline/offlineSync';
import { createOfflineSyncExecutor } from '@/lib/offline/syncExecutor';
import {
  extractLotContext,
  formatOfflineActionStatus,
  OFFLINE_ACTION_TYPE_LABELS,
} from '@/lib/offline/syncQueueLabels';
import type { OfflineActionType } from '@/lib/offline/types';
import { debugOfflineCache } from '@/lib/offline/offlineCacheDebug';

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'emerald' | 'red' | 'orange' | 'slate';
}) {
  const tones = {
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    red: 'border-red-500/30 bg-red-500/10 text-red-200',
    orange: 'border-orange-500/30 bg-orange-500/10 text-orange-200',
    slate: 'border-slate-500/30 bg-slate-500/10 text-slate-200',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function statusBadgeClass(action: OfflineSyncAction): string {
  if (action.status === 'pending') return 'bg-amber-500/15 text-amber-300';
  if (action.status === 'synced') return 'bg-emerald-500/15 text-emerald-300';
  if (action.status === 'ignored') return 'bg-slate-500/15 text-slate-400';
  if (isOfflineActionConflict(action)) return 'bg-orange-500/15 text-orange-300';
  return 'bg-red-500/15 text-red-300';
}

export default function OfflineSyncAdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [actions, setActions] = useState<OfflineSyncAction[]>([]);
  const [summary, setSummary] = useState<SyncQueueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheDiag, setCacheDiag] = useState<string | null>(null);

  const canAccess = isPartnerPanelAdmin(user?.role);

  const runCacheDiagnostic = async () => {
    try {
      const counts = await debugOfflineCache();
      setCacheDiag(
        `Projetos salvos: ${counts.projects}\nMapas salvos: ${counts.map_projects}\nQuadras/blocos salvos: ${counts.blocks}\nLotes salvos: ${counts.lots}`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCacheDiag(`Erro no diagnóstico: ${msg}`);
    }
  };

  const reload = useCallback(async () => {
    if (!isIndexedDbAvailable()) {
      setError('IndexedDB indisponível neste navegador.');
      setActions([]);
      setSummary(null);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [rows, stats] = await Promise.all([
        getAllSyncQueueActions(),
        getSyncQueueSummary(),
      ]);
      setActions(rows);
      setSummary(stats);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !canAccess) {
      router.push('/dashboard');
      return;
    }
    void reload();
  }, [authLoading, user, canAccess, router, reload]);

  const executor = createOfflineSyncExecutor(supabase);

  const handleReprocess = async (id: string) => {
    if (!navigator.onLine) {
      alert('Conecte-se à internet para reprocessar a sincronização.');
      return;
    }
    setBusyId(id);
    try {
      await resetActionToPending(id);
      const result = await syncSingleAction(id, executor);
      if (!result.ok) {
        alert(result.message);
      }
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const handleIgnore = async (id: string) => {
    if (
      !confirm(
        'Ignorar esta ação? Ela não será mais sincronizada automaticamente.',
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      await markActionIgnored(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const handleManualConfirm = async (id: string) => {
    if (!navigator.onLine) {
      alert('Conecte-se à internet para confirmar manualmente no servidor.');
      return;
    }
    if (
      !confirm(
        'Confirmar manualmente: a reserva offline será aplicada no servidor mesmo com conflito de disponibilidade. Continuar?',
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      const result = await syncSingleAction(id, executor, {
        forceConfirm: true,
      });
      if (!result.ok) {
        alert(result.message);
      } else {
        alert('Reserva confirmada manualmente e sincronizada.');
      }
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const handleSyncAll = async () => {
    if (!navigator.onLine) {
      alert('Sem conexão. Aguarde internet para sincronizar a fila.');
      return;
    }
    setSyncingAll(true);
    try {
      const result = await syncPendingActions(executor);
      if (result.conflicts.length > 0) {
        const lines = result.conflicts.map((c) => `• ${c.message}`).join('\n');
        alert(
          `Sincronização concluída com ${result.conflicts.length} conflito(s):\n\n${lines}`,
        );
      }
      await reload();
    } finally {
      setSyncingAll(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (!canAccess) {
    return null;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <CloudOff className="w-7 h-7 text-[var(--color-primary)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">
              Sincronização Offline
            </h1>
            <p className="text-sm text-slate-500">
              Fila local (IndexedDB) — reservas e ações PWA deste navegador
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-sm text-slate-300 hover:bg-white/5"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => void runCacheDiagnostic()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-sm text-amber-200 hover:bg-amber-500/20"
          >
            Diagnóstico Offline
          </button>
          <button
            type="button"
            disabled={syncingAll || (summary?.pending ?? 0) === 0}
            onClick={() => void handleSyncAll()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {syncingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            Sincronizar pendentes
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {cacheDiag && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 whitespace-pre-line font-mono">
          {cacheDiag}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <StatCard label="Pendente" value={summary.pending} tone="amber" />
          <StatCard label="Sincronizado" value={summary.synced} tone="emerald" />
          <StatCard label="Erro" value={summary.error} tone="red" />
          <StatCard label="Conflito" value={summary.conflict} tone="orange" />
          <StatCard label="Ignorado" value={summary.ignored} tone="slate" />
        </div>
      )}

      {actions.length === 0 ? (
        <p className="text-slate-500 text-sm">
          Nenhuma ação na fila offline deste dispositivo.
        </p>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[900px]">
            <thead className="bg-[var(--color-surface)]/80 text-slate-500 text-xs uppercase">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Lote / Quadra</th>
                <th className="p-3">Projeto</th>
                <th className="p-3">Status</th>
                <th className="p-3">Detalhe</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => {
                const ctx = extractLotContext(action.payload);
                const typeLabel =
                  OFFLINE_ACTION_TYPE_LABELS[
                    action.type as OfflineActionType
                  ] || action.type;
                const conflict = isOfflineActionConflict(action);
                const busy = busyId === action.id;
                const canReprocess =
                  action.status === 'pending' ||
                  action.status === 'error' ||
                  conflict;
                const canIgnore =
                  action.status !== 'synced' && action.status !== 'ignored';

                return (
                  <tr
                    key={action.id}
                    className="border-t border-white/5 hover:bg-white/[0.02]"
                  >
                    <td className="p-3 text-slate-400 whitespace-nowrap">
                      {new Date(action.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-3 text-slate-300">{typeLabel}</td>
                    <td className="p-3 text-slate-300">
                      Q. {ctx.block} · L. {ctx.lot}
                    </td>
                    <td className="p-3 text-slate-400 max-w-[140px] truncate">
                      {ctx.project}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${statusBadgeClass(action)}`}
                      >
                        {action.status === 'pending' && (
                          <Clock className="w-3 h-3" />
                        )}
                        {action.status === 'synced' && (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        {conflict && <AlertTriangle className="w-3 h-3" />}
                        {action.status === 'error' && !conflict && (
                          <XCircle className="w-3 h-3" />
                        )}
                        {action.status === 'ignored' && (
                          <Ban className="w-3 h-3" />
                        )}
                        {formatOfflineActionStatus(action)}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 text-xs max-w-[220px]">
                      {action.error_message || '—'}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {canReprocess && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleReprocess(action.id)}
                            className="px-2 py-1 rounded text-xs border border-white/10 hover:bg-white/5 disabled:opacity-50"
                          >
                            Reprocessar
                          </button>
                        )}
                        {canIgnore && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleIgnore(action.id)}
                            className="px-2 py-1 rounded text-xs border border-slate-600 text-slate-400 hover:bg-white/5 disabled:opacity-50"
                          >
                            Ignorar
                          </button>
                        )}
                        {conflict && action.status === 'error' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleManualConfirm(action.id)
                            }
                            className="px-2 py-1 rounded text-xs bg-orange-600/80 text-white hover:bg-orange-600 disabled:opacity-50"
                          >
                            Confirmar manualmente
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-600">
        A fila fica no navegador de cada usuário. Para ver ações de outro
        dispositivo, abra esta tela no mesmo aparelho que fez a reserva offline.
      </p>
    </div>
  );
}

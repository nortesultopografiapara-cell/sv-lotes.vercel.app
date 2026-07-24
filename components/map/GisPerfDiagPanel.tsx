'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  clearGisPerfQueryFromUrl,
  isGisPerfDiagnosticsEnabled,
  readGisPerfTogglesFromSearch,
  writeGisPerfTogglesToUrl,
  GIS_PERF_TOGGLE_DEFAULTS,
  type GisPerfToggleState,
} from '@/lib/gis/performance';

type Summary = Record<string, unknown> | null;

/**
 * Painel flutuante de diagnóstico — só com ?gisPerf=1 em Preview/Dev.
 * Monta só após hydrate (evita mismatch SSR vs window.location.search).
 * Não monta em Production.
 */
export function GisPerfDiagPanel({ onChange }: { onChange?: () => void }) {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [toggles, setToggles] = useState<GisPerfToggleState>(
    GIS_PERF_TOGGLE_DEFAULTS,
  );
  const [summary, setSummary] = useState<Summary>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // Client-only: lê URL após mount para não divergir do SSR (null).
    try {
      const on = typeof isGisPerfDiagnosticsEnabled === 'function'
        ? isGisPerfDiagnosticsEnabled()
        : false;
      setEnabled(on);
      if (on) {
        setToggles(readGisPerfTogglesFromSearch());
      }
    } catch (err) {
      console.error('[GIS_PERF_PANEL]', err);
      setEnabled(false);
    } finally {
      setReady(true);
    }
  }, []);

  const refreshSummary = useCallback(() => {
    if (typeof window === 'undefined') return;
    setSummary(window.__SV_GIS_PERF__?.lastSummary || null);
  }, []);

  useEffect(() => {
    if (!ready || !enabled || !toggles.panelActive) return;
    refreshSummary();
    const id = window.setInterval(refreshSummary, 1500);
    return () => window.clearInterval(id);
  }, [ready, enabled, toggles.panelActive, refreshSummary]);

  if (!ready || !enabled || !toggles.panelActive) return null;

  const setToggle = (key: keyof GisPerfToggleState, value: boolean) => {
    const next = { ...toggles, [key]: value, panelActive: true };
    setToggles(next);
    writeGisPerfTogglesToUrl({ [key]: value }, next);
    onChange?.();
  };

  const byPhase = (summary?.byPhase || {}) as Record<string, number>;
  const device = (summary?.device || {}) as Record<string, unknown>;
  const memory = (summary?.memory || {}) as Record<string, unknown>;

  return (
    <div className="fixed bottom-3 right-3 z-[5000] w-[min(100vw-1.5rem,22rem)] font-sans text-[11px] leading-snug">
      <div className="rounded-xl border border-amber-500/40 bg-[#11161d]/95 text-gray-100 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10">
          <button
            type="button"
            className="font-semibold text-amber-300"
            onClick={() => setOpen((v) => !v)}
          >
            GIS Perf {open ? '▾' : '▸'}
          </button>
          <button
            type="button"
            className="text-gray-400 hover:text-white"
            onClick={() => {
              clearGisPerfQueryFromUrl();
              window.location.reload();
            }}
          >
            Fechar
          </button>
        </div>

        {open && (
          <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
            <p className="text-gray-400">
              Preview only. Toggles só para medir — recarrega o mapa ao mudar.
            </p>

            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ['polygons', 'Polígonos'],
                  ['labels', 'Labels'],
                  ['popups', 'Popups'],
                  ['events', 'Eventos'],
                  ['dimensions', 'Dimensões'],
                  ['confrontationAudits', 'Audits'],
                  ['fitBounds', 'Fit bounds'],
                  ['boundaryLines', 'Arestas'],
                  ['baseMap', 'Base map'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(toggles[key])}
                    onChange={(e) => setToggle(key, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <button
              type="button"
              className="w-full rounded-md bg-amber-600/90 hover:bg-amber-500 px-2 py-1.5 font-medium"
              onClick={() => window.location.reload()}
            >
              Aplicar / Recarregar mapa
            </button>

            <div className="rounded-md bg-black/30 p-2 space-y-1 font-mono text-[10px]">
              <p>
                lots: {String(summary?.lotCount ?? '—')} · totalMs:{' '}
                {String(summary?.totalMs ?? '—')}
              </p>
              <p>
                device: {String(device.deviceClass ?? '—')} · w:
                {String(device.screenWidth ?? '—')}
              </p>
              <p>
                heapMB: {String(memory.usedJsHeapMb ?? 'n/a')} /{' '}
                {String(memory.jsHeapLimitMb ?? 'n/a')}
              </p>
              {summary?.lastStreetSave ||
              (typeof window !== 'undefined' &&
                window.__SV_GIS_PERF__?.lastStreetSave) ? (
                <p className="text-emerald-300/90">
                  streetSave:{' '}
                  {JSON.stringify(
                    (typeof window !== 'undefined' &&
                      window.__SV_GIS_PERF__?.lastStreetSave) ||
                      {},
                  ).slice(0, 180)}
                </p>
              ) : null}
              {typeof window !== 'undefined' &&
              window.__SV_GIS_PERF__?.lastLotEdit ? (
                <p className="text-sky-300/90">
                  lotEdit:{' '}
                  {JSON.stringify(window.__SV_GIS_PERF__.lastLotEdit).slice(
                    0,
                    180,
                  )}
                </p>
              ) : null}
              {typeof window !== 'undefined' &&
              window.__SV_GIS_PERF__?.lastRealtimePatch ? (
                <p className="text-violet-300/90">
                  realtime:{' '}
                  {JSON.stringify(
                    window.__SV_GIS_PERF__.lastRealtimePatch,
                  ).slice(0, 180)}
                </p>
              ) : null}
              {typeof window !== 'undefined' &&
              window.__SV_GIS_PERF__?.lastManualFrontEdit ? (
                <p className="text-amber-300/90">
                  manualFront:{' '}
                  {JSON.stringify(
                    window.__SV_GIS_PERF__.lastManualFrontEdit,
                  ).slice(0, 180)}
                </p>
              ) : null}
              {typeof window !== 'undefined' &&
              window.__SV_GIS_PERF__?.lastConfrontation ? (
                <p className="text-cyan-300/90">
                  confrontation:{' '}
                  {JSON.stringify(
                    window.__SV_GIS_PERF__.lastConfrontation,
                  ).slice(0, 180)}
                </p>
              ) : null}
              {Object.keys(byPhase).length > 0 && (
                <ul className="mt-1 space-y-0.5 text-gray-300">
                  {Object.entries(byPhase)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 12)
                    .map(([k, v]) => (
                      <li key={k}>
                        {k}: {v}ms
                      </li>
                    ))}
                </ul>
              )}
              <button
                type="button"
                className="mt-1 text-amber-300 underline"
                onClick={refreshSummary}
              >
                Atualizar resumo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

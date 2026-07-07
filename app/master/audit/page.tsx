'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Search, ShieldCheck } from 'lucide-react';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { useAuth } from '@/hooks/useAuth';
import { fetchJsonWithTimeout } from '@/lib/fetchJsonWithTimeout';
import { masterAuditToCsv, type MasterAuditRow } from '@/lib/masterAudit';

type MasterAuditApiResponse = {
  rows?: MasterAuditRow[];
  warnings?: string[];
  rawCount?: number;
  filteredCount?: number;
  error?: string;
};

type ViewState = 'loading' | 'error' | 'empty' | 'ready';

const EMPTY_MESSAGE = 'Nenhum log registrado ainda.';
const ERROR_MESSAGE = 'Não foi possível carregar os logs de auditoria.';
const FETCH_TIMEOUT_MS = 20_000;

export default function MasterAuditPage() {
  return (
    <MasterSuperAdminGuard>
      <MasterAuditContent />
    </MasterSuperAdminGuard>
  );
}

function MasterAuditContent() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<MasterAuditRow[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setViewState('empty');
      return;
    }

    setViewState('loading');
    setPartialWarning(null);
    setRows([]);

    try {
      const result = await fetchJsonWithTimeout<MasterAuditApiResponse>(
        `/api/master/audit?userId=${encodeURIComponent(user.id)}`,
        { credentials: 'include' },
        FETCH_TIMEOUT_MS,
      );

      if (!result.ok || !result.data) {
        setViewState('error');
        return;
      }

      const payload = result.data;

      if (payload.error) {
        setViewState('error');
        return;
      }

      const loadedRows = payload.rows || [];
      setRows(loadedRows);

      const partialWarnings = (payload.warnings || []).filter(Boolean);
      if (partialWarnings.length > 0 && loadedRows.length > 0) {
        setPartialWarning(partialWarnings.join(' · '));
      }

      setViewState(loadedRows.length === 0 ? 'empty' : 'ready');
    } catch {
      setViewState('error');
      setRows([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    void loadData();
  }, [authLoading, loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.user_name.toLowerCase().includes(q) ||
        row.action.toLowerCase().includes(q) ||
        row.company_name.toLowerCase().includes(q) ||
        row.details.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const exportCsv = () => {
    const blob = new Blob([`\uFEFF${masterAuditToCsv(filtered)}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sv-lotes-auditoria-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading || viewState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-[var(--color-primary)]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Auditoria</h1>
            <p className="text-sm text-slate-500">
              Ações administrativas na plataforma SaaS
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={viewState !== 'ready'}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-40"
        >
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
      </header>

      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por usuário, ação ou empresa..."
          disabled={viewState !== 'ready'}
          className="w-full h-10 bg-[var(--color-surface)]/80 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white disabled:opacity-50"
        />
      </div>

      {partialWarning && viewState === 'ready' ? (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {partialWarning}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-left text-sm table-fixed min-w-0">
          <thead className="bg-[var(--color-surface)]/80 text-slate-500 text-xs uppercase">
            <tr>
              <th className="p-3 w-[160px]">Data</th>
              <th className="p-3 w-[140px]">Usuário</th>
              <th className="p-3 w-[180px]">Ação</th>
              <th className="p-3 w-[160px]">Empresa</th>
              <th className="p-3">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {viewState === 'error' ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-amber-200">
                  <p>{ERROR_MESSAGE}</p>
                </td>
              </tr>
            ) : viewState === 'empty' || filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  <p>{viewState === 'empty' ? EMPTY_MESSAGE : 'Nenhum resultado para a busca.'}</p>
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3 text-slate-400 whitespace-nowrap">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString('pt-BR')
                      : '—'}
                  </td>
                  <td className="p-3 text-slate-200 truncate">{row.user_name}</td>
                  <td className="p-3 text-slate-200 truncate">{row.action}</td>
                  <td className="p-3 text-slate-300 truncate">{row.company_name}</td>
                  <td className="p-3 text-slate-400 truncate">{row.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

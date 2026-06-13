'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Search, ShieldCheck } from 'lucide-react';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  isMasterAuditEntry,
  mapAuditLogRow,
  masterAuditToCsv,
  type MasterAuditRow,
} from '@/lib/masterAudit';

export default function MasterAuditPage() {
  return (
    <MasterSuperAdminGuard>
      <MasterAuditContent />
    </MasterSuperAdminGuard>
  );
}

function MasterAuditContent() {
  const { user } = useAuth();
  const [rows, setRows] = useState<MasterAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: logs, error: logErr }, { data: companies }, { data: users }] =
        await Promise.all([
          supabase
            .from('audit_logs')
            .select('id, action, module, description, details, created_at, tenant_id, user_id')
            .order('created_at', { ascending: false })
            .limit(500),
          supabase.from('companies').select('id, name'),
          supabase.from('users').select('id, name, email'),
        ]);

      if (logErr) throw logErr;

      const companyNames = Object.fromEntries(
        (companies || []).map((c) => [c.id, c.name || '—']),
      );
      const userNames = Object.fromEntries(
        (users || []).map((u) => [u.id, u.name || u.email || 'Usuário']),
      );

      const mapped = (logs || [])
        .filter(isMasterAuditEntry)
        .map((row) => mapAuditLogRow(row, companyNames, userNames));

      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar auditoria');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  if (loading) {
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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-sm text-slate-200 hover:bg-white/5"
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
          className="w-full h-10 bg-[var(--color-surface)]/80 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white"
        />
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  Nenhum registro de auditoria encontrado.
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

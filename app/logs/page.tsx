'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ScrollText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { isPlatformAdmin } from '@/lib/rls';
import { supabase } from '@/lib/supabase';

type AuditRow = {
  id: string;
  action?: string | null;
  module?: string | null;
  description?: string | null;
  created_at?: string | null;
  tenant_id?: string | null;
};

export default function MasterLogsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isPlatformAdmin(user.role)) {
      router.push('/dashboard');
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('audit_logs')
        .select('id, action, module, description, created_at, tenant_id')
        .order('created_at', { ascending: false })
        .limit(100);

      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows(data ?? []);
      }
      setLoading(false);
    }

    load();
  }, [authLoading, user, router]);

  if (authLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8">
      <header className="mb-6 flex items-center gap-3">
        <ScrollText className="w-7 h-7 text-[var(--color-primary)]" />
        <div>
          <h1 className="text-2xl font-bold text-white">Logs de auditoria</h1>
          <p className="text-sm text-slate-500">Últimos 100 registros — Supabase audit_logs</p>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-slate-500 text-sm">Nenhum log registrado ainda.</p>
      ) : (
        <div className="rounded-xl border border-white/10 sv-table-scroll overflow-hidden">
          <table className="w-full text-left text-sm table-fixed min-w-0">
            <thead className="bg-[var(--color-surface)]/80 text-slate-500 text-xs uppercase">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Módulo</th>
                <th className="p-3">Ação</th>
                <th className="p-3">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3 text-slate-400 whitespace-nowrap">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleString('pt-BR')
                      : '—'}
                  </td>
                  <td className="p-3 text-slate-300">{r.module || '—'}</td>
                  <td className="p-3 text-slate-300">{r.action || '—'}</td>
                  <td className="p-3 text-slate-400 max-w-0 truncate">{r.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

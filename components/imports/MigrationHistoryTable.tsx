'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getMigrationHistoryColumns } from '@/lib/imports/services/migrationHistory';
import type { MigrationHistoryRow } from '@/lib/imports/types';

export function MigrationHistoryTable() {
  const { user } = useAuth();
  const columns = getMigrationHistoryColumns();
  const [rows, setRows] = useState<MigrationHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeTenantId = user?.tenant_id || user?.company_id || null;

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = activeTenantId
        ? `?activeTenantId=${encodeURIComponent(activeTenantId)}`
        : '';
      const response = await fetch(`/api/data-migration/history${query}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Erro ao carregar histórico.');
      }
      setRows(payload.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar histórico.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <div
      className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden"
      data-testid="migration-history-table"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[640px]">
          <thead className="bg-[var(--bg-main)]/60 border-b border-[var(--border-color)]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-muted)]"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-[var(--text-muted)] text-sm"
                >
                  Carregando histórico…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-red-400 text-sm"
                >
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-[var(--text-muted)] text-sm"
                >
                  Nenhuma migração registrada ainda.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-[var(--border-color)] hover:bg-[var(--bg-card-alt)]"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-[var(--text-secondary)]">
                      {col.key === 'date'
                        ? new Date(String(row[col.key] ?? '')).toLocaleString('pt-BR')
                        : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

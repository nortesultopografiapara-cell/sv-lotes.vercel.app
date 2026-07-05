'use client';

import { listMigrationHistory, getMigrationHistoryColumns } from '@/lib/imports/services/migrationHistory';

export function MigrationHistoryTable() {
  const rows = listMigrationHistory();
  const columns = getMigrationHistoryColumns();

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
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-[var(--text-muted)] text-sm"
                >
                  Nenhuma migração registrada ainda. O histórico será preenchido quando a
                  importação for habilitada.
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
                      {String(row[col.key] ?? '—')}
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

'use client';

import { Download, Eye, Loader2, MapPin, Trash2 } from 'lucide-react';
import type { LegacyContractListItem } from '@/lib/legacy-contracts/types';

type LegacyContractsTableProps = {
  items: LegacyContractListItem[];
  loading: boolean;
  canManage: boolean;
  deletingId: string | null;
  downloadingId?: string | null;
  onView: (item: LegacyContractListItem) => void;
  onDownload: (item: LegacyContractListItem) => void;
  onDelete: (item: LegacyContractListItem) => void;
};

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

function formatLinkType(linkType: string): string {
  return linkType === 'manual' ? 'Manual' : 'Automático';
}

export function LegacyContractsTable({
  items,
  loading,
  canManage,
  deletingId,
  downloadingId = null,
  onView,
  onDownload,
  onDelete,
}: LegacyContractsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        Carregando contratos antigos…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-[var(--border-color)] py-16 text-center text-sm text-[var(--text-muted)]"
        data-testid="legacy-contracts-empty"
      >
        Nenhum contrato antigo encontrado para os filtros informados.
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]"
      data-testid="legacy-contracts-table"
    >
      <table className="min-w-full text-sm">
        <thead className="bg-[var(--bg-main)] text-[var(--text-muted)]">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Empreendimento</th>
            <th className="px-4 py-3 text-left font-medium">Quadra</th>
            <th className="px-4 py-3 text-left font-medium">Lote</th>
            <th className="px-4 py-3 text-left font-medium">Cliente</th>
            <th className="px-4 py-3 text-left font-medium">Arquivo</th>
            <th className="px-4 py-3 text-left font-medium">Vínculo</th>
            <th className="px-4 py-3 text-left font-medium">Importação</th>
            <th className="px-4 py-3 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-t border-[var(--border-color)] hover:bg-[var(--bg-main)]/50"
            >
              <td className="px-4 py-3 text-[var(--text-primary)]">
                {item.project_name || '—'}
              </td>
              <td className="px-4 py-3">{item.quadra || '—'}</td>
              <td className="px-4 py-3">{item.lote || '—'}</td>
              <td className="px-4 py-3">{item.customer_name || '—'}</td>
              <td className="px-4 py-3 break-all max-w-[220px]">{item.original_file_name}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    item.link_type === 'manual'
                      ? 'bg-sky-500/15 text-sky-300'
                      : 'bg-emerald-500/15 text-emerald-300'
                  }`}
                >
                  {formatLinkType(item.link_type)}
                </span>
              </td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">
                {formatDate(item.created_at)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    title="Visualizar PDF"
                    onClick={() => onView(item)}
                    className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-main)]"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Baixar PDF"
                    disabled={downloadingId === item.id}
                    onClick={() => onDownload(item)}
                    className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-main)] disabled:opacity-50"
                  >
                    {downloadingId === item.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                  {item.sale_id ? (
                    <a
                      href={`/contracts?saleId=${encodeURIComponent(item.sale_id)}`}
                      title="Abrir venda vinculada"
                      className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-main)]"
                    >
                      <MapPin className="w-4 h-4" />
                    </a>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      title="Arquivar contrato"
                      disabled={deletingId === item.id}
                      onClick={() => onDelete(item)}
                      className="rounded-lg p-2 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

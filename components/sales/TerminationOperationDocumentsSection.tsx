'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileText, Loader2 } from 'lucide-react';
import {
  buildTerminationOperationDocumentRows,
  terminationDocumentMetaHref,
  type TerminationOperationDocumentRow,
} from '@/lib/saleDocuments';

type Props = {
  saleId: string | null | undefined;
  tone?: 'light' | 'dark';
};

function formatGeneratedAt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

function openHref(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer');
}

export function TerminationOperationDocumentsSection({ saleId, tone = 'light' }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    documentNumber: string | null;
    generatedAt: string | null;
    signedArtifactAvailable: boolean;
  } | null>(null);

  useEffect(() => {
    const id = String(saleId || '').trim();
    if (!id) {
      setMeta(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(terminationDocumentMetaHref(id), { credentials: 'include' });
        const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.status === 404) {
          if (!cancelled) setMeta(null);
          return;
        }
        if (!res.ok) {
          throw new Error(
            (typeof payload.error === 'string' && payload.error) ||
              'Não foi possível carregar os documentos da operação.',
          );
        }
        if (!cancelled) {
          setMeta({
            documentNumber:
              typeof payload.documentNumber === 'string' ? payload.documentNumber : null,
            generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : null,
            signedArtifactAvailable: Boolean(payload.signedArtifactAvailable),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setMeta(null);
          setError(err instanceof Error ? err.message : 'Erro ao carregar o termo.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  const rows = useMemo<TerminationOperationDocumentRow[]>(() => {
    const id = String(saleId || '').trim();
    if (!id || !meta) return [];
    return buildTerminationOperationDocumentRows({
      saleId: id,
      documentNumber: meta.documentNumber,
      generatedAt: meta.generatedAt,
      signedArtifactAvailable: meta.signedArtifactAvailable,
    });
  }, [meta, saleId]);

  if (!saleId) return null;
  if (!loading && !error && !meta) return null;

  const dark = tone === 'dark';
  const box = dark
    ? 'rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4'
    : 'rounded-lg border border-slate-200 bg-slate-50 p-4';
  const titleCls = dark
    ? 'text-sm font-bold text-[var(--text-primary)]'
    : 'text-sm font-bold text-gray-900';
  const muted = dark ? 'text-[var(--text-muted)]' : 'text-slate-500';
  const rowBg = dark ? 'bg-[var(--bg-card)] border-[var(--border-color)]' : 'bg-white border-gray-200';
  const nameCls = dark ? 'text-[var(--text-primary)]' : 'text-gray-900';
  const actionCls = dark
    ? 'text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10'
    : 'text-blue-700 hover:bg-blue-50';
  const originalActionCls = dark
    ? 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'
    : 'text-gray-600 hover:bg-gray-50';

  return (
    <section className={box}>
      <div className="mb-3">
        <h4 className={`${titleCls} flex items-center gap-2`}>
          <FileText className="h-4 w-4" />
          Documentos da Operação
        </h4>
        <p className={`mt-1 text-[11px] ${muted}`}>
          Termo de Desistência da venda encerrada. O original permanece arquivado;
          a versão assinada é a preferencial.
        </p>
      </div>
      {loading ? (
        <div className={`flex items-center gap-2 text-xs ${muted}`}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando documentos da operação…
        </div>
      ) : error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.role} className={`rounded-md border px-3 py-2 ${rowBg}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${nameCls}`}>{row.label}</p>
                  <p className={`mt-0.5 text-[11px] ${muted}`}>
                    {row.documentNumber || 'TD-…'} · {formatGeneratedAt(row.generatedAt)} ·{' '}
                    {row.statusLabel}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openHref(row.viewHref)}
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold ${
                      row.role === 'signed' ? actionCls : originalActionCls
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {row.role === 'signed' ? 'Visualizar documento assinado' : 'Visualizar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openHref(row.downloadHref)}
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold ${
                      row.role === 'signed' ? actionCls : originalActionCls
                    }`}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {row.role === 'signed' ? 'Baixar PDF assinado' : 'Baixar PDF'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

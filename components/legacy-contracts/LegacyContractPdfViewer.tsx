'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, Eye, Loader2, MapPin, Trash2, X } from 'lucide-react';

type LegacyContractPdfViewerProps = {
  open: boolean;
  documentId: string | null;
  fileName: string;
  onClose: () => void;
};

export function LegacyContractPdfViewer({
  open,
  documentId,
  fileName,
  onClose,
}: LegacyContractPdfViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !documentId) {
      setPdfUrl(null);
      setError('');
      return;
    }

    let cancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(
          `/api/legacy-contracts/${encodeURIComponent(documentId)}/pdf?format=json`,
        );
        const payload = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) {
          throw new Error(
            (typeof payload.error === 'string' && payload.error) ||
              'Não foi possível carregar o PDF.',
          );
        }
        const url = typeof payload.url === 'string' ? payload.url : '';
        if (!url) throw new Error('URL do PDF indisponível.');
        if (!cancelled) setPdfUrl(url);
      } catch (err) {
        if (!cancelled) {
          setPdfUrl(null);
          setError(err instanceof Error ? err.message : 'Erro ao carregar PDF.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
    };
  }, [open, documentId]);

  if (!open) return null;

  const handleDownload = async () => {
    if (!documentId) return;
    try {
      const response = await fetch(
        `/api/legacy-contracts/${encodeURIComponent(documentId)}/pdf?format=json`,
      );
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        throw new Error(
          (typeof payload.error === 'string' && payload.error) ||
            'Não foi possível baixar o PDF.',
        );
      }
      const url = typeof payload.url === 'string' ? payload.url : '';
      if (!url) throw new Error('URL do PDF indisponível.');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName || 'contrato-antigo.pdf';
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.click();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível baixar o PDF.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="legacy-contract-pdf-viewer"
    >
      <div className="flex h-[90vh] w-full max-w-5xl flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="min-w-0 pr-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {fileName || 'Contrato antigo'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDownload()}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar
            </button>
            {pdfUrl ? (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Nova aba
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-main)]"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-[var(--bg-main)]">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando PDF…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              title={fileName || 'Contrato antigo'}
              src={pdfUrl}
              className="h-full w-full border-0"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

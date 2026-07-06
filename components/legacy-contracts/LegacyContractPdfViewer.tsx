'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import {
  fetchLegacyContractPdfAccess,
  openLegacyContractPdfUrl,
} from '@/lib/legacy-contracts/pdfClient';

type LegacyContractPdfViewerProps = {
  open: boolean;
  documentId: string | null;
  fileName: string;
  activeTenantId: string | null;
  onClose: () => void;
};

export function LegacyContractPdfViewer({
  open,
  documentId,
  fileName,
  activeTenantId,
  onClose,
}: LegacyContractPdfViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [embedBlocked, setEmbedBlocked] = useState(false);

  const loadPdf = useCallback(async () => {
    if (!documentId) return;

    setLoading(true);
    setError('');
    setPdfUrl(null);
    setEmbedBlocked(false);

    try {
      const access = await fetchLegacyContractPdfAccess(documentId, activeTenantId);
      setPdfUrl(access.url);
    } catch (err) {
      setPdfUrl(null);
      setError(err instanceof Error ? err.message : 'Erro ao carregar PDF.');
    } finally {
      setLoading(false);
    }
  }, [documentId, activeTenantId]);

  useEffect(() => {
    if (!open || !documentId) {
      setPdfUrl(null);
      setError('');
      setEmbedBlocked(false);
      return;
    }

    void loadPdf();
  }, [open, documentId, reloadKey, loadPdf]);

  const handleDownload = async () => {
    if (!documentId) return;

    setDownloading(true);
    try {
      const access = await fetchLegacyContractPdfAccess(documentId, activeTenantId);
      openLegacyContractPdfUrl(access.url, access.fileName || fileName || 'contrato-antigo.pdf');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível baixar o PDF.');
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenNewTab = () => {
    if (pdfUrl) {
      openLegacyContractPdfUrl(pdfUrl, fileName || 'contrato-antigo.pdf');
      return;
    }
    void handleDownload();
  };

  if (!open) return null;

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
              disabled={downloading || !documentId}
              onClick={() => void handleDownload()}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Baixar PDF
            </button>
            {(pdfUrl || documentId) && !loading ? (
              <button
                type="button"
                onClick={handleOpenNewTab}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Nova aba
              </button>
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
            <div
              className="flex h-full items-center justify-center gap-2 text-sm text-[var(--text-muted)]"
              data-testid="legacy-contract-pdf-loading"
            >
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando PDF…
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-sm text-red-300" data-testid="legacy-contract-pdf-error">
                {error}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setReloadKey((prev) => prev + 1)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]"
                >
                  <RefreshCw className="w-4 h-4" />
                  Tentar novamente
                </button>
                <button
                  type="button"
                  disabled={downloading || !documentId}
                  onClick={() => void handleDownload()}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] disabled:opacity-60"
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Baixar PDF
                </button>
              </div>
            </div>
          ) : pdfUrl ? (
            <div className="flex h-full flex-col">
              {embedBlocked ? (
                <div className="border-b border-[var(--border-color)] bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
                  O navegador pode bloquear a visualização embutida. Use &quot;Nova aba&quot; para abrir o
                  PDF.
                </div>
              ) : null}
              <iframe
                title={fileName || 'Contrato antigo'}
                src={pdfUrl}
                className="h-full w-full flex-1 border-0"
                onLoad={() => setEmbedBlocked(false)}
                onError={() => setEmbedBlocked(true)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

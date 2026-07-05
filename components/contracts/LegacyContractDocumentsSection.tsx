'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FileArchive, Loader2 } from 'lucide-react';
import type { LegacyContractDocumentView } from '@/lib/legacyContractDocumentService';

type LegacyContractDocumentsSectionProps = {
  saleId: string | null | undefined;
};

function formatLegacyContractDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
}

function formatLegacyContractStatus(status: string): string {
  const normalized = String(status || '').trim().toUpperCase();
  const labels: Record<string, string> = {
    ASSINADO: 'Assinado',
    PENDENTE: 'Pendente',
    CANCELADO: 'Cancelado',
    QUITADO: 'Quitado',
    ANTIGO: 'Antigo',
  };
  return labels[normalized] || status || '—';
}

function LegacyContractDocumentPanel({ saleId }: { saleId: string }) {
  const [document, setDocument] = useState<LegacyContractDocumentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingPdf, setOpeningPdf] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/sales/${encodeURIComponent(saleId)}/legacy-contract`);
        const payload = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) {
          throw new Error(
            (typeof payload.error === 'string' && payload.error) ||
              'Erro ao carregar contrato antigo.',
          );
        }
        if (!cancelled) {
          setDocument((payload.document as LegacyContractDocumentView | null) ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setDocument(null);
          setError(err instanceof Error ? err.message : 'Erro ao carregar contrato antigo.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [saleId]);

  const handleOpenPdf = async () => {
    setOpeningPdf(true);
    try {
      const response = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/legacy-contract/pdf?format=json`,
      );
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        throw new Error(
          (typeof payload.error === 'string' && payload.error) ||
            'Não foi possível abrir o PDF.',
        );
      }
      const url = typeof payload.url === 'string' ? payload.url : '';
      if (!url) throw new Error('URL do PDF indisponível.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível abrir o PDF.');
    } finally {
      setOpeningPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando contrato antigo…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (!document) {
    return (
      <div
        className="text-center py-8 border-2 border-dashed border-[var(--border-color)] rounded-xl text-[var(--text-muted)]"
        data-testid="legacy-contract-empty"
      >
        <FileArchive className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>Nenhum contrato antigo anexado.</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4"
      data-testid="legacy-contract-document-card"
    >
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">
            Número do contrato antigo
          </dt>
          <dd className="font-medium text-[var(--text-primary)]">
            {document.contract_number || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">
            Data do contrato
          </dt>
          <dd className="font-medium text-[var(--text-primary)]">
            {formatLegacyContractDate(document.contract_date)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">
            Status
          </dt>
          <dd className="font-medium text-[var(--text-primary)]">
            {formatLegacyContractStatus(document.status)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">
            Nome do arquivo
          </dt>
          <dd className="font-medium text-[var(--text-primary)] break-all">
            {document.original_file_name || '—'}
          </dd>
        </div>
        {document.notes ? (
          <div className="sm:col-span-2">
            <dt className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-1">
              Observações
            </dt>
            <dd className="text-[var(--text-secondary)] whitespace-pre-wrap">{document.notes}</dd>
          </div>
        ) : null}
      </dl>

      <button
        type="button"
        data-testid="legacy-contract-open-pdf"
        disabled={openingPdf}
        onClick={() => void handleOpenPdf()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {openingPdf ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ExternalLink className="w-4 h-4" />
        )}
        Abrir PDF
      </button>
    </div>
  );
}

export function LegacyContractDocumentsSection({
  saleId,
}: LegacyContractDocumentsSectionProps) {
  return (
    <div
      className="mt-8 pt-8 border-t border-[var(--border-color)]"
      data-testid="legacy-contract-documents-section"
    >
      <div className="flex items-center gap-2 mb-4">
        <FileArchive className="w-5 h-5 text-[var(--text-secondary)]" />
        <h4 className="text-base font-bold text-[var(--text-primary)]">Contratos Antigos</h4>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Documentos históricos anexados via migração de dados. Separados do contrato ativo de
        assinatura eletrônica.
      </p>

      {!saleId ? (
        <div
          className="text-center py-8 border-2 border-dashed border-[var(--border-color)] rounded-xl text-[var(--text-muted)]"
          data-testid="legacy-contract-empty"
        >
          <FileArchive className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Nenhum contrato antigo anexado.</p>
        </div>
      ) : (
        <LegacyContractDocumentPanel key={saleId} saleId={saleId} />
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, PenLine, Share2 } from 'lucide-react';
import { SaleContractMultiPartyShareModal } from '@/components/contracts/SaleContractMultiPartyShareModal';
import type { SaleSignaturePartyPublicView } from '@/lib/saleContractSignaturePartyTypes';
import { terminationDocumentSignedPdfHref } from '@/lib/saleDocuments';

type SignatureView = {
  title: string;
  documentNumber: string | null;
  uiStatus: { code: string; label: string };
  canSend: boolean;
  canResend: boolean;
  signedArtifactAvailable: boolean;
  signatureStatus: string | null;
  parties: SaleSignaturePartyPublicView[];
  signUrl: string | null;
  expiresAt: string | null;
  contractNumber: string | null;
  projectName: string | null;
  quadra: string | null;
  lote: string | null;
  companyName: string | null;
};

export function TerminationDocumentSignatureActions({
  saleId,
  canDownloadOriginal,
}: {
  saleId: string;
  canDownloadOriginal: boolean;
}) {
  const [view, setView] = useState<SignatureView | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/termination-document/signature`,
        { credentials: 'include' },
      );
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.success === false) {
        throw new Error(String(json.error || 'Não foi possível carregar a assinatura.'));
      }
      setView(json as unknown as SignatureView);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar assinatura.');
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/termination-document/signature`,
        { method: 'POST', credentials: 'include' },
      );
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.success === false) {
        throw new Error(String(json.error || 'Não foi possível enviar para assinatura.'));
      }
      setView(json as unknown as SignatureView);
      setShareOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar para assinatura.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <p className="inline-flex items-center gap-2 text-xs text-emerald-800">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Carregando assinatura…
      </p>
    );
  }

  const canShare = Boolean(view?.signUrl) && (view?.canResend || view?.uiStatus.code === 'PARTIALLY_SIGNED' || view?.uiStatus.code === 'SENT');

  return (
    <>
      {view?.uiStatus ? (
        <p className="w-full text-xs text-emerald-900">
          Status da assinatura: <strong>{view.uiStatus.label}</strong>
        </p>
      ) : null}
      {view?.canSend || view?.canResend ? (
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !canDownloadOriginal}
          title={
            canDownloadOriginal
              ? 'Enviar o termo congelado para assinatura eletrônica'
              : 'Gere o PDF antes de enviar para assinatura'
          }
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
          {view?.canResend && !view?.canSend ? 'Reenviar para assinatura' : 'Enviar para assinatura'}
        </button>
      ) : null}
      {canShare ? (
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
        >
          <Share2 className="w-4 h-4" />
          Compartilhar
        </button>
      ) : null}
      {view?.signedArtifactAvailable ? (
        <a
          href={terminationDocumentSignedPdfHref(saleId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Download className="w-4 h-4" />
          Baixar documento assinado
        </a>
      ) : null}
      {error ? <p className="w-full text-xs text-red-700">{error}</p> : null}

      <SaleContractMultiPartyShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        companyName={view?.companyName || 'SV LOTES'}
        contractNumber={view?.contractNumber || view?.documentNumber || '—'}
        expiresAt={view?.expiresAt || new Date().toISOString()}
        status={(view?.signatureStatus || 'PENDING') as never}
        parties={view?.parties || []}
        projectName={view?.projectName || undefined}
        quadra={view?.quadra || undefined}
        lote={view?.lote || undefined}
        instrument="termination"
        terminationTitle={view?.title}
      />
    </>
  );
}

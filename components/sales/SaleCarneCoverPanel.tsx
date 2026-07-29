'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Eye,
  Loader2,
  Printer,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import type { SaleCarneCoverSummary } from '@/lib/finance/saleCarneCoverShared';

type SaleCarneCoverPanelProps = {
  saleId: string | null | undefined;
  disabled?: boolean;
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 break-words">{value || '—'}</p>
    </div>
  );
}

export function SaleCarneCoverPanel({ saleId, disabled = false }: SaleCarneCoverPanelProps) {
  const [summary, setSummary] = useState<SaleCarneCoverSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState('capa-carne.pdf');
  const blobUrlRef = useRef<string | null>(null);

  const revokePdfUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPdfUrl(null);
  }, []);

  const loadSummary = useCallback(async () => {
    if (!saleId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(saleId)}/carne-cover`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar capa do carnê');
      setSummary(data.summary as SaleCarneCoverSummary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => () => revokePdfUrl(), [revokePdfUrl]);

  const canAct = !disabled && !loading && !generating;

  async function generateCover() {
    if (!saleId || !summary?.canGenerate || generating) return;
    setGenerating(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch(`/api/sales/${encodeURIComponent(saleId)}/carne-cover`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao gerar PDF da capa');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/i.exec(disposition);
      const filename = match?.[1] || 'capa-carne.pdf';
      revokePdfUrl();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setPdfUrl(url);
      setPdfFilename(filename);
      setInfo('Capa gerada com sucesso.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar capa');
    } finally {
      setGenerating(false);
    }
  }

  function openPdf() {
    if (!pdfUrl) return;
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  }

  function printPdf() {
    if (!pdfUrl) return;
    const win = window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    if (!win) return;
    const trigger = () => {
      try {
        win.focus();
        win.print();
      } catch {
        // usuário imprime pelo visualizador
      }
    };
    win.addEventListener('load', trigger);
    setTimeout(trigger, 800);
  }

  function downloadPdf() {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = pdfFilename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (!saleId) {
    return (
      <div className="p-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg">
        Salve a venda para gerar a capa do carnê.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-emerald-700" />
          Capa do Carnê
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Gere a capa personalizada para acompanhar os boletos impressos desta venda.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-blue-700">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando dados da capa...
        </div>
      ) : null}

      {error ? (
        <div className="p-3 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}

      {info ? (
        <div className="p-3 text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg">
          {info}
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <SummaryRow label="Cliente" value={summary.customerName || ''} />
            <SummaryRow label="Empreendimento" value={summary.projectName || ''} />
            <SummaryRow label="Quadra" value={summary.quadra || ''} />
            <SummaryRow label="Lote" value={summary.lote || ''} />
            <SummaryRow label="Contrato" value={summary.contractNumber || ''} />
            <SummaryRow
              label="Parcelas"
              value={
                summary.installmentsCount > 0
                  ? String(summary.installmentsCount)
                  : ''
              }
            />
            <SummaryRow
              label="Empresa responsável"
              value={summary.company.legalName || ''}
            />
            <SummaryRow
              label="Telefone / E-mail"
              value={[summary.company.phoneFormatted, summary.company.email]
                .filter(Boolean)
                .join(' · ')}
            />
          </div>

          <div
            className={`p-3 text-sm rounded-lg border ${
              summary.canGenerate
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {summary.statusMessage}
          </div>

          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
              Prévia resumida
            </p>
            <div className="flex items-start gap-3">
              {summary.company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={summary.company.logoUrl}
                  alt="Logo da empresa"
                  className="w-12 h-12 object-contain rounded border border-slate-200 bg-white"
                />
              ) : (
                <div className="w-12 h-12 rounded border border-slate-200 bg-slate-100 flex items-center justify-center text-[10px] text-slate-500 text-center px-1">
                  Sem logo
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {summary.customerName || 'Cliente'}
                </p>
                <p className="text-xs text-slate-600 truncate">
                  {summary.projectName || 'Empreendimento'}
                </p>
                <p className="text-xs text-slate-500">
                  QD {summary.quadra || '—'} · LT {summary.lote || '—'} ·{' '}
                  {summary.installmentsCount} parcela(s)
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canAct || !summary.canGenerate}
              onClick={() => void generateCover()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-800"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BookOpen className="w-4 h-4" />
              )}
              {pdfUrl ? 'Gerar novamente' : 'Gerar capa do carnê'}
            </button>

            {pdfUrl ? (
              <>
                <button
                  type="button"
                  onClick={openPdf}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Eye className="w-4 h-4" />
                  Visualizar PDF
                </button>
                <button
                  type="button"
                  onClick={printPdf}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir
                </button>
                <button
                  type="button"
                  onClick={downloadPdf}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Download className="w-4 h-4" />
                  Baixar PDF
                </button>
              </>
            ) : null}

            <button
              type="button"
              disabled={!canAct}
              onClick={() => void loadSummary()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

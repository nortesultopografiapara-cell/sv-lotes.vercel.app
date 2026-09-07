'use client';

import { useCallback, useEffect, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  mapTitleTransferPreviewUserMessage,
  TITLE_TRANSFER_PREVIEW_NOTICE,
} from '@/lib/finance/saleTitleTransferPreview';
import type { TitleTransferPreviewPayload } from '@/lib/finance/saleTitleTransferPreviewService';

function money(value: number | null | undefined): string {
  return formatCurrencyBRL(Number(value) || 0) || 'R$ 0,00';
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 break-words">{value || '—'}</p>
    </div>
  );
}

export function TitleTransferPreviewPanel({
  saleId,
  onClose,
}: {
  saleId: string;
  onClose?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<TitleTransferPreviewPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/title-transfer`,
        { credentials: 'include' },
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        preview?: TitleTransferPreviewPayload;
        code?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.success || !data.preview) {
        setPayload(null);
        setError(
          mapTitleTransferPreviewUserMessage({
            status: res.status,
            code: data.code,
            message: data.message,
            error: data.error,
          }),
        );
        return;
      }
      setPayload(data.preview);
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a prévia.');
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        Carregando a situação vigente da venda…
      </section>
    );
  }

  if (error || !payload) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 space-y-2">
        <p>{error || 'Não foi possível carregar a prévia.'}</p>
        <button
          type="button"
          className="text-xs font-semibold underline"
          onClick={() => void load()}
        >
          Tentar de novo
        </button>
      </section>
    );
  }

  const { current, externalCharges, history } = payload;
  const lotLabel =
    current.property.quadra && current.property.lote
      ? `QD ${current.property.quadra} • LT ${current.property.lote}`
      : current.property.blockId;

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-sm font-semibold text-indigo-950 mb-1 inline-flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          Transferência de titularidade em etapa própria
        </p>
        <p className="text-sm text-indigo-900 leading-snug">
          O imóvel permanece o mesmo. Esta tela não chama a liberação, não torna o lote
          Disponível e não grava transferência. {TITLE_TRANSFER_PREVIEW_NOTICE}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Titular atual
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <SummaryCard label="Nome" value={current.titular.name || '—'} />
          <SummaryCard label="CPF/CNPJ" value={current.titular.document || '—'} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Imóvel</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <SummaryCard label="Empreendimento" value={current.property.projectName || '—'} />
          <SummaryCard label="Quadra/lote" value={lotLabel} />
          <SummaryCard label="block_id" value={current.property.blockId} />
          <SummaryCard label="Status do lote" value={current.property.status || '—'} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Venda</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <SummaryCard label="sale_id" value={current.saleId} />
          <SummaryCard label="Valor vigente" value={money(current.salePrice)} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contrato</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <SummaryCard label="Contrato vigente" value={current.contract.number || '—'} />
          <SummaryCard label="Número" value={current.contract.number || '—'} />
          <SummaryCard label="Status" value={current.contract.status || '—'} />
        </div>
        {current.contracts.length > 1 ? (
          <ul className="text-xs text-slate-600 space-y-1">
            {current.contracts.map((row, idx) => (
              <li key={row.id || row.number || `ct-${idx}`}>
                {row.number || row.id} · {row.status || '—'}
                {row.isCurrent ? ' · vigente' : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Financeiro vigente
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <SummaryCard label="Pago/preservado" value={money(current.finance.totalPaid)} />
          <SummaryCard label="Saldo remanescente" value={money(current.finance.remainingBalance)} />
          <SummaryCard
            label="Parcelas vigentes"
            value={String(current.finance.activeCount)}
          />
          <SummaryCard label="Pagas" value={String(current.finance.paidCount)} />
          <SummaryCard label="Pendentes" value={String(current.finance.pendingCount)} />
          <SummaryCard label="Vencidas" value={String(current.finance.overdueCount)} />
          <SummaryCard label="Futuras" value={String(current.finance.futureCount)} />
        </div>
        <p className="text-xs text-slate-500">
          Parcelas canceladas não entram nestes totais
          {current.finance.canceledCount
            ? ` (${current.finance.canceledCount} no histórico).`
            : '.'}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Cobranças externas
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <SummaryCard
            label="Provider"
            value={externalCharges.activeProvider || 'nenhum'}
          />
          <SummaryCard
            label="Pagas / preservar"
            value={String(externalCharges.paid.length)}
          />
          <SummaryCard label="Abertas" value={String(externalCharges.open.length)} />
          <SummaryCard
            label="Canceladas / reutilizáveis"
            value={String(externalCharges.cancelledReusable.length)}
          />
          <SummaryCard
            label="Não canceláveis"
            value={String(externalCharges.nonCancelable.length)}
          />
        </div>
        <p className="text-xs text-slate-500">
          Classificação local. Nenhum título Asaas/Inter será cancelado ou gerado agora.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Histórico de titularidade
        </p>
        <p className="text-sm text-slate-800">{history.notice}</p>
        {history.chain.length > 0 ? (
          <ol className="text-xs text-slate-700 space-y-1 list-decimal pl-4">
            {history.chain.map((row) => (
              <li key={row.id}>
                {row.fromCustomerName || row.fromCustomerId} →{' '}
                {row.toCustomerName || row.toCustomerId}
                {row.transferDate ? ` · ${row.transferDate}` : ''}
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {onClose ? (
        <p className="text-xs text-slate-500">
          Nenhuma alteração será gravada agora. Use Fechar para voltar ao mapa.
        </p>
      ) : null}
    </section>
  );
}

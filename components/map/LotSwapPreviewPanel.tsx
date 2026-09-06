'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Info, Loader2 } from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import type { LotSwapPreviewPayload } from '@/lib/finance/saleLotSwapPreviewService';
import { LOT_SWAP_SCHEDULE_PREVIEW_NOTICE } from '@/lib/finance/saleLotSwap';
import { mapLotSwapPreviewUserMessage } from '@/lib/finance/saleLotSwapPreview';

function money(value: number | null | undefined): string {
  return formatCurrencyBRL(Number(value) || 0) || 'R$ 0,00';
}

function signedMoney(value: number): string {
  if (value > 0) return `+ ${money(value)}`;
  if (value < 0) return `− ${money(Math.abs(value))}`;
  return money(value);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 break-words">{value || '—'}</p>
    </div>
  );
}

export function LotSwapPreviewPanel({
  saleId,
  onClose,
}: {
  saleId: string;
  onClose?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState('');
  const [toBlockId, setToBlockId] = useState('');
  const [payload, setPayload] = useState<LotSwapPreviewPayload | null>(null);

  const load = useCallback(
    async (destId?: string) => {
      const selected = String(destId || '').trim();
      if (selected) setComparing(true);
      else setLoading(true);
      setError('');
      try {
        const qs = selected ? `?toBlockId=${encodeURIComponent(selected)}` : '';
        const res = await fetch(
          `/api/sales/${encodeURIComponent(saleId)}/lot-swap${qs}`,
          { method: 'GET', credentials: 'include' },
        );
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          preview?: LotSwapPreviewPayload;
          code?: string;
          message?: string;
          error?: string;
        };
        if (!res.ok || !data.success || !data.preview) {
          throw new Error(
            mapLotSwapPreviewUserMessage({
              status: res.status,
              code: data.code,
              message: data.message,
              error: data.error,
            }),
          );
        }
        setPayload(data.preview);
        if (selected) setToBlockId(selected);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar a prévia.');
      } finally {
        setLoading(false);
        setComparing(false);
      }
    },
    [saleId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const current = payload?.current;
  const comparison = payload?.comparison;
  const originLabel = current
    ? `Q${current.origin.quadra || '—'} / L${current.origin.lote || '—'}`
    : '—';

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-sm font-semibold text-indigo-950 mb-1 inline-flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          Troca de lote — simulação (sem gravar)
        </p>
        <p className="text-sm text-indigo-900 leading-snug">
          O comprador permanece na mesma venda. Nenhum lote, parcela, contrato ou
          cobrança será alterado nesta etapa.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando venda e lotes disponíveis…
        </div>
      ) : error && !payload ? (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-3 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      ) : current ? (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Venda atual
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              <SummaryCard label="Empreendimento" value={current.projectName || '—'} />
              <SummaryCard label="Quadra / Lote" value={originLabel} />
              <SummaryCard label="Cliente" value={current.customerName || '—'} />
              <SummaryCard label="Contrato" value={current.contractNumber || '—'} />
              <SummaryCard label="Valor da venda" value={money(current.oldSalePrice)} />
              <SummaryCard label="Status da venda" value={current.saleStatus || '—'} />
              <SummaryCard
                label="Total pago"
                value={`${current.paidCount} · ${money(current.totalPaid)}`}
              />
              <SummaryCard label="Saldo atual" value={money(current.oldBalance)} />
              <SummaryCard label="Correção" value={current.correctionLabel || '—'} />
              <SummaryCard
                label="Conta financeira"
                value={current.financialAccountName || '—'}
              />
              <SummaryCard label="Corretor" value={current.brokerName || '—'} />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Selecionar novo lote
            </p>
            <p className="text-xs text-slate-500 mb-2">
              Somente lotes Disponíveis do mesmo empreendimento, sem venda e sem contrato.
              Lote Reservado ou Vendido não entra nesta lista.
            </p>
            <select
              value={toBlockId}
              onChange={(e) => {
                const next = e.target.value;
                setToBlockId(next);
                if (next) void load(next);
              }}
              className="form-input-light w-full max-w-xl px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Selecione o lote destino</option>
              {(payload?.destinations || []).map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {`Q${lot.quadra || '—'} / L${lot.lote || '—'} · ${money(lot.price)} · ${lot.status || 'Disponível'}`}
                  {lot.area != null ? ` · ${lot.area} m²` : ''}
                </option>
              ))}
            </select>
            {(payload?.destinations || []).length === 0 ? (
              <p className="mt-2 text-xs text-amber-800">
                Não há lote Disponível neste empreendimento para simular a troca.
              </p>
            ) : null}
          </div>

          {comparing ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Recalculando no servidor…
            </div>
          ) : null}

          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-3 text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          ) : null}

          {comparison ? (
            <>
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Comparativo
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                  <span>
                    Lote atual Q{current.origin.quadra || '—'} / L{current.origin.lote || '—'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-indigo-600" />
                  <span>
                    Novo lote Q{comparison.destination.quadra || '—'} / L
                    {comparison.destination.lote || '—'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <SummaryCard
                    label="Valor do lote atual"
                    value={money(comparison.financials.old_sale_price)}
                  />
                  <SummaryCard
                    label="Valor do novo lote"
                    value={money(comparison.financials.new_lot_price)}
                  />
                  <SummaryCard
                    label="Diferença de valor"
                    value={signedMoney(comparison.financials.price_difference)}
                  />
                  <SummaryCard
                    label="Total já pago"
                    value={money(comparison.financials.total_paid)}
                  />
                  <SummaryCard
                    label="Crédito aproveitável"
                    value={money(comparison.financials.transferable_credit)}
                  />
                  <SummaryCard
                    label="Saldo anterior"
                    value={money(comparison.financials.old_balance)}
                  />
                  <SummaryCard
                    label="Novo saldo após a troca"
                    value={money(comparison.financials.new_balance)}
                  />
                </div>
              </div>

              {comparison.blocked ? (
                <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-3 text-sm flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>{comparison.blockMessage}</div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Cronograma preliminar
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <SummaryCard
                      label="Parcelas futuras atuais"
                      value={String(comparison.schedule.futureInstallmentCount)}
                    />
                    <SummaryCard
                      label="Novo saldo"
                      value={money(comparison.schedule.newBalance)}
                    />
                    <SummaryCard
                      label="Valor médio estimado"
                      value={
                        comparison.schedule.estimatedAverageAmount != null
                          ? money(comparison.schedule.estimatedAverageAmount)
                          : '—'
                      }
                    />
                    <SummaryCard
                      label="Primeira data futura"
                      value={comparison.schedule.firstFutureDueDate || '—'}
                    />
                    <SummaryCard
                      label="Correção"
                      value={comparison.schedule.correctionLabel || '—'}
                    />
                    <SummaryCard
                      label="Balões existentes"
                      value={String(comparison.schedule.balloons.length)}
                    />
                  </div>
                  {comparison.schedule.balloons.length > 0 ? (
                    <ul className="text-xs text-slate-600 space-y-1">
                      {comparison.schedule.balloons.map((b) => (
                        <li key={`${b.installmentNumber}-${b.dueDate || ''}`}>
                          Parcela {b.installmentNumber}: {money(b.additionalAmount)}
                          {b.dueDate ? ` · ${b.dueDate}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-xs text-slate-500">{LOT_SWAP_SCHEDULE_PREVIEW_NOTICE}</p>
                </div>
              )}
            </>
          ) : null}
        </>
      ) : null}

      {onClose ? (
        <p className="text-xs text-slate-500">
          Nenhuma alteração será gravada agora. Use Fechar para voltar ao mapa.
        </p>
      ) : null}
    </section>
  );
}

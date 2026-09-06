'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Info, Loader2 } from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import type { LotSwapPreviewPayload } from '@/lib/finance/saleLotSwapPreviewService';
import type { LotSwapExternalChargePreview } from '@/lib/finance/saleLotSwapExternalCharges';
import {
  LOT_SWAP_EXECUTE_GENERIC_FAILURE_MESSAGE,
  mapLotSwapExecuteUserMessage,
  mapLotSwapPreviewUserMessage,
} from '@/lib/finance/saleLotSwapPreview';
import {
  LOT_SWAP_PLAN_NOTICE,
  LOT_SWAP_REASON_MIN_LENGTH,
  type LotSwapFinancialPlan,
} from '@/lib/finance/saleLotSwapPlan';
import type { LotSwapPreparedPlan } from '@/lib/finance/saleLotSwapPlanService';
import { LOT_SWAP_EXECUTE_NOTICE } from '@/lib/finance/saleLotSwapExecute';
import type { LotSwapExecutedResult } from '@/lib/finance/saleLotSwapExecuteService';

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

function PlanSummary({
  plan,
  externalCharges,
}: {
  plan: LotSwapFinancialPlan;
  externalCharges?: LotSwapExternalChargePreview | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Plano financeiro completo
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <SummaryCard label="Parcelas pagas (preservar)" value={String(plan.receipts.preserve.length)} />
        <SummaryCard label="Parcelas futuras (cancelar depois)" value={String(plan.receipts.cancel.length)} />
        <SummaryCard label="Novas parcelas planejadas" value={String(plan.receipts.create.length)} />
        <SummaryCard label="Novo saldo planejado" value={money(plan.financials.new_balance)} />
        <SummaryCard
          label="1º vencimento novo"
          value={plan.schedule.firstFutureDueDate || '—'}
        />
        <SummaryCard label="Correção" value={plan.schedule.correctionLabel || '—'} />
        <SummaryCard
          label="Conta financeira"
          value={plan.schedule.financialAccountName || '—'}
        />
        <SummaryCard label="Balões (snapshot)" value={String(plan.balloons.length)} />
        <SummaryCard
          label="Cobranças Asaas abertas"
          value={String(plan.charges.asaasOpen.length)}
        />
        <SummaryCard
          label="Cobranças Asaas pagas"
          value={String(plan.charges.asaasPaid.length)}
        />
        <SummaryCard
          label="Cobranças Inter abertas"
          value={String(plan.charges.interOpen.length)}
        />
        <SummaryCard
          label="Cobranças Inter pagas"
          value={String(plan.charges.interPaid.length)}
        />
      </div>
      {plan.receipts.create.length > 0 ? (
        <ul className="text-xs text-slate-600 space-y-1">
          {plan.receipts.create.map((item) => (
            <li key={`new-${item.installmentNumber}`}>
              Nova parcela {item.installmentNumber}: {money(item.amount)}
              {item.dueDate ? ` · ${item.dueDate}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-slate-500">{plan.notice}</p>
      {externalCharges ? (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
            Cobranças externas (Fase 5A — só classificação)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <SummaryCard
              label="Provider ativo"
              value={externalCharges.activeProvider || 'nenhum'}
            />
            <SummaryCard
              label="Pagas (preservar)"
              value={String(externalCharges.paid.length)}
            />
            <SummaryCard
              label="Canceláveis (Fase 5B)"
              value={String(externalCharges.wouldCancel.length)}
            />
            <SummaryCard
              label="Não canceláveis"
              value={String(externalCharges.nonCancelable.length)}
            />
            <SummaryCard
              label="Novas a gerar (5B)"
              value={String(externalCharges.wouldGenerate.length)}
            />
            <SummaryCard
              label="Status 5A"
              value={externalCharges.phase5Status}
            />
          </div>
          {externalCharges.wouldBlock ? (
            <p className="text-xs text-amber-800">
              {externalCharges.blockMessage}
            </p>
          ) : (
            <p className="text-xs text-slate-500">{externalCharges.notice}</p>
          )}
        </div>
      ) : null}
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
  const [executeError, setExecuteError] = useState('');
  const executeErrorRef = useRef<HTMLDivElement | null>(null);
  const [toBlockId, setToBlockId] = useState('');
  const [payload, setPayload] = useState<LotSwapPreviewPayload | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [prepared, setPrepared] = useState<LotSwapPreparedPlan | null>(null);
  const [ackExecute, setAckExecute] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executed, setExecuted] = useState<LotSwapExecutedResult | null>(null);

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

  useEffect(() => {
    if (!executeError) return;
    executeErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [executeError]);

  const confirmPlan = useCallback(async () => {
    setConfirming(true);
    setError('');
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/lot-swap/plan`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toBlockId,
            reason,
            execute: false,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        prepared?: LotSwapPreparedPlan;
        code?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.success || !data.prepared) {
        throw new Error(
          mapLotSwapPreviewUserMessage({
            status: res.status,
            code: data.code,
            message: data.message,
            error: data.error,
          }),
        );
      }
      setPrepared(data.prepared);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar o plano.');
    } finally {
      setConfirming(false);
    }
  }, [reason, saleId, toBlockId]);

  const executeSwap = useCallback(async () => {
    if (!prepared?.swapId) return;
    setExecuting(true);
    setExecuteError('');
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/lot-swap/execute`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            swapId: prepared.swapId,
            idempotencyKey: prepared.idempotencyKey,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        executed?: LotSwapExecutedResult;
        code?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.success || !data.executed) {
        throw new Error(
          mapLotSwapExecuteUserMessage({
            status: res.status,
            code: data.code,
            message: data.message,
            error: data.error,
          }),
        );
      }
      setExecuted(data.executed);
    } catch (err) {
      setExecuteError(
        err instanceof Error ? err.message : LOT_SWAP_EXECUTE_GENERIC_FAILURE_MESSAGE,
      );
    } finally {
      setExecuting(false);
    }
  }, [prepared, saleId]);

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
          Troca de lote — mesma venda, nova unidade
        </p>
        <p className="text-sm text-indigo-900 leading-snug">
          O comprador permanece na mesma venda. Confirmar o plano grava somente
          o registro CALCULATED. Nenhum lote, parcela, contrato ou cobrança será
          alterado nesta etapa. A execução atômica só ocorre depois, no botão
          Executar troca de lote. Cobranças Asaas/Inter não são alteradas nesta
          fase.
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
                setPrepared(null);
                setExecuted(null);
                setAckExecute(false);
                setExecuteError('');
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
                <>
                  <PlanSummary
                    plan={comparison.plan}
                    externalCharges={comparison.externalCharges}
                  />
                  {prepared ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 space-y-3">
                      <div className="space-y-1">
                        <p className="font-semibold">Plano confirmado (CALCULATED)</p>
                        <p>Registro {prepared.swapId}. A venda ainda não foi mutada.</p>
                        <p className="text-xs">Motivo: {prepared.reason}.</p>
                      </div>
                      {executed ? (
                        <div className="rounded-lg border border-emerald-300 bg-white p-3 space-y-1 text-emerald-950">
                          <p className="font-semibold">Troca executada</p>
                          <p className="text-xs">
                            A mesma venda {executed.saleId} permanece. Contrato
                            vigente: {executed.toContractNumber || executed.toContractId}.
                          </p>
                          {executed.reused ? (
                            <p className="text-xs">Requisição repetida: a troca não foi executada de novo.</p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3 text-amber-950">
                          <p className="text-xs leading-snug">{LOT_SWAP_EXECUTE_NOTICE}</p>
                          <label className="flex items-start gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={ackExecute}
                              onChange={(e) => setAckExecute(e.target.checked)}
                            />
                            <span>
                              Entendo que a origem volta para Disponível, o destino
                              fica Vendido, as parcelas futuras são substituídas e
                              um novo contrato vigente é criado. O contrato anterior
                              permanece no histórico.
                            </span>
                          </label>
                          {executeError ? (
                            <div
                              ref={executeErrorRef}
                              role="alert"
                              className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-3 text-sm flex gap-2"
                            >
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                              <div>{executeError}</div>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            disabled={executing || !ackExecute}
                            onClick={() => void executeSwap()}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
                          >
                            {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Executar troca de lote
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">
                          Motivo da troca <span className="text-red-500">*</span>
                        </span>
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={3}
                          className="form-input-light mt-1 w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Descreva o motivo da substituição de unidade."
                        />
                      </label>
                      <button
                        type="button"
                        disabled={
                          confirming ||
                          reason.trim().length < LOT_SWAP_REASON_MIN_LENGTH
                        }
                        onClick={() => void confirmPlan()}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                      >
                        {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Confirmar plano (sem executar)
                      </button>
                      <p className="text-xs text-slate-500">{LOT_SWAP_PLAN_NOTICE}</p>
                    </div>
                  )}
                </>
              )}
            </>
          ) : null}
        </>
      ) : null}

      {onClose ? (
        <p className="text-xs text-slate-500">
          {executed
            ? 'Troca concluída nesta venda. Use Fechar e recarregue o mapa para ver os lotes atualizados.'
            : prepared
            ? 'Plano congelado. A execução atômica só ocorre no botão Executar troca de lote. Cobranças Asaas/Inter ficam para a Fase 5.'
            : 'A confirmação grava só o plano CALCULATED. Use Fechar para voltar ao mapa.'}
        </p>
      ) : null}
    </section>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Info, Loader2, Search } from 'lucide-react';
import { extractCurrencyDraft, formatCurrencyBRL } from '@/lib/currencyBrl';
import { formatCpfCnpj } from '@/lib/inputMasks';
import {
  mapTitleTransferPreviewUserMessage,
  TITLE_TRANSFER_PREVIEW_NOTICE,
} from '@/lib/finance/saleTitleTransferPreview';
import {
  TITLE_TRANSFER_FUTURE_EXECUTION_INTRO,
  TITLE_TRANSFER_OPEN_CHARGES_NOTICE,
  type TitleTransferAssigneeSearchRow,
} from '@/lib/finance/saleTitleTransferPlan';
import { TITLE_TRANSFER_EXECUTE_CONFIRM_TEXT } from '@/lib/finance/saleTitleTransferExecute';
import type { TitleTransferPlanPayload } from '@/lib/finance/saleTitleTransferPlanService';
import type { TitleTransferPreviewPayload } from '@/lib/finance/saleTitleTransferPreviewService';

function money(value: number | null | undefined): string {
  return formatCurrencyBRL(Number(value) || 0) || 'R$ 0,00';
}

function todayIsoSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatDueDate(iso?: string | null): string {
  const d = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'sem vencimento';
  const [year, month, day] = d.split('-');
  return `${day}/${month}/${year}`;
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
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TitleTransferAssigneeSearchRow[]>([]);
  const [selected, setSelected] = useState<TitleTransferAssigneeSearchRow | null>(null);
  const [transferDate, setTransferDate] = useState(todayIsoSaoPaulo);
  const [agioDraft, setAgioDraft] = useState('');
  const [notes, setNotes] = useState('');
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  const [plan, setPlan] = useState<TitleTransferPlanPayload | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeError, setExecuteError] = useState('');
  const [executeDone, setExecuteDone] = useState(false);
  const [executedSummary, setExecutedSummary] = useState<{
    fromName: string;
    fromDocument: string;
    toName: string;
    toDocument: string;
    lot: string;
    paid: number;
    balance: number;
    fromContract: string;
    toContract: string;
  } | null>(null);
  const [resolveOrphansLoading, setResolveOrphansLoading] = useState(false);
  const [resolveOrphansError, setResolveOrphansError] = useState('');

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

  useEffect(() => {
    if (!payload) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/sales/${encodeURIComponent(saleId)}/title-transfer/customers?q=${encodeURIComponent(q)}`,
          { credentials: 'include' },
        );
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          customers?: TitleTransferAssigneeSearchRow[];
        };
        if (cancelled) return;
        setResults(res.ok && data.success ? data.customers || [] : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [payload, query, saleId]);

  async function mountPlan() {
    if (!payload || !selected || selected.isCurrentTitular) return;
    setPlanLoading(true);
    setPlanError('');
    setPlan(null);
    setConfirmChecked(false);
    setExecuteDone(false);
    setExecuteError('');
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/title-transfer/plan`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toCustomerId: selected.id,
            transferDate,
            declaredAgioAmount: agioDraft,
            notes,
            expectedContractId: payload.current.contract.id,
            expectedFromCustomerId: payload.current.titular.id,
            expectedBlockId: payload.current.property.blockId,
            persistTransfer: false,
            execute: false,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        plan?: TitleTransferPlanPayload;
        code?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.success || !data.plan) {
        setPlanError(
          mapTitleTransferPreviewUserMessage({
            status: res.status,
            code: data.code,
            message: data.message,
            error: data.error,
          }),
        );
        return;
      }
      setPlan(data.plan);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Não foi possível montar o preview A → B.');
    } finally {
      setPlanLoading(false);
    }
  }

  async function executeTransfer() {
    if (
      !payload ||
      !selected ||
      !plan ||
      !confirmChecked ||
      selected.isCurrentTitular ||
      payload.externalCharges.blockCode ||
      payload.externalCharges.orphans.length > 0
    ) {
      return;
    }
    setExecuteLoading(true);
    setExecuteError('');
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/title-transfer/execute`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toCustomerId: selected.id,
            transferDate,
            declaredAgioAmount: agioDraft,
            notes,
            expectedContractId: payload.current.contract.id,
            expectedFromCustomerId: payload.current.titular.id,
            expectedBlockId: payload.current.property.blockId,
            confirmTransfer: true,
            generateCharges: false,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        code?: string;
        message?: string;
        error?: string;
        executed?: {
          local?: {
            fromContractId?: string | null;
            toContractId?: string | null;
            toContractNumber?: string | null;
          };
        };
      };
      if (!res.ok || !data.success) {
        setExecuteError(
          mapTitleTransferPreviewUserMessage({
            status: res.status,
            code: data.code,
            message: data.message,
            error: data.error,
          }),
        );
        return;
      }
      const lot =
        plan.confirmation.property.quadra && plan.confirmation.property.lote
          ? `QD ${plan.confirmation.property.quadra} • LT ${plan.confirmation.property.lote}`
          : plan.confirmation.property.blockId || payload.current.property.blockId;
      setExecutedSummary({
        fromName: plan.confirmation.from.name || '—',
        fromDocument: formatCpfCnpj(plan.confirmation.from.document) || '—',
        toName: plan.confirmation.to.name || '—',
        toDocument: formatCpfCnpj(plan.confirmation.to.document) || '—',
        lot,
        paid: plan.confirmation.finance.totalPaid,
        balance: plan.confirmation.finance.remainingBalance,
        fromContract:
          payload.current.contract.number ||
          data.executed?.local?.fromContractId ||
          '—',
        toContract:
          data.executed?.local?.toContractNumber ||
          data.executed?.local?.toContractId ||
          '—',
      });
      setExecuteDone(true);
    } catch (err) {
      setExecuteError(
        err instanceof Error ? err.message : 'Não foi possível executar a transferência.',
      );
    } finally {
      setExecuteLoading(false);
    }
  }

  async function resolveOrphanCharges() {
    if (!payload || payload.externalCharges.orphans.length === 0 || resolveOrphansLoading) {
      return;
    }
    setResolveOrphansLoading(true);
    setResolveOrphansError('');
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleId)}/title-transfer/resolve-orphans`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        code?: string;
        message?: string;
        error?: string;
        executeTransfer?: boolean;
      };
      if (data.executeTransfer) {
        setResolveOrphansError('A resolução de órfãs recusou executar a transferência.');
        return;
      }
      if (!res.ok || !data.success) {
        setResolveOrphansError(
          mapTitleTransferPreviewUserMessage({
            status: res.status,
            code: data.code,
            message: data.message,
            error: data.error,
          }),
        );
        return;
      }
    } catch (err) {
      setResolveOrphansError(
        err instanceof Error ? err.message : 'Não foi possível resolver as cobranças órfãs.',
      );
    } finally {
      await load();
      setResolveOrphansLoading(false);
    }
  }

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
  const confirmation = plan?.confirmation;
  const confirmationLot =
    confirmation && confirmation.property.quadra && confirmation.property.lote
      ? `QD ${confirmation.property.quadra} • LT ${confirmation.property.lote}`
      : confirmation?.property.blockId || lotLabel;

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
          <SummaryCard
            label="Órfãs ativas"
            value={String(externalCharges.orphans.length)}
          />
        </div>
        <p className="text-xs text-slate-500">
          Classificação local. Nenhum título Asaas/Inter será cancelado ou gerado agora,
          salvo pela ação Resolver cobranças órfãs.
        </p>
        {externalCharges.blockMessage ? (
          <p className="text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {externalCharges.blockMessage}
          </p>
        ) : null}
        {externalCharges.open.length > 0 ? (
          <p className="text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {TITLE_TRANSFER_OPEN_CHARGES_NOTICE}
          </p>
        ) : null}
        {externalCharges.orphans.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Cobranças órfãs
            </p>
            <ul className="text-sm text-slate-800 space-y-1">
              {externalCharges.orphans.map((row) => (
                <li key={row.chargeId} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  {money(row.amount)} · {formatDueDate(row.dueDate)} · {row.provider} ·{' '}
                  {row.status || 'sem situação'}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={resolveOrphansLoading || executeLoading || executeDone}
              onClick={() => void resolveOrphanCharges()}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-800 text-white text-sm font-semibold px-3 py-2 disabled:opacity-50"
            >
              {resolveOrphansLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Resolver cobranças órfãs
            </button>
            {resolveOrphansError ? (
              <p className="text-sm text-amber-800">{resolveOrphansError}</p>
            ) : null}
          </div>
        ) : null}
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

      <div className="rounded-xl border border-indigo-200 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
          Novo titular
        </p>
        <p className="text-xs text-slate-600">
          Pesquise um cliente já cadastrado nesta empresa por nome, CPF ou CNPJ.
          Não é possível selecionar o titular atual.
        </p>
        <label className="block">
          <span className="sr-only">Pesquisar cliente</span>
          <span className="relative block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPlan(null);
              }}
              placeholder="Nome, CPF ou CNPJ"
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm"
            />
          </span>
        </label>
        {searching ? (
          <p className="text-xs text-slate-500 inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Buscando…
          </p>
        ) : null}
        {results.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white max-h-48 overflow-auto">
            {results.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={row.isCurrentTitular}
                  onClick={() => {
                    setSelected(row);
                    setQuery(row.name || row.document || row.id);
                    setResults([]);
                    setPlan(null);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="font-medium text-slate-900">{row.name || 'Sem nome'}</span>
                  <span className="block text-xs text-slate-500">
                    {formatCpfCnpj(row.document) || 'sem documento'}
                    {row.isCurrentTitular ? ' · titular atual' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {selected ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <SummaryCard label="Nome/razão social" value={selected.name || '—'} />
            <SummaryCard label="CPF/CNPJ" value={formatCpfCnpj(selected.document) || '—'} />
            <SummaryCard label="Telefone" value={selected.phone || '—'} />
            <SummaryCard label="E-mail" value={selected.email || '—'} />
          </div>
        ) : null}
        <p className="text-xs text-slate-500">
          Cliente novo? Use o cadastro normal e volte a pesquisar.{' '}
          <a
            href="/customers"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-indigo-700 underline"
          >
            Cadastrar novo cliente
          </a>
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Dados da transferência
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-slate-700 space-y-1">
            <span>Data da transferência/cessão</span>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => {
                setTransferDate(e.target.value);
                setPlan(null);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-700 space-y-1">
            <span>Valor declarado do ágio (opcional)</span>
            <input
              type="text"
              inputMode="decimal"
              value={agioDraft}
              onChange={(e) => {
                setAgioDraft(extractCurrencyDraft(e.target.value));
                setPlan(null);
              }}
              onBlur={() => {
                const n = Number(String(agioDraft).replace(/\./g, '').replace(',', '.'));
                if (agioDraft.trim() && Number.isFinite(n) && n > 0) {
                  setAgioDraft(formatCurrencyBRL(n).replace(/^R\$\s?/, ''));
                }
              }}
              placeholder="R$ 0,00"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          O ágio declarado é exclusivamente documental. Não abate o saldo, não soma ao
          contrato, não cria parcela e não registra pagamento.
        </p>
        <label className="text-sm text-slate-700 space-y-1 block">
          <span>Motivo/observação</span>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setPlan(null);
            }}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={!selected || selected.isCurrentTitular || planLoading}
          onClick={() => void mountPlan()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 text-white text-sm font-semibold px-3 py-2 disabled:opacity-50"
        >
          {planLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Montar preview A → B
        </button>
        {planError ? <p className="text-sm text-amber-800">{planError}</p> : null}
      </div>

      {confirmation ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Preview A → B
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SummaryCard
              label="DE"
              value={`${confirmation.from.name || '—'} · ${formatCpfCnpj(confirmation.from.document) || '—'}`}
            />
            <SummaryCard
              label="PARA"
              value={`${confirmation.to.name || '—'} · ${formatCpfCnpj(confirmation.to.document) || '—'}`}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <SummaryCard label="Imóvel" value={confirmation.property.projectName || '—'} />
            <SummaryCard label="Quadra/lote" value={confirmationLot} />
            <SummaryCard label="Valor vigente" value={money(confirmation.salePrice)} />
            <SummaryCard label="Total já pago" value={money(confirmation.finance.totalPaid)} />
            <SummaryCard
              label="Saldo remanescente"
              value={money(confirmation.finance.remainingBalance)}
            />
            <SummaryCard label="Pagas" value={String(confirmation.finance.paidCount)} />
            <SummaryCard label="Pendentes" value={String(confirmation.finance.pendingCount)} />
            <SummaryCard label="Vencidas" value={String(confirmation.finance.overdueCount)} />
            <SummaryCard label="Futuras" value={String(confirmation.finance.futureCount)} />
            <SummaryCard
              label="Ágio declarado"
              value={
                confirmation.declaredAgioAmount
                  ? money(confirmation.declaredAgioAmount)
                  : 'não informado'
              }
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Financeiro preservado
          </p>
          <p className="text-sm font-medium text-emerald-950">
            {TITLE_TRANSFER_FUTURE_EXECUTION_INTRO}
          </p>
          <ul className="text-sm text-emerald-950 space-y-1 list-disc pl-5">
            {plan.futureExecution.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {plan.openChargesNotice ? (
            <p className="text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {plan.openChargesNotice}
            </p>
          ) : null}
          <p className="text-xs text-slate-600">
            sale_id e block_id permanecem
            {` ${plan.futureExecution.saleId} / ${plan.futureExecution.blockId}`}.
            {plan.futureExecution.previousTransferId
              ? ` Próximo elo usará previous_transfer_id ${plan.futureExecution.previousTransferId}.`
              : ' Esta será a primeira cessão da venda.'}
          </p>
        </div>
      ) : null}

      {confirmation && !executeDone ? (
        <div className="rounded-xl border border-indigo-300 bg-white p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
            Transferir titularidade
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SummaryCard
              label="DE"
              value={`${confirmation.from.name || '—'} · ${formatCpfCnpj(confirmation.from.document) || '—'}`}
            />
            <SummaryCard
              label="PARA"
              value={`${confirmation.to.name || '—'} · ${formatCpfCnpj(confirmation.to.document) || '—'}`}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <SummaryCard label="Imóvel" value={confirmationLot} />
            <SummaryCard label="Pago preservado" value={money(confirmation.finance.totalPaid)} />
            <SummaryCard label="Saldo assumido" value={money(confirmation.finance.remainingBalance)} />
            <SummaryCard
              label="Parcelas restantes"
              value={String(confirmation.finance.pendingCount)}
            />
            <SummaryCard
              label="Ágio declarado"
              value={
                confirmation.declaredAgioAmount
                  ? money(confirmation.declaredAgioAmount)
                  : 'não informado'
              }
            />
            <SummaryCard
              label="Cobranças pagas/preservar"
              value={String(payload.externalCharges.paid.length)}
            />
            <SummaryCard
              label="Cobranças abertas a cancelar"
              value={String(payload.externalCharges.open.length)}
            />
            <SummaryCard
              label="Órfãs ativas"
              value={String(payload.externalCharges.orphans.length)}
            />
          </div>
          {payload.externalCharges.blockMessage ? (
            <p className="text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {payload.externalCharges.blockMessage}
            </p>
          ) : null}
          {payload.externalCharges.orphans.length > 0 ? (
            <div className="space-y-2">
              <ul className="text-sm text-slate-800 space-y-1">
                {payload.externalCharges.orphans.map((row) => (
                  <li key={row.chargeId} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    {money(row.amount)} · {formatDueDate(row.dueDate)} · {row.provider} ·{' '}
                    {row.status || 'sem situação'}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={resolveOrphansLoading || executeLoading || executeDone}
                onClick={() => void resolveOrphanCharges()}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-800 text-white text-sm font-semibold px-3 py-2 disabled:opacity-50"
              >
                {resolveOrphansLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Resolver cobranças órfãs
              </button>
              {resolveOrphansError ? (
                <p className="text-sm text-amber-800">{resolveOrphansError}</p>
              ) : null}
            </div>
          ) : null}
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              disabled={executeDone}
            />
            <span>{TITLE_TRANSFER_EXECUTE_CONFIRM_TEXT}</span>
          </label>
          <button
            type="button"
            disabled={
              !confirmChecked ||
              executeLoading ||
              executeDone ||
              resolveOrphansLoading ||
              Boolean(payload.externalCharges.blockCode) ||
              payload.externalCharges.orphans.length > 0
            }
            onClick={() => void executeTransfer()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-800 text-white text-sm font-semibold px-3 py-2 disabled:opacity-50"
          >
            {executeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {executeDone ? 'Titularidade transferida' : 'Transferir titularidade'}
          </button>
          {executeError ? <p className="text-sm text-amber-800">{executeError}</p> : null}
        </div>
      ) : null}

      {executeDone && executedSummary ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-emerald-950">
            Transferência de titularidade concluída
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SummaryCard
              label="DE"
              value={`${executedSummary.fromName} · ${executedSummary.fromDocument}`}
            />
            <SummaryCard
              label="PARA"
              value={`${executedSummary.toName} · ${executedSummary.toDocument}`}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <SummaryCard label="Imóvel" value={executedSummary.lot} />
            <SummaryCard label="Pago preservado" value={money(executedSummary.paid)} />
            <SummaryCard label="Saldo assumido" value={money(executedSummary.balance)} />
            <SummaryCard label="Contrato antigo" value={executedSummary.fromContract} />
            <SummaryCard label="Contrato novo" value={executedSummary.toContract} />
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-lg bg-emerald-800 text-white text-sm font-semibold px-3 py-2"
            >
              Concluir
            </button>
          ) : null}
        </div>
      ) : null}

      {onClose && !executeDone ? (
        <p className="text-xs text-slate-500">
          A transferência só ocorre após marcar a ciência e confirmar Transferir
          titularidade. Use Fechar para voltar ao mapa sem executar.
        </p>
      ) : null}
    </section>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowDownCircle, ArrowUpCircle, CloudDownload, FileSpreadsheet, FileText, Plus, RefreshCw, RotateCcw, Wallet, X, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { formatSaasCurrency } from '@/lib/companyPricing';
import {
  exportSaasCashExcel,
  exportSaasCashPdf,
} from '@/lib/saasCashExport';
import {
  saasCashSourceLabel,
  saasCashTypeLabel,
  type SaasCashHiddenByMarcoSummary,
  type SaasCashMovement,
  type SaasCashSummary,
  type BackfillSaasCashResult,
} from '@/lib/saasCashMovements';
import { formatSaasCashStartAtForInput } from '@/lib/saasFinanceSettings';
import { loadSaasCashPanelView } from '@/lib/masterSaasFinanceClientLoad';
import { supabase } from '@/lib/supabase';
import { fetchJsonWithTimeout } from '@/lib/fetchJsonWithTimeout';
import { SaasCashHiddenByMarcoAlert, SaasFinanceStartAtBanner, SaasMetricCard } from './SaasPanelUi';

const MASTER_POST_TIMEOUT_MS = 120_000;

const FINANCE_START_CONFIRMATION = 'ZERAR CAIXA';

type CompanyOption = { id: string; name: string };

type Props = {
  companies?: CompanyOption[];
  showBackLink?: boolean;
};

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function formatBackfillSummary(backfill?: BackfillSaasCashResult | null): string | null {
  if (!backfill) return null;
  const parts: string[] = [];
  if (backfill.backfilled > 0) {
    parts.push(`${backfill.backfilled} cobrança(s) lançada(s) no caixa`);
  }
  if (backfill.hiddenByCashStartAt > 0) {
    parts.push(
      `${backfill.hiddenByCashStartAt} lançada(s) oculta(s) pelo marco (${formatSaasCurrency(backfill.hiddenByCashStartAtAmount)})`,
    );
  }
  if (backfill.existingButHidden > 0) {
    parts.push(
      `${backfill.existingButHidden} já existente(s) mas oculta(s) (${formatSaasCurrency(backfill.existingButHiddenAmount)})`,
    );
  }
  if (backfill.alreadyHadMovement > 0 && backfill.backfilled === 0) {
    parts.push(`${backfill.alreadyHadMovement} cobrança(s) já tinham movimentação`);
  }
  return parts.length > 0 ? parts.join('. ') + '.' : null;
}

function formatHiddenMarcoToast(hidden?: SaasCashHiddenByMarcoSummary | null): string | null {
  if (!hidden || hidden.hiddenCount <= 0) return null;
  return `${hidden.hiddenCount} movimentação(ões) no período estão ocultas pelo marco (${formatSaasCurrency(hidden.hiddenNet)} ignorados). Ajuste o marco ou reprocesse cobranças pagas.`;
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function sourceBadgeClass(source: string): string {
  switch (source) {
    case 'asaas_webhook':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'manual':
      return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    case 'asaas_transfer':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    case 'asaas_fee':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'asaas_refund':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    default:
      return 'bg-white/10 text-gray-300 border-white/10';
  }
}

export function SaasCashPanel({ companies = [], showBackLink = false }: Props) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const defaultRange = useMemo(() => currentMonthRange(), []);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [movements, setMovements] = useState<SaasCashMovement[]>([]);
  const [summary, setSummary] = useState<SaasCashSummary>({
    periodIncome: 0,
    periodExpense: 0,
    periodTransfer: 0,
    netResult: 0,
    movementCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [settingStartAt, setSettingStartAt] = useState(false);
  const [cashStartAt, setCashStartAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [hiddenByMarco, setHiddenByMarco] = useState<SaasCashHiddenByMarcoSummary | null>(null);
  const [startAtModalOpen, setStartAtModalOpen] = useState(false);
  const [startAtConfirmText, setStartAtConfirmText] = useState('');
  const [startAtMode, setStartAtMode] = useState<'now' | 'custom'>('now');
  const [customStartAt, setCustomStartAt] = useState('2026-06-01T00:00');
  const [reprocessing, setReprocessing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState({
    amount: '',
    movementDate: defaultRange.to,
    description: '',
    category: 'Receita extraordinária',
    clientName: '',
    asaasPaymentId: '',
    externalReference: '',
    paymentMethod: 'PIX',
    notes: '',
    companyId: '',
  });

  const isSuperAdmin = String(user?.role || '').toUpperCase() === 'SUPER_ADMIN';

  useEffect(() => {
    if (searchParams.get('extraordinary') === '1') {
      setManualOpen(true);
    }
  }, [searchParams]);

  const loadCash = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const view = await loadSaasCashPanelView(supabase, {
        fromDate,
        toDate,
        type: typeFilter,
        companyId: companyFilter !== 'all' ? companyFilter : undefined,
      });
      if (view.error) {
        throw new Error(view.error);
      }
      setMovements(view.movements);
      setSummary(view.summary);
      setCashStartAt(view.cashStartAt);
      setHiddenByMarco(view.hiddenByMarco);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao carregar caixa SaaS';
      setError(message);
      setMovements([]);
      setSummary({
        periodIncome: 0,
        periodExpense: 0,
        periodTransfer: 0,
        netResult: 0,
        movementCount: 0,
      });
      setCashStartAt(null);
      setHiddenByMarco(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, fromDate, toDate, typeFilter, companyFilter]);

  useEffect(() => {
    void loadCash();
  }, [loadCash]);

  useEffect(() => {
    if (!syncMessage) return;
    const timer = setTimeout(() => setSyncMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [syncMessage]);

  const handleSyncAsaas = useCallback(async () => {
    if (!user?.id || !isSuperAdmin) return;
    setSyncing(true);
    setError(null);
    setSyncMessage(null);
    try {
      const res = await fetchJsonWithTimeout(
        '/api/master/saas-cash/sync-asaas',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            fromDate,
            toDate,
            companyId: companyFilter !== 'all' ? companyFilter : undefined,
            type: typeFilter,
          }),
        },
        MASTER_POST_TIMEOUT_MS,
      );
      const body = (res.data || {}) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(res.error || String(body.error || 'Falha ao sincronizar Asaas'));
      }
      setMovements(Array.isArray(body.movements) ? body.movements : []);
      setSummary(
        body.summary || {
          periodIncome: 0,
          periodExpense: 0,
          periodTransfer: 0,
          netResult: 0,
          movementCount: 0,
        },
      );
      setCashStartAt(body.cashStartAt ? String(body.cashStartAt) : null);
      setHiddenByMarco(body.hiddenByMarco ?? null);
      const sync = body.sync || {};
      const parts = [
        `${sync.created ?? 0} nova(s)`,
        `${sync.incomeCreated ?? 0} entrada(s)`,
        `${sync.expenseCreated ?? 0} saída(s)`,
        `${sync.skippedDuplicate ?? 0} duplicada(s)`,
      ];
      if (sync.skippedBeforeStartAt) {
        parts.push(`${sync.skippedBeforeStartAt} antes do marco`);
      }
      const backfillToast = formatBackfillSummary(body.backfill);
      const hiddenToast = formatHiddenMarcoToast(body.hiddenByMarco);
      const messages = [`Asaas sincronizado: ${parts.join(', ')}.`];
      if (backfillToast) messages.push(backfillToast);
      if (hiddenToast) messages.push(hiddenToast);
      setSyncMessage(messages.join(' '));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao sincronizar Asaas';
      setError(message);
    } finally {
      setSyncing(false);
    }
  }, [user?.id, isSuperAdmin, fromDate, toDate, companyFilter, typeFilter]);

  const handleExportExcel = useCallback(async () => {
    if (!isSuperAdmin) return;
    setExporting('excel');
    setError(null);
    try {
      await exportSaasCashExcel({
        movements,
        summary,
        fromDate,
        toDate,
        cashStartAt,
        issuedBy: user?.name || user?.email || 'Super Admin',
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao exportar Excel');
    } finally {
      setExporting(null);
    }
  }, [isSuperAdmin, movements, summary, fromDate, toDate, cashStartAt, user?.name, user?.email]);

  const handleExportPdf = useCallback(async () => {
    if (!isSuperAdmin) return;
    setExporting('pdf');
    setError(null);
    try {
      await exportSaasCashPdf({
        movements,
        summary,
        fromDate,
        toDate,
        cashStartAt,
        issuedBy: user?.name || user?.email || 'Super Admin',
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao exportar PDF');
    } finally {
      setExporting(null);
    }
  }, [isSuperAdmin, movements, summary, fromDate, toDate, cashStartAt, user?.name, user?.email]);

  const handleSetCashStartAt = useCallback(async () => {
    if (!user?.id || !isSuperAdmin) return;
    if (startAtConfirmText.trim() !== FINANCE_START_CONFIRMATION) return;

    setSettingStartAt(true);
    setError(null);
    try {
      const res = await fetchJsonWithTimeout(
        '/api/master/saas-cash/start-at',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            startAt: startAtMode === 'custom' ? customStartAt : undefined,
          }),
        },
        30_000,
      );
      const body = (res.data || {}) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(res.error || String(body.error || 'Falha ao definir marco financeiro'));
      }
      setCashStartAt(body.cashStartAt ? String(body.cashStartAt) : null);
      setSyncMessage(
        startAtMode === 'custom'
          ? `Marco financeiro ajustado para ${customStartAt.replace('T', ' ')}.`
          : 'Marco financeiro atualizado.',
      );
      setStartAtModalOpen(false);
      setStartAtConfirmText('');
      await loadCash();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao definir marco financeiro');
    } finally {
      setSettingStartAt(false);
    }
  }, [
    user?.id,
    isSuperAdmin,
    fromDate,
    toDate,
    companyFilter,
    typeFilter,
    summary,
    startAtConfirmText,
    startAtMode,
    customStartAt,
    loadCash,
  ]);

  const handleReprocessPaid = useCallback(async () => {
    if (!user?.id || !isSuperAdmin) return;
    setReprocessing(true);
    setError(null);
    setSyncMessage(null);
    try {
      const res = await fetchJsonWithTimeout(
        '/api/master/saas-cash/reprocess-paid',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            fromDate,
            toDate,
            companyId: companyFilter !== 'all' ? companyFilter : undefined,
            type: typeFilter,
            syncAsaas: true,
            reprocess: true,
          }),
        },
        MASTER_POST_TIMEOUT_MS,
      );
      const body = (res.data || {}) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(res.error || String(body.error || 'Falha ao reprocessar cobranças pagas'));
      }
      setMovements(Array.isArray(body.movements) ? body.movements : []);
      setSummary(
        body.summary || {
          periodIncome: 0,
          periodExpense: 0,
          periodTransfer: 0,
          netResult: 0,
          movementCount: 0,
        },
      );
      setCashStartAt(body.cashStartAt ? String(body.cashStartAt) : null);
      setHiddenByMarco(body.hiddenByMarco ?? null);
      const backfill = body.reprocess?.backfill ?? body.backfill;
      const backfillToast = formatBackfillSummary(backfill);
      const hiddenToast = formatHiddenMarcoToast(body.hiddenByMarco);
      setSyncMessage(
        ['Cobranças pagas reprocessadas.', backfillToast, hiddenToast].filter(Boolean).join(' '),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao reprocessar cobranças pagas');
    } finally {
      setReprocessing(false);
    }
  }, [user?.id, isSuperAdmin, fromDate, toDate, companyFilter, typeFilter]);

  const openStartAtModal = useCallback(() => {
    if (!isSuperAdmin) return;
    setStartAtConfirmText('');
    setStartAtMode('now');
    setCustomStartAt(formatSaasCashStartAtForInput(cashStartAt) || '2026-06-01T00:00');
    setStartAtModalOpen(true);
  }, [isSuperAdmin, cashStartAt]);

  const canConfirmStartAt = startAtConfirmText.trim() === FINANCE_START_CONFIRMATION;

  const handleManualIncome = useCallback(async () => {
    if (!user?.id || !isSuperAdmin) return;
    setManualSaving(true);
    setError(null);
    try {
      const body = await fetchJsonWithTimeout<{
        error?: string;
        created?: boolean;
        movement?: SaasCashMovement;
      }>(
        '/api/master/saas-cash/manual-income',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            amount: Number(manualForm.amount),
            movementDate: manualForm.movementDate,
            description: manualForm.description,
            category: manualForm.category,
            clientName: manualForm.clientName || null,
            asaasPaymentId: manualForm.asaasPaymentId || null,
            externalReference: manualForm.externalReference || null,
            paymentMethod: manualForm.paymentMethod || null,
            notes: manualForm.notes || null,
            companyId: manualForm.companyId || null,
          }),
        },
        MASTER_POST_TIMEOUT_MS,
      );
      if (body.error) throw new Error(body.error);
      setManualOpen(false);
      setSyncMessage(
        body.created
          ? 'Receita extraordinária lançada no Caixa SaaS (SV LOTES).'
          : 'Receita já existia (idempotente por ID Asaas ou referência externa).',
      );
      await loadCash();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao lançar receita extraordinária');
    } finally {
      setManualSaving(false);
    }
  }, [user?.id, isSuperAdmin, manualForm, loadCash]);

  const formatCurrency = (value: number) => formatSaasCurrency(value);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          {showBackLink ? (
            <Link
              href="/saas-finance"
              className="text-sm text-blue-400 hover:text-blue-300 mb-2 inline-block"
            >
              ← Voltar ao painel SaaS
            </Link>
          ) : null}
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" />
            Caixa SaaS
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Entradas (webhook/manual), despesas (tarifas) e transferências/saques Asaas (fora do
            resultado).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSuperAdmin ? (
            <>
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                disabled={loading || syncing || !!exporting || settingStartAt}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-600/20 text-sm text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Receita extraordinária
              </button>
              <button
                type="button"
                onClick={() => void handleExportExcel()}
                disabled={loading || syncing || !!exporting || settingStartAt}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-blue-500/30 bg-blue-600/20 text-sm text-blue-100 hover:bg-blue-600/30 disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exporting === 'excel' ? 'Exportando…' : 'Exportar Excel'}
              </button>
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={loading || syncing || !!exporting || settingStartAt}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-violet-500/30 bg-violet-600/20 text-sm text-violet-100 hover:bg-violet-600/30 disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                {exporting === 'pdf' ? 'Exportando…' : 'Exportar PDF'}
              </button>
              <button
                type="button"
                onClick={openStartAtModal}
                disabled={loading || syncing || !!exporting || settingStartAt}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-600/15 text-sm text-amber-100 hover:bg-amber-600/25 disabled:opacity-50"
              >
                <RotateCcw className={`w-4 h-4 ${settingStartAt ? 'animate-spin' : ''}`} />
                {settingStartAt ? 'Aplicando…' : 'Definir marco financeiro'}
              </button>
              <button
                type="button"
                onClick={() => void handleReprocessPaid()}
                disabled={loading || syncing || reprocessing || !!exporting || settingStartAt}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-cyan-500/30 bg-cyan-600/15 text-sm text-cyan-100 hover:bg-cyan-600/25 disabled:opacity-50"
              >
                <Zap className={`w-4 h-4 ${reprocessing ? 'animate-pulse' : ''}`} />
                {reprocessing ? 'Reprocessando…' : 'Reprocessar pagas'}
              </button>
              <button
                type="button"
                onClick={() => void handleSyncAsaas()}
                disabled={loading || syncing || reprocessing || !!exporting || settingStartAt}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-600/20 text-sm text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-50"
              >
                <CloudDownload className={`w-4 h-4 ${syncing ? 'animate-pulse' : ''}`} />
                {syncing ? 'Sincronizando…' : 'Sincronizar Asaas'}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void loadCash()}
            disabled={loading || syncing || !!exporting || settingStartAt}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 bg-[#11161d] text-sm text-white hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      <SaasFinanceStartAtBanner cashStartAt={cashStartAt} />

      <SaasCashHiddenByMarcoAlert
        cashStartAt={cashStartAt}
        hiddenByMarco={hiddenByMarco}
        userId={user?.id}
        onAdjustMarco={isSuperAdmin ? openStartAtModal : undefined}
      />

      {syncMessage ? (
        <div
          className={`p-3 rounded-lg border text-sm ${
            hiddenByMarco && hiddenByMarco.hiddenCount > 0
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
          }`}
        >
          {syncMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SaasMetricCard
          title="Resultado do período"
          value={formatCurrency(summary.netResult)}
          description={`Entradas − despesas (sem transferências) · ${formatDateBr(fromDate)} — ${formatDateBr(toDate)}`}
          icon={<Wallet className="w-5 h-5" />}
          tone={summary.netResult >= 0 ? 'green' : 'red'}
        />
        <SaasMetricCard
          title="Entradas do período"
          value={formatCurrency(summary.periodIncome)}
          description="Recebimentos confirmados (SV LOTES)"
          icon={<ArrowDownCircle className="w-5 h-5" />}
          tone="teal"
        />
        <SaasMetricCard
          title="Despesas do período"
          value={formatCurrency(summary.periodExpense)}
          description="Tarifas e despesas (sem saques)"
          icon={<ArrowUpCircle className="w-5 h-5" />}
          tone="amber"
        />
        <SaasMetricCard
          title="Transferências / saques"
          value={formatCurrency(summary.periodTransfer || 0)}
          description={`Fora do resultado · ${summary.movementCount} movimentação(ões)`}
          icon={<Wallet className="w-5 h-5" />}
          tone="blue"
        />
      </div>

      <div className="flex flex-wrap gap-3 p-4 rounded-xl border border-white/5 bg-[#11161d]">
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          De
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Até
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Tipo
          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as 'all' | 'income' | 'expense' | 'transfer')
            }
            className="bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[140px]"
          >
            <option value="all">Todos</option>
            <option value="income">Entradas</option>
            <option value="expense">Despesas</option>
            <option value="transfer">Transferências</option>
          </select>
        </label>
        {companies.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs text-gray-400 min-w-[200px] flex-1">
            Empresa
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white w-full"
            >
              <option value="all">Todas</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/5 overflow-hidden bg-[#11161d]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-gray-400">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Origem</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    Carregando movimentações…
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    Nenhuma movimentação no período selecionado.
                  </td>
                </tr>
              ) : (
                movements.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/5 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 text-gray-200 whitespace-nowrap">
                      {formatDateBr(row.movement_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {row.company_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          row.type === 'expense'
                            ? 'bg-rose-500/15 text-rose-300'
                            : row.type === 'transfer'
                              ? 'bg-violet-500/15 text-violet-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                        }`}
                      >
                        {saasCashTypeLabel(row.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{row.category}</td>
                    <td className="px-4 py-3 text-gray-400 max-w-[220px] truncate">
                      {row.description || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${sourceBadgeClass(row.source)}`}
                      >
                        {saasCashSourceLabel(row.source)}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                        row.type === 'expense'
                          ? 'text-rose-300'
                          : row.type === 'transfer'
                            ? 'text-violet-300'
                            : 'text-emerald-300'
                      }`}
                    >
                      {row.type === 'expense' || row.type === 'transfer' ? '−' : '+'}
                      {formatCurrency(row.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {startAtModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#11161d] shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-white">Definir marco financeiro</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Caixa e dashboards financeiros SaaS
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStartAtModalOpen(false);
                  setStartAtConfirmText('');
                }}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-300 leading-relaxed">
                Isso não apaga dados antigos. Define a partir de quando o Caixa SaaS e a Receita
                Recebida passam a contar movimentações. Você pode avançar o marco (zerar visão) ou
                retroceder (ex.: 01/06/2026 00:00) para incluir pagamentos anteriores.
              </p>
              <p className="text-xs text-amber-200/90">
                Após confirmar, o sistema reprocessa cobranças pagas e sincroniza o Asaas no período
                selecionado na tela.
              </p>
              <fieldset className="space-y-2">
                <legend className="text-sm text-gray-400 mb-2">Nova data do marco</legend>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="radio"
                    name="startAtMode"
                    checked={startAtMode === 'now'}
                    onChange={() => setStartAtMode('now')}
                  />
                  A partir de agora
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="radio"
                    name="startAtMode"
                    checked={startAtMode === 'custom'}
                    onChange={() => setStartAtMode('custom')}
                  />
                  Data/hora personalizada
                </label>
                {startAtMode === 'custom' ? (
                  <input
                    type="datetime-local"
                    value={customStartAt}
                    onChange={(e) => setCustomStartAt(e.target.value)}
                    className="mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                  />
                ) : null}
              </fieldset>
              <label className="block text-sm text-gray-400">
                Digite <strong className="text-white">{FINANCE_START_CONFIRMATION}</strong> para confirmar
                <input
                  type="text"
                  value={startAtConfirmText}
                  onChange={(e) => setStartAtConfirmText(e.target.value)}
                  placeholder={FINANCE_START_CONFIRMATION}
                  className="mt-2 w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setStartAtModalOpen(false);
                  setStartAtConfirmText('');
                }}
                className="px-4 py-2.5 rounded-lg border border-white/10 text-sm text-gray-300 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSetCashStartAt()}
                disabled={!canConfirmStartAt || settingStartAt}
                className="px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-sm font-semibold text-white"
              >
                {settingStartAt ? 'Aplicando…' : 'Confirmar marco financeiro'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {manualOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#151a22] shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Receita extraordinária — SV LOTES</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Use para consultoria, link Asaas avulso ou entradas fora de mensalidade. Idempotente
                  por ID Asaas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="block text-xs text-gray-400">
                Valor *
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={manualForm.amount}
                  onChange={(e) => setManualForm((f) => ({ ...f, amount: e.target.value }))}
                  className="mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-gray-400">
                Data do recebimento *
                <input
                  type="date"
                  value={manualForm.movementDate}
                  onChange={(e) => setManualForm((f) => ({ ...f, movementDate: e.target.value }))}
                  className="mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-gray-400">
                Descrição *
                <input
                  type="text"
                  value={manualForm.description}
                  onChange={(e) => setManualForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  placeholder="Ex.: Consultoria Meneses Imobiliária"
                />
              </label>
              <label className="block text-xs text-gray-400">
                Categoria
                <input
                  type="text"
                  value={manualForm.category}
                  onChange={(e) => setManualForm((f) => ({ ...f, category: e.target.value }))}
                  className="mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-gray-400">
                Cliente / pagador (opcional)
                <input
                  type="text"
                  value={manualForm.clientName}
                  onChange={(e) => setManualForm((f) => ({ ...f, clientName: e.target.value }))}
                  className="mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-gray-400">
                Forma de pagamento
                <select
                  value={manualForm.paymentMethod}
                  onChange={(e) => setManualForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                  className="mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="PIX">PIX</option>
                  <option value="TED">TED</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </label>
              <label className="block text-xs text-gray-400">
                ID pagamento Asaas (opcional)
                <input
                  type="text"
                  value={manualForm.asaasPaymentId}
                  onChange={(e) => setManualForm((f) => ({ ...f, asaasPaymentId: e.target.value }))}
                  className="mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  placeholder="pay_..."
                />
              </label>
              <label className="block text-xs text-gray-400">
                Referência externa (opcional)
                <input
                  type="text"
                  value={manualForm.externalReference}
                  onChange={(e) =>
                    setManualForm((f) => ({ ...f, externalReference: e.target.value }))
                  }
                  className="mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  placeholder="NF, protocolo, link avulso…"
                />
              </label>
              <label className="block text-xs text-gray-400">
                Observações
                <textarea
                  value={manualForm.notes}
                  onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-h-[72px]"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="px-4 py-2.5 rounded-lg border border-white/10 text-sm text-gray-300 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleManualIncome()}
                disabled={manualSaving}
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-sm font-semibold text-white"
              >
                {manualSaving ? 'Salvando…' : 'Lançar receita'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

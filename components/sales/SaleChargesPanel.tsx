'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Loader2,
  Mail,
  Printer,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  SALE_CHARGES_GENERATE_BATCH_LIMIT,
  SALE_CHARGES_GENERATE_ACTION_MAX,
  SALE_CHARGES_QUANTITY_PRESETS,
  SALE_CHARGES_CORRECTION_WARNING,
  buildSaleCarneWhatsAppMessage,
  clampGenerateMissingChargesQuantity,
  planGenerateMissingCharges,
  saleHasMonetaryCorrection,
  splitGenerateMissingChargesBatches,
  type SaleChargesSummary,
} from '@/lib/finance/saleChargesShared';
import { C6_EMIT_NOT_HOMOLOGATED_MESSAGE } from '@/lib/banking/c6/c6EmitGuard';
import { normalizeWhatsAppPhone, openWhatsApp } from '@/lib/whatsapp/clickToChat';

type SaleChargesPanelProps = {
  saleId: string | null | undefined;
  disabled?: boolean;
};

type GenerateResult = {
  created: number;
  reused: number;
  skipped: number;
  errors: Array<{ installmentId: string; message: string }>;
  remainingMissing: number;
  progressDone: number;
  progressTotal: number;
};

function stateLabel(state: SaleChargesSummary['uiState']): string {
  switch (state) {
    case 'no_account':
      return 'Conta financeira não configurada';
    case 'none':
      return 'Nenhuma cobrança gerada';
    case 'partial':
      return 'Geração parcialmente concluída';
    case 'complete':
      return 'Todas as cobranças geradas';
    case 'errors':
      return 'Existem cobranças com erro';
    case 'carne_ready':
      return 'Carnê disponível';
    default:
      return 'Cobranças';
  }
}

export function SaleChargesPanel({ saleId, disabled = false }: SaleChargesPanelProps) {
  const [summary, setSummary] = useState<SaleChargesSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastErrors, setLastErrors] = useState<Array<{ installmentId: string; message: string }>>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quantityMode, setQuantityMode] = useState<'3' | '6' | '12' | 'custom'>('6');
  const [customQuantity, setCustomQuantity] = useState('6');
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [chargeProvider, setChargeProvider] = useState<
    'ASAAS_COMPANY' | 'INTER' | 'C6'
  >('ASAAS_COMPANY');

  const loadSummary = useCallback(async () => {
    if (!saleId) return;
    setLoading(true);
    setError('');
    try {
      const providerRes = await fetch(
        `/api/finance/sale-charges/provider?saleId=${encodeURIComponent(saleId)}`,
        { credentials: 'include' },
      );
      const providerData = await providerRes.json().catch(() => ({}));
      const providerRaw = String(providerData.provider || '').toUpperCase();
      const provider =
        providerRes.ok && providerRaw === 'INTER'
          ? 'INTER'
          : providerRes.ok && providerRaw === 'C6'
            ? 'C6'
            : 'ASAAS_COMPANY';
      setChargeProvider(provider);
      if (provider === 'C6') {
        setError(C6_EMIT_NOT_HOMOLOGATED_MESSAGE);
        setSummary(null);
        return;
      }

      const summaryPath =
        provider === 'INTER'
          ? `/api/finance/inter/sale-charges?saleId=${encodeURIComponent(saleId)}`
          : `/api/finance/asaas/sale-charges?saleId=${encodeURIComponent(saleId)}`;
      const res = await fetch(summaryPath, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar cobranças');
      setSummary(data.summary as SaleChargesSummary);
      if (data.summary?.customerEmail) {
        setEmailTo(String(data.summary.customerEmail));
      }
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

  const canMutate = !disabled && !generating && !syncing && !pdfBusy && !emailBusy;

  const pendingInstallmentsCount = useMemo(() => {
    if (!summary) return 0;
    return Math.max(0, summary.totalInstallments - summary.paidInstallments);
  }, [summary]);

  const requestedQuantity = useMemo(() => {
    if (!summary) return 0;
    if (quantityMode === 'custom') {
      return clampGenerateMissingChargesQuantity(
        customQuantity,
        summary.chargesMissing,
      );
    }
    return clampGenerateMissingChargesQuantity(
      Number(quantityMode),
      summary.chargesMissing,
    );
  }, [summary, quantityMode, customQuantity]);

  const generatePlan = useMemo(() => {
    if (!summary) return null;
    return planGenerateMissingCharges({
      missingOrdered: summary.missingInstallments || [],
      quantityRequested: requestedQuantity,
    });
  }, [summary, requestedQuantity]);

  const nextMissingLabel = useMemo(() => {
    const next = summary?.missingInstallments?.[0];
    if (!next) return '—';
    const n =
      next.installmentNumber == null
        ? '—'
        : String(Math.trunc(next.installmentNumber)).padStart(2, '0');
    const due = next.dueDate
      ? (() => {
          const [y, m, d] = next.dueDate.slice(0, 10).split('-');
          return y && m && d ? `${d}/${m}/${y}` : next.dueDate;
        })()
      : '—';
    return `Parcela ${n} — ${due}`;
  }, [summary]);

  function openGenerateModal() {
    if (!summary || summary.chargesMissing <= 0) return;
    const defaultQty = clampGenerateMissingChargesQuantity(
      6,
      summary.chargesMissing,
    );
    if (defaultQty === 3) setQuantityMode('3');
    else if (defaultQty === 12 && summary.chargesMissing >= 12) setQuantityMode('12');
    else if (defaultQty >= 6) setQuantityMode('6');
    else setQuantityMode('custom');
    setCustomQuantity(String(Math.max(1, defaultQty || 1)));
    setConfirmOpen(true);
  }

  async function runGenerateMissing() {
    if (chargeProvider === 'C6') {
      setError(C6_EMIT_NOT_HOMOLOGATED_MESSAGE);
      return;
    }
    if (!saleId || !summary || generating) return;
    const quantity = clampGenerateMissingChargesQuantity(
      quantityMode === 'custom' ? customQuantity : Number(quantityMode),
      summary.chargesMissing,
    );
    if (quantity < 1) {
      setError('Informe uma quantidade válida de cobranças.');
      return;
    }

    setConfirmOpen(false);
    setGenerating(true);
    setError('');
    setInfo('');
    setLastErrors([]);

    const batches = splitGenerateMissingChargesBatches(
      quantity,
      SALE_CHARGES_GENERATE_BATCH_LIMIT,
    );
    let totalCreated = 0;
    let totalErrors: Array<{ installmentId: string; message: string }> = [];
    let attempted = 0;

    try {
      for (const batchLimit of batches) {
        const generatePath =
          chargeProvider === 'INTER'
            ? '/api/finance/inter/sale-charges/generate-missing'
            : '/api/finance/asaas/sale-charges/generate-missing';
        const res = await fetch(generatePath, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            saleId,
            confirmed: true,
            limit: batchLimit,
            quantity: batchLimit,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as GenerateResult & {
          error?: string;
          requested?: number;
        };
        if (!res.ok) throw new Error(data.error || 'Falha ao gerar cobranças');

        const requested = Number(data.requested || batchLimit);
        attempted += requested;
        totalCreated += Number(data.created || 0) + Number(data.reused || 0);
        totalErrors = totalErrors.concat(data.errors || []);
        setProgress({
          done: Math.min(quantity, attempted),
          total: quantity,
        });
        setLastErrors(totalErrors);

        if ((data.errors || []).length > 0 && data.created === 0 && data.reused === 0) {
          // Lote inteiro falhou — evita loop infinito na mesma ação.
          break;
        }
        if (Number(data.remainingMissing || 0) <= 0) break;
        if (attempted >= quantity) break;
      }

      await loadSummary();
      const errCount = totalErrors.length;
      setInfo(
        errCount > 0
          ? `${totalCreated} cobrança(s) processada(s) de ${quantity} solicitada(s). ${errCount} com erro.`
          : `${totalCreated} cobrança(s) gerada(s) com sucesso (solicitado: ${quantity}).`,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro na geração');
      await loadSummary();
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }

  async function runSync() {
    if (!saleId) return;
    setSyncing(true);
    setError('');
    setInfo('');
    try {
      if (chargeProvider === 'INTER') {
        const res = await fetch('/api/finance/inter/sale-charges/sync', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ saleId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Falha ao sincronizar Inter');
        if (data.summary) setSummary(data.summary as SaleChargesSummary);
        else await loadSummary();
        const paid = Number(data.paidSettled || 0);
        setInfo(
          paid > 0
            ? `Situação Inter atualizada. ${paid} pagamento(s) sincronizado(s).`
            : 'Situação das cobranças Inter atualizada (consulta GET).',
        );
        return;
      }
      const res = await fetch('/api/finance/asaas/sale-charges/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao sincronizar');
      if (data.summary) setSummary(data.summary as SaleChargesSummary);
      else await loadSummary();
      setInfo('Situação das cobranças atualizada.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  async function fetchCarneBlob(): Promise<{ blob: Blob; filename: string }> {
    if (!saleId) throw new Error('Venda não identificada');
    const path =
      chargeProvider === 'INTER'
        ? '/api/finance/inter/sale-charges/carne-pdf'
        : '/api/finance/asaas/sale-charges/carne-pdf';
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saleId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao gerar carnê');
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || 'carne.pdf';
    return { blob, filename };
  }

  async function downloadCarne() {
    setPdfBusy(true);
    setError('');
    try {
      const { blob, filename } = await fetchCarneBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setInfo('PDF do carnê baixado.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao baixar PDF');
    } finally {
      setPdfBusy(false);
    }
  }

  async function printCarne() {
    setPdfBusy(true);
    setError('');
    try {
      const { blob } = await fetchCarneBlob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) {
        setInfo('Permita pop-ups para imprimir, ou use Baixar PDF.');
      } else {
        setTimeout(() => {
          try {
            w.focus();
            w.print();
          } catch {
            /* ignore */
          }
        }, 800);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao imprimir');
    } finally {
      setPdfBusy(false);
    }
  }

  async function sendWhatsApp() {
    if (!summary) return;
    setPdfBusy(true);
    setError('');
    try {
      const { blob, filename } = await fetchCarneBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      const phone = summary.customerPhone;
      const msg = buildSaleCarneWhatsAppMessage(summary);
      if (!normalizeWhatsAppPhone(phone)) {
        setInfo(
          'PDF baixado. Cadastre o telefone do cliente para abrir o WhatsApp automaticamente.',
        );
        return;
      }
      if (!openWhatsApp(phone, msg)) {
        setInfo(
          'PDF baixado. Telefone inválido para abrir o WhatsApp automaticamente.',
        );
        return;
      }
      setInfo(
        'PDF baixado. WhatsApp aberto com mensagem pronta — anexe o arquivo baixado na conversa.',
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro no WhatsApp');
    } finally {
      setPdfBusy(false);
    }
  }

  async function sendEmail() {
    if (!saleId) return;
    setEmailBusy(true);
    setError('');
    try {
      const path =
        chargeProvider === 'INTER'
          ? '/api/finance/inter/sale-charges/carne-email'
          : '/api/finance/asaas/sale-charges/carne-email';
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId, to: emailTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'EMAIL_NOT_CONFIGURED') {
          throw new Error(data.error || 'E-mail não configurado. Baixe o PDF.');
        }
        throw new Error(data.error || 'Falha no envio');
      }
      setEmailOpen(false);
      setInfo(`Carnê enviado para ${emailTo}.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro no e-mail');
    } finally {
      setEmailBusy(false);
    }
  }

  const kpi = useMemo(() => summary, [summary]);

  if (!saleId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Salve a venda para gerenciar cobranças e carnê.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-gray-900">Cobranças da venda</h4>
          <p className="text-xs text-gray-500">
            Somente parcelas desta venda ·{' '}
            {chargeProvider === 'INTER' ? 'Banco Inter' : 'Asaas Company'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSummary()}
          disabled={!canMutate || loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </div>
      ) : null}

      {loading && !summary ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando resumo…
        </div>
      ) : null}

      {kpi ? (
        <>
          <div
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              kpi.uiState === 'carne_ready'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : kpi.uiState === 'no_account' || kpi.uiState === 'errors'
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-slate-50 text-slate-800'
            }`}
          >
            {stateLabel(kpi.uiState)}
          </div>

          {!kpi.hasFinancialAccount ? (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Conta financeira não configurada</p>
                <p className="mt-1 text-xs">
                  {kpi.financialAccountBlockReason ||
                    'Defina a conta recebedora na aba Dados antes de gerar cobranças.'}
                </p>
              </div>
            </div>
          ) : null}

          {Array.isArray(kpi.beneficiaryWarnings) && kpi.beneficiaryWarnings.length > 0
            ? kpi.beneficiaryWarnings.map((warning) => (
                <div
                  key={warning.slice(0, 48)}
                  className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
                >
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="text-xs leading-relaxed">{warning}</p>
                </div>
              ))
            : null}

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-2">
              <div className="text-[10px] uppercase text-gray-500">Cliente</div>
              <div className="font-semibold text-gray-900">{kpi.customerName || '—'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-2">
              <div className="text-[10px] uppercase text-gray-500">Empreendimento</div>
              <div className="font-semibold text-gray-900">{kpi.projectName || '—'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-2">
              <div className="text-[10px] uppercase text-gray-500">Quadra / Lote</div>
              <div className="font-semibold text-gray-900">
                {kpi.lotLabel || `QD ${kpi.quadra || '—'} — LT ${kpi.lote || '—'}`}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-2">
              <div className="text-[10px] uppercase text-gray-500">Contrato</div>
              <div className="font-semibold text-gray-900">{kpi.contractNumber || '—'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-2 sm:col-span-2">
              <div className="text-[10px] uppercase text-gray-500">Conta recebedora</div>
              <div className="flex flex-wrap items-center gap-1.5 font-semibold text-gray-900">
                <Wallet className="h-3.5 w-3.5" />
                {kpi.financialAccountName || 'Não configurada'}
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    chargeProvider === 'INTER'
                      ? 'bg-orange-100 text-orange-900'
                      : 'bg-sky-100 text-sky-900'
                  }`}
                >
                  {chargeProvider === 'INTER' ? 'Banco Inter' : 'Asaas'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Kpi label="Parcelas" value={String(kpi.totalInstallments)} />
            <Kpi label="Pagas" value={String(kpi.paidInstallments)} />
            <Kpi label="Cobranças geradas" value={String(kpi.chargesGenerated)} />
            <Kpi label="Faltantes" value={String(kpi.chargesMissing)} />
            <Kpi label="Com erro" value={String(kpi.chargesFailed)} />
            <Kpi label="Canceladas" value={String(kpi.chargesCancelled)} />
            <Kpi
              label="1º vencimento"
              value={kpi.firstDueDate || '—'}
            />
            <Kpi label="Último venc." value={kpi.lastDueDate || '—'} />
            <Kpi label="Total parcelas" value={formatCurrencyBRL(kpi.totalAmount)} />
            <Kpi label="Já pago" value={formatCurrencyBRL(kpi.totalPaid)} />
            <Kpi label="Pendente" value={formatCurrencyBRL(kpi.totalPending)} />
            <Kpi label="Elegíveis" value={String(kpi.eligibleInstallments)} />
          </div>

          {generating && progress ? (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
              Gerando cobranças: {progress.done} de {progress.total}
            </div>
          ) : null}

          {lastErrors.length > 0 ? (
            <details className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <summary className="cursor-pointer font-semibold">
                {lastErrors.length} parcela(s) com erro
              </summary>
              <ul className="mt-2 max-h-32 space-y-1 overflow-auto">
                {lastErrors.slice(0, 30).map((e) => (
                  <li key={e.installmentId}>
                    {e.installmentId.slice(0, 8)}… — {e.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canMutate || !kpi.hasFinancialAccount || kpi.chargesMissing <= 0}
              onClick={() => openGenerateModal()}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-40"
            >
              {generating ? 'Gerando…' : 'Gerar cobranças faltantes'}
            </button>
            <button
              type="button"
              disabled={!canMutate}
              onClick={() => void runSync()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-40"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar situação das cobranças
            </button>
          </div>

          {kpi.carneBlockReason ? (
            <p
              className={`text-xs ${
                kpi.carneReady ? 'text-slate-700' : 'text-amber-800'
              }`}
            >
              {kpi.carneBlockReason}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              disabled={!canMutate || !kpi.carneReady}
              onClick={() => void downloadCarne()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Gerar carnê em PDF / Baixar
            </button>
            <button
              type="button"
              disabled={!canMutate || !kpi.carneReady}
              onClick={() => void printCarne()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-40"
            >
              <Printer className="h-4 w-4" />
              Imprimir carnê
            </button>
            <button
              type="button"
              disabled={!canMutate || !kpi.carneReady}
              onClick={() => void sendWhatsApp()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-40"
            >
              Enviar por WhatsApp
            </button>
            <button
              type="button"
              disabled={!canMutate || !kpi.carneReady}
              onClick={() => setEmailOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold disabled:opacity-40"
            >
              <Mail className="h-4 w-4" />
              Enviar por e-mail
            </button>
          </div>
        </>
      ) : null}

      {confirmOpen && summary ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">Gerar cobranças</h3>
            <ul className="mt-3 space-y-1 text-sm text-gray-700">
              <li>
                Parcelas pendentes da venda:{' '}
                <strong>{pendingInstallmentsCount}</strong>
              </li>
              <li>
                Cobranças já geradas: <strong>{summary.chargesGenerated}</strong>
              </li>
              <li>
                Cobranças faltantes: <strong>{summary.chargesMissing}</strong>
              </li>
              <li>
                Próxima parcela sem cobrança: <strong>{nextMissingLabel}</strong>
              </li>
            </ul>

            {saleHasMonetaryCorrection(summary.installmentCorrectionType) ? (
              <div className="mt-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{SALE_CHARGES_CORRECTION_WARNING}</span>
              </div>
            ) : null}

            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Quantas cobranças deseja gerar?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SALE_CHARGES_QUANTITY_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={summary.chargesMissing < 1}
                    onClick={() => {
                      setQuantityMode(String(n) as '3' | '6' | '12');
                      setCustomQuantity(String(n));
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${
                      quantityMode === String(n)
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-gray-300 text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    Próximas {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setQuantityMode('custom')}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    quantityMode === 'custom'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                      : 'border-gray-300 text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  Personalizado
                </button>
              </div>
              {quantityMode === 'custom' ? (
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-sm text-gray-700" htmlFor="charge-qty">
                    Quantidade:
                  </label>
                  <input
                    id="charge-qty"
                    type="number"
                    min={1}
                    max={Math.min(
                      summary.chargesMissing,
                      SALE_CHARGES_GENERATE_ACTION_MAX,
                    )}
                    value={customQuantity}
                    onChange={(e) => setCustomQuantity(e.target.value)}
                    className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <span className="text-xs text-gray-500">
                    máx. {Math.min(summary.chargesMissing, SALE_CHARGES_GENERATE_ACTION_MAX)}
                  </span>
                </div>
              ) : null}
            </div>

            {generatePlan && generatePlan.quantity > 0 ? (
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-gray-800">
                <div className="font-semibold">{generatePlan.labelRange}</div>
                {generatePlan.periodLabel ? (
                  <div className="mt-1 text-gray-600">{generatePlan.periodLabel}</div>
                ) : null}
                <div className="mt-2 text-xs text-gray-500">
                  Lotes técnicos internos de até {SALE_CHARGES_GENERATE_BATCH_LIMIT}{' '}
                  (a ação para em {generatePlan.quantity}).
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-amber-800">
                Não há cobranças faltantes para gerar.
              </p>
            )}

            <div className="mt-3 rounded-lg bg-white p-2 text-xs text-gray-600 border border-gray-100">
              <div>Cliente: {summary.customerName || '—'}</div>
              <div>Empreendimento: {summary.projectName || '—'}</div>
              <div>
                Lote: {summary.lotLabel || `QD ${summary.quadra} — LT ${summary.lote}`}
              </div>
              <div>Conta: {summary.financialAccountName || '—'}</div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-600"
                disabled={generating}
                onClick={() => setConfirmOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                disabled={generating || !generatePlan || generatePlan.quantity < 1}
                onClick={() => void runGenerateMissing()}
              >
                {generatePlan && generatePlan.quantity > 0
                  ? `Gerar ${generatePlan.quantity} cobrança${generatePlan.quantity === 1 ? '' : 's'}`
                  : 'Gerar cobranças'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {emailOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900">Enviar carnê por e-mail</h3>
            <p className="mt-1 text-xs text-gray-500">
              Confira o endereço antes do envio. O PDF será anexado se o Resend estiver
              configurado.
            </p>
            <label className="mt-3 block text-xs font-semibold text-gray-700">E-mail</label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-600"
                onClick={() => setEmailOpen(false)}
                disabled={emailBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                disabled={emailBusy || !emailTo.trim()}
                onClick={() => void sendEmail()}
              >
                {emailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Enviar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-0.5 font-semibold text-gray-900">{value}</div>
    </div>
  );
}

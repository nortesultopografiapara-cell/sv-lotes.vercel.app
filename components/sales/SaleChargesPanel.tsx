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
import { normalizeWhatsAppPhone, openWhatsApp } from '@/lib/whatsapp/clickToChat';
import { ChargeRevenueSplitDistribution, invalidateSaleRevenueSplitView } from '@/components/finance/ChargeRevenueSplitDistribution';
import { AssistantSaleChargesUiBridge } from '@/components/assistant/AssistantSaleChargesUiBridge';
import { ChargeInstallmentActions } from '@/components/charges/ChargeInstallmentActions';
import {
  buildChargeInstallmentView,
  computeInstallmentStatus,
  type ChargeInstallmentView,
} from '@/lib/charges/chargeInstallmentHelpers';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import type { SaleChargeInstallmentRow } from '@/lib/finance/saleChargesShared';

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

type InterResumeJobView = {
  id: string;
  saleId: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  emitted: number;
  reused: number;
  skippedPaid: number;
  failed: number;
  remaining: number;
  planned: number;
  lastError: string | null;
  rateLimitedUntil: string | null;
  updatedAt: string;
  mode: 'simulate' | 'live' | 'deferred';
  manualReconcile?: number;
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
  const [chargeProvider, setChargeProvider] = useState<'ASAAS_COMPANY' | 'INTER' | 'C6'>('ASAAS_COMPANY');
  const [splitTick, setSplitTick] = useState(0);
  const [resumeJob, setResumeJob] = useState<InterResumeJobView | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [c6Installments, setC6Installments] = useState<SaleChargeInstallmentRow[]>([]);
  const [c6Charges, setC6Charges] = useState<CompanyAsaasChargeResponse[]>([]);
  const [c6AuthorizedIds, setC6AuthorizedIds] = useState<string[]>([]);
  const [c6ActionId, setC6ActionId] = useState<string | null>(null);
  const [c6Notices, setC6Notices] = useState<
    Record<
      string,
      {
        uncertain: boolean;
        message: string;
        bankDiagnostic?: {
          httpStatus: number | null;
          code: string | null;
          message: string | null;
          field: string | null;
        } | null;
      }
    >
  >({});

  const loadSummary = useCallback(async () => {
    if (!saleId) return;
    setLoading(true);
    setError('');
    try {
      const providerRes = await fetch(
        `/api/finance/sale-charges/provider?saleId=${encodeURIComponent(saleId)}`,
        { credentials: 'include' },
      );
      const providerData = (await providerRes.json().catch(() => ({}))) as {
        provider?: string;
        error?: string;
      };
      if (!providerRes.ok) {
        throw new Error(providerData.error || 'Falha ao identificar a conta recebedora.');
      }
      const provider =
        providerData.provider === 'INTER'
          ? 'INTER'
          : providerData.provider === 'C6'
            ? 'C6'
            : 'ASAAS_COMPANY';
      setChargeProvider(provider);

      const summaryPath =
        provider === 'INTER'
          ? `/api/finance/inter/sale-charges?saleId=${encodeURIComponent(saleId)}`
          : provider === 'C6'
            ? `/api/finance/c6/sale-charges?saleId=${encodeURIComponent(saleId)}`
            : `/api/finance/asaas/sale-charges?saleId=${encodeURIComponent(saleId)}`;
      const res = await fetch(summaryPath, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar cobranças');
      setSummary(data.summary as SaleChargesSummary);
      if (provider === 'C6') {
        setC6Installments(Array.isArray(data.installments) ? data.installments : []);
        setC6Charges(Array.isArray(data.charges) ? data.charges : []);
        setC6AuthorizedIds(
          Array.isArray(data.emitAuthorizedReceiptIds)
            ? data.emitAuthorizedReceiptIds.map((id: unknown) => String(id))
            : [],
        );
      } else {
        setC6Installments([]);
        setC6Charges([]);
        setC6AuthorizedIds([]);
      }
      setResumeJob((data.job as InterResumeJobView | null) || null);
      if (data.summary?.customerEmail) {
        setEmailTo(String(data.summary.customerEmail));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
      setSummary(null);
      setC6Installments([]);
      setC6Charges([]);
      setC6AuthorizedIds([]);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const canMutate = !disabled && !generating && !syncing && !pdfBusy && !emailBusy && !resumeBusy && !c6ActionId;

  const c6OverdueCount = useMemo(() => {
    if (chargeProvider !== 'C6') return 0;
    const today = new Date().toISOString().slice(0, 10);
    return c6Installments.filter((row) => computeInstallmentStatus(row, today) === 'atrasado').length;
  }, [chargeProvider, c6Installments]);

  const c6Views = useMemo(() => {
    if (chargeProvider !== 'C6' || !summary) return [] as ChargeInstallmentView[];
    const today = new Date().toISOString().slice(0, 10);
    const labels = summary.financialAccountId
      ? { [summary.financialAccountId]: summary.financialAccountName || 'C6 Bank' }
      : {};
    const byInstallment = new Map(c6Charges.map((charge) => [String(charge.installmentId), charge]));
    return c6Installments.map((row) =>
      buildChargeInstallmentView(
        {
          ...row,
          customers: summary.customerName ? { name: summary.customerName } : null,
          projects: summary.projectName ? { name: summary.projectName } : null,
          blocks: { block_name: summary.quadra, number: summary.lote },
        },
        byInstallment.get(String(row.id)) || null,
        today,
        labels,
        { chargeProvider: 'C6' },
      ),
    );
  }, [c6Charges, c6Installments, chargeProvider, summary]);

  function c6ChargeFor(installmentId: string): CompanyAsaasChargeResponse | null {
    return c6Charges.find((charge) => String(charge.installmentId) === installmentId) || null;
  }

  async function emitSaleC6Boleto(installmentId: string) {
    setC6ActionId(installmentId);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/banking/c6/charges', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        emitted?: boolean;
        reused?: boolean;
        needsReconciliation?: boolean;
        bankDiagnostic?: {
          httpStatus: number | null;
          code: string | null;
          message: string | null;
          fields?: string[];
        } | null;
      };
      if (!res.ok) throw new Error(json.error || 'Falha ao emitir o boleto C6.');
      const uncertain =
        Boolean(json.needsReconciliation) ||
        /bloqueada|ambígua|segunda emissão/i.test(String(json.message || ''));
      const failed = !json.emitted && !json.reused;
      setC6Notices((prev) => {
        if (!failed) {
          const next = { ...prev };
          delete next[installmentId];
          return next;
        }
        return {
          ...prev,
          [installmentId]: {
            uncertain,
            message: json.message || 'A emissão precisa de conferência antes de uma nova tentativa.',
            bankDiagnostic: json.bankDiagnostic
              ? {
                  httpStatus: json.bankDiagnostic.httpStatus,
                  code: json.bankDiagnostic.code,
                  message: json.bankDiagnostic.message,
                  field: json.bankDiagnostic.fields?.filter(Boolean).join(', ') || null,
                }
              : null,
          },
        };
      });
      if (failed) {
        setError(json.message || 'O C6 não confirmou a cobrança. Nenhuma nova emissão automática foi feita.');
      } else {
        setInfo(json.message || (json.reused ? 'Boleto C6 já existente reutilizado.' : 'Boleto C6 registrado.'));
      }
      await loadSummary();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao emitir o boleto C6.');
    } finally {
      setC6ActionId(null);
    }
  }

  async function refreshSaleC6Charge(installmentId: string) {
    setC6ActionId(installmentId);
    setError('');
    try {
      const res = await fetch(
        `/api/banking/c6/charges?installmentId=${encodeURIComponent(installmentId)}`,
        { credentials: 'include' },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error || 'Falha ao consultar a cobrança C6.');
      setInfo(json.message || 'Consulta C6 concluída a partir dos dados oficiais.');
      await loadSummary();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao consultar a cobrança C6.');
    } finally {
      setC6ActionId(null);
    }
  }

  async function openSaleC6Pdf(installmentId: string, openInline: boolean) {
    setC6ActionId(installmentId);
    setError('');
    try {
      const res = await fetch(
        `/api/banking/c6/charges/pdf?installmentId=${encodeURIComponent(installmentId)}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || 'PDF oficial do C6 indisponível.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (openInline) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `boleto-c6-${installmentId.slice(0, 8)}.pdf`;
        anchor.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setInfo('PDF devolvido pelo C6. Isso não confirma pagamento nem baixa o caixa.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao obter o PDF C6.');
    } finally {
      setC6ActionId(null);
    }
  }

  async function copySaleC6Text(installmentId: string, kind: 'pix' | 'line') {
    const charge = c6ChargeFor(installmentId);
    const value =
      kind === 'pix'
        ? String(charge?.pixCopyPaste || '').trim()
        : String(charge?.bankSlipIdentification || '').trim();
    if (!value) {
      setError(kind === 'pix' ? 'O C6 ainda não devolveu o código Pix.' : 'O C6 ainda não devolveu a linha digitável.');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setInfo(kind === 'pix' ? 'Código Pix copiado dos dados oficiais do C6.' : 'Linha digitável copiada dos dados oficiais do C6.');
    } catch {
      setError('Não foi possível copiar neste navegador.');
    }
  }

  async function postInterResume(action: 'start' | 'pause' | 'tick', confirmed = true) {
    if (!saleId) return null;
    const res = await fetch('/api/finance/inter/sale-charges/resume', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saleId, action, confirmed }),
    });
    const data = (await res.json().catch(() => ({}))) as { job?: InterResumeJobView; error?: string };
    if (!res.ok) throw new Error(data.error || 'Falha na retomada Inter');
    if (data.job) setResumeJob(data.job);
    return data.job || null;
  }

  async function runContinueMissing() {
    if (!saleId || chargeProvider !== 'INTER' || !summary) return;
    const remaining = summary.chargesMissing;
    if (remaining <= 0) return;
    if (
      !window.confirm(
        `Continuar cobranças faltantes no Banco Inter?\n\nFaltantes agora: ${remaining}.\nO processamento segue no servidor em lotes, mesmo se fechar o navegador.\nEntrada paga e boletos já emitidos não serão alterados.`,
      )
    ) {
      return;
    }
    setResumeBusy(true);
    setError('');
    setInfo('');
    try {
      const job = await postInterResume('start', true);
      setInfo(
        job
          ? `Retomada Inter: ${job.emitted + job.reused} emitidas/reaproveitadas, ${job.remaining} restantes, ${job.failed} com erro.`
          : 'Retomada Inter iniciada.',
      );
      await loadSummary();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao continuar cobranças Inter');
    } finally {
      setResumeBusy(false);
    }
  }

  async function runPauseResume() {
    if (!saleId || chargeProvider !== 'INTER') return;
    setResumeBusy(true);
    try {
      await postInterResume('pause', true);
      setInfo('Retomada Inter pausada. Use Continuar cobranças faltantes para retomar.');
      await loadSummary();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao pausar');
    } finally {
      setResumeBusy(false);
    }
  }

  useEffect(() => {
    if (chargeProvider !== 'INTER') return;
    const active = resumeJob?.status === 'running' || resumeJob?.status === 'queued';
    if (!active || !saleId) return;
    const handle = window.setInterval(() => {
      void postInterResume('tick', true)
        .then(() => loadSummary())
        .catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(handle);
  }, [chargeProvider, resumeJob?.status, saleId, loadSummary]);

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
    if (chargeProvider === 'C6') {
      setInfo('Emissão em lote permanece bloqueada. Use o botão da parcela autorizada.');
      return;
    }
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
      setError('Emissão C6 em lote permanece bloqueada. Use o botão da parcela autorizada.');
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
      if (chargeProvider === 'C6') {
        const issued = c6Charges.filter((charge) => String(charge.asaasPaymentId || '').trim());
        for (const charge of issued) {
          const res = await fetch(
            `/api/banking/c6/charges?installmentId=${encodeURIComponent(charge.installmentId)}`,
            { credentials: 'include' },
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Falha ao consultar a cobrança C6.');
        }
        await loadSummary();
        setInfo(
          issued.length > 0
            ? 'Situação C6 atualizada pela consulta oficial. Nenhuma cobrança nova foi emitida.'
            : 'Nenhum boleto C6 emitido para consultar. Nenhuma cobrança nova foi emitida.',
        );
        return;
      }
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
      invalidateSaleRevenueSplitView(saleId);
      setSplitTick((value) => value + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  async function fetchCarneBlob(): Promise<{ blob: Blob; filename: string; incomplete: boolean }> {
    if (!saleId) throw new Error('Venda não identificada');
    const path =
      chargeProvider === 'INTER'
        ? '/api/finance/inter/sale-charges/carne-pdf'
        : chargeProvider === 'C6'
          ? '/api/finance/c6/sale-charges/carne-pdf'
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
    const incomplete = res.headers.get('X-Carne-Incomplete') === '1';
    return { blob, filename, incomplete };
  }

  async function downloadCarne() {
    setPdfBusy(true);
    setError('');
    try {
      const { blob, filename, incomplete } = await fetchCarneBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setInfo(
        incomplete
          ? 'Carnê incompleto baixado, somente com os boletos C6 já emitidos. Nenhuma cobrança nova foi emitida.'
          : 'PDF do carnê baixado. Nenhuma cobrança nova foi emitida.',
      );
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
          : chargeProvider === 'C6'
            ? '/api/finance/c6/sale-charges/carne-email'
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
      <AssistantSaleChargesUiBridge summary={summary} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-gray-900">Cobranças da venda</h4>
          <p className="text-xs text-gray-500">
            Somente parcelas desta venda ·{' '}
            {chargeProvider === 'INTER' ? 'Banco Inter' : chargeProvider === 'C6' ? 'C6 Bank' : 'Asaas Company'}
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
                      : chargeProvider === 'C6'
                        ? 'bg-violet-100 text-violet-900'
                        : 'bg-sky-100 text-sky-900'
                  }`}
                >
                  {chargeProvider === 'INTER' ? 'Banco Inter' : chargeProvider === 'C6' ? 'C6 Bank' : 'Asaas'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Kpi label="Parcelas" value={String(kpi.totalInstallments)} />
            <Kpi label="Pagas" value={String(kpi.paidInstallments)} />
            <Kpi label="Boletos emitidos" value={String(kpi.chargesGenerated)} />
            <Kpi label="Sem boleto" value={String(kpi.chargesMissing)} />
            {chargeProvider === 'C6' ? <Kpi label="Vencidas" value={String(c6OverdueCount)} /> : null}
            <Kpi label="Com erro" value={String(kpi.chargesFailed)} />
            <Kpi label="Canceladas" value={String(kpi.chargesCancelled)} />
            <Kpi
              label="1º vencimento"
              value={kpi.firstDueDate || '—'}
            />
            <Kpi label="Último venc." value={kpi.lastDueDate || '—'} />
            <Kpi label="Valor total" value={formatCurrencyBRL(kpi.totalAmount)} />
            <Kpi label="Valor recebido" value={formatCurrencyBRL(kpi.totalPaid)} />
            <Kpi label="Saldo a receber" value={formatCurrencyBRL(kpi.totalPending)} />
            <Kpi label="Elegíveis" value={String(kpi.eligibleInstallments)} />
          </div>

          <ChargeRevenueSplitDistribution key={splitTick} saleId={saleId} compact />

          {chargeProvider === 'C6' && c6Views.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-left text-xs text-gray-800">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Parcela</th>
                    <th className="px-2 py-2">Vencimento</th>
                    <th className="px-2 py-2">Valor</th>
                    <th className="px-2 py-2">Conta</th>
                    <th className="px-2 py-2">Financeiro</th>
                    <th className="px-2 py-2">Cobrança</th>
                    <th className="px-2 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {c6Views.map((view) => {
                    const charge = c6ChargeFor(view.id);
                    const paid =
                      view.installmentStatus === 'pago' || view.installmentStatus === 'paid';
                    return (
                      <tr key={view.id} className="border-t border-gray-100 align-top">
                        <td className="px-2 py-2 font-semibold">{view.parcelLabel}</td>
                        <td className="px-2 py-2">{view.dueDateLabel}</td>
                        <td className="px-2 py-2">{formatCurrencyBRL(view.amount)}</td>
                        <td className="px-2 py-2">{view.financialAccountLabel || kpi.financialAccountName || 'C6 Bank'}</td>
                        <td className="px-2 py-2">{view.installmentStatusLabel}</td>
                        <td className="px-2 py-2">{view.chargeStatusLabel}</td>
                        <td className="px-2 py-2">
                          <ChargeInstallmentActions
                            view={view}
                            charge={charge}
                            installmentPaid={paid}
                            integrationActive={kpi.hasFinancialAccount}
                            companyAsaasEnabled={false}
                            chargeProvider="C6"
                            c6Notice={c6Notices[view.id] || null}
                            ownerReadOnly={disabled}
                            busy={c6ActionId === view.id}
                            c6ChargesLoaded
                            c6EmitAuthorized={c6AuthorizedIds.includes(view.id)}
                            onGenerate={() => void emitSaleC6Boleto(view.id)}
                            onRefreshStatus={() => void refreshSaleC6Charge(view.id)}
                            onCancel={() =>
                              setInfo('O cancelamento C6 permanece fora desta homologação.')
                            }
                            onRegenerate={() =>
                              setInfo('A segunda emissão permanece bloqueada. Consulte a cobrança já registrada.')
                            }
                            onCopyPix={() => void copySaleC6Text(view.id, 'pix')}
                            onCopyBarcodeLine={() => void copySaleC6Text(view.id, 'line')}
                            onWhatsApp={() =>
                              setInfo('O envio do boleto C6 por WhatsApp permanece no carnê, depois da emissão oficial.')
                            }
                            onViewPdf={() => void openSaleC6Pdf(view.id, true)}
                            onDownloadPdf={() => void openSaleC6Pdf(view.id, false)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {generating && progress ? (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
              Gerando cobranças: {progress.done} de {progress.total}
            </div>
          ) : null}

          {chargeProvider === 'INTER' && resumeJob ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              Retomada Inter: <strong>{resumeJob.status}</strong>
              {' — '}
              emitidas {resumeJob.emitted + resumeJob.reused}/{resumeJob.planned}
              {', '}faltantes {resumeJob.remaining}
              {', '}erros {resumeJob.failed}
              {resumeJob.rateLimitedUntil ? ' (aguardando limite da API)' : ''}
              {resumeJob.mode === 'deferred' ? ' — emissão live desabilitada (flag)' : ''}
              {resumeJob.manualReconcile ? `, conciliação manual ${resumeJob.manualReconcile}` : ''}
              {resumeJob.lastError ? ` — ${resumeJob.lastError}` : ''}
            </div>
          ) : null}

          {lastErrors.length > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <p className="font-semibold">{lastErrors.length} parcela(s) com erro</p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                {lastErrors.slice(0, 30).map((e) => (
                  <li key={e.installmentId}>
                    {e.installmentId.slice(0, 8)}… — {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {chargeProvider === 'C6' ? (
              <>
                <button
                  type="button"
                  disabled
                  title="A emissão em lote permanece bloqueada nesta homologação. Use o botão da parcela autorizada."
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  Gerar boletos pendentes
                </button>
                <p className="w-full text-xs text-gray-600">
                  Emissão em lote permanece bloqueada até a aprovação do primeiro boleto real. O boleto individual usa o botão da parcela autorizada.
                </p>
              </>
            ) : (
            <button
              type="button"
              disabled={!canMutate || !kpi.hasFinancialAccount || kpi.chargesMissing <= 0}
              onClick={() => openGenerateModal()}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-40"
            >
              {generating ? 'Gerando…' : 'Gerar cobranças faltantes'}
            </button>
            )}
            {chargeProvider === 'INTER' ? (
              <>
                <button
                  type="button"
                  disabled={
                    !canMutate ||
                    !kpi.hasFinancialAccount ||
                    resumeJob?.status === 'running' ||
                    resumeJob?.status === 'queued' ||
                    (kpi.chargesMissing <= 0 && resumeJob?.status !== 'paused' && resumeJob?.status !== 'failed')
                  }
                  onClick={() => void runContinueMissing()}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-40"
                >
                  {resumeBusy ? 'Processando…' : 'Continuar cobranças faltantes'}
                </button>
                {resumeJob && (resumeJob.status === 'running' || resumeJob.status === 'queued') ? (
                  <button
                    type="button"
                    disabled={resumeBusy}
                    onClick={() => void runPauseResume()}
                    className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 disabled:opacity-40"
                  >
                    Pausar retomada
                  </button>
                ) : null}
              </>
            ) : null}
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

          {chargeProvider === 'C6' && !kpi.carneReady ? (
            <p className="text-xs text-amber-800">
              Nenhum boleto C6 emitido. Emita a parcela autorizada nesta lista. Depois use Gerar carnê em PDF. O download, a impressão e o e-mail não emitem boleto. A capa continua na aba Capa do Carnê.
            </p>
          ) : kpi.carneBlockReason ? (
            <p
              className={`text-xs ${
                kpi.carneReady ? 'text-slate-700' : 'text-amber-800'
              }`}
            >
              {chargeProvider === 'C6' && kpi.carneReady
                ? `${kpi.carneBlockReason} Carnê incompleto: o PDF leva só os boletos já emitidos e não emite os demais.`
                : kpi.carneBlockReason}
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

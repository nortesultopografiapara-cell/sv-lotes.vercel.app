'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Check,
  Download,
  Eye,
  EyeOff,
  FileWarning,
  FileX,
  Handshake,
  Info,
  Loader2,
  ScrollText,
  ShieldAlert,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { formatCurrencyBRL, parseCurrencyBRL } from '@/lib/currencyBrl';
import { calculateTerminationSettlement } from '@/lib/contract-termination/calculateSettlement';
import {
  engineHasImprovementsFlag,
  validateImprovementsForRelease,
  type ImprovementAppraisalStatus,
} from '@/lib/contract-termination/improvements';
import type { SettlementDestination } from '@/lib/contract-termination/types';
import { shouldDefineRefundSchedule } from '@/lib/termination-documents/refundSchedule';
import {
  buildReleaseLotConfirmFooterNotices,
  computeReleaseLotConfirmEnabled,
  passwordStateFromInputValue,
} from '@/lib/finance/releaseLotConfirmUx';
import {
  canConfirmReleaseLot,
  isDeferredSaleOperation,
  isLotReleaseSaleOperation,
  SALE_OPERATION_UI_GROUPS,
  SALE_OPERATION_UI_OPTIONS,
  showsTerminationSettlement,
  type SaleOperationUiCode,
  type ReleaseLotPreview,
  validateReleaseLotMotive,
} from '@/lib/finance/releaseLotShared';
import { isSaleLotSwapOperation } from '@/lib/finance/saleLotSwap';
import { ReleaseLotSettlementSection, type ImprovementDraftItem } from '@/components/map/ReleaseLotSettlementSection';
import { LotSwapPreviewPanel } from '@/components/map/LotSwapPreviewPanel';
import { TerminationDocumentSignatureActions } from '@/components/map/TerminationDocumentSignatureActions';
import { SALE_DOCUMENT_TYPE_LABELS } from '@/lib/saleDocuments';
import {
  evaluateInadimplenciaPolicy,
  INADIMPLENCIA_NO_DEFAULT_MESSAGE,
} from '@/lib/finance/inadimplenciaGuards';
import { supabase } from '@/lib/supabase';

function terminationSuccessFallbackMessage(code: string): string {
  const key = String(code || '').trim();
  if (key === 'distrato') return 'Distrato concluído com sucesso.';
  if (key === 'inadimplencia') return 'Inadimplência concluída com sucesso.';
  return 'Desistência concluída com sucesso.';
}

function terminationRetrySuccessMessage(code: string, documentNumber: string): string {
  const key = String(code || '').trim();
  if (key === 'distrato') {
    return [
      'Distrato concluído com sucesso.',
      '',
      SALE_DOCUMENT_TYPE_LABELS.DISTRATO,
      `nº ${documentNumber} gerado.`,
    ].join('\n');
  }
  if (key === 'inadimplencia') {
    return [
      'Inadimplência concluída com sucesso.',
      '',
      SALE_DOCUMENT_TYPE_LABELS.INADIMPLENCIA,
      `nº ${documentNumber} gerado.`,
    ].join('\n');
  }
  return [
    'Desistência concluída com sucesso.',
    '',
    SALE_DOCUMENT_TYPE_LABELS.DESISTENCIA,
    `nº ${documentNumber} gerado.`,
  ].join('\n');
}

const FIELD_CLASS =
  'form-input-light w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500';

function newImprovementDraft(): ImprovementDraftItem {
  return {
    id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: '',
    amount: '',
  };
}

const OPERATION_ICONS: Record<SaleOperationUiCode, typeof UserX> = {
  desistencia: UserX,
  distrato: Handshake,
  inadimplencia: Ban,
  erro_cadastro: FileWarning,
  troca_lote: ArrowLeftRight,
  cancelamento_administrativo: ShieldAlert,
  transferencia_titularidade: Users,
};

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

export type ReleaseLotConfirmModalProps = {
  lot: {
    id: string;
    block?: string | number | null;
    number?: string | number | null;
    status?: string | null;
    projectName?: string | null;
    customerName?: string | null;
    saleId?: string | null;
    sale_id?: string | null;
    contractId?: string | null;
    contract_id?: string | null;
  };
  price: number;
  userEmail: string | undefined;
  userRole: string | undefined;
  onClose: () => void;
  onSuccess: (result: {
    lotId: string;
    message: string;
    preservedPaidReceipts: number;
    totalPaidAmount: number;
    lotReleased?: boolean;
    ownershipTransferred?: boolean;
    newCustomerName?: string | null;
    keepModalOpen?: boolean;
    saleId?: string | null;
  }) => void;
};

export { canConfirmReleaseLot };

export function ReleaseLotConfirmModal({
  lot,
  price,
  userEmail,
  userRole,
  onClose,
  onSuccess,
}: ReleaseLotConfirmModalProps) {
  const [mounted, setMounted] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [preview, setPreview] = useState<ReleaseLotPreview | null>(null);
  const [motiveCode, setMotiveCode] = useState<SaleOperationUiCode | ''>('');
  const [motiveDetail, setMotiveDetail] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [hasImprovements, setHasImprovements] = useState<'sim' | 'nao'>('nao');
  const [improvementsAppraisalStatus, setImprovementsAppraisalStatus] =
    useState<ImprovementAppraisalStatus>('NONE');
  const [improvementItems, setImprovementItems] = useState<ImprovementDraftItem[]>([
    newImprovementDraft(),
  ]);
  const [destination, setDestination] = useState<SettlementDestination>('REFUND_CUSTOMER');
  const [exceptionEnabled, setExceptionEnabled] = useState(false);
  const [exceptionMode, setExceptionMode] = useState<'amount' | 'percent'>('amount');
  const [exceptionValue, setExceptionValue] = useState('');
  const [exceptionJustification, setExceptionJustification] = useState('');
  const [refundFirstDueDate, setRefundFirstDueDate] = useState('');
  const [documentSuccess, setDocumentSuccess] = useState<{
    message: string;
    saleId: string;
    documentNumber: string | null;
    documentStatus: string | null;
    html: string | null;
    canView: boolean;
    canDownload: boolean;
  } | null>(null);
  const [retryingPdf, setRetryingPdf] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (motiveCode !== 'distrato') {
      setExceptionEnabled(false);
      setExceptionValue('');
      setExceptionJustification('');
    }
  }, [motiveCode]);

  useEffect(() => {
    if (destination === 'CREDIT_OTHER_UNIT') {
      setRefundFirstDueDate('');
    }
  }, [destination]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/lots/${encodeURIComponent(lot.id)}/release`, {
          method: 'GET',
          credentials: 'include',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.message || json.error || 'Falha ao carregar a prévia da liberação.');
        }
        if (!cancelled) setPreview(json.preview as ReleaseLotPreview);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar prévia.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lot.id]);

  const liveSettlement = useMemo(() => {
    const ctx = preview?.settlementPreview;
    if (!ctx?.policy) return null;
    const parsedValue = Number(String(exceptionValue).replace(',', '.'));
    return calculateTerminationSettlement({
      policy: ctx.policy,
      receipts: ctx.receipts || [],
      motiveCode: motiveCode || null,
      hasImprovements: engineHasImprovementsFlag({
        hasImprovements: hasImprovements === 'sim',
        improvementsAppraisalStatus:
          hasImprovements === 'sim' ? improvementsAppraisalStatus : 'NONE',
      }),
      destination,
      exceptionOverride: exceptionEnabled
        ? {
            enabled: true,
            refundAmount:
              exceptionMode === 'amount' && Number.isFinite(parsedValue) ? parsedValue : null,
            retentionPercent:
              exceptionMode === 'percent' && Number.isFinite(parsedValue) ? parsedValue : null,
            justification: exceptionJustification,
          }
        : null,
    });
  }, [
    destination,
    exceptionEnabled,
    exceptionJustification,
    exceptionMode,
    exceptionValue,
    hasImprovements,
    improvementsAppraisalStatus,
    motiveCode,
    preview?.settlementPreview,
  ]);

  const parsedImprovementItems = useMemo(
    () =>
      improvementItems.map((item, index) => ({
        id: item.id,
        order: index + 1,
        description: item.description,
        amount: parseCurrencyBRL(item.amount) ?? 0,
      })),
    [improvementItems],
  );

  const improvementsCheck = useMemo(
    () =>
      validateImprovementsForRelease({
        hasImprovements: hasImprovements === 'sim',
        appraisalStatus: hasImprovements === 'sim' ? improvementsAppraisalStatus : 'NONE',
        items: parsedImprovementItems,
        destination,
      }),
    [destination, hasImprovements, improvementsAppraisalStatus, parsedImprovementItems],
  );

  const improvementsTotal =
    improvementsCheck.ok && improvementsCheck.record.appraisalStatus === 'COMPLETED'
      ? improvementsCheck.record.total
      : 0;

  const deferredOperation = isDeferredSaleOperation(motiveCode);
  const lotSwapOperation = isSaleLotSwapOperation(motiveCode);
  const releaseOperation = isLotReleaseSaleOperation(motiveCode);
  const showSettlement = showsTerminationSettlement(motiveCode);
  const swapSaleId = String(lot.saleId || lot.sale_id || preview?.saleId || '').trim();
  const needsRefundSchedule = Boolean(
    showSettlement &&
      liveSettlement &&
      shouldDefineRefundSchedule({
        destination,
        agreedRefundAmount: liveSettlement.agreedRefundAmount,
        contractualRefundAmount: liveSettlement.contractualRefundAmount,
        installmentCount: liveSettlement.refundInstallmentCount,
        calculationStatus: liveSettlement.calculationStatus,
        improvementsTotal,
        scheduleTotal:
          (liveSettlement.agreedRefundAmount != null
            ? Number(liveSettlement.agreedRefundAmount)
            : Number(liveSettlement.contractualRefundAmount || 0)) + improvementsTotal,
      }),
  );

  const inadimplenciaPolicy = useMemo(
    () =>
      motiveCode === 'inadimplencia'
        ? evaluateInadimplenciaPolicy(liveSettlement?.calculationStatus)
        : { ok: true, error: null, code: null },
    [liveSettlement?.calculationStatus, motiveCode],
  );

  const confirmEnabled = useMemo(
    () =>
      computeReleaseLotConfirmEnabled({
        releaseOperation,
        motiveCode,
        motiveDetail,
        acknowledged,
        password,
        loading,
        asaasBlockedCharges: preview?.asaasBlockedCharges,
        interBlockedCharges: preview?.interBlockedCharges,
        needsRefundSchedule,
        refundFirstDueDate,
        showSettlement,
        improvementsCheckOk: improvementsCheck.ok,
        inadimplenciaEligible:
          motiveCode === 'inadimplencia' ? Boolean(preview?.inadimplenciaEligible) : true,
        inadimplenciaPolicyOk: inadimplenciaPolicy.ok,
      }),
    [
      acknowledged,
      improvementsCheck.ok,
      inadimplenciaPolicy.ok,
      loading,
      motiveCode,
      motiveDetail,
      needsRefundSchedule,
      password,
      preview?.asaasBlockedCharges,
      preview?.inadimplenciaEligible,
      preview?.interBlockedCharges,
      refundFirstDueDate,
      releaseOperation,
      showSettlement,
    ],
  );

  const confirmFooterNotices = useMemo(
    () =>
      buildReleaseLotConfirmFooterNotices({
        showSettlement,
        improvementsCheckOk: improvementsCheck.ok,
        improvementsCheckError: improvementsCheck.ok ? null : improvementsCheck.error,
        needsRefundSchedule,
        refundFirstDueDate,
        asaasBlockedCharges: preview?.asaasBlockedCharges,
        interBlockedCharges: preview?.interBlockedCharges,
        motiveCode,
        inadimplenciaEligible:
          motiveCode === 'inadimplencia' ? preview?.inadimplenciaEligible : undefined,
        inadimplenciaPolicyError: inadimplenciaPolicy.error,
      }),
    [
      improvementsCheck,
      inadimplenciaPolicy.error,
      motiveCode,
      needsRefundSchedule,
      preview?.asaasBlockedCharges,
      preview?.inadimplenciaEligible,
      preview?.interBlockedCharges,
      refundFirstDueDate,
      showSettlement,
    ],
  );

  const syncPasswordFromInput = (el: HTMLInputElement) => {
    setPassword(passwordStateFromInputValue(el.value));
  };

  useEffect(() => {
    if (!releaseOperation) return;
    const el = passwordInputRef.current;
    if (!el) return;
    const sync = () => {
      setPassword(passwordStateFromInputValue(el.value));
    };
    sync();
    const t1 = window.setTimeout(sync, 50);
    const t2 = window.setTimeout(sync, 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [releaseOperation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || loading) return;
    if (!userRole || !userRole.toUpperCase().includes('ADMIN')) {
      setError('Apenas administradores podem liberar o lote.');
      return;
    }
    if (!motiveCode) {
      setError('Selecione a operação da venda.');
      return;
    }
    if (isDeferredSaleOperation(motiveCode) || !isLotReleaseSaleOperation(motiveCode)) {
      setError(
        'Este procedimento será executado em etapa própria. A liberação do lote não se aplica.',
      );
      return;
    }
    const motive = validateReleaseLotMotive({ motiveCode, motiveDetail });
    if (!motive.ok) {
      setError(motive.error);
      return;
    }
    if (motive.motiveCode === 'inadimplencia') {
      if (preview && preview.inadimplenciaEligible === false) {
        setError(INADIMPLENCIA_NO_DEFAULT_MESSAGE);
        return;
      }
      if (!inadimplenciaPolicy.ok) {
        setError(inadimplenciaPolicy.error || INADIMPLENCIA_NO_DEFAULT_MESSAGE);
        return;
      }
    }
    if (!acknowledged) {
      setError('Marque a confirmação de ciência.');
      return;
    }
    if (!password) {
      setError('Informe sua senha para continuar.');
      return;
    }
    if (needsRefundSchedule && !refundFirstDueDate) {
      setError('Informe o vencimento da 1ª parcela de restituição.');
      return;
    }
    if (showSettlement && !improvementsCheck.ok) {
      setError(improvementsCheck.error);
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail || '',
        password,
      });
      if (signInError || !data.user) {
        setError('Senha inválida. A operação foi bloqueada.');
        return;
      }
      const res = await fetch(`/api/lots/${encodeURIComponent(lot.id)}/release`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motiveCode: motive.motiveCode,
          motiveDetail: motive.motiveDetail,
          acknowledged: true,
          hasImprovements: hasImprovements === 'sim',
          improvementsAppraisalStatus:
            hasImprovements === 'sim' ? improvementsAppraisalStatus : 'NONE',
          improvementsAppraisalCompleted:
            hasImprovements === 'sim' && improvementsAppraisalStatus === 'COMPLETED',
          improvementItems:
            hasImprovements === 'sim' && improvementsAppraisalStatus === 'COMPLETED'
              ? parsedImprovementItems
              : [],
          refundDestination: destination,
          exceptionalAgreement: motive.motiveCode === 'distrato' && exceptionEnabled,
          exceptionalReason:
            motive.motiveCode === 'distrato' && exceptionEnabled
              ? exceptionJustification
              : null,
          exceptionalRefundAmount:
            motive.motiveCode === 'distrato' &&
            exceptionEnabled &&
            exceptionMode === 'amount'
              ? Number(String(exceptionValue).replace(',', '.'))
              : null,
          exceptionalRetentionPercent:
            motive.motiveCode === 'distrato' &&
            exceptionEnabled &&
            exceptionMode === 'percent'
              ? Number(String(exceptionValue).replace(',', '.'))
              : null,
          refundFirstDueDate: needsRefundSchedule ? refundFirstDueDate || null : null,
          idempotencyKey: preview?.idempotencyKey || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.success === false) {
        const stage = json.stage ? `\nEtapa: ${json.stage}` : '';
        const code = json.code ? `\nCódigo: ${json.code}` : '';
        setError(
          `${String(json.message || json.error || 'Não foi possível liberar o lote.')}${stage}${code}`,
        );
        return;
      }
      const term = (json.terminationDocument || null) as {
        documentNumber?: string | null;
        documentStatus?: string | null;
        html?: string | null;
        canView?: boolean;
        canDownload?: boolean;
        saleId?: string | null;
      } | null;
      const saleId = String(json.saleId || term?.saleId || lot.saleId || lot.sale_id || '');
      const keepOpen = json.keepModalOpen === true || Boolean(term?.canView);
      if (keepOpen && term) {
        setDocumentSuccess({
          message: String(json.message || terminationSuccessFallbackMessage(motiveCode)),
          saleId,
          documentNumber: term.documentNumber || null,
          documentStatus: term.documentStatus || null,
          html: term.html || null,
          canView: Boolean(term.canView),
          canDownload: Boolean(term.canDownload),
        });
      }
      onSuccess({
        lotId: String(json.lotId || lot.id),
        message: String(json.message || 'Lote liberado e venda encerrada.'),
        preservedPaidReceipts: Number(json.preservedPaidReceipts || preview?.paidReceipts || 0),
        totalPaidAmount: Number(json.totalPaidAmount || preview?.totalPaidAmount || 0),
        lotReleased: true,
        ownershipTransferred: false,
        newCustomerName: null,
        keepModalOpen: keepOpen,
        saleId: saleId || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao liberar o lote.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const openFrozenTerm = () => {
    if (!documentSuccess) return;
    if (documentSuccess.html) {
      const blob = new Blob([documentSuccess.html], { type: 'text/html;charset=utf-8' });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
      return;
    }
    if (documentSuccess.saleId) {
      window.open(
        `/api/sales/${encodeURIComponent(documentSuccess.saleId)}/termination-document?format=html`,
        '_blank',
        'noopener,noreferrer',
      );
    }
  };

  const downloadTermPdf = () => {
    if (!documentSuccess?.saleId || !documentSuccess.canDownload) return;
    window.open(
      `/api/sales/${encodeURIComponent(documentSuccess.saleId)}/termination-document/pdf`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const retryTermPdf = async () => {
    if (!documentSuccess?.saleId || retryingPdf) return;
    setRetryingPdf(true);
    setError('');
    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(documentSuccess.saleId)}/termination-document`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retry: true }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.success === false) {
        throw new Error(String(json.error || 'Não foi possível gerar o PDF.'));
      }
      setDocumentSuccess((prev) =>
        prev
          ? {
              ...prev,
              documentNumber: String(json.documentNumber || prev.documentNumber || ''),
              documentStatus: String(json.documentStatus || 'GENERATED'),
              html: typeof json.html === 'string' ? json.html : prev.html,
              canView: json.canView !== false,
              canDownload: json.canDownload === true,
              message: terminationRetrySuccessMessage(
                motiveCode,
                String(json.documentNumber || prev.documentNumber),
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar o PDF.');
    } finally {
      setRetryingPdf(false);
    }
  };

  if (!mounted) return null;

  const statusLabel = preview?.status || String(lot.status || '—');
  const contractLabel = preview?.contractNumber
    ? `${preview.contractNumber}${preview.contractSigned ? ' · assinado' : ''}`
    : preview?.contractId || lot.contractId || lot.contract_id
      ? 'Sem número'
      : 'Sem contrato';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 font-sans pointer-events-auto text-slate-900"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="bg-white w-full max-w-[1000px] max-h-[94vh] flex flex-col rounded-xl shadow-2xl animate-in fade-in zoom-in duration-200 z-[10000] text-slate-900">
        <div className="shrink-0 px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg text-slate-900">Operações da venda</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Encerramento devolve o lote ao estoque. Troca de lote e transferência de
              titularidade não usam esta liberação.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {documentSuccess ? (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                <p className="text-sm font-semibold whitespace-pre-line">{documentSuccess.message}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {documentSuccess.canView ? (
                    <button
                      type="button"
                      onClick={openFrozenTerm}
                      className="inline-flex items-center gap-2 rounded-lg bg-white border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
                    >
                      <Eye className="w-4 h-4" />
                      Visualizar termo
                    </button>
                  ) : null}
                  {documentSuccess.canDownload ? (
                    <button
                      type="button"
                      onClick={downloadTermPdf}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                      <Download className="w-4 h-4" />
                      Baixar PDF
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={retryTermPdf}
                      disabled={retryingPdf}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:bg-slate-300"
                    >
                      {retryingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Tentar gerar PDF
                    </button>
                  )}
                  <TerminationDocumentSignatureActions
                    saleId={documentSuccess.saleId}
                    canDownloadOriginal={documentSuccess.canDownload}
                  />
                </div>
                {documentSuccess.documentNumber ? (
                  <p className="mt-3 text-sm text-emerald-900">
                    Número do termo:{' '}
                    <strong>{documentSuccess.documentNumber}</strong>
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-emerald-800">
                  O documento também ficará em Documentos da Venda, vinculado à venda original.
                  Após a assinatura completa, use Baixar documento assinado.
                </p>
              </section>
            ) : previewLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando posição da venda…
              </div>
            ) : (
              <>
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Resumo da venda
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    <SummaryCard
                      label="Projeto"
                      value={String(lot.projectName || '—')}
                    />
                    <SummaryCard
                      label="Quadra / Lote"
                      value={`${preview?.quadra || lot.block || '—'} / ${preview?.lote || lot.number || '—'}`}
                    />
                    <SummaryCard
                      label="Cliente"
                      value={preview?.customerName || lot.customerName || '—'}
                    />
                    <SummaryCard label="Nº do contrato" value={contractLabel} />
                    <SummaryCard label="Status atual" value={statusLabel} />
                    <SummaryCard label="Valor" value={money(preview?.price ?? price)} />
                    <SummaryCard
                      label="Parcelas pagas"
                      value={`${preview?.paidReceipts ?? 0} · ${money(preview?.totalPaidAmount)}`}
                    />
                    <SummaryCard
                      label="Parcelas pendentes"
                      value={String(preview?.pendingReceipts ?? 0)}
                    />
                    <SummaryCard
                      label="Parcelas atrasadas"
                      value={String(preview?.overdueReceipts ?? 0)}
                    />
                    <SummaryCard
                      label="Cobranças Asaas canceláveis"
                      value={String(preview?.openAsaasCharges ?? 0)}
                    />
                    <SummaryCard
                      label="Cobranças bancárias canceláveis"
                      value={String(preview?.openCancelableCharges ?? 0)}
                    />
                    <SummaryCard
                      label="Documentos preservados"
                      value={String(preview?.documentsPreserved ?? 0)}
                    />
                  </div>
                  {(preview?.openInterCharges || 0) > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      Cobranças Inter canceláveis: {preview?.openInterCharges}.
                    </p>
                  )}
                </section>

                {(preview?.asaasBlockedCharges || 0) > 0 && (
                  <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-3 text-xs flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      Há cobrança(s) Asaas que não podem ser canceladas automaticamente (
                      {preview?.asaasBlockedCharges}). A liberação fica bloqueada até regularizar.
                    </div>
                  </div>
                )}
                {(preview?.interBlockedCharges || 0) > 0 && (
                  <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-3 text-xs flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      Há cobrança(s) Banco Inter que não podem ser canceladas automaticamente (
                      {preview?.interBlockedCharges}).
                    </div>
                  </div>
                )}
                {preview?.hasPreservedPayments && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-xs flex gap-2">
                    <ScrollText className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Existem pagamentos preservados nesta venda.</strong> Eles
                      continuarão no Financeiro e poderão ser utilizados em processo futuro de
                      devolução ou compensação.
                    </div>
                  </div>
                )}

                <section>
                  <p className="text-sm font-semibold text-slate-800">
                    Escolha a operação da venda <span className="text-red-500">*</span>
                  </p>
                  <p className="mt-1 mb-3 text-xs text-slate-500">
                    Selecione o procedimento que será realizado para esta venda.
                  </p>
                  <div className="space-y-5">
                    {SALE_OPERATION_UI_GROUPS.map((group) => {
                      const options = SALE_OPERATION_UI_OPTIONS.filter((option) =>
                        group.codes.includes(option.value),
                      );
                      return (
                        <div key={group.id}>
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                            {group.label}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
                            {options.map((option) => {
                              const Icon = OPERATION_ICONS[option.value];
                              const selected = motiveCode === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => {
                                    setMotiveCode(option.value);
                                    if (option.value !== 'cancelamento_administrativo') {
                                      setMotiveDetail('');
                                    }
                                  }}
                                  className={`h-full min-h-[148px] w-full text-left rounded-xl border p-3.5 transition-colors ${
                                    selected
                                      ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-400'
                                      : 'border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/40'
                                  }`}
                                >
                                  <div className="flex h-full items-start gap-2.5">
                                    <span
                                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                        selected
                                          ? 'bg-orange-500 text-white'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      <Icon className="w-4 h-4" />
                                    </span>
                                    <span className="min-w-0">
                                      <span className="block text-sm font-semibold text-slate-900">
                                        {option.label}
                                      </span>
                                      {option.supportLabel ? (
                                        <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                                          {option.supportLabel}
                                        </span>
                                      ) : null}
                                      <span className="mt-1 block text-xs text-slate-600 leading-snug">
                                        {option.description}
                                      </span>
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {motiveCode === 'cancelamento_administrativo' && (
                    <div className="mt-3">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Justificativa administrativa <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={motiveDetail}
                        onChange={(e) => setMotiveDetail(e.target.value)}
                        className={FIELD_CLASS}
                        rows={2}
                        placeholder="Informe a justificativa (mínimo 3 caracteres)"
                      />
                    </div>
                  )}
                  {motiveCode === 'distrato' && (
                    <div className="mt-3">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Motivo / justificativa do distrato <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={motiveDetail}
                        onChange={(e) => setMotiveDetail(e.target.value)}
                        className={FIELD_CLASS}
                        rows={2}
                        placeholder="Informe o motivo do distrato (mínimo 3 caracteres)"
                      />
                    </div>
                  )}
                  {motiveCode === 'inadimplencia' && (
                    <div className="mt-3">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Motivo / justificativa da inadimplência{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={motiveDetail}
                        onChange={(e) => setMotiveDetail(e.target.value)}
                        className={FIELD_CLASS}
                        rows={2}
                        placeholder="Informe o motivo da inadimplência (mínimo 3 caracteres)"
                      />
                      {preview && preview.inadimplenciaEligible === false ? (
                        <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          {INADIMPLENCIA_NO_DEFAULT_MESSAGE}
                        </p>
                      ) : null}
                    </div>
                  )}
                </section>

                {showSettlement && liveSettlement && preview?.settlementPreview?.policy ? (
                  <ReleaseLotSettlementSection
                    policy={preview.settlementPreview.policy}
                    settlement={liveSettlement}
                    origin={preview.settlementPreview.origin}
                    hasImprovements={hasImprovements}
                    onHasImprovements={(value) => {
                      setHasImprovements(value);
                      if (value === 'nao') {
                        setImprovementsAppraisalStatus('NONE');
                        setImprovementItems([newImprovementDraft()]);
                      } else {
                        setImprovementsAppraisalStatus((prev) =>
                          prev === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
                        );
                        setImprovementItems((prev) =>
                          prev.length > 0 ? prev : [newImprovementDraft()],
                        );
                      }
                    }}
                    improvementsAppraisalStatus={
                      hasImprovements === 'sim'
                        ? improvementsAppraisalStatus === 'NONE'
                          ? 'PENDING'
                          : improvementsAppraisalStatus
                        : 'NONE'
                    }
                    onImprovementsAppraisalStatus={setImprovementsAppraisalStatus}
                    improvementItems={improvementItems}
                    onImprovementItems={setImprovementItems}
                    destination={destination}
                    onDestination={setDestination}
                    allowException={motiveCode === 'distrato'}
                    exceptionEnabled={exceptionEnabled}
                    onExceptionEnabled={setExceptionEnabled}
                    exceptionMode={exceptionMode}
                    onExceptionMode={setExceptionMode}
                    exceptionValue={exceptionValue}
                    onExceptionValue={setExceptionValue}
                    exceptionJustification={exceptionJustification}
                    onExceptionJustification={setExceptionJustification}
                    refundFirstDueDate={refundFirstDueDate}
                    onRefundFirstDueDate={setRefundFirstDueDate}
                  />
                ) : null}

                {releaseOperation ? (
                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800 mb-2">O que acontecerá</p>
                    <ul className="space-y-1.5 text-sm text-slate-700">
                      <li className="flex gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        A venda atual será encerrada
                      </li>
                      <li className="flex gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        O lote voltará para o status Disponível
                      </li>
                      <li className="flex gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        Obrigações/parcelas pendentes serão encerradas conforme a lógica atual
                      </li>
                      <li className="flex gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        Cobranças externas canceláveis serão tratadas conforme integração existente
                      </li>
                      <li className="flex gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        Contrato, documentos e histórico permanecerão preservados
                      </li>
                    </ul>
                    <p className="mt-3 text-xs text-slate-500 flex gap-1.5">
                      <FileX className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      Encerramento não transfere titularidade nem substitui a unidade. Troca de
                      lote e cessão são operações independentes.
                    </p>
                  </section>
                ) : null}

                {lotSwapOperation ? (
                  swapSaleId ? (
                    <LotSwapPreviewPanel saleId={swapSaleId} onClose={onClose} />
                  ) : (
                    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                      Não foi possível identificar a venda deste lote para simular a troca.
                    </section>
                  )
                ) : null}

                {deferredOperation ? (
                  <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                    <p className="text-sm font-semibold text-indigo-950 mb-1 inline-flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0" />
                      Transferência de titularidade em etapa própria
                    </p>
                    <p className="text-sm text-indigo-900 leading-snug">
                      A posição contratual será transferida para um novo comprador em fluxo específico, preservando saldo e histórico. O lote permanece vinculado. Esta tela não chama a liberação, não torna o lote Disponível e não calcula restituição.
                    </p>
                    <p className="mt-2 text-xs text-indigo-800">
                      Nenhuma alteração será gravada agora. Use Cancelar para voltar ao mapa.
                    </p>
                  </section>
                ) : null}

                {releaseOperation ? (
                  <>
                    <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        className="mt-1"
                      />
                      <span>
                        Estou ciente de que esta operação encerrará a venda atual e tornará o lote novamente disponível.
                      </span>
                    </label>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Senha de administrador <span className="text-red-500">*</span>
                      </label>
                      <div className="relative max-w-md">
                        <input
                          ref={passwordInputRef}
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => syncPasswordFromInput(e.currentTarget)}
                          onInput={(e) => syncPasswordFromInput(e.currentTarget)}
                          onFocus={(e) => syncPasswordFromInput(e.currentTarget)}
                          onBlur={(e) => syncPasswordFromInput(e.currentTarget)}
                          className={`${FIELD_CLASS} pr-10`}
                          placeholder="Senha de acesso"
                          autoComplete="current-password"
                          style={{
                            color: '#0f172a',
                            WebkitTextFillColor: '#0f172a',
                            caretColor: '#0f172a',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            )}

            {error && (
              <p className="text-red-600 text-sm font-medium whitespace-pre-line">{error}</p>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 space-y-3">
            {confirmFooterNotices.length > 0 ? (
              <div className="space-y-2">
                {confirmFooterNotices.map((notice) => (
                  <p
                    key={notice.kind}
                    className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3"
                  >
                    {notice.message}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold rounded-lg text-sm"
            >
              {deferredOperation || lotSwapOperation ? 'Fechar' : documentSuccess ? 'Concluir' : 'Cancelar'}
            </button>
            {(releaseOperation || !motiveCode) && !documentSuccess ? (
              <button
                type="submit"
                disabled={!confirmEnabled}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold rounded-lg text-sm inline-flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirmar liberação do lote
              </button>
            ) : null}
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

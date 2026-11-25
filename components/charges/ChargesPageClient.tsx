'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Bell,
  Calendar,
  Download,
  FileText,
  Filter,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Wallet,
  Zap,
  QrCode,
} from 'lucide-react';
import { ChargeInstallmentActions } from '@/components/charges/ChargeInstallmentActions';
import { FinanceStatCard, FinanceStatusBadge } from '@/components/finance/FinancePremiumUI';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { isDevelopHomologRuntime } from '@/lib/homolog/env';
import { applyTenantFilter, resolveRlsContext } from '@/lib/rls';
import { ChargeWhatsAppBatchModal } from '@/components/charges/ChargeWhatsAppBatchModal';
import { BuyerReminderHistoryPanel } from '@/components/charges/BuyerReminderHistoryPanel';
import type { ChargeWhatsAppBatchSendResult } from '@/components/charges/ChargeWhatsAppBatchModal';
import type { ChargeWhatsAppBatchPreview } from '@/lib/charges/chargeWhatsAppBatch';
import {
  executeChargeWhatsAppShare,
  openChargeWhatsAppShareUrl,
  resolveChargeContractNumber,
  resolveChargeCustomerEmail,
  resolveChargeCustomerPhone,
  withCompanyAsaasChargeShareFieldsPreserved,
} from '@/lib/charges/chargeWhatsAppMessage';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import type { AsaasIntegrationConfigResponse } from '@/lib/finance/asaasIntegrationConfig';
import {
  formatFinancialAccountLabel,
  type CompanyFinancialAccountResponse,
} from '@/lib/finance/companyFinancialAccountTypes';
import {
  resolveChargesEmitProviderByAccountId,
  isConfirmedPersistedProviderCharge,
  type ChargesEmitProvider,
} from '@/lib/charges/chargeProviderRouting';
import { resolveCompanyAsaasPaymentLink } from '@/lib/finance/companyAsaasChargeWorkflow';
import {
  buildChargeInstallmentView,
  chargeParcelLabelContext,
  computeChargeKpiSummary,
  filterChargeInstallments,
  type ChargeInstallmentView,
  type FinanceReceiptRow,
} from '@/lib/charges/chargeInstallmentHelpers';
import {
  countSelectedGeneratableCharges,
  countSelectedWithAsaasCharge,
  resolveAsaasSyncInstallmentIds,
  resolveChargesIntegrationReady,
} from '@/lib/charges/chargeIntegrationHelpers';
import {
  canGenerateAsaasCharge,
  canOfferChargeGenerateInUi,
  chunkInstallmentIdsForChargeFetch,
  computeAsaasOperationalKpis,
  isInstallmentPaidForCharges,
  mapCreateChargeApiError,
  mergeFetchedChargesIntoMap,
} from '@/lib/charges/chargeOperationsHelpers';
import {
  applyBulkChargeStatusToMap,
  formatChargeBulkStatusSummary,
  listChargesNotUpdatedForAccount,
  requestChargeBulkStatusSync,
} from '@/lib/charges/chargeBulkStatusSync';
import {
  asaasRowMayUseLinkedAccount,
  classifyAsaasIntegrationResponse,
  formatChargesAsaasIntegrationGate,
  formatRefreshAllChargesBlockReason,
  overviewGateAllowsPerChargeAsaasSync,
  resolveAsaasRowAccountState,
  resolveRefreshAllChargesBlockReason,
  type ChargesAsaasIntegrationGate,
} from '@/lib/finance/companyAsaasChargeLinkGuards';
import {
  fetchOwnerProjectOptionsForModule,
  loadOwnerAccessContext,
  resolveFinanceProjectsFilterNames,
  resolveFinanceProjectsForUser,
  resolveReceiptProjectId,
  scopeFinanceRowsForUser,
  shouldApplyOwnerFinanceScope,
} from '@/lib/ownerProjectAccess';
import { isOwnerRole } from '@/lib/rolePermissions';
import { blockOwnerWriteOnClient } from '@/lib/ownerWriteGuard';
import {
  FINANCE_RECEIPTS_LIST_SELECT,
  FINANCE_RECEIPTS_LIST_SELECT_FALLBACK,
} from '@/lib/finance/financeReceiptsEmbed';
import {
  DEFAULT_FINANCE_RECEIPTS_UI_PAGE_SIZE,
  FINANCE_RECEIPTS_UI_PAGE_SIZES,
  fetchFinanceReceiptsProgressive,
  financeDatasetReadyForTotals,
  isFinanceLoadAbort,
  normalizeFinanceReceiptsUiPageSize,
  paginateFinanceReceiptRows,
  type FinanceReceiptsUiPageSize,
} from '@/lib/finance/fetchFinanceReceiptsPaged';
import { publishFinanceNotificationSource } from '@/lib/finance/financeNotificationAlerts';
import {
  CHARGE_LIST_EXPORT_SCOPE,
  downloadChargeListExcel,
  downloadChargeListPdf,
} from '@/lib/charges/chargeListExport';

const STATUS_OPTIONS = ['Todas', 'Pendente', 'Vencido', 'Pago', 'Cancelado'] as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

async function copyText(value: string): Promise<boolean> {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export type ChargesPageClientProps = {
  bankingUiEnabled: boolean;
};

export function ChargesPageClient({ bankingUiEnabled }: ChargesPageClientProps) {
  const homologOutboundBlocked = isDevelopHomologRuntime();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totalsReady, setTotalsReady] = useState(false);
  const [chargeStatusReady, setChargeStatusReady] = useState(false);
  const [c6ChargesLoaded, setC6ChargesLoaded] = useState(false);
  const [c6EmitAuthorizedIds, setC6EmitAuthorizedIds] = useState<Set<string>>(new Set());
  const [payments, setPayments] = useState<FinanceReceiptRow[]>([]);
  const chargeLoadAbortRef = useRef<AbortController | null>(null);
  const [projectsList, setProjectsList] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>('Todas');
  const [projectFilter, setProjectFilter] = useState('Todos os projetos');
  const [financialAccountFilter, setFinancialAccountFilter] = useState('Todas as contas');
  const [financialAccounts, setFinancialAccounts] = useState<CompanyFinancialAccountResponse[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [asaasChargesByInstallment, setAsaasChargesByInstallment] = useState<
    Record<string, CompanyAsaasChargeResponse>
  >({});
  const [c6ChargesByInstallment, setC6ChargesByInstallment] = useState<
    Record<string, CompanyAsaasChargeResponse>
  >({});
  const [c6NoticeByInstallment, setC6NoticeByInstallment] = useState<
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
          externalReference?: string | null;
          bankStatus?: string | null;
          bankId?: string | null;
          traceId?: string | null;
          titleFound?: boolean;
        } | null;
      }
    >
  >({});
  const c6ChargesByInstallmentRef = useRef(c6ChargesByInstallment);
  c6ChargesByInstallmentRef.current = c6ChargesByInstallment;
  const [interChargesByInstallment, setInterChargesByInstallment] = useState<
    Record<string, CompanyAsaasChargeResponse>
  >({});
  const asaasChargesByInstallmentRef = useRef(asaasChargesByInstallment);
  asaasChargesByInstallmentRef.current = asaasChargesByInstallment;
  const interChargesByInstallmentRef = useRef(interChargesByInstallment);
  interChargesByInstallmentRef.current = interChargesByInstallment;
  const asaasChargeHistoryIdsRef = useRef<Set<string>>(new Set());
  const [asaasChargeHistoryIds, setAsaasChargeHistoryIds] = useState<Set<string>>(new Set());
  const [integrationConfig, setIntegrationConfig] =
    useState<AsaasIntegrationConfigResponse | null>(null);
  const [integrationApiReady, setIntegrationApiReady] = useState(false);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [asaasActionInstallmentId, setAsaasActionInstallmentId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [toastIsError, setToastIsError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<FinanceReceiptsUiPageSize>(
    DEFAULT_FINANCE_RECEIPTS_UI_PAGE_SIZE,
  );
  const [exportingKind, setExportingKind] = useState<'pdf' | 'excel' | null>(null);
  const [whatsAppBatchOpen, setWhatsAppBatchOpen] = useState(false);
  const [whatsAppBatchLoading, setWhatsAppBatchLoading] = useState(false);
  const [whatsAppBatchSending, setWhatsAppBatchSending] = useState(false);
  const [reminderOpsOpen, setReminderOpsOpen] = useState(false);
  const [whatsAppBatchError, setWhatsAppBatchError] = useState<string | null>(null);
  const [whatsAppBatchPreview, setWhatsAppBatchPreview] = useState<ChargeWhatsAppBatchPreview | null>(
    null,
  );
  const [whatsAppBatchResult, setWhatsAppBatchResult] =
    useState<ChargeWhatsAppBatchSendResult | null>(null);
  const whatsAppBatchIdempotencyRef = useRef<string | null>(null);

  const ownerReadOnly = isOwnerRole(user?.role);
  const [asaasAccessAvailable, setAsaasAccessAvailable] = useState(true);
  const [asaasGate, setAsaasGate] = useState<ChargesAsaasIntegrationGate>('pending');
  const [financialAccountsLoaded, setFinancialAccountsLoaded] = useState(false);
  const integrationActive = useMemo(
    () => resolveChargesIntegrationReady(integrationConfig, integrationApiReady),
    [integrationConfig, integrationApiReady],
  );
  const integrationReady = asaasAccessAvailable && integrationActive;
  const installmentsDataReady = totalsReady && !loadError;

  const financialAccountLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const account of financialAccounts) {
      map[account.id] = formatFinancialAccountLabel(account);
    }
    return map;
  }, [financialAccounts]);

  const financialAccountsById = useMemo(() => {
    const map: Record<string, CompanyFinancialAccountResponse> = {};
    for (const account of financialAccounts) {
      map[account.id] = account;
    }
    return map;
  }, [financialAccounts]);

  const resolveRowProvider = useCallback(
    (row: FinanceReceiptRow): ChargesEmitProvider => {
      const faId = String(
        row.financial_account_id ||
          (row.sales as { financial_account_id?: string } | undefined)?.financial_account_id ||
          '',
      ).trim();
      return resolveChargesEmitProviderByAccountId(faId, financialAccountsById);
    },
    [financialAccountsById],
  );

  const chargeForInstallment = useCallback(
    (installmentId: string, provider: ChargesEmitProvider) => {
      if (provider === 'INTER') {
        return interChargesByInstallment[installmentId] ?? null;
      }
      if (provider === 'C6') {
        return c6ChargesByInstallment[installmentId] ?? null;
      }
      return asaasChargesByInstallment[installmentId] ?? null;
    },
    [asaasChargesByInstallment, c6ChargesByInstallment, interChargesByInstallment],
  );

  const showToast = useCallback((message: string, isError = false) => {
    setToast(message);
    setToastIsError(isError);
    window.setTimeout(() => {
      setToast(null);
      setToastIsError(false);
    }, 3600);
  }, []);

  const applyAsaasChargeUpdate = useCallback(
    (installmentId: string, charge: CompanyAsaasChargeResponse) => {
      setAsaasChargesByInstallment((prev) => ({
        ...prev,
        [installmentId]: withCompanyAsaasChargeShareFieldsPreserved(
          prev[installmentId],
          charge,
        ),
      }));
    },
    [],
  );

  const applyInterChargeUpdate = useCallback(
    (installmentId: string, charge: CompanyAsaasChargeResponse) => {
      setInterChargesByInstallment((prev) => ({
        ...prev,
        [installmentId]: charge,
      }));
    },
    [],
  );

  const loadIntegrationStatus = useCallback(async (): Promise<boolean> => {
    setIntegrationLoading(true);
    try {
      const res = await fetch(`/api/finance/asaas/integration?_=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      const errorMessage = typeof json.error === 'string' ? json.error : null;
      const apiReady = Boolean(json.ready ?? json.canOperate);
      const gate = classifyAsaasIntegrationResponse(res.status, res.ok && apiReady, errorMessage);
      setAsaasGate(gate);
      if (res.status === 403 || res.status === 404) {
        setAsaasAccessAvailable(false);
        setIntegrationConfig(null);
        setIntegrationApiReady(false);
        return false;
      }
      setAsaasAccessAvailable(true);
      if (!res.ok) {
        setIntegrationConfig(null);
        setIntegrationApiReady(false);
        return overviewGateAllowsPerChargeAsaasSync(gate);
      }
      const integration = (json.integration ?? null) as AsaasIntegrationConfigResponse | null;
      setIntegrationConfig(integration);
      setIntegrationApiReady(apiReady);
      return resolveChargesIntegrationReady(integration, apiReady) || overviewGateAllowsPerChargeAsaasSync(gate);
    } catch (err) {
      console.error('CHARGES_INTEGRATION_LOAD', err);
      setAsaasGate('query_error');
      setIntegrationConfig(null);
      setIntegrationApiReady(false);
      return false;
    } finally {
      setIntegrationLoading(false);
    }
  }, []);

  const loadChargeMap = useCallback(async (installmentIds: string[]) => {
    if (installmentIds.length === 0) {
      setAsaasChargesByInstallment({});
      return {} as Record<string, CompanyAsaasChargeResponse>;
    }

    try {
      let map = { ...asaasChargesByInstallmentRef.current };
      const chunks = chunkInstallmentIdsForChargeFetch(installmentIds);
      const allSyncErrors: Array<{
        chargeId?: string;
        installmentId: string;
        error: string;
      }> = [];

      for (const chunk of chunks) {
        // POST evita truncamento de URL com muitas parcelas; inclui PAID/canceladas.
        const chargesRes = await fetch('/api/finance/asaas/charges', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installmentIds: chunk, reconcilePaidReceipts: false }),
        });
        if (chargesRes.status === 403 || chargesRes.status === 404) {
          console.error('CHARGES_ASAAS_LOAD_FORBIDDEN', chargesRes.status);
          return asaasChargesByInstallmentRef.current;
        }
        if (!chargesRes.ok) {
          console.error('CHARGES_ASAAS_LOAD_HTTP', chargesRes.status);
          return asaasChargesByInstallmentRef.current;
        }
        const chargesJson = await chargesRes.json().catch(() => ({}));
        const charges = (chargesJson.charges || []) as CompanyAsaasChargeResponse[];
        const syncErrors = (chargesJson.receiptSyncErrors || []) as Array<{
          chargeId?: string;
          installmentId: string;
          error: string;
        }>;
        if (syncErrors.length > 0) {
          allSyncErrors.push(...syncErrors);
        }
        map = mergeFetchedChargesIntoMap(map, chunk, charges);
        for (const charge of charges) {
          if (charge.asaasPaymentId) {
            asaasChargeHistoryIdsRef.current.add(String(charge.installmentId));
          }
        }
      }

      if (allSyncErrors.length > 0) {
        console.error('CHARGES_RECEIPT_SYNC_ERRORS', allSyncErrors);
        showToast(
          allSyncErrors[0]?.error ||
            'Falha ao sincronizar parcela paga com o Financeiro.',
          true,
        );
      }

      setAsaasChargeHistoryIds(new Set(asaasChargeHistoryIdsRef.current));
      setAsaasChargesByInstallment(map);
      return map;
    } catch (err) {
      console.error('CHARGES_ASAAS_LOAD', err);
      return asaasChargesByInstallmentRef.current;
    }
  }, [showToast]);

  const loadC6ChargeMap = useCallback(async (installmentIds: string[]) => {
    if (installmentIds.length === 0) {
      setC6ChargesByInstallment({});
      return {} as Record<string, CompanyAsaasChargeResponse>;
    }
    try {
      let map = { ...c6ChargesByInstallmentRef.current };
      const chunks = chunkInstallmentIdsForChargeFetch(installmentIds);
      for (const chunk of chunks) {
        const chargesRes = await fetch('/api/finance/c6/charges', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installmentIds: chunk }),
        });
        if (!chargesRes.ok) return null;
        const chargesJson = (await chargesRes.json().catch(() => ({}))) as {
          charges?: CompanyAsaasChargeResponse[];
          emitAuthorizedReceiptIds?: string[];
        };
        const charges = chargesJson.charges || [];
        map = mergeFetchedChargesIntoMap(map, chunk, charges);
        setC6EmitAuthorizedIds((current) => {
          const next = new Set(current);
          for (const id of chunk) next.delete(id);
          for (const id of chargesJson.emitAuthorizedReceiptIds || []) next.add(String(id));
          return next;
        });
      }
      setC6ChargesByInstallment(map);
      return map;
    } catch (err) {
      console.error('CHARGES_C6_LOAD', err);
      return null;
    }
  }, []);

  const loadInterChargeMap = useCallback(async (installmentIds: string[]) => {
    if (installmentIds.length === 0) {
      setInterChargesByInstallment({});
      return {} as Record<string, CompanyAsaasChargeResponse>;
    }

    try {
      let map = { ...interChargesByInstallmentRef.current };
      const chunks = chunkInstallmentIdsForChargeFetch(installmentIds);
      for (const chunk of chunks) {
        const chargesRes = await fetch('/api/finance/inter/charges', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installmentIds: chunk }),
        });
        if (chargesRes.status === 403 || chargesRes.status === 404) {
          console.error('CHARGES_INTER_LOAD_FORBIDDEN', chargesRes.status);
          return interChargesByInstallmentRef.current;
        }
        if (!chargesRes.ok) {
          console.error('CHARGES_INTER_LOAD_HTTP', chargesRes.status);
          return interChargesByInstallmentRef.current;
        }
        const chargesJson = await chargesRes.json().catch(() => ({}));
        const charges = (chargesJson.charges || []) as CompanyAsaasChargeResponse[];
        map = mergeFetchedChargesIntoMap(map, chunk, charges);
      }
      setInterChargesByInstallment(map);
      return map;
    } catch (err) {
      console.error('CHARGES_INTER_LOAD', err);
      return interChargesByInstallmentRef.current;
    }
  }, []);

  const refreshInstallmentRows = useCallback(
    async (
      installmentIds: string[],
      rlsCtx: Awaited<ReturnType<typeof resolveRlsContext>>,
      ownerCtx: Awaited<ReturnType<typeof loadOwnerAccessContext>>,
    ): Promise<FinanceReceiptRow[]> => {
      if (!user || installmentIds.length === 0) return [];
      let refreshQuery = supabase
        .from('finance_receipts')
        .select(FINANCE_RECEIPTS_LIST_SELECT)
        .in('id', installmentIds)
        .order('due_date', { ascending: true });
      refreshQuery = applyTenantFilter(refreshQuery, rlsCtx, 'finance_receipts');
      let { data: refreshedData, error: refreshError } = await refreshQuery;
      if (refreshError) {
        let fallbackQuery = supabase
          .from('finance_receipts')
          .select(FINANCE_RECEIPTS_LIST_SELECT_FALLBACK)
          .in('id', installmentIds)
          .order('due_date', { ascending: true });
        fallbackQuery = applyTenantFilter(fallbackQuery, rlsCtx, 'finance_receipts');
        const fallbackRes = await fallbackQuery;
        refreshedData = fallbackRes.data;
        refreshError = fallbackRes.error;
      }
      if (refreshError || !refreshedData) return [];
      return scopeFinanceRowsForUser(
        user,
        refreshedData,
        ownerCtx.rows,
        resolveReceiptProjectId,
      );
    },
    [user],
  );

  const loadAsaasChargesContext = useCallback(
    async (
      installmentIds: string[],
      options?: { refreshReceiptsAfterLoad?: boolean; rlsCtx?: Awaited<ReturnType<typeof resolveRlsContext>>; ownerCtx?: Awaited<ReturnType<typeof loadOwnerAccessContext>> },
    ) => {
      const integrationOk = await loadIntegrationStatus();
      const chargeMap = await loadChargeMap(installmentIds);

      if (
        options?.refreshReceiptsAfterLoad &&
        options.rlsCtx &&
        options.ownerCtx &&
        installmentIds.length > 0
      ) {
        const refreshedRows = await refreshInstallmentRows(
          installmentIds,
          options.rlsCtx,
          options.ownerCtx,
        );
        if (refreshedRows.length > 0) {
          setPayments(refreshedRows);
        }
      }

      return { integrationOk, chargeMap };
    },
    [loadIntegrationStatus, loadChargeMap, refreshInstallmentRows],
  );

  const loadInstallments = useCallback(async (options?: {
    syncAsaasStatuses?: boolean;
    financialAccountFilter?: string;
    resetChargeStatus?: boolean;
    signal?: AbortSignal;
  }) => {
    if (!user) {
      setLoading(false);
      return;
    }
    const owned = new AbortController();
    chargeLoadAbortRef.current?.abort();
    chargeLoadAbortRef.current = owned;
    if (options?.signal) {
      if (options.signal.aborted) owned.abort();
      else options.signal.addEventListener('abort', () => owned.abort(), { once: true });
    }
    setLoading(true);
    setTotalsReady(false);
    if (options?.resetChargeStatus) {
      setChargeStatusReady(false);
      setC6ChargesLoaded(false);
    }
    setLoadError(null);
    const loadStartedAt = Date.now();
    try {
      const rlsCtx = await resolveRlsContext(user);
      const resolvedTenantId =
        rlsCtx.tenantId || user.tenant_id || (user as { company_id?: string }).company_id || null;

      console.log('[charges/financial-agent] load start', {
        tenantId: resolvedTenantId,
        syncAsaas: Boolean(options?.syncAsaasStatuses),
      });

      if (!rlsCtx.isSuperAdmin && !resolvedTenantId) {
        setPayments([]);
        setTotalsReady(true);
        return;
      }

      const ownerPromise = loadOwnerAccessContext(supabase, user, resolvedTenantId);
      let projectQuery = supabase.from('projects').select('id, name');
      projectQuery = applyTenantFilter(projectQuery, rlsCtx, 'projects');
      const projectsPromise = projectQuery;

      const applyPrefix = async (rows: FinanceReceiptRow[]) => {
        if (owned.signal.aborted) return;
        const ownerCtx = await ownerPromise;
        if (owned.signal.aborted) return;
        setPayments(
          scopeFinanceRowsForUser(user, rows, ownerCtx.rows, resolveReceiptProjectId),
        );
        setLoading(false);
        setTotalsReady(false);
      };

      const fetched = await fetchFinanceReceiptsProgressive<FinanceReceiptRow>({
        supabase,
        rlsCtx,
        select: FINANCE_RECEIPTS_LIST_SELECT,
        selectFallback: FINANCE_RECEIPTS_LIST_SELECT_FALLBACK,
        signal: owned.signal,
        onProgress: (state) => {
          if (owned.signal.aborted || state.complete || state.rows.length === 0) return;
          void applyPrefix(state.rows);
        },
      });
      if (owned.signal.aborted) return;
      if (!financeDatasetReadyForTotals(fetched)) {
        const message =
          fetched.error ||
          'Não foi possível carregar as parcelas. Os totais não foram atualizados.';
        console.error('[charges/financial-agent] finance_receipts query failed', {
          tenantId: resolvedTenantId,
          message,
          ms: Date.now() - loadStartedAt,
        });
        setLoadError(message);
        setTotalsReady(false);
        showToast(message, true);
        return;
      }

      const ownerCtx = await ownerPromise;
      if (owned.signal.aborted) return;
      const { data: projData } = await projectsPromise;
      let ownerProjectOptions: Array<{ id: string; name: string }> = [];
      if (shouldApplyOwnerFinanceScope(user) && user.id && resolvedTenantId) {
        ownerProjectOptions = await fetchOwnerProjectOptionsForModule(
          supabase,
          user.id,
          resolvedTenantId,
          'finance',
        );
      }
      if (owned.signal.aborted) return;
      setProjectsList(
        resolveFinanceProjectsFilterNames(user, projData || [], ownerCtx.rows, ownerProjectOptions),
      );
      void resolveFinanceProjectsForUser(user, projData || [], ownerCtx.rows, ownerProjectOptions);

      const scoped = scopeFinanceRowsForUser(
        user,
        fetched.rows,
        ownerCtx.rows,
        resolveReceiptProjectId,
      );
      setSelectedIds(new Set());
      setPayments(scoped);
      setTotalsReady(true);
      publishFinanceNotificationSource(fetched.rows);
      console.log('[charges/financial-agent] parcels loaded', {
        tenantId: resolvedTenantId,
        count: scoped.length,
        ms: Date.now() - loadStartedAt,
      });

      const installmentIds = scoped.map((row) => String(row.id));
      const c6Ready = installmentIds.length === 0 ? {} : await loadC6ChargeMap(installmentIds);
      if (!owned.signal.aborted) setC6ChargesLoaded(Boolean(c6Ready));
      const shouldSyncAsaas =
        Boolean(options?.syncAsaasStatuses) &&
        !ownerReadOnly &&
        installmentIds.length > 0;

      if (!shouldSyncAsaas) {
        if (installmentIds.length > 0) {
          await loadAsaasChargesContext(installmentIds);
          await loadInterChargeMap(installmentIds);
        } else {
          await loadIntegrationStatus();
        }
        if (!owned.signal.aborted) setChargeStatusReady(true);
        return;
      }

      const { integrationOk, chargeMap } = await loadAsaasChargesContext(installmentIds, {
        refreshReceiptsAfterLoad: true,
        rlsCtx,
        ownerCtx,
      });
      await loadInterChargeMap(installmentIds);
      if (owned.signal.aborted) return;
      setChargeStatusReady(true);

      if (integrationOk) {
        try {
          const syncIds = resolveAsaasSyncInstallmentIds({
            rows: scoped,
            chargesByInstallment: chargeMap,
            financialAccountFilter: options?.financialAccountFilter || 'Todas as contas',
            resolveProvider: (row) => resolveRowProvider(row as FinanceReceiptRow),
          });
          if (syncIds.length > 0) {
            const result = await requestChargeBulkStatusSync(syncIds);
            setAsaasChargesByInstallment((prev) => applyBulkChargeStatusToMap(prev, result));

            if (result.receiptUpdatedCount > 0 || result.paid > 0) {
              const syncedRows = await refreshInstallmentRows(installmentIds, rlsCtx, ownerCtx);
              if (syncedRows.length > 0) {
                setPayments(syncedRows);
              }
            }

            if (result.updated > 0 || result.failed > 0) {
              showToast(
                formatChargeBulkStatusSummary(result),
                result.updated === 0 && result.failed > 0,
              );
            }
          }
        } catch (syncErr) {
          console.error('[charges/financial-agent] bulk sync failed', syncErr);
          showToast(
            syncErr instanceof Error
              ? syncErr.message
              : 'Erro ao sincronizar status Asaas com a lista.',
            true,
          );
        }
      }
    } catch (err) {
      if (isFinanceLoadAbort(err) || owned.signal.aborted) return;
      console.error('[charges/financial-agent] load failed', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Erro inesperado ao carregar parcelas.';
      setLoadError(message);
      setPayments([]);
      setTotalsReady(false);
      showToast(message, true);
    } finally {
      if (!owned.signal.aborted) {
        console.log('[charges/financial-agent] load finished', { ms: Date.now() - loadStartedAt });
        setLoading(false);
      }
    }
  }, [
    user,
    ownerReadOnly,
    loadAsaasChargesContext,
    loadIntegrationStatus,
    loadC6ChargeMap,
    loadInterChargeMap,
    refreshInstallmentRows,
    resolveRowProvider,
    showToast,
  ]);

  const syncAsaasChargeStatuses = useCallback(
    async (
      installmentIds: string[],
      options?: { reloadInstallments?: boolean; silent?: boolean },
    ): Promise<boolean> => {
      if (blockOwnerWriteOnClient(user?.role)) return false;

      const ids = Array.from(
        new Set(installmentIds.map((id) => String(id || '').trim()).filter(Boolean)),
      );
      if (ids.length === 0) {
        if (!options?.silent) {
          showToast('Nenhuma parcela para sincronizar com o Asaas.', true);
        }
        return false;
      }

      setBulkBusy(true);
      try {
        const result = await requestChargeBulkStatusSync(ids);
        setAsaasChargesByInstallment((prev) => applyBulkChargeStatusToMap(prev, result));

        if (result.receiptUpdatedCount > 0 || result.paid > 0 || options?.reloadInstallments) {
          await loadInstallments({ syncAsaasStatuses: false });
        }

        if (!options?.silent) {
          const isError = result.failed > 0 && result.updated === 0;
          const blocked = listChargesNotUpdatedForAccount(result.items || []);
          const summary = formatChargeBulkStatusSummary(result);
          showToast(
            blocked.length > 0
              ? `${summary} Sem atualização por conta: ${blocked.join(', ')}.`
              : summary,
            isError,
          );
        }

        return result.failed === 0 || result.updated > 0;
      } catch (err) {
        if (!options?.silent) {
          showToast(
            err instanceof Error ? err.message : 'Erro ao atualizar status Asaas em lote.',
            true,
          );
        }
        return false;
      } finally {
        setBulkBusy(false);
      }
    },
    [loadInstallments, showToast, user?.role],
  );

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setFinancialAccountsLoaded(false);
    void fetch('/api/finance/financial-accounts', { credentials: 'include' })
      .then((res) => {
        if (res.status === 403 || res.status === 404) return {};
        return res.json().catch(() => ({}));
      })
      .then((json) => {
        if (cancelled) return;
        setFinancialAccounts((json.accounts as CompanyFinancialAccountResponse[]) || []);
        setFinancialAccountsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFinancialAccounts([]);
        setFinancialAccountsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading]);

  useEffect(() => {
    if (authLoading || !user?.id) return;
    const controller = new AbortController();
    void loadInstallments({ resetChargeStatus: true, signal: controller.signal });
    return () => controller.abort();
    // A identidade da função não pode disparar uma segunda leitura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  const filteredRows = useMemo(
    () =>
      filterChargeInstallments(
        payments,
        {
          search,
          statusFilter,
          projectFilter,
          financialAccountFilter,
          startDate,
          endDate,
        },
        undefined,
        financialAccountLabels,
      ),
    [
      payments,
      search,
      statusFilter,
      projectFilter,
      financialAccountFilter,
      startDate,
      endDate,
      financialAccountLabels,
    ],
  );

  const pagination = useMemo(
    () => paginateFinanceReceiptRows(filteredRows, currentPage, itemsPerPage),
    [filteredRows, currentPage, itemsPerPage],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, projectFilter, financialAccountFilter, startDate, endDate]);

  useEffect(() => {
    if (currentPage > pagination.totalPages) {
      setCurrentPage(pagination.totalPages);
    }
  }, [currentPage, pagination.totalPages]);

  const pageRows = pagination.pageRows;
  const chargeLabels = useMemo(() => chargeParcelLabelContext(filteredRows), [filteredRows]);

  const filteredViews = useMemo(
    () =>
      filteredRows.map((row) => {
        const installmentId = String(row.id);
        const provider = resolveRowProvider(row);
        const charge = chargeForInstallment(installmentId, provider);
        return buildChargeInstallmentView(row, charge, undefined, financialAccountLabels, {
          ...chargeLabels.get(String(row.sale_id || '')),
          hasChargeHistory:
            provider === 'INTER'
              ? Boolean(charge?.asaasPaymentId)
              : asaasChargeHistoryIds.has(installmentId) || Boolean(charge?.asaasPaymentId),
          chargeProvider: provider,
        });
      }),
    [
      filteredRows,
      resolveRowProvider,
      chargeForInstallment,
      financialAccountLabels,
      asaasChargeHistoryIds,
      chargeLabels,
    ],
  );

  const kpis = useMemo(() => computeChargeKpiSummary(payments), [payments]);

  const providerChargesByInstallment = useMemo(() => {
    const map: Record<string, CompanyAsaasChargeResponse> = {};
    for (const row of payments) {
      const id = String(row.id);
      const provider = resolveRowProvider(row);
      const charge = chargeForInstallment(id, provider);
      if (charge && isConfirmedPersistedProviderCharge(charge)) {
        map[id] = charge;
      }
    }
    return map;
  }, [payments, resolveRowProvider, chargeForInstallment]);

  const asaasKpis = useMemo(
    () => computeAsaasOperationalKpis(payments, providerChargesByInstallment),
    [payments, providerChargesByInstallment],
  );

  const selectedGeneratableCount = useMemo(
    () =>
      countSelectedGeneratableCharges({
        selectedIds,
        payments,
        chargesByInstallment: providerChargesByInstallment,
        integrationActive,
        companyAsaasEnabled: asaasAccessAvailable,
        ownerReadOnly,
        installmentsDataReady,
        resolveProvider: resolveRowProvider,
      }),
    [
      selectedIds,
      payments,
      providerChargesByInstallment,
      integrationActive,
      asaasAccessAvailable,
      ownerReadOnly,
      installmentsDataReady,
      resolveRowProvider,
    ],
  );

  const selectedWithChargeCount = useMemo(
    () => countSelectedWithAsaasCharge(selectedIds, providerChargesByInstallment),
    [selectedIds, providerChargesByInstallment],
  );

  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(String(row.id)));

  const allWithChargeCount = useMemo(
    () =>
      filteredRows.filter((row) => Boolean(providerChargesByInstallment[String(row.id)])).length,
    [filteredRows, providerChargesByInstallment],
  );

  const hasVisibleInterCharges = useMemo(
    () =>
      filteredRows.some(
        (row) =>
          resolveRowProvider(row) === 'INTER' &&
          Boolean(interChargesByInstallment[String(row.id)]?.asaasPaymentId),
      ),
    [filteredRows, resolveRowProvider, interChargesByInstallment],
  );

  const hasAsaasRows = useMemo(
    () => payments.some((row) => resolveRowProvider(row) === 'ASAAS_COMPANY'),
    [payments, resolveRowProvider],
  );

  const refreshAllBlockReason = useMemo(
    () =>
      resolveRefreshAllChargesBlockReason({
        loading,
        bulkBusy,
        ownerReadOnly,
        integrationReady:
          integrationReady ||
          overviewGateAllowsPerChargeAsaasSync(asaasGate) ||
          hasVisibleInterCharges,
        visibleChargeCount: allWithChargeCount,
      }),
    [loading, bulkBusy, ownerReadOnly, integrationReady, asaasGate, hasVisibleInterCharges, allWithChargeCount],
  );
  const refreshAllBlockMessage = formatRefreshAllChargesBlockReason(refreshAllBlockReason);

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredRows.map((row) => String(row.id))));
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createAsaasChargeRequest = async (
    installmentId: string,
    billingType: 'PIX' | 'BOLETO',
  ): Promise<CompanyAsaasChargeResponse> => {
    const res = await fetch('/api/finance/asaas/create-charge', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installmentId, billingType }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(mapCreateChargeApiError(json.error || `Erro ${res.status}`));
    }
    const charge = json.charge as CompanyAsaasChargeResponse;
    if (!isConfirmedPersistedProviderCharge(charge)) {
      throw new Error('Cobrança Asaas sem identificador externo persistido.');
    }
    return charge;
  };

  async function prepareC6Attempt(installmentId: string, password: string) {
    setAsaasActionInstallmentId(installmentId);
    try {
      const res = await fetch('/api/banking/c6/charges/attempt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId, password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string; prepared?: boolean };
      if (!res.ok || !json.prepared) {
        throw new Error(json.error || json.message || 'A nova tentativa não foi preparada.');
      }
      showToast(json.message || 'Nova tentativa preparada. Aguardando confirmação técnica do C6 Bank.');
      await loadC6ChargeMap([installmentId]);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Falha ao preparar a nova tentativa.', true);
    } finally {
      setAsaasActionInstallmentId(null);
    }
  }

  async function consultC6Situation(installmentId: string) {
    setAsaasActionInstallmentId(installmentId);
    try {
      const res = await fetch(
        `/api/banking/c6/charges?installmentId=${encodeURIComponent(installmentId)}&purpose=situation`,
        { credentials: 'include' },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        titleFound?: boolean;
        externalReference?: string;
        bankStatus?: string | null;
        bankId?: string | null;
        bankDiagnostic?: {
          httpStatus: number | null;
          code: string | null;
          message: string | null;
          fields?: string[];
          traceId?: string | null;
        } | null;
      };
      if (!res.ok) throw new Error(json.error || 'Falha ao consultar a situação no C6.');
      setC6NoticeByInstallment((current) => ({
        ...current,
        [installmentId]: {
          uncertain: !json.titleFound,
          message: json.message || 'Consulta C6 concluída.',
          bankDiagnostic: {
            httpStatus: json.bankDiagnostic?.httpStatus ?? null,
            code: json.bankDiagnostic?.code ?? null,
            message: json.bankDiagnostic?.message ?? null,
            field: json.bankDiagnostic?.fields?.filter(Boolean).join(', ') || null,
            externalReference: json.externalReference || null,
            bankStatus: json.bankStatus,
            bankId: json.bankId,
            traceId: json.bankDiagnostic?.traceId,
            titleFound: json.titleFound,
          },
        },
      }));
      showToast(json.message || 'Consulta C6 concluída.', true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Falha ao consultar a situação no C6.', true);
    } finally {
      setAsaasActionInstallmentId(null);
    }
  }

  const createInterChargeRequest = async (
    installmentId: string,
  ): Promise<CompanyAsaasChargeResponse> => {
    const res = await fetch('/api/finance/inter/create-charge', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installmentId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(mapCreateChargeApiError(json.error || `Erro ${res.status}`));
    }
    const charge = json.charge as CompanyAsaasChargeResponse;
    if (!isConfirmedPersistedProviderCharge(charge)) {
      throw new Error('Cobrança Inter sem identificador externo persistido.');
    }
    return charge;
  };

  const handleCreateCharge = async (
    installmentId: string,
    billingType: 'PIX' | 'BOLETO',
  ) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (loadError || !installmentsDataReady) {
      showToast(
        loadError || 'Aguarde o carregamento das parcelas antes de gerar cobrança.',
        true,
      );
      return;
    }
    if (!installmentId?.trim()) {
      showToast('Parcela inválida — recarregue a lista e tente novamente.', true);
      return;
    }
    const row = payments.find((p) => String(p.id) === installmentId);
    if (!row) {
      showToast('Parcela não encontrada na lista carregada. Clique em Atualizar lista.', true);
      return;
    }
    if (isInstallmentPaidForCharges(row)) {
      showToast('Não é possível gerar cobrança para parcela paga.', true);
      return;
    }

    const provider = resolveRowProvider(row);
    if (
      !canOfferChargeGenerateInUi({
        provider,
        bankStatusConsulted: chargeStatusReady,
        otherwiseEligible: true,
      })
    ) {
      showToast('Consulte o status em Atualizar lista antes de gerar a cobrança.', true);
      return;
    }
    const saleAccount = row.sales as { financial_account_id?: string | null } | undefined;
    const accountId = String(row.financial_account_id || saleAccount?.financial_account_id || '').trim();
    const linkedAccount = accountId ? financialAccountsById[accountId] : undefined;
    const accountState = resolveAsaasRowAccountState({
      accountId,
      accountActive: linkedAccount ? linkedAccount.active : null,
      accountsLoaded: financialAccountsLoaded,
    });
    if (
      provider === 'ASAAS_COMPANY' &&
      !integrationReady &&
      !asaasRowMayUseLinkedAccount({ gate: asaasGate, accountState })
    ) {
      showToast(
        accountState === 'none'
          ? 'Conta ausente. A parcela não tem conta financeira para emitir a cobrança.'
          : accountState === 'inactive'
            ? 'Conta inativa. A conta financeira desta parcela está inativa.'
            : formatChargesAsaasIntegrationGate(asaasGate) || 'Integração Asaas não está ativa.',
        true,
      );
      return;
    }

    const previousCharge = chargeForInstallment(installmentId, provider);
    setAsaasActionInstallmentId(installmentId);
    try {
      if (provider === 'C6') {
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
        if (json.emitted || json.reused) {
          setC6NoticeByInstallment((prev) => {
            const next = { ...prev };
            delete next[installmentId];
            return next;
          });
          const reloaded = await loadC6ChargeMap([installmentId]);
          if (reloaded) setC6ChargesLoaded(true);
          showToast(
            json.reused
              ? 'Boleto C6 já vinculado a esta parcela.'
              : 'Boleto C6 emitido para a parcela.',
          );
          return;
        }
        setC6NoticeByInstallment((prev) => ({
          ...prev,
          [installmentId]: {
            uncertain,
            message: String(json.message || 'C6 não confirmou o boleto.'),
            bankDiagnostic: json.bankDiagnostic
              ? {
                  httpStatus: json.bankDiagnostic.httpStatus,
                  code: json.bankDiagnostic.code,
                  message: json.bankDiagnostic.message,
                  field: json.bankDiagnostic.fields?.filter(Boolean).join(', ') || null,
                }
              : null,
          },
        }));
        showToast(String(json.message || 'C6 não confirmou o boleto.'), true);
        return;
      }

      if (provider === 'INTER') {
        const charge = await createInterChargeRequest(installmentId);
        applyInterChargeUpdate(installmentId, charge);
        const artifactsReady = Boolean(
          charge.bankSlipIdentification || charge.pixCopyPaste || charge.barCode || charge.nossoNumero,
        );
        if (
          previousCharge &&
          previousCharge.id === charge.id &&
          previousCharge.status === charge.status &&
          artifactsReady
        ) {
          showToast('Cobrança Inter já existe para esta parcela.');
        } else if (!artifactsReady) {
          showToast(
            'Cobrança emitida. Boleto/Pix ainda estão sendo processados pelo Banco Inter.',
          );
        } else {
          showToast('Cobrança Inter gerada com sucesso.');
        }
        return;
      }

      const charge = await createAsaasChargeRequest(installmentId, billingType);
      applyAsaasChargeUpdate(installmentId, charge);
      if (
        previousCharge &&
        previousCharge.id === charge.id &&
        previousCharge.status === charge.status
      ) {
        showToast('Cobrança já existe para esta parcela.');
      } else {
        showToast('Cobrança gerada com sucesso.');
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erro ao gerar cobrança.',
        true,
      );
    } finally {
      setAsaasActionInstallmentId(null);
    }
  };

  const handleRefreshInter = async (
    installmentId: string,
    options?: { silent?: boolean },
  ): Promise<boolean> => {
    if (blockOwnerWriteOnClient(user?.role)) return false;
    if (!options?.silent) setAsaasActionInstallmentId(installmentId);
    try {
      const res = await fetch('/api/finance/inter/refresh-charge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const charge = json.charge as CompanyAsaasChargeResponse | null;
      if (charge) {
        applyInterChargeUpdate(installmentId, charge);
        const paid = Boolean(json.paid || json.receiptUpdated || charge.status === 'PAID');
        if (paid && !options?.silent) {
          await loadInstallments({ syncAsaasStatuses: false });
        }
        if (!options?.silent) {
          const hasArtifacts = Boolean(
            charge.bankSlipIdentification || charge.pixCopyPaste || charge.barCode || charge.nossoNumero,
          );
          if (paid) {
            showToast(
              json.receiptUpdated
                ? 'Pagamento Inter confirmado — parcela baixada automaticamente.'
                : 'Pagamento Inter confirmado e sincronizado.',
            );
          } else if (hasArtifacts) {
            showToast('Dados Inter atualizados (linha/Pix materializados).');
          } else {
            showToast('Cobrança Inter consultada. Artefatos ainda não disponíveis no GET.');
          }
        }
        return true;
      }
      if (!options?.silent) {
        showToast('Cobrança Inter não encontrada para esta parcela.', true);
      }
      return false;
    } catch (err) {
      if (!options?.silent) {
        showToast(err instanceof Error ? err.message : 'Erro ao atualizar cobrança Inter.', true);
      }
      return false;
    } finally {
      if (!options?.silent) setAsaasActionInstallmentId(null);
    }
  };

  const handleDownloadC6Pdf = async (installmentId: string, openInline = false) => {
    if (!openInline && blockOwnerWriteOnClient(user?.role)) return;
    setAsaasActionInstallmentId(installmentId);
    try {
      const res = await fetch(
        `/api/banking/c6/charges/pdf?installmentId=${encodeURIComponent(installmentId)}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Erro ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (openInline) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `boleto-c6-${installmentId.slice(0, 8)}.pdf`;
        a.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      showToast(
        openInline
          ? 'PDF devolvido pelo C6 aberto. Isso não confirma pagamento na rede bancária.'
          : 'PDF devolvido pelo C6 baixado. Isso não confirma pagamento na rede bancária.',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao obter o PDF C6.', true);
    } finally {
      setAsaasActionInstallmentId(null);
    }
  };

  const handleDownloadInterPdf = async (installmentId: string) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    setAsaasActionInstallmentId(installmentId);
    try {
      const res = await fetch(
        `/api/finance/inter/pdf?installmentId=${encodeURIComponent(installmentId)}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Erro ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match?.[1] || `boleto-inter-${installmentId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('PDF oficial do boleto Inter baixado.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao baixar PDF Inter.', true);
    } finally {
      setAsaasActionInstallmentId(null);
    }
  };

  const handleSendInterEmail = async (
    installmentId: string,
    row: FinanceReceiptRow,
    view: ChargeInstallmentView,
  ) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    const to = resolveChargeCustomerEmail(row);
    if (!to) {
      showToast('Cliente sem e-mail válido cadastrado.', true);
      return;
    }
    setAsaasActionInstallmentId(installmentId);
    try {
      const res = await fetch('/api/finance/inter/send-email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installmentId,
          to,
          parcelLabel: view.parcelLabel,
          clientName: view.clientName,
          projectName: view.projectName,
          lotLabel: view.lotLabel,
          dueDateLabel: view.dueDateLabel,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      showToast(
        json.attachedOfficialPdf
          ? `Cobrança Inter enviada para ${to} (PDF oficial anexado).`
          : `Cobrança Inter enviada para ${to}.`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao enviar e-mail Inter.', true);
    } finally {
      setAsaasActionInstallmentId(null);
    }
  };

  const handleRefreshAsaas = async (installmentId: string) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    const row = payments.find((p) => String(p.id) === installmentId);
    const provider = row ? resolveRowProvider(row) : 'ASAAS_COMPANY';
    if (provider === 'INTER') {
      await handleRefreshInter(installmentId);
      return;
    }
    setAsaasActionInstallmentId(installmentId);
    try {
      const res = await fetch(
        `/api/finance/asaas/charge-status?installmentId=${encodeURIComponent(installmentId)}`,
        { credentials: 'include' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      const charge = json.charge as CompanyAsaasChargeResponse | null;
      const receiptUpdated = Boolean(json.receiptUpdated);
      if (charge) {
        applyAsaasChargeUpdate(installmentId, charge);
        showToast(
          charge.status === 'PAID'
            ? receiptUpdated
              ? 'Pagamento confirmado — parcela baixada automaticamente.'
              : 'Pagamento confirmado no Asaas.'
            : 'Status atualizado com sucesso.',
        );
        if (charge.status === 'PAID' || receiptUpdated) {
          await loadInstallments();
        }
      } else {
        showToast('Nenhuma cobrança Asaas vinculada a esta parcela.', true);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao atualizar status Asaas.', true);
    } finally {
      setAsaasActionInstallmentId(null);
    }
  };

  const handleCancelAsaas = async (installmentId: string) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    const current = asaasChargesByInstallment[installmentId];
    if (!current) return;
    if (current.status === 'PAID') {
      showToast('Não é possível cancelar cobrança já recebida/paga.', true);
      return;
    }
    if (!window.confirm('Cancelar a cobrança Asaas desta parcela?')) return;

    setAsaasActionInstallmentId(installmentId);
    try {
      const res = await fetch(
        `/api/finance/asaas/charge-status?chargeId=${encodeURIComponent(current.id)}`,
        { method: 'DELETE', credentials: 'include' },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      applyAsaasChargeUpdate(installmentId, json.charge as CompanyAsaasChargeResponse);
      showToast('Cobrança cancelada.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao cancelar cobrança.', true);
    } finally {
      setAsaasActionInstallmentId(null);
    }
  };

  const handleRegenerateAsaas = async (
    installmentId: string,
    billingType: 'PIX' | 'BOLETO',
  ) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!window.confirm('Regenerar cobrança Asaas para esta parcela?')) return;

    setAsaasActionInstallmentId(installmentId);
    try {
      const res = await fetch('/api/finance/asaas/regenerate-charge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId, billingType }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      applyAsaasChargeUpdate(installmentId, json.charge as CompanyAsaasChargeResponse);
      showToast('Cobrança regenerada com sucesso.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao regenerar cobrança.', true);
    } finally {
      setAsaasActionInstallmentId(null);
    }
  };

  const handleCopyBarcodeLine = async (charge: CompanyAsaasChargeResponse) => {
    const line = charge.bankSlipIdentification?.trim();
    if (!line) {
      showToast('Linha digitável indisponível para esta cobrança.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(line);
      showToast('Linha digitável copiada.');
    } catch {
      showToast('Não foi possível copiar a linha digitável.', true);
    }
  };

  const handleCopyPix = async (charge: CompanyAsaasChargeResponse) => {
    const pix = charge.pixCopyPaste?.trim();
    if (!pix) {
      showToast('PIX indisponível para esta cobrança.', true);
      return;
    }
    const ok = await copyText(pix);
    showToast(ok ? 'PIX copiado.' : 'Não foi possível copiar o PIX.', !ok);
  };

  const handleCopyLink = async (charge: CompanyAsaasChargeResponse) => {
    const link = resolveCompanyAsaasPaymentLink(charge);
    if (!link) {
      showToast('Link indisponível para esta cobrança.', true);
      return;
    }
    const ok = await copyText(link);
    showToast(ok ? 'Link copiado.' : 'Não foi possível copiar o link.', !ok);
  };

  const openWhatsAppBatch = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      showToast('Selecione ao menos uma parcela.', true);
      return;
    }
    setWhatsAppBatchOpen(true);
    setWhatsAppBatchLoading(true);
    setWhatsAppBatchError(null);
    setWhatsAppBatchPreview(null);
    setWhatsAppBatchResult(null);
    whatsAppBatchIdempotencyRef.current =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `wa-batch-${Date.now()}`;
    try {
      const res = await fetch('/api/finance/charges/whatsapp-batch', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', installmentIds: ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao validar o lote de WhatsApp.');
      }
      setWhatsAppBatchPreview(json.preview || null);
    } catch (err) {
      setWhatsAppBatchError(
        err instanceof Error ? err.message : 'Falha ao validar o lote de WhatsApp.',
      );
    } finally {
      setWhatsAppBatchLoading(false);
    }
  };

  const confirmWhatsAppBatch = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (whatsAppBatchSending) return;
    const ids = Array.from(selectedIds);
    const key =
      whatsAppBatchIdempotencyRef.current ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `wa-batch-${Date.now()}`);
    whatsAppBatchIdempotencyRef.current = key;
    setWhatsAppBatchSending(true);
    setWhatsAppBatchError(null);
    try {
      const res = await fetch('/api/finance/charges/whatsapp-batch', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          installmentIds: ids,
          idempotencyKey: key,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao enviar o lote de WhatsApp.');
      }
      if (json.preview) setWhatsAppBatchPreview(json.preview);
      if (json.status === 'blocked') {
        setWhatsAppBatchError(json.preview?.sendBlockedReason || 'Envio bloqueado.');
        return;
      }
      setWhatsAppBatchResult({
        batchId: json.batchId || null,
        status: json.status,
        replayed: Boolean(json.replayed),
        processed: Number(json.processed) || 0,
        sent: Number(json.sent) || 0,
        failed: Number(json.failed) || 0,
        skipped: Number(json.skipped) || 0,
        items: json.items || [],
      });
    } catch (err) {
      setWhatsAppBatchError(
        err instanceof Error ? err.message : 'Falha ao enviar o lote de WhatsApp.',
      );
    } finally {
      setWhatsAppBatchSending(false);
    }
  };

  const retryWhatsAppBatchFailed = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (whatsAppBatchSending) return;
    const batchId = whatsAppBatchResult?.batchId;
    if (!batchId) {
      setWhatsAppBatchError('Lote anterior não encontrado para reenvio.');
      return;
    }
    setWhatsAppBatchSending(true);
    setWhatsAppBatchError(null);
    try {
      const res = await fetch('/api/finance/charges/whatsapp-batch', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', batchId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao reenviar as mensagens com erro.');
      }
      if (json.preview) setWhatsAppBatchPreview(json.preview);
      setWhatsAppBatchResult({
        batchId: json.batchId || batchId,
        status: json.status,
        replayed: Boolean(json.replayed),
        processed: Number(json.processed) || 0,
        sent: Number(json.sent) || 0,
        failed: Number(json.failed) || 0,
        skipped: Number(json.skipped) || 0,
        items: json.items || [],
      });
    } catch (err) {
      setWhatsAppBatchError(
        err instanceof Error ? err.message : 'Falha ao reenviar as mensagens com erro.',
      );
    } finally {
      setWhatsAppBatchSending(false);
    }
  };

  const handleWhatsApp = (
    installmentId: string,
    row: FinanceReceiptRow,
    charge: CompanyAsaasChargeResponse,
    view: ChargeInstallmentView,
  ) => {
    const result = executeChargeWhatsAppShare({
      installmentId,
      customerPhone: resolveChargeCustomerPhone(row),
      charge,
      preferInterMessage: view.chargeProvider === 'INTER' || view.chargeProvider === 'C6',
      messageInput: {
        clientName: view.clientName,
        parcelLabel: view.parcelLabel,
        contractNumber: resolveChargeContractNumber(row),
        projectName: view.projectName,
        lotLabel: view.lotLabel,
        amount: view.amount,
        dueDateLabel: view.dueDateLabel,
      },
    });

    if (!result.ok) {
      showToast(result.error, true);
      return;
    }

    if (!openChargeWhatsAppShareUrl(result.url)) {
      showToast(
        'Não foi possível abrir o WhatsApp. Verifique o bloqueador de pop-ups do navegador.',
        true,
      );
    }
  };

  const runBulkGenerate = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (loadError || !installmentsDataReady) {
      showToast(
        loadError || 'Aguarde o carregamento das parcelas antes de gerar cobranças.',
        true,
      );
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      showToast('Selecione ao menos uma parcela.', true);
      return;
    }
    if (!chargeStatusReady) {
      showToast('Consulte o status em Atualizar lista antes de gerar cobranças.', true);
      return;
    }
    if (selectedGeneratableCount === 0) {
      showToast('Nenhuma parcela selecionada pode gerar cobrança.', true);
      return;
    }

    setBulkBusy(true);
    let okCount = 0;
    let skipCount = 0;
    let errCount = 0;
    for (const installmentId of ids) {
      const row = payments.find((p) => String(p.id) === installmentId);
      if (!row) continue;
      const provider = resolveRowProvider(row);
      const isInter = provider === 'INTER';
      if (!isInter && !integrationReady) {
        skipCount += 1;
        continue;
      }
      const charge = chargeForInstallment(installmentId, provider);
      const canGenerate = canGenerateAsaasCharge({
        installmentPaid: isInstallmentPaidForCharges(row),
        integrationActive: isInter ? true : integrationActive,
        companyAsaasEnabled: isInter ? true : asaasAccessAvailable,
        ownerReadOnly,
        charge,
        installmentsDataReady,
        installmentId,
      });
      if (!canGenerate) {
        skipCount += 1;
        continue;
      }
      try {
        if (isInter) {
          const created = await createInterChargeRequest(installmentId);
          applyInterChargeUpdate(installmentId, created);
        } else {
          const created = await createAsaasChargeRequest(installmentId, 'BOLETO');
          applyAsaasChargeUpdate(installmentId, created);
        }
        okCount += 1;
      } catch (err) {
        errCount += 1;
        if (errCount === 1) {
          showToast(err instanceof Error ? err.message : 'Erro ao gerar cobrança.', true);
        }
      }
    }
    setBulkBusy(false);
    if (okCount > 0) {
      showToast(`${okCount} cobrança(s) gerada(s) com sucesso.`);
    } else if (errCount === 0) {
      showToast(`${skipCount} parcela(s) ignorada(s) — já possuem cobrança ou estão pagas.`, true);
    }
  };

  const runBulkRefresh = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      showToast('Selecione ao menos uma parcela.', true);
      return;
    }
    const asaasIds = ids.filter((id) => {
      const row = payments.find((p) => String(p.id) === id);
      if (!row) return false;
      return resolveRowProvider(row) === 'ASAAS_COMPANY' && Boolean(asaasChargesByInstallment[id]);
    });
    const interIds = ids.filter((id) => {
      const row = payments.find((p) => String(p.id) === id);
      if (!row) return false;
      return resolveRowProvider(row) === 'INTER' && Boolean(interChargesByInstallment[id]?.asaasPaymentId);
    });
    if (asaasIds.length === 0 && interIds.length === 0) {
      showToast('Nenhuma cobrança gerada para atualizar.', true);
      return;
    }
    if (interIds.length > 0) {
      setBulkBusy(true);
      let ok = 0;
      try {
        for (const installmentId of interIds) {
          if (await handleRefreshInter(installmentId, { silent: true })) ok += 1;
        }
        await loadInstallments({ syncAsaasStatuses: false });
      } finally {
        setBulkBusy(false);
      }
      showToast(`${ok} cobrança(s) Inter atualizada(s) (consulta GET).`);
    }
    if (asaasIds.length > 0) {
      await syncAsaasChargeStatuses(asaasIds);
    }
  };

  const runRefreshAllCharges = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    const asaasIds = resolveAsaasSyncInstallmentIds({
      rows: filteredRows,
      chargesByInstallment: asaasChargesByInstallment,
      financialAccountFilter,
      resolveProvider: (row) => resolveRowProvider(row as FinanceReceiptRow),
    });
    const interIds = filteredRows
      .filter((row) => resolveRowProvider(row) === 'INTER')
      .map((row) => String(row.id))
      .filter((id) => Boolean(interChargesByInstallment[id]?.asaasPaymentId));
    if (asaasIds.length === 0 && interIds.length === 0) {
      showToast('Nenhuma cobrança gerada na lista atual.', true);
      return;
    }
    if (interIds.length > 0) {
      setBulkBusy(true);
      let ok = 0;
      try {
        for (const installmentId of interIds) {
          if (await handleRefreshInter(installmentId, { silent: true })) ok += 1;
        }
        await loadInstallments({ syncAsaasStatuses: false });
      } finally {
        setBulkBusy(false);
      }
      showToast(`${ok} cobrança(s) Inter atualizada(s) (consulta GET).`);
    }
    if (asaasIds.length > 0) {
      await syncAsaasChargeStatuses(asaasIds);
    }
  };

  const handleRefreshList = async () => {
    await loadInstallments({
      syncAsaasStatuses: !ownerReadOnly,
      financialAccountFilter,
    });
  };

  const chargeExportMeta = {
    generatedAtLabel: new Date().toLocaleString('pt-BR'),
    statusFilter: statusFilter === 'Todas' ? 'Todas as situações' : statusFilter,
    projectFilter:
      projectFilter === 'Todos os projetos' ? 'Todos os empreendimentos' : projectFilter,
    accountFilter: financialAccountFilter,
    startDate,
    endDate,
    search,
    rowCount: filteredViews.length,
  };

  const handleExportFilteredPdf = async () => {
    if (!filteredViews.length) {
      showToast('Nenhum registro na listagem filtrada para exportar.', true);
      return;
    }
    setExportingKind('pdf');
    try {
      await downloadChargeListPdf(filteredViews, chargeExportMeta);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao gerar PDF.', true);
    } finally {
      setExportingKind(null);
    }
  };

  const handleExportFilteredExcel = async () => {
    if (!filteredViews.length) {
      showToast('Nenhum registro na listagem filtrada para exportar.', true);
      return;
    }
    setExportingKind('excel');
    try {
      await downloadChargeListExcel(filteredViews, chargeExportMeta);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao gerar Excel.', true);
    } finally {
      setExportingKind(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="finance-premium sv-page sv-page--scroll-y h-full w-full p-3 md:p-4 lg:p-5">
      <div className="charges-page-header">
        <div className="mb-1 flex items-center gap-2">
          <Banknote className="h-6 w-6 text-violet-400" />
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Cobranças</h1>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Central operacional de parcelas e cobranças da empresa.
        </p>
        {payments.length > 0 && !totalsReady ? (
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Atualizando as parcelas. Os totais ainda não estão fechados.</p>
        ) : null}
      </div>

      {loadError ? (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {loadError}
        </div>
      ) : null}

      {chargeStatusReady && asaasAccessAvailable && !integrationActive && hasAsaasRows && !loading && !integrationLoading ? (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {formatChargesAsaasIntegrationGate(asaasGate) ||
            'Integração Asaas não está ativa. Abra Configurações → Integração Financeira e conclua a ativação, depois clique em "Atualizar lista".'}
        </div>
      ) : null}

      {toast ? (
        <div
          className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
            toastIsError
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
              : 'border-violet-500/30 bg-violet-500/10 text-violet-100'
          }`}
        >
          {toast}
        </div>
      ) : null}

      <div className="finance-kpi-grid charges-kpi-grid">
        <FinanceStatCard
          title="Em aberto"
          value={formatCurrency(kpis.emAberto)}
          subtitle={`${kpis.qtyEmAberto} parcela(s) pendente(s)`}
          icon={<Wallet className="h-5 w-5" />}
          iconWrapClass="bg-amber-500/10 text-amber-400"
          loading={!totalsReady}
        />
        <FinanceStatCard
          title="Vencidas"
          value={formatCurrency(kpis.vencidas)}
          subtitle={`${kpis.qtyVencidas} parcela(s) em atraso`}
          subtitleColor="text-rose-400"
          icon={<AlertCircle className="h-5 w-5" />}
          iconWrapClass="bg-rose-500/10 text-rose-400"
          loading={!totalsReady}
        />
        <FinanceStatCard
          title="Vencem hoje"
          value={formatCurrency(kpis.vencemHoje)}
          subtitle={`${kpis.qtyVencemHoje} parcela(s) hoje`}
          icon={<Calendar className="h-5 w-5" />}
          iconWrapClass="bg-orange-500/10 text-orange-400"
          loading={!totalsReady}
        />
        <FinanceStatCard
          title="Pagas no mês"
          value={formatCurrency(kpis.pagasMes)}
          subtitle={`${kpis.qtyPagasMes} recebimento(s)`}
          icon={<Banknote className="h-5 w-5" />}
          iconWrapClass="bg-emerald-500/10 text-emerald-400"
          loading={!totalsReady}
        />
        <FinanceStatCard
          title="Total a receber"
          value={formatCurrency(kpis.totalAReceber)}
          subtitle="Pendentes + vencidas"
          icon={<Wallet className="h-5 w-5" />}
          iconWrapClass="bg-blue-500/10 text-blue-400"
          loading={!totalsReady}
        />
        <FinanceStatCard
          title="Aguardando geração"
          value={formatCurrency(asaasKpis.aguardandoGeracao)}
          subtitle={`${asaasKpis.qtyAguardandoGeracao} parcela(s) sem cobrança ativa`}
          icon={<Zap className="h-5 w-5" />}
          iconWrapClass="bg-violet-500/10 text-violet-400"
          loading={!totalsReady || !chargeStatusReady}
        />
      </div>

      <div className="charges-ops-row">
        <FinanceStatCard
          title="Cobranças emitidas"
          value={formatCurrency(asaasKpis.cobrancasEmitidas)}
          subtitle={`${asaasKpis.qtyCobrancasEmitidas} cobrança(s) ativa(s)`}
          icon={<QrCode className="h-5 w-5" />}
          iconWrapClass="bg-cyan-500/10 text-cyan-400"
          loading={!totalsReady || !chargeStatusReady}
        />
        <div className="charges-ops-actions">
          <button
            type="button"
            onClick={() => void handleExportFilteredPdf()}
            disabled={loading || Boolean(exportingKind) || !installmentsDataReady}
            title={`Exporta a listagem filtrada completa já carregada (${CHARGE_LIST_EXPORT_SCOPE}), não somente a página visível.`}
            className="charges-ops-btn border border-rose-500/40 bg-transparent text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            {exportingKind === 'pdf' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Relatório PDF
          </button>
          <button
            type="button"
            onClick={() => void handleExportFilteredExcel()}
            disabled={loading || Boolean(exportingKind) || !installmentsDataReady}
            title={`Exporta a listagem filtrada completa já carregada (${CHARGE_LIST_EXPORT_SCOPE}), não somente a página visível.`}
            className="charges-ops-btn border border-emerald-500/40 bg-transparent text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
          >
            {exportingKind === 'excel' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Relatório Excel
          </button>
          <button
            type="button"
            onClick={() => void handleRefreshList()}
            disabled={loading || bulkBusy}
            className="charges-ops-btn border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar lista
          </button>
          {!ownerReadOnly &&
          (integrationReady || overviewGateAllowsPerChargeAsaasSync(asaasGate) || hasVisibleInterCharges) ? (
            <div className="charges-ops-refresh">
              <button
                type="button"
                onClick={() => void runRefreshAllCharges()}
                disabled={Boolean(refreshAllBlockReason)}
                className="charges-ops-btn border border-violet-500/40 bg-violet-600/90 text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  refreshAllBlockMessage ||
                  'Consultar status das cobranças visíveis (Asaas e/ou Banco Inter)'
                }
              >
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar todas as cobranças
              </button>
              {refreshAllBlockMessage && refreshAllBlockReason !== 'busy' && refreshAllBlockReason !== 'loading' ? (
                <span className="text-[11px] text-amber-200/90">{refreshAllBlockMessage}</span>
              ) : null}
            </div>
          ) : ownerReadOnly ? null : hasAsaasRows ? (
            <span className="text-[11px] text-amber-200/90">
              {formatRefreshAllChargesBlockReason('integration_unavailable')}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setReminderOpsOpen(true)}
            className="charges-ops-btn border border-amber-500/40 bg-amber-600/90 text-white hover:bg-amber-500"
            title="Consultar lembretes automáticos e histórico operacional"
          >
            <Bell className="h-4 w-4" />
            Lembretes
          </button>
        </div>
      </div>

      <div className="finance-filters-bar mb-3" role="search">
        <div className="relative finance-filter-search">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, empreendimento ou lote..."
            className="finance-filter-input w-full pl-8"
            aria-label="Buscar"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_OPTIONS)[number])}
          className="finance-filter-input finance-filter-select"
          aria-label="Status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === 'Todas' ? 'Todas as situações' : opt}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="finance-filter-input finance-filter-select"
          aria-label="Empreendimento"
        >
          <option value="Todos os projetos">Todos os empreendimentos</option>
          {projectsList.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={financialAccountFilter}
          onChange={(e) => setFinancialAccountFilter(e.target.value)}
          className="finance-filter-input finance-filter-select"
          aria-label="Conta recebedora"
        >
          <option value="Todas as contas">Todas as contas</option>
          {financialAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {formatFinancialAccountLabel(account)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="finance-filter-input finance-filter-date"
          style={{ colorScheme: 'dark' }}
          aria-label="Vencimento inicial"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="finance-filter-input finance-filter-date"
          style={{ colorScheme: 'dark' }}
          aria-label="Vencimento final"
        />
        <button
          type="button"
          onClick={() => {
            setSearch('');
            setStatusFilter('Todas');
            setProjectFilter('Todos os projetos');
            setStartDate('');
            setEndDate('');
          }}
          className="finance-filter-input shrink-0 flex items-center gap-1.5 px-3 hover:bg-[var(--bg-card-alt)]/80 whitespace-nowrap"
        >
          <Filter className="w-3.5 h-3.5" />
          Limpar filtros
        </button>
      </div>

      {selectedIds.size > 0 && !ownerReadOnly && !homologOutboundBlocked ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] px-3 py-2.5">
          <span className="text-xs font-medium text-violet-200">
            {selectedIds.size} selecionada(s)
          </span>
          <button
            type="button"
            disabled={
              bulkBusy ||
              !installmentsDataReady ||
              !chargeStatusReady ||
              selectedGeneratableCount === 0 ||
              ownerReadOnly
            }
            onClick={() => void runBulkGenerate()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            title="Gera cobranças pelo provider da conta financeira (Asaas ou Banco Inter)"
          >
            {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Gerar cobranças selecionadas
          </button>
          <button
            type="button"
            disabled={
              bulkBusy ||
              loading ||
              ownerReadOnly ||
              selectedWithChargeCount === 0 ||
              (!integrationReady &&
                !Array.from(selectedIds).some((id) => {
                  const row = payments.find((p) => String(p.id) === id);
                  return (
                    row &&
                    resolveRowProvider(row) === 'INTER' &&
                    Boolean(interChargesByInstallment[id]?.asaasPaymentId)
                  );
                }))
            }
            onClick={() => void runBulkRefresh()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar status selecionadas
          </button>
          <button
            type="button"
            disabled={bulkBusy || whatsAppBatchLoading || whatsAppBatchSending || ownerReadOnly}
            onClick={() => void openWhatsAppBatch()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-700/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            title="Enviar cobrança consolidada via WhatsApp (Central SV Lotes)"
          >
            {whatsAppBatchLoading || whatsAppBatchSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MessageCircle className="h-3.5 w-3.5" />
            )}
            WhatsApp em lote
          </button>
        </div>
      ) : null}

      <div className="finance-table-wrap overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <table className="finance-table w-full min-w-[1080px]">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  aria-label="Selecionar todas"
                  className="rounded border-[var(--border-color)]"
                />
              </th>
              <th>Cliente</th>
              <th>Empreendimento</th>
              <th>Quadra/Lote</th>
              <th>Parcela</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Conta recebedora</th>
              <th>Status parcela</th>
              <th>Status cobrança</th>
              <th className="text-right min-w-[280px]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && !totalsReady ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-[var(--text-secondary)]">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
                  Carregando cobranças...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-[var(--text-secondary)]">
                  Nenhuma parcela encontrada para os filtros selecionados.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const installmentId = String(row.id);
                const provider = resolveRowProvider(row);
                const charge = chargeForInstallment(installmentId, provider);
                const view = buildChargeInstallmentView(row, charge, undefined, financialAccountLabels, {
                  ...chargeLabels.get(String(row.sale_id || '')),
                  hasChargeHistory:
                    provider === 'INTER'
                      ? Boolean(charge?.asaasPaymentId)
                      : asaasChargeHistoryIds.has(installmentId) || Boolean(charge?.asaasPaymentId),
                  chargeProvider: provider,
                });
                const installmentPaid = isInstallmentPaidForCharges(row);
                const rowBusy = asaasActionInstallmentId === installmentId || bulkBusy;
                const customerPhone = resolveChargeCustomerPhone(row);
                const customerEmail = resolveChargeCustomerEmail(row);
                const whatsappShare = charge
                  ? executeChargeWhatsAppShare({
                      installmentId,
                      customerPhone,
                      charge,
                      preferInterMessage: provider === 'INTER',
                      messageInput: {
                        clientName: view.clientName,
                        parcelLabel: view.parcelLabel,
                        contractNumber: resolveChargeContractNumber(row),
                        projectName: view.projectName,
                        lotLabel: view.lotLabel,
                        amount: view.amount,
                        dueDateLabel: view.dueDateLabel,
                      },
                    })
                  : null;
                const whatsappShareUrl = whatsappShare?.ok ? whatsappShare.url : null;
                const linkedAccount = view.financialAccountId
                  ? financialAccountsById[view.financialAccountId]
                  : undefined;
                const accountState = resolveAsaasRowAccountState({
                  accountId: view.financialAccountId,
                  accountActive: linkedAccount ? linkedAccount.active : null,
                  accountsLoaded: financialAccountsLoaded,
                });
                const rowAsaasOperable = asaasRowMayUseLinkedAccount({
                  gate: asaasGate,
                  accountState,
                });

                return (
                  <tr key={view.id} className="finance-parcel-row">
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(installmentId)}
                        onChange={() => toggleSelectRow(installmentId)}
                        aria-label={`Selecionar parcela ${view.parcelLabel}`}
                        className="rounded border-[var(--border-color)]"
                      />
                    </td>
                    <td className="font-medium text-[var(--text-primary)]">{view.clientName}</td>
                    <td>{view.projectName}</td>
                    <td>{view.lotLabel}</td>
                    <td>{view.parcelLabel}</td>
                    <td>{view.dueDateLabel}</td>
                    <td className="font-semibold">{formatCurrency(view.amount)}</td>
                    <td className="text-xs text-[var(--text-secondary)]">{view.financialAccountLabel}</td>
                    <td>
                      <FinanceStatusBadge status={view.installmentStatus} />
                    </td>
                    <td>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {provider === 'C6'
                          ? c6ChargesLoaded
                            ? view.chargeStatusLabel
                            : 'Não consultado'
                          : chargeStatusReady
                            ? view.chargeStatusLabel
                            : 'Não consultado'}
                      </span>
                    </td>
                    <td>
                      <ChargeInstallmentActions
                        view={view}
                        charge={charge}
                        installmentPaid={installmentPaid}
                        integrationActive={
                          provider === 'INTER' || provider === 'C6'
                            ? true
                            : integrationActive || rowAsaasOperable
                        }
                        asaasGate={asaasGate}
                        accountState={accountState}
                        companyAsaasEnabled={asaasAccessAvailable}
                        chargeProvider={provider}
                        ownerReadOnly={ownerReadOnly}
                        outboundBlocked={homologOutboundBlocked}
                        busy={rowBusy}
                        installmentsDataReady={installmentsDataReady}
                        bankStatusConsulted={chargeStatusReady}
                        c6ChargesLoaded={c6ChargesLoaded}
                        c6EmitAuthorized={c6EmitAuthorizedIds.has(installmentId)}
                        customerPhone={customerPhone}
                        customerEmail={customerEmail}
                        whatsappShareUrl={whatsappShareUrl}
                        hasPaidChargeHistory={
                          provider === 'INTER' || provider === 'C6'
                            ? Boolean(charge?.asaasPaymentId)
                            : asaasChargeHistoryIds.has(installmentId) ||
                              Boolean(charge?.asaasPaymentId)
                        }
                        c6Notice={provider === 'C6' ? c6NoticeByInstallment[installmentId] || null : null}
                        onConsultSituation={
                          provider === 'C6' ? () => void consultC6Situation(installmentId) : undefined
                        }
                        onPrepareAttempt={
                          provider === 'C6' ? (password) => void prepareC6Attempt(installmentId, password) : undefined
                        }
                        onGenerate={(billingType) =>
                          void handleCreateCharge(installmentId, billingType)
                        }
                        onRefreshStatus={() => void handleRefreshAsaas(installmentId)}
                        onCancel={() => void handleCancelAsaas(installmentId)}
                        onRegenerate={(billingType) =>
                          void handleRegenerateAsaas(installmentId, billingType)
                        }
                        onCopyPix={() => charge && void handleCopyPix(charge)}
                        onCopyBarcodeLine={() => charge && void handleCopyBarcodeLine(charge)}
                        onDownloadPdf={() =>
                          void (provider === 'C6'
                            ? handleDownloadC6Pdf(installmentId, false)
                            : handleDownloadInterPdf(installmentId))
                        }
                        onViewPdf={
                          provider === 'C6'
                            ? () => void handleDownloadC6Pdf(installmentId, true)
                            : undefined
                        }
                        onSendEmail={() => void handleSendInterEmail(installmentId, row, view)}
                        onWhatsApp={() => {
                          if (!charge) {
                            showToast('Cobrança indisponível para envio por WhatsApp.', true);
                            return;
                          }
                          handleWhatsApp(installmentId, row, charge, view);
                        }}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!loading && pagination.totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-[var(--border-color)] text-sm text-[var(--text-secondary)] gap-4">
          <div>
            Mostrando {pagination.from} a {pagination.to} de {pagination.totalCount} registros
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="px-2 py-1 rounded border border-[var(--border-color)] disabled:opacity-50"
            >
              Anterior
            </button>
            <span>
              Página {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))
              }
              disabled={pagination.page >= pagination.totalPages}
              className="px-2 py-1 rounded border border-[var(--border-color)] disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
          <div className="flex items-center gap-2">
            Registros por página:
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(normalizeFinanceReceiptsUiPageSize(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-transparent border border-[var(--border-color)] rounded px-2 py-1 outline-none"
            >
              {FINANCE_RECEIPTS_UI_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <BuyerReminderHistoryPanel open={reminderOpsOpen} onClose={() => setReminderOpsOpen(false)} />
      <ChargeWhatsAppBatchModal
        open={whatsAppBatchOpen}
        loading={whatsAppBatchLoading}
        sending={whatsAppBatchSending}
        error={whatsAppBatchError}
        preview={whatsAppBatchPreview}
        result={whatsAppBatchResult}
        onClose={() => {
          if (whatsAppBatchSending) return;
          setWhatsAppBatchOpen(false);
        }}
        onConfirm={() => void confirmWhatsAppBatch()}
        onRetryFailed={() => void retryWhatsAppBatchFailed()}
      />
    </div>
  );
}

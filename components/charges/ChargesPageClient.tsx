'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Calendar,
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
import { applyTenantFilter, resolveRlsContext } from '@/lib/rls';
import {
  executeChargeWhatsAppShare,
  openChargeWhatsAppShareUrl,
  resolveChargeContractNumber,
  resolveChargeCustomerPhone,
  withCompanyAsaasChargeShareFieldsPreserved,
} from '@/lib/charges/chargeWhatsAppMessage';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import type { AsaasIntegrationConfigResponse } from '@/lib/finance/asaasIntegrationConfig';
import {
  formatFinancialAccountLabel,
  type CompanyFinancialAccountResponse,
} from '@/lib/finance/companyFinancialAccountTypes';
import { resolveCompanyAsaasPaymentLink } from '@/lib/finance/companyAsaasChargeWorkflow';
import {
  buildChargeInstallmentView,
  computeChargeKpiSummary,
  filterChargeInstallments,
  type ChargeInstallmentView,
  type FinanceReceiptRow,
} from '@/lib/charges/chargeInstallmentHelpers';
import {
  countSelectedGeneratableCharges,
  countSelectedWithAsaasCharge,
  resolveChargesIntegrationReady,
} from '@/lib/charges/chargeIntegrationHelpers';
import {
  canGenerateAsaasCharge,
  chunkInstallmentIdsForChargeFetch,
  computeAsaasOperationalKpis,
  isInstallmentPaidForCharges,
  mapCreateChargeApiError,
  mergeFetchedChargesIntoMap,
} from '@/lib/charges/chargeOperationsHelpers';
import {
  applyBulkChargeStatusToMap,
  formatChargeBulkStatusSummary,
  requestChargeBulkStatusSync,
} from '@/lib/charges/chargeBulkStatusSync';
import {
  formatRefreshAllChargesBlockReason,
  resolveRefreshAllChargesBlockReason,
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
  fetchAllFinanceReceiptsPaged,
  normalizeFinanceReceiptsUiPageSize,
  paginateFinanceReceiptRows,
  type FinanceReceiptsUiPageSize,
} from '@/lib/finance/fetchFinanceReceiptsPaged';

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
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<FinanceReceiptRow[]>([]);
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
  const asaasChargesByInstallmentRef = useRef(asaasChargesByInstallment);
  asaasChargesByInstallmentRef.current = asaasChargesByInstallment;
  const asaasChargeHistoryIdsRef = useRef<Set<string>>(new Set());
  const [asaasChargeHistoryIds, setAsaasChargeHistoryIds] = useState<Set<string>>(new Set());
  const [integrationConfig, setIntegrationConfig] =
    useState<AsaasIntegrationConfigResponse | null>(null);
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

  const ownerReadOnly = isOwnerRole(user?.role);
  const [asaasAccessAvailable, setAsaasAccessAvailable] = useState(true);
  const integrationActive = useMemo(
    () => resolveChargesIntegrationReady(integrationConfig),
    [integrationConfig],
  );
  const integrationReady = asaasAccessAvailable && integrationActive;
  const installmentsDataReady = !loading && !loadError;

  const financialAccountLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const account of financialAccounts) {
      map[account.id] = formatFinancialAccountLabel(account);
    }
    return map;
  }, [financialAccounts]);

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

  const loadIntegrationStatus = useCallback(async (): Promise<boolean> => {
    setIntegrationLoading(true);
    try {
      const res = await fetch(`/api/finance/asaas/integration?_=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.status === 403 || res.status === 404) {
        setAsaasAccessAvailable(false);
        setIntegrationConfig(null);
        return false;
      }
      setAsaasAccessAvailable(true);
      if (!res.ok) {
        setIntegrationConfig(null);
        return false;
      }
      const json = await res.json().catch(() => ({}));
      const integration = (json.integration ?? null) as AsaasIntegrationConfigResponse | null;
      setIntegrationConfig(integration);
      return resolveChargesIntegrationReady(integration, json.ready ?? json.canOperate);
    } catch (err) {
      console.error('CHARGES_INTEGRATION_LOAD', err);
      setIntegrationConfig(null);
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
          body: JSON.stringify({ installmentIds: chunk }),
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

  const loadInstallments = useCallback(async (options?: { syncAsaasStatuses?: boolean }) => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
        return;
      }

      let fetched;
      try {
        fetched = await fetchAllFinanceReceiptsPaged<FinanceReceiptRow>({
          supabase,
          rlsCtx,
          select: FINANCE_RECEIPTS_LIST_SELECT,
          selectFallback: FINANCE_RECEIPTS_LIST_SELECT_FALLBACK,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar as parcelas. Verifique a conexão e tente novamente.';
        console.error('[charges/financial-agent] finance_receipts query failed', {
          tenantId: resolvedTenantId,
          message,
          ms: Date.now() - loadStartedAt,
        });
        setLoadError(message);
        setPayments([]);
        showToast(message, true);
        return;
      }

      const data = fetched.rows;
      const ownerCtx = await loadOwnerAccessContext(supabase, user, resolvedTenantId);
      const scoped = scopeFinanceRowsForUser(
        user,
        data || [],
        ownerCtx.rows,
        resolveReceiptProjectId,
      );

      let pQuery = supabase.from('projects').select('id, name');
      pQuery = applyTenantFilter(pQuery, rlsCtx, 'projects');
      const { data: projData } = await pQuery;

      let ownerProjectOptions: Array<{ id: string; name: string }> = [];
      if (shouldApplyOwnerFinanceScope(user) && user.id && resolvedTenantId) {
        ownerProjectOptions = await fetchOwnerProjectOptionsForModule(
          supabase,
          user.id,
          resolvedTenantId,
          'finance',
        );
      }

      setProjectsList(
        resolveFinanceProjectsFilterNames(user, projData || [], ownerCtx.rows, ownerProjectOptions),
      );
      void resolveFinanceProjectsForUser(user, projData || [], ownerCtx.rows, ownerProjectOptions);

      setSelectedIds(new Set());
      const installmentIds = scoped.map((row) => String(row.id));

      // Parcelas locais primeiro — não bloquear a UI em integração/cobranças Asaas.
      setPayments(scoped);
      console.log('[charges/financial-agent] parcels loaded', {
        tenantId: resolvedTenantId,
        count: scoped.length,
        ms: Date.now() - loadStartedAt,
      });

      const shouldSyncAsaas =
        Boolean(options?.syncAsaasStatuses) &&
        !ownerReadOnly &&
        installmentIds.length > 0;

      if (shouldSyncAsaas) {
        const { integrationOk, chargeMap } = await loadAsaasChargesContext(installmentIds, {
          refreshReceiptsAfterLoad: true,
          rlsCtx,
          ownerCtx,
        });

        if (integrationOk) {
          try {
            const syncIds =
              Object.keys(chargeMap).length > 0 ? Object.keys(chargeMap) : installmentIds;
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
      } else {
        void loadAsaasChargesContext(installmentIds, {
          refreshReceiptsAfterLoad: true,
          rlsCtx,
          ownerCtx,
        }).catch((err) => {
          console.error('[charges/financial-agent] asaas context background failed', err);
        });
      }
    } catch (err) {
      console.error('[charges/financial-agent] load failed', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Erro inesperado ao carregar parcelas.';
      setLoadError(message);
      setPayments([]);
      showToast(message, true);
    } finally {
      console.log('[charges/financial-agent] load finished', { ms: Date.now() - loadStartedAt });
      setLoading(false);
    }
  }, [
    user,
    ownerReadOnly,
    loadAsaasChargesContext,
    refreshInstallmentRows,
    showToast,
  ]);

  const syncAsaasChargeStatuses = useCallback(
    async (
      installmentIds: string[],
      options?: { reloadInstallments?: boolean; silent?: boolean },
    ): Promise<boolean> => {
      if (blockOwnerWriteOnClient(user?.role)) return false;
      if (!integrationReady) {
        if (!options?.silent) {
          showToast('Integração Asaas não está ativa.', true);
        }
        return false;
      }

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
          showToast(formatChargeBulkStatusSummary(result), isError);
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
    [integrationReady, loadInstallments, showToast, user?.role],
  );

  useEffect(() => {
    if (authLoading) return;
    void fetch('/api/finance/financial-accounts', { credentials: 'include' })
      .then((res) => {
        if (res.status === 403 || res.status === 404) return {};
        return res.json().catch(() => ({}));
      })
      .then((json) => {
        setFinancialAccounts((json.accounts as CompanyFinancialAccountResponse[]) || []);
      })
      .catch(() => setFinancialAccounts([]));
  }, [authLoading]);

  useEffect(() => {
    if (authLoading) return;
    void loadInstallments();
  }, [authLoading, loadInstallments]);

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

  const kpis = useMemo(() => computeChargeKpiSummary(payments), [payments]);
  const asaasKpis = useMemo(
    () => computeAsaasOperationalKpis(payments, asaasChargesByInstallment),
    [payments, asaasChargesByInstallment],
  );

  const selectedGeneratableCount = useMemo(
    () =>
      countSelectedGeneratableCharges({
        selectedIds,
        payments,
        chargesByInstallment: asaasChargesByInstallment,
        integrationActive,
        companyAsaasEnabled: asaasAccessAvailable,
        ownerReadOnly,
        installmentsDataReady,
      }),
    [
      selectedIds,
      payments,
      asaasChargesByInstallment,
      integrationActive,
      asaasAccessAvailable,
      ownerReadOnly,
      installmentsDataReady,
    ],
  );

  const selectedWithChargeCount = useMemo(
    () => countSelectedWithAsaasCharge(selectedIds, asaasChargesByInstallment),
    [selectedIds, asaasChargesByInstallment],
  );

  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(String(row.id)));

  const allWithChargeCount = useMemo(
    () =>
      filteredRows.filter((row) => Boolean(asaasChargesByInstallment[String(row.id)])).length,
    [filteredRows, asaasChargesByInstallment],
  );

  const refreshAllBlockReason = useMemo(
    () =>
      resolveRefreshAllChargesBlockReason({
        loading,
        bulkBusy,
        ownerReadOnly,
        integrationReady,
        visibleChargeCount: allWithChargeCount,
      }),
    [loading, bulkBusy, ownerReadOnly, integrationReady, allWithChargeCount],
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
    return json.charge as CompanyAsaasChargeResponse;
  };

  const handleCreateAsaasCharge = async (
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
    if (!integrationReady) {
      showToast('Integração Asaas não está ativa.', true);
      return;
    }

    const previousCharge = asaasChargesByInstallment[installmentId];
    setAsaasActionInstallmentId(installmentId);
    try {
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
        err instanceof Error ? err.message : 'Erro ao gerar cobrança Asaas.',
        true,
      );
    } finally {
      setAsaasActionInstallmentId(null);
    }
  };

  const handleRefreshAsaas = async (installmentId: string) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
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
    if (!integrationReady) {
      showToast('Integração Asaas não está ativa.', true);
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      showToast('Selecione ao menos uma parcela.', true);
      return;
    }
    if (selectedGeneratableCount === 0) {
      showToast('Nenhuma parcela selecionada pode gerar cobrança Asaas.', true);
      return;
    }

    setBulkBusy(true);
    let okCount = 0;
    let skipCount = 0;
    let errCount = 0;
    for (const installmentId of ids) {
      const row = payments.find((p) => String(p.id) === installmentId);
      if (!row) continue;
      const charge = asaasChargesByInstallment[installmentId] ?? null;
      const canGenerate = canGenerateAsaasCharge({
        installmentPaid: isInstallmentPaidForCharges(row),
        integrationActive,
        companyAsaasEnabled: asaasAccessAvailable,
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
        const created = await createAsaasChargeRequest(installmentId, 'BOLETO');
        applyAsaasChargeUpdate(installmentId, created);
        okCount += 1;
      } catch (err) {
        errCount += 1;
        if (errCount === 1) {
          showToast(err instanceof Error ? err.message : 'Erro ao gerar cobrança Asaas.', true);
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
    const idsWithCharge = ids.filter((id) => asaasChargesByInstallment[id]);
    if (idsWithCharge.length === 0) {
      showToast('Nenhuma cobrança Asaas gerada para atualizar.', true);
      return;
    }
    await syncAsaasChargeStatuses(idsWithCharge);
  };

  const runRefreshAllCharges = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    const idsWithCharge = filteredRows
      .map((row) => String(row.id))
      .filter((id) => asaasChargesByInstallment[id]);
    if (idsWithCharge.length === 0) {
      showToast('Nenhuma cobrança Asaas gerada na lista atual.', true);
      return;
    }
    await syncAsaasChargeStatuses(idsWithCharge);
  };

  const handleRefreshList = async () => {
    await loadInstallments({ syncAsaasStatuses: integrationReady && !ownerReadOnly });
  };

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="finance-premium sv-page sv-page--scroll-y h-full w-full p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Banknote className="h-6 w-6 text-violet-400" />
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Cobranças</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Central operacional de parcelas e cobranças Asaas da empresa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefreshList()}
            disabled={loading || bulkBusy}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar lista
          </button>
          {integrationReady && !ownerReadOnly ? (
            <div className="flex flex-col items-stretch gap-1 sm:items-end">
              <button
                type="button"
                onClick={() => void runRefreshAllCharges()}
                disabled={Boolean(refreshAllBlockReason)}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-600/90 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  refreshAllBlockMessage ||
                  'Consultar Asaas e baixar parcelas pagas de todas as cobranças visíveis'
                }
              >
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar todas as cobranças
              </button>
              {refreshAllBlockMessage && refreshAllBlockReason !== 'busy' && refreshAllBlockReason !== 'loading' ? (
                <span className="text-[11px] text-amber-200/90">{refreshAllBlockMessage}</span>
              ) : null}
            </div>
          ) : ownerReadOnly ? null : (
            <span className="text-[11px] text-amber-200/90">
              {formatRefreshAllChargesBlockReason('integration_unavailable')}
            </span>
          )}
        </div>
      </div>

      {loadError ? (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {loadError}
        </div>
      ) : null}

      {asaasAccessAvailable && !integrationActive && !loading && !integrationLoading ? (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Integração Asaas não está ativa. Abra Configurações → Integração Financeira e conclua a
          ativação, depois clique em &quot;Atualizar lista&quot;.
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

      <div className="finance-kpi-grid mb-6">
        <FinanceStatCard
          title="Em aberto"
          value={formatCurrency(kpis.emAberto)}
          subtitle={`${kpis.qtyEmAberto} parcela(s) pendente(s)`}
          icon={<Wallet className="h-5 w-5" />}
          iconWrapClass="bg-amber-500/10 text-amber-400"
          loading={loading}
        />
        <FinanceStatCard
          title="Vencidas"
          value={formatCurrency(kpis.vencidas)}
          subtitle={`${kpis.qtyVencidas} parcela(s) em atraso`}
          subtitleColor="text-rose-400"
          icon={<AlertCircle className="h-5 w-5" />}
          iconWrapClass="bg-rose-500/10 text-rose-400"
          loading={loading}
        />
        <FinanceStatCard
          title="Vencem hoje"
          value={formatCurrency(kpis.vencemHoje)}
          subtitle={`${kpis.qtyVencemHoje} parcela(s) hoje`}
          icon={<Calendar className="h-5 w-5" />}
          iconWrapClass="bg-orange-500/10 text-orange-400"
          loading={loading}
        />
        <FinanceStatCard
          title="Pagas no mês"
          value={formatCurrency(kpis.pagasMes)}
          subtitle={`${kpis.qtyPagasMes} recebimento(s)`}
          icon={<Banknote className="h-5 w-5" />}
          iconWrapClass="bg-emerald-500/10 text-emerald-400"
          loading={loading}
        />
        <FinanceStatCard
          title="Total a receber"
          value={formatCurrency(kpis.totalAReceber)}
          subtitle="Pendentes + vencidas"
          icon={<Wallet className="h-5 w-5" />}
          iconWrapClass="bg-blue-500/10 text-blue-400"
          loading={loading}
        />
        <FinanceStatCard
          title="Aguardando geração Asaas"
          value={formatCurrency(asaasKpis.aguardandoGeracao)}
          subtitle={`${asaasKpis.qtyAguardandoGeracao} parcela(s) sem cobrança ativa`}
          icon={<Zap className="h-5 w-5" />}
          iconWrapClass="bg-violet-500/10 text-violet-400"
          loading={loading}
        />
        <FinanceStatCard
          title="Cobranças Asaas emitidas"
          value={formatCurrency(asaasKpis.cobrancasEmitidas)}
          subtitle={`${asaasKpis.qtyCobrancasEmitidas} cobrança(s) ativa(s)`}
          icon={<QrCode className="h-5 w-5" />}
          iconWrapClass="bg-cyan-500/10 text-cyan-400"
          loading={loading}
        />
      </div>

      <div className="finance-filters-bar mb-4" role="search">
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

      {selectedIds.size > 0 && !ownerReadOnly ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] px-3 py-2.5">
          <span className="text-xs font-medium text-violet-200">
            {selectedIds.size} selecionada(s)
          </span>
          <button
            type="button"
            disabled={bulkBusy || !integrationReady || !installmentsDataReady || selectedGeneratableCount === 0}
            onClick={() => void runBulkGenerate()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Gerar cobranças selecionadas
          </button>
          <button
            type="button"
            disabled={bulkBusy || loading || !integrationReady || selectedWithChargeCount === 0 || ownerReadOnly}
            onClick={() => void runBulkRefresh()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar status selecionadas
          </button>
          <button
            type="button"
            disabled
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] opacity-60"
            title="WhatsApp em lote — em breve"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp em lote (em breve)
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
              <th>Status Asaas</th>
              <th className="text-right min-w-[280px]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
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
                const charge = asaasChargesByInstallment[installmentId] ?? null;
                const view = buildChargeInstallmentView(row, charge, undefined, financialAccountLabels, {
                  hasChargeHistory:
                    asaasChargeHistoryIds.has(installmentId) || Boolean(charge?.asaasPaymentId),
                });
                const installmentPaid = isInstallmentPaidForCharges(row);
                const rowBusy = asaasActionInstallmentId === installmentId || bulkBusy;
                const customerPhone = resolveChargeCustomerPhone(row);
                const whatsappShare = charge
                  ? executeChargeWhatsAppShare({
                      installmentId,
                      customerPhone,
                      charge,
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
                      <span className="text-xs text-[var(--text-secondary)]">{view.asaasStatusLabel}</span>
                    </td>
                    <td>
                      <ChargeInstallmentActions
                        view={view}
                        charge={charge}
                        installmentPaid={installmentPaid}
                        integrationActive={integrationActive}
                        companyAsaasEnabled={asaasAccessAvailable}
                        ownerReadOnly={ownerReadOnly}
                        busy={rowBusy}
                        installmentsDataReady={installmentsDataReady}
                        customerPhone={customerPhone}
                        whatsappShareUrl={whatsappShareUrl}
                        hasPaidChargeHistory={
                          asaasChargeHistoryIds.has(installmentId) ||
                          Boolean(charge?.asaasPaymentId)
                        }
                        onGenerate={(billingType) =>
                          void handleCreateAsaasCharge(installmentId, billingType)
                        }
                        onRefreshStatus={() => void handleRefreshAsaas(installmentId)}
                        onCancel={() => void handleCancelAsaas(installmentId)}
                        onRegenerate={(billingType) =>
                          void handleRegenerateAsaas(installmentId, billingType)
                        }
                        onCopyPix={() => charge && void handleCopyPix(charge)}
                        onCopyBarcodeLine={() => charge && void handleCopyBarcodeLine(charge)}
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
    </div>
  );
}

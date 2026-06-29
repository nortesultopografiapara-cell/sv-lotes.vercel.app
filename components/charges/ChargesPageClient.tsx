'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { isCompanyAsaasEnabled } from '@/lib/finance/companyAsaasAccess';
import {
  executeChargeWhatsAppShare,
  openChargeWhatsAppShareUrl,
  resolveChargeContractNumber,
  resolveChargeCustomerPhone,
  withCompanyAsaasChargeShareFieldsPreserved,
} from '@/lib/charges/chargeWhatsAppMessage';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import type { AsaasIntegrationConfigResponse } from '@/lib/finance/asaasIntegrationConfig';
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
  computeAsaasOperationalKpis,
  isInstallmentPaidForCharges,
  mapCreateChargeApiError,
} from '@/lib/charges/chargeOperationsHelpers';
import {
  applyBulkChargeStatusToMap,
  formatChargeBulkStatusSummary,
  requestChargeBulkStatusSync,
} from '@/lib/charges/chargeBulkStatusSync';
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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [asaasChargesByInstallment, setAsaasChargesByInstallment] = useState<
    Record<string, CompanyAsaasChargeResponse>
  >({});
  const [integrationConfig, setIntegrationConfig] =
    useState<AsaasIntegrationConfigResponse | null>(null);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [asaasActionInstallmentId, setAsaasActionInstallmentId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [toastIsError, setToastIsError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const resolvedCompanyId = user?.tenant_id || (user as { company_id?: string })?.company_id;
  const companyAsaasEnabled = isCompanyAsaasEnabled(resolvedCompanyId);
  const ownerReadOnly = isOwnerRole(user?.role);
  const asaasModuleEnabled = bankingUiEnabled && companyAsaasEnabled;
  const integrationActive = useMemo(
    () => resolveChargesIntegrationReady(integrationConfig),
    [integrationConfig],
  );
  const integrationReady = companyAsaasEnabled && integrationActive;
  const installmentsDataReady = !loading && !loadError;

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
    if (!companyAsaasEnabled) {
      setIntegrationConfig(null);
      return false;
    }

    setIntegrationLoading(true);
    try {
      const res = await fetch(`/api/finance/asaas/integration?_=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
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
  }, [companyAsaasEnabled]);

  const loadChargeMap = useCallback(async (installmentIds: string[]) => {
    if (!companyAsaasEnabled || installmentIds.length === 0) {
      setAsaasChargesByInstallment({});
      return {} as Record<string, CompanyAsaasChargeResponse>;
    }

    try {
      const chargesRes = await fetch(
        `/api/finance/asaas/charges?installmentIds=${encodeURIComponent(installmentIds.join(','))}&_=${Date.now()}`,
        { credentials: 'include', cache: 'no-store' },
      );
      if (!chargesRes.ok) return {} as Record<string, CompanyAsaasChargeResponse>;
      const chargesJson = await chargesRes.json().catch(() => ({}));
      const charges = (chargesJson.charges || []) as CompanyAsaasChargeResponse[];
      const syncErrors = (chargesJson.receiptSyncErrors || []) as Array<{
        chargeId?: string;
        installmentId: string;
        error: string;
      }>;
      if (syncErrors.length > 0) {
        console.error('CHARGES_RECEIPT_SYNC_ERRORS', syncErrors);
        showToast(
          syncErrors[0]?.error ||
            'Falha ao sincronizar parcela paga com o Financeiro.',
          true,
        );
      }
      const map: Record<string, CompanyAsaasChargeResponse> = {};
      for (const charge of charges) {
        map[charge.installmentId] = charge;
      }
      setAsaasChargesByInstallment(map);
      return map;
    } catch (err) {
      console.error('CHARGES_ASAAS_LOAD', err);
      return {} as Record<string, CompanyAsaasChargeResponse>;
    }
  }, [companyAsaasEnabled, showToast]);

  const loadInstallments = useCallback(async (options?: { syncAsaasStatuses?: boolean }) => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const rlsCtx = await resolveRlsContext(user);
      const resolvedTenantId =
        rlsCtx.tenantId || user.tenant_id || (user as { company_id?: string }).company_id || null;

      if (!rlsCtx.isSuperAdmin && !resolvedTenantId) {
        setPayments([]);
        return;
      }

      let query = supabase
        .from('finance_receipts')
        .select(FINANCE_RECEIPTS_LIST_SELECT)
        .order('due_date', { ascending: true });

      query = applyTenantFilter(query, rlsCtx, 'finance_receipts');
      let { data, error } = await query;

      if (error) {
        let fallbackQuery = supabase
          .from('finance_receipts')
          .select(FINANCE_RECEIPTS_LIST_SELECT_FALLBACK)
          .order('due_date', { ascending: true });
        fallbackQuery = applyTenantFilter(fallbackQuery, rlsCtx, 'finance_receipts');
        const fallbackRes = await fallbackQuery;
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) {
        const message =
          error.message ||
          'Não foi possível carregar as parcelas. Verifique a conexão e tente novamente.';
        setLoadError(message);
        setPayments([]);
        showToast(message, true);
        return;
      }

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
      const integrationOk = await loadIntegrationStatus();
      const chargeMap = await loadChargeMap(installmentIds);

      let finalRows = scoped;
      if (installmentIds.length > 0) {
        let refreshQuery = supabase
          .from('finance_receipts')
          .select(FINANCE_RECEIPTS_LIST_SELECT)
          .in('id', installmentIds)
          .order('due_date', { ascending: true });
        refreshQuery = applyTenantFilter(refreshQuery, rlsCtx, 'finance_receipts');
        const { data: refreshedData, error: refreshError } = await refreshQuery;
        if (!refreshError && refreshedData) {
          finalRows = scopeFinanceRowsForUser(
            user,
            refreshedData,
            ownerCtx.rows,
            resolveReceiptProjectId,
          );
        }
      }

      setPayments(finalRows);

      const shouldSyncAsaas =
        Boolean(options?.syncAsaasStatuses) &&
        integrationOk &&
        companyAsaasEnabled &&
        !ownerReadOnly &&
        installmentIds.length > 0;

      if (shouldSyncAsaas) {
        try {
          const syncIds = Object.keys(chargeMap).length > 0 ? Object.keys(chargeMap) : installmentIds;
          const result = await requestChargeBulkStatusSync(syncIds);
          setAsaasChargesByInstallment((prev) => applyBulkChargeStatusToMap(prev, result));

          if (result.receiptUpdatedCount > 0 || result.paid > 0) {
            let refreshQuery = supabase
              .from('finance_receipts')
              .select(FINANCE_RECEIPTS_LIST_SELECT)
              .in('id', installmentIds)
              .order('due_date', { ascending: true });
            refreshQuery = applyTenantFilter(refreshQuery, rlsCtx, 'finance_receipts');
            const { data: syncedReceipts, error: syncedError } = await refreshQuery;
            if (!syncedError && syncedReceipts) {
              setPayments(
                scopeFinanceRowsForUser(
                  user,
                  syncedReceipts,
                  ownerCtx.rows,
                  resolveReceiptProjectId,
                ),
              );
            }
          }

          if (result.updated > 0 || result.failed > 0) {
            showToast(formatChargeBulkStatusSummary(result), result.updated === 0 && result.failed > 0);
          }
        } catch (syncErr) {
          console.error('CHARGES_ASAAS_BULK_SYNC', syncErr);
          showToast(
            syncErr instanceof Error
              ? syncErr.message
              : 'Erro ao sincronizar status Asaas com a lista.',
            true,
          );
        }
      }
    } catch (err) {
      console.error('CHARGES_LOAD', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Erro inesperado ao carregar parcelas.';
      setLoadError(message);
      setPayments([]);
      showToast(message, true);
    } finally {
      setLoading(false);
    }
  }, [
    user,
    companyAsaasEnabled,
    ownerReadOnly,
    loadIntegrationStatus,
    loadChargeMap,
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
    void loadInstallments();
  }, [loadInstallments]);

  const filteredRows = useMemo(
    () =>
      filterChargeInstallments(payments, {
        search,
        statusFilter,
        projectFilter,
        startDate,
        endDate,
      }),
    [payments, search, statusFilter, projectFilter, startDate, endDate],
  );

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
        companyAsaasEnabled,
        ownerReadOnly,
        installmentsDataReady,
      }),
    [
      selectedIds,
      payments,
      asaasChargesByInstallment,
      integrationActive,
      companyAsaasEnabled,
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
        companyAsaasEnabled,
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
        const created = await createAsaasChargeRequest(installmentId, 'PIX');
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
            <button
              type="button"
              onClick={() => void runRefreshAllCharges()}
              disabled={loading || bulkBusy || allWithChargeCount === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-600/90 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              title="Consultar Asaas e baixar parcelas pagas de todas as cobranças visíveis"
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar todas as cobranças
            </button>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {loadError}
        </div>
      ) : null}

      {companyAsaasEnabled && !integrationActive && !loading && !integrationLoading ? (
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
              <th>Status parcela</th>
              <th>Status Asaas</th>
              <th className="text-right min-w-[280px]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-[var(--text-secondary)]">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
                  Carregando cobranças...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-[var(--text-secondary)]">
                  Nenhuma parcela encontrada para os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const installmentId = String(row.id);
                const charge = asaasChargesByInstallment[installmentId] ?? null;
                const view = buildChargeInstallmentView(row, charge);
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
                        companyAsaasEnabled={companyAsaasEnabled}
                        ownerReadOnly={ownerReadOnly}
                        busy={rowBusy}
                        installmentsDataReady={installmentsDataReady}
                        customerPhone={customerPhone}
                        whatsappShareUrl={whatsappShareUrl}
                        onGenerate={(billingType) =>
                          void handleCreateAsaasCharge(installmentId, billingType)
                        }
                        onRefreshStatus={() => void handleRefreshAsaas(installmentId)}
                        onCancel={() => void handleCancelAsaas(installmentId)}
                        onRegenerate={(billingType) =>
                          void handleRegenerateAsaas(installmentId, billingType)
                        }
                        onCopyPix={() => charge && void handleCopyPix(charge)}
                        onCopyLink={() => charge && void handleCopyLink(charge)}
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
    </div>
  );
}

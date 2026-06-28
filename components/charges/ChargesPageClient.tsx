'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Banknote, Calendar, Copy, ExternalLink, Filter, Loader2, RefreshCw, Search, Wallet } from 'lucide-react';
import { FinanceStatCard, FinanceStatusBadge } from '@/components/finance/FinancePremiumUI';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { applyTenantFilter, resolveRlsContext } from '@/lib/rls';
import { isBankingModuleEnabledForUi } from '@/lib/banking/config';
import { isCompanyAsaasEnabled } from '@/lib/finance/companyAsaasAccess';
import { isCompanyAsaasIntegrationReady } from '@/lib/finance/companyAsaasChargeTypes';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import type { AsaasIntegrationConfigResponse } from '@/lib/finance/asaasIntegrationConfig';
import {
  resolveCompanyAsaasBoletoUrl,
  resolveCompanyAsaasPaymentLink,
} from '@/lib/finance/companyAsaasChargeWorkflow';
import {
  buildChargeInstallmentView,
  computeChargeKpiSummary,
  filterChargeInstallments,
  type FinanceReceiptRow,
} from '@/lib/charges/chargeInstallmentHelpers';
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

export function ChargesPageClient() {
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
  const [companyAsaasActive, setCompanyAsaasActive] = useState(false);
  const [asaasActionInstallmentId, setAsaasActionInstallmentId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const bankingUiEnabled = isBankingModuleEnabledForUi();
  const resolvedCompanyId = user?.tenant_id || (user as { company_id?: string })?.company_id;
  const companyAsaasEnabled = isCompanyAsaasEnabled(resolvedCompanyId);
  const ownerReadOnly = isOwnerRole(user?.role);

  const loadAsaasCharges = useCallback(
    async (installmentIds: string[]) => {
      if (!bankingUiEnabled || !companyAsaasEnabled || installmentIds.length === 0) {
        setCompanyAsaasActive(false);
        setAsaasChargesByInstallment({});
        return;
      }

      try {
        const integrationRes = await fetch('/api/finance/asaas/integration', {
          credentials: 'include',
        });
        if (!integrationRes.ok) {
          setCompanyAsaasActive(false);
          setAsaasChargesByInstallment({});
          return;
        }
        const integrationJson = await integrationRes.json().catch(() => ({}));
        const integration = integrationJson.integration as AsaasIntegrationConfigResponse;
        const active = isCompanyAsaasIntegrationReady(integration);
        setCompanyAsaasActive(active);
        if (!active) {
          setAsaasChargesByInstallment({});
          return;
        }

        const chargesRes = await fetch(
          `/api/finance/asaas/charges?installmentIds=${encodeURIComponent(installmentIds.join(','))}`,
          { credentials: 'include' },
        );
        if (!chargesRes.ok) return;
        const chargesJson = await chargesRes.json().catch(() => ({}));
        const charges = (chargesJson.charges || []) as CompanyAsaasChargeResponse[];
        const map: Record<string, CompanyAsaasChargeResponse> = {};
        for (const charge of charges) {
          map[charge.installmentId] = charge;
        }
        setAsaasChargesByInstallment(map);
      } catch (err) {
        console.error('CHARGES_ASAAS_LOAD', err);
        setCompanyAsaasActive(false);
      }
    },
    [bankingUiEnabled, companyAsaasEnabled],
  );

  const loadInstallments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
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
        .select(`
          *,
          customers!finance_receipts_customer_id_fkey(*),
          sales:sale_id(id, installments_count, projects(name), contracts(contract_number)),
          projects:project_id(*),
          blocks:block_id(*)
        `)
        .order('due_date', { ascending: true });

      query = applyTenantFilter(query, rlsCtx, 'finance_receipts');
      let { data, error } = await query;

      if (error) {
        let fallbackQuery = supabase
          .from('finance_receipts')
          .select('*, customers!finance_receipts_customer_id_fkey(*), sales:sale_id(*), projects:project_id(*), blocks:block_id(*)')
          .order('due_date', { ascending: true });
        fallbackQuery = applyTenantFilter(fallbackQuery, rlsCtx, 'finance_receipts');
        const fallbackRes = await fallbackQuery;
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) throw error;

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

      setPayments(scoped);
      await loadAsaasCharges(scoped.map((row) => String(row.id)));
    } catch (err) {
      console.error('CHARGES_LOAD', err);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [user, loadAsaasCharges]);

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
      if (charge) {
        setAsaasChargesByInstallment((prev) => ({ ...prev, [installmentId]: charge }));
        setToast('Status Asaas atualizado.');
      } else {
        setToast('Nenhuma cobrança Asaas vinculada a esta parcela.');
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Erro ao atualizar status Asaas.');
    } finally {
      setAsaasActionInstallmentId(null);
      window.setTimeout(() => setToast(null), 3200);
    }
  };

  const handleCopyPix = async (charge: CompanyAsaasChargeResponse) => {
    const pix = charge.pixCopyPaste?.trim();
    if (!pix) {
      setToast('PIX indisponível para esta cobrança.');
      window.setTimeout(() => setToast(null), 3200);
      return;
    }
    const ok = await copyText(pix);
    setToast(ok ? 'PIX copiado.' : 'Não foi possível copiar o PIX.');
    window.setTimeout(() => setToast(null), 3200);
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
            Painel operacional de parcelas e cobranças Asaas da empresa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadInstallments()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar lista
        </button>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-100">
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

      <div className="finance-table-wrap overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <table className="finance-table w-full min-w-[960px]">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Empreendimento</th>
              <th>Quadra/Lote</th>
              <th>Parcela</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Status parcela</th>
              <th>Status Asaas</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-[var(--text-secondary)]">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
                  Carregando cobranças...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-[var(--text-secondary)]">
                  Nenhuma parcela encontrada para os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const charge = asaasChargesByInstallment[String(row.id)] ?? null;
                const view = buildChargeInstallmentView(row, charge);
                const paymentLink = charge ? resolveCompanyAsaasPaymentLink(charge) : '';
                const boletoUrl = charge ? resolveCompanyAsaasBoletoUrl(charge) : '';
                const pixCopy = charge?.pixCopyPaste?.trim() || '';
                const rowBusy = asaasActionInstallmentId === view.id;

                return (
                  <tr key={view.id} className="finance-parcel-row">
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
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {paymentLink ? (
                          <a
                            href={paymentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-[11px] font-medium hover:bg-[var(--bg-elevated)]"
                            title="Abrir cobrança Asaas"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Link
                          </a>
                        ) : null}
                        {pixCopy ? (
                          <button
                            type="button"
                            onClick={() => void handleCopyPix(charge!)}
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-[11px] font-medium hover:bg-[var(--bg-elevated)]"
                            title="Copiar PIX"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            PIX
                          </button>
                        ) : null}
                        {boletoUrl ? (
                          <a
                            href={boletoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-[11px] font-medium hover:bg-[var(--bg-elevated)]"
                            title="Abrir boleto"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Boleto
                          </a>
                        ) : null}
                        {companyAsaasActive && companyAsaasEnabled && !ownerReadOnly ? (
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => void handleRefreshAsaas(view.id)}
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
                            title="Atualizar status Asaas"
                          >
                            {rowBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Status
                          </button>
                        ) : null}
                      </div>
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

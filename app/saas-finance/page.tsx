'use client';

import { Suspense, useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { augmentCompanyBilling } from '@/lib/masterBilling';
import {
  formatSaasCurrency,
  isBillableCompany,
  resolveCompanyPricing,
  type CompanyPricingSource,
} from '@/lib/companyPricing';
import type { CompanyContractRow } from '@/lib/saasContractService';
import { formatSaasContractApiError } from '@/lib/saasContractErrors';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { mapAuditLogRow } from '@/lib/masterAudit';
import {
  saasContractOptionalFieldsWarning,
  validateSaasContractGeneration,
} from '@/lib/saasContractValidation';
import {
  formatDateBr,
  hasSaasContractReady,
  isRealSaasCompany,
  type CompanySubscription,
} from '@/lib/saasSubscription';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  buildPaidReferenceMonthsByCompany,
  sumReceivedRevenue,
  type MasterSaasPayment,
} from '@/lib/masterSaasPayments';
import {
  computeSaasBillingMetrics,
  type MasterSaasInvoice,
} from '@/lib/saasBilling';
import { formatPaymentHistoryDetails } from '@/lib/masterSaasFinancialStatus';
import {
  buildSaasInvoiceChargeRows,
  type SaasInvoiceChargeRow,
} from '@/lib/saasInvoiceChargeView';
import { SaasChargeViewModal } from '@/components/master/SaasChargeViewModal';
import type { SaasCharge } from '@/lib/saasCharges';
import { RegisterSaasPaymentModal } from '@/components/master/RegisterSaasPaymentModal';
import { SaasMainNav, SaasFinanceStartAtBanner } from '@/components/master/saas/SaasPanelUi';
import { SaasDashboardKpis } from '@/components/master/saas/SaasDashboardKpis';
import { SaasChargesTable } from '@/components/master/saas/SaasChargesTable';
import {
  SaasCompaniesList,
  SaasSubscriptionsSummaryTable,
  type SaasCompanyRow,
} from '@/components/master/saas/SaasCompaniesList';
import { SaasCompanyWorkspace } from '@/components/master/saas/SaasCompanyWorkspace';
import {
  SaasGenerateChargeModal,
  type SaasGenerateChargeCompany,
} from '@/components/master/saas/SaasGenerateChargeModal';
import { SaasAutomationsPanel } from '@/components/master/saas/SaasAutomationsPanel';
import { SaasCashPanel } from '@/components/master/saas/SaasCashPanel';
import { SuperAdminOnlyGuard } from '@/components/admin/SuperAdminOnlyGuard';
import {
  applySaasFinanceStartAtFilter,
  sumSaasReceivedRevenue,
} from '@/lib/saasFinanceSettings';
import {
  buildSaasChargeEmailUrl,
  buildSaasChargeWhatsAppUrl,
  buildSaasTimelineFromHistory,
  countSuspendedCompanies,
  type SaasCompanyTab,
  type SaasPanelView,
} from '@/lib/masterSaasPanel';
import type { SaasMasterBillingType } from '@/lib/saasMasterConfig';

type EnrichedCompany = ReturnType<typeof augmentCompanyBilling>;

function enrichCompany(
  raw: CompanyPricingSource,
  subscription?: CompanySubscription | null,
  paidReferenceMonths?: Map<string, Set<string>>,
  payments?: MasterSaasPayment[],
): EnrichedCompany {
  return augmentCompanyBilling(raw, subscription, { paidReferenceMonths, payments });
}

function normalizeChargeSkipMessage(skipped: string): string {
  const lower = skipped.toLowerCase();
  if (
    lower.includes('já existe') ||
    lower.includes('ja existe') ||
    lower.includes('competência') ||
    lower.includes('competencia') ||
    lower.includes('faturada') ||
    lower.includes('confirmado')
  ) {
    return 'Cobrança já existe para esta competência.';
  }
  return skipped;
}

function toGenerateChargeCompany(
  company: EnrichedCompany | SaasCompanyRow,
): SaasGenerateChargeCompany {
  return {
    id: String((company as { id?: string }).id || ''),
    name: company.name || '—',
    next_payment_date: (company as { next_payment_date?: string | null }).next_payment_date,
    next_due_date: (company as { next_due_date?: string | null }).next_due_date,
    subscription_due_day: (company as { subscription_due_day?: number | null }).subscription_due_day,
    plan: (company as { plan?: string | null }).plan,
    plan_type: (company as { plan_type?: string | null }).plan_type,
    custom_price: (company as { custom_price?: number | null }).custom_price,
    price: (company as { price?: number | null }).price,
  };
}

export default function SaaSFinancePage() {
  return (
    <MasterSuperAdminGuard>
      <Suspense fallback={null}>
        <SaaSFinancePageContent />
      </Suspense>
    </MasterSuperAdminGuard>
  );
}

function SaaSFinancePageContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [companies, setCompanies] = useState<EnrichedCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [panelView, setPanelView] = useState<SaasPanelView>('dashboard');
  const [companyTab, setCompanyTab] = useState<SaasCompanyTab>('dados');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [filterChargeCompany, setFilterChargeCompany] = useState('all');
  const [filterChargeStatus, setFilterChargeStatus] = useState('all');
  const [contractHistory, setContractHistory] = useState<CompanyContractRow[]>([]);
  const [loadingContractId, setLoadingContractId] = useState<string | null>(null);
  const [contractToast, setContractToast] = useState<{
    type: 'error' | 'warning';
    message: string;
  } | null>(null);
  const [billingHistory, setBillingHistory] = useState<
    ReturnType<typeof mapAuditLogRow>[]
  >([]);
  const [saasPayments, setSaasPayments] = useState<MasterSaasPayment[]>([]);
  const [saasInvoices, setSaasInvoices] = useState<MasterSaasInvoice[]>([]);
  const [saasCharges, setSaasCharges] = useState<SaasCharge[]>([]);
  const [chargeViewRow, setChargeViewRow] = useState<SaasInvoiceChargeRow | null>(null);
  const [syncingChargeId, setSyncingChargeId] = useState<string | null>(null);
  const [deletingChargeId, setDeletingChargeId] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentInitialCompanyId, setPaymentInitialCompanyId] = useState<string | undefined>();
  const [paymentInitialInvoiceId, setPaymentInitialInvoiceId] = useState<string | undefined>();
  const [generatingInvoiceId, setGeneratingInvoiceId] = useState<string | null>(null);
  const [generateChargeCompany, setGenerateChargeCompany] =
    useState<SaasGenerateChargeCompany | null>(null);
  const [paymentGateway, setPaymentGateway] = useState<{
    configured: boolean;
    message?: string | null;
    provider?: string | null;
  }>({ configured: true });
  const [cashStartAt, setCashStartAt] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('SAAS_FINANCE_LOAD_ERROR', error);
        setCompanies([]);
        return;
      }

      const rows = (data || []) as CompanyPricingSource[];

      let subscriptions: CompanySubscription[] = [];
      const syncRes = await fetch('/api/saas/subscriptions/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      if (syncRes.ok) {
        const syncJson = await syncRes.json();
        subscriptions = (syncJson.subscriptions || []) as CompanySubscription[];
        if (syncJson.created > 0) {
          console.log('SAAS_SUBSCRIPTIONS_SYNC_CREATED', syncJson.created);
        }
      } else {
        const syncErr = await syncRes.json().catch(() => ({}));
        console.warn('SAAS_SUBSCRIPTIONS_SYNC_FAILED', syncErr.error || syncRes.status);
      }

      const subMap = new Map(subscriptions.map((s) => [s.company_id, s]));

      rows.forEach((company) => {
        if (!isRealSaasCompany(company)) return;
        const subscription = subMap.get(company.id) ?? null;
        console.log('SAAS_SUBSCRIPTION_DYNAMIC', {
          company: { id: company.id, name: company.name },
          subscription,
          next_due_date: subscription?.next_due_date ?? null,
          payment_status: subscription?.payment_status ?? 'pending',
        });
      });

      const payRes = await fetch(
        `/api/master/saas-payments?userId=${encodeURIComponent(user.id)}`,
      );
      const payJson = await payRes.json().catch(() => ({}));
      const payments = (payRes.ok ? payJson.payments : []) as MasterSaasPayment[];
      setSaasPayments(payments);

      const invRes = await fetch(
        `/api/master/saas-invoices?userId=${encodeURIComponent(user.id)}`,
      );
      const invJson = await invRes.json().catch(() => ({}));
      const invoices = (invRes.ok ? invJson.invoices : []) as MasterSaasInvoice[];
      setSaasInvoices(invoices);

      const chRes = await fetch(
        `/api/master/saas-charges?userId=${encodeURIComponent(user.id)}`,
      );
      const chJson = await chRes.json().catch(() => ({}));
      setSaasCharges(chRes.ok ? chJson.charges || [] : []);
      if (chJson.gateway) {
        setPaymentGateway({
          configured: !!chJson.gateway.configured,
          message: chJson.gateway.message,
          provider: chJson.gateway.provider,
        });
      }

      const startRes = await fetch(
        `/api/master/saas-cash/start-at?userId=${encodeURIComponent(user.id)}`,
        { credentials: 'include' },
      );
      const startJson = await startRes.json().catch(() => ({}));
      const financeStartAt =
        startRes.ok && startJson.cashStartAt ? String(startJson.cashStartAt) : null;
      setCashStartAt(financeStartAt);

      const filteredPayments = applySaasFinanceStartAtFilter(payments, financeStartAt);
      const filteredInvoices = applySaasFinanceStartAtFilter(invoices, financeStartAt);
      const paidReferenceMonths = buildPaidReferenceMonthsByCompany(filteredPayments);

      setCompanies(
        rows.map((c) => enrichCompany(c, subMap.get(c.id), paidReferenceMonths, filteredPayments)),
      );

      const { data: billingLogs } = await supabase
        .from('audit_logs')
        .select('id, action, module, description, created_at, tenant_id, user_id')
        .eq('module', 'SUBSCRIPTIONS')
        .order('created_at', { ascending: false })
        .limit(50);

      const companyNameMap = Object.fromEntries(rows.map((c) => [c.id, c.name || '—']));
      const { data: platformUsers } = await supabase
        .from('users')
        .select('id, name, full_name, email');
      const userNameMap = Object.fromEntries(
        (platformUsers || []).map((u) => [
          u.id,
          u.name || u.full_name || u.email || 'Usuário',
        ]),
      );
      const auditRows = (billingLogs || []).map((row) =>
        mapAuditLogRow(row, companyNameMap, userNameMap),
      );
      const paymentRows = payments.map((payment) => ({
        id: `payment-${payment.id}`,
        created_at: payment.paid_at,
        user_name: 'Master',
        action: 'Pagamento registrado',
        company_name: payment.company_name || companyNameMap[payment.company_id] || '—',
        details: formatPaymentHistoryDetails(payment),
      }));
      setBillingHistory(
        [...paymentRows, ...auditRows].sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        }),
      );
    } catch (err) {
      console.error('SAAS_FINANCE_LOAD_ERROR', err);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [loadData, authLoading]);

  const stats = useMemo(() => {
    let mrr = 0;
    let activeClients = 0;

    companies.forEach((c) => {
      const pricing = resolveCompanyPricing(c);
      const applied = pricing.appliedPrice;

      if (isBillableCompany(c)) {
        activeClients++;
        mrr += applied;
      }
    });

    const filteredInvoices = applySaasFinanceStartAtFilter(saasInvoices, cashStartAt);
    const paymentsReceived = sumSaasReceivedRevenue(saasPayments, cashStartAt);
    const invoiceMetrics = computeSaasBillingMetrics(filteredInvoices, mrr, paymentsReceived);

    return {
      mrr,
      arr: mrr * 12,
      projectedRevenue: invoiceMetrics.projectedRevenue,
      receivedRevenue: paymentsReceived,
      revenueToReceive: invoiceMetrics.revenueToReceive,
      overdueRevenue: invoiceMetrics.overdueRevenue,
      activeClients,
      delinquencyAmount: invoiceMetrics.delinquencyAmount,
      pendingInvoices: invoiceMetrics.pendingCount,
      overdueInvoices: invoiceMetrics.overdueCount,
      dueSoonInvoices: invoiceMetrics.dueSoonCount,
    };
  }, [companies, saasPayments, saasInvoices, cashStartAt]);

  const allChargeRows = useMemo(
    () => buildSaasInvoiceChargeRows(saasInvoices, saasCharges),
    [saasInvoices, saasCharges],
  );

  const suspendedCount = useMemo(
    () =>
      countSuspendedCompanies(
        companies as Array<{
          financial_situation?: string;
          company_operational_status?: string;
          status_operacional?: string;
        }>,
      ),
    [companies],
  );

  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const matchSearch =
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        String((c as { email?: string }).email || '')
          .toLowerCase()
          .includes(search.toLowerCase());
      const matchPlan = filterPlan === 'all' || c.ui_plan === filterPlan;
      const matchStatus =
        filterStatus === 'all' ||
        c.subscription_status.toLowerCase() === filterStatus.toLowerCase();
      const matchPayment =
        filterPayment === 'all' ||
        String(c.financial_situation || c.payment_status).toLowerCase() ===
          filterPayment.toLowerCase();

      return matchSearch && matchPlan && matchStatus && matchPayment;
    });
  }, [companies, search, filterPlan, filterStatus, filterPayment]);

  const companyListRows = useMemo(
    () =>
      filteredCompanies.map(
        (c) =>
          ({
            ...c,
            id: (c as { id?: string }).id || '',
          }) as SaasCompanyRow,
      ),
    [filteredCompanies],
  );

  const paymentCompanyOptions = useMemo(
    () =>
      companies.map((c) => {
        const id = (c as { id?: string }).id || '';
        const sub = c.saas_subscription as CompanySubscription | null;
        return {
          id,
          name: c.name || '—',
          defaultAmount: resolveCompanyPricing(c).appliedPrice,
          subscriptionId: sub?.id ?? null,
        };
      }),
    [companies],
  );

  const handleWhatsAppCharge = useCallback(
    (row: SaasInvoiceChargeRow, phone?: string | null) => {
      const url = buildSaasChargeWhatsAppUrl(phone, row);
      if (!url) {
        alert('Telefone não cadastrado para WhatsApp.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [],
  );

  const handleEmailCharge = useCallback(
    (row: SaasInvoiceChargeRow, email?: string | null) => {
      const url = buildSaasChargeEmailUrl(email, row);
      if (!url) {
        alert('E-mail não cadastrado.');
        return;
      }
      window.location.href = url;
    },
    [],
  );

  const handleCancelCharge = useCallback(
    async (row: SaasInvoiceChargeRow) => {
      if (!user?.id || !row.chargeId) return;
      if (!confirm('Cancelar esta cobrança no Asaas?')) return;
      try {
        const res = await fetch('/api/master/saas-charges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            action: 'cancel',
            chargeId: row.chargeId,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Falha ao cancelar');
        alert('Cobrança cancelada.');
        await loadData();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao cancelar');
      }
    },
    [user?.id, loadData],
  );

  const handleDeleteCancelledCharge = useCallback(
    async (row: SaasInvoiceChargeRow) => {
      if (!user?.id || !row.chargeId) return;
      const confirmed = confirm(
        'Essa cobrança cancelada será removida do painel Master, do painel do cliente e, se possível, também do Asaas. Deseja continuar?',
      );
      if (!confirmed) return;
      setDeletingChargeId(row.chargeId);
      try {
        const res = await fetch(
          `/api/saas/billing/charges/${encodeURIComponent(row.chargeId)}?userId=${encodeURIComponent(user.id)}`,
          { method: 'DELETE' },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Falha ao excluir cobrança');
        alert('Cobrança cancelada excluída com sucesso.');
        await loadData();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao excluir cobrança');
      } finally {
        setDeletingChargeId(null);
      }
    },
    [user?.id, loadData],
  );

  const getCompanyPhone = useCallback(
    (companyId: string) =>
      String(
        (companies.find((c) => (c as { id?: string }).id === companyId) as { phone?: string })
          ?.phone || '',
      ),
    [companies],
  );

  const getCompanyEmail = useCallback(
    (companyId: string) =>
      String(
        (companies.find((c) => (c as { id?: string }).id === companyId) as { email?: string })
          ?.email || '',
      ),
    [companies],
  );

  const handleCopyPix = useCallback(async (pix: string) => {
    if (!pix) return;
    await navigator.clipboard.writeText(pix);
    alert('PIX copiado para a área de transferência.');
  }, []);

  const handleCopyPixRow = useCallback(
    (row: SaasInvoiceChargeRow) => {
      if (!row.pixCopyPaste) return;
      void handleCopyPix(row.pixCopyPaste);
    },
    [handleCopyPix],
  );

  const handleOpenInvoice = useCallback((row: SaasInvoiceChargeRow) => {
    const url = row.invoiceUrl || row.paymentUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleOpenBankSlip = useCallback((row: SaasInvoiceChargeRow) => {
    if (row.bankSlipUrl) window.open(row.bankSlipUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const handleSyncChargeStatus = useCallback(
    async (row: SaasInvoiceChargeRow) => {
      if (!user?.id || !row.chargeId) {
        alert('Cobrança sem registro em saas_charges para sincronizar.');
        return;
      }
      setSyncingChargeId(row.chargeId);
      try {
        const res = await fetch('/api/master/saas-charges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            action: 'sync_status',
            chargeId: row.chargeId,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Falha ao sincronizar status');
        alert(
          json.paid
            ? 'Pagamento confirmado no Asaas e registrado no sistema.'
            : `Status atualizado: ${json.statusSynced || json.charge?.status || 'OK'}`,
        );
        await loadData();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao atualizar status');
      } finally {
        setSyncingChargeId(null);
      }
    },
    [user?.id, loadData],
  );

  const openPaymentModal = useCallback(
    (company?: EnrichedCompany, invoice?: MasterSaasInvoice) => {
      setPaymentInitialCompanyId((company as { id?: string } | undefined)?.id || invoice?.company_id);
      setPaymentInitialInvoiceId(invoice?.id);
      setPaymentModalOpen(true);
    },
    [],
  );

  const chargeActionHandlers = useMemo(
    () => ({
      onViewCharge: (row: SaasInvoiceChargeRow) => {
        setChargeViewRow(row);
        if (row.chargeId && user?.id) {
          void fetch('/api/master/saas-charges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              action: 'refresh_pix',
              chargeId: row.chargeId,
            }),
          }).then(() => loadData());
        }
      },
      onCopyPix: handleCopyPixRow,
      onOpenInvoice: handleOpenInvoice,
      onOpenBankSlip: handleOpenBankSlip,
      onWhatsApp: handleWhatsAppCharge,
      onEmail: handleEmailCharge,
      onSyncStatus: handleSyncChargeStatus,
      onCancelCharge: handleCancelCharge,
      onDeleteCancelledCharge: handleDeleteCancelledCharge,
      onRegisterPayment: (row: SaasInvoiceChargeRow) => {
        const company = companies.find((c) => (c as { id?: string }).id === row.companyId);
        openPaymentModal(company, saasInvoices.find((i) => i.id === row.invoiceId));
      },
    }),
    [
      handleCopyPixRow,
      handleOpenInvoice,
      handleOpenBankSlip,
      handleWhatsAppCharge,
      handleEmailCharge,
      handleSyncChargeStatus,
      handleCancelCharge,
      handleDeleteCancelledCharge,
      user?.id,
      loadData,
      companies,
      saasInvoices,
      openPaymentModal,
    ],
  );

  const openGenerateChargeModal = useCallback((company: EnrichedCompany | SaasCompanyRow) => {
    const id = (company as { id?: string }).id;
    if (!id) return;
    setGenerateChargeCompany(toGenerateChargeCompany(company));
  }, []);

  const submitGenerateCharge = useCallback(
    async (payload: {
      billingType: SaasMasterBillingType;
      referenceMonth: string;
      dueDate: string;
    }) => {
      const companyId = generateChargeCompany?.id;
      if (!companyId || !user?.id) return;
      setGeneratingInvoiceId(companyId);
      try {
        const res = await fetch('/api/master/saas-charges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            companyId,
            action: 'generate',
            billingType: payload.billingType,
            referenceMonth: payload.referenceMonth,
            dueDate: payload.dueDate,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Falha ao gerar cobrança');
        if (json.skipped) {
          alert(normalizeChargeSkipMessage(String(json.skipped)));
        } else if (payload.billingType === 'BOLETO') {
          alert('Boleto gerado com sucesso.');
        } else {
          alert('Cobrança PIX gerada com sucesso.');
        }
        setGenerateChargeCompany(null);
        await loadData();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao gerar cobrança');
      } finally {
        setGeneratingInvoiceId(null);
      }
    },
    [generateChargeCompany?.id, user?.id, loadData],
  );

  const handleGenerateMonthlyInvoices = useCallback(async () => {
    if (!user?.id) return;
    setGeneratingInvoiceId('monthly');
    try {
      const res = await fetch('/api/master/saas-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          action: 'generate_monthly',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha na geração mensal');
      const created = Number(json.created ?? 0);
      const completed = Number(json.completed ?? 0);
      const parts = [
        `Criadas no Asaas: ${created}`,
        `Faturas completadas com PIX: ${completed}`,
        `Ignoradas: ${json.skipped ?? 0}`,
      ];
      if (Array.isArray(json.errors) && json.errors.length > 0) {
        parts.push('', 'Erros por empresa:');
        for (const err of json.errors) {
          parts.push(`• ${err}`);
        }
      }
      alert(parts.join('\n'));
      if (created + completed > 0) {
        setPanelView('cobrancas');
      }
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro na geração mensal');
    } finally {
      setGeneratingInvoiceId(null);
    }
  }, [user?.id, loadData]);

  const selectedCompany = useMemo(
    () => companies.find((c) => (c as { id?: string }).id === selectedCompanyId) || null,
    [companies, selectedCompanyId],
  );

  const companyTimeline = useMemo(() => {
    if (!selectedCompany) return [];
    const name = selectedCompany.name || '';
    return buildSaasTimelineFromHistory(
      billingHistory.filter((row) => row.company_name === name),
    );
  }, [selectedCompany, billingHistory]);

  const selectedSubscription = useMemo(
    () =>
      (selectedCompany?.saas_subscription as CompanySubscription | null) ?? null,
    [selectedCompany],
  );

  const selectedCompanyRow = useMemo(
    () => companyListRows.find((c) => c.id === selectedCompanyId) || null,
    [companyListRows, selectedCompanyId],
  );

  const workspaceCompany = useMemo((): SaasCompanyRow | null => {
    if (selectedCompanyRow) return selectedCompanyRow;
    if (!selectedCompany) return null;
    return {
      ...(selectedCompany as SaasCompanyRow),
      id: (selectedCompany as { id?: string }).id || '',
    };
  }, [selectedCompanyRow, selectedCompany]);

  const loadCompanyContracts = useCallback(
    async (companyId: string): Promise<CompanyContractRow[]> => {
      if (!user?.id) return [];
      try {
        const res = await fetch(
          `/api/companies/${companyId}/contracts?userId=${encodeURIComponent(user.id)}&includeArchived=1`,
        );
        const json = await res.json().catch(() => ({}));
        const list = (json.contracts || []) as CompanyContractRow[];
        if (res.ok) {
          setContractHistory(list);
          return list;
        }
      } catch (err) {
        console.error('LOAD_COMPANY_CONTRACTS_ERROR', err);
      }
      setContractHistory([]);
      return [];
    },
    [user?.id],
  );

  useEffect(() => {
    const companyId = searchParams.get('company');
    if (!companyId || loading || companies.length === 0) return;
    const exists = companies.some((c) => (c as { id?: string }).id === companyId);
    if (!exists) return;
    setSelectedCompanyId(companyId);
    setPanelView('empresas');
    void loadCompanyContracts(companyId);
  }, [searchParams, loading, companies, loadCompanyContracts]);

  const handleGenerateSaasContract = useCallback(
    async (
      company: EnrichedCompany,
      subscription: CompanySubscription | null,
      options?: { regenerate?: boolean },
    ) => {
      const companyId = (company as { id?: string }).id;
      if (!companyId) {
        alert('Não foi possível gerar o contrato');
        return;
      }
      if (!user?.id) {
        alert('Não foi possível gerar o contrato');
        return;
      }

      const loadingKey = subscription?.id || companyId;
      if (loadingContractId === loadingKey) return;

      console.log('SAAS_CONTRACT_GENERATE_START');
      console.log('SAAS_CONTRACT_COMPANY_DATA', company);
      console.log('SAAS_CONTRACT_SUBSCRIPTION_DATA', subscription);
      setLoadingContractId(loadingKey);
      setContractToast(null);

      const validation = validateSaasContractGeneration(company, subscription);
      if (!validation.ok) {
        const msg = validation.error || 'Não foi possível gerar o contrato';
        setContractToast({ type: 'error', message: msg });
        alert(msg);
        setLoadingContractId(null);
        return;
      }

      const optionalWarn = saasContractOptionalFieldsWarning(validation.warnings);
      if (optionalWarn) {
        setContractToast({ type: 'warning', message: optionalWarn });
      } else {
        setContractToast(null);
      }

      const pricing = resolveCompanyPricing(company);
      const regenerate =
        options?.regenerate === true || hasSaasContractReady(subscription);

      try {
        const res = await fetch(`/api/companies/${companyId}/contract/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            subscription_id: subscription?.id ?? null,
            company_id: companyId,
            regenerate,
            plan_type: subscription?.plan_type || company.plan_type || company.plan,
            monthly_price: subscription?.monthly_price ?? pricing.appliedPrice,
          }),
        });

        const result = await res.json().catch(() => ({}));
        console.log('SAAS_CONTRACT_API_RESPONSE', result);

        if (!res.ok || result.success === false) {
          throw new Error(formatSaasContractApiError(result));
        }

        console.log('SAAS_CONTRACT_PDF_URL', result.contract_pdf_url);
        console.log('SAAS_CONTRACT_GENERATED_SUCCESS', result);

        const updatedSub: CompanySubscription | null =
          (result.subscription as CompanySubscription | undefined) ??
          (subscription
            ? {
                ...subscription,
                contract_status: 'generated',
                contract_number:
                  result.contract_number ?? subscription.contract_number ?? null,
                contract_pdf_url:
                  result.contract_pdf_url ?? subscription.contract_pdf_url ?? null,
              }
            : null);

        const enrichedRow = enrichCompany(
          company as CompanyPricingSource,
          updatedSub,
        );

        setCompanies((prev) =>
          prev.map((row) => {
            const rowId = (row as { id?: string }).id;
            if (rowId !== companyId) return row;
            return enrichedRow;
          }),
        );

        setSelectedCompanyId(companyId);

        const contracts = Array.isArray(result.contracts)
          ? (result.contracts as CompanyContractRow[])
          : await loadCompanyContracts(companyId);
        if (Array.isArray(result.contracts)) {
          setContractHistory(result.contracts as CompanyContractRow[]);
        }

        console.log('CONTRACT_GENERATE_SUCCESS_SELECTED', {
          company: enrichedRow,
          subscription: updatedSub,
          contracts,
        });

        setPanelView('empresas');
        setCompanyTab('contrato');
        setContractToast(null);
      } catch (err) {
        console.error('GENERATE_SAAS_CONTRACT_ERROR', err);
        const msg =
          err instanceof Error ? err.message : 'Não foi possível gerar o contrato';
        setContractToast({ type: 'error', message: msg });
        alert(msg);
        throw err;
      } finally {
        setLoadingContractId(null);
      }
    },
    [user?.id, loadingContractId, loadCompanyContracts],
  );

  const formatCurrency = (val: number) => formatSaasCurrency(val);
  const isSuperAdmin = String(user?.role || '').toUpperCase() === 'SUPER_ADMIN';
  const cashCompanyOptions = useMemo(
    () =>
      companies.map((company) => ({
        id: String((company as { id?: string }).id || ''),
        name: String(company.name || company.fantasy_name || '—'),
      })),
    [companies],
  );
  const gatewayReady = paymentGateway.configured;
  const gatewayDisabledTitle =
    paymentGateway.message ||
    'Gateway de pagamento não configurado. Configure ASAAS_API_KEY.';

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8 bg-[#070b14] min-h-full font-sans text-gray-200 selection:bg-blue-500/30">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight leading-tight">
            Painel Master SaaS
          </h1>
          <p className="text-gray-400 mt-1 text-[14px]">
            Cobranças, assinaturas e empresas centralizados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <Link
            href="/companies?new=1"
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
          >
            + Nova Empresa
          </Link>
          <Link
            href="/plans"
            className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
          >
            + Nova Assinatura
          </Link>
          <button
            type="button"
            onClick={() => void handleGenerateMonthlyInvoices()}
            disabled={generatingInvoiceId === 'monthly'}
            className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
          >
            {generatingInvoiceId === 'monthly' ? 'Gerando…' : 'Gerar cobranças do mês'}
          </button>
          <button
            type="button"
            onClick={loadData}
            className="bg-[#11161d] border border-white/10 hover:bg-white/5 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {!gatewayReady && (
        <div className="mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-100 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Gateway PIX não configurado</p>
            <p className="mt-1 text-amber-100/90">{gatewayDisabledTitle}</p>
            <p className="mt-1 text-xs text-amber-200/70">
              Cobranças PIX ficam desabilitadas até configurar <code className="text-amber-50">ASAAS_API_KEY</code> em produção.
            </p>
          </div>
        </div>
      )}

      <SaasMainNav
        active={panelView}
        isSuperAdmin={isSuperAdmin}
        onChange={(view) => {
          setPanelView(view);
          if (view !== 'empresas') setSelectedCompanyId(null);
        }}
      />

      <SaasFinanceStartAtBanner cashStartAt={cashStartAt} />

      {contractToast && panelView === 'empresas' ? (
        <div
          className={`mb-6 p-3 rounded-lg text-sm whitespace-pre-line ${
            contractToast.type === 'warning'
              ? 'bg-amber-500/10 border border-amber-500/25 text-amber-100'
              : 'bg-red-500/10 border border-red-500/20 text-red-300'
          }`}
        >
          {contractToast.message}
        </div>
      ) : null}

      {panelView === 'dashboard' ? (
        <SaasDashboardKpis
          receivedRevenue={stats.receivedRevenue}
          revenueToReceive={stats.revenueToReceive}
          delinquencyAmount={stats.delinquencyAmount}
          activeClients={stats.activeClients}
          suspendedClients={suspendedCount}
          pendingInvoices={stats.pendingInvoices}
          formatCurrency={formatCurrency}
        />
      ) : null}

      {panelView === 'empresas' ? (
        workspaceCompany && selectedCompany ? (
          <SaasCompanyWorkspace
            company={workspaceCompany}
            tab={companyTab}
            onTabChange={setCompanyTab}
            onBack={() => setSelectedCompanyId(null)}
            subscription={selectedSubscription}
            contractHistory={contractHistory}
            chargeRows={allChargeRows}
            timelineEvents={companyTimeline}
            gatewayReady={gatewayReady}
            syncingChargeId={syncingChargeId}
            deletingChargeId={deletingChargeId}
            generatingInvoice={generatingInvoiceId === selectedCompanyId}
            loadingContract={
              !!selectedCompanyId &&
              loadingContractId === (selectedSubscription?.id || selectedCompanyId)
            }
            onRefresh={loadData}
            onContractsReload={() => {
              void loadCompanyContracts(selectedCompanyId!);
            }}
            onGenerateContract={(opts) =>
              handleGenerateSaasContract(selectedCompany, selectedSubscription, {
                regenerate: opts?.regenerate,
              })
            }
            onGenerateCharge={() => openGenerateChargeModal(selectedCompany)}
            onRegisterPayment={() => openPaymentModal(selectedCompany)}
            chargeHandlers={chargeActionHandlers}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
            <div className="lg:col-span-1 min-w-0">
              <SaasCompaniesList
                companies={companyListRows}
                loading={loading}
                search={search}
                onSearchChange={setSearch}
                selectedId={selectedCompanyId}
                onSelect={(id) => {
                  setSelectedCompanyId(id);
                  setCompanyTab('dados');
                  void loadCompanyContracts(id);
                }}
              />
            </div>
            <div className="lg:col-span-2 min-w-0 space-y-4">
              <SaasSubscriptionsSummaryTable
                companies={companyListRows}
                onOpenCompany={(id) => {
                  setSelectedCompanyId(id);
                  setCompanyTab('assinatura');
                  void loadCompanyContracts(id);
                }}
              />
              <div className="bg-[#11161d] border border-white/5 rounded-2xl p-5">
                <h3 className="font-bold text-white text-[15px] mb-4">Filtros</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FilterField label="Plano" value={filterPlan} onChange={setFilterPlan}>
                    <option value="all">Todos</option>
                    <option value="BÁSICO">Básico</option>
                    <option value="BUSINESS">Business</option>
                    <option value="PROFISSIONAL">Profissional</option>
                  </FilterField>
                  <FilterField label="Status" value={filterStatus} onChange={setFilterStatus}>
                    <option value="all">Todos</option>
                    <option value="ativa">Ativa</option>
                    <option value="inadimplente">Inadimplente</option>
                  </FilterField>
                  <FilterField
                    label="Situação financeira"
                    value={filterPayment}
                    onChange={setFilterPayment}
                  >
                    <option value="all">Todas</option>
                    <option value="em dia">Em dia</option>
                    <option value="vence em breve">Vence em breve</option>
                    <option value="vencido">Vencido</option>
                    <option value="inativo">Inativo</option>
                    <option value="suspenso">Suspenso</option>
                  </FilterField>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFilterPlan('all');
                    setFilterStatus('all');
                    setFilterPayment('all');
                    setSearch('');
                  }}
                  className="mt-4 px-4 py-2 rounded-lg border border-white/10 text-gray-300 text-sm hover:bg-white/5"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </div>
        )
      ) : null}

      {panelView === 'cobrancas' ? (
        <SaasChargesTable
          rows={allChargeRows}
          loading={loading}
          gatewayReady={gatewayReady}
          syncingChargeId={syncingChargeId}
          deletingChargeId={deletingChargeId}
          getCompanyPhone={getCompanyPhone}
          getCompanyEmail={getCompanyEmail}
          filterCompany={filterChargeCompany}
          onFilterCompany={setFilterChargeCompany}
          filterStatus={filterChargeStatus}
          onFilterStatus={setFilterChargeStatus}
          companies={companies.map((c) => ({
            id: (c as { id?: string }).id || '',
            name: c.name || '—',
          }))}
          {...chargeActionHandlers}
        />
      ) : null}

      {panelView === 'automacoes' ? <SaasAutomationsPanel /> : null}

      {panelView === 'caixa' ? (
        <SuperAdminOnlyGuard>
          <SaasCashPanel companies={cashCompanyOptions} />
        </SuperAdminOnlyGuard>
      ) : null}

      <SaasChargeViewModal
        row={chargeViewRow}
        onClose={() => setChargeViewRow(null)}
        onCopyPix={handleCopyPix}
      />

      {user?.id ? (
        <RegisterSaasPaymentModal
          open={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          userId={user.id}
          companies={paymentCompanyOptions}
          initialCompanyId={paymentInitialCompanyId}
          initialInvoiceId={paymentInitialInvoiceId}
          onSuccess={loadData}
        />
      ) : null}

      <SaasGenerateChargeModal
        open={!!generateChargeCompany}
        company={generateChargeCompany}
        loading={
          !!generateChargeCompany && generatingInvoiceId === generateChargeCompany.id
        }
        onClose={() => {
          if (generatingInvoiceId !== generateChargeCompany?.id) {
            setGenerateChargeCompany(null);
          }
        }}
        onSubmit={submitGenerateCharge}
      />
    </div>
  );
}

function FilterField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1 uppercase">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#070b14] border border-white/10 rounded-lg p-2.5 text-[13px] text-white"
      >
        {children}
      </select>
    </div>
  );
}

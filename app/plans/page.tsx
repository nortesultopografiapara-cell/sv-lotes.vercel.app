'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Building2, Search, Shield, Crown,
  Loader2, X, Check, Power,
  Edit2, CreditCard, Download, Plus, PauseCircle, Wallet, TrendingUp
} from 'lucide-react';
import { MasterCompactKpi } from '@/components/master/MasterCompactKpi';
import { formatSaasCurrency, resolveCompanyPricing } from '@/lib/companyPricing';
import { augmentCompanyBilling } from '@/lib/masterBilling';
import {
  buildPaidReferenceMonthsByCompany,
  type MasterSaasPayment,
} from '@/lib/masterSaasPayments';
import { computeSaasBillingMetrics, type MasterSaasInvoice } from '@/lib/saasBilling';
import { formatDateBr } from '@/lib/saasSubscription';
import { useAuth } from '@/hooks/useAuth';
import { MasterEmptyState } from '@/components/master/MasterEmptyState';
import { calculateMrrFromCompanies } from '@/lib/companyPricing';
import { RegisterSaasPaymentModal } from '@/components/master/RegisterSaasPaymentModal';
import { SaasFinanceStartAtBanner } from '@/components/master/saas/SaasPanelUi';
import { sumSaasReceivedRevenue } from '@/lib/saasFinanceSettings';
import { loadMasterSaasFinanceData } from '@/lib/masterSaasFinanceClientLoad';
import { supabase } from '@/lib/supabase';
import {
  getCompanySaasPlan,
  normalizeSaasPlanKey,
  saasLimitsDbPayload,
} from '@/lib/saasPlans';
import {
  runMasterSubscriptionAction,
} from '@/lib/masterSubscriptionActions';
import type { CompanySubscription } from '@/lib/saasSubscription';
import { motion, AnimatePresence } from 'motion/react';

const PLAN_OPTIONS = {
  starter: { id: 'starter', dbKey: 'basic', name: 'BÁSICO', theme: 'green' as const },
  business: { id: 'business', dbKey: 'standard', name: 'BUSINESS', theme: 'blue' as const },
  enterprise: { id: 'enterprise', dbKey: 'professional', name: 'PROFISSIONAL', theme: 'purple' as const },
};

const mapDbPlanToUi = (companyOrPlan: string | Record<string, unknown>) => {
  const key =
    typeof companyOrPlan === 'string'
      ? normalizeSaasPlanKey(companyOrPlan)
      : getCompanySaasPlan(companyOrPlan as Parameters<typeof getCompanySaasPlan>[0]).planKey;
  if (key === 'profissional') return PLAN_OPTIONS.enterprise;
  if (key === 'business') return PLAN_OPTIONS.business;
  return PLAN_OPTIONS.starter;
};

export default function PlansPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [subscriptionsMap, setSubscriptionsMap] = useState<Record<string, CompanySubscription>>({});
  const [stats, setStats] = useState({
    mrr: 0,
    arr: 0,
    activeSubscriptions: 0,
    suspendedSubscriptions: 0,
    receivedRevenue: 0,
    openRevenue: 0,
  });
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [companyToEdit, setCompanyToEdit] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentInitialCompanyId, setPaymentInitialCompanyId] = useState<string | undefined>();
  const [saasPayments, setSaasPayments] = useState<MasterSaasPayment[]>([]);
  const [cashStartAt, setCashStartAt] = useState<string | null>(null);

  const loadCompanies = useCallback(async () => {
    setDataLoading(true);
    setLoadError(null);
    try {
      const [
        { data: companiesData, error: compErr },
        { data: subscriptionsData },
        { data: invoicesData },
      ] = await Promise.all([
         supabase.from('companies').select('*').order('created_at', { ascending: false }),
         supabase.from('company_subscriptions').select('*'),
         supabase.from('master_saas_invoices').select('*'),
      ]);

      if (compErr) {
        console.error('PLANS_LOAD_ERROR companies', compErr);
        setLoadError(compErr.message);
        setCompanies([]);
        setStats({
          mrr: 0,
          arr: 0,
          activeSubscriptions: 0,
          suspendedSubscriptions: 0,
          receivedRevenue: 0,
          openRevenue: 0,
        });
        return;
      }

      const finalCompanies = companiesData || [];
      const subsMap = Object.fromEntries(
        ((subscriptionsData || []) as CompanySubscription[]).map((s) => [s.company_id, s]),
      );
      setCompanies(finalCompanies);
      setSubscriptionsMap(subsMap);

      let payments: MasterSaasPayment[] = [];
      let financeStartAt: string | null = null;
      if (user?.id) {
        const financeData = await loadMasterSaasFinanceData(supabase);
        if (financeData.errors.length > 0) {
          setLoadError(financeData.errors.join(' · '));
        }
        payments = financeData.payments;
        financeStartAt = financeData.cashStartAt;
      }
      setSaasPayments(payments);
      setCashStartAt(financeStartAt);

      const paidReferenceMonths = buildPaidReferenceMonthsByCompany(payments);
      const enriched = finalCompanies.map((c) =>
        augmentCompanyBilling(c, subsMap[c.id], { paidReferenceMonths, payments }),
      );
      const activeSubscriptions = enriched.filter((c) => c.subscription_status === 'Ativa').length;
      const suspendedSubscriptions = enriched.filter((c) => c.subscription_status === 'Suspensa').length;

      const calculatedMrr = calculateMrrFromCompanies(finalCompanies);
      const billingMetrics = computeSaasBillingMetrics(
        (invoicesData || []) as MasterSaasInvoice[],
        calculatedMrr,
        sumSaasReceivedRevenue(payments, financeStartAt),
      );

      setStats({
        mrr: calculatedMrr,
        arr: calculatedMrr * 12,
        activeSubscriptions,
        suspendedSubscriptions,
        receivedRevenue: sumSaasReceivedRevenue(payments, financeStartAt),
        openRevenue: billingMetrics.revenueToReceive,
      });
    } catch (error) {
      console.error('PLANS_LOAD_ERROR', error);
      setLoadError('Falha ao carregar dados do Supabase.');
      setCompanies([]);
      setStats({
        mrr: 0,
        arr: 0,
        activeSubscriptions: 0,
        suspendedSubscriptions: 0,
        receivedRevenue: 0,
        openRevenue: 0,
      });
    } finally {
      setDataLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'SUPER_ADMIN') {
      router.push('/dashboard');
      return;
    }
    
    loadCompanies();
  }, [user, authLoading, router, loadCompanies]);

  const handleSubscriptionAction = async (
    company: any,
    action: 'suspend' | 'reactivate' | 'renew',
  ) => {
    if (!user?.id) return;
    const subscription = subscriptionsMap[company.id];
    if (!subscription?.id) {
      alert('Assinatura não encontrada para esta empresa.');
      return;
    }
    setActionLoadingId(`${company.id}-${action}`);
    try {
      await runMasterSubscriptionAction({
        userId: user.id,
        subscriptionId: subscription.id,
        companyId: company.id,
        action,
      });
      await loadCompanies();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenPlanModal = (company: any) => {
    setCompanyToEdit(company);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCompanyToEdit(null);
  };

  const currentPlanVal = companyToEdit?.plan || 'basic';

  const handleSavePlan = async (newPlanDbKey: string) => {
    if (!companyToEdit) return;
    setIsSubmitting(true);
    console.log(`SAAS_PLAN_UPDATE - Iniciando update para empresa ${companyToEdit.id} para o plano ${newPlanDbKey}`);
    
    try {
      const planLimits = saasLimitsDbPayload(newPlanDbKey);
      
      // Update locally immediately for better UX
      setCompanies(prev => prev.map(c => 
         c.id === companyToEdit.id ? {
           ...c,
           plan: planLimits.plan,
           max_brokers: planLimits.max_brokers,
           max_projects: planLimits.max_projects,
           broker_limit: planLimits.broker_limit,
           project_limit: planLimits.project_limit,
         } : c
      ));

      // Attempt DB update
      const { error } = await supabase.from('companies').update({
        plan: planLimits.plan,
        max_brokers: planLimits.max_brokers,
        max_projects: planLimits.max_projects,
        broker_limit: planLimits.broker_limit,
        project_limit: planLimits.project_limit,
        updated_at: new Date().toISOString()
      }).eq('id', companyToEdit.id);

      if (error) {
         console.error("SAAS_PLAN_UPDATE_ERROR - Erro ao salvar no supabase.", error);
      } else {
         console.log(`SAAS_PLAN_UPDATE - Sucesso!`);
      }
      
      // Reload stats after update
      loadCompanies();
      handleCloseModal();
    } catch (e: any) {
      console.error("SAAS_PLAN_UPDATE_ERROR - Erro geral ao alterar plano: ", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCompanies = companies.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) || 
    c.cnpj?.includes(search) ||
    c.fantasy_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const paymentCompanyOptions = useMemo(
    () =>
      companies.map((company) => {
        const subscription = subscriptionsMap[company.id];
        const pricing = resolveCompanyPricing(company);
        const defaultAmount =
          subscription?.monthly_price != null
            ? Number(subscription.monthly_price)
            : pricing.appliedPrice;
        return {
          id: company.id,
          name: company.name || '—',
          defaultAmount,
          subscriptionId: subscription?.id ?? null,
        };
      }),
    [companies, subscriptionsMap],
  );

  const paidReferenceMonths = useMemo(
    () => buildPaidReferenceMonthsByCompany(saasPayments),
    [saasPayments],
  );

  const openPaymentModal = useCallback((company?: { id: string }) => {
    setPaymentInitialCompanyId(company?.id);
    setPaymentModalOpen(true);
  }, []);

  if (authLoading || dataLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] text-[var(--color-text-muted)] gap-4 bg-[#0B0E14]">
         <Loader2 className="w-8 h-8 animate-spin text-[#F97316]" />
         <p className="font-medium animate-pulse text-[#F97316]/70">Carregando Planos e Assinaturas...</p>
      </div>
    );
  }

  const getPlanTheme = (theme: string) => {
    switch (theme) {
      case 'green':
        return { text: 'text-[#22c55e]', border: 'border-[#22c55e]/30', bg: 'bg-[#22c55e]/10' };
      case 'blue':
        return { text: 'text-[#3b82f6]', border: 'border-[#3b82f6]/50', bg: 'bg-[#3b82f6]/10' };
      case 'purple':
        return { text: 'text-[#a855f7]', border: 'border-[#a855f7]/30', bg: 'bg-[#a855f7]/10' };
      default:
        return { text: 'text-gray-400', border: 'border-white/10', bg: 'bg-white/5' };
    }
  };

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8 bg-[#070b14] min-h-full font-sans text-gray-200 selection:bg-blue-500/30">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight leading-tight">
            Assinaturas
          </h1>
          <p className="text-gray-400 mt-1 text-[14px]">
            Visão administrativa dos planos contratados pelas empresas da plataforma.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <Link
            href="/companies?new=1"
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
          >
            <Building2 className="w-4 h-4" /> Nova Empresa
          </Link>
          <button
            type="button"
            onClick={() => openPaymentModal()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Registrar pagamento
          </button>
        </div>
      </div>

      {loadError && (
         <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center gap-3">
            <Shield className="w-5 h-5 shrink-0" />
            <p className="text-sm">{loadError}</p>
         </div>
      )}

      <SaasFinanceStartAtBanner cashStartAt={cashStartAt} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <MasterCompactKpi
          title="Assinaturas Ativas"
          value={String(stats.activeSubscriptions)}
          icon={<Check className="w-5 h-5 text-emerald-400" />}
          accent="border-emerald-500/20"
        />
        <MasterCompactKpi
          title="Assinaturas Suspensas"
          value={String(stats.suspendedSubscriptions)}
          icon={<PauseCircle className="w-5 h-5 text-orange-400" />}
          accent="border-orange-500/20"
        />
        <MasterCompactKpi
          title="MRR"
          value={formatSaasCurrency(stats.mrr)}
          icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
          accent="border-blue-500/20"
        />
        <MasterCompactKpi
          title="ARR"
          value={formatSaasCurrency(stats.arr)}
          icon={<CreditCard className="w-5 h-5 text-violet-400" />}
          accent="border-violet-500/20"
        />
        <MasterCompactKpi
          title="Receita Recebida"
          value={formatSaasCurrency(stats.receivedRevenue)}
          icon={<Wallet className="w-5 h-5 text-green-400" />}
          accent="border-green-500/20"
        />
        <MasterCompactKpi
          title="Receita em Aberto"
          value={formatSaasCurrency(stats.openRevenue)}
          icon={<CreditCard className="w-5 h-5 text-amber-400" />}
          accent="border-amber-500/20"
        />
      </div>

      <div className="bg-[#11161d] border border-white/5 rounded-2xl flex flex-col mb-8 overflow-hidden min-w-0 max-w-full">
        <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row items-center gap-3 justify-end bg-[#0B0E14] rounded-t-2xl">
            <div className="relative w-full sm:w-[320px]">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="text" 
                placeholder="Buscar empresa..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#070b14] border border-white/10 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-[#3b82f6]/50 text-sm shadow-inner"
              />
            </div>
            <button className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-300 text-sm hover:bg-white/5 transition-colors">
               <Download className="w-4 h-4" /> Exportar
            </button>
        </div>

        <div className="sv-table-scroll">
          <table className="w-full text-left border-collapse min-w-[720px]">
             <thead>
                <tr className="bg-[#11161d] border-b border-white/5 border-t">
                   <th className="p-4 text-[12px] text-gray-400 font-medium">Empresa</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium">Plano</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium text-right">Mensalidade</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium text-center">Próximo vencimento</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium text-center">Último pagamento</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium text-center">Status</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium text-right">Ações</th>
                </tr>
             </thead>
             <tbody>
                {filteredCompanies.map((company, index) => {
                   const uiPlan = mapDbPlanToUi(company);
                   const isStandard = uiPlan.id === 'business';
                   const isPro = uiPlan.id === 'enterprise';
                   
                   const subscription = subscriptionsMap[company.id];
                   const enriched = augmentCompanyBilling(company, subscription, {
                     paidReferenceMonths,
                     payments: saasPayments,
                   });
                   const vDate = subscription?.next_due_date
                      ? formatDateBr(subscription.next_due_date)
                      : company.next_payment_date
                      ? formatDateBr(company.next_payment_date)
                      : '—';
                   const lastPayment = enriched.last_payment_date
                     ? formatDateBr(enriched.last_payment_date)
                     : '—';
                   const monthlyPrice = enriched.price ?? resolveCompanyPricing(company).appliedPrice;

                   const avColor = index % 4 === 0 ? 'bg-emerald-500' : index % 4 === 1 ? 'bg-purple-500' : index % 4 === 2 ? 'bg-blue-500' : 'bg-orange-500';

                   return (
                     <tr key={company.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                       <td className="p-4 py-3">
                         <div className="flex items-center gap-3">
                           <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-[13px] shrink-0 ${avColor}`}>
                             {company.name?.charAt(0) || 'E'}
                           </div>
                           <div>
                             <p className="text-[14px] font-medium text-white">{company.name || 'Empresa'}</p>
                             <p className="text-[12px] text-gray-400 mt-0.5">{company.email || '—'}</p>
                           </div>
                         </div>
                       </td>
                       <td className="p-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                             isPro ? 'bg-[#a855f7]/10 text-[#a855f7] border-[#a855f7]/20' : 
                             isStandard ? 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20' : 
                             'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20'
                          }`}>
                            {uiPlan.name}
                          </span>
                       </td>
                       <td className="p-4 py-3 text-right">
                         <span className="text-[13px] text-gray-200 tabular-nums">{formatSaasCurrency(monthlyPrice)}</span>
                       </td>
                       <td className="p-4 py-3 text-center">
                          <span className="text-[12px] font-medium text-gray-300">{vDate}</span>
                       </td>
                       <td className="p-4 py-3 text-center">
                          <span className="text-[12px] font-medium text-gray-300">{lastPayment}</span>
                       </td>
                       <td className="p-4 py-3 text-center">
                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold uppercase border ${
                            enriched.subscription_status === 'Ativa'
                              ? 'text-green-500 border-green-500/20 bg-green-500/10'
                              : enriched.subscription_status === 'Suspensa'
                                ? 'text-orange-400 border-orange-500/20 bg-orange-500/10'
                                : enriched.subscription_status === 'Inadimplente'
                                  ? 'text-red-400 border-red-500/20 bg-red-500/10'
                                  : 'text-gray-400 border-white/10 bg-white/5'
                         }`}>
                           {enriched.subscription_status}
                         </span>
                       </td>
                       <td className="p-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                             <Link
                               href={`/saas-finance?company=${company.id}`}
                               className="px-2 py-1 rounded text-[10px] font-bold uppercase border border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                             >
                               Gerenciar
                             </Link>
                             <button onClick={() => handleOpenPlanModal(company)} className="w-[32px] h-[32px] rounded-lg border border-blue-500/20 flex items-center justify-center hover:bg-blue-500/10 transition-colors group" title="Alterar plano">
                                <Edit2 className="w-4 h-4 text-blue-500 group-hover:text-blue-400" />
                             </button>
                             <button
                               type="button"
                               disabled={actionLoadingId === `${company.id}-suspend`}
                               onClick={() => void handleSubscriptionAction(company, 'suspend')}
                               className="px-2 py-1 rounded text-[10px] font-bold uppercase border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                             >
                               Suspender
                             </button>
                             <button
                               type="button"
                               disabled={actionLoadingId === `${company.id}-reactivate`}
                               onClick={() => void handleSubscriptionAction(company, 'reactivate')}
                               className="px-2 py-1 rounded text-[10px] font-bold uppercase border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
                             >
                               Reativar
                             </button>
                             <button
                               type="button"
                               onClick={() => openPaymentModal(company)}
                               className="px-2 py-1 rounded text-[10px] font-bold uppercase border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                             >
                               Pagamento
                             </button>
                          </div>
                       </td>
                     </tr>
                   );
                })}
                {filteredCompanies.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-0">
                      <div className="p-6">
                        <MasterEmptyState
                          title="Nenhuma assinatura cadastrada"
                          description="Cadastre a primeira empresa para iniciar o faturamento SaaS."
                        />
                      </div>
                    </td>
                  </tr>
                )}
             </tbody>
          </table>
        </div>
      </div>

      {/* MODAL MUDAR PLANO */}
      <AnimatePresence>
        {isModalOpen && companyToEdit && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }} 
               transition={{ duration: 0.15 }}
               className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
               onClick={handleCloseModal}
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }} 
               animate={{ opacity: 1, scale: 1, y: 0 }} 
               exit={{ opacity: 0, scale: 0.95, y: 20 }} 
               transition={{ type: 'spring', damping: 25, stiffness: 300 }}
               className="bg-[#11161d] border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-0 w-full max-w-md relative z-10 overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-white/5 relative">
                 <button onClick={handleCloseModal} className="absolute right-6 top-6 p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
                   <X className="w-5 h-5" />
                 </button>
                 <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-[#f97316]/10 border border-[#f97316]/20 flex items-center justify-center">
                       <Crown className="w-5 h-5 text-[#f97316]" />
                    </div>
                    <div>
                       <h2 className="text-xl font-bold text-white tracking-tight">Alterar Plano</h2>
                       <p className="text-xs text-gray-400 mt-1">{companyToEdit.name}</p>
                    </div>
                 </div>
              </div>

              <div className="p-6 space-y-3">
                {Object.values(PLAN_OPTIONS).map((plan) => {
                   const isSelected = mapDbPlanToUi(currentPlanVal).id === plan.id;
                   const theme = getPlanTheme(plan.theme);
                   
                   return (
                     <div 
                        key={plan.id}
                        onClick={() => !isSubmitting && handleSavePlan(plan.dbKey)}
                        className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-200 group ${
                          isSelected ? `bg-[#151a23] ${theme.border} shadow-[0_0_20px_rgba(0,0,0,0.2)] relative overflow-hidden` : 'bg-[#0B0E14] border-white/5 hover:border-white/20'
                        }`}
                     >
                        {isSelected && <div className={`absolute left-0 top-0 bottom-0 w-1 ${theme.bg.replace('/10', '')}`}></div>}
                        <div className="pl-3">
                           <div className="flex items-center gap-2 mb-1">
                             <span className={`text-[14px] font-bold uppercase tracking-wider ${
                               isSelected ? theme.text : 'text-white'
                             }`}>
                               {plan.name}
                             </span>
                             {isSelected && <span className={`text-[9px] ${theme.bg} ${theme.text} px-2 py-0.5 rounded uppercase font-bold tracking-widest border ${theme.border}`}>Ativo</span>}
                           </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? `${theme.border} ${theme.bg}` : 'border-gray-500 group-hover:border-gray-400'}`}>
                           {isSelected && <Check className={`w-3.5 h-3.5 ${theme.text}`} />}
                        </div>
                     </div>
                   );
                })}
              </div>

              <div className="flex gap-3 justify-end p-5 border-t border-white/5 bg-[#0B0E14]">
                <button 
                  onClick={handleCloseModal} 
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-lg bg-transparent border border-white/10 hover:bg-white/5 text-gray-300 font-medium text-[13px] transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {user?.id ? (
        <RegisterSaasPaymentModal
          open={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          userId={user.id}
          companies={paymentCompanyOptions}
          initialCompanyId={paymentInitialCompanyId}
          onSuccess={loadCompanies}
        />
      ) : null}
    </div>
  );
}

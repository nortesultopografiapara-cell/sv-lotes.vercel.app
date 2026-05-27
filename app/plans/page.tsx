'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, Search, CheckCircle2, ShieldCore, Crown, Star,
  Loader2, Settings, ArrowRightLeft, Users, Map as MapIcon, X, Check, Zap, Power,
  Rocket, TrendingUp, Diamond, Edit2, CreditCard, MoreVertical, Filter, Download,
  BarChart3, UserCheck, TrendingUp as TrendingUpIcon, Users as UsersIcon
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { MasterEmptyState } from '@/components/master/MasterEmptyState';
import { calculateMrrFromCompanies } from '@/lib/masterProduction';
import { supabase } from '@/lib/supabase';
import {
  getCompanySaasPlan,
  normalizeSaasPlanKey,
  saasLimitsDbPayload,
} from '@/lib/saasPlans';
import { motion, AnimatePresence } from 'motion/react';

const PLANS_UI = {
  starter: {
    id: 'starter',
    dbKey: 'basic',
    name: 'BÁSICO',
    desc: 'Para loteadoras iniciantes',
    price: 'R$ 329',
    cents: ',99',
    period: ' /mês',
    theme: 'green',
    icon: Rocket,
    projectsLimit: 3,
    brokersLimit: 5,
    features: [
      'Mapa GIS Interativo',
      'Contratos Automáticos',
      'Controle Financeiro',
      'Comissão de Corretores',
      'Relatórios Avançados',
      'Dashboard Executivo'
    ],
    buttonText: 'Escolher Básico',
    popular: false
  },
  business: {
    id: 'business',
    dbKey: 'standard',
    name: 'BUSINESS',
    desc: 'Para loteadoras em crescimento',
    price: 'R$ 549',
    cents: ',99',
    period: ' /mês',
    theme: 'blue',
    icon: TrendingUp,
    projectsLimit: 6,
    brokersLimit: 10,
    features: [
      'Mapa GIS Interativo',
      'Contratos Automáticos',
      'Controle Financeiro',
      'Comissão de Corretores',
      'Relatórios Avançados',
      'Dashboard Executivo'
    ],
    buttonText: 'Escolher Business',
    popular: true
  },
  enterprise: {
    id: 'enterprise',
    dbKey: 'professional',
    name: 'PROFISSIONAL',
    desc: 'Para loteadoras grandes',
    price: 'R$ 1.099',
    cents: ',99',
    period: ' /mês',
    theme: 'purple',
    icon: Diamond,
    projectsLimit: 25,
    brokersLimit: 50,
    features: [
      'Mapa GIS Interativo',
      'Contratos Automáticos',
      'Controle Financeiro',
      'Comissão de Corretores',
      'Relatórios Avançados',
      'Dashboard Executivo'
    ],
    buttonText: 'Escolher Profissional',
    popular: false
  }
};

const mapDbPlanToUi = (companyOrPlan: string | Record<string, unknown>) => {
  const key =
    typeof companyOrPlan === 'string'
      ? normalizeSaasPlanKey(companyOrPlan)
      : getCompanySaasPlan(companyOrPlan as Parameters<typeof getCompanySaasPlan>[0]).planKey;
  if (key === 'profissional') return PLANS_UI.enterprise;
  if (key === 'business') return PLANS_UI.business;
  return PLANS_UI.starter;
};

export default function PlansPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [projectsCount, setProjectsCount] = useState<Record<string, number>>({});
  const [brokersCount, setBrokersCount] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({
     mrr: 0,
     activeCompanies: 0,
     activeUsers: 0,
  });
  const [dataLoading, setDataLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [companyToEdit, setCompanyToEdit] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCompanies = useCallback(async () => {
    setLoadError(null);
    try {
      const [
        { data: companiesData, error: compErr },
        { data: projectsData },
        { data: brokersData },
      ] = await Promise.all([
         supabase.from('companies').select('*').order('created_at', { ascending: false }),
         supabase.from('projects').select('tenant_id'),
         supabase.from('brokers').select('tenant_id'),
      ]);

      if (compErr) {
        console.error('[MASTER] erro ao carregar companies', compErr);
        setLoadError(compErr.message);
        setCompanies([]);
        setStats({ mrr: 0, activeCompanies: 0, activeUsers: 0 });
        return;
      }

      const finalCompanies = companiesData || [];
      setCompanies(finalCompanies);

      const activeCompaniesCount = finalCompanies.filter(
        (c) => c.status_operacional !== 'Inativo' && c.active !== false
      ).length;
      const calculatedMrr = calculateMrrFromCompanies(finalCompanies);

      if (projectsData) {
        const counts: Record<string, number> = {};
        projectsData.forEach((p: { tenant_id?: string }) => {
          if (p.tenant_id) counts[p.tenant_id] = (counts[p.tenant_id] || 0) + 1;
        });
        setProjectsCount(counts);
      }

      let usersCountVal = 0;
      if (brokersData) {
        const bCounts: Record<string, number> = {};
        brokersData.forEach((b: { tenant_id?: string }) => {
          if (b.tenant_id && finalCompanies.some((c) => c.id === b.tenant_id)) {
             bCounts[b.tenant_id] = (bCounts[b.tenant_id] || 0) + 1;
             usersCountVal++;
          }
        });
        setBrokersCount(bCounts);
      }

      setStats({
         mrr: calculatedMrr,
         activeCompanies: activeCompaniesCount,
         activeUsers: usersCountVal,
      });
    } catch (error) {
      console.error('[MASTER] Error loading companies:', error);
      setLoadError('Falha ao carregar dados do Supabase.');
      setCompanies([]);
      setStats({ mrr: 0, activeCompanies: 0, activeUsers: 0 });
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'SUPER_ADMIN') {
      router.push('/dashboard');
      return;
    }
    
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataLoading(true);
    loadCompanies();
  }, [user, authLoading, router, loadCompanies]);

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

  if (authLoading || dataLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] text-[var(--color-text-muted)] gap-4 bg-[#0B0E14]">
         <Loader2 className="w-8 h-8 animate-spin text-[#F97316]" />
         <p className="font-medium animate-pulse text-[#F97316]/70">Carregando Planos e Assinaturas...</p>
      </div>
    );
  }

  const getThemeVars = (theme: string) => {
     switch (theme) {
        case 'green': return { text: 'text-[#22c55e]', border: 'border-[#22c55e]/30', bg: 'bg-[#22c55e]/10', icon: 'text-[#22c55e]', hoverBorder: 'hover:border-[#22c55e] hover:shadow-[0_0_30px_rgba(34,197,94,0.15)]', buttonBg: 'bg-[#22c55e]', badgeBg: 'bg-[#22c55e]' };
        case 'blue': return { text: 'text-[#3b82f6]', border: 'border-[#3b82f6]/50', bg: 'bg-[#3b82f6]/10', icon: 'text-[#3b82f6]', hoverBorder: 'hover:border-[#3b82f6] hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]', buttonBg: 'bg-[#3b82f6]', badgeBg: 'bg-[#3b82f6]' };
        case 'purple': return { text: 'text-[#a855f7]', border: 'border-[#a855f7]/30', bg: 'bg-[#a855f7]/10', icon: 'text-[#a855f7]', hoverBorder: 'hover:border-[#a855f7] hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]', buttonBg: 'bg-[#a855f7]', badgeBg: 'bg-[#a855f7]' };
        default: return { text: 'text-gray-400', border: 'border-white/10', bg: 'bg-white/5', icon: 'text-gray-400', hoverBorder: 'hover:border-white/20', buttonBg: 'bg-gray-500', badgeBg: 'bg-gray-500' };
     }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#070b14] min-h-full font-sans text-gray-200 selection:bg-blue-500/30">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight leading-tight">
            Planos & Assinaturas
          </h1>
          <p className="text-gray-400 mt-1 text-[14px]">Gerencie seus planos e visualize as assinaturas das empresas da plataforma.</p>
        </div>
        <div className="flex flex-col gap-4">
           <div className="flex flex-wrap items-center gap-2 justify-end">
             <Link
               href="/companies?new=1"
               className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
             >
                <Building2 className="w-4 h-4" /> Nova Empresa
             </Link>
             <Link
               href="/companies?new=1"
               className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
             >
                <CreditCard className="w-4 h-4" /> Nova Assinatura
             </Link>
           </div>
           {/* Seletor Visão Planto/Assinaturas */}
           <div className="flex items-center justify-end gap-2 text-sm text-gray-400">
              <span>Visão:</span>
              <div className="flex items-center bg-[#11161d] rounded-lg border border-white/10 p-0.5">
                 <button className="bg-[#1e3a8a]/40 text-[#60a5fa] px-4 py-1.5 rounded-md font-semibold text-xs border border-[#3b82f6]/30">Planos</button>
                 <button className="text-gray-400 px-4 py-1.5 rounded-md font-medium text-xs hover:text-white transition-colors">Assinaturas</button>
              </div>
           </div>
        </div>
      </div>

      {loadError && (
         <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center gap-3">
            <ShieldCore className="w-5 h-5 shrink-0" />
            <p className="text-sm">{loadError}</p>
         </div>
      )}

      {/* PLANOS CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
         {Object.values(PLANS_UI).map((plan) => {
            const theme = getThemeVars(plan.theme);
            const Icon = plan.icon;
            
            return (
               <div key={plan.id} className={`relative flex flex-col p-8 rounded-[20px] transition-all duration-300 ${plan.popular ? `border-[1.5px] border-[#3b82f6] shadow-[0_0_20px_rgba(59,130,246,0.1)] bg-[#0B0E14] ${theme.hoverBorder}` : `border border-white/5 bg-[#0B0E14] hover:bg-[#0d1219] ${theme.hoverBorder}`}`}>
                  {plan.popular && (
                     <div className={`absolute -top-[14px] left-1/2 -translate-x-1/2 ${theme.badgeBg} text-white text-[10px] font-bold px-4 py-1.5 rounded-md uppercase tracking-wider shadow-[0_0_15px_rgba(59,130,246,0.5)] flex items-center gap-1.5`}>
                        <Star className="w-3 h-3 fill-current" /> MAIS VENDIDO
                     </div>
                  )}
                  
                  <div className="flex items-center justify-between mb-2">
                     <div className="flex-1 flex flex-col items-center">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                           <Icon className={`w-8 h-8 stroke-[1.5px] ${theme.text} drop-shadow-[0_0_8px_currentColor]`} />
                        </div>
                        <h3 className={`text-[22px] font-bold uppercase tracking-wide ${theme.text}`}>
                           {plan.name}
                        </h3>
                        <p className="text-[13px] text-gray-400 mt-1">{plan.desc}</p>
                     </div>
                  </div>
                  
                  <div className="mt-4 mb-6 flex items-baseline justify-center gap-1">
                     <span className={`text-[36px] font-bold text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]`}>{plan.price}</span>
                     {plan.cents && <span className="text-xl font-bold text-gray-300">{plan.cents}</span>}
                     {plan.period && <span className="text-[13px] text-gray-400 ml-1">{plan.period}</span>}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6 bg-[#11161d] p-3 rounded-xl border border-white/5">
                     <div className="flex flex-col items-center justify-center border-r border-white/5">
                        <div className="flex items-center gap-2 mb-1">
                           <MapIcon className={`w-4 h-4 ${theme.text}`} />
                           <span className="text-xl font-bold text-white">{plan.projectsLimit}</span>
                        </div>
                        <span className="text-[11px] text-gray-400 font-medium">Loteamentos</span>
                     </div>
                     <div className="flex flex-col items-center justify-center">
                        <div className="flex items-center gap-2 mb-1">
                           <UsersIcon className={`w-4 h-4 ${theme.text}`} />
                           <span className="text-xl font-bold text-white">{plan.brokersLimit}</span>
                        </div>
                        <span className="text-[11px] text-gray-400 font-medium">Corretores</span>
                     </div>
                  </div>
                  
                  <div className="space-y-0 grid grid-cols-2 gap-x-2 gap-y-3 mb-8 flex-1">
                     {plan.features.map((feature, i) => (
                        <div key={i} className="flex items-center gap-2 bg-[#11161d] py-1.5 px-2 rounded-md border border-white/5">
                           <div className={`rounded-full p-0.5 ${theme.bg}`}>
                              <Check className={`w-3 h-3 ${theme.text}`} />
                           </div>
                           <span className="text-[11px] text-gray-300 leading-tight">{feature}</span>
                        </div>
                     ))}
                  </div>

                  <button className={`w-full py-3.5 rounded-xl text-[14px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                     plan.popular 
                     ? 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)]' 
                     : `bg-[#11161d] border border-white/10 ${theme.text} hover:${theme.bg} hover:border-[currentColor]`
                  }`}>
                     {plan.buttonText}
                     <ArrowRightLeft className="w-4 h-4 ml-1 opacity-70" />
                  </button>
               </div>
            )
         })}
      </div>

      {/* LISTA DE EMPRESAS */}
      <div className="mb-6">
         <h2 className="text-[20px] font-bold text-white tracking-tight mb-1">Empresas & Assinaturas</h2>
         <p className="text-gray-400 text-[14px]">Gerencie os planos contratados pelas empresas da plataforma.</p>
      </div>

      <div className="bg-[#11161d] border border-white/5 rounded-2xl flex flex-col mb-8 overflow-hidden">
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
               <Filter className="w-4 h-4" /> Filtros
            </button>
            <button className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-300 text-sm hover:bg-white/5 transition-colors">
               <Download className="w-4 h-4" /> Exportar
            </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
             <thead>
                <tr className="bg-[#11161d] border-b border-white/5 border-t">
                   <th className="p-4 text-[12px] text-gray-400 font-medium">Empresa</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium">Plano Atual</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium text-center">Loteamentos</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium text-center">Corretores</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium text-center">Status</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium text-center">Vencimento</th>
                   <th className="p-4 text-[12px] text-gray-400 font-medium text-right">Ações</th>
                </tr>
             </thead>
             <tbody>
                {filteredCompanies.map((company, index) => {
                   const uiPlan = mapDbPlanToUi(company);
                   const isBasic = uiPlan.id === 'starter';
                   const isStandard = uiPlan.id === 'business';
                   const isPro = uiPlan.id === 'enterprise';
                   
                   const usersCount = brokersCount[company.id] || 0;
                   const projCount = projectsCount[company.id] || 0;
                   
                   const vDate = company.vencimento_plano
                      ? new Date(company.vencimento_plano).toLocaleDateString('pt-BR')
                      : company.due_date
                        ? new Date(company.due_date).toLocaleDateString('pt-BR')
                        : '—';
                   
                   const isActive = company.status_operacional !== 'Inativo' && company.active !== false;

                   // Avatar Color Logic
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
                             <p className="text-[12px] text-gray-400 mt-0.5">{company.email || 'contato@empresa.com.br'}</p>
                           </div>
                         </div>
                       </td>
                       <td className="p-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                             isPro ? 'bg-[#a855f7]/10 text-[#a855f7] border-[#a855f7]/20 drop-shadow-[0_0_8px_rgba(168,85,247,0.3)]' : 
                             isStandard ? 'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]' : 
                             'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]'
                          }`}>
                            {uiPlan.name}
                          </span>
                       </td>
                       <td className="p-4 py-3 text-center">
                           <span className="text-[13px] text-gray-300">
                                {projCount} <span className="text-gray-500">/ {uiPlan.projectsLimit}</span>
                           </span>
                       </td>
                       <td className="p-4 py-3 text-center">
                           <span className="text-[13px] text-gray-300">
                                {usersCount} <span className="text-gray-500">/ {uiPlan.brokersLimit}</span>
                           </span>
                       </td>
                       <td className="p-4 py-3 text-center">
                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold uppercase border ${
                            isActive ? 'text-green-500 border-green-500/20 bg-green-500/10' : 'text-red-500 border-red-500/20 bg-red-500/10'
                         }`}>
                           {isActive ? 'Ativo' : 'Inativo'}
                         </span>
                       </td>
                       <td className="p-4 py-3 text-center">
                          <span className="text-[12px] font-medium text-gray-300">{vDate}</span>
                       </td>
                       <td className="p-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                             <button onClick={() => handleOpenPlanModal(company)} className="w-[32px] h-[32px] rounded-lg border border-blue-500/20 flex items-center justify-center hover:bg-blue-500/10 transition-colors group">
                                <Edit2 className="w-4 h-4 text-blue-500 group-hover:text-blue-400" />
                             </button>
                             <button className="w-[32px] h-[32px] rounded-lg border border-yellow-500/20 flex items-center justify-center hover:bg-yellow-500/10 transition-colors group">
                                <CreditCard className="w-4 h-4 text-yellow-500 group-hover:text-yellow-400" />
                             </button>
                             <button className="w-[32px] h-[32px] rounded-lg border border-gray-600/30 flex items-center justify-center hover:bg-white/5 transition-colors text-gray-400">
                                <MoreVertical className="w-4 h-4" />
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
                          title="Nenhuma assinatura real cadastrada ainda"
                          description="Cadastre a primeira empresa para iniciar o faturamento SaaS com planos e limites reais."
                        />
                      </div>
                    </td>
                  </tr>
                )}
             </tbody>
          </table>
        </div>
      </div>

      {/* STATS FOOTER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-8 mt-2">
          <div className="bg-[#11161d] border border-green-500/20 rounded-xl p-5 flex items-center justify-between group hover:border-green-500/40 hover:shadow-[0_0_20px_rgba(34,197,94,0.1)] transition-all">
            <div>
               <p className="text-[12px] text-gray-400 font-medium mb-1">Receita Mensal (MRR)</p>
               <h4 className="text-[24px] font-bold text-white tracking-tight mb-2">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.mrr)}
               </h4>
               <p className="text-[11px] text-gray-500 font-medium tracking-wide">
                  Dados reais do Supabase
               </p>
            </div>
            <div className="w-24 h-12 flex items-end justify-end">
               <svg viewBox="0 0 100 30" className="w-full h-full overflow-visible">
                  <path d="M0 30 C 20 20, 30 25, 40 10 C 60 20, 70 5, 100 0" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" className="drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
                  <path d="M0 30 C 20 20, 30 25, 40 10 C 60 20, 70 5, 100 0 L 100 40 L 0 40 Z" fill="url(#grad-green)" opacity="0.2" />
                  <defs>
                     <linearGradient id="grad-green" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" />
                        <stop offset="100%" stopColor="transparent" />
                     </linearGradient>
                  </defs>
               </svg>
            </div>
         </div>
         <div className="bg-[#11161d] border border-blue-500/20 rounded-xl p-5 flex items-center justify-between group hover:border-blue-500/40 hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] transition-all">
            <div>
               <p className="text-[12px] text-gray-400 font-medium mb-1">Empresas Ativas</p>
               <h4 className="text-[24px] font-bold text-white tracking-tight mb-2">{stats.activeCompanies}</h4>
               <p className="text-[11px] text-blue-400 font-bold tracking-wide">
                  {(companies.length > 0 ? ((stats.activeCompanies / companies.length) * 100).toFixed(2) : 0)}% <span className="text-gray-500 font-medium">do total</span>
               </p>
            </div>
            <div className="w-24 h-12 flex items-end justify-end gap-1.5 opacity-80">
               <div className="w-2.5 bg-blue-500 rounded-t-sm" style={{height: '40%'}}></div>
               <div className="w-2.5 bg-blue-500 rounded-t-sm" style={{height: '25%'}}></div>
               <div className="w-2.5 bg-blue-500 rounded-t-sm shadow-[0_0_8px_rgba(59,130,246,0.6)]" style={{height: '80%'}}></div>
               <div className="w-2.5 bg-blue-500 rounded-t-sm" style={{height: '50%'}}></div>
               <div className="w-2.5 bg-blue-500 rounded-t-sm" style={{height: '65%'}}></div>
            </div>
         </div>
         <div className="bg-[#11161d] border border-purple-500/20 rounded-xl p-5 flex items-center justify-between group hover:border-purple-500/40 hover:shadow-[0_0_20px_rgba(168,85,247,0.1)] transition-all">
            <div>
               <p className="text-[12px] text-gray-400 font-medium mb-1">Usuários Ativos</p>
               <h4 className="text-[24px] font-bold text-white tracking-tight mb-2">{stats.activeUsers}</h4>
               <p className="text-[11px] text-gray-500 font-medium tracking-wide">
                  Corretores cadastrados
               </p>
            </div>
            <div className="w-24 h-12 flex items-end justify-end">
               <svg viewBox="0 0 100 30" className="w-full h-full overflow-visible">
                  <path d="M0 20 C 20 30, 30 15, 40 25 C 60 5, 70 20, 100 2" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" className="drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]" />
                  <path d="M0 20 C 20 30, 30 15, 40 25 C 60 5, 70 20, 100 2 L 100 40 L 0 40 Z" fill="url(#grad-purple)" opacity="0.2" />
                  <defs>
                     <linearGradient id="grad-purple" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="transparent" />
                     </linearGradient>
                  </defs>
               </svg>
            </div>
         </div>
         <div className="bg-[#11161d] border border-orange-500/20 rounded-xl p-5 flex items-center justify-between group hover:border-orange-500/40 hover:shadow-[0_0_20px_rgba(249,115,22,0.1)] transition-all">
            <div>
               <p className="text-[12px] text-gray-400 font-medium mb-1">Empresas cadastradas</p>
               <h4 className="text-[24px] font-bold text-white tracking-tight mb-2">{companies.length}</h4>
               <p className="text-[11px] text-gray-500 font-medium tracking-wide">
                  Apenas tenants reais
               </p>
            </div>
            <div className="w-24 h-12 flex items-end justify-end">
               <svg viewBox="0 0 100 30" className="w-full h-full overflow-visible">
                  <path d="M0 25 C 20 25, 40 10, 60 20 C 80 5, 90 15, 100 5" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" className="drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]" />
                  <path d="M0 25 C 20 25, 40 10, 60 20 C 80 5, 90 15, 100 5 L 100 40 L 0 40 Z" fill="url(#grad-orange)" opacity="0.2" />
                  <defs>
                     <linearGradient id="grad-orange" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="transparent" />
                     </linearGradient>
                  </defs>
               </svg>
            </div>
         </div>
      </div>

      {/* MODAL MUDAR PLANO COM ANIMAÇÃO */}
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
                {Object.values(PLANS_UI).map((plan) => {
                   const isSelected = mapDbPlanToUi(currentPlanVal).id === plan.id;
                   const theme = getThemeVars(plan.theme);
                   
                   return (
                     <div 
                        key={plan.id}
                        onClick={() => !isSubmitting && handleSavePlan(plan.dbKey)}
                        className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-200 group ${
                          isSelected ? `bg-[#151a23] ${theme.border} shadow-[0_0_20px_rgba(0,0,0,0.2)] relative overflow-hidden` : 'bg-[#0B0E14] border-white/5 hover:border-white/20'
                        }`}
                     >
                        {isSelected && <div className={`absolute left-0 top-0 bottom-0 w-1 ${theme.bg.replace('/10', '')} shadow-[0_0_10px_currentColor] ${theme.text}`}></div>}
                        <div className="pl-3">
                           <div className="flex items-center gap-2 mb-1">
                             <span className={`text-[14px] font-bold uppercase tracking-wider ${
                               isSelected ? theme.text : 'text-white'
                             }`}>
                               {plan.name}
                             </span>
                             {isSelected && <span className={`text-[9px] ${theme.bg} ${theme.text} px-2 py-0.5 rounded uppercase font-bold tracking-widest border ${theme.border}`}>Ativo</span>}
                           </div>
                           <p className="text-xs text-gray-400 font-medium">
                             {plan.price} &bull; {plan.features[0]}
                           </p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? `${theme.border} ${theme.bg}` : 'border-gray-500 group-hover:border-gray-400'}`}>
                           {isSelected && <CheckCircle2 className={`w-3.5 h-3.5 ${theme.text}`} />}
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
    </div>
  );
}

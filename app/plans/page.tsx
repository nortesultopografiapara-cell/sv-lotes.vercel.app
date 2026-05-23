'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, Search, CheckCircle2, ShieldCore, Crown, Star,
  Loader2, Settings, ArrowRightLeft, Users, Map as MapIcon, X
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'motion/react';

const PLANS = {
  basic: { name: 'Básico', brokers: 5, projects: 3, role: 'basic', label: 'Básico' },
  standard: { name: 'Standard', brokers: 10, projects: 5, role: 'standard', label: 'Standard' },
  professional: { name: 'Premium', brokers: -1, projects: -1, role: 'professional', label: 'Profissional / Premium' },
};

export default function PlansPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [projectsCount, setProjectsCount] = useState<any>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [companyToEdit, setCompanyToEdit] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCompanies = useCallback(async () => {
    setDataLoading(true);
    try {
      const [ { data: companiesData }, { data: projectsData } ] = await Promise.all([
         supabase
          .from('companies')
          .select(`*, users(count)`)
          .order('created_at', { ascending: false }),
         supabase
          .from('projects')
          .select('tenant_id')
      ]);

      if (companiesData) {
        setCompanies(companiesData);
      }
      
      if (projectsData) {
        const counts: Record<string, number> = {};
        projectsData.forEach(p => {
          if (p.tenant_id) {
            counts[p.tenant_id] = (counts[p.tenant_id] || 0) + 1;
          }
        });
        setProjectsCount(counts);
      }

    } catch (error) {
      console.error('Error loading companies:', error);
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

  const handleSavePlan = async (newPlan: string) => {
    if (!companyToEdit) return;
    setIsSubmitting(true);
    
    try {
      const planLimits = PLANS[newPlan as keyof typeof PLANS] || PLANS.basic;
      
      const { error } = await supabase.from('companies').update({
        plan: newPlan,
        max_brokers: planLimits.brokers,
        max_projects: planLimits.projects
      }).eq('id', companyToEdit.id);

      if (error) throw error;
      
      await loadCompanies();
      handleCloseModal();
    } catch (e: any) {
      alert("Erro ao alterar plano: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCompanies = companies.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) || 
    c.cnpj?.includes(search) ||
    c.fantasy_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading || dataLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-4">
         <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
         <p>Carregando planos e empresas...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#0a0d14] min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Crown className="w-6 h-6 text-yellow-500" />
            Planos & Assinaturas
          </h1>
          <p className="text-gray-400 mt-1 text-sm">Gerencie os limites e licenças de todas as empresas cadastradas.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
         {/* PLANO BÁSICO */}
         <div className="bg-[#11161d] border border-white/5 p-6 rounded-2xl relative overflow-hidden group hover:border-[#3b82f6]/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
               <h3 className="text-xl font-bold text-white">Básico</h3>
               <div className="p-2 bg-[#3b82f6]/10 text-[#3b82f6] rounded-lg">
                  <Star className="w-5 h-5" />
               </div>
            </div>
            <p className="text-sm text-gray-400 mb-6">Ideal para loteadoras e startups que estão iniciando as operações de vendas.</p>
            <div className="space-y-3">
               <div className="flex items-center text-sm text-gray-300 gap-3">
                  <Users className="w-4 h-4 text-[#3b82f6]" /> Limite de 5 corretores
               </div>
               <div className="flex items-center text-sm text-gray-300 gap-3">
                  <MapIcon className="w-4 h-4 text-[#3b82f6]" /> Até 3 loteamentos
               </div>
            </div>
         </div>

         {/* PLANO STANDARD */}
         <div className="bg-[#11161d] border border-white/5 p-6 rounded-2xl relative overflow-hidden group hover:border-[#10b981]/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
               <h3 className="text-xl font-bold text-white">Standard</h3>
               <div className="p-2 bg-[#10b981]/10 text-[#10b981] rounded-lg">
                  <ShieldCore className="w-5 h-5" />
               </div>
            </div>
            <p className="text-sm text-gray-400 mb-6">Perfeito para empresas em crescimento buscando organizar suas gestões de vendas.</p>
            <div className="space-y-3">
               <div className="flex items-center text-sm text-gray-300 gap-3">
                  <Users className="w-4 h-4 text-[#10b981]" /> Limite de 10 corretores
               </div>
               <div className="flex items-center text-sm text-gray-300 gap-3">
                  <MapIcon className="w-4 h-4 text-[#10b981]" /> Até 5 loteamentos
               </div>
            </div>
         </div>

         {/* PLANO PROFISSIONAL */}
         <div className="bg-[#151a23] border border-yellow-500/30 p-6 rounded-2xl relative overflow-hidden group hover:border-yellow-500/50 transition-colors shadow-[0_0_20px_rgba(234,179,8,0.1)]">
            <div className="absolute top-0 right-0 bg-yellow-500 text-black text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Premium</div>
            <div className="flex items-center justify-between mb-4">
               <h3 className="text-xl font-bold text-white">Profissional</h3>
               <div className="p-2 bg-yellow-500/10 text-yellow-500 rounded-lg">
                  <Crown className="w-5 h-5" />
               </div>
            </div>
            <p className="text-sm text-gray-400 mb-6">Solução ilimitada para grandes operações e empresas consolidadas.</p>
            <div className="space-y-3">
               <div className="flex items-center text-sm text-gray-300 gap-3">
                  <Users className="w-4 h-4 text-yellow-500" /> Corretores ilimitados
               </div>
               <div className="flex items-center text-sm text-gray-300 gap-3">
                  <MapIcon className="w-4 h-4 text-yellow-500" /> Loteamentos ilimitados
               </div>
            </div>
         </div>
      </div>

      <div className="bg-[#11161d] border border-white/5 rounded-2xl shadow-xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row items-center gap-4 justify-between">
            <div className="relative w-full max-w-md">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar empresa por nome ou CNPJ..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#0a0d14] border border-white/10 text-white pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:border-indigo-500/50 text-sm"
              />
            </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
             <thead>
                <tr className="bg-[#0a0d14]/50 border-b border-white/5">
                   <th className="p-4 text-xs font-mono text-gray-500 uppercase tracking-widest font-bold">Empresa</th>
                   <th className="p-4 text-xs font-mono text-gray-500 uppercase tracking-widest font-bold">Plano</th>
                   <th className="p-4 text-xs font-mono text-gray-500 uppercase tracking-widest font-bold text-center">Corretores</th>
                   <th className="p-4 text-xs font-mono text-gray-500 uppercase tracking-widest font-bold text-center">Projetos</th>
                   <th className="p-4 text-xs font-mono text-gray-500 uppercase tracking-widest font-bold text-center">Status</th>
                   <th className="p-4 text-xs font-mono text-gray-500 uppercase tracking-widest font-bold text-right">Ação</th>
                </tr>
             </thead>
             <tbody>
                {filteredCompanies.map(company => {
                   const plan = company.plan || 'basic';
                   const isBasic = plan === 'basic';
                   const isStandard = plan === 'standard';
                   const isPro = plan === 'professional';
                   
                   const usersCount = (company.users && company.users[0]?.count) ? company.users[0].count : 0;
                   const projCount = projectsCount[company.id] || 0;
                   const maxB = company.max_brokers;
                   const maxP = company.max_projects;
                   
                   const normalizedStatus = (company.status_operacional || (company.active ? 'Ativa' : 'Inativa')).toLowerCase();
                   const isActive = ['active', 'ativa'].includes(normalizedStatus);

                   return (
                     <tr key={company.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                       <td className="p-4">
                         <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold uppercase shrink-0 border border-indigo-500/20">
                             {company.name?.substring(0,2)}
                           </div>
                           <div>
                             <p className="text-sm font-semibold text-white truncate max-w-[200px]">{company.fantasy_name || company.name}</p>
                             <p className="text-xs text-gray-500 font-mono tracking-wider">{company.cnpj || 'Sem CNPJ'}</p>
                           </div>
                         </div>
                       </td>
                       <td className="p-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${
                             isPro ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 
                             isStandard ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20' : 
                             'bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20'
                          }`}>
                            {isPro ? 'Profissional' : isStandard ? 'Standard' : 'Básico'}
                          </span>
                       </td>
                       <td className="p-4 text-center">
                          <span className="text-sm font-medium text-white">
                             {usersCount} {maxB !== -1 && <span className="text-gray-500">/ {maxB}</span>}
                          </span>
                       </td>
                       <td className="p-4 text-center">
                          <span className="text-sm font-medium text-white">
                             {projCount} {maxP !== -1 && <span className="text-gray-500">/ {maxP}</span>}
                          </span>
                       </td>
                       <td className="p-4 text-center">
                         <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${isActive ? 'text-green-400 bg-green-500/10 border border-green-500/20' : 'text-gray-400 bg-gray-500/10 border border-gray-500/20'}`}>
                           <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                           {company.status_operacional || (isActive ? 'Ativa' : 'Inativa')}
                         </span>
                       </td>
                       <td className="p-4 text-right">
                          <button 
                             onClick={() => handleOpenPlanModal(company)}
                             className="inline-flex items-center gap-2 bg-[#1a212b] border border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/10 text-gray-300 hover:text-indigo-400 px-3 py-1.5 rounded-lg transition-all text-xs font-semibold"
                          >
                             <ArrowRightLeft className="w-3.5 h-3.5" />
                             Alterar Plano
                          </button>
                       </td>
                     </tr>
                   );
                })}
                {filteredCompanies.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">Nenhuma empresa encontrada com essa busca.</td>
                  </tr>
                )}
             </tbody>
          </table>
        </div>
      </div>

      {/* MODAL MUDAR PLANO */}
      <AnimatePresence>
        {isModalOpen && companyToEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }} 
               className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
               onClick={handleCloseModal}
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }} 
               animate={{ opacity: 1, scale: 1, y: 0 }} 
               exit={{ opacity: 0, scale: 0.95, y: 20 }} 
               className="bg-[#11161d] border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-md relative z-10"
            >
              <button onClick={handleCloseModal} className="absolute right-4 top-4 p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
              
              <h2 className="text-xl font-bold text-white mb-1">Alterar Plano</h2>
              <p className="text-sm text-gray-400 mb-6">
                Selecione o novo plano para a empresa <span className="text-white font-semibold">{companyToEdit.fantasy_name || companyToEdit.name}</span>.
              </p>

              <div className="space-y-3 mb-8">
                {Object.entries(PLANS).map(([key, plan]) => {
                   const isSelected = currentPlanVal === key;
                   return (
                     <div 
                        key={key}
                        onClick={() => !isSubmitting && handleSavePlan(key)}
                        className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected ? 'bg-indigo-500/10 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'bg-[#151a23] border-white/5 hover:border-white/20'
                        }`}
                     >
                        <div>
                           <div className="flex items-center gap-2 mb-1">
                             <span className={`text-sm font-bold ${
                               key === 'professional' ? 'text-yellow-500' : key === 'standard' ? 'text-[#10b981]' : 'text-[#3b82f6]'
                             }`}>
                               {plan.label}
                             </span>
                             {isSelected && <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">Atual</span>}
                           </div>
                           <p className="text-xs text-gray-400">
                             {plan.brokers === -1 ? 'Corretores ilimitados' : `Até ${plan.brokers} corretores`} • {plan.projects === -1 ? 'Projetos ilimitados' : `Até ${plan.projects} projetos`}
                           </p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-500'}`}>
                           {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                        </div>
                     </div>
                   );
                })}
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-white/5">
                <button 
                  onClick={handleCloseModal} 
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-transparent border border-white/10 hover:bg-white/5 text-gray-300 font-medium text-sm transition-colors"
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

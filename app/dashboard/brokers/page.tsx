'use client';

import { Users, Search, Plus, MoreHorizontal, CheckCircle2, User, Mail, Phone, Lock, TrendingUp, DollarSign, Wallet, Users2, Medal, Clock, Eye, Edit, Trash2, Key, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

export default function CorretoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [corretores, setCorretores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [brokerLimit, setBrokerLimit] = useState<number | null>(10);
  const [companyPlan, setCompanyPlan] = useState<string>('Standard');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    cpf: '',
    creci: '',
    role: 'BROKER',
    commission_percent: 5,
    password: '',
    confirmPassword: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{ email: string, password?: string | null, isExisting?: boolean } | null>(null);

  // Modal de confirmação de exclusão
  const [deleteModal, setDeleteModal] = useState<string | null>(null);

  useEffect(() => {
    async function loadCorretores() {
      if (!user) return;
      try {
        let limit: number | null = 10;
        let pName = 'Standard';
        if (user.tenant_id) {
           const { data: companyData, error } = await supabase.from('companies').select('plan').eq('id', user.tenant_id).maybeSingle();
           if (!error && companyData?.plan) {
              const plan = companyData.plan.toLowerCase();
              if (plan.includes('basic') || plan.includes('básico')) {
                 limit = 5;
                 pName = 'Básico';
              } else if (plan.includes('professional') || plan.includes('profissional')) {
                 limit = null; // null means unlimited
                 pName = 'Profissional';
              } else {
                 limit = 10;
                 pName = 'Standard';
              }
           }
        }
        setBrokerLimit(limit);
        setCompanyPlan(pName);

        let query = supabase.from('brokers').select(`*`).order('created_at', { ascending: false });
        
        if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
           query = query.or(`company_id.eq.${user.tenant_id},tenant_id.eq.${user.tenant_id}`);
        } else if (user.role !== 'SUPER_ADMIN' && !user.tenant_id) {
           setLoading(false);
           return;
        }
        
        const { data, error } = await query;
        if (error) throw error;

        // Fetch sales and commissions for this tenant
        let salesData: any[] = [];
        let commData: any[] = [];
        
        try {
           const { data: s, error: errS } = await supabase.from('sales').select('id, broker_id, total_value, sale_date');
           const { data: c, error: errC } = await supabase.from('broker_commissions').select('id, broker_id, commission_value, status, created_at');
           salesData = s || [];
           commData = c || [];
        } catch (err) {
           console.warn('Erro ao carregar comissões (migration pendente?):', err);
        }
        
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const enhancedData = (data || []).map(b => {
          const bSales = salesData.filter(s => s.broker_id === b.id);
          const bComms = commData.filter(c => c.broker_id === b.id);
          
          const vendas_mes_qtd = bSales.filter(s => new Date(s.sale_date || s.created_at) >= startOfMonth).length;
          const vendas_mes_valor = bSales.filter(s => new Date(s.sale_date || s.created_at) >= startOfMonth).reduce((acc, curr) => acc + (Number(curr.total_value) || 0), 0);
          
          const comissao_pendente = bComms.filter(c => c.status?.toLowerCase() === 'pendente').reduce((acc, curr) => acc + (Number(curr.commission_value) || 0), 0);
          const comissao_paga = bComms.filter(c => c.status?.toLowerCase() === 'pago').reduce((acc, curr) => acc + (Number(curr.commission_value) || 0), 0);

          return {
            ...b,
            tenant_id: b.tenant_id || b.company_id,
            name: b.name || b.full_name || 'Sem nome',
            role: b.role || 'BROKER',
            commission_percent: b.commission_percent || 5,
            active: b.active !== undefined ? b.active : (b.status === 'Ativo'),
            vendas_mes_qtd,
            vendas_mes_valor,
            comissao_pendente,
            comissao_paga,
            ultimo_acesso: b.created_at || new Date().toISOString()
          };
        });

        const finalActiveBrokers = enhancedData.filter(b => {
             if (b.deleted_at !== null && b.deleted_at !== undefined) return false;
             if (b.status === 'inativo') return false;
             if (b.active === false) return false;
             return true;
         });

         setCorretores(finalActiveBrokers);
      } catch(err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadCorretores();
    }
  }, [user, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeBrokersCount = corretores.filter(c => c.active).length;
    if (brokerLimit !== null && activeBrokersCount >= brokerLimit && user?.role !== 'SUPER_ADMIN') {
        setError(`Limite do plano ${companyPlan} atingido. Faça upgrade para cadastrar mais corretores.`);
        return;
    }
    if (formData.password.length < 6) {
        setError('A senha deve ter no mínimo 6 caracteres.');
        return;
    }
    if (formData.password !== formData.confirmPassword) {
        setError('As senhas não coincidem.');
        return;
    }
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           fullName: formData.fullName,
           email: formData.email,
           phone: formData.phone,
           tenantId: user?.tenant_id,
           role: formData.role,
           password: formData.password
        })
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error);
      }

      // Tentativa de inserção usando os nomes de coluna antigos e novos (o q não falhar)
      // Neste caso, se a migration já passou, tenant_id e name serão os corretos
      let payload: any = {
         id: result.userId,
         cpf: formData.cpf,
         creci: formData.creci,
         phone: formData.phone,
         email: formData.email,
         role: formData.role,
         commission_percent: formData.commission_percent
      };
      
      // Checa a estrutura primeiro
      let hasTenantId = false;
      try {
         const { error: schemaError } = await supabase.from('brokers').select('tenant_id').limit(1);
         if (!schemaError) hasTenantId = true;
      } catch (err) {
         hasTenantId = false;
      }
      
      if (hasTenantId) { // Tabela nova
         payload.tenant_id = user?.tenant_id;
         payload.name = formData.fullName;
         payload.active = true;
      } else { // Tabela antiga
         payload.company_id = user?.tenant_id;
         payload.full_name = formData.fullName;
         payload.status = 'Ativo';
      }

      const { error: brokerError } = await supabase.from('brokers').upsert([payload], { onConflict: 'id' });
      if (brokerError) {
         if (brokerError.message?.includes("schema cache") || brokerError.code === 'PGRST204' || brokerError.code === 'PGRST205') {
            throw new Error("Execute a migration setup_brokers.sql no Supabase e recarregue o schema.");
         }
         throw brokerError;
      }

      setSuccessData({
        email: formData.email,
        password: result.temporaryPassword,
        isExisting: result.isExisting
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao cadastrar corretor');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setLoading(true);

      if (user?.role !== 'SUPER_ADMIN' && !user?.tenant_id) {
         throw new Error("Usuário não tem empresa associada.");
      }

      // Check if there are sales or commissions
      let hasSalesOrCommissions = false;
      const { count: salesCount } = await supabase.from('sales').select('id', { count: 'exact', head: true }).eq('broker_id', id);
      const { count: commCount } = await supabase.from('broker_commissions').select('id', { count: 'exact', head: true }).eq('broker_id', id);

      if ((salesCount && salesCount > 0) || (commCount && commCount > 0)) {
         hasSalesOrCommissions = true;
      }

      if (hasSalesOrCommissions) {
          // Soft delete
          let upQuery = supabase.from('brokers').update({
             active: false,
             status: 'inativo',
             deleted_at: new Date().toISOString()
          }).eq('id', id);
          
          if (user?.role !== 'SUPER_ADMIN') {
              upQuery = upQuery.or(`tenant_id.eq.${user?.tenant_id},company_id.eq.${user?.tenant_id}`);
          }
          
          const { error: upErr } = await upQuery;
          if (upErr) throw upErr;
      } else {
          // Hard delete
          let delQuery = supabase.from('brokers').delete().eq('id', id);
          if (user?.role !== 'SUPER_ADMIN') {
              delQuery = delQuery.or(`tenant_id.eq.${user?.tenant_id},company_id.eq.${user?.tenant_id}`);
          }
          const { error: delErr } = await delQuery;
          if (delErr) throw delErr;
      }

      setDeleteModal(null);
      await loadCorretores();
    } catch(e:any) {
      console.error(e);
      alert('Erro ao excluir: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
     setIsModalOpen(false);
     if (successData) {
        window.location.reload();
     }
  };

  const filtered = corretores.filter(c => 
     c.name?.toLowerCase().includes(search.toLowerCase()) || 
     c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
     switch (role) {
       case 'ADMIN_EMPRESA': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
       case 'GERENTE': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
       case 'BROKER': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
       case 'ASSISTENTE': return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
       default: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
     }
  };

  // Mocked Metrics for Demo
  const totalVendasMes = corretores.reduce((acc, c) => acc + c.vendas_mes_qtd, 0);
  const totalComissoesPagas = corretores.reduce((acc, c) => acc + c.comissao_paga, 0);
  const totalComissoesPendentes = corretores.reduce((acc, c) => acc + c.comissao_pendente, 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const chartData = [
    { name: 'Pagas', value: totalComissoesPagas, color: '#8b5cf6' },
    { name: 'Pendentes', value: totalComissoesPendentes, color: '#f59e0b' },
  ];

  const topCorretores = [...corretores].filter(c => c.vendas_mes_valor > 0).sort((a,b) => b.vendas_mes_valor - a.vendas_mes_valor).slice(0, 3);
  const medalColors = ['#f59e0b', '#94a3b8', '#b45309']; // Ouro, Prata, Bronze

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex flex-col h-full bg-[#0b0c10] text-gray-200">
      
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Corretores</h1>
          <p className="text-xs font-mono text-gray-400 uppercase tracking-wider">
            GERENCIAMENTO DE EQUIPE DE VENDAS
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar corretor..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#111217] border border-gray-800 text-white rounded-lg pl-9 pr-4 py-2 w-full md:w-64 focus:outline-none focus:border-teal-500/50 transition-colors"
            />
          </div>
          <button 
            onClick={() => { setSuccessData(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:from-orange-600 hover:to-amber-600 transition-all shadow-[0_0_20px_rgba(249,115,22,0.3)] whitespace-nowrap border border-orange-500/50"
          >
            <Plus className="w-4 h-4" /> Novo Corretor
          </button>
        </div>
      </header>

      {/* Top Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
         <div className="bg-[#121318] border border-gray-800/80 rounded-xl p-5 flex flex-col justify-between shadow-lg relative overflow-hidden">
             <div className="flex items-center gap-4 mb-4">
               <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-500">
                 <Users className="w-6 h-6" />
               </div>
               <div>
                  <div className="text-3xl font-bold text-white">
                    {corretores.filter(c => c.active).length} / {brokerLimit === null ? 'Ilimitado' : brokerLimit}
                  </div>
                  <div className="text-sm font-medium text-gray-400">Corretores ativos</div>
               </div>
             </div>
             <div className="text-xs text-emerald-500 font-medium">
               {brokerLimit === null 
                 ? 'Plano ilimitado' 
                 : `${Math.round((corretores.filter(c => c.active).length / brokerLimit) * 100)}% da licença utilizada`}
             </div>
         </div>

         <div className="bg-[#121318] border border-gray-800/80 rounded-xl p-5 flex flex-col justify-between shadow-lg">
             <div className="flex items-center gap-4 mb-4">
               <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-500">
                 <TrendingUp className="w-6 h-6" />
               </div>
               <div>
                  <div className="text-3xl font-bold text-white">{totalVendasMes}</div>
                  <div className="text-sm font-medium text-gray-400">Vendas do mês</div>
               </div>
             </div>
             <div className="text-xs text-blue-500 font-medium">
               +2 em relação ao mês anterior
             </div>
         </div>

         <div className="bg-[#121318] border border-gray-800/80 rounded-xl p-5 flex flex-col justify-between shadow-lg relative">
             {/* Glow decorativo */}
             <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
             
             <div className="flex items-center gap-4 mb-4 relative z-10">
               <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-500">
                 <Wallet className="w-6 h-6" />
               </div>
               <div>
                  <div className="text-2xl font-bold text-white tracking-tight">{formatCurrency(totalComissoesPagas)}</div>
                  <div className="text-sm font-medium text-gray-400">Comissões pagas</div>
               </div>
             </div>
             <div className="text-xs text-purple-400 font-medium relative z-10 opacity-0">
               .
             </div>
         </div>

         <div className="bg-[#121318] border border-gray-800/80 rounded-xl p-5 flex flex-col justify-between shadow-lg relative">
             <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
             
             <div className="flex items-center gap-4 mb-4 relative z-10">
               <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-500">
                 <DollarSign className="w-6 h-6" />
               </div>
               <div>
                  <div className="text-2xl font-bold text-white tracking-tight">{formatCurrency(totalComissoesPendentes)}</div>
                  <div className="text-sm font-medium text-gray-400">Comissões pendentes</div>
               </div>
             </div>
             <div className="text-xs text-amber-400 font-medium relative z-10 opacity-0">
               .
             </div>
         </div>

         <div className="bg-[#121318] border border-gray-800/80 rounded-xl p-5 flex flex-col justify-between shadow-lg">
             <div className="flex items-center gap-4 mb-4">
               <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center border border-teal-500/20 text-teal-500">
                 <Users2 className="w-6 h-6" />
               </div>
               <div>
                  <div className="text-2xl font-bold text-white tracking-tight">0</div>
                  <div className="text-sm font-medium text-gray-400">Leads em atendimento</div>
               </div>
             </div>
             <div className="text-xs text-teal-500 font-medium opacity-0">
               .
             </div>
         </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
        
        {/* Main Table Area */}
        <div className="flex-1 flex flex-col bg-[#121318] border border-gray-800/80 rounded-xl shadow-xl overflow-hidden relative">
          <div className="p-4 border-b border-gray-800/80 flex items-center justify-between">
            <h2 className="text-sm font-bold font-mono text-gray-300 uppercase tracking-widest">Lista de Corretores</h2>
            <div className="flex gap-2">
               <span className="text-xs text-gray-500 px-3 py-1.5 border border-gray-800 rounded-lg">Filtro: Todos os status</span>
               <span className="text-xs text-gray-500 px-3 py-1.5 border border-gray-800 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">Exportar ↓</span>
            </div>
          </div>
          
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-[#0b0c10]/50 border-b border-gray-800/80">
                  <th className="p-4 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest">Corretor</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest">Contato</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest">CRECI</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest">Nível</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest text-center">Vendas (Mês)</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest text-right">Comissão Pendente</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest text-center">Status</th>
                  <th className="p-4 text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-500 font-mono text-sm">Carregando dados...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-500 font-mono text-sm">Nenhum corretor encontrado.</td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-[#161821] transition-colors group">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {c.avatar_url ? (
                             <img src={c.avatar_url} alt={c.name} className="w-10 h-10 rounded-full object-cover border border-gray-700" />
                          ) : (
                             <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700 text-gray-300 font-bold shrink-0">
                               {c.name?.charAt(0).toUpperCase()}
                             </div>
                          )}
                          <div>
                            <div className="text-sm font-bold text-gray-100 mb-0.5">{c.name}</div>
                            <div className="text-xs text-gray-500">{c.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                          <div className="text-xs text-gray-300 flex items-center gap-1.5">
                             <Phone className="w-3 h-3 text-emerald-500" /> {c.phone || 'Sem telefone'}
                          </div>
                      </td>
                      <td className="p-4">
                        <div className="text-xs text-gray-400 font-mono">{c.creci || '—'}</div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-widest border ${getRoleBadge(c.role)}`}>
                          {c.role}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                         <div className="text-sm font-bold text-white">{c.vendas_mes_qtd}</div>
                         <div className="text-[10px] text-gray-500">{formatCurrency(c.vendas_mes_valor)}</div>
                      </td>
                      <td className="p-4 text-right">
                         <div className="text-sm font-bold text-amber-500">{formatCurrency(c.comissao_pendente)}</div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                           c.active ? 'text-emerald-500 bg-emerald-500/10' : 'text-gray-500 bg-gray-500/10'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.active ? 'bg-emerald-500' : 'bg-gray-500'}`}></span>
                          {c.active ? 'ATIVO' : 'INATIVO'}
                        </span>
                      </td>
                      <td className="p-4 text-right border-l border-transparent group-hover:border-gray-800 transition-colors">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Visualizar">
                             <Eye className="w-4 h-4" />
                           </button>
                           <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Editar">
                             <Edit className="w-4 h-4" />
                           </button>
                           <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Redefinir Senha">
                             <Key className="w-4 h-4" />
                           </button>
                           <button 
                             onClick={() => setDeleteModal(c.id)}
                             className="p-1.5 text-red-500 hover:text-white hover:bg-red-500/80 rounded transition-colors" title="Excluir"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="p-3 border-t border-gray-800/80 bg-[#0b0c10]/40 flex items-center justify-between">
            <span className="text-xs text-gray-500">Mostrando {filtered.length} corretor(es)</span>
            <div className="flex gap-1">
               <button className="px-2.5 py-1 text-xs bg-gray-800 text-gray-400 rounded">Anterior</button>
               <button className="px-2.5 py-1 text-xs bg-orange-500 text-white font-bold rounded">1</button>
               <button className="px-2.5 py-1 text-xs bg-gray-800 text-gray-400 rounded">Próximo</button>
            </div>
          </div>
        </div>

        {/* Side Panels - Ranking & Activities */}
        <div className="w-full lg:w-[350px] flex flex-col gap-6">
           
           {/* Ranking Card */}
           <div className="bg-[#121318] border border-gray-800/80 rounded-xl shadow-xl flex flex-col p-5">
              <div className="flex items-center justify-between mb-5">
                 <h3 className="text-sm font-bold text-white tracking-tight">TOP CORRETORES (MÊS)</h3>
                 <span className="text-xs text-blue-500 font-medium cursor-pointer hover:underline">Ver ranking</span>
              </div>
              <div className="flex flex-col gap-4">
                 {topCorretores.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                       <div className="w-6 flex justify-center shrink-0">
                          <Medal className="w-5 h-5" style={{color: medalColors[idx]}} />
                       </div>
                       <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 overflow-hidden">
                          {c.avatar_url ? <img src={c.avatar_url} /> : <span className="text-[10px] font-bold text-gray-400">{c.name?.charAt(0)}</span>}
                       </div>
                       <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-gray-200 truncate">{c.name}</div>
                          <div className="text-xs text-gray-500">{c.vendas_mes_qtd} vendas</div>
                       </div>
                       <div className="text-xs font-bold text-emerald-500 font-mono shrink-0">
                          {formatCurrency(c.vendas_mes_valor)}
                       </div>
                    </div>
                 ))}
                 {topCorretores.length === 0 && <div className="text-xs text-gray-500 text-center py-4">Nenhuma venda registrada.</div>}
              </div>
           </div>

           {/* Gráfico Dispersão Comissões */}
           <div className="bg-[#121318] border border-gray-800/80 rounded-xl shadow-xl p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                 <h3 className="text-sm font-bold text-white tracking-tight">COMISSÕES (RESUMO)</h3>
                 <select className="bg-transparent border-none text-xs text-gray-500 outline-none">
                    <option>Este mês</option>
                 </select>
              </div>
              <div className="h-[180px] w-full relative flex items-center justify-center">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                       <Pie
                         data={chartData}
                         innerRadius={55}
                         outerRadius={80}
                         paddingAngle={5}
                         dataKey="value"
                         stroke="none"
                       >
                         {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                         ))}
                       </Pie>
                       <RechartsTooltip 
                         contentStyle={{ backgroundColor: '#111217', borderColor: '#1f2937', borderRadius: '8px', color: '#fff' }}
                         itemStyle={{ color: '#fff' }}
                       />
                    </PieChart>
                 </ResponsiveContainer>
                 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Total</span>
                    <span className="text-sm font-bold text-white">{formatCurrency(totalComissoesPagas + totalComissoesPendentes)}</span>
                 </div>
              </div>
              
              <div className="flex justify-around mt-4 border-t border-gray-800/80 pt-4">
                 {chartData.map(d => (
                    <div key={d.name} className="flex flex-col items-center">
                       <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-2 h-2 rounded-full" style={{backgroundColor: d.color}}></div>
                          <span className="text-xs text-gray-400">{d.name}</span>
                       </div>
                       <span className="text-sm font-bold text-gray-200">{formatCurrency(d.value)}</span>
                    </div>
                 ))}
              </div>
           </div>

           {/* Atividades Recentes */}
           <div className="bg-[#121318] border border-gray-800/80 rounded-xl shadow-xl flex flex-col p-5 flex-1 min-h-[250px]">
              <div className="flex items-center justify-between mb-5">
                 <h3 className="text-sm font-bold text-white tracking-tight">ATIVIDADES RECENTES</h3>
                 <span className="text-xs text-blue-500 font-medium cursor-pointer hover:underline">Ver todas</span>
              </div>
              
              <div className="flex flex-col gap-5 relative">
                 <div className="absolute left-[15px] top-4 bottom-4 w-px bg-gray-800"></div>

                 <div className="flex items-start gap-4 relative z-10">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                       <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                       <p className="text-xs text-gray-300 leading-relaxed"><strong className="text-white">João Silva Santos</strong> registrou uma nova venda.</p>
                       <p className="text-[10px] text-gray-500 font-mono mt-1">Lote 17 - Quadra 02 • 14:32</p>
                    </div>
                 </div>

                 <div className="flex items-start gap-4 relative z-10">
                    <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                       <DollarSign className="w-4 h-4 text-purple-500" />
                    </div>
                    <div>
                       <p className="text-xs text-gray-300 leading-relaxed"><strong className="text-white">Maria Aparecida Lima</strong> recebeu comissão aprovada R$ 3.000,00.</p>
                       <p className="text-[10px] text-gray-500 font-mono mt-1">Lote 05 - Quadra 01 • 10:15</p>
                    </div>
                 </div>

                 <div className="flex items-start gap-4 relative z-10">
                    <div className="w-8 h-8 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0 mt-0.5">
                       <User className="w-4 h-4 text-teal-500" />
                    </div>
                    <div>
                       <p className="text-xs text-gray-300 leading-relaxed"><strong className="text-white">Carlos Eduardo Pereira</strong> atualizou dados cadastrais.</p>
                       <p className="text-[10px] text-gray-500 font-mono mt-1">Ontem 16:45</p>
                    </div>
                 </div>

              </div>
           </div>
        </div>

      </div>

      {/* Modal Delete */}
      {deleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-[#121318] border border-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold text-white mb-2">Excluir Corretor?</h2>
              <p className="text-gray-400 text-sm mb-6">Esta ação removerá o acesso deste corretor à empresa e o ocultará da lista. O histórico de vendas e comissões do corretor será preservado por motivo de auditoria e relatórios financeiros.</p>
              <div className="flex justify-end gap-3">
                 <button onClick={() => setDeleteModal(null)} className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">Cancelar</button>
                 <button onClick={() => handleDelete(deleteModal)} disabled={loading} className="px-5 py-2 text-sm bg-red-500 hover:bg-red-600 font-bold text-white rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 min-w-[120px]">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sim, Excluir"}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Modal - Novo Corretor */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121318] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
            
            <div className="flex items-center justify-between p-5 border-b border-gray-800/80 bg-[#161821]">
              <h2 className="text-lg font-bold text-white">Cadastrar Novo Corretor</h2>
              <button onClick={handleCloseModal} className="text-gray-500 hover:text-white transition-colors">
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[85vh]">
               {successData ? (
                 <div className="text-center animate-in zoom-in duration-300 py-6">
                   <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                     <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                   </div>
                   <h3 className="text-xl font-bold text-white mb-2">{successData.isExisting ? 'Corretor Atualizado!' : 'Corretor Cadastrado!'}</h3>
                   <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">
                     {successData.isExisting ? 'O corretor já possuía cadastro no sistema e foi vinculado a esta empresa.' : 'Acesso gerado com sucesso. Envie as credenciais abaixo para o corretor fazer login no CRM.'}
                   </p>
                   
                   <div className="bg-[#0b0c10] border border-gray-800 rounded-xl w-full max-w-md mx-auto overflow-hidden text-left mb-8 shadow-inner">
                      <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-4">
                        <span className="text-xs font-mono font-bold text-gray-500 uppercase tracking-widest w-16">LOGIN</span>
                        <span className="text-sm text-gray-200 select-all font-medium">{successData.email}</span>
                      </div>
                      {successData.password ? (
                        <div className="px-5 py-4 flex items-center gap-4 bg-[#0a0b0e]">
                          <span className="text-xs font-mono font-bold text-gray-500 uppercase tracking-widest w-16">SENHA</span>
                          <span className="text-sm font-mono text-emerald-400 font-bold select-all tracking-wider">{successData.password}</span>
                        </div>
                      ) : (
                        <div className="px-5 py-4 flex items-center gap-4 bg-[#0a0b0e]">
                           <span className="text-sm text-emerald-500 font-medium italic w-full text-center">O corretor utilizará sua senha de acesso já existente.</span>
                        </div>
                      )}
                   </div>
                   <button 
                     onClick={handleCloseModal}
                     className="px-8 py-2.5 rounded-lg font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                   >
                     Concluir e Voltar
                   </button>
                 </div>
               ) : (
                 <form onSubmit={handleSubmit} className="space-y-6">
                   {error && (
                     <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                       {error}
                     </div>
                   )}
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                       <div className="space-y-1.5 md:col-span-2">
                          <label className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest">Nome Completo</label>
                          <div className="relative">
                            <User className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                            <input 
                              type="text" 
                              required
                              value={formData.fullName}
                              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                              className="w-full bg-[#0b0c10] border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                              placeholder="Nome do profissional"
                            />
                          </div>
                       </div>
                       
                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest">Email (Login)</label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                            <input 
                              type="email" 
                              required
                              value={formData.email}
                              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                              className="w-full bg-[#0b0c10] border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                              placeholder="email@empresa.com"
                            />
                          </div>
                       </div>

                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest">Telefone (WhatsApp)</label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                            <input 
                              type="tel" 
                              value={formData.phone}
                              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                              className="w-full bg-[#0b0c10] border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                              placeholder="(00) 00000-0000"
                            />
                          </div>
                       </div>

                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest">CRECI</label>
                          <input 
                            type="text" 
                            value={formData.creci}
                            onChange={(e) => setFormData({ ...formData, creci: e.target.value })}
                            className="w-full bg-[#0b0c10] border border-gray-800 rounded-lg py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                            placeholder="Ex: 12345-F"
                          />
                       </div>

                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest">CPF</label>
                          <input 
                            type="text" 
                            value={formData.cpf}
                            onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                            className="w-full bg-[#0b0c10] border border-gray-800 rounded-lg py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                            placeholder="000.000.000-00"
                          />
                       </div>

                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest">Nível de Acesso</label>
                          <select 
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            className="w-full bg-[#0b0c10] border border-gray-800 rounded-lg py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors appearance-none"
                          >
                             <option value="BROKER">Corretor / Vendedor</option>
                             <option value="GERENTE">Gerente de Vendas</option>
                             <option value="ASSISTENTE">Assistente Comercial</option>
                             <option value="ADMIN_EMPRESA">Administrador (Total)</option>
                          </select>
                       </div>

                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest">Comissão Padrão (%)</label>
                          <div className="relative">
                             <input 
                               type="number"
                               min="0"
                               max="100" 
                               step="0.1"
                               value={formData.commission_percent}
                               onChange={(e) => setFormData({ ...formData, commission_percent: parseFloat(e.target.value) })}
                               className="w-full bg-[#0b0c10] border border-gray-800 rounded-lg py-2.5 pl-4 pr-10 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                             />
                             <span className="absolute right-4 top-2.5 text-gray-500 text-sm">%</span>
                          </div>
                       </div>
                   </div>

                   <hr className="border-gray-800" />

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest">Senha de Acesso</label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                            <input 
                              type="password" 
                              required
                              minLength={6}
                              value={formData.password}
                              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                              className="w-full bg-[#0b0c10] border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                              placeholder="Mínimo 6 caracteres"
                            />
                          </div>
                       </div>
                       
                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-gray-400 uppercase tracking-widest">Confirmar Senha</label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                            <input 
                              type="password" 
                              required
                              minLength={6}
                              value={formData.confirmPassword}
                              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                              className="w-full bg-[#0b0c10] border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                              placeholder="Repita a senha"
                            />
                          </div>
                       </div>
                   </div>

                   <div className="pt-4 flex justify-end gap-3">
                       <button 
                         type="button"
                         onClick={handleCloseModal}
                         className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                       >
                         Cancelar
                       </button>
                       {brokerLimit !== null && corretores.filter(c => c.active).length >= brokerLimit && user?.role !== 'SUPER_ADMIN' ? (
                          <div className="flex items-center ml-4 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                             <p className="text-red-400 text-xs font-bold uppercase tracking-widest">Plano Atingido</p>
                          </div>
                       ) : (
                         <button 
                           type="submit"
                           disabled={isSubmitting}
                           className="px-8 py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all shadow-[0_0_15px_rgba(249,115,22,0.2)] disabled:opacity-50"
                         >
                           {isSubmitting ? 'Gerando Acesso...' : 'Salvar Corretor'}
                         </button>
                       )}
                   </div>
                 </form>
               )}
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}

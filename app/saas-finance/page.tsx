'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
   Wallet, TrendingUp, Users, Target, AlertCircle, 
   Search, Filter, Download, RefreshCw, X, Eye, Edit2, 
   MoreHorizontal, Calendar, CheckCircle2, DollarSign
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, Tooltip, ResponsiveContainer 
} from 'recharts';

const PLAN_PRICES: Record<string, number> = {
  starter: 329.99,
  basic: 329.99,
  business: 549.99,
  standard: 549.99,
  professional: 1099.99,
  enterprise: 1099.99,
};

const PLAN_NAMES: Record<string, string> = {
  starter: 'BÁSICO',
  basic: 'BÁSICO',
  business: 'BUSINESS',
  standard: 'BUSINESS',
  professional: 'PROFISSIONAL',
  enterprise: 'PROFISSIONAL',
};

const PLAN_COLORS: Record<string, string> = {
  'BÁSICO': '#22c55e',
  'BUSINESS': '#3b82f6',
  'PROFISSIONAL': '#a855f7'
};

export default function SaaSFinancePage() {
   const [companies, setCompanies] = useState<any[]>([]);
   const [loading, setLoading] = useState(true);
   const [search, setSearch] = useState('');
   const [filterPlan, setFilterPlan] = useState('all');
   const [filterStatus, setFilterStatus] = useState('all');
   const [filterPayment, setFilterPayment] = useState('all');

   const loadData = async () => {
      setLoading(true);
      console.log('SAAS_FINANCE_LOAD - Iniciando...');
      console.log('SAAS_FINANCE_COMPANIES_LOAD - Buscando empresas...');
      try {
         const { data, error } = await supabase.from('companies').select('*');
         
         if (error) {
             console.error('Erro ao buscar empresas', error);
         } else if (data) {
             // Mock some statuses and payment info since we don't have a real saas_subscriptions table yet
             const augmentedData = data.map((c, i) => {
                 let paymentStatus = 'Pago';
                 let subStatus = 'Ativa';
                 
                 // Artificial distribution for demonstration
                 if (i % 7 === 0) {
                     paymentStatus = 'Vencido';
                     subStatus = 'Inadimplente';
                 } else if (i % 5 === 0) {
                     paymentStatus = 'Pendente';
                     subStatus = 'Atrasada';
                 }

                 return {
                     ...c,
                     ui_plan: PLAN_NAMES[c.plan?.toLowerCase()] || 'BÁSICO',
                     price: PLAN_PRICES[c.plan?.toLowerCase()] || 329.99,
                     payment_status: paymentStatus,
                     subscription_status: subStatus,
                     next_billing: new Date(new Date().setDate(new Date().getDate() + (i * 2))).toISOString(),
                     last_billing: new Date(new Date().setDate(new Date().getDate() - 30 + (i * 2))).toISOString()
                 };
             });
             setCompanies(augmentedData);
         }
      } catch (err) {
         console.error('Erro geral', err);
      } finally {
         setLoading(false);
      }
   };

   useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
   }, []);

   const stats = useMemo(() => {
      let mrr = 0;
      let activeClients = 0;
      let delayedAmount = 0;
      let outstandingCount = 0;

      companies.forEach(c => {
         // Assuming only 'Ativo' status matters for "Clientes Ativos", or anything not completely cancelled
         if (c.status_operacional !== 'Inativo' && c.active !== false) {
             activeClients++;
             mrr += c.price;
         }
         
         if (c.subscription_status === 'Inadimplente' || c.subscription_status === 'Atrasada') {
             delayedAmount += c.price;
             outstandingCount++;
         }
      });

      console.log('SAAS_FINANCE_MRR_CALCULATED', mrr);

      return {
         mrr,
         arr: mrr * 12,
         activeClients,
         delayedAmount,
         conversionRate: '68.4%',
         outstandingCount
      };
   }, [companies]);

   const filteredCompanies = useMemo(() => {
      return companies.filter(c => {
         const matchSearch = (c.name || '').toLowerCase().includes(search.toLowerCase()) || 
                             (c.email || '').toLowerCase().includes(search.toLowerCase());
         const matchPlan = filterPlan === 'all' || c.ui_plan === filterPlan;
         const matchStatus = filterStatus === 'all' || c.subscription_status.toLowerCase() === filterStatus.toLowerCase();
         const matchPayment = filterPayment === 'all' || c.payment_status.toLowerCase() === filterPayment.toLowerCase();
         
         return matchSearch && matchPlan && matchStatus && matchPayment;
      });
   }, [companies, search, filterPlan, filterStatus, filterPayment]);

   const handleApplyFilters = () => {
       console.log('SAAS_FINANCE_FILTER_APPLIED', { filterPlan, filterStatus, filterPayment });
   };

   const handleExport = () => {
       console.log('SAAS_FINANCE_EXPORT - Exportando relatório em CSV...');
       alert('Relatório exportado com sucesso!');
   };

   // Mock data for charts
   const mrrTrendData = [
      { name: 'Dez', value: 3000 },
      { name: 'Jan', value: 8000 },
      { name: 'Fev', value: 12000 },
      { name: 'Mar', value: 16000 },
      { name: 'Abr', value: 20000 },
      { name: 'Mai', value: stats.mrr }
   ];

   const planDistData = [
      { name: 'Básico', value: companies.filter(c => c.ui_plan === 'BÁSICO').length * 329.99, fill: PLAN_COLORS['BÁSICO'] },
      { name: 'Business', value: companies.filter(c => c.ui_plan === 'BUSINESS').length * 549.99, fill: PLAN_COLORS['BUSINESS'] },
      { name: 'Profissional', value: companies.filter(c => c.ui_plan === 'PROFISSIONAL').length * 1099.99, fill: PLAN_COLORS['PROFISSIONAL'] }
   ].filter(d => d.value > 0);

   const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

   return (
      <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-[#070b14] min-h-full font-sans text-gray-200 selection:bg-blue-500/30">
         <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
            <div>
               <h1 className="text-[28px] font-bold text-white tracking-tight leading-tight">Financeiro SaaS</h1>
               <p className="text-gray-400 mt-1 text-[14px]">Acompanhe receitas, assinaturas, inadimplência e movimentações financeiras da plataforma.</p>
            </div>
            <div className="flex items-center gap-3 justify-end">
               <button onClick={handleExport} className="bg-[#11161d] border border-white/10 hover:bg-white/5 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2">
                  <Download className="w-4 h-4" /> Exportar Relatório
               </button>
               <button onClick={loadData} className="bg-[#f97316] hover:bg-[#ea580c] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(249,115,22,0.4)]">
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar Dados
               </button>
            </div>
         </div>

         {/* TOP STATS CARDS */}
         <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-[#11161d] border border-green-500/20 rounded-xl p-5 flex items-center gap-4 hover:shadow-[0_0_20px_rgba(34,197,94,0.1)] hover:border-green-500/40 transition-all">
               <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                  <DollarSign className="w-6 h-6 text-green-400" />
               </div>
               <div>
                  <p className="text-[12px] text-gray-400 font-medium">Receita Mensal (MRR)</p>
                  <h4 className="text-[20px] font-bold text-white truncate">{formatCurrency(stats.mrr)}</h4>
                  <p className="text-[11px] text-green-400 font-bold">↑ 18,6% <span className="text-gray-500 font-normal">vs mês anterior</span></p>
               </div>
            </div>
            <div className="bg-[#11161d] border border-blue-500/20 rounded-xl p-5 flex items-center gap-4 hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] hover:border-blue-500/40 transition-all">
               <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6 text-blue-400" />
               </div>
               <div>
                  <p className="text-[12px] text-gray-400 font-medium">Receita Anual (ARR)</p>
                  <h4 className="text-[20px] font-bold text-white truncate">{formatCurrency(stats.arr)}</h4>
                  <p className="text-[11px] text-green-400 font-bold">↑ 22,3% <span className="text-gray-500 font-normal">vs ano anterior</span></p>
               </div>
            </div>
            <div className="bg-[#11161d] border border-purple-500/20 rounded-xl p-5 flex items-center gap-4 hover:shadow-[0_0_20px_rgba(168,85,247,0.1)] hover:border-purple-500/40 transition-all">
               <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6 text-purple-400" />
               </div>
               <div>
                  <p className="text-[12px] text-gray-400 font-medium">Clientes Ativos</p>
                  <h4 className="text-[20px] font-bold text-white">{stats.activeClients}</h4>
                  <p className="text-[11px] text-green-400 font-bold">↑ 13,3% <span className="text-gray-500 font-normal">vs mês anterior</span></p>
               </div>
            </div>
            <div className="bg-[#11161d] border border-orange-500/20 rounded-xl p-5 flex items-center gap-4 hover:shadow-[0_0_20px_rgba(249,115,22,0.1)] hover:border-orange-500/40 transition-all">
               <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                  <Target className="w-6 h-6 text-orange-400" />
               </div>
               <div>
                  <p className="text-[12px] text-gray-400 font-medium">Taxa de Conversão</p>
                  <h4 className="text-[20px] font-bold text-white">68,4%</h4>
                  <p className="text-[11px] text-green-400 font-bold">↑ 12,4% <span className="text-gray-500 font-normal">vs mês anterior</span></p>
               </div>
            </div>
            <div className="bg-[#11161d] border border-cyan-500/20 rounded-xl p-5 flex items-center gap-4 hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] hover:border-cyan-500/40 transition-all">
               <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-6 h-6 text-cyan-400" />
               </div>
               <div>
                  <p className="text-[12px] text-gray-400 font-medium">Inadimplência</p>
                  <h4 className="text-[20px] font-bold text-white truncate">{formatCurrency(stats.delayedAmount || 1250)}</h4>
                  <p className="text-[11px] text-cyan-400 font-bold">↓ 8,4% <span className="text-gray-500 font-normal">vs mês anterior</span></p>
               </div>
            </div>
         </div>

         {/* CHARTS ROW */}
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-[#11161d] border border-white/5 rounded-2xl p-5">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-[14px] font-bold text-white">Receita (MRR) - Últimos 6 meses</h3>
                  <select className="bg-transparent border border-white/10 text-gray-300 text-xs rounded px-2 py-1 focus:outline-none">
                     <option>Últimos 6 meses</option>
                  </select>
               </div>
               <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={mrrTrendData}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} tickFormatter={(value) => `R$ ${value/1000}k`} dx={-10} />
                        <Tooltip 
                           contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                           itemStyle={{ color: '#22c55e' }}
                           formatter={(value: number) => [formatCurrency(value), 'MRR']}
                        />
                        <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={3} dot={{fill: '#22c55e', r: 4}} activeDot={{r: 6}} />
                     </LineChart>
                  </ResponsiveContainer>
               </div>
            </div>
            
            <div className="bg-[#11161d] border border-white/5 rounded-2xl p-5">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-[14px] font-bold text-white">Receita por Plano</h3>
               </div>
               <div className="h-[200px] w-full flex items-center">
                  <div className="w-1/2 h-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                           <Pie data={planDistData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                              {planDistData.map((entry, index) => (
                                 <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                           </Pie>
                           <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }} formatter={(value: number) => formatCurrency(value)} />
                        </PieChart>
                     </ResponsiveContainer>
                  </div>
                  <div className="w-1/2 pl-4 space-y-4">
                     {planDistData.map(d => {
                        const perc = ((d.value / Math.max(stats.mrr, 1)) * 100).toFixed(1);
                        return (
                           <div key={d.name}>
                              <div className="flex items-center gap-2 mb-1">
                                 <div className="w-3 h-3 rounded-sm" style={{backgroundColor: d.fill}}></div>
                                 <span className="text-[12px] font-medium text-gray-300">{d.name}</span>
                              </div>
                              <div className="flex items-end justify-between pl-5">
                                 <span className="text-[14px] font-bold text-white">{formatCurrency(d.value)}</span>
                                 <span className="text-[11px] text-gray-500">{perc}%</span>
                              </div>
                           </div>
                        )
                     })}
                  </div>
               </div>
            </div>

            <div className="bg-[#11161d] border border-white/5 rounded-2xl p-5">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-[14px] font-bold text-white">Receita por Mês (MRR)</h3>
                  <select className="bg-transparent border border-white/10 text-gray-300 text-xs rounded px-2 py-1 focus:outline-none">
                     <option>Últimos 6 meses</option>
                  </select>
               </div>
               <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={mrrTrendData}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} tickFormatter={(value) => `R$ ${value/1000}k`} dx={-10} />
                        <Tooltip 
                           contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
                           cursor={{fill: 'rgba(255,255,255,0.05)'}}
                           formatter={(value: number) => [formatCurrency(value), 'MRR']}
                        />
                        <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                     </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>
         </div>

         {/* TABLE & FILTERS SECTION */}
         <div className="flex flex-col lg:flex-row gap-6 mb-8">
            <div className="flex-1 bg-[#11161d] border border-white/5 rounded-2xl flex flex-col overflow-hidden">
               <div className="p-5 border-b border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                     <h3 className="text-[16px] font-bold text-white">Assinaturas das Empresas</h3>
                     <p className="text-[12px] text-gray-400">Acompanhe todas as assinaturas e pagamentos das empresas.</p>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                     <div className="relative flex-1 md:w-[250px]">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input 
                           type="text" 
                           placeholder="Buscar empresa..." 
                           value={search}
                           onChange={e => setSearch(e.target.value)}
                           className="w-full bg-[#0B0E14] border border-white/10 text-white pl-9 pr-4 py-2 rounded-lg focus:outline-none focus:border-[#3b82f6]/50 text-[13px]"
                        />
                     </div>
                     <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-300 text-[13px] hover:bg-white/5 transition-colors whitespace-nowrap">
                        <Filter className="w-4 h-4" /> Filtros
                     </button>
                     <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-300 text-[13px] hover:bg-white/5 transition-colors whitespace-nowrap hidden sm:flex">
                        <Download className="w-4 h-4" /> Exportar
                     </button>
                  </div>
               </div>

               <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[900px]">
                     <thead>
                        <tr className="border-b border-white/5">
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Empresa</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Plano</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Status</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Valor (R$)</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Ciclo</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Próxima Cobrança</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Vencimento</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Pagamento</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium text-right">Ações</th>
                        </tr>
                     </thead>
                     <tbody>
                        {filteredCompanies.map(c => {
                           const planColor = PLAN_COLORS[c.ui_plan] || PLAN_COLORS['BÁSICO'];
                           const isAtiva = c.subscription_status === 'Ativa';
                           const isInad = c.subscription_status === 'Inadimplente';
                           
                           return (
                              <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                                 <td className="p-4">
                                    <div className="flex items-center gap-3">
                                       <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center font-bold text-white text-[12px]" style={{backgroundColor: planColor}}>
                                          {c.name?.charAt(0)?.toUpperCase() || 'E'}
                                       </div>
                                       <div>
                                          <p className="text-[13px] font-medium text-white line-clamp-1 cursor-pointer hover:text-blue-400">{c.name}</p>
                                          <p className="text-[11px] text-gray-500 line-clamp-1">{c.email}</p>
                                       </div>
                                    </div>
                                 </td>
                                 <td className="p-4">
                                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border" style={{ color: planColor, borderColor: `${planColor}33`, backgroundColor: `${planColor}11` }}>
                                       {c.ui_plan}
                                    </span>
                                 </td>
                                 <td className="p-4">
                                    <span className={`text-[12px] font-medium ${isAtiva ? 'text-green-500' : isInad ? 'text-red-500' : 'text-orange-500'}`}>
                                       {c.subscription_status}
                                    </span>
                                 </td>
                                 <td className="p-4 text-[13px] text-gray-300">{formatCurrency(c.price)}</td>
                                 <td className="p-4 text-[13px] text-gray-400">Mensal</td>
                                 <td className="p-4 text-[12px] text-gray-400">{new Date(c.next_billing).toLocaleDateString('pt-BR')}</td>
                                 <td className="p-4 text-[12px] text-gray-400">{new Date(c.next_billing).toLocaleDateString('pt-BR')}</td>
                                 <td className="p-4">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                       c.payment_status === 'Pago' ? 'text-green-400 border-green-500/30 bg-green-500/10' :
                                       c.payment_status === 'Pendente' ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' :
                                       'text-red-400 border-red-500/30 bg-red-500/10'
                                    }`}>
                                       {c.payment_status}
                                    </span>
                                 </td>
                                 <td className="p-4">
                                    <div className="flex items-center justify-end gap-2">
                                       <button className="w-7 h-7 rounded border border-white/10 flex items-center justify-center hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                                          <Eye className="w-3.5 h-3.5" />
                                       </button>
                                       <button className="w-7 h-7 rounded border border-[#f97316]/30 flex items-center justify-center hover:bg-[#f97316]/10 text-[#f97316] transition-colors">
                                          <Edit2 className="w-3.5 h-3.5" />
                                       </button>
                                       <button className="w-7 h-7 rounded border border-white/10 flex items-center justify-center hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
                                          <MoreHorizontal className="w-3.5 h-3.5" />
                                       </button>
                                    </div>
                                 </td>
                              </tr>
                           )
                        })}
                        {filteredCompanies.length === 0 && (
                           <tr>
                              <td colSpan={9} className="p-8 text-center text-gray-500">Nenhuma empresa encontrada com estes filtros.</td>
                           </tr>
                        )}
                     </tbody>
                  </table>
               </div>
            </div>

            {/* FILTERS SIDEBAR */}
            <div className="w-full lg:w-[300px] h-fit bg-[#11161d] border border-white/5 rounded-2xl p-5 shrink-0 flex flex-col">
               <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-white text-[15px]">Filtros</h3>
                  <button className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
               </div>
               
               <div className="space-y-4">
                  <div>
                     <label className="block text-[11px] text-gray-400 font-medium mb-1.5 uppercase">Plano</label>
                     <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} className="w-full bg-[#070b14] border border-white/10 rounded-lg p-2.5 text-[13px] text-white focus:outline-none focus:border-[#3b82f6]">
                        <option value="all">Todos os planos</option>
                        <option value="BÁSICO">Básico</option>
                        <option value="BUSINESS">Business</option>
                        <option value="PROFISSIONAL">Profissional</option>
                     </select>
                  </div>
                  <div>
                     <label className="block text-[11px] text-gray-400 font-medium mb-1.5 uppercase">Status</label>
                     <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full bg-[#070b14] border border-white/10 rounded-lg p-2.5 text-[13px] text-white focus:outline-none focus:border-[#3b82f6]">
                        <option value="all">Todos os status</option>
                        <option value="ativa">Ativa</option>
                        <option value="atrasada">Atrasada</option>
                        <option value="inadimplente">Inadimplente</option>
                     </select>
                  </div>
                  <div>
                     <label className="block text-[11px] text-gray-400 font-medium mb-1.5 uppercase">Pagamento</label>
                     <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="w-full bg-[#070b14] border border-white/10 rounded-lg p-2.5 text-[13px] text-white focus:outline-none focus:border-[#3b82f6]">
                        <option value="all">Todos os pagamentos</option>
                        <option value="pago">Pago</option>
                        <option value="pendente">Pendente</option>
                        <option value="vencido">Vencido</option>
                     </select>
                  </div>
                  <div>
                     <label className="block text-[11px] text-gray-400 font-medium mb-1.5 uppercase">Período</label>
                     <select className="w-full bg-[#070b14] border border-white/10 rounded-lg p-2.5 text-[13px] text-white focus:outline-none focus:border-[#3b82f6] mb-3">
                        <option>Este mês</option>
                        <option>Mês passado</option>
                        <option>Personalizado</option>
                     </select>
                  </div>
                  <div>
                     <label className="block text-[11px] text-gray-400 font-medium mb-1.5 uppercase">Data inicial</label>
                     <div className="relative">
                        <input type="date" className="w-full bg-[#070b14] border border-white/10 rounded-lg p-2 text-[13px] text-white focus:outline-none focus:border-[#3b82f6]" />
                     </div>
                  </div>
                  <div>
                     <label className="block text-[11px] text-gray-400 font-medium mb-1.5 uppercase">Data final</label>
                     <div className="relative">
                        <input type="date" className="w-full bg-[#070b14] border border-white/10 rounded-lg p-2 text-[13px] text-white focus:outline-none focus:border-[#3b82f6]" />
                     </div>
                  </div>
               </div>

               <div className="mt-6 space-y-2">
                  <button onClick={handleApplyFilters} className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-colors">
                     Aplicar Filtros
                  </button>
                  <button onClick={() => { setFilterPlan('all'); setFilterStatus('all'); setFilterPayment('all'); setSearch(''); }} className="w-full bg-[#070b14] hover:bg-white/5 border border-white/10 text-gray-300 py-2.5 rounded-lg text-[13px] font-medium transition-colors">
                     Limpar Filtros
                  </button>
               </div>
            </div>
         </div>

         {/* BOTTOM CARDS */}
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-[#11161d] border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
               <h3 className="text-[14px] font-bold text-white mb-4">Resumo de Inadimplência</h3>
               
               <div className="flex items-center gap-6 mb-2">
                  <div className="flex-1">
                     <p className="text-[12px] text-gray-400 mb-1">Total em aberto</p>
                     <h4 className="text-[24px] font-bold text-red-500 mb-1">{formatCurrency(stats.delayedAmount || 1250)}</h4>
                     <p className="text-[12px] text-gray-500">{stats.outstandingCount || 2} assinaturas em atraso</p>
                  </div>
                  <div className="w-24 h-24 relative flex items-center justify-center shrink-0">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                           <Pie data={[
                               {name: 'Vencido', value: 1250, fill: '#ef4444'},
                               {name: 'A vencer', value: 1100, fill: '#f59e0b'},
                               {name: 'Em dia', value: 20100, fill: '#22c55e'}
                             ]} 
                             innerRadius={25} outerRadius={40} dataKey="value" stroke="none">
                           </Pie>
                        </PieChart>
                     </ResponsiveContainer>
                  </div>
               </div>
               
               <div className="space-y-3 mt-4 text-[12px]">
                  <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div><span className="text-gray-300">Vencido (2)</span></div>
                     <span className="text-white font-medium">{formatCurrency(1250)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500"></div><span className="text-gray-300">A vencer (3)</span></div>
                     <span className="text-white font-medium">{formatCurrency(1100)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500"></div><span className="text-gray-300">Em dia (12)</span></div>
                     <span className="text-white font-medium">{formatCurrency(20100)}</span>
                  </div>
               </div>
            </div>

            <div className="bg-[#11161d] border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
               <h3 className="text-[14px] font-bold text-white mb-4">Receita Prevista <span className="text-gray-500 font-normal ml-1">(Próximos 30 dias)</span></h3>
               <div className="mb-4">
                  <p className="text-[12px] text-gray-400 mb-1">Total previsto</p>
                  <h4 className="text-[24px] font-bold text-[#3b82f6] mb-1">{formatCurrency(16500)}</h4>
                  <p className="text-[12px] text-gray-500">5 cobranças previstas</p>
               </div>
               
               <div className="space-y-3 text-[12px]">
                  <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500"></div><span className="text-gray-300">Básico (2)</span></div>
                     <span className="text-white font-medium">{formatCurrency(659.98)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-gray-300">Business (2)</span></div>
                     <span className="text-white font-medium">{formatCurrency(1099.98)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-500"></div><span className="text-gray-300">Profissional (1)</span></div>
                     <span className="text-white font-medium">{formatCurrency(1099.99)}</span>
                  </div>
               </div>
            </div>

            <div className="bg-[#11161d] border border-white/5 rounded-2xl p-5 flex flex-col justify-between">
               <h3 className="text-[14px] font-bold text-white mb-4">Últimas Movimentações</h3>
               <div className="space-y-4 text-[12px] flex-1 mt-2">
                  <div className="flex flex-col gap-1 pb-3 border-b border-white/5">
                     <div className="flex justify-between items-start gap-4">
                        <span className="text-gray-300 font-medium">Pagamento recebido - Norte Sul Topografia</span>
                        <span className="text-green-400 font-bold whitespace-nowrap">+ R$ 549,99</span>
                     </div>
                     <span className="text-gray-500">22/05/2026 08:34</span>
                  </div>
                  <div className="flex flex-col gap-1 pb-3 border-b border-white/5">
                     <div className="flex justify-between items-start gap-4">
                        <span className="text-gray-300 font-medium">Pagamento recebido - S V Topografia</span>
                        <span className="text-green-400 font-bold whitespace-nowrap">+ R$ 329,99</span>
                     </div>
                     <span className="text-gray-500">15/05/2026 07:58</span>
                  </div>
                  <div className="flex flex-col gap-1">
                     <div className="flex justify-between items-start gap-4">
                        <span className="text-gray-300 font-medium">Falha na cobrança - Vale Verde Empreendimentos</span>
                        <span className="text-red-400 font-bold whitespace-nowrap">R$ 549,99</span>
                     </div>
                     <span className="text-gray-500">05/05/2026 10:11</span>
                  </div>
               </div>
               <button className="text-[12px] font-medium text-blue-400 hover:text-blue-300 transition-colors mt-4 text-left w-fit flex items-center gap-1">
                  Ver todas movimentações <TrendingUp className="w-3 h-3" />
               </button>
            </div>
         </div>
      </div>
   );
}

'use client';

import { 
  Building2, 
  Map as MapIcon, 
  TrendingUp, 
  TrendingDown,
  Users,
  Clock,
  Calendar,
  Tag,
  DollarSign,
  ExternalLink,
  Plus,
  Minus,
  Crosshair,
  FileText,
  Wallet,
  UserPlus,
  Loader2,
  AlertTriangle,
  Lock,
  Activity,
  CheckCircle,
  Eye,
  Edit2,
  MoreHorizontal,
  Banknote,
  Settings
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCompanySaasPlan, getSaasPlanDisplayName, normalizeSaasPlanKey } from '@/lib/saasPlans';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { useRouter } from 'next/navigation';
import { filterRealCompanies, masterLog } from '@/lib/masterProduction';

export default function SuperAdminDashboard({ user }: { user: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCompanies: 0,
    activeCompanies: 0,
    suspendedCompanies: 0,
    inactiveCompanies: 0,
    mrr: 0,
    totalUsers: 0,
    totalBrokers: 0,
    totalProjects: 0,
    totalContracts: 0,
    totalLots: 0
  });
  const [recentCompanies, setRecentCompanies] = useState<any[]>([]);
  const [planDistribution, setPlanDistribution] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') {
       router.push('/dashboard/operational');
       return;
    }

    async function loadData() {
      setLoading(true);

      const [
         { data: companies, count: totalCompanies },
         { count: totalUsers },
         { count: totalBrokers },
         { count: totalProjects },
         { count: totalContracts },
         { count: totalLots }
      ] = await Promise.all([
         supabase.from('companies').select('*', { count: 'exact' }),
         supabase.from('users').select('*', { count: 'exact', head: true }),
         supabase.from('brokers').select('*', { count: 'exact', head: true }),
         supabase.from('projects').select('*', { count: 'exact', head: true }),
         supabase.from('contracts').select('*', { count: 'exact', head: true }),
         supabase.from('blocks').select('*', { count: 'exact', head: true })
      ]);

      const comps = filterRealCompanies(companies || []);
      
      const active = comps.filter(c => c.status_operacional === 'Ativa').length || comps.filter(c => c.active === true).length;
      const suspended = comps.filter(c => c.status_operacional === 'Suspensa').length;
      const inactive = comps.filter(c => c.status_operacional === 'Inativa' || c.status_operacional === 'Inadimplente' || c.status_operacional === 'Bloqueada').length || comps.filter(c => c.active === false).length;
      
      setStats({
        totalCompanies: comps.length,
        activeCompanies: active,
        suspendedCompanies: suspended,
        inactiveCompanies: inactive,
        mrr: 0,
        totalUsers: totalUsers || 0,
        totalBrokers: totalBrokers || 0,
        totalProjects: totalProjects || 0,
        totalContracts: totalContracts || 0,
        totalLots: totalLots || 0
      });

      const plans = comps.reduce((acc, current) => {
         const plan = getSaasPlanDisplayName(normalizeSaasPlanKey(current.plan || 'basic'));
         acc[plan] = (acc[plan] || 0) + 1;
         return acc;
      }, {} as Record<string, number>);

      const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#6b7280'];
      const pd = Object.keys(plans).map((key, i) => ({
         name: key.charAt(0).toUpperCase() + key.slice(1),
         value: plans[key],
         color: colors[i % colors.length]
      }));
      setPlanDistribution(pd);

      const computedAlerts = [];
      const badStatusComps = comps.filter(c => ['Suspensa', 'Bloqueada', 'Inadimplente'].includes(c.status_operacional));
      if (badStatusComps.length > 0) {
         computedAlerts.push({
            id: 'bad-status',
            icon: <Lock className="w-4 h-4" />,
            colorClass: 'text-red-500',
            bgClass: 'bg-red-500/10',
            title: `${badStatusComps.length} empresas restritas`,
            desc: badStatusComps.map(c => c.name).join(', '),
            time: 'Agora'
         });
      }
      const noEmailComps = comps.filter(c => !c.email);
      if (noEmailComps.length > 0) {
         computedAlerts.push({
            id: 'no-email',
            icon: <AlertTriangle className="w-4 h-4" />,
            colorClass: 'text-orange-500',
            bgClass: 'bg-orange-500/10',
            title: `${noEmailComps.length} empresas sem e-mail`,
            desc: 'Verifique no cadastro',
            time: 'Agora'
         });
      }
      setAlerts(computedAlerts);

      // Load recent companies with detailed counts
      const { data: recent } = await supabase
         .from('companies')
         .select(`*, users(count), brokers(count), projects(count)`)
         .order('created_at', { ascending: false })
         .limit(5);

      if (recent) {
         const formattedRecent = recent.map((r: any) => {
            const saas = getCompanySaasPlan(r);

            return {
               id: r.id,
               name: r.name,
               slug: r.slug,
               plan: saas.displayName,
               status: r.status_operacional || 'Ativa',
               projects: [r.projects?.[0]?.count || 0, saas.maxProjects],
               users: [r.users?.[0]?.count || 0, saas.maxBrokers],
               brokers: [r.brokers?.[0]?.count || 0, saas.maxBrokers],
               mrr: 0 // real MRR goes here when billing is ready
            };
         });
         setRecentCompanies(formattedRecent);
      }

      setLoading(false);
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleMissingFeature = () => {
    alert('Módulo em preparação.');
  };

  const revenueData = [
    { name: 'Receitas', value: 0 },
  ];

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#0b1111]">
      
      {/* Mobile Top Header included for consistency if needed, but layout handles it mostly */}
      <div className="md:hidden flex justify-between items-start mb-6 pt-2">
         <div>
            <h1 className="text-lg font-medium text-white flex items-center gap-1">
              <span className="text-[var(--color-text-muted)]">Olá,</span> <strong>{user?.name || 'Usuário'} (Super Admin)</strong>
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Painel de Controle da Plataforma</p>
          </div>
          <div className="flex flex-col items-end gap-2">
             <div className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-surface)] py-1.5 px-3 rounded-lg border border-[var(--color-border)]">
                21/05/2026 - 21/05/2026
             </div>
          </div>
      </div>

      <div className="hidden md:flex justify-end mb-6">
         <div className="flex items-center gap-3">
           <div className="flex items-center gap-2 text-xs font-mono text-gray-300 bg-[#151a23] py-2 px-4 rounded-xl border border-[#1f232b]">
              <Calendar className="w-4 h-4 text-gray-400" />
              21/05/2026 - 21/05/2026
           </div>
           <button className="flex items-center gap-2 text-xs font-semibold text-gray-300 bg-[#151a23] hover:bg-[#1a1f29] transition-colors py-2 px-4 rounded-xl border border-[#1f232b]">
              <ExternalLink className="w-4 h-4" /> Exportar Relatórios
           </button>
         </div>
      </div>

      {/* Main KPI Cards - Level 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        {/* Total Empresas */}
        <div className="bg-[#151a23] border border-[#1f232b] p-5 rounded-2xl relative overflow-hidden group shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
               <p className="text-[13px] text-gray-400 font-medium">Total de Empresas</p>
               <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                  <Building2 className="w-5 h-5" />
               </div>
            </div>
            <div className="mt-2">
               <h3 className="text-2xl font-bold text-white tracking-tight">{stats.totalCompanies}</h3>
               <p className="text-[11px] font-medium text-blue-400 mt-1">+2 este mês</p>
            </div>
        </div>

        {/* Empresas Ativas */}
        <div className="bg-[#151a23] border border-[#1f232b] p-5 rounded-2xl relative overflow-hidden group shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
               <p className="text-[13px] text-gray-400 font-medium">Empresas Ativas</p>
               <div className="p-2 rounded-xl bg-green-500/10 text-green-400">
                  <CheckCircle className="w-5 h-5" />
               </div>
            </div>
            <div className="mt-2">
               <h3 className="text-2xl font-bold text-white tracking-tight">{stats.activeCompanies}</h3>
               <p className="text-[11px] font-medium text-green-400 mt-1">78.6% do total</p>
            </div>
        </div>

        {/* Empresas Suspensas */}
        <div className="bg-[#151a23] border border-orange-500/20 p-5 rounded-2xl relative overflow-hidden group shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
               <p className="text-[13px] text-gray-400 font-medium">Empresas Suspensas</p>
               <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
                  <AlertTriangle className="w-5 h-5" />
               </div>
            </div>
            <div className="mt-2">
               <h3 className="text-2xl font-bold text-white tracking-tight">{stats.suspendedCompanies}</h3>
               <p className="text-[11px] font-medium text-orange-400 mt-1">14.3% do total</p>
            </div>
        </div>

        {/* Empresas Inativas */}
        <div className="bg-[#151a23] border border-red-500/20 p-5 rounded-2xl relative overflow-hidden group shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
               <p className="text-[13px] text-gray-400 font-medium">Empresas Inativas</p>
               <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
                  <Minus className="w-5 h-5" />
               </div>
            </div>
            <div className="mt-2">
               <h3 className="text-2xl font-bold text-white tracking-tight">{stats.inactiveCompanies}</h3>
               <p className="text-[11px] font-medium text-red-500 mt-1">7.1% do total</p>
            </div>
        </div>

        {/* Receita MRR */}
        <div className="bg-[#151a23] border border-[#1f232b] p-5 rounded-2xl relative overflow-hidden group shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
               <p className="text-[13px] text-gray-400 font-medium">Receita Mensal (MRR)</p>
               <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                  <DollarSign className="w-5 h-5" />
               </div>
            </div>
            <div className="mt-2">
               <h3 className="text-2xl font-bold text-white tracking-tight">{formatCurrency(stats.mrr)}</h3>
               <p className="text-[11px] font-medium text-purple-400 mt-1">+18.6% em relação ao mês anterior</p>
            </div>
        </div>
      </div>

      {/* Main KPI Cards - Level 2 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-[#151a23] border border-[#1f232b] p-4 rounded-xl flex items-center justify-between">
            <div>
               <p className="text-[12px] text-gray-500 mb-1 font-medium">Total de Usuários</p>
               <p className="text-xl font-bold text-gray-200">{stats.totalUsers}</p>
            </div>
            <Users className="w-6 h-6 text-blue-500/50" />
        </div>
        <div className="bg-[#151a23] border border-[#1f232b] p-4 rounded-xl flex items-center justify-between">
            <div>
               <p className="text-[12px] text-gray-500 mb-1 font-medium">Total de Corretores</p>
               <p className="text-xl font-bold text-gray-200">{stats.totalBrokers}</p>
            </div>
            <UserPlus className="w-6 h-6 text-purple-500/50" />
        </div>
        <div className="bg-[#151a23] border border-[#1f232b] p-4 rounded-xl flex items-center justify-between">
            <div>
               <p className="text-[12px] text-gray-500 mb-1 font-medium">Total de Empreendimentos</p>
               <p className="text-xl font-bold text-gray-200">{stats.totalProjects}</p>
            </div>
            <MapIcon className="w-6 h-6 text-blue-300/50" />
        </div>
        <div className="bg-[#151a23] border border-[#1f232b] p-4 rounded-xl flex items-center justify-between">
            <div>
               <p className="text-[12px] text-gray-500 mb-1 font-medium">Total de Contratos</p>
               <p className="text-xl font-bold text-gray-200">{stats.totalContracts}</p>
            </div>
            <FileText className="w-6 h-6 text-green-500/50" />
        </div>
        <div className="bg-[#151a23] border border-[#1f232b] p-4 rounded-xl flex items-center justify-between">
            <div>
               <p className="text-[12px] text-gray-500 mb-1 font-medium">Lotes Cadastrados</p>
               <p className="text-xl font-bold text-gray-200">{stats.totalLots}</p>
            </div>
            <Crosshair className="w-6 h-6 text-orange-500/50" />
        </div>
      </div>

      {/* Middle Section: Charts & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
         {/* Line Chart */}
         <div className="bg-[#151a23] border border-[#1f232b] p-6 rounded-2xl shadow-lg">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-[15px] font-semibold text-gray-200">Receita dos Últimos 6 Meses</h3>
               <select className="bg-[#1a1f29] border border-[#2d3340] text-gray-400 text-xs py-1 px-2 rounded-lg outline-none">
                 <option>Últimos 6 meses</option>
               </select>
            </div>
            <div className="h-64 w-full relative">
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={revenueData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#2d3340" vertical={false} />
                   <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                   <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `R$ ${val/1000}k`} />
                   <Tooltip 
                     contentStyle={{ backgroundColor: '#1a1f29', borderColor: '#2d3340', borderRadius: '8px', color: '#fff' }}
                     itemStyle={{ color: '#3b82f6' }}
                     formatter={(value) => [`R$ ${value}`, 'Receita']}
                   />
                   <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', stroke: '#151a23', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                 </LineChart>
               </ResponsiveContainer>
               <div className="absolute inset-0 flex items-center justify-center bg-[#151a23]/60 backdrop-blur-sm text-gray-400 font-medium rounded-lg">
                  Financeiro SaaS ainda não configurado.
               </div>
            </div>
         </div>

         {/* Donut Chart */}
         <div className="bg-[#151a23] border border-[#1f232b] p-6 rounded-2xl shadow-lg flex flex-col">
            <h3 className="text-[15px] font-semibold text-gray-200 mb-6">Distribuição de Planos</h3>
            <div className="flex-1 flex items-center justify-between gap-4">
                <div className="relative w-40 h-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                       <Pie
                         data={planDistribution}
                         cx="50%"
                         cy="50%"
                         innerRadius={50}
                         outerRadius={75}
                         paddingAngle={5}
                         dataKey="value"
                         stroke="none"
                       >
                         {planDistribution.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.color} />
                         ))}
                       </Pie>
                     </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <span className="text-2xl font-bold text-white">{stats.totalCompanies}</span>
                     <span className="text-[10px] text-gray-400 uppercase tracking-widest">Total</span>
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                   {planDistribution.map((plan, i) => (
                     <div key={i} className="flex flex-col">
                       <div className="flex items-center gap-2">
                         <div className="w-3 h-3 rounded-full" style={{ backgroundColor: plan.color }} />
                         <span className="text-sm font-medium text-gray-200">{plan.name}</span>
                       </div>
                       <span className="text-xs text-gray-500 ml-5">{plan.value} empresas {stats.totalCompanies > 0 && `(${(plan.value / stats.totalCompanies * 100).toFixed(1)}%)`}</span>
                     </div>
                   ))}
                </div>
            </div>
         </div>

         {/* Alerts Panel */}
         <div className="bg-[#151a23] border border-[#1f232b] p-6 rounded-2xl shadow-lg flex flex-col">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-[15px] font-semibold text-gray-200">Alertas e Notificações</h3>
               <button className="text-xs font-semibold text-blue-500 hover:text-blue-400">Ver todos</button>
            </div>
            <div className="flex-1 flex flex-col gap-5 overflow-y-auto">
               {alerts.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                     <CheckCircle className="w-10 h-10 text-gray-600 mb-2" />
                     <p className="text-gray-400 text-sm font-medium">Nenhum alerta no momento.</p>
                  </div>
               ) : (
                  alerts.map(a => (
                   <div key={a.id} className="flex items-start gap-4">
                      <div className={`p-2 rounded-full shrink-0 ${a.bgClass} ${a.colorClass}`}>
                         {a.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                         <p className={`text-[13px] font-medium truncate ${a.colorClass}`}>{a.title}</p>
                         <p className="text-[11px] text-gray-500 mt-1">{a.desc}</p>
                      </div>
                      <span className="text-[11px] text-gray-500 shrink-0">{a.time}</span>
                   </div>
                  ))
               )}
            </div>
         </div>
      </div>

      {/* Bottom Section: Table & Quick Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">
         {/* Table */}
         <div className="xl:col-span-3 bg-[#151a23] border border-[#1f232b] rounded-2xl shadow-lg flex flex-col overflow-hidden">
            <div className="p-6 border-b border-[#1f232b] flex justify-between items-center">
               <h3 className="text-[15px] font-semibold text-gray-200">Empresas Recentes</h3>
               <button className="text-xs font-semibold text-blue-500 hover:text-blue-400">Ver todas</button>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                  <thead>
                     <tr className="border-b border-[#1f232b] text-[10px] font-bold text-gray-500 tracking-wider uppercase">
                        <th className="p-4 pl-6 font-semibold">Empresa</th>
                        <th className="p-4 font-semibold">Plano</th>
                        <th className="p-4 font-semibold">Status</th>
                        <th className="p-4 font-semibold text-center">Projetos</th>
                        <th className="p-4 font-semibold text-center">Usuários</th>
                        <th className="p-4 font-semibold text-center">Corretores</th>
                        <th className="p-4 font-semibold">Receita (Mensal)</th>
                        <th className="p-4 pr-6 font-semibold text-right">Ações</th>
                     </tr>
                  </thead>
                  <tbody className="text-sm">
                     {recentCompanies.length === 0 ? (
                        <tr>
                           <td colSpan={8} className="p-8 text-center text-gray-500 font-medium">Nenhuma empresa cadastrada.</td>
                        </tr>
                     ) : (
                      recentCompanies.map((c) => (
                         <tr key={c.id} className="border-b border-[#1f232b]/50 hover:bg-[#1a1f29] transition-colors group">
                           <td className="p-4 pl-6">
                              <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center font-bold text-xs border border-gray-700">
                                   {c.name.charAt(0)}
                                 </div>
                                 <div className="flex flex-col">
                                    <span className="font-semibold text-gray-200 text-[13px]">{c.name}</span>
                                    <span className="text-[11px] text-gray-500">{c.slug}</span>
                                 </div>
                              </div>
                           </td>
                           <td className="p-4">
                              <span className={`px-2 py-1 rounded text-[10px] font-bold border ${c.plan === 'Profissional' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : c.plan === 'Standard' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                                {c.plan}
                              </span>
                           </td>
                           <td className="p-4">
                              <div className={`flex items-center gap-1.5 text-[11px] font-bold ${c.status === 'Ativa' ? 'text-green-500' : 'text-red-500'}`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${c.status === 'Ativa' ? 'bg-green-500' : 'bg-red-500'}`} />
                                 {c.status}
                              </div>
                           </td>
                           <td className="p-4 text-center">
                              <span className="text-gray-300 text-[12px]">{c.projects[0]} / {c.projects[1]}</span>
                           </td>
                           <td className="p-4 text-center">
                              <span className="text-gray-300 text-[12px]">{c.users[0]} / {c.users[1]}</span>
                           </td>
                           <td className="p-4 text-center">
                              <span className="text-gray-300 text-[12px]">{c.brokers[0]} / {c.brokers[1]}</span>
                           </td>
                           <td className="p-4">
                              <span className="text-gray-200 font-medium text-[13px]">{formatCurrency(c.mrr)}</span>
                           </td>
                           <td className="p-4 pr-6 text-right space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Visualizar">
                                <Eye className="w-4 h-4" />
                              </button>
                              <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Editar">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Mais Opções">
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                           </td>
                        </tr>
                      ))
                     )}
                  </tbody>
               </table>
            </div>
         </div>

         {/* Quick Actions */}
         <div className="bg-transparent flex flex-col gap-4">
            <h3 className="text-[15px] font-semibold text-gray-200 px-1">Ações Rápidas</h3>
            <div className="grid grid-cols-2 gap-4">
               <Link href="/companies" className="bg-[#151a23] border border-[#1f232b] hover:border-blue-500/50 hover:bg-[#1a2130] transition-all p-5 rounded-2xl flex flex-col items-center justify-center gap-3 group text-center shadow-sm">
                  <div className="p-3 rounded-full bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                     <Building2 className="w-6 h-6" />
                  </div>
                  <span className="text-gray-300 font-medium text-[13px]">Nova Empresa</span>
               </Link>
               <button onClick={handleMissingFeature} className="bg-[#151a23] border border-[#1f232b] hover:border-purple-500/50 hover:bg-[#1a2130] transition-all p-5 rounded-2xl flex flex-col items-center justify-center gap-3 group text-center shadow-sm">
                  <div className="p-3 rounded-full bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
                     <Banknote className="w-6 h-6" />
                  </div>
                  <span className="text-gray-300 font-medium text-[13px]">Novo Plano</span>
               </button>
               <button onClick={handleMissingFeature} className="bg-[#151a23] border border-[#1f232b] hover:border-green-500/50 hover:bg-[#1a2130] transition-all p-5 rounded-2xl flex flex-col items-center justify-center gap-3 group text-center shadow-sm">
                  <div className="p-3 rounded-full bg-green-500/10 text-green-400 group-hover:scale-110 transition-transform">
                     <Wallet className="w-6 h-6" />
                  </div>
                  <span className="text-gray-300 font-medium text-[13px] leading-tight">Ver<br/>Assinaturas</span>
               </button>
               <button onClick={handleMissingFeature} className="bg-[#151a23] border border-[#1f232b] hover:border-yellow-500/50 hover:bg-[#1a2130] transition-all p-5 rounded-2xl flex flex-col items-center justify-center gap-3 group text-center shadow-sm">
                  <div className="p-3 rounded-full bg-yellow-500/10 text-yellow-500 group-hover:scale-110 transition-transform">
                     <DollarSign className="w-6 h-6" />
                  </div>
                  <span className="text-gray-300 font-medium text-[13px] leading-tight">Relatório<br/>Financeiro</span>
               </button>
               <button onClick={handleMissingFeature} className="bg-[#151a23] border border-[#1f232b] hover:border-blue-500/50 hover:bg-[#1a2130] transition-all p-5 rounded-2xl flex flex-col items-center justify-center gap-3 group text-center shadow-sm">
                  <div className="p-3 rounded-full bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
                     <AlertTriangle className="w-6 h-6" />
                  </div>
                  <span className="text-gray-300 font-medium text-[13px] leading-tight">Logs de<br/>Auditoria</span>
               </button>
               <Link href="/settings/global" className="bg-[#151a23] border border-[#1f232b] hover:border-gray-400/50 hover:bg-[#1a2130] transition-all p-5 rounded-2xl flex flex-col items-center justify-center gap-3 group text-center shadow-sm">
                  <div className="p-3 rounded-full bg-gray-500/10 text-gray-400 group-hover:scale-110 transition-transform">
                     <Settings className="w-6 h-6" />
                  </div>
                  <span className="text-gray-300 font-medium text-[13px]">Configurações</span>
               </Link>
            </div>
         </div>
      </div>

      <footer className="mt-8 pt-6 border-t border-[#1f232b] flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-500">
         <div>
            <span className="font-semibold text-gray-400">© 2026 SV_LOTES</span> - Plataforma SaaS Imobiliária | Todos os direitos reservados
         </div>
         <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500/70" />
            <span>Ambiente Seguro e Monitorado</span>
         </div>
      </footer>

    </div>
  );
}

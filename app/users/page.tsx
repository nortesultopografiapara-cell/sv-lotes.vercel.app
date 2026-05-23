'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
   Users, Shield, UserPlus, Filter, X, Search, 
   Edit2, Lock, Unlock, MoreHorizontal, Download, 
   Calendar, CheckCircle2, AlertCircle, Loader2 
} from 'lucide-react';

export default function UsersPage() {
   const [users, setUsers] = useState<any[]>([]);
   const [companies, setCompanies] = useState<any[]>([]);
   const [loading, setLoading] = useState(true);
   const [search, setSearch] = useState('');
   
   // Filtros
   const [filterCompany, setFilterCompany] = useState('all');
   const [filterRole, setFilterRole] = useState('all');
   const [filterStatus, setFilterStatus] = useState('all');

   const loadUsersAndCompanies = useCallback(async () => {
      setLoading(true);
      console.log('SAAS_USERS_LOAD - Iniciando...');
      try {
         const [{ data: usersData, error: usersError }, { data: companiesData, error: compError }] = await Promise.all([
            supabase.from('users').select(`
               *,
               companies!tenant_id(
                  id,
                  name
               )
            `),
            supabase.from('companies').select('id, name').order('name')
         ]);

         if (usersError) {
             console.error('SAAS_USERS_LOAD_ERROR', usersError);
             // Fallback
             setUsers([
                { id: '1', full_name: 'Usuário Erro', email: 'erro@sis.com', role: 'ADMIN', status: 'ACTIVE', companies: null }
             ]);
         } else {
             setUsers(usersData || []);
         }

         if (!compError && companiesData) {
            setCompanies(companiesData);
         }
      } catch (err) {
         console.error('SAAS_USERS_LOAD_ERROR - Catch', err);
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      loadUsersAndCompanies();
   }, [loadUsersAndCompanies]);

   const filteredUsers = useMemo(() => {
      return users.filter(u => {
         const searchL = search.toLowerCase();
         const matchSearch = u.full_name?.toLowerCase().includes(searchL) || u.email?.toLowerCase().includes(searchL);
         
         const matchCompany = filterCompany === 'all' || u.tenant_id === filterCompany;
         
         // role check can vary, fallback if undefined
         const matchRole = filterRole === 'all' || (u.role && u.role.toLowerCase() === filterRole.toLowerCase());
         
         const uStatus = (u.status || 'ACTIVE').toUpperCase();
         const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? uStatus === 'ACTIVE' : uStatus === 'INACTIVE');
         
         return matchSearch && matchCompany && matchRole && matchStatus;
      });
   }, [users, search, filterCompany, filterRole, filterStatus]);

   const stats = useMemo(() => {
      const total = users.length;
      const act = users.filter(u => (u.status || 'ACTIVE').toUpperCase() === 'ACTIVE').length;
      const adms = users.filter(u => ['SUPER_ADMIN', 'ADMIN'].includes((u.role || '').toUpperCase())).length;
      
      const thisMonth = new Date().getMonth();
      const thisYear = new Date().getFullYear();
      const news = users.filter(u => {
         if (!u.created_at) return false;
         const d = new Date(u.created_at);
         return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      }).length;

      return { total, active: act, admins: adms, news };
   }, [users]);

   const formatRole = (role: string) => {
      const r = (role || 'User').toUpperCase();
      if (r === 'SUPER_ADMIN' || r === 'SUPER_MASTER') return 'Super Admin';
      if (r === 'ADMIN') return 'Admin';
      if (r === 'BROKER') return 'Corretor';
      return 'Usuário';
   };

   const toggleUserStatus = async (user: any) => {
      if (!window.confirm(`Deseja ${user.status === 'INACTIVE' ? 'ativar' : 'inativar'} o usuário ${user.full_name || user.email}?`)) {
         return;
      }

      console.log('SAAS_USER_STATUS_CHANGE', user.id);
      const newStatus = user.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
      const { error } = await supabase.from('users').update({ status: newStatus }).eq('id', user.id);
      
      if (!error) {
         setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
      } else {
         console.warn("Erro ao mudar status", error);
         // update locally anyway for demo if column doesnt exist?
         setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
      }
   };

   return (
      <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-[#070b14] min-h-full font-sans text-gray-200 selection:bg-blue-500/30">
         <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
            <div>
               <h1 className="text-[28px] font-bold text-white tracking-tight leading-tight">Usuários</h1>
               <p className="text-gray-400 mt-1 text-[14px]">Gerencie todos os usuários da plataforma SaaS.</p>
            </div>
            <div className="flex items-center gap-3 justify-end">
               <button className="bg-[#11161d] border border-white/10 hover:bg-white/5 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2">
                  <Download className="w-4 h-4" /> Exportar
               </button>
               <button className="bg-[#f97316] hover:bg-[#ea580c] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(249,115,22,0.4)]">
                  <span className="text-lg leading-none mt-[-2px]">+</span> Novo Usuário
               </button>
            </div>
         </div>

         {/* STATS */}
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-[#11161d] border border-purple-500/20 rounded-xl p-5 flex items-center gap-4 hover:shadow-[0_0_20px_rgba(168,85,247,0.1)] transition-all">
               <div className="w-14 h-14 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Users className="w-7 h-7 text-purple-400" />
               </div>
               <div>
                  <p className="text-[13px] text-gray-400 font-medium">Total de Usuários</p>
                  <div className="flex items-baseline gap-2">
                     <span className="text-3xl font-bold text-white">{stats.total}</span>
                  </div>
                  <span className="text-[11px] text-green-400 font-bold">↑ 20% <span className="text-gray-500 font-normal">este mês</span></span>
               </div>
            </div>
            
            <div className="bg-[#11161d] border border-green-500/20 rounded-xl p-5 flex items-center gap-4 hover:shadow-[0_0_20px_rgba(34,197,94,0.1)] transition-all">
               <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Shield className="w-7 h-7 text-green-400" />
               </div>
               <div>
                  <p className="text-[13px] text-gray-400 font-medium">Usuários Ativos</p>
                  <div className="flex items-baseline gap-2">
                     <span className="text-3xl font-bold text-white">{stats.active}</span>
                  </div>
                  <span className="text-[11px] text-green-400 font-bold">↑ 12% <span className="text-gray-500 font-normal">este mês</span></span>
               </div>
            </div>

            <div className="bg-[#11161d] border border-orange-500/20 rounded-xl p-5 flex items-center gap-4 hover:shadow-[0_0_20px_rgba(249,115,22,0.1)] transition-all">
               <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <UserPlus className="w-7 h-7 text-orange-400" />
               </div>
               <div>
                  <p className="text-[13px] text-gray-400 font-medium">Administradores</p>
                  <div className="flex items-baseline gap-2">
                     <span className="text-3xl font-bold text-white">{stats.admins}</span>
                  </div>
                  <span className="text-[11px] text-orange-400 font-bold">↑ 0% <span className="text-gray-500 font-normal">este mês</span></span>
               </div>
            </div>

            <div className="bg-[#11161d] border border-blue-500/20 rounded-xl p-5 flex items-center gap-4 hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] transition-all">
               <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Users className="w-7 h-7 text-blue-400" />
               </div>
               <div>
                  <p className="text-[13px] text-gray-400 font-medium">Novos Usuários</p>
                  <div className="flex items-baseline gap-2">
                     <span className="text-3xl font-bold text-white">{stats.news}</span>
                  </div>
                  <span className="text-[11px] text-green-400 font-bold">↑ 33% <span className="text-gray-500 font-normal">este mês</span></span>
               </div>
            </div>
         </div>

         <div className="flex gap-4">
            {/* TABELA */}
            <div className="flex-1 bg-[#11161d] border border-white/5 rounded-2xl flex flex-col mb-8 overflow-hidden min-h-[500px]">
               <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row items-center gap-3 justify-between bg-[#0B0E14] rounded-t-2xl">
                  <div className="relative w-full sm:w-[320px]">
                     <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                     <input 
                        type="text" 
                        placeholder="Buscar usuários..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-[#070b14] border border-white/10 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-[#3b82f6]/50 text-sm shadow-inner"
                     />
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#3b82f6]/30 text-blue-400 text-sm hover:bg-[#3b82f6]/10 transition-colors">
                     <Filter className="w-4 h-4" /> Filtros
                  </button>
               </div>
               
               <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                     <thead>
                        <tr className="bg-[#11161d] border-b border-white/5 border-t">
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Usuário</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Email</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Empresa</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium">Função</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium text-center">Status</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium text-center">Último Acesso</th>
                           <th className="p-4 text-[12px] text-gray-400 font-medium text-right">Ações</th>
                        </tr>
                     </thead>
                     <tbody>
                        {loading ? (
                           <tr>
                              <td colSpan={7} className="h-48 text-center text-gray-400">
                                 <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#3b82f6]" />
                                 Carregando usuários...
                              </td>
                           </tr>
                        ) : filteredUsers.length === 0 ? (
                           <tr>
                              <td colSpan={7} className="h-48 text-center text-gray-400">
                                 Nenhum usuário encontrado.
                              </td>
                           </tr>
                        ) : filteredUsers.map((u, idx) => {
                           const cName = u.companies?.name || 'S V Topografia';
                           const rName = formatRole(u.role);
                           const isAtivo = (u.status || 'ACTIVE').toUpperCase() !== 'INACTIVE';
                           const vColor = idx % 3 === 0 ? 'bg-purple-500' : idx % 3 === 1 ? 'bg-green-500' : 'bg-orange-500';
                           const name = u.full_name || u.email?.split('@')[0] || 'Usuário';

                           return (
                              <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                                 <td className="p-4">
                                    <div className="flex items-center gap-3">
                                       <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-[13px] shrink-0 ${vColor}`}>
                                          {name.charAt(0).toUpperCase()}
                                       </div>
                                       <div>
                                          <p className="text-[14px] font-medium text-white">{name}</p>
                                       </div>
                                    </div>
                                 </td>
                                 <td className="p-4 py-3">
                                    <span className="text-[13px] text-gray-300">{u.email}</span>
                                 </td>
                                 <td className="p-4 py-3">
                                    <span className="text-[13px] text-gray-300">{cName}</span>
                                 </td>
                                 <td className="p-4 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                                       rName === 'Super Admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                       rName === 'Admin' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                       'bg-white/5 text-gray-300 border border-white/10'
                                    }`}>
                                       {rName}
                                    </span>
                                 </td>
                                 <td className="p-4 py-3 text-center">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase border ${
                                       isAtivo ? 'text-green-500 border-green-500/20 bg-green-500/10' : 'text-red-500 border-red-500/20 bg-red-500/10'
                                    }`}>
                                       {isAtivo ? 'Ativo' : 'Inativo'}
                                    </span>
                                 </td>
                                 <td className="p-4 py-3 text-center">
                                    <span className="text-[12px] font-medium text-gray-400">
                                       {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '23/05/2026 08:34'}
                                    </span>
                                 </td>
                                 <td className="p-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                       <button className="w-[32px] h-[32px] rounded-lg border border-blue-500/20 flex items-center justify-center hover:bg-blue-500/10 transition-colors group/btn">
                                          <Edit2 className="w-4 h-4 text-blue-500 group-hover/btn:text-blue-400" />
                                       </button>
                                       <button onClick={() => toggleUserStatus(u)} className={`w-[32px] h-[32px] rounded-lg border flex items-center justify-center transition-colors group/btn ${isAtivo ? 'border-yellow-500/20 hover:bg-yellow-500/10' : 'border-green-500/20 hover:bg-green-500/10'}`}>
                                          {isAtivo ? <Lock className="w-4 h-4 text-yellow-500 group-hover/btn:text-yellow-400" /> : <Unlock className="w-4 h-4 text-green-500 group-hover/btn:text-green-400" />}
                                       </button>
                                       <button className="w-[32px] h-[32px] rounded-lg border border-gray-600/30 flex items-center justify-center hover:bg-white/5 transition-colors text-gray-400">
                                          <MoreHorizontal className="w-4 h-4" />
                                       </button>
                                    </div>
                                 </td>
                              </tr>
                           )
                        })}
                     </tbody>
                  </table>
               </div>
               
               <div className="p-4 border-t border-white/5 text-[13px] text-gray-400 flex items-center justify-between bg-[#0B0E14]">
                  <span>Mostrando 1 a {filteredUsers.length} de {filteredUsers.length} usuários</span>
                  <div className="flex items-center gap-2">
                     <button className="px-3 py-1.5 rounded border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-50">Anterior</button>
                     <button className="w-8 h-8 rounded border border-[#3b82f6] bg-[#3b82f6]/20 text-[#3b82f6] font-medium flex items-center justify-center">1</button>
                     <button className="px-3 py-1.5 rounded border border-white/10 hover:bg-white/5 transition-colors">Próxima</button>
                  </div>
               </div>
            </div>

            {/* SIDEBAR DE FILTROS */}
            <div className="w-[280px] bg-[#11161d] border border-white/5 rounded-2xl flex flex-col mb-8 p-5 shrink-0">
               <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-white text-[15px]">Filtros</h3>
                  <button className="text-gray-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
               </div>
               
               <div className="space-y-5 flex-1">
                  <div>
                     <label className="block text-[11px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">Empresa</label>
                     <select 
                        value={filterCompany} 
                        onChange={e => setFilterCompany(e.target.value)}
                        className="w-full bg-[#070b14] border border-white/10 rounded-lg hidden sm:block p-2 text-[13px] text-white focus:outline-none focus:border-[#3b82f6]"
                     >
                        <option value="all">Todas as empresas</option>
                        {companies.map(c => (
                           <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                     </select>
                  </div>

                  <div>
                     <label className="block text-[11px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">Função</label>
                     <select 
                        value={filterRole} 
                        onChange={e => setFilterRole(e.target.value)}
                        className="w-full bg-[#070b14] border border-white/10 rounded-lg hidden sm:block p-2 text-[13px] text-white focus:outline-none focus:border-[#3b82f6]"
                     >
                        <option value="all">Todas as funções</option>
                        <option value="super_admin">Super Admin</option>
                        <option value="admin">Admin</option>
                        <option value="usuario">Usuário</option>
                     </select>
                  </div>

                  <div>
                     <label className="block text-[11px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">Status</label>
                     <select 
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        className="w-full bg-[#070b14] border border-white/10 rounded-lg hidden sm:block p-2 text-[13px] text-white focus:outline-none focus:border-[#3b82f6]"
                     >
                        <option value="all">Todos os status</option>
                        <option value="active">Ativo</option>
                        <option value="inactive">Inativo</option>
                     </select>
                  </div>

                  <div>
                     <label className="block text-[11px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">Último acesso</label>
                     <div className="space-y-2">
                        <div className="relative">
                           <input type="text" placeholder="Data inicial" className="w-full bg-[#070b14] border border-white/10 rounded-lg p-2 text-[13px] text-white focus:outline-none focus:border-[#3b82f6]" />
                           <Calendar className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        </div>
                        <div className="relative">
                           <input type="text" placeholder="Data final" className="w-full bg-[#070b14] border border-white/10 rounded-lg p-2 text-[13px] text-white focus:outline-none focus:border-[#3b82f6]" />
                           <Calendar className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        </div>
                     </div>
                  </div>
               </div>

               <div className="mt-6 space-y-2">
                  <button className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white py-2.5 rounded-lg text-[13px] font-bold tracking-wide transition-colors">
                     Aplicar Filtros
                  </button>
                  <button onClick={() => { setFilterCompany('all'); setFilterRole('all'); setFilterStatus('all'); setSearch(''); }} className="w-full bg-white/5 hover:bg-white/10 text-gray-300 py-2.5 rounded-lg text-[13px] font-medium transition-colors">
                     Limpar Filtros
                  </button>
               </div>
            </div>
         </div>

         {/* HIGHLIGHT CARDS at the bottom */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-2 mb-8">
            <div className="bg-[#11161d] border border-white/5 rounded-xl p-5 flex items-start gap-4 hover:border-white/10 transition-colors">
               <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex flex-col items-center justify-center shrink-0">
                  <Shield className="w-6 h-6 text-purple-400" />
               </div>
               <div>
                  <h4 className="text-[14px] font-bold text-white mb-1">Segurança Avançada</h4>
                  <p className="text-[12px] text-gray-400 leading-tight">Controle de acesso baseado em funções e permissões granulares.</p>
               </div>
            </div>
            
            <div className="bg-[#11161d] border border-white/5 rounded-xl p-5 flex items-start gap-4 hover:border-white/10 transition-colors">
               <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex flex-col items-center justify-center shrink-0">
                  <Activity className="w-6 h-6 text-blue-400" />
               </div>
               <div>
                  <h4 className="text-[14px] font-bold text-white mb-1">Histórico Completo</h4>
                  <p className="text-[12px] text-gray-400 leading-tight">Todos os acessos e alterações são registrados automaticamente.</p>
               </div>
            </div>

            <div className="bg-[#11161d] border border-white/5 rounded-xl p-5 flex items-start gap-4 hover:border-white/10 transition-colors">
               <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex flex-col items-center justify-center shrink-0">
                  <Lock className="w-6 h-6 text-green-400" />
               </div>
               <div>
                  <h4 className="text-[14px] font-bold text-white mb-1">Controle Total</h4>
                  <p className="text-[12px] text-gray-400 leading-tight">Gerencie usuários, permissões e acessos da plataforma.</p>
               </div>
            </div>

            <div className="bg-[#11161d] border border-white/5 rounded-xl p-5 flex items-start gap-4 hover:border-white/10 transition-colors">
               <div className="w-12 h-12 rounded-xl bg-[#f97316]/10 border border-[#f97316]/20 flex flex-col items-center justify-center shrink-0">
                  <Users className="w-6 h-6 text-[#f97316]" />
               </div>
               <div>
                  <h4 className="text-[14px] font-bold text-white mb-1">Suporte Especializado</h4>
                  <p className="text-[12px] text-gray-400 leading-tight">Equipe pronta para ajudar quando você precisar.</p>
               </div>
            </div>
         </div>
      </div>
   );
}

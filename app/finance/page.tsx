'use client';

import { Banknote, Search, Download, Filter, TrendingDown, TrendingUp, AlertCircle, Loader2, Eye, CheckCircle, MessageCircle, FileText, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function FinancePage() {
  const { user, loading: authLoading } = useAuth();
  
  // States
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todas as Situações');
  const [projectFilter, setProjectFilter] = useState('Todos os projetos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsList, setProjectsList] = useState<string[]>([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Stats
  const [stats, setStats] = useState({
     recebidoMes: 0,
     aReceber: 0,
     vencidas: 0,
     vencendoHoje: 0,
     totalContratosValor: 0,
     inadimplencia: 0,
     qtyPending: 0,
     qtyLate: 0,
     qtyDueToday: 0,
     qtyContracts: 0
  });

  useEffect(() => {
    async function loadFinance() {
      if (!user) return;
      try {
        let query = supabase
           .from('finance_receipts')
           .select('*, sales(id, contract_number, contract_url, clients(full_name)), customers(name), blocks(name, block_name, number, projects(name))')
           .order('due_date', { ascending: true });
           
        if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
           query = query.eq('tenant_id', user.tenant_id);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        let localRecebido = 0;
        let localAReceber = 0;
        let localVencidas = 0;
        let localVencendoHoje = 0;
        let localTotal = 0;
        
        let qtyLate = 0;
        let qtyDueToday = 0;
        let qtyPending = 0;
        let pList = new Set<string>();
        let contractSet = new Set<string>();

        const today = new Date();
        today.setUTCHours(0,0,0,0);
        const todayStr = today.toISOString().split('T')[0];
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        if (data) {
          data.forEach(p => {
             const amt = Number(p.amount) || 0;
             const pStatus = p.status?.toLowerCase() || 'pendente';
             const dueStr = p.due_date?.split('T')[0];
             const dueDate = new Date(dueStr + 'T12:00:00Z');
             
             if (p.sale_id) contractSet.add(p.sale_id);
             
             // Extract project name for filters
             const projName = p.blocks?.projects?.name || 'Projeto Desconhecido';
             if (projName !== 'Projeto Desconhecido') pList.add(projName);
             
             localTotal += amt;
             
             let computedStatus = pStatus;
             if ((pStatus === 'pendente' || pStatus === 'pending') && dueStr && dueStr < todayStr) {
                 computedStatus = 'atrasado';
             }
             
             if (computedStatus === 'pago' || computedStatus === 'paid') {
                 const paidDate = p.paid_at ? new Date(p.paid_at) : dueDate;
                 if (paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear) {
                     localRecebido += amt;
                 }
             }
             
             if (computedStatus === 'pendente' || computedStatus === 'pending') {
                 localAReceber += amt;
                 qtyPending++;
                 if (dueStr === todayStr) {
                     localVencendoHoje += amt;
                     qtyDueToday++;
                 }
             }
             
             if (computedStatus === 'atrasado' || computedStatus === 'overdue') {
                 localVencidas += amt;
                 qtyLate++;
             }
          });
          
          setPayments(data);
          setProjectsList(Array.from(pList));
        }
        
        const inadimplencia = localTotal > 0 ? (localVencidas / localTotal) * 100 : 0;
        
        setStats({ 
            recebidoMes: localRecebido, 
            aReceber: localAReceber, 
            vencidas: localVencidas, 
            vencendoHoje: localVencendoHoje,
            totalContratosValor: localTotal,
            inadimplencia: inadimplencia,
            qtyPending,
            qtyLate,
            qtyDueToday,
            qtyContracts: contractSet.size
        });

      } catch(err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadFinance();
    }
  }, [user, authLoading]);

  // Client-side filtering
  const filteredPayments = payments.filter(p => {
     const matchSearch = search ? (
         p.sales?.contract_number?.toLowerCase().includes(search.toLowerCase()) || 
         p.sales?.contract_url?.toLowerCase().includes(search.toLowerCase()) || 
         p.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
         p.sales?.clients?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
         p.blocks?.name?.toLowerCase().includes(search.toLowerCase()) ||
         p.blocks?.block_name?.toLowerCase().includes(search.toLowerCase()) ||
         String(p.blocks?.number).includes(search)
     ) : true;
     
     const matchStatus = statusFilter !== 'Todas as Situações' ? 
         (statusFilter.toLowerCase() === 'pago' && (p.status === 'pago' || p.status === 'PAID')) ||
         (statusFilter.toLowerCase() === 'pendente' && (p.status === 'pendente' || p.status === 'PENDING') && p.due_date >= new Date().toISOString().split('T')[0]) ||
         (statusFilter.toLowerCase() === 'atrasado' && (p.status === 'atrasado' || p.status === 'OVERDUE' || ( (p.status === 'pendente' || p.status === 'PENDING') && p.due_date < new Date().toISOString().split('T')[0] ))) ||
         (statusFilter.toLowerCase() === 'cancelado' && (p.status === 'cancelado' || p.status === 'CANCELED'))
         : true;
         
     const matchProject = projectFilter !== 'Todos os projetos' ? (p.blocks?.projects?.name === projectFilter) : true;
     
     const matchStartDate = startDate ? (p.due_date >= startDate) : true;
     const matchEndDate = endDate ? (p.due_date <= endDate) : true;
     
     return matchSearch && matchStatus && matchProject && matchStartDate && matchEndDate;
  });

  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage) || 1;
  const currentPayments = filteredPayments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };
  
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('Todas as Situações');
    setProjectFilter('Todos os projetos');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0b0e14] p-6 md:p-8 text-white h-full font-sans">
      
      {/* HEADER */}
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Módulo Financeiro</h1>
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
            CONTRATOS, TÍTULOS E INADIMPLÊNCIA
          </p>
        </div>
        <button className="bg-transparent border border-[#2d3340] hover:bg-[#1a1f29] text-gray-300 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm">
          <Download className="w-4 h-4" />
          Exportar Relatório
        </button>
      </header>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 mb-8">
        <StatCard 
            title="Recebido no mês" 
            value={formatCurrency(stats.recebidoMes)} 
            subtitle={"+12% vs mês anterior"}
            subtitleColor="text-[#2ad271]"
            icon={<TrendingUp className="w-5 h-5" />} 
            iconBg="bg-[#2ad271]/10" 
            iconColor="text-[#2ad271]" 
            loading={loading} 
        />
        <StatCard 
            title="A receber" 
            value={formatCurrency(stats.aReceber)} 
            subtitle={`${stats.qtyPending} parcelas pendentes`}
            subtitleColor="text-[#4999e9]"
            icon={<FileText className="w-5 h-5" />} 
            iconBg="bg-[#4999e9]/10" 
            iconColor="text-[#4999e9]" 
            loading={loading} 
        />
        <StatCard 
            title="Parcelas vencidas" 
            value={formatCurrency(stats.vencidas)} 
            subtitle={`${stats.qtyLate} parcelas em atraso`}
            subtitleColor="text-gray-500"
            icon={<TrendingDown className="w-5 h-5" />} 
            iconBg="bg-[#f04449]/10" 
            iconColor="text-[#f04449]" 
            loading={loading} 
        />
        <StatCard 
            title="Vencendo hoje" 
            value={formatCurrency(stats.vencendoHoje)} 
            subtitle={`${stats.qtyDueToday} parcelas`}
            subtitleColor="text-[#f8b63a]"
            icon={<AlertCircle className="w-5 h-5" />} 
            iconBg="bg-[#f8b63a]/10" 
            iconColor="text-[#f8b63a]" 
            loading={loading} 
        />
        <StatCard 
            title="Total em contratos" 
            value={formatCurrency(stats.totalContratosValor)} 
            subtitle={`${stats.qtyContracts} contratos ativos`}
            subtitleColor="text-gray-500"
            icon={<Banknote className="w-5 h-5" />} 
            iconBg="bg-[#a855f7]/10" 
            iconColor="text-[#a855f7]" 
            loading={loading} 
        />
        <StatCard 
            title="Inadimplência %" 
            value={`${stats.inadimplencia.toFixed(2)}%`} 
            subtitle={stats.inadimplencia > 5 ? "Acima do ideal (5%)" : "Dentro do ideal"}
            subtitleColor={stats.inadimplencia > 5 ? "text-[#f04449]" : "text-gray-500"}
            icon={<AlertCircle className="w-5 h-5" />} 
            iconBg="bg-[#f04449]/10" 
            iconColor="text-[#f04449]" 
            loading={loading} 
        />
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap gap-4 items-end mb-6">
        <div className="flex-1 min-w-[250px]">
          <label className="block text-xs text-gray-400 mb-1.5 ml-1">Buscar por cliente, contrato ou lote</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#13161c] border border-[#1f232b] rounded-lg py-2 pl-9 pr-4 text-sm text-gray-300 focus:outline-none focus:border-gray-500 transition-colors" 
              placeholder="Digite cliente, contrato ou lote..." 
            />
          </div>
        </div>
        
        <div className="w-full sm:w-48">
          <label className="block text-xs text-gray-400 mb-1.5 ml-1">Status</label>
          <select 
             value={statusFilter}
             onChange={(e) => setStatusFilter(e.target.value)}
             className="w-full bg-[#13161c] border border-[#1f232b] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-gray-500 transition-colors">
            <option>Todas as Situações</option>
            <option>Pago</option>
            <option>Pendente</option>
            <option>Atrasado</option>
            <option>Cancelado</option>
          </select>
        </div>

        <div className="w-full sm:w-48">
          <label className="block text-xs text-gray-400 mb-1.5 ml-1">Projeto</label>
          <select 
             value={projectFilter}
             onChange={(e) => setProjectFilter(e.target.value)}
             className="w-full bg-[#13161c] border border-[#1f232b] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-gray-500 transition-colors">
            <option>Todos os projetos</option>
            {projectsList.map((p, i) => <option key={i} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="w-full sm:w-36">
          <label className="block text-xs text-gray-400 mb-1.5 ml-1">Data inicial</label>
          <input 
             type="date" 
             value={startDate}
             onChange={(e) => setStartDate(e.target.value)}
             className="w-full bg-[#13161c] border border-[#1f232b] rounded-lg px-3 py-2 text-sm text-gray-400 focus:outline-none focus:border-gray-500 transition-colors" 
             style={{ colorScheme: 'dark' }}
          />
        </div>

        <div className="w-full sm:w-36">
          <label className="block text-xs text-gray-400 mb-1.5 ml-1">Data final</label>
          <input 
             type="date" 
             value={endDate}
             onChange={(e) => setEndDate(e.target.value)}
             className="w-full bg-[#13161c] border border-[#1f232b] rounded-lg px-3 py-2 text-sm text-gray-400 focus:outline-none focus:border-gray-500 transition-colors" 
             style={{ colorScheme: 'dark' }}
          />
        </div>
        
        <button 
           onClick={clearFilters}
           className="bg-transparent border border-[#1f232b] hover:bg-[#1f232b] text-gray-300 px-4 py-2 rounded-lg text-sm flex items-center gap-2 h-[38px] transition-colors whitespace-nowrap">
          <Filter className="w-4 h-4" />
          Limpar filtros
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-[#13161c] border border-[#1f232b] rounded-xl overflow-hidden shadow-xl mb-8 flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="border-b border-[#1f232b] bg-[#161a22]">
                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Contrato / Lote</th>
                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Cliente</th>
                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Projeto</th>
                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase tracking-widest font-semibold text-center">Parcela</th>
                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Vencimento</th>
                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase tracking-widest font-semibold text-right">Valor Parcela</th>
                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase tracking-widest font-semibold text-right">Valor Pago</th>
                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase tracking-widest font-semibold text-center">Status</th>
                <th className="px-6 py-4 text-[10px] text-gray-500 uppercase tracking-widest font-semibold text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f232b]">
              {loading ? (
                <tr>
                   <td colSpan={9} className="text-center p-16">
                      <Loader2 className="w-8 h-8 text-[#4999e9] animate-spin mx-auto mb-4" />
                      <p className="text-sm font-medium text-gray-400">Sincronizando registros financeiros...</p>
                   </td>
                </tr>
              ) : currentPayments.length > 0 ? (
                currentPayments.map(p => {
                   const projectName = p.blocks?.projects?.name || 'Projeto Desconhecido';
                   const blockName = p.blocks?.block_name || p.blocks?.name || '?';
                   const lotNumber = p.blocks?.number || '?';
                   
                   const loteDesc = `QD ${blockName} - LT ${lotNumber}`;
                   const contractNo = p.sales?.contract_number || p.sales?.id?.split('-')[0].toUpperCase() || 'CT-S/N';
                   
                   const clientName = p.customers?.name || p.sales?.clients?.full_name || 'Desconhecido';
                   const parcelInfo = `${p.installment_number || 1}`;
                   const maxParcel = p.sales?.installments_count ? ` / ${p.sales.installments_count}` : '';
                   
                   const pStatusRaw = p.status?.toLowerCase() || 'pendente';
                   const dueStr = p.due_date?.split('T')[0];
                   const todayStr = new Date().toISOString().split('T')[0];
                   
                   let computedStatus = pStatusRaw;
                   if ((pStatusRaw === 'pendente' || pStatusRaw === 'pending') && dueStr && dueStr < todayStr) {
                       computedStatus = 'atrasado';
                   }
                   
                   const isPaid = computedStatus === 'pago' || computedStatus === 'paid';
                   const amount = Number(p.amount) || 0;
                   const paidAmount = isPaid ? (Number(p.paid_amount) || amount) : 0;

                   return (
                      <tr key={p.id} className="hover:bg-[#1a1f29] transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-200 text-sm mb-0.5">{contractNo}</div>
                          <div className="text-[11px] text-gray-500">{loteDesc}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-300 text-sm">{clientName}</div>
                          {/* Em um cenário real adicionar telefone em p.customers.phone */}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400">
                          {projectName}
                        </td>
                        <td className="px-6 py-4 text-center text-sm font-mono text-gray-400">
                          {parcelInfo}{maxParcel}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">
                          {dueStr ? new Date(dueStr + 'T12:00:00Z').toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="px-6 py-4 font-medium text-sm text-gray-300 text-right">
                          {formatCurrency(amount)}
                        </td>
                        <td className="px-6 py-4 font-medium text-sm text-gray-400 text-right">
                          {formatCurrency(paidAmount)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <StatusBadge status={computedStatus} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                             <button className="p-1.5 hover:text-white text-gray-500 transition-colors" title="Visualizar Detalhes">
                               <Eye className="w-5 h-5" />
                             </button>
                             <button className="p-1.5 hover:text-[#2ad271] text-gray-500 transition-colors" title="Registrar Pagamento">
                                <CheckCircle className="w-5 h-5" />
                             </button>
                             <button className="p-1.5 hover:text-[#2ad271] text-gray-500 transition-colors" title="Cobrar no WhatsApp">
                                <MessageCircle className="w-5 h-5" />
                             </button>
                          </div>
                        </td>
                      </tr>
                   );
                })
              ) : (
                <tr>
                   <td colSpan={9} className="py-12 bg-[#0E1116] text-center">
                      <div className="text-gray-500 text-sm">Nenhum registro encontrado para os filtros selecionados.</div>
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        {!loading && filteredPayments.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-[#1f232b] text-sm text-gray-400 gap-4 bg-[#11141a]">
             <div>Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredPayments.length)} de {filteredPayments.length} registros</div>
             <div className="flex items-center gap-1">
                <button 
                   onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                   disabled={currentPage === 1}
                   className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#1f232b] disabled:opacity-50 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                   let pageNum = i + 1;
                   if (totalPages > 5 && currentPage > 3) {
                     pageNum = currentPage - 2 + i;
                     if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                   }
                   if (pageNum < 1) pageNum = 1;
                   return (
                      <button 
                         key={pageNum}
                         onClick={() => setCurrentPage(pageNum)}
                         className={`w-8 h-8 flex items-center justify-center rounded text-xs font-semibold transition-colors ${currentPage === pageNum ? 'bg-[#1f232b] text-white' : 'hover:bg-[#1f232b]'}`}>
                         {pageNum}
                      </button>
                   )
                })}

                <button 
                   onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                   disabled={currentPage === totalPages}
                   className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#1f232b] disabled:opacity-50 transition-colors">
                   <ChevronRight className="w-4 h-4" />
                </button>
             </div>
             <div className="flex items-center gap-2">
               Registros por página:
               <select 
                  value={itemsPerPage}
                  onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="bg-transparent border border-[#1f232b] rounded px-2 py-1 outline-none">
                 <option value={10}>10</option>
                 <option value={25}>25</option>
                 <option value={50}>50</option>
               </select>
             </div>
          </div>
        )}
      </div>

      {/* FOOTER INFO PANEL */}
      <div className="bg-[#13161c] border border-[#1f232b] rounded-xl flex flex-col md:flex-row shadow-xl overflow-hidden">
        <div className="flex-1 p-6 md:p-8 flex gap-5 items-start border-b md:border-b-0 md:border-r border-[#1f232b]">
           <div className="w-14 h-14 rounded-xl bg-[#1c212a] flex items-center justify-center shrink-0">
              <Banknote className="w-7 h-7 text-gray-400" />
           </div>
           <div>
             <h3 className="text-white font-semibold text-lg mb-2">Nenhum recebimento encontrado.</h3>
             <p className="text-gray-400 text-sm leading-relaxed mb-1">
               As vendas confirmadas e suas parcelas aparecerão aqui automaticamente.
             </p>
             <p className="text-gray-500 text-sm leading-relaxed">
               Finalize uma venda para começar a acompanhar os recebimentos.
             </p>
           </div>
        </div>
        <div className="flex-1 p-6 md:p-8 flex flex-col justify-between">
           <div>
             <h4 className="text-white font-semibold mb-4 text-sm">Dicas rápidas:</h4>
             <ul className="space-y-3 text-sm text-gray-400">
               <li className="flex items-center gap-3">
                 <CheckCircle className="w-4 h-4 text-[#2ad271]/70 shrink-0" /> 
                 Use os filtros acima para refinar sua busca
               </li>
               <li className="flex items-center gap-3">
                 <CheckCircle className="w-4 h-4 text-[#2ad271]/70 shrink-0" /> 
                 Clique em <Eye className="w-4 h-4 inline" /> para ver os detalhes da parcela
               </li>
               <li className="flex items-center gap-3">
                 <CheckCircle className="w-4 h-4 text-[#2ad271]/70 shrink-0" /> 
                 Registre pagamentos para manter controle atualizado
               </li>
             </ul>
           </div>
           <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-[#1f232b]">
             <span className="text-sm text-gray-400 font-medium tracking-wide">Precisa de ajuda?</span>
             <button className="bg-[#1c212a] border border-[#2d3340] hover:bg-[#2d3340] text-gray-300 px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
               <BookOpen className="w-4 h-4" /> 
               Ver guia rápido
             </button>
           </div>
        </div>
      </div>

    </div>
  );
}

function StatCard({ title, value, subtitle, subtitleColor, icon, iconBg, iconColor, loading }: any) {
   return (
      <div className="bg-[#13161c] border border-[#1f232b] rounded-xl p-5 flex gap-4 items-center hover:border-gray-600 transition-colors shadow-sm">
        <div className={`w-12 h-12 rounded-full flex shrink-0 items-center justify-center ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <div className="flex flex-col min-w-0">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1 truncate">{title}</p>
          <h3 className="text-lg lg:text-xl font-bold text-white leading-none mb-1.5 truncate">{loading ? '-' : value}</h3>
          <p className={`text-[10px] font-medium leading-none truncate ${subtitleColor}`}>{subtitle}</p>
        </div>
      </div>
   );
}

function StatusBadge({ status }: { status: string }) {
    let borderClass = 'border-gray-500/20';
    let textClass = 'text-gray-400';
    let label = 'DESCONHECIDO';
    
    switch(status.toLowerCase()) {
      case 'pago':
      case 'paid': 
         borderClass = 'border-[#2ad271]/30';
         textClass = 'text-[#2ad271]';
         label = 'PAGO';
         break;
      case 'pendente':
      case 'pending': 
         borderClass = 'border-[#f8b63a]/30';
         textClass = 'text-[#f8b63a]';
         label = 'PENDENTE';
         break;
      case 'atrasado':
      case 'overdue': 
         borderClass = 'border-[#f04449]/30';
         textClass = 'text-[#f04449]';
         label = 'ATRASADO';
         break;
      case 'cancelado':
      case 'canceled': 
         borderClass = 'border-gray-500/30';
         textClass = 'text-gray-400';
         label = 'CANCELADO';
         break;
    }
    
    return (
        <span className={`inline-flex items-center justify-center min-w-[70px] px-2 py-1 rounded text-[9px] font-semibold tracking-wider border bg-transparent ${borderClass} ${textClass}`}>
           {label}
        </span>
    );
}




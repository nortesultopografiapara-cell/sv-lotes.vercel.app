'use client';

import { Banknote, Search, Download, Filter, TrendingDown, TrendingUp, AlertCircle, Loader2, Eye, CheckCircle, MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function FinancePage() {
  const { user, loading: authLoading } = useAuth();
  
  // States
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todas as Situações');
  const [projectFilter, setProjectFilter] = useState('Todos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsList, setProjectsList] = useState<string[]>([]);
  
  // Stats
  const [stats, setStats] = useState({
     recebidoMes: 0,
     aReceber: 0,
     vencidas: 0,
     vencendoHoje: 0,
     totalContratos: 0,
     inadimplencia: 0
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
        const pList = new Set<string>();

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
             
             // Extract project name for filters
             const projName = p.blocks?.projects?.name || 'Projeto Desconhecido';
             pList.add(projName);
             
             localTotal += amt;
             
             if (pStatus === 'pago' || pStatus === 'paid') {
                 const paidDate = p.paid_at ? new Date(p.paid_at) : dueDate;
                 if (paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear) {
                     localRecebido += amt;
                 }
             }
             
             if (pStatus === 'pendente' || pStatus === 'pending') {
                 localAReceber += amt;
                 if (dueStr === todayStr) {
                     localVencendoHoje += amt;
                 }
             }
             
             if (pStatus === 'atrasado' || pStatus === 'overdue' || ((pStatus === 'pendente' || pStatus === 'pending') && dueStr && dueStr < todayStr)) {
                 localVencidas += amt;
                 // It's overdue even if recorded as pending but Date passed
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
            totalContratos: localTotal,
            inadimplencia: inadimplencia
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
         
     const matchProject = projectFilter !== 'Todos' ? (p.blocks?.projects?.name === projectFilter) : true;
     
     const matchStartDate = startDate ? (p.due_date >= startDate) : true;
     const matchEndDate = endDate ? (p.due_date <= endDate) : true;
     
     return matchSearch && matchStatus && matchProject && matchStartDate && matchEndDate;
  });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };
  
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full bg-[var(--color-background)]">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Módulo Financeiro</h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            Gestão de Recebimentos e Inadimplência
          </p>
        </div>
        <button className="bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors">
          <Download className="w-5 h-5" />
          Exportar Relatório
        </button>
      </header>

      {/* Stats Cards (6 grids as requested) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard title="Recebido no Mês" value={formatCurrency(stats.recebidoMes)} icon={<TrendingUp className="w-4 h-4" />} colorClass="text-[var(--color-success)] bg-[var(--color-success)]/10" loading={loading} />
        <StatCard title="A Receber" value={formatCurrency(stats.aReceber)} icon={<Banknote className="w-4 h-4" />} colorClass="text-[var(--color-warning)] bg-[var(--color-warning)]/10" loading={loading} />
        <StatCard title="Parcelas Vencidas" value={formatCurrency(stats.vencidas)} icon={<TrendingDown className="w-4 h-4" />} colorClass="text-[var(--color-danger)] bg-[var(--color-danger)]/10" loading={loading} />
        <StatCard title="Vencendo Hoje" value={formatCurrency(stats.vencendoHoje)} icon={<AlertCircle className="w-4 h-4" />} colorClass="text-blue-500 bg-blue-500/10" loading={loading} />
        <StatCard title="Total em Contratos" value={formatCurrency(stats.totalContratos)} icon={<Banknote className="w-4 h-4" />} colorClass="text-[var(--color-primary)] bg-[var(--color-primary)]/10" loading={loading} />
        <StatCard title="Inadimplência" value={`${stats.inadimplencia.toFixed(1)}%`} icon={<AlertCircle className="w-4 h-4" />} colorClass="text-[var(--color-danger)] bg-[var(--color-danger)]/10" loading={loading} />
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex-1 flex flex-col overflow-hidden shadow-sm">
        
        {/* Filters */}
        <div className="p-4 border-b border-[var(--color-border)] flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
             <Search className="absolute left-3 top-2.5 w-4 h-4 text-[var(--color-text-muted)]" />
             <input 
               type="text" 
               placeholder="Buscar Cliente, Lote, Contrato..."
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]"
             />
          </div>
          <select 
             value={statusFilter}
             onChange={(e) => setStatusFilter(e.target.value)}
             className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
             <option>Todas as Situações</option>
             <option>Pago</option>
             <option>Pendente</option>
             <option>Atrasado</option>
             <option>Cancelado</option>
          </select>
          <select 
             value={projectFilter}
             onChange={(e) => setProjectFilter(e.target.value)}
             className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]">
             <option>Todos</option>
             {projectsList.map((p, idx) => <option key={idx} value={p}>{p}</option>)}
          </select>
          <div className="flex items-center gap-2">
             <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]" title="Data Inicial" />
             <span className="text-[var(--color-text-muted)]">-</span>
             <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]" title="Data Final" />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Contrato / Lote</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Cliente</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Projeto</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-center">Parcela</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">Vencimento</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-right">Valor Parcela</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-right">Valor Pago</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-center">Status</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                   <td colSpan={9} className="text-center p-12">
                      <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin mx-auto mb-4" />
                      <p className="text-sm font-medium text-[var(--color-text-muted)]">Carregando dados financeiros...</p>
                   </td>
                </tr>
              ) : filteredPayments.length > 0 ? (
                filteredPayments.map(p => {
                   const projectName = p.blocks?.projects?.name || 'Projeto?';
                   const blockName = p.blocks?.block_name || p.blocks?.name || 'Quadra?';
                   const lotNumber = p.blocks?.number || 'Lote?';
                   
                   const loteDesc = `Q.${blockName} L.${lotNumber}`;
                   const contractNo = p.sales?.contract_number || p.sales?.id?.split('-')[0].toUpperCase() || 'S/N';
                   
                   const clientName = p.customers?.name || p.sales?.clients?.full_name || 'Desconhecido';
                   const parcelInfo = `${p.installment_number || 1}`;
                   
                   // Determinate real status and values
                   const pStatusRaw = p.status?.toLowerCase() || 'pendente';
                   const dueStr = p.due_date?.split('T')[0];
                   const todayStr = new Date().toISOString().split('T')[0];
                   
                   let computedStatus = pStatusRaw;
                   if ((pStatusRaw === 'pendente' || pStatusRaw === 'pending') && dueStr && dueStr < todayStr) {
                       computedStatus = 'atrasado';
                   }
                   
                   const isPaid = computedStatus === 'pago' || computedStatus === 'paid';
                   const amount = Number(p.amount) || 0;
                   const paidAmount = isPaid ? amount : 0; // For now assuming full amount paid if 'pago'

                   return (
                      <tr key={p.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] transition-colors group">
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-bold text-white mb-0.5">{contractNo}</div>
                          <div className="text-[11px] text-[var(--color-text-muted)]">{loteDesc}</div>
                        </td>
                        <td className="px-4 py-3 font-medium text-sm text-white max-w-[200px] truncate" title={clientName}>
                          {clientName}
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                          {projectName}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="bg-[var(--color-background)] px-2 py-1 rounded text-xs text-[var(--color-text-muted)] font-mono border border-[var(--color-border)]">
                            {parcelInfo}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-white">
                          {dueStr ? new Date(dueStr + 'T12:00:00Z').toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm font-medium text-white text-right">
                          {formatCurrency(amount)}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm font-medium text-[var(--color-text-muted)] text-right">
                          {isPaid ? formatCurrency(paidAmount) : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={computedStatus} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button className="p-1.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded hover:text-white text-[var(--color-text-muted)] transition-colors" title="Ver detalhes">
                               <Eye className="w-4 h-4" />
                             </button>
                             {!isPaid && (
                               <button className="p-1.5 bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded hover:bg-[var(--color-success)]/20 text-[var(--color-success)] transition-colors" title="Registrar pagamento">
                                 <CheckCircle className="w-4 h-4" />
                               </button>
                             )}
                             {!isPaid && computedStatus === 'atrasado' && (
                                <button className="p-1.5 bg-green-500/10 border border-green-500/20 rounded hover:bg-green-500/20 text-green-500" title="Cobrar no WhatsApp">
                                   <MessageCircle className="w-4 h-4" />
                                </button>
                             )}
                          </div>
                        </td>
                      </tr>
                   );
                })
              ) : (
                <tr>
                   <td colSpan={9} className="py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                         <div className="w-16 h-16 bg-[var(--color-surface-bright)] rounded-full flex items-center justify-center mb-4">
                           <Banknote className="w-8 h-8 text-[var(--color-text-muted)]" />
                         </div>
                         <h3 className="text-white text-lg font-medium mb-2">Nenhum recebimento encontrado</h3>
                         <p className="text-[var(--color-text-muted)] text-sm max-w-sm text-center">
                           As vendas confirmadas e suas parcelas aparecerão aqui automaticamente.
                         </p>
                      </div>
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, colorClass, loading }: { title: string, value: string, icon: any, colorClass: string, loading: boolean }) {
   return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <p className="text-[9px] font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider leading-tight">{title}</p>
            <div className={`p-1.5 rounded-lg ${colorClass}`}>
              {icon}
            </div>
          </div>
          <h3 className="text-xl font-light text-white truncate" title={value}>{loading ? '-' : value}</h3>
      </div>
   );
}

function StatusBadge({ status }: { status: string }) {
    let s = 'bg-[var(--color-surface-dim)] text-[var(--color-text-muted)] border-[var(--color-border)]';
    let label = 'DESCONHECIDO';
    
    switch(status.toLowerCase()) {
      case 'pago':
      case 'paid': 
         s = 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20';
         label = 'PAGO';
         break;
      case 'pendente':
      case 'pending': 
         s = 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20';
         label = 'PENDENTE';
         break;
      case 'atrasado':
      case 'overdue': 
         s = 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/20';
         label = 'ATRASADO';
         break;
      case 'cancelado':
      case 'canceled': 
         s = 'bg-gray-500/10 text-gray-400 border-gray-500/20';
         label = 'CANCELADO';
         break;
    }
    
    return (
        <span className={`inline-flex items-center justify-center min-w-[70px] px-2 py-1 rounded text-[9px] font-mono font-bold tracking-wider border ${s}`}>
           {label}
        </span>
    );
}


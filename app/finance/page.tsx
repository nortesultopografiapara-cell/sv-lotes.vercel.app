// CORRIGINDO BUILD DA VERCEL - NOVO DEPLOY LIMPO
// VERCEL SYNC FORCE - FINANCE PAGE PREMIUM UPDATED
'use client';

import { Banknote, Search, Download, Filter, TrendingDown, TrendingUp, AlertCircle, Loader2, Eye, CheckCircle, MessageCircle, FileText, ChevronLeft, ChevronRight, BookOpen, Trash2, X, Bell, Wallet, PieChart } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function calculateFinancialTotals(receipts: any[], cashMvs: any[], comms: any[]) {
    let totalEntradas = 0;
    let totalSaidas = 0;

    const safeReceipts = receipts || [];
    const safeCash = cashMvs || [];
    const safeComms = comms || [];
    
    console.log("FINANCE_TOTALS_PAYMENTS_SOURCE", safeReceipts);
    console.log("FINANCE_TOTALS_CASH_MOVEMENTS_SOURCE", safeCash);
    console.log("FINANCE_TOTALS_COMMISSIONS_SOURCE", safeComms);

    // Recebimentos (Entradas)
    safeReceipts.forEach(r => {
        const status = r.status?.toLowerCase() || 'pendente';
        if (status === 'pago') {
           totalEntradas += Number(r.paid_amount) || Number(r.amount) || 0;
        }
    });

    // Movimentações Caixa (Entradas e Saídas)
    safeCash.forEach(c => {
        const status = c.status?.toLowerCase() || 'ativo';
        if (status !== 'estornado' && status !== 'cancelado' && status !== 'deleted') {
            const typeStr = (c.type || '').toLowerCase();
            const isSaidaStr = ['saida', 'saída', 'saida ', 'despesa', 'expense'].some(val => typeStr.includes(val));
            const isEntradaStr = typeStr.includes('entrada');
            
            if (isEntradaStr && !isSaidaStr && !c.finance_receipt_id) totalEntradas += Number(c.amount || 0);
            if (isSaidaStr) {
                totalSaidas += Number(c.amount || 0);
            }
        }
    });

    // Comissões (Saídas)
    safeComms.forEach(cm => {
        const cmStatus = cm.status?.toLowerCase() || 'pendente';
        const isCommPaid = ['pago', 'paga', 'paid', 'aprovado', 'aprovada'].includes(cmStatus);
        
        if (isCommPaid) {
            const hasCash = safeCash.some(c => {
                const status = c.status?.toLowerCase() || 'ativo';
                if (status === 'estornado' || status === 'cancelado' || status === 'deleted') return false;
                
                const typeStr = (c.type || '').toLowerCase();
                const isSaidaStr = ['saida', 'saída', 'saida ', 'despesa', 'expense'].some(val => typeStr.includes(val));
                
                const commDescMatch = Boolean(c.description?.toLowerCase().includes('comissão') || c.description?.toLowerCase().includes('comissao') || c.source === 'broker_commission');
                
                // Only consider it a duplicate if it matches the EXACT ids, OR if it has a matching reference, or matches sale/broker context
                const isMatchingContext = (c.sale_id && c.sale_id === cm.sale_id) || 
                                          (c.broker_id && c.broker_id === cm.broker_id) || 
                                          (c.reference_id && c.reference_id === cm.id) ||
                                          (c.finance_receipt_id === cm.id); // some edge cases 

                return isSaidaStr && 
                       ((c.category === 'Comissão' || c.category === 'Comissao') || commDescMatch) && 
                       (isMatchingContext || commDescMatch) && 
                       Math.abs(Number(c.amount) - Number(cm.amount)) < 1;
            });

            if (!hasCash) {
                totalSaidas += Number(cm.amount || 0);
            }
        }
    });
    
    console.log("FINANCE_TOTALS_RESULT", { totalEntradas, totalSaidas, saldoFinal: totalEntradas - totalSaidas });

    return { totalEntradas, totalSaidas, saldoFinal: totalEntradas - totalSaidas };
}

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
  const [financeProjects, setFinanceProjects] = useState<any[]>([]);
  
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
     qtyContracts: 0,
     qtyNext7Days: 0,
     qtyNoPaymentContracts: 0,
     entradasCaixa: 0,
     saidasCaixa: 0,
     saldoCaixa: 0
  });

  const [cashMovements, setCashMovements] = useState<any[]>([]);
  const [brokerCommissions, setBrokerCommissions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'parcelas'|'caixa'>('parcelas');
  const [showSaidaModal, setShowSaidaModal] = useState(false);
  const [saidaForm, setSaidaForm] = useState({
      category: 'Outros',
      description: '',
      amount: '',
      project_id: '',
      movement_date: new Date().toISOString().split('T')[0],
      comments: ''
  });

  const [showProjectReportModal, setShowProjectReportModal] = useState(false);
  const [prFilterProject, setPrFilterProject] = useState('Todos');
  const [prStartDate, setPrStartDate] = useState('');
  const [prEndDate, setPrEndDate] = useState('');
  const [prType, setPrType] = useState('Todos'); // 'Todos', 'Entradas', 'Saídas'
  const [prStatus, setPrStatus] = useState('Todos'); // 'Todos', 'Pago', 'Pendente', 'Estornado'
  const [isGeneratingPr, setIsGeneratingPr] = useState(false);


  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showNotifications, setShowNotifications] = useState(false);

  const [hiddenNotifications, setHiddenNotifications] = useState(false);
  const [tenantData, setTenantData] = useState<any>(null);

  useEffect(() => {
    async function loadTenant() {
      if (user?.tenant_id) {
         const { data } = await supabase.from('companies').select('*').eq('id', user.tenant_id).single();
         if (data) setTenantData(data);
      }
    }
    loadTenant();
  }, [user]);

  const loadFinance = async () => {
      if (!user) return;
      try {
        const resolvedTenantId = user.tenant_id || (user as any).company_id;
        
        let query = supabase
           .from('finance_receipts')
           .select(`
              *,
              customers!finance_receipts_customer_id_fkey(*),
              sales:sale_id(id, installments_count, projects(name), contracts(contract_number)),
              projects:project_id(*),
              blocks:block_id(*)
           `)
           .order('due_date', { ascending: true });
           
        if (user.role !== 'SUPER_ADMIN' && resolvedTenantId) {
           query = query.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
        } else if (user.role !== 'SUPER_ADMIN' && !resolvedTenantId) {
           setLoading(false);
           return;
        }
        
        let { data, error } = await query;
        console.log("FINANCE TENANT:", resolvedTenantId);
        console.log("FINANCE FETCH RESULT", data, error);
        
        if (error) {
            console.warn("ERRO JOIN FINANCE_RECEIPTS:", error);
            // Fallback to raw finance_receipts
            let fallbackQuery = supabase
                .from('finance_receipts')
                .select('*, customers!finance_receipts_customer_id_fkey(*), sales:sale_id(*), projects:project_id(*), blocks:block_id(*)')
                .order('due_date', { ascending: true });
            
            if (user.role !== 'SUPER_ADMIN' && resolvedTenantId) {
                fallbackQuery = fallbackQuery.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
            } else if (user.role !== 'SUPER_ADMIN' && !resolvedTenantId) {
                setLoading(false);
                return;
            }
            
            const fallbackRes = await fallbackQuery;
            data = fallbackRes.data;
            error = fallbackRes.error;
            console.log("FINANCE RAW FALLBACK:", data, error);
        }
        
        if (error) throw error;
        
        let pQuery = supabase.from('projects').select('id, name');
        if (user.role !== 'SUPER_ADMIN' && resolvedTenantId) {
            pQuery = pQuery.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
        }
        const { data: projData } = await pQuery;
        if (projData) {
            console.log('FINANCE_PROJECTS_LOADED_FOR_EXPENSE', projData.length);
            setFinanceProjects(projData);
        }
        
        let localRecebido = 0;
        let localAReceber = 0;
        let localVencidas = 0;
        let localVencendoHoje = 0;
        let localTotal = 0;
        
        let qtyLate = 0;
        let qtyDueToday = 0;
        let qtyNext7Days = 0;
        let qtyPending = 0;
        let pList = new Set<string>();
        let contractSet = new Set<string>();
        let paidContracts = new Set<string>();

        const today = new Date();
        today.setUTCHours(0,0,0,0);
        const todayStr = today.toISOString().split('T')[0];
        const todayTime = today.getTime();
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
             const projName = p.projects?.name || p.sales?.projects?.name || p.blocks?.projects?.name || 'Projeto Desconhecido';
             if (projName !== 'Projeto Desconhecido') pList.add(projName);
             
             localTotal += amt;
             
             let computedStatus = pStatus;
             if ((pStatus === 'pendente' || pStatus === 'pending') && dueStr && dueStr < todayStr) {
                 computedStatus = 'atrasado';
             }
             
             if (computedStatus === 'pago' || computedStatus === 'paid') {
                 if (p.sale_id) paidContracts.add(p.sale_id);
                 const paidDate = p.paid_at ? new Date(p.paid_at) : dueDate;
                 if (paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear) {
                     localRecebido += amt;
                 }
             }
             
             const isEntry = p.installment_number === 0 || p.installment_number === '0';
             
             if (computedStatus === 'pendente' || computedStatus === 'pending') {
                 localAReceber += amt;
                 if (!isEntry) qtyPending++;
                 if (dueStr === todayStr) {
                     localVencendoHoje += amt;
                     if (!isEntry) qtyDueToday++;
                 } else if (dueDate.getTime() > todayTime && dueDate.getTime() <= todayTime + 7*24*60*60*1000) {
                     if (!isEntry) qtyNext7Days++;
                 }
             }
             
             if (computedStatus === 'atrasado' || computedStatus === 'overdue') {
                 localVencidas += amt;
                 if (!isEntry) qtyLate++;
             }
          });
          
          setPayments(data);
          setProjectsList(projData ? projData.map((p: any) => p.name) : Array.from(pList));
        }
        
        let qtyNoPaymentContracts = 0;
        contractSet.forEach(c => {
           if (!paidContracts.has(c)) qtyNoPaymentContracts++;
        });
        
        const inadimplencia = localTotal > 0 ? (localVencidas / localTotal) * 100 : 0;
        
        // Fetch Cash Movements & Comissões to compute global stats
        let cashData: any[] = [];
        try {
           let queryCash = supabase.from('cash_movements')
               .select(`*, projects(name), sales(projects(name), contracts(contract_number)), contracts(projects(name), contract_number)`)
               .order('movement_date', { ascending: false });
               
           if (resolvedTenantId) {
               queryCash = queryCash.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
           }
           
           const { data: cData, error: cErr } = await queryCash;
           
           if (cErr) {
               console.error("ERRO JOIN CASH_MOVEMENTS", cErr);
               
               let fallbackQuery = supabase.from('cash_movements').select('*').order('movement_date', { ascending: false });
               if (resolvedTenantId) {
                   fallbackQuery = fallbackQuery.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
               }
               const { data: fallbackData } = await fallbackQuery;
               if (fallbackData) {
                   cashData = fallbackData;
                   setCashMovements(fallbackData);
               }
           } else if (cData) {
               cashData = cData;
               setCashMovements(cData);
           }
        } catch(eee) { console.error('Cash movements error', eee); }

        let commsData: any[] = [];
        try {
           let queryComms = supabase.from('broker_commissions').select('*, brokers:broker_id(*), sales:sale_id(*, projects(*), contracts(*)), contracts:contract_id(*, projects(*))');
           if (resolvedTenantId) {
               queryComms = queryComms.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
           }
           const { data: comms, error: commsErr } = await queryComms;
           if (commsErr) {
               console.error("ERRO JOIN BROKER_COMMISSIONS:", commsErr);
               // fallback to simple
               const { data: fallbackComms } = await supabase.from('broker_commissions').select('*').in('status', ['pago', 'paga', 'paid', 'aprovado', 'aprovada']).or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
               if (fallbackComms) {
                   commsData = fallbackComms;
                   setBrokerCommissions(fallbackComms);
               }
           } else if (comms) {
               // Only store paid ones for totals, but we could keep all. Wait, if we keep all, we can filter in calculateFinancialTotals!
               // Actually calculateFinancialTotals filters by status now. So let's store all.
               // Wait, the fallback filtered by status. If we store all, it's safer for PDF.
               commsData = comms;
               setBrokerCommissions(comms);
           }
        } catch(e){}

        const totals = calculateFinancialTotals(data || [], cashData, commsData);
        console.log("FINANCE_TOTAL_OUTCOMES_FINAL", totals.totalSaidas);

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
            qtyContracts: contractSet.size,
            qtyNext7Days,
            qtyNoPaymentContracts,
            entradasCaixa: totals.totalEntradas,
            saidasCaixa: totals.totalSaidas,
            saldoCaixa: totals.saldoFinal
        } as any);

      } catch(err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    if (!authLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadFinance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Client-side filtering
  const filteredPayments = payments.filter(p => {
     const computedContract = p.sales?.contracts?.[0]?.contract_number || (p.sales?.id ? 'CT-' + new Date(p.created_at || new Date()).getFullYear() + '-' + p.sales.id.substring(0, 6).toUpperCase() : 'CT-S/N');
     const computedProjName = p.projects?.name || p.sales?.projects?.name || p.blocks?.projects?.name || 'Projeto Desconhecido';

     const matchSearch = search ? (
         computedContract.toLowerCase().includes(search.toLowerCase()) || 
         p.sales?.id?.toLowerCase().includes(search.toLowerCase()) || 
         p.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
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
         
     const matchProject = projectFilter !== 'Todos os projetos' ? (computedProjName === projectFilter) : true;
     
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

  const handleMarkPaid = async (p: any) => {
    console.log('FINANCE MARK PAID', p);
    if (!window.confirm("Confirmar pagamento desta parcela?")) return;
    try {
      const { error } = await supabase
        .from('finance_receipts')
        .update({
          status: 'pago',
          paid_amount: p.amount,
          paid_at: new Date().toISOString()
        })
        .eq('id', p.id);
      if (error) throw error;
      
      const resolvedTenantId = user?.tenant_id || ((user as any)?.company_id);
      await supabase.from('cash_movements').insert({
          tenant_id: resolvedTenantId,
          company_id: resolvedTenantId,
          type: 'entrada',
          category: 'Venda de Lote',
          description: `Pagamento de Parcela ${p.installment_number || '1'} - CT ${p.sales?.contracts?.[0]?.contract_number || 'S/N'}`,
          amount: p.amount,
          customer_id: p.customer_id,
          sale_id: p.sale_id,
          finance_receipt_id: p.id,
          movement_date: new Date().toISOString().split('T')[0],
          created_by: user.id
      });
      
      await loadFinance();
      window.dispatchEvent(new Event('finance_updated'));
      alert("Pagamento registrado com sucesso!");
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar pagamento.");
    }
  };

  const handleDeleteReceipt = async (p: any) => {
    console.log('FINANCE DELETE RECEIPT', p);
    if (!window.confirm("Tem certeza que deseja excluir esta parcela? Essa ação não pode ser desfeita.")) return;
    try {
      let deleteQuery = supabase.from('finance_receipts').delete().eq('id', p.id);
      
      const resolvedTenantId = user?.tenant_id || (user as any)?.company_id;
      if (user?.role !== 'SUPER_ADMIN' && resolvedTenantId) {
        deleteQuery = deleteQuery.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
      } else if (user?.role !== 'SUPER_ADMIN' && !resolvedTenantId) {
        alert('Erro de segurança: Empresa não identificada.');
        return;
      }
      
      const { data, error } = await deleteQuery.select().single();
      if (error) {
        console.error('ERRO DELETE FINANCE_RECEIPTS:', error);
        alert('Erro ao excluir recebimento: ' + JSON.stringify(error));
        return;
      }
      if (!data) {
        alert('Nenhum recebimento foi excluído no banco. Verifique permissões (RLS) ou IDs.');
        return;
      }
      console.log('FINANCE DELETE RECEIPT OK:', data);
      
      setPayments(prev => prev.filter(r => r.id !== p.id));
      await loadFinance();
      window.dispatchEvent(new Event('finance_updated'));
      alert("Recebimento excluído com sucesso.");
    } catch (err: any) {
      console.error(err);
      alert("Erro ao excluir recebimento: " + (err?.message || JSON.stringify(err)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) {
      alert("Selecione ao menos um recebimento para excluir.");
      return;
    }
    if (!window.confirm("Deseja excluir todos os recebimentos pendentes deste cliente/lote usados em teste?")) return;
    try {
      const idsToDelete = Array.from(selectedIds);
      
      let deleteQuery = supabase.from('finance_receipts').delete().in('id', idsToDelete);
      
      const resolvedTenantId = user?.tenant_id || (user as any)?.company_id;
      if (user?.role !== 'SUPER_ADMIN' && resolvedTenantId) {
        deleteQuery = deleteQuery.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
      } else if (user?.role !== 'SUPER_ADMIN' && !resolvedTenantId) {
        alert('Erro de segurança: Empresa não identificada.');
        return;
      }

      const { data, error } = await deleteQuery.select();
      if (error) {
        console.error('ERRO DELETE FINANCE_RECEIPTS:', error);
        alert('Erro ao excluir recebimentos: ' + JSON.stringify(error));
        return;
      }
      if (!data || data.length === 0) {
        alert('Nenhum recebimento foi excluído no banco. Verifique RLS/policy ou IDs.');
        return;
      }
      console.log('FINANCE DELETE RECEIPTS OK:', data);
      
      setPayments(prev => prev.filter(r => !idsToDelete.includes(r.id)));
      setSelectedIds(new Set());
      await loadFinance();
      window.dispatchEvent(new Event('finance_updated'));
      alert(`${data.length} recebimento(s) excluído(s) com sucesso.`);
    } catch (err: any) {
      console.error(err);
      alert("Erro ao excluir recebimentos: " + (err?.message || JSON.stringify(err)));
    }
  };

  const handleWhatsApp = (p: any) => {
    console.log('FINANCE WHATSAPP', p);
    const phone = p.customers?.phone;
    if (!phone) {
      alert("Cliente sem telefone cadastrado.");
      return;
    }
    const blockName = p.blocks?.block_name || p.blocks?.name || '?';
    const lotNumber = p.blocks?.number || '?';
    const lotDesc = `QD ${blockName} LT ${lotNumber}`;
    const amountStr = formatCurrency(Number(p.amount) || 0);
    const dateStr = p.due_date ? new Date(p.due_date + 'T12:00:00Z').toLocaleDateString('pt-BR') : '';
    const msg = `Olá, ${p.customers?.name || 'Cliente'}. Identificamos uma parcela referente ao lote ${lotDesc}, no valor de ${amountStr}, com vencimento em ${dateStr}. Poderia verificar, por favor?`;
    window.open(`https://wa.me/55${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const prepareExportData = () => {
    return filteredPayments.map(p => {
       const contractNo = p.sales?.contracts?.[0]?.contract_number || (p.sales?.id ? 'CT-' + new Date(p.created_at || new Date()).getFullYear() + '-' + p.sales.id.substring(0, 6).toUpperCase() : 'CT-S/N');
       const client = p.customers?.name || 'Desconhecido';
       const doc = p.customers?.document || '-';
       const projName = p.projects?.name || p.sales?.projects?.name || p.blocks?.projects?.name || 'Projeto Desconhecido';
       const quadra = p.blocks?.block_name || p.blocks?.name || '?';
       const lote = String(p.blocks?.number || '?');
       const parcela = String(p.installment_number || 1);
       const vencimento = p.due_date ? new Date((p.due_date?.split('T')[0]) + 'T12:00:00Z').toLocaleDateString('pt-BR') : '-';
       const valor = Number(p.amount) || 0;
       
       const pStatusRaw = p.status?.toLowerCase() || 'pendente';
       const todayStr = new Date().toISOString().split('T')[0];
       let status = pStatusRaw;
       if ((status === 'pendente' || status === 'pending') && p.due_date && p.due_date.split('T')[0] < todayStr) status = 'atrasado';
       
       const isPaid = status === 'pago' || status === 'paid';
       const valorPago = isPaid ? (Number(p.paid_amount) || valor) : 0;
       const dataPgto = isPaid && p.paid_at ? new Date(p.paid_at).toLocaleDateString('pt-BR') : '-';
       
       return {
          'Contrato': contractNo,
          'Cliente': client,
          'CPF/CNPJ': doc,
          'Projeto': projName,
          'Quadra': quadra,
          'Lote': lote,
          'Parcela': parcela,
          'Vencimento': vencimento,
          'Valor Parcela': formatCurrency(valor),
          'Valor Pago': formatCurrency(valorPago),
          'Status': status.toUpperCase(),
          'Data Pagamento': dataPgto
       };
    });
  };

  const getSummaryData = () => {
     let qtyPaid = 0;
     let qtyPending = 0;
     let qtyLate = 0;
     let totalVendido = 0;
     let totalRecebido = 0;
     let totalAReceber = 0;
     let totalVencido = 0;

     filteredPayments.forEach(p => {
         const valor = Number(p.amount) || 0;
         const pStatusRaw = p.status?.toLowerCase() || 'pendente';
         const todayStr = new Date().toISOString().split('T')[0];
         let status = pStatusRaw;
         if ((status === 'pendente' || status === 'pending') && p.due_date && p.due_date.split('T')[0] < todayStr) status = 'atrasado';
         
         const isPaid = status === 'pago' || status === 'paid';
         const isLate = status === 'atrasado';
         const valorPago = isPaid ? (Number(p.paid_amount) || valor) : 0;

         totalVendido += valor;
         
         if (isPaid) {
            qtyPaid++;
            totalRecebido += valorPago;
         }
         else if (isLate) {
            qtyLate++;
            totalVencido += valor;
            totalAReceber += valor;
         }
         else {
            qtyPending++;
            totalAReceber += valor;
         }
     });

     const filteredCash = cashMovements.filter(c => {
         const mDateStr = (c.movement_date || c.created_at || '').split('T')[0];
         const cProjName = c.projects?.name || c.sales?.projects?.name || c.contracts?.projects?.name || 'Projeto Desconhecido';
         
         const matchProject = projectFilter !== 'Todos os projetos' ? (cProjName === projectFilter) : true;
         const matchStartDate = startDate ? (mDateStr >= startDate) : true;
         const matchEndDate = endDate ? (mDateStr <= endDate) : true;
         
         return matchProject && matchStartDate && matchEndDate;
     });

     const filteredComms = brokerCommissions.filter(c => {
         const cmProjName = c.sales?.projects?.name || c.contracts?.projects?.name || 'Projeto Desconhecido';
         const cDateStr = (c.paid_at || c.created_at || '').split('T')[0];
         
         const matchProject = projectFilter !== 'Todos os projetos' ? (cmProjName === projectFilter) : true;
         const matchStartDate = startDate ? (cDateStr >= startDate) : true;
         const matchEndDate = endDate ? (cDateStr <= endDate) : true;
         
         return matchProject && matchStartDate && matchEndDate;
     });

     const totals = calculateFinancialTotals(filteredPayments, filteredCash, filteredComms);

     return [
       { Descricao: 'Total Lançado (Previsto)', Valor: formatCurrency(totalVendido) },
       { Descricao: 'Total Entradas', Valor: formatCurrency(totals.totalEntradas) },
       { Descricao: 'Total Saídas', Valor: formatCurrency(totals.totalSaidas) },
       { Descricao: 'Saldo Final', Valor: formatCurrency(totals.saldoFinal) },
       { Descricao: 'Total a Receber', Valor: formatCurrency(totalAReceber) },
       { Descricao: 'Total Vencido', Valor: formatCurrency(totalVencido) },
       { Descricao: 'Qtd Parcelas Pagas', Valor: qtyPaid.toString() },
       { Descricao: 'Qtd Parcelas Pendentes', Valor: qtyPending.toString() },
       { Descricao: 'Qtd Parcelas Vencidas', Valor: qtyLate.toString() },
     ];
  };

  const handleRegistrarSaida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saidaForm.amount || Number(saidaForm.amount) <= 0) return alert('Valor inválido');
    
    try {
      const resolvedTenantId = user?.tenant_id || ((user as any)?.company_id);
      
      const payload: any = {
          tenant_id: resolvedTenantId,
          company_id: resolvedTenantId,
          type: 'saida',
          category: saidaForm.category,
          description: saidaForm.description,
          amount: parseFloat(saidaForm.amount),
          movement_date: saidaForm.movement_date,
          created_by: user?.id
      };
      
      if (saidaForm.project_id) {
          payload.project_id = saidaForm.project_id;
          const pName = financeProjects.find((p: any) => p.id === saidaForm.project_id)?.name;
          if (pName) payload.project_name = pName;
          console.log('EXPENSE_PROJECT_SELECTED', saidaForm.project_id);
      }
      
      const { error } = await supabase.from('cash_movements').insert(payload);
      
      if (saidaForm.project_id) {
          console.log('CASH_MOVEMENT_PROJECT_LINKED', saidaForm.project_id);
      }
      
      if (error) throw error;
      
      try {
         await supabase.from('audit_logs').insert([{
             tenant_id: resolvedTenantId,
             company_id: resolvedTenantId,
             user_id: user?.id,
             action: 'CASH_OUT_CREATED',
             module: 'FINANCE',
             description: `Saída de ${saidaForm.amount} - ${saidaForm.category}`
         }]);
      } catch(e) {}
      
      setShowSaidaModal(false);
      setSaidaForm({ category: 'Outros', description: '', amount: '', project_id: '', movement_date: new Date().toISOString().split('T')[0], comments: '' });
      await loadFinance();
      alert('Saída registrada com sucesso.');
    } catch(e: any) {
       console.error(e);
       alert('Erro ao registrar saída: ' + e.message);
    }
  };

  const handleGenerateCarne = async (p: any) => {
    console.log("FINANCE GENERATE CARNE", p);
    const doc = new jsPDF('portrait', 'pt', 'a4');
    
    // Set colors
    const primaryColor = [41, 128, 185];
    const secondaryColor = [52, 73, 94];

    let headerY = 40;

    // Header Logo/Company
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    const companyName = tenantData ? (tenantData.razao_social || tenantData.name).toUpperCase() : 'EMPRESA';
    doc.text(companyName, 40, headerY);

    if (tenantData?.cnpj) {
       doc.setFontSize(9);
       doc.setFont('helvetica', 'normal');
       doc.setTextColor(100);
       doc.text(`CNPJ: ${tenantData.cnpj}`, 40, headerY + 12);
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('CARNÊ DE PAGAMENTO', 400, headerY);

    doc.setDrawColor(200);
    doc.setLineWidth(1);
    doc.line(40, headerY + 30, 555, headerY + 30);

    // Info Sections Box
    let boxY = headerY + 50;

    doc.setFontSize(10);
    doc.setTextColor(0);

    const clientName = p.customers?.name || 'Cliente';
    const clientDoc = p.customers?.document || '-';
    const contractNo = p.sales?.contracts?.[0]?.contract_number || 'S/N';
    const blockName = p.blocks?.block_name || p.blocks?.name || '?';
    const lotNumber = p.blocks?.number || '?';
    const projectName = p.projects?.name || p.sales?.projects?.name || p.blocks?.projects?.name || '-';

    const pStatusRaw = p.status?.toLowerCase() || 'pendente';
    const dueStr = p.due_date?.split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    let computedStatus = pStatusRaw;
    if ((pStatusRaw === 'pendente' || pStatusRaw === 'pending') && dueStr && dueStr < todayStr) computedStatus = 'atrasado';
    
    const displayStatus = computedStatus === 'pago' || computedStatus === 'paid' ? 'PAGO' : (computedStatus === 'atrasado' ? 'ATRASADO' : 'PENDENTE');

    const amount = Number(p.amount) || 0;
    const dueDate = dueStr ? new Date(dueStr + 'T12:00:00Z').toLocaleDateString('pt-BR') : '-';

    const drawLabelValue = (x: number, y: number, label: string, value: string) => {
       doc.setFontSize(8);
       doc.setFont('helvetica', 'normal');
       doc.setTextColor(150);
       doc.text(label, x, y);
       doc.setFontSize(10);
       doc.setFont('helvetica', 'bold');
       doc.setTextColor(50);
       doc.text(value, x, y + 12);
    };

    drawLabelValue(40, boxY, "PAGADOR", clientName);
    drawLabelValue(300, boxY, "CPF/CNPJ", clientDoc);

    drawLabelValue(40, boxY + 35, "PROJETO", projectName);
    drawLabelValue(300, boxY + 35, "QD / LOTE", `QD ${blockName} - LT ${lotNumber}`);
    
    drawLabelValue(40, boxY + 70, "CONTRATO", contractNo);
    drawLabelValue(150, boxY + 70, "PARCELA", p.installment_number === 0 ? 'ENTRADA' : String(p.installment_number || 1));
    drawLabelValue(300, boxY + 70, "VENCIMENTO", dueDate);
    drawLabelValue(450, boxY + 70, "STATUS", displayStatus);

    // Box highlight
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(40, boxY + 110, 515, 60, 5, 5, 'FD');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text("VALOR DO DOCUMENTO:", 60, boxY + 130);
    
    doc.setFontSize(16);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(formatCurrency(amount), 60, boxY + 152);

    // Linha Digitavel Simulada
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    const barcode = `34191.09008 10738.905187 40016.908003 1 90000${amount.toFixed(2).replace('.','')}`;
    doc.text("CÓDIGO DE BARRAS / LINHA DIGITÁVEL PIX", 40, boxY + 210);
    doc.setFont('helvetica', 'bold');
    doc.text(barcode, 40, boxY + 225);

    // Barcode Simulado Graphic
    doc.setFillColor(0);
    for(let i=0; i<50; i++) {
       const w = Math.random() > 0.5 ? 2 : 4;
       doc.rect(40 + (i*6), boxY + 240, w, 30, 'F');
    }

    // Recibo
    doc.setLineDashPattern([5, 5], 0);
    doc.line(20, boxY + 310, 575, boxY + 310);
    doc.setLineDashPattern([], 0);

    const recY = boxY + 340;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text("RECIBO DO PAGADOR", 40, recY);

    drawLabelValue(40, recY + 30, "VALOR PAGO", "");
    drawLabelValue(150, recY + 30, "DATA PAGAMENTO", "");
    drawLabelValue(300, recY + 30, "AUTENTICAÇÃO MECÂNICA", "");
    
    doc.setDrawColor(200);
    doc.line(40, recY + 55, 120, recY + 55);
    doc.line(150, recY + 55, 250, recY + 55);
    doc.line(300, recY + 55, 500, recY + 55);

    doc.save(`Carne_${contractNo}_${dueDate.replace(/\//g,'')}.pdf`);
  };

  const handleExportExcel = async () => {
     const data = prepareExportData();
     const summary = getSummaryData();

     const ExcelJS = (await import('exceljs')).default;
     const workbook = new ExcelJS.Workbook();
     workbook.creator = user?.name || 'Sistema SV_LOTES';
     workbook.created = new Date();

     // === ABA 1: Relatório Completo ===
     const ws = workbook.addWorksheet('Relatório', { views: [{ state: 'frozen', ySplit: 6 }] });
     
     // Fetch Logo if exists
     if (tenantData?.logo_url) {
         try {
             const base64Image = await new Promise<string>((resolve, reject) => {
                 const img = new Image();
                 img.crossOrigin = 'Anonymous';
                 img.onload = () => {
                     const canvas = document.createElement('canvas');
                     canvas.width = img.width;
                     canvas.height = img.height;
                     const ctx = canvas.getContext('2d');
                     if (ctx) {
                         ctx.drawImage(img, 0, 0);
                         resolve(canvas.toDataURL('image/png'));
                     } else reject();
                 };
                 img.onerror = reject;
                 img.src = tenantData.logo_url;
             });
             const imageId = workbook.addImage({
                 base64: base64Image,
                 extension: 'png',
             });
             ws.addImage(imageId, {
                 tl: { col: 0, row: 0 },
                 ext: { width: 120, height: 60 }
             });
         } catch (e) {
             console.error("Error loading image for excel", e);
         }
     }

     const companyName = tenantData ? tenantData.razao_social || tenantData.name : 'Empresa não informada';
     const companyDoc = tenantData?.cnpj || 'CNPJ não informado';
     const infoLine = [
         tenantData?.email ? `Email: ${tenantData.email}` : null,
         tenantData?.phone ? `Tel: ${tenantData.phone}` : null,
         tenantData?.address ? `Endereço: ${tenantData.address}` : null
     ].filter(Boolean).join(' | ');

     // Cabeçalho
     ws.mergeCells('A1:L1');
     ws.getCell('A1').value = `RELATÓRIO FINANCEIRO - ${companyName.toUpperCase()}`;
     ws.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
     ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2980B9' } };
     ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
     ws.getRow(1).height = 40; // increase height to fit logo

     ws.mergeCells('A2:L2');
     ws.getCell('A2').value = `CNPJ: ${companyDoc} ${infoLine ? ' | ' + infoLine : ''}`;
     ws.getCell('A2').font = { size: 10, bold: true };
     ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };

     ws.mergeCells('A3:L3');
     ws.getCell('A3').value = `Data de emissão: ${new Date().toLocaleString('pt-BR')} | Filtros: Status = ${statusFilter} | Projeto = ${projectFilter}`;
     ws.getCell('A3').font = { size: 9 };
     ws.getCell('A3').alignment = { vertical: 'middle', horizontal: 'center' };

     ws.addRow([]);

     // Títulos das colunas
     const headers = ['Contrato', 'Cliente', 'Documento', 'Projeto', 'Quadra', 'Lote', 'Parcela', 'Vencimento', 'Valor Parcela', 'Valor Pago', 'Status', 'Data Pagamento'];
     const headerRow = ws.addRow(headers);
     
     headerRow.eachCell((cell) => {
         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34495E' } };
         cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
         cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
     });

     // Dados
     data.forEach(d => {
         const row = ws.addRow([d.Contrato, d.Cliente, d['CPF/CNPJ'], d.Projeto, d.Quadra, d.Lote, d.Parcela, d.Vencimento, d['Valor Parcela'], d['Valor Pago'], d.Status, d['Data Pagamento']]);
         
         const statusCell = row.getCell(11); // Status column K
         const statusStr = (d.Status || '').toUpperCase();
         if (statusStr === 'PAGO' || statusStr === 'PAID') {
             statusCell.font = { color: { argb: 'FF27AE60' }, bold: true }; // Green
         } else if (statusStr === 'ATRASADO' || statusStr === 'OVERDUE') {
             statusCell.font = { color: { argb: 'FFE74C3C' }, bold: true }; // Red
         } else {
             statusCell.font = { color: { argb: 'FFF39C12' }, bold: true }; // Orange
         }

         row.eachCell((cell) => {
             cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
         });
     });

     ws.columns = [
        { width: 15 }, { width: 35 }, { width: 20 }, { width: 25 }, { width: 10 }, { width: 10 },
        { width: 10 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
     ];

     // Ativar auto filter
     ws.autoFilter = 'A6:L6';

     // === ABA 2: Resumo Financeiro ===
     const wsSummary = workbook.addWorksheet('Resumo Financeiro');
     
     wsSummary.mergeCells('A1:B1');
     wsSummary.getCell('A1').value = 'RESUMO FINANCEIRO';
     wsSummary.getCell('A1').font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
     wsSummary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
     
     wsSummary.addRow([]);

     const sumHeader = wsSummary.addRow(['Descrição', 'Valor']);
     sumHeader.eachCell(cell => {
         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDC3C7' } };
         cell.font = { bold: true };
     });

     summary.forEach(s => {
         const row = wsSummary.addRow([s.Descricao, s.Valor]);
         row.eachCell(cell => {
             cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
         });
     });

     wsSummary.columns = [{ width: 30 }, { width: 20 }];

     // === ABA 3: Indicadores ===
     const wsInd = workbook.addWorksheet('Indicadores');
     
     wsInd.mergeCells('A1:B1');
     wsInd.getCell('A1').value = 'INDICADORES CHAVE';
     wsInd.getCell('A1').font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
     wsInd.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
     
     wsInd.addRow([]);

     const indHeader = wsInd.addRow(['Indicador', 'Valor']);
     indHeader.eachCell(cell => {
         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDC3C7' } };
         cell.font = { bold: true };
     });

     const indData = [
         ['Total Vendido (Contratos Ativos)', formatCurrency(stats.totalContratosValor)],
         ['Inadimplência (%)', `${stats.inadimplencia.toFixed(2)}%`],
         ['Contratos Ativos', stats.qtyContracts.toString()],
     ];

     indData.forEach(d => {
         const row = wsInd.addRow(d);
         row.eachCell(cell => {
             cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
         });
     });

     wsInd.columns = [{ width: 40 }, { width: 20 }];

     // === ABA 4: Fluxo de Caixa ===
     const wsCash = workbook.addWorksheet('Fluxo de Caixa');
     wsCash.mergeCells('A1:G1');
     wsCash.getCell('A1').value = 'HISTÓRICO FLUXO DE CAIXA';
     wsCash.getCell('A1').font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
     wsCash.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
     
     wsCash.addRow([]);
     const cashHeaders = ['Data', 'Tipo', 'Categoria', 'Loteamento', 'Descrição', 'Valor', 'Status'];
     const cashHeaderRow = wsCash.addRow(cashHeaders);
     cashHeaderRow.eachCell(cell => {
         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34495E' } };
         cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
     });
     
     cashMovements.forEach(c => {
        const row = wsCash.addRow([
           c.movement_date ? new Date(c.movement_date+'T12:00:00Z').toLocaleDateString('pt-BR') : '-',
           (c.type || '').toUpperCase(),
           c.category || '-',
           c.projects?.name || '-',
           c.description || '-',
           formatCurrency(c.amount),
           c.status || 'ativo'
        ]);
        
        const typeCell = row.getCell(2);
        if (c.type === 'entrada') typeCell.font = { color: { argb: 'FF27AE60' }, bold: true };
        if (c.type === 'saida') typeCell.font = { color: { argb: 'FFE74C3C' }, bold: true };
     });
     
     wsCash.columns = [{ width: 15 }, { width: 12 }, { width: 25 }, { width: 25 }, { width: 40 }, { width: 15 }, { width: 10 }];

     // Exportar
     const buffer = await workbook.xlsx.writeBuffer();
     const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
     const link = document.createElement('a');
     link.href = URL.createObjectURL(blob);
     link.download = `relatorio_financeiro_${new Date().getTime()}.xlsx`;
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  const prepareResumidoData = async () => {
    // Busca compacta agrupando lotes e somando faturamentos reais via map local.
    let query = supabase.from('blocks').select(`
      id,
      block_name,
      number,
      status,
      price,
      projects(name),
      sales(installments_count, down_payment, payment_type)
    `);

    if (user?.role !== 'SUPER_ADMIN' && user?.tenant_id) {
        query = query.eq('tenant_id', user.tenant_id);
    }
    
    const { data: blocks, error } = await query;
    if (error || !blocks) {
        console.error("Erro buscar resumido", error);
        return [];
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const filteredBlocks = blocks.filter(b => {
        if (projectFilter !== 'Todos os projetos') {
             const projName = b.projects?.name || 'Projeto Desconhecido';
             if (projName !== projectFilter) return false;
        }
        return true;
    });

    const processed = filteredBlocks.map(b => {
         const projName = b.projects?.name || 'Projeto Desconhecido';
         const quadra = b.block_name || '?';
         const lote = String(b.number || '?');
         const statusLote = (b.status || 'DISPONÍVEL').toUpperCase(); 
         
         const salesArr = (b.sales || []) as any[];
         const latestSale = salesArr.length > 0 ? salesArr[salesArr.length - 1] : null;
         
         const vlVenda = Number(b.price) || 0;
         const numParc = Number(latestSale?.installments_count) || 0;
         const vendaTipo = (numParc <= 1 && latestSale?.payment_type !== 'INSTALLMENT') ? 'À Vista' : 'Parcelado';
         const entrada = Number(latestSale?.down_payment) || 0;
         
         const receipts = payments.filter(p => p.block_id === b.id || p.blocks?.id === b.id);
         
         let recebido = 0;
         let receber = 0;
         let atraso = 0;
         
         receipts.forEach(r => {
             const rStatus = r.status?.toLowerCase() || 'pendente';
             const isPaid = rStatus === 'pago' || rStatus === 'paid';
             let isLate = false;
             if (!isPaid && r.due_date) {
                 if (r.due_date.split('T')[0] < todayStr) isLate = true;
             }
             const amt = Number(r.amount) || 0;
             const pAmt = Number(r.paid_amount) || amt;

             if (isPaid) recebido += pAmt;
             else receber += amt;
             
             if (isLate) atraso += amt;
         });

         return {
            Projeto: projName,
            Quadra: quadra,
            Lote: lote,
            Status: statusLote,
            Venda: statusLote === 'VENDIDO' ? vendaTipo : '-',
            Entrada: statusLote === 'VENDIDO' ? (entrada > 0 ? formatCurrency(entrada) : '-') : '-',
            Parc: statusLote === 'VENDIDO' ? numParc.toString() : '-',
            Vl_Parc: statusLote === 'VENDIDO' && numParc > 0 ? formatCurrency(vlVenda/numParc) : '-',
            Recebido: statusLote === 'VENDIDO' ? formatCurrency(recebido) : '-',
            Receber: statusLote === 'VENDIDO' ? formatCurrency(receber) : '-',
            Atraso: statusLote === 'VENDIDO' ? formatCurrency(atraso) : '-',
            _raw: {
                vlVenda: statusLote === 'VENDIDO' ? vlVenda : 0,
                recebido: statusLote === 'VENDIDO' ? recebido : 0,
                receber: statusLote === 'VENDIDO' ? receber : 0,
                atraso: statusLote === 'VENDIDO' ? atraso : 0,
                status: statusLote
            }
         };
    });

    processed.sort((a, b) => {
        if (a.Projeto !== b.Projeto) return a.Projeto.localeCompare(b.Projeto);
        const aq = parseInt(a.Quadra) || 0;
        const bq = parseInt(b.Quadra) || 0;
        if (aq !== bq) return aq - bq;
        if (a.Quadra !== b.Quadra) return a.Quadra.localeCompare(b.Quadra);
        const aNum = parseInt(a.Lote) || 0;
        const bNum = parseInt(b.Lote) || 0;
        if (aNum !== bNum) return aNum - bNum;
        return a.Lote.localeCompare(b.Lote);
    });

    return processed;
  };

  const handleExportResumidoPDF = async () => {
       const data = await prepareResumidoData();
       if (!data || data.length === 0) {
           alert("Nenhum dado encontrado para exportar.");
           return;
       }
       
       const doc = new jsPDF('landscape');
       const companyName = tenantData ? tenantData.razao_social || tenantData.name : 'Empresa não informada';
       const companyDoc = tenantData?.cnpj || 'CNPJ não informado';
       const infoLine = [
          tenantData?.email ? `Email: ${tenantData.email}` : null,
          tenantData?.phone ? `Tel: ${tenantData.phone}` : null,
          tenantData?.address ? `Endereço: ${tenantData.address}` : null
       ].filter(Boolean).join(' | ');

       const title = `RELATÓRIO RESUMIDO`;
       let startY = 35;
       
       if (tenantData?.logo_url) {
          try {
              const imgBase64 = await new Promise<string>((resolve, reject) => {
                  const img = new Image();
                  img.crossOrigin = 'Anonymous';
                  img.onload = () => {
                      const canvas = document.createElement('canvas');
                      canvas.width = img.width;
                      canvas.height = img.height;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                          ctx.drawImage(img, 0, 0);
                          resolve(canvas.toDataURL('image/png'));
                      } else reject();
                  };
                  img.onerror = reject;
                  img.src = tenantData.logo_url;
              });
              doc.addImage(imgBase64, 'PNG', 14, 10, 30, 15, undefined, 'FAST');
              doc.setFontSize(14); doc.setTextColor(40); doc.text(title, 50, 15);
              doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(60); doc.text(companyName.toUpperCase(), 50, 20);
              doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
              doc.text(`CNPJ: ${companyDoc} ${infoLine ? ' | ' + infoLine : ''}`, 50, 24);
              doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}  |  Filtros: ${projectFilter}`, 50, 28);
          } catch(e) {
              doc.setFontSize(14); doc.setTextColor(40); doc.text(title, 14, 15);
              doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(60); doc.text(companyName.toUpperCase(), 14, 20);
              doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
              doc.text(`CNPJ: ${companyDoc} ${infoLine ? ' | ' + infoLine : ''}`, 14, 24);
              doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}  |  Filtros: ${projectFilter}`, 14, 28);
          }
       } else {
          doc.setFontSize(14); doc.setTextColor(40); doc.text(title, 14, 15);
          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(60); doc.text(companyName.toUpperCase(), 14, 20);
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
          doc.text(`CNPJ: ${companyDoc} ${infoLine ? ' | ' + infoLine : ''}`, 14, 24);
          doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}  |  Filtros: ${projectFilter}`, 14, 28);
       }

       const groupedData: any = {};
       data.forEach(d => {
           const key = `${d.Projeto} - Quadra ${d.Quadra}`;
           if (!groupedData[key]) groupedData[key] = { items: [], stats: { total: 0, vendidos: 0, reservados: 0, disponiveis: 0, recebido: 0, receber: 0, atraso: 0 }};
           groupedData[key].items.push(d);
           groupedData[key].stats.total++;
           if (d.Status === 'VENDIDO') groupedData[key].stats.vendidos++;
           else if (d.Status === 'RESERVADO') groupedData[key].stats.reservados++;
           else groupedData[key].stats.disponiveis++;
           groupedData[key].stats.recebido += d._raw.recebido;
           groupedData[key].stats.receber += d._raw.receber;
           groupedData[key].stats.atraso += d._raw.atraso;
       });

       let currentY = startY;
       
       Object.keys(groupedData).forEach((groupName, i) => {
           const group = groupedData[groupName];
           
           if (currentY > 170) {
              doc.addPage();
              currentY = 20;
           }
           
           doc.setFontSize(10);
           doc.setFont('helvetica', 'bold');
           doc.setTextColor(52, 73, 94);
           doc.text(groupName, 14, currentY);
           currentY += 5;

           autoTable(doc, {
               startY: currentY,
               head: [['LT', 'STATUS', 'VENDA', 'ENTRADA', 'PARC', 'VL PARC', 'RECEBIDO', 'RECEBER', 'ATRASO']],
               body: group.items.map((d: any) => [d.Lote, d.Status, d.Venda, d.Entrada, d.Parc, d.Vl_Parc, d.Recebido, d.Receber, d.Atraso]),
               styles: { fontSize: 7, cellPadding: 1.5 },
               headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
               alternateRowStyles: { fillColor: [245, 247, 250] },
               didParseCell: function(dataObj) {
                   if (dataObj.section === 'body' && dataObj.column.index === 1) {
                      const status = dataObj.cell.raw as string;
                      if (status === 'VENDIDO') dataObj.cell.styles.textColor = [231, 76, 60]; 
                      else if (status === 'RESERVADO') dataObj.cell.styles.textColor = [243, 156, 18]; 
                      else if (status === 'DISPONÍVEL') dataObj.cell.styles.textColor = [39, 174, 96]; 
                      dataObj.cell.styles.fontStyle = 'bold';
                   }
               },
               didDrawPage: (dataObj) => {
                   doc.setFontSize(8); doc.setTextColor(150);
                   let pageSize = doc.internal.pageSize;
                   let pageHeight = pageSize.height ? pageSize.height : (pageSize as any).getHeight();
                   const footerText = `Gerado automaticamente por SV LOTES GIS | Usuário: ${user?.name || 'Admin'} | Emitido em: ${new Date().toLocaleString('pt-BR')}`;
                   doc.text(footerText, 14, pageHeight - 10);
                   let str = 'Página ' + (doc.internal as any).getNumberOfPages();
                   doc.text(str, pageSize.width - 30, pageHeight - 10);
               }
           });
           
           currentY = (doc as any).lastAutoTable.finalY + 3;
           
           doc.setFontSize(8);
           doc.setFont('helvetica', 'normal');
           doc.setTextColor(80);
           const sumText = `Lotes: ${group.stats.total} | Vendidos: ${group.stats.vendidos} | Reservados: ${group.stats.reservados} | Disponíveis: ${group.stats.disponiveis}  ***  Recebido: ${formatCurrency(group.stats.recebido)} | Receber: ${formatCurrency(group.stats.receber)} | Atraso: ${formatCurrency(group.stats.atraso)}`;
           doc.text(sumText, 14, currentY);
           
           currentY += 10;
       });

       doc.save(`relatorio_resumido_${new Date().getTime()}.pdf`);
  };

  const handleExportResumidoExcel = async () => {
     const data = await prepareResumidoData();
     if (!data || data.length === 0) {
         alert("Nenhum dado encontrado para exportar.");
         return;
     }

     const ExcelJS = (await import('exceljs')).default;
     const workbook = new ExcelJS.Workbook();
     workbook.creator = user?.name || 'Sistema SV_LOTES';
     workbook.created = new Date();

     // === ABA 1: Resumo (Lista) ===
     const ws = workbook.addWorksheet('Resumo', { views: [{ state: 'frozen', ySplit: 6 }] });
     
     if (tenantData?.logo_url) {
         try {
             const base64Image = await new Promise<string>((resolve, reject) => {
                 const img = new Image();
                 img.crossOrigin = 'Anonymous';
                 img.onload = () => {
                     const canvas = document.createElement('canvas');
                     canvas.width = img.width; canvas.height = img.height;
                     const ctx = canvas.getContext('2d');
                     if (ctx) { ctx.drawImage(img, 0, 0); resolve(canvas.toDataURL('image/png')); } else reject();
                 };
                 img.onerror = reject; img.src = tenantData.logo_url;
             });
             const imageId = workbook.addImage({ base64: base64Image, extension: 'png' });
             ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 60 } });
         } catch (e) {}
     }

     const companyName = tenantData ? tenantData.razao_social || tenantData.name : 'Empresa não informada';
     const companyDoc = tenantData?.cnpj || 'CNPJ não informado';
     const infoLine = [
         tenantData?.email ? `Email: ${tenantData.email}` : null,
         tenantData?.phone ? `Tel: ${tenantData.phone}` : null,
         tenantData?.address ? `Endereço: ${tenantData.address}` : null
     ].filter(Boolean).join(' | ');

     ws.mergeCells('A1:K1');
     ws.getCell('A1').value = `RELATÓRIO RESUMIDO - ${companyName.toUpperCase()}`;
     ws.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
     ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2980B9' } };
     ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
     ws.getRow(1).height = 40; 

     ws.mergeCells('A2:K2'); ws.getCell('A2').value = `CNPJ: ${companyDoc} ${infoLine ? ' | ' + infoLine : ''}`; ws.getCell('A2').font = { size: 10, bold: true }; ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
     ws.mergeCells('A3:K3'); ws.getCell('A3').value = `Data de emissão: ${new Date().toLocaleString('pt-BR')} | Filtros: ${projectFilter}`; ws.getCell('A3').font = { size: 9 }; ws.getCell('A3').alignment = { vertical: 'middle', horizontal: 'center' };
     ws.addRow([]);

     const headers = ['Projeto', 'QD', 'LT', 'STATUS', 'VENDA', 'ENTRADA', 'PARC', 'VL PARC', 'RECEBIDO', 'RECEBER', 'ATRASO'];
     const headerRow = ws.addRow(headers);
     
     headerRow.eachCell((cell) => {
         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34495E' } };
         cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
         cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
     });

     data.forEach(d => {
         const row = ws.addRow([d.Projeto, d.Quadra, d.Lote, d.Status, d.Venda, d.Entrada, d.Parc, d.Vl_Parc, d.Recebido, d.Receber, d.Atraso]);
         
         const statusCell = row.getCell(4); 
         if (d.Status === 'VENDIDO') statusCell.font = { color: { argb: 'FFE74C3C' }, bold: true }; 
         else if (d.Status === 'RESERVADO') statusCell.font = { color: { argb: 'FFF39C12' }, bold: true }; 
         else if (d.Status === 'DISPONÍVEL') statusCell.font = { color: { argb: 'FF27AE60' }, bold: true }; 

         row.eachCell((cell) => {
             cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
         });
     });

     ws.columns = [
        { width: 25 }, { width: 10 }, { width: 10 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }
     ];
     ws.autoFilter = 'A6:K6';

     // === ABA 2: Totais ===
     const wsTot = workbook.addWorksheet('Totais');
     wsTot.mergeCells('A1:G1');
     wsTot.getCell('A1').value = 'TOTAIS POR QUADRA';
     wsTot.getCell('A1').font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
     wsTot.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
     
     const totHead = wsTot.addRow(['Projeto', 'Quadra', 'Lotes', 'Vendidos', 'Recebido', 'Receber', 'Atraso']);
     totHead.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDC3C7' } }; c.font = { bold: true }; });

     const groupedData: any = {};
     data.forEach(d => {
         const key = `${d.Projeto} - ${d.Quadra}`;
         if (!groupedData[key]) groupedData[key] = { proj: d.Projeto, quad: d.Quadra, loc: 0, v: 0, r1: 0, r2: 0, a: 0 };
         groupedData[key].loc++;
         if (d.Status === 'VENDIDO') groupedData[key].v++;
         groupedData[key].r1 += d._raw.recebido;
         groupedData[key].r2 += d._raw.receber;
         groupedData[key].a += d._raw.atraso;
     });

     Object.values(groupedData).forEach((g: any) => {
         const row = wsTot.addRow([g.proj, g.quad, g.loc, g.v, formatCurrency(g.r1), formatCurrency(g.r2), formatCurrency(g.a)]);
         row.eachCell(c => { c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
     });
     wsTot.columns = [{ width: 25 }, { width: 15 }, { width: 10 }, { width: 10 }, { width: 15 }, { width: 15 }, { width: 15 }];

     const buffer = await workbook.xlsx.writeBuffer();
     const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
     const link = document.createElement('a');
     link.href = URL.createObjectURL(blob);
     link.download = `relatorio_resumido_${new Date().getTime()}.xlsx`;
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  const handleExportPDF = async () => {
      const data = prepareExportData();
      const summary = getSummaryData();
      const doc = new jsPDF('landscape');
      
      const companyName = tenantData ? tenantData.razao_social || tenantData.name : 'Empresa não informada';
      const companyDoc = tenantData?.cnpj || 'CNPJ não informado';
      const infoLine = [
         tenantData?.email ? `Email: ${tenantData.email}` : null,
         tenantData?.phone ? `Tel: ${tenantData.phone}` : null,
         tenantData?.address ? `Endereço: ${tenantData.address}` : null
      ].filter(Boolean).join(' | ');

      const title = `RELATÓRIO FINANCEIRO`;
      
      let startY = 35;
      
      // Try to load logo
      if (tenantData?.logo_url) {
         try {
             const imgBase64 = await new Promise<string>((resolve, reject) => {
                 const img = new Image();
                 img.crossOrigin = 'Anonymous';
                 img.onload = () => {
                     const canvas = document.createElement('canvas');
                     canvas.width = img.width;
                     canvas.height = img.height;
                     const ctx = canvas.getContext('2d');
                     if (ctx) {
                         ctx.drawImage(img, 0, 0);
                         resolve(canvas.toDataURL('image/png'));
                     } else reject();
                 };
                 img.onerror = reject;
                 img.src = tenantData.logo_url;
             });
             doc.addImage(imgBase64, 'PNG', 14, 10, 30, 15, undefined, 'FAST');
             
             doc.setFontSize(14);
             doc.setTextColor(40);
             doc.text(title, 50, 15);
             
             doc.setFontSize(9);
             doc.setFont('helvetica', 'bold');
             doc.setTextColor(60);
             doc.text(companyName.toUpperCase(), 50, 20);
             
             doc.setFontSize(8);
             doc.setFont('helvetica', 'normal');
             doc.setTextColor(100);
             doc.text(`CNPJ: ${companyDoc} ${infoLine ? ' | ' + infoLine : ''}`, 50, 24);
             doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}  |  Filtros: ${statusFilter}, ${projectFilter}`, 50, 28);
             
         } catch(e) {
             // Fallback if logo fails
             doc.setFontSize(14);
             doc.setTextColor(40);
             doc.text(title, 14, 15);
             doc.setFontSize(9);
             doc.setFont('helvetica', 'bold');
             doc.setTextColor(60);
             doc.text(companyName.toUpperCase(), 14, 20);
             doc.setFontSize(8);
             doc.setFont('helvetica', 'normal');
             doc.setTextColor(100);
             doc.text(`CNPJ: ${companyDoc} ${infoLine ? ' | ' + infoLine : ''}`, 14, 24);
             doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}  |  Filtros: ${statusFilter}, ${projectFilter}`, 14, 28);
         }
      } else {
         doc.setFontSize(14);
         doc.setTextColor(40);
         doc.text(title, 14, 15);
         doc.setFontSize(9);
         doc.setFont('helvetica', 'bold');
         doc.setTextColor(60);
         doc.text(companyName.toUpperCase(), 14, 20);
         doc.setFontSize(8);
         doc.setFont('helvetica', 'normal');
         doc.setTextColor(100);
         doc.text(`CNPJ: ${companyDoc} ${infoLine ? ' | ' + infoLine : ''}`, 14, 24);
         doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}  |  Filtros: ${statusFilter}, ${projectFilter}`, 14, 28);
      }

      autoTable(doc, {
          startY: startY,
          head: [['Contrato', 'Cliente', 'Documento', 'Projeto', 'Quadra', 'Lote', 'Parcela', 'Vencimento', 'Valor Parcela', 'Valor Pago', 'Status', 'Data Pagamento']],
          body: data.map(d => [d.Contrato, d.Cliente, d['CPF/CNPJ'], d.Projeto, d.Quadra, d.Lote, d.Parcela, d.Vencimento, d['Valor Parcela'], d['Valor Pago'], d.Status, d['Data Pagamento']]),
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          didParseCell: function(dataObj) {
              if (dataObj.section === 'body' && dataObj.column.index === 10) {
                 const status = dataObj.cell.raw as string;
                 if (status === 'PAGO' || status === 'PAID') {
                     dataObj.cell.styles.textColor = [39, 174, 96]; // Green
                     dataObj.cell.styles.fontStyle = 'bold';
                 } else if (status === 'ATRASADO' || status === 'OVERDUE') {
                     dataObj.cell.styles.textColor = [231, 76, 60]; // Red
                     dataObj.cell.styles.fontStyle = 'bold';
                 } else {
                     dataObj.cell.styles.textColor = [243, 156, 18]; // Orange/Yellow
                     dataObj.cell.styles.fontStyle = 'bold';
                 }
              }
          },
          didDrawPage: (dataObj) => {
              // Footer
              doc.setFontSize(8);
              doc.setTextColor(150);
              let pageSize = doc.internal.pageSize;
              let pageHeight = pageSize.height ? pageSize.height : (pageSize as any).getHeight();
              
              const footerText = `Gerado automaticamente por SV LOTES GIS | Usuário: ${user?.name || 'Admin'} | Emitido em: ${new Date().toLocaleString('pt-BR')}`;
              doc.text(footerText, 14, pageHeight - 10);
              
              let str = 'Página ' + (doc.internal as any).getNumberOfPages();
              doc.text(str, pageSize.width - 30, pageHeight - 10);
          }
      });
      
      // Calculate summary StartY
      let finalY = (doc as any).lastAutoTable.finalY + 10;
      
      // Prevent summary splitting at extreme end
      let pageSize = doc.internal.pageSize;
      let pageHeight = pageSize.height ? pageSize.height : (pageSize as any).getHeight();
      if (finalY > pageHeight - 40) {
          doc.addPage();
          finalY = 20;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40);
      doc.text('RESUMO FINANCEIRO', 14, finalY);

      autoTable(doc, {
          startY: finalY + 5,
          head: [['Descrição', 'Valor']],
          body: summary.map(s => [s.Descricao, s.Valor]),
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: [52, 73, 94], textColor: 255 },
          alternateRowStyles: { fillColor: [245, 247, 250] },
          margin: { right: 150 } // prevent taking full width
      });
      
      // AutoTable 3: Fluxo de Caixa
      if (cashMovements && cashMovements.length > 0) {
          doc.addPage();
          doc.setFontSize(14);
          doc.setTextColor(40);
          doc.text("HISTÓRICO DE CAIXA", 14, 20);
          
          autoTable(doc, {
              startY: 30,
              head: [['Data', 'Tipo', 'Categoria', 'Loteamento', 'Descrição', 'Valor', 'Status']],
              body: cashMovements.map(c => [
                  c.movement_date ? new Date(c.movement_date+'T12:00:00Z').toLocaleDateString('pt-BR') : '-',
                  (c.type || '').toUpperCase(),
                  c.category || '-',
                  c.projects?.name || '-',
                  c.description || '-',
                  formatCurrency(c.amount),
                  c.status || 'Ativo'
              ]),
              styles: { fontSize: 8, cellPadding: 2 },
              headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold' },
              didParseCell: function(dataObj) {
                  if (dataObj.section === 'body' && dataObj.column.index === 1) {
                     const type = dataObj.cell.raw as string;
                     if (type === 'ENTRADA') dataObj.cell.styles.textColor = [39, 174, 96];
                     if (type === 'SAÍDA' || type === 'SAIDA') dataObj.cell.styles.textColor = [231, 76, 60];
                     dataObj.cell.styles.fontStyle = 'bold';
                  }
              }
          });
      }

      doc.save(`relatorio_financeiro_${new Date().getTime()}.pdf`);
  };

  const handleGenerateProjectReport = async (format: 'pdf'|'excel') => {
      setIsGeneratingPr(true);
      try {
          console.log("FLOW_PROJECT_SELECTED", prFilterProject);
          const resolvedTenantId = user?.tenant_id || ((user as any)?.company_id);
          
          let startDate = prStartDate ? new Date(prStartDate + 'T00:00:00Z') : null;
          let endDate = prEndDate ? new Date(prEndDate + 'T23:59:59Z') : null;

          console.log("FLOW_CARD_SOURCE_ENTRIES", payments);
          console.log("FLOW_CARD_SOURCE_OUTCOMES", cashMovements);

          // 1. Entradas (finance_receipts)
          const mappedPayments = payments.map(p => {
              const pStatus = p.status?.toLowerCase() || 'pendente';
              const amt = Number(p.paid_amount) || Number(p.amount) || 0;
              
              let status = pStatus;
              if (status === 'pago' || status === 'paid') status = 'Pago';
              else if (status === 'pendente' || status === 'pending') status = 'Pendente';
              else status = 'Estornado';
              
              const projName = p.projects?.name || p.sales?.projects?.name || p.blocks?.projects?.name || 'Geral/Outros';
              const dDate = new Date(p.paid_at || p.due_date || p.created_at);
              
              const contratoNum = p.contracts?.contract_number || p.contracts?.number || p.contracts?.code || p.contracts?.id || 
                                  p.sales?.contracts?.contract_number || p.sales?.contracts?.number || p.sales?.contracts?.code || p.sales?.contracts?.id || '-';

              return {
                  id_check: `rec_${p.id}`,
                  data: dDate,
                  projeto: projName,
                  tipo: 'Entrada', // finance receipts are Entradas
                  categoria: p.installment_number === 0 || p.installment_number === '0' ? 'Sinal/Entrada' : 'Parcela',
                  cliente: p.customers?.name || p.customers?.full_name || 'NI',
                  corretor: p.brokers?.name || 'NI',
                  contrato: contratoNum,
                  quadra: p.blocks?.block_name || p.blocks?.name || '-',
                  lote: p.blocks?.number || '-',
                  descricao: p.description || `Parcela ${p.installment_number || '1'}`,
                  valor: amt,
                  status: status
              };
          });
          
          // Fetch comissoes beforehand to cross reference cash movements
          let commQuery = supabase.from('broker_commissions').select('*, brokers:broker_id(*), sales:sale_id(*, contracts(*), projects(*)), contracts:contract_id(*, projects(*))');
          if (resolvedTenantId) {
             commQuery = commQuery.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
          }
          const { data: comms, error: commsErr } = await commQuery;
          if (commsErr) {
              console.error("FLOW_REPORT_COMMS_ERROR", commsErr);
          }

          // 2. Caixas (cash_movements)
          console.log("FLOW_OUTCOMES_FOUND", cashMovements.filter(c => c.type === 'saida'));
          
          const mappedCashMovements = cashMovements.filter(c => !c.finance_receipt_id).map(c => {
              let status = c.status === 'ativo' ? 'Pago' : 'Estornado';
              
              const tipoStr = (c.type || '').toLowerCase();
              const isSaidaStr = ['saida', 'saída', 'saida ', 'despesa', 'expense', 'commission', 'comissao', 'comissão'].some(val => tipoStr.includes(val));
              const type = isSaidaStr ? 'Saída' : (tipoStr.includes('entrada') ? 'Entrada' : 'Saída');
              
              let projName = c.projects?.name || c.sales?.projects?.name || c.contracts?.projects?.name;
              
              let contractName = c.contracts?.contract_number || c.contracts?.number || c.contracts?.code || c.contracts?.id || 
                                 c.sales?.contracts?.contract_number || c.sales?.contracts?.number || c.sales?.contracts?.code || c.sales?.contracts?.id || '-';
              
              // Cross-reference with broker_commissions to find the project if missing
              if (!projName && (c.category === 'Comissão' || c.category === 'Comissao' || isSaidaStr) && comms) {
                  const matchingComm = comms.find(cm => (c.sale_id === cm.sale_id || c.broker_id === cm.broker_id) && Math.abs(c.amount - cm.amount) < 1);
                  if (matchingComm) {
                      projName = matchingComm.sales?.projects?.name || matchingComm.contracts?.projects?.name;
                      contractName = matchingComm.sales?.contracts?.contract_number || matchingComm.sales?.contracts?.number || matchingComm.sales?.contracts?.code || matchingComm.sales?.contracts?.id ||
                                     matchingComm.contracts?.contract_number || matchingComm.contracts?.number || matchingComm.contracts?.code || matchingComm.contracts?.id || contractName;
                  }
              }
              
              if (!projName) projName = 'Geral/Outros';

              const mDate = new Date(c.movement_date || c.created_at);
              
              return {
                  id_check: `cash_${c.id}`,
                  data: mDate,
                  projeto: projName,
                  tipo: type,
                  categoria: c.category || '-',
                  cliente: c.customers?.name || '-',
                  corretor: c.brokers?.name || '-',
                  contrato: contractName,
                  quadra: '-',
                  lote: '-',
                  descricao: c.description || '-',
                  valor: Number(c.amount) || 0,
                  status: status
              };
          });
          
          let movements = [...mappedPayments, ...mappedCashMovements];
          console.log('FLOW_REPORT_ENTRIES_ROWS', mappedPayments.length, mappedPayments);
          console.log('FLOW_REPORT_CASH_MOVEMENT_ROWS', mappedCashMovements.length, mappedCashMovements);

          // 3. Comissões pagas (legacy or missing in cash_movements)
          if (comms) {
              const mappedComms: any[] = [];
              comms.forEach(cm => {
                  let status = 'Pendente';
                  const cmStatus = cm.status?.toLowerCase() || 'pendente';
                  const isCommPaid = ['pago', 'paga', 'paid', 'aprovado', 'aprovada'].includes(cmStatus);
                  if (isCommPaid) status = 'Pago';
                  else if (cm.status === 'pendente') status = 'Pendente';
                  
                  const commContrato = cm.sales?.contracts?.contract_number || cm.sales?.contracts?.number || cm.sales?.contracts?.code || cm.sales?.contracts?.id || 
                                       cm.contracts?.contract_number || cm.contracts?.number || cm.contracts?.code || cm.contracts?.id || '-';
                  
                  const hasCash = mappedCashMovements.some(c => c.tipo === 'Saída' && 
                      (c.categoria === 'Comissão' || c.categoria === 'Comissao') && 
                      c.valor === cm.amount && 
                      (c.contrato === commContrato || c.corretor === cm.brokers?.name)
                  );
                  if (status === 'Pago' && hasCash) return; // avoid duplicate
                  
                  const projName = cm.sales?.projects?.name || cm.contracts?.projects?.name || 'Geral/Outros';
                  const mDate = new Date(cm.paid_at || cm.created_at);
                  
                  mappedComms.push({
                      id_check: `comm_${cm.id}`,
                      data: mDate,
                      projeto: projName,
                      tipo: 'Saída',
                      categoria: 'Comissão',
                      cliente: '-',
                      corretor: cm.brokers?.name || '-',
                      contrato: commContrato,
                      quadra: '-',
                      lote: '-',
                      descricao: `Pagamento de comissão ao corretor ${cm.brokers?.name || 'NI'}`,
                      valor: Number(cm.amount) || 0,
                      status: status
                  });
              });
              movements = [...movements, ...mappedComms];
              console.log('FLOW_REPORT_COMMISSION_ROWS_ADDED', mappedComms.length, mappedComms);
          }

          console.log('FLOW_REPORT_FINAL_ROWS', movements);

          // FILTER
          const flowRows = movements.filter(m => {
              if (prFilterProject !== 'Todos' && m.projeto !== prFilterProject) return false;
              if (prType !== 'Todos' && prType !== m.tipo + 's') return false; 
              
              if (prStatus === 'Todos') {
                  // If it's a cash flow report, "Todos" should still logically focus on REALIZED money (Pago),
                  // since the user explicitly requested "finance_receipts pagos", "comissão paga", etc.
                  // But to avoid blocking "Estornado" if it is actually useful, let's just make sure "Pendente" is excluded 
                  // to keep the totals matching the actual cash balance of 10k/2.1k
                  if (m.status === 'Pendente') return false;
              } else {
                  if (m.status !== prStatus) return false;
              }
              
              if (startDate && m.data < startDate) return false;
              if (endDate && m.data > endDate) return false;
              
              return true;
          });
          
          console.log("FLOW_REPORT_ROWS_AFTER_FILTER", flowRows);

          // Sort by date
          flowRows.sort((a, b) => a.data.getTime() - b.data.getTime());

          // Using global unification function
          const rawReportPayments = payments.filter(p => {
              const dDate = new Date(p.paid_at || p.due_date || p.created_at);
              const projName = p.projects?.name || p.sales?.projects?.name || p.blocks?.projects?.name || 'Geral/Outros';
              if (prFilterProject !== 'Todos' && projName !== prFilterProject) return false;
              if (prType !== 'Todos' && prType !== 'Entradas') return false;
              if (startDate && dDate < startDate) return false;
              if (endDate && dDate > endDate) return false;
              return true;
          });

          const rawReportCash = cashMovements.filter(c => {
              const mDate = new Date(c.movement_date || c.created_at);
              let projName = c.projects?.name || c.sales?.projects?.name || c.contracts?.projects?.name;
              if (!projName && (c.category === 'Comissão' || c.category === 'Comissao') && comms) {
                  const matchingComm = comms.find(cm => (c.sale_id === cm.sale_id || c.broker_id === cm.broker_id) && Math.abs(c.amount - cm.amount) < 1);
                  if (matchingComm) projName = matchingComm.sales?.projects?.name || matchingComm.contracts?.projects?.name;
              }
              if (!projName) projName = 'Geral/Outros';
              
              const tipoStr = (c.type || '').toLowerCase();
              const isSaidaStr = ['saida', 'saída', 'saida ', 'despesa', 'expense', 'commission', 'comissao', 'comissão'].some(val => tipoStr.includes(val));
              const mTipo = isSaidaStr ? 'Saídas' : (tipoStr.includes('entrada') ? 'Entradas' : 'Saídas');
              
              if (prFilterProject !== 'Todos' && projName !== prFilterProject) return false;
              if (prType !== 'Todos' && prType !== mTipo) return false;
              if (startDate && mDate < startDate) return false;
              if (endDate && mDate > endDate) return false;
              return true;
          });
          
          console.log("FLOW_REPORT_MANUAL_EXPENSES", rawReportCash);

          const rawReportComms = (comms || []).filter(cm => {
              const mDate = new Date(cm.paid_at || cm.created_at);
              const projName = cm.sales?.projects?.name || cm.contracts?.projects?.name || 'Geral/Outros';
              if (prFilterProject !== 'Todos' && projName !== prFilterProject) return false;
              if (prType !== 'Todos' && prType !== 'Saídas') return false;
              if (startDate && mDate < startDate) return false;
              if (endDate && mDate > endDate) return false;
              return true;
          });
          
          console.log("FLOW_REPORT_PAID_COMMISSIONS", rawReportComms);

          const totals = calculateFinancialTotals(rawReportPayments, rawReportCash, rawReportComms);
          const totalEntradas = totals.totalEntradas;
          const totalSaidas = totals.totalSaidas;
          const saldo = totals.saldoFinal;
          
          console.log("FLOW_REPORT_FINAL_TOTALS", totals);

          const companyName = tenantData ? tenantData.razao_social || tenantData.name : 'Sua Empresa';
          
          if (format === 'excel') {
              const ExcelJS = (await import('exceljs')).default;
              const workbook = new ExcelJS.Workbook();
              const ws = workbook.addWorksheet('Fluxo de Caixa');
              
              ws.addRow([`FLUXO DE CAIXA: ${prFilterProject}`]);
              ws.addRow([`Período: ${prStartDate || 'Início'} a ${prEndDate || 'Fim'}`]);
              ws.addRow(['']);
              ws.addRow(['RESUMO']);
              ws.addRow(['Total Entradas:', formatCurrency(totalEntradas)]);
              ws.addRow(['Total Saídas:', formatCurrency(totalSaidas)]);
              ws.addRow(['Saldo:', formatCurrency(saldo)]);
              ws.addRow(['']);
              
              const headers = ['Data', 'Projeto/Loteamento', 'Tipo', 'Categoria', 'Cliente', 'Corretor', 'Contrato', 'Quadra', 'Lote', 'Descrição', 'Valor', 'Status'];
              ws.addRow(headers);
              
              flowRows.forEach(m => {
                  ws.addRow([
                      m.data.toLocaleDateString('pt-BR'),
                      m.projeto,
                      m.tipo,
                      m.categoria,
                      m.cliente,
                      m.corretor,
                      m.contrato,
                      m.quadra,
                      m.lote,
                      m.descricao,
                      m.valor,
                      m.status
                  ]);
              });
              
              const buffer = await workbook.xlsx.writeBuffer();
              const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = `fluxo_caixa_${prFilterProject}_${new Date().getTime()}.xlsx`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
          } else {
              const jsPDF = (await import('jspdf')).default;
              const autoTable = (await import('jspdf-autotable')).default;
              const doc = new jsPDF('landscape');
              
              const renderHeader = (isOffset: boolean) => {
                  const titleX = isOffset ? 48 : 14;
                  const titleY = isOffset ? 20 : 15;
                  const textY1 = isOffset ? 28 : 22;
                  const textY2 = isOffset ? 33 : 28;
                  
                  doc.setFontSize(16);
                  doc.text(`FLUXO DE CAIXA - ${companyName}`, titleX, titleY);
                  doc.setFontSize(10);
                  doc.text(`Projeto/Loteamento: ${prFilterProject}`, titleX, textY1);
                  doc.text(`Período: ${prStartDate ? new Date(prStartDate+'T12:00:00Z').toLocaleDateString('pt-BR') : 'Início'} a ${prEndDate ? new Date(prEndDate+'T12:00:00Z').toLocaleDateString('pt-BR') : 'Fim'}`, titleX, textY2);
              };

              let yOffset = 42;
              
              if (tenantData?.logo_url) {
                  try {
                      const imgBase64 = await new Promise<string>((resolve, reject) => {
                          const img = new Image();
                          img.crossOrigin = 'Anonymous';
                          img.onload = () => {
                              const canvas = document.createElement('canvas');
                              canvas.width = img.width;
                              canvas.height = img.height;
                              const ctx = canvas.getContext('2d');
                              if (ctx) {
                                  ctx.drawImage(img, 0, 0);
                                  resolve(canvas.toDataURL('image/png'));
                              } else reject();
                          };
                          img.onerror = reject;
                          img.src = tenantData.logo_url;
                      });
                      doc.addImage(imgBase64, 'PNG', 14, 12, 28, 14, undefined, 'FAST');
                      renderHeader(true);
                  } catch(e) {
                      renderHeader(false);
                      yOffset = 36;
                  }
              } else {
                  renderHeader(false);
                  yOffset = 36;
              }
              
              doc.setFontSize(11);
              doc.setTextColor(39, 174, 96);
              doc.text(`Total Entradas: ${formatCurrency(totalEntradas)}`, 14, yOffset);
              doc.setTextColor(231, 76, 60);
              doc.text(`Total Saídas: ${formatCurrency(totalSaidas)}`, 70, yOffset);
              doc.setTextColor(saldo >= 0 ? 39 : 231, saldo >= 0 ? 174 : 76, saldo >= 0 ? 96 : 60);
              doc.text(`Saldo: ${formatCurrency(saldo)}`, 130, yOffset);
              
              const tableBody = flowRows.map(m => [
                  m.data.toLocaleDateString('pt-BR'),
                  m.projeto,
                  m.tipo,
                  m.categoria,
                  m.cliente,
                  m.corretor,
                  m.contrato,
                  m.quadra,
                  m.lote,
                  m.descricao,
                  formatCurrency(m.valor),
                  m.status
              ]);
              
              autoTable(doc, {
                  startY: yOffset + 6,
                  head: [['Data', 'Projeto/Loteamento', 'Tipo', 'Categoria', 'Cliente', 'Corretor', 'Contrato', 'Quadra', 'Lote', 'Descrição', 'Valor', 'Status']],
                  body: tableBody,
                  styles: { fontSize: 8 },
                  headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                  didParseCell: function(dataObj) {
                      if (dataObj.section === 'body') {
                          if (dataObj.column.index === 2) {
                              if (dataObj.cell.raw === 'Entrada') dataObj.cell.styles.textColor = [39, 174, 96];
                              if (dataObj.cell.raw === 'Saída') dataObj.cell.styles.textColor = [231, 76, 60];
                          }
                          if (dataObj.column.index === 11) {
                              if (dataObj.cell.raw === 'Pago') dataObj.cell.styles.textColor = [39, 174, 96];
                              if (dataObj.cell.raw === 'Pendente') dataObj.cell.styles.textColor = [243, 156, 18];
                              if (dataObj.cell.raw === 'Estornado') dataObj.cell.styles.textColor = [231, 76, 60];
                          }
                      }
                  }
              });
              
              doc.save(`fluxo_caixa_${prFilterProject}_${new Date().getTime()}.pdf`);
          }
      } catch (err: any) {
          console.error("Erro ao gerar relatório:", err);
          alert("Ocorreu um erro ao gerar. " + err.message);
      }
      setIsGeneratingPr(false);
      setShowProjectReportModal(false);
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
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
        <div className="flex flex-wrap gap-2 items-center mt-4 md:mt-0">
          
          <button onClick={handleBulkDelete} className="bg-transparent border border-[#f04449]/30 hover:bg-[#f04449]/10 text-[#f04449] px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm opacity-80 hover:opacity-100">
            <Trash2 className="w-4 h-4" />
            Limpar testes
          </button>
          
          <div className="h-6 w-[1px] bg-[#1f232b] hidden md:block mx-1"></div>

          <button onClick={handleExportResumidoPDF} className="bg-[#1a1f29] border border-[#2d3340] hover:bg-[#2d3340] text-gray-300 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm">
            <FileText className="w-4 h-4 text-[#e74c3c]" />
            PDF Resumido
          </button>
          <button onClick={handleExportResumidoExcel} className="bg-[#1a1f29] border border-[#2d3340] hover:bg-[#2d3340] text-gray-300 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm">
            <Download className="w-4 h-4 text-[#27ae60]" />
            Excel Resumido
          </button>

          <div className="h-6 w-[1px] bg-[#1f232b] hidden md:block mx-1"></div>

          <button onClick={() => setShowProjectReportModal(true)} className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold transition-all text-sm">
            <PieChart className="w-4 h-4" />
            Fluxo por Empreendimento
          </button>

          <div className="h-6 w-[1px] bg-[#1f232b] hidden md:block mx-1"></div>

          <button onClick={() => setShowSaidaModal(true)} className="bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold transition-all shadow-[0_0_15px_rgba(240,68,73,0.15)] text-sm">
            <TrendingDown className="w-4 h-4" />
            Registrar Saída
          </button>

          <div className="h-6 w-[1px] bg-[#1f232b] hidden md:block mx-1"></div>

          <button onClick={handleExportPDF} className="bg-transparent border border-[#2d3340] hover:bg-[#1a1f29] text-gray-400 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm">
            <FileText className="w-4 h-4" />
            PDF Completo
          </button>
          <button onClick={handleExportExcel} className="bg-transparent border border-[#2d3340] hover:bg-[#1a1f29] text-gray-400 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm">
            <Download className="w-4 h-4" />
            Excel Completo
          </button>
        </div>
      </header>

      {/* CAIXA CARDS */}
      <h2 className="text-xl font-bold text-white mb-4">Controle de Caixa Geral</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-3 gap-4 mb-8">
        <StatCard 
            title="Entradas (Total)" 
            value={formatCurrency(stats.entradasCaixa)} 
            subtitle="Recebimentos de vendas e manuais"
            subtitleColor="text-gray-500"
            icon={<TrendingUp className="w-5 h-5" />} 
            iconBg="bg-[#2ad271]/10" 
        />
        <StatCard 
            title="Saídas (Total)" 
            value={formatCurrency(stats.saidasCaixa)} 
            subtitle="Comissões e despesas"
            subtitleColor="text-gray-500"
            icon={<TrendingDown className="w-5 h-5" />} 
            iconBg="bg-[#f04449]/10" 
        />
        <StatCard 
            title="Saldo Atual" 
            value={formatCurrency(stats.saldoCaixa)} 
            subtitle="Entradas - Saídas"
            subtitleColor="text-gray-500"
            icon={<Wallet className="w-5 h-5" />} 
            iconBg={stats.saldoCaixa >= 0 ? "bg-emerald-500/10" : "bg-[#f04449]/10"} 
        />
      </div>

      <h2 className="text-xl font-bold text-white mb-4">Métricas de Parcelas</h2>
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

      <div className="flex items-center gap-4 border-b border-[#1f232b] mb-6 mt-4">
        <button 
           onClick={() => setActiveTab('parcelas')}
           className={`pb-3 text-sm font-semibold transition-colors duration-200 border-b-2 px-2 ${activeTab === 'parcelas' ? 'border-[#2ad271] text-white' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
        >
          Parcelas
        </button>
        <button 
           onClick={() => setActiveTab('caixa')}
           className={`pb-3 text-sm font-semibold transition-colors duration-200 border-b-2 px-2 ${activeTab === 'caixa' ? 'border-[#2ad271] text-white' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
        >
          Fluxo de Caixa
        </button>
      </div>

      {activeTab === 'parcelas' && (
      <>
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
                <th className="px-4 py-4 w-10">
                   <input type="checkbox" onChange={(e) => {
                     if (e.target.checked) {
                       setSelectedIds(new Set(currentPayments.map(p => p.id)));
                     } else {
                       setSelectedIds(new Set());
                     }
                   }} checked={currentPayments.length > 0 && selectedIds.size === currentPayments.length} />
                </th>
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
                   const projectName = p.projects?.name || p.sales?.projects?.name || p.blocks?.projects?.name || 'Projeto Desconhecido';
                   const blockName = p.blocks?.block_name || p.blocks?.name || '?';
                   const lotNumber = p.blocks?.number || '?';
                   
                   const loteDesc = `QD ${blockName} - LT ${lotNumber}`;
                   const contractNo = p.sales?.contracts?.[0]?.contract_number || (p.sales?.id ? 'CT-' + new Date(p.created_at || new Date()).getFullYear() + '-' + p.sales.id.substring(0, 6).toUpperCase() : 'CT-S/N');
                   
                   const clientName = p.customers?.name || 'Desconhecido';
                   const isEntry = p.installment_number === 0 || p.installment_number === '0';
                   const parcelInfo = isEntry ? 'ENTRADA' : `${p.installment_number || 1}`;
                   const maxParcel = p.sales?.installments_count && !isEntry ? ` / ${p.sales.installments_count}` : '';
                   
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
                        <td className="px-4 py-4">
                          <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelection(p.id)} />
                        </td>
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
                        <td className="px-6 py-4 text-center">
                          {isEntry ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">ENTRADA</span>
                          ) : (
                            <span className="text-sm font-mono text-gray-400">{parcelInfo}{maxParcel}</span>
                          )}
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
                             <button onClick={() => { console.log('FINANCE VIEW DETAIL', p); setSelectedPayment(p); }} className="p-1.5 hover:text-white text-gray-500 transition-colors" title="Visualizar Detalhes">
                               <Eye className="w-5 h-5" />
                             </button>
                             {!isPaid && (
                               <button onClick={() => handleMarkPaid(p)} className="p-1.5 hover:text-[#2ad271] text-gray-500 transition-colors" title="Registrar Pagamento">
                                  <CheckCircle className="w-5 h-5" />
                               </button>
                             )}
                             <button onClick={() => handleWhatsApp(p)} className="p-1.5 hover:text-[#2ad271] text-gray-500 transition-colors" title="Cobrar no WhatsApp">
                                <MessageCircle className="w-5 h-5" />
                             </button>
                             <button onClick={() => handleGenerateCarne(p)} className="p-1.5 hover:text-[#4999e9] text-gray-500 transition-colors" title="Gerar Carnê/Boleto">
                                <FileText className="w-5 h-5" />
                             </button>
                             <button onClick={() => handleDeleteReceipt(p)} className="p-1.5 hover:text-[#f04449] text-gray-500 transition-colors" title="Excluir Parcela">
                                <Trash2 className="w-5 h-5" />
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
      <div className="bg-[#13161c] border border-[#1f232b] rounded-xl flex flex-col md:flex-row shadow-xl overflow-hidden mb-6">
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
      </>
      )}

      {activeTab === 'caixa' && (
      <div className="bg-[#13161c] border border-[#1f232b] rounded-xl overflow-x-auto shadow-md min-h-[400px]">
         <div className="p-4 border-b border-[#1f232b] bg-[#1a1e27] flex items-center gap-2">
            <h3 className="text-white font-bold tracking-wider text-sm flex items-center gap-2">
               <Wallet className="w-4 h-4" /> HISTÓRICO DE FLUXO DE CAIXA
            </h3>
         </div>
         {cashMovements.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
               Nenhuma movimentação de caixa registrada ainda.
            </div>
         ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
               <thead className="bg-[#1a1e27] text-gray-400 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                     <th className="px-5 py-4 border-b border-[#1f232b]">Data</th>
                     <th className="px-5 py-4 border-b border-[#1f232b]">Tipo</th>
                     <th className="px-5 py-4 border-b border-[#1f232b]">Categoria</th>
                     <th className="px-5 py-4 border-b border-[#1f232b]">Descrição</th>
                     <th className="px-5 py-4 border-b border-[#1f232b]">Valor</th>
                     <th className="px-5 py-4 border-b border-[#1f232b]">Status</th>
                     <th className="px-5 py-4 border-b border-[#1f232b] text-right">Ação</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-[#1f232b]">
                  {cashMovements.map((c) => (
                      <tr key={c.id} className="hover:bg-[#1a1e27] transition-colors group">
                         <td className="px-5 py-4 text-gray-300 font-medium">
                            {c.movement_date ? new Date(c.movement_date+'T12:00:00Z').toLocaleDateString('pt-BR') : '-'}
                         </td>
                         <td className="px-5 py-4 font-bold">
                            {c.type === 'entrada' ? <span className="text-emerald-500 flex items-center gap-1"><TrendingUp className="w-3 h-3"/> ENTRADA</span> : <span className="text-red-500 flex items-center gap-1"><TrendingDown className="w-3 h-3"/> SAÍDA</span>}
                         </td>
                         <td className="px-5 py-4 text-gray-300">
                            {c.category}
                         </td>
                         <td className="px-5 py-4 text-gray-400">
                            {c.description || '-'}
                            {c.projects?.name && <span className="block text-xs mt-0.5 text-gray-500">Proj: {c.projects?.name}</span>}
                         </td>
                         <td className="px-5 py-4 text-white font-mono">
                            {formatCurrency(c.amount)}
                         </td>
                         <td className="px-5 py-4">
                            {c.status === 'estornado' ? <span className="text-xs text-orange-500 font-bold bg-orange-500/10 px-2 py-1 rounded">ESTORNADO</span> : <span className="text-xs text-emerald-500 font-bold bg-emerald-500/10 px-2 py-1 rounded">ATIVO</span>}
                         </td>
                         <td className="px-5 py-4 text-right">
                            {c.status === 'ativo' && (
                               <button 
                                 onClick={async () => {
                                    if(window.confirm('Atenção, deseja marcar esta movimentação como ESTORNADA? Isso impactará o saldo.')) {
                                       await supabase.from('cash_movements').update({status:'estornado'}).eq('id', c.id);
                                       try { await supabase.from('audit_logs').insert({action:'CASH_MOVEMENT_REVERSED', user_id: user?.id, tenant_id: user?.tenant_id||((user as any)?.company_id)}); } catch(e){}
                                       await loadFinance();
                                    }
                                 }}
                                 className="opacity-0 group-hover:opacity-100 p-1.5 text-orange-500 hover:text-white hover:bg-orange-500/80 rounded transition-all text-xs border border-orange-500/30" title="Estornar">
                                 Estornar
                               </button>
                            )}
                         </td>
                      </tr>
                  ))}
               </tbody>
            </table>
         )}
      </div>
      )}

      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#13161c] border border-[#1f232b] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-[#1f232b] flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Detalhes do Recebimento</h3>
              <button onClick={() => setSelectedPayment(null)} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm text-gray-300">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Cliente</span>
                  <div className="font-medium text-white">{selectedPayment.customers?.name || 'Não localizado'}</div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Projeto / Lote / Contrato</span>
                  <div className="font-medium text-white">
                    {selectedPayment.projects?.name || selectedPayment.sales?.projects?.name || selectedPayment.blocks?.projects?.name || 'Projeto'} - QD {selectedPayment.blocks?.block_name || selectedPayment.blocks?.name} LT {selectedPayment.blocks?.number}
                    <div className="text-xs text-gray-400 mt-1 uppercase">CT: {selectedPayment.sales?.contracts?.[0]?.contract_number || (selectedPayment.sales?.id ? 'CT-' + new Date(selectedPayment.created_at || new Date()).getFullYear() + '-' + selectedPayment.sales.id.substring(0, 6).toUpperCase() : 'CT-S/N')}</div>
                  </div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Vencimento</span>
                  <div>{selectedPayment.due_date ? new Date((selectedPayment.due_date?.split('T')[0]) + 'T12:00:00Z').toLocaleDateString('pt-BR') : '-'}</div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Parcela</span>
                  <div>
                    {selectedPayment.installment_number === 0 || selectedPayment.installment_number === '0' ? (
                       <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">ENTRADA</span>
                    ) : (
                       `${selectedPayment.installment_number || 1}${selectedPayment.sales?.installments_count ? ` / ${selectedPayment.sales.installments_count}` : ''}`
                    )}
                  </div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Valor Parcela</span>
                  <div className="font-medium text-white">{formatCurrency(Number(selectedPayment.amount) || 0)}</div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Valor Pago</span>
                  <div className="font-medium text-white">{formatCurrency(selectedPayment.status === 'pago' || selectedPayment.status === 'PAID' ? (Number(selectedPayment.paid_amount) || Number(selectedPayment.amount)) : 0)}</div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Status</span>
                  <StatusBadge status={selectedPayment.status || 'pendente'} />
                </div>
                <div>
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Data Criação</span>
                  <div>{selectedPayment.created_at ? new Date(selectedPayment.created_at).toLocaleDateString('pt-BR') : '-'}</div>
                </div>
              </div>
              <div className="pt-4 border-t border-[#1f232b]">
                <div className="text-[10px] text-gray-500 font-mono space-y-1">
                  <div>Sale ID: {selectedPayment.sale_id || '-'}</div>
                  <div>Customer ID: {selectedPayment.customer_id || '-'}</div>
                  <div>Receipt ID: {selectedPayment.id}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSaidaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#13161c] border border-[#1f232b] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <form onSubmit={handleRegistrarSaida}>
              <div className="p-6 border-b border-[#1f232b] flex justify-between items-center">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-red-500" />
                  Registrar Saída (Despesa / Saque)
                </h3>
                <button type="button" onClick={() => setShowSaidaModal(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4 text-sm text-gray-300">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tipo</label>
                    <input type="text" value="SAÍDA" disabled className="w-full bg-[#1c212a] text-red-400 font-bold border border-[#2d3340] rounded px-3 py-2 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Categoria</label>
                    <select required value={saidaForm.category} onChange={e => setSaidaForm({...saidaForm, category: e.target.value})} className="w-full bg-[#1c212a] text-white border border-[#2d3340] rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition-colors">
                        <option value="Roço do chacreamento">Roço do chacreamento</option>
                        <option value="Compra de postes">Compra de postes</option>
                        <option value="Terraplanagem">Terraplanagem</option>
                        <option value="Escritório">Escritório</option>
                        <option value="Marketing">Marketing</option>
                        <option value="Comissão">Comissão</option>
                        <option value="Serviços Terceirizados">Serviços Terceirizados</option>
                        <option value="Infraestrutura">Infraestrutura</option>
                        <option value="Outros">Outros</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Destino / Descrição (Opcional)</label>
                  <input type="text" value={saidaForm.description} onChange={e => setSaidaForm({...saidaForm, description: e.target.value})} placeholder="Para onde foi o dinheiro ou do que se trata..." className="w-full bg-[#1c212a] text-white border border-[#2d3340] rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition-colors" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Valor (R$)*</label>
                    <input required type="number" step="0.01" min="0.01" value={saidaForm.amount} onChange={e => setSaidaForm({...saidaForm, amount: e.target.value})} placeholder="0.00" className="w-full bg-[#1c212a] text-white border border-[#2d3340] rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition-colors font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Data*</label>
                    <input required type="date" value={saidaForm.movement_date} onChange={e => setSaidaForm({...saidaForm, movement_date: e.target.value})} className="w-full bg-[#1c212a] text-white border border-[#2d3340] rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition-colors" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Loteamento / Projeto (Opcional)</label>
                  <select 
                     value={saidaForm.project_id} 
                     onChange={e => setSaidaForm({...saidaForm, project_id: e.target.value})} 
                     className="w-full bg-[#1c212a] text-white border border-[#2d3340] rounded px-3 py-2 cursor-pointer focus:outline-none focus:border-teal-500"
                  >
                     <option value="">Geral / Sem vínculo específico</option>
                     {financeProjects.map(proj => (
                       <option key={proj.id} value={proj.id}>{proj.name}</option>
                     ))}
                  </select>
                </div>
              </div>
              <div className="p-6 border-t border-[#1f232b] flex justify-end gap-3">
                 <button type="button" onClick={() => setShowSaidaModal(false)} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors">
                   Cancelar
                 </button>
                 <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded shadow transition-colors">
                   Confirmar Saída
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProjectReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#13161c] border border-[#1f232b] rounded-xl w-full max-w-lg shadow-2xl flex flex-col mx-4 overflow-hidden">
            <div className="px-6 border-b border-[#1f232b] h-16 flex items-center justify-between bg-[#0b0e14]/50">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <PieChart className="w-5 h-5 text-indigo-500" />
                Relatório de Fluxo de Caixa
              </h2>
              <button disabled={isGeneratingPr} onClick={() => setShowProjectReportModal(false)} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Projeto/Loteamento</label>
                <select value={prFilterProject} onChange={e => setPrFilterProject(e.target.value)} className="w-full bg-[#1c212a] text-white border border-[#2d3340] rounded px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors">
                   <option value="Todos">Consolidado (Todos)</option>
                   {projectsList.map((p, i) => <option key={i} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Data Inicial (Opcional)</label>
                  <input type="date" value={prStartDate} onChange={e => setPrStartDate(e.target.value)} className="w-full bg-[#1c212a] text-white border border-[#2d3340] rounded px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Data Final (Opcional)</label>
                  <input type="date" value={prEndDate} onChange={e => setPrEndDate(e.target.value)} className="w-full bg-[#1c212a] text-white border border-[#2d3340] rounded px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tipo de Movimento</label>
                    <select value={prType} onChange={e => setPrType(e.target.value)} className="w-full bg-[#1c212a] text-white border border-[#2d3340] rounded px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors">
                       <option value="Todos">Todos</option>
                       <option value="Entradas">Somente Entradas</option>
                       <option value="Saídas">Somente Saídas</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Situação</label>
                    <select value={prStatus} onChange={e => setPrStatus(e.target.value)} className="w-full bg-[#1c212a] text-white border border-[#2d3340] rounded px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors">
                       <option value="Todos">Todas</option>
                       <option value="Pago">Pgto / Efetivado</option>
                       <option value="Pendente">Pendente</option>
                    </select>
                 </div>
              </div>
            </div>

            <div className="p-6 border-t border-[#1f232b] flex justify-end gap-3">
               <button disabled={isGeneratingPr} type="button" onClick={() => setShowProjectReportModal(false)} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors">
                 Cancelar
               </button>
               <button disabled={isGeneratingPr} type="button" onClick={() => handleGenerateProjectReport('pdf')} className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-400 text-sm font-bold rounded shadow flex items-center gap-2 transition-colors">
                 <FileText className="w-4 h-4" />
                 Gerar PDF
               </button>
               <button disabled={isGeneratingPr} type="button" onClick={() => handleGenerateProjectReport('excel')} className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-400 text-sm font-bold rounded shadow flex items-center gap-2 transition-colors">
                 <Download className="w-4 h-4" />
                 Excel
               </button>
            </div>
          </div>
        </div>
      )}

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




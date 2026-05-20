// CORRIGINDO BUILD DA VERCEL - NOVO DEPLOY LIMPO
// VERCEL SYNC FORCE - FINANCE PAGE PREMIUM UPDATED
'use client';

import { Banknote, Search, Download, Filter, TrendingDown, TrendingUp, AlertCircle, Loader2, Eye, CheckCircle, MessageCircle, FileText, ChevronLeft, ChevronRight, BookOpen, Trash2, X, Bell } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
     qtyContracts: 0,
     qtyNext7Days: 0,
     qtyNoPaymentContracts: 0
  });

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
              customers:customer_id(*),
              sales:sale_id(id, installments_count, projects(name), contracts(contract_number)),
              projects:project_id(*),
              blocks:block_id(*)
           `)
           .order('due_date', { ascending: true });
           
        if (user.role !== 'SUPER_ADMIN' && resolvedTenantId) {
           query = query.eq('tenant_id', resolvedTenantId);
        }
        
        let { data, error } = await query;
        console.log("FINANCE TENANT:", resolvedTenantId);
        console.log("FINANCE FETCH RESULT", data, error);
        
        if (error) {
            console.warn("ERRO JOIN FINANCE_RECEIPTS:", error);
            // Fallback to raw finance_receipts
            let fallbackQuery = supabase
                .from('finance_receipts')
                .select('*')
                .order('due_date', { ascending: true });
            
            if (user.role !== 'SUPER_ADMIN' && resolvedTenantId) {
                fallbackQuery = fallbackQuery.eq('tenant_id', resolvedTenantId);
            }
            
            const fallbackRes = await fallbackQuery;
            data = fallbackRes.data;
            error = fallbackRes.error;
            console.log("FINANCE RAW FALLBACK:", data, error);
        }
        
        if (error) throw error;
        
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
             
             if (computedStatus === 'pendente' || computedStatus === 'pending') {
                 localAReceber += amt;
                 qtyPending++;
                 if (dueStr === todayStr) {
                     localVencendoHoje += amt;
                     qtyDueToday++;
                 } else if (dueDate.getTime() > todayTime && dueDate.getTime() <= todayTime + 7*24*60*60*1000) {
                     qtyNext7Days++;
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
        
        let qtyNoPaymentContracts = 0;
        contractSet.forEach(c => {
           if (!paidContracts.has(c)) qtyNoPaymentContracts++;
        });
        
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
            qtyContracts: contractSet.size,
            qtyNext7Days,
            qtyNoPaymentContracts
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
      const { data, error } = await supabase.from('finance_receipts').delete().eq('id', p.id).select().single();
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
      const { data, error } = await supabase.from('finance_receipts').delete().in('id', idsToDelete).select();
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

     return [
       { Descricao: 'Total Filtro', Valor: formatCurrency(totalVendido) },
       { Descricao: 'Total Recebido', Valor: formatCurrency(totalRecebido) },
       { Descricao: 'Total a Receber', Valor: formatCurrency(totalAReceber) },
       { Descricao: 'Total Vencido', Valor: formatCurrency(totalVencido) },
       { Descricao: 'Qtd Parcelas Pagas', Valor: qtyPaid.toString() },
       { Descricao: 'Qtd Parcelas Pendentes', Valor: qtyPending.toString() },
       { Descricao: 'Qtd Parcelas Vencidas', Valor: qtyLate.toString() },
     ];
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

      doc.save(`relatorio_financeiro_${new Date().getTime()}.pdf`);
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
                  <div>{selectedPayment.installment_number || 1}</div>
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




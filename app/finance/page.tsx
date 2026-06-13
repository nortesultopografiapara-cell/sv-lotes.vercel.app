// CORRIGINDO BUILD DA VERCEL - NOVO DEPLOY LIMPO
// VERCEL SYNC FORCE - FINANCE PAGE PREMIUM UPDATED
'use client';

import { Banknote, Search, Download, Filter, TrendingDown, TrendingUp, AlertCircle, Loader2, Eye, CheckCircle, MessageCircle, FileText, ChevronLeft, ChevronRight, BookOpen, Trash2, X, Bell, Wallet, PieChart, Pencil, RotateCcw, ReceiptText, FileSignature } from 'lucide-react';
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import './finance-premium.css';
import {
  FinanceStatCard,
  FinanceStatusBadge,
  FinanceTableEmpty,
  FinanceTableLoading,
  PaymentTableRow,
} from '@/components/finance/FinancePremiumUI';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  canViewEnterpriseValues,
  isBrokerRole,
  isOwnerRole,
} from '@/lib/rolePermissions';
import { blockOwnerWriteOnClient } from '@/lib/ownerWriteGuard';
import {
  filterProjectsForUser,
  filterRowsByOwnerProjects,
  getOwnerAllowedProjectIdsForModule,
  loadOwnerAccessContext,
  resolveCashMovementProjectId,
  resolveCommissionProjectId,
  resolveReceiptProjectId,
} from '@/lib/ownerProjectAccess';
import { supabase } from '@/lib/supabase';
import {
  formatCurrencyBRL,
  logLotAuditEvent,
} from '@/lib/lotAudit';
import { applyTenantFilter, resolveRlsContext, withTenantFields } from '@/lib/rls';
import {
  calculateEnterpriseValueSummary,
  type EnterpriseValueSummary,
} from '@/lib/enterpriseValueSummary';
import { EnterpriseFinanceSummary } from '@/components/enterprise/EnterpriseFinanceSummary';
import '@/components/enterprise/enterprise-value.css';
import {
  buildCashFlowItems,
  calculateFinancialTotals,
  cashFlowItemsToReportRows,
  filterFlowReportRows,
  formatFlowDate,
  flowDisplayLabel,
  SAIDA_CATEGORIES,
  splitCashMovementDescription,
  getCashMovementMetadata,
  buildSaidaCashMovementMetadata,
  resolveFlowPaymentMethod,
  SAIDA_PAYMENT_METHODS,
  parseMoneyAmount,
  emptyUuidToNull,
  stripUndefinedFields,
  formatSupabaseFinanceError,
  type CashFlowItem,
} from '@/lib/financeCashFlow';
import { deleteCashFlowItem } from '@/lib/financeCashFlowDelete';
import {
  displayContractNumber,
  formatReceiptContractNumber,
} from '@/lib/contractNumber';
import {
  createDocumentValidationCode,
  createExpenseReceiptNumber,
  getReceiptValidationUrl,
} from '@/lib/pdfValidation';
import {
  buildNormalizedExpenseReceiptItem,
  formatBeneficiaryDocument,
  formatReceiptError,
  generateExpenseReceiptPdf,
  resolveReceiptContractNumber,
  resolveReceiptCustomerName,
} from '@/lib/expenseReceiptPdf';
import { persistExpenseReceiptValidation } from '@/lib/expenseReceiptPersist';

export type { CashFlowItem };
export { buildCashFlowItems, calculateFinancialTotals };
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getReportHeaderLogoUrl } from '@/lib/reportBranding';

const INITIAL_SAIDA_FORM = {
  category: 'Despesa administrativa',
  description: '',
  amount: '',
  project_id: '',
  contract_id: '',
  broker_id: '',
  broker_manual: '',
  customer_id: '',
  sale_id: '',
  customer_manual: '',
  beneficiary_manual: '',
  beneficiary_document: '',
  contract_number_manual: '',
  quadra_manual: '',
  lote_manual: '',
  payment_method: 'PIX',
  movement_date: new Date().toISOString().split('T')[0],
};

const CONFIRM_DELETE_LANCAMENTO =
  'Tem certeza que deseja excluir este lançamento? Essa ação atualizará os totais financeiros.';
const CONFIRM_ESTORNAR_PAGAMENTO =
  'Tem certeza que deseja estornar este pagamento?';

type FlowActionVariant = 'view' | 'edit' | 'receipt' | 'delete' | 'reverse' | 'contract';

const FLOW_ACTION_STYLES: Record<FlowActionVariant, string> = {
  view: 'text-blue-400 hover:bg-blue-500/10',
  edit: 'text-yellow-400 hover:bg-yellow-500/10',
  receipt: 'text-green-400 hover:bg-green-500/10',
  delete: 'text-red-400 hover:bg-red-500/10',
  reverse: 'text-orange-400 hover:bg-orange-500/10',
  contract: 'text-blue-400 hover:bg-blue-500/10',
};

function FlowIconBtn({
  title,
  onClick,
  variant,
  children,
}: {
  title: string;
  onClick: () => void;
  variant: FlowActionVariant;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 ${FLOW_ACTION_STYLES[variant]} hover:shadow-[0_0_12px_rgba(59,130,246,0.2)]`}
    >
      {children}
    </button>
  );
}

export default function FinancePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
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
  const [enterpriseBlocks, setEnterpriseBlocks] = useState<
    { project_id?: string | null; status?: string | null; price?: number | string | null }[]
  >([]);
  
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
  const [cashFlowItems, setCashFlowItems] = useState<CashFlowItem[]>([]);
  const [activeTab, setActiveTab] = useState<'parcelas'|'caixa'>('parcelas');
  const [showSaidaModal, setShowSaidaModal] = useState(false);
  const [saidaForm, setSaidaForm] = useState({ ...INITIAL_SAIDA_FORM });
  const [financeBrokers, setFinanceBrokers] = useState<any[]>([]);
  const [financeContracts, setFinanceContracts] = useState<any[]>([]);
  const [financeCustomers, setFinanceCustomers] = useState<any[]>([]);
  const [loadingSaidaLookups, setLoadingSaidaLookups] = useState(false);
  const [editingCashMovementId, setEditingCashMovementId] = useState<string | null>(null);
  const [selectedFlowItem, setSelectedFlowItem] = useState<CashFlowItem | null>(null);
  const [financeToast, setFinanceToast] = useState<string | null>(null);

  const contractsForSaida = useMemo(() => {
    if (!saidaForm.project_id) return financeContracts;
    return financeContracts.filter((c) => c.project_id === saidaForm.project_id);
  }, [financeContracts, saidaForm.project_id]);

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

  useEffect(() => {
    if (!showSaidaModal || !user) return;
    const resolvedTenantId = user.tenant_id || (user as any).company_id;
    if (!resolvedTenantId) return;

    (async () => {
      setLoadingSaidaLookups(true);
      try {
        const tenantOr = `tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`;
        const [brokersRes, contractsRes, customersRes] = await Promise.all([
          supabase
            .from('brokers')
            .select('id, name, full_name')
            .is('deleted_at', null)
            .or(tenantOr)
            .order('name', { ascending: true }),
          supabase
            .from('contracts')
            .select(`
              id, contract_number, project_id, customer_id, sale_id, block_id,
              customers(id, name, full_name),
              blocks(id, block_name, number, lot_number),
              projects(id, name)
            `)
            .or(tenantOr)
            .order('created_at', { ascending: false }),
          supabase
            .from('customers')
            .select('id, name, full_name')
            .or(tenantOr)
            .order('name', { ascending: true }),
        ]);
        setFinanceBrokers(brokersRes.data || []);
        setFinanceContracts(contractsRes.data || []);
        setFinanceCustomers(customersRes.data || []);
      } catch (e) {
        console.error('Erro ao carregar dados do modal de saída', e);
      } finally {
        setLoadingSaidaLookups(false);
      }
    })();
  }, [showSaidaModal, user]);

  const loadFinance = async () => {
      if (!user) return;
      try {
        const rlsCtx = await resolveRlsContext(user);
        const resolvedTenantId =
          rlsCtx.tenantId || user.tenant_id || (user as { company_id?: string }).company_id || null;

        if (!rlsCtx.isSuperAdmin && !resolvedTenantId) {
           setLoading(false);
           return;
        }
        
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
           
        query = applyTenantFilter(query, rlsCtx, 'finance_receipts');
        
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
            
            fallbackQuery = applyTenantFilter(fallbackQuery, rlsCtx, 'finance_receipts');
            
            const fallbackRes = await fallbackQuery;
            data = fallbackRes.data;
            error = fallbackRes.error;
            console.log("FINANCE RAW FALLBACK:", data, error);
        }
        
        if (error) throw error;

        const ownerCtx = await loadOwnerAccessContext(supabase, user, resolvedTenantId);
        const ownerFinanceProjectIds = ownerCtx.isOwner
          ? getOwnerAllowedProjectIdsForModule(ownerCtx.rows, 'finance')
          : ownerCtx.allowedProjectIds;
        const scopedReceipts = filterRowsByOwnerProjects(
          data || [],
          ownerFinanceProjectIds,
          resolveReceiptProjectId,
        );
        data = scopedReceipts;
        
        let pQuery = supabase.from('projects').select('id, name');
        pQuery = applyTenantFilter(pQuery, rlsCtx, 'projects');
        const { data: projData } = await pQuery;
        const visibleProjects = filterProjectsForUser(
          user,
          projData || [],
          ownerFinanceProjectIds,
        );
        if (visibleProjects.length > 0) {
            console.log('FINANCE_PROJECTS_LOADED_FOR_EXPENSE', visibleProjects.length);
            setFinanceProjects(visibleProjects);
            setProjectsList(visibleProjects.map((p) => p.name));
        } else {
            setFinanceProjects([]);
            setProjectsList([]);
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
               .select(`
                 *,
                 projects(name),
                 customers:customer_id(id, name, full_name),
                 contracts:contract_id(
                   id, contract_number, customer_id, block_id, project_id,
                   customers(id, name, full_name),
                   blocks(id, block_name, number, lot_number),
                   projects(id, name)
                 ),
                 sales:sale_id(
                   id, project_id, block_id, customer_id,
                   customers(id, name, full_name),
                   blocks(id, block_name, number, lot_number),
                   projects(id, name),
                   contracts(contract_number)
                 )
               `)
               .order('movement_date', { ascending: false });
               
           queryCash = applyTenantFilter(queryCash, rlsCtx, 'cash_movements');
           
           const { data: cData, error: cErr } = await queryCash;
           
           if (cErr) {
               console.error("ERRO JOIN CASH_MOVEMENTS", cErr);
               
               let fallbackQuery = supabase.from('cash_movements').select('*').order('movement_date', { ascending: false });
               fallbackQuery = applyTenantFilter(fallbackQuery, rlsCtx, 'cash_movements');
               const { data: fallbackData } = await fallbackQuery;
               if (fallbackData) {
                   cashData = filterRowsByOwnerProjects(
                     fallbackData,
                     ownerFinanceProjectIds,
                     resolveCashMovementProjectId,
                   );
                   setCashMovements(cashData);
               }
           } else if (cData) {
               cashData = filterRowsByOwnerProjects(
                 cData,
                 ownerFinanceProjectIds,
                 resolveCashMovementProjectId,
               );
               setCashMovements(cashData);
           }
        } catch(eee) { console.error('Cash movements error', eee); }

        let commsData: any[] = [];
        try {
           let queryComms = supabase.from('broker_commissions').select('*, brokers(*), sales(projects(*), contracts(*), customers(*), blocks(*)), contracts(projects(*))');
           queryComms = applyTenantFilter(queryComms, rlsCtx, 'broker_commissions');
           const { data: comms, error: commsErr } = await queryComms;
           if (commsErr) {
               console.error("ERRO JOIN BROKER_COMMISSIONS:", commsErr);
               let fallbackCommsQuery = supabase.from('broker_commissions').select('*').in('status', ['pago', 'paga', 'paid', 'aprovado', 'aprovada']);
               fallbackCommsQuery = applyTenantFilter(fallbackCommsQuery, rlsCtx, 'broker_commissions');
               const { data: fallbackComms } = await fallbackCommsQuery;
               if (fallbackComms) {
                   commsData = filterRowsByOwnerProjects(
                     fallbackComms,
                     ownerFinanceProjectIds,
                     resolveCommissionProjectId,
                   );
                   setBrokerCommissions(commsData);
               }
           } else if (comms) {
               commsData = filterRowsByOwnerProjects(
                 comms,
                 ownerFinanceProjectIds,
                 resolveCommissionProjectId,
               );
               setBrokerCommissions(commsData);
           }
        } catch(e){}

        const totals = calculateFinancialTotals(data || [], cashData, commsData);
        console.log("FINANCE_TOTAL_OUTCOMES_FINAL", totals.totalSaidas);

        const flowItems = buildCashFlowItems(data || [], cashData, commsData);
        const entradasCount = flowItems.filter((i) => i.tipo === 'entrada').length;
        const saidasCount = flowItems.filter((i) => i.tipo === 'saida').length;
        console.log('[FINANCEIRO] entradas carregadas', entradasCount, {
          total: flowItems
            .filter((i) => i.tipo === 'entrada')
            .reduce((s, i) => s + i.amount, 0),
        });
        console.log('[FINANCEIRO] saídas carregadas', saidasCount, {
          total: flowItems
            .filter((i) => i.tipo === 'saida')
            .reduce((s, i) => s + i.amount, 0),
        });
        console.log('[FINANCEIRO] fluxo enriquecido', flowItems.length, flowItems);
        setCashFlowItems(flowItems);

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
    if (!authLoading && isBrokerRole(user?.role)) {
      router.replace('/map');
    }
  }, [authLoading, user?.role, router]);

  useEffect(() => {
    if (!authLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadFinance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  useEffect(() => {
    if (!financeToast) return;
    const timer = setTimeout(() => setFinanceToast(null), 4000);
    return () => clearTimeout(timer);
  }, [financeToast]);

  useEffect(() => {
    let cancelled = false;

    async function loadEnterpriseBlocks() {
      if (!user || !canViewEnterpriseValues(user.role)) {
        setEnterpriseBlocks([]);
        return;
      }

      const project =
        projectFilter !== 'Todos os projetos'
          ? financeProjects.find((p) => p.name === projectFilter)
          : null;

      if (projectFilter !== 'Todos os projetos' && !project?.id) {
        setEnterpriseBlocks([]);
        return;
      }

      try {
        const rlsCtx = await resolveRlsContext(user);
        let query = supabase
          .from('blocks')
          .select('project_id, status, price');
        if (project?.id) {
          query = query.eq('project_id', project.id);
        }
        query = applyTenantFilter(query, rlsCtx, 'blocks');
        const { data, error } = await query;
        if (error) throw error;
        if (!cancelled) setEnterpriseBlocks(data || []);
      } catch (error) {
        console.error('FINANCE_ENTERPRISE_BLOCKS_ERROR', error);
        if (!cancelled) setEnterpriseBlocks([]);
      }
    }

    void loadEnterpriseBlocks();
    return () => {
      cancelled = true;
    };
  }, [user, projectFilter, financeProjects]);

  const showEnterpriseValues = canViewEnterpriseValues(user?.role);
  const ownerReadOnly = isOwnerRole(user?.role);

  const enterpriseSummary: EnterpriseValueSummary | null = useMemo(() => {
    if (!showEnterpriseValues) return null;
    return calculateEnterpriseValueSummary(enterpriseBlocks);
  }, [enterpriseBlocks, showEnterpriseValues]);

  const filteredCashFlowItems = useMemo(() => {
    return cashFlowItems.filter((item) => {
      const matchProject =
        projectFilter !== 'Todos os projetos' ? item.projectName === projectFilter : true;
      const dateStr = (item.movement_date || '').split('T')[0];
      const matchStartDate = startDate ? dateStr >= startDate : true;
      const matchEndDate = endDate ? dateStr <= endDate : true;
      return matchProject && matchStartDate && matchEndDate;
    });
  }, [cashFlowItems, projectFilter, startDate, endDate]);

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

  const enterpriseFinanceTotals = useMemo(() => {
    if (!enterpriseSummary) return null;
    let totalRecebido = 0;
    let saldoAReceber = 0;
    filteredPayments.forEach((p) => {
      const valor = Number(p.amount) || 0;
      const st = String(p.status || '').toLowerCase();
      const isPaid = st === 'pago' || st === 'paid';
      if (isPaid) {
        totalRecebido += Number(p.paid_amount) || valor;
      } else if (st !== 'cancelado' && st !== 'canceled') {
        saldoAReceber += valor;
      }
    });
    return { totalRecebido, saldoAReceber };
  }, [enterpriseSummary, filteredPayments]);

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
    if (blockOwnerWriteOnClient(user?.role)) return;
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
      
      const rlsCtx = await resolveRlsContext(user);
      const insertPayload = withTenantFields(
        {
          type: 'entrada',
          category: 'Venda de Lote',
          description: `Pagamento de Parcela ${p.installment_number || '1'} - CT ${p.sales?.contracts?.[0]?.contract_number || 'S/N'}`,
          amount: p.amount,
          customer_id: p.customer_id,
          sale_id: p.sale_id,
          finance_receipt_id: p.id,
          movement_date: new Date().toISOString().split('T')[0],
          created_by: user.id,
        },
        rlsCtx.tenantId,
        'cash_movements',
      );
      await supabase.from('cash_movements').insert(insertPayload);

      if (p.block_id) {
        void logLotAuditEvent(supabase, {
          companyId: rlsCtx.tenantId,
          projectId: p.project_id ?? p.sales?.project_id ?? null,
          blockId: p.block_id,
          lotId: p.block_id,
          saleId: p.sale_id ?? null,
          contractId: p.sales?.contracts?.[0]?.id ?? null,
          userId: user?.id ?? null,
          action: 'payment_received',
          title: 'Pagamento registrado',
          description: `Parcela ${p.installment_number || '1'} — ${formatCurrencyBRL(Number(p.amount) || 0)}`,
          newData: {
            receipt_id: p.id,
            installment_number: p.installment_number,
            amount: p.amount,
          },
          source: 'finance_flow',
        });
      }
      
      await loadFinance();
      window.dispatchEvent(new Event('finance_updated'));
      alert("Pagamento registrado com sucesso!");
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar pagamento.");
    }
  };

  const handleDeleteReceipt = async (p: any) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
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
    if (blockOwnerWriteOnClient(user?.role)) return;
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

  const applyContractToSaidaForm = (contractId: string) => {
    if (!contractId) {
      setSaidaForm((prev) => ({
        ...prev,
        contract_id: '',
        customer_id: '',
        sale_id: '',
        contract_number_manual: '',
        quadra_manual: '',
        lote_manual: '',
      }));
      return;
    }
    const c = financeContracts.find((x) => x.id === contractId);
    if (!c) return;
    const block = c.blocks;
    const quad = block?.block_name || block?.name || '';
    const lot = block?.lot_number || block?.number || '';
    setSaidaForm((prev) => ({
      ...prev,
      contract_id: contractId,
      project_id: c.project_id || prev.project_id,
      customer_id: c.customer_id || '',
      sale_id: c.sale_id || '',
      customer_manual: '',
      contract_number_manual: displayContractNumber(c.contract_number || ''),
      quadra_manual: quad,
      lote_manual: lot,
    }));
  };

  const handleRegistrarSaida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockOwnerWriteOnClient(user?.role)) return;
    const desc = saidaForm.description?.trim();
    if (!desc) return alert('Informe a descrição / destino da saída.');

    const amount = parseMoneyAmount(saidaForm.amount);
    if (amount === null) return alert('Valor inválido. Use formato 5685,37 ou 5685.37');

    const movementDate = (saidaForm.movement_date || '').split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) {
      return alert('Informe uma data válida para a saída.');
    }

    const hasBroker =
      !!emptyUuidToNull(saidaForm.broker_id) ||
      !!saidaForm.broker_manual.trim() ||
      !!saidaForm.beneficiary_manual.trim();
    if (saidaForm.category === 'Comissão' && !hasBroker) {
      return alert('Para comissão, selecione o corretor ou informe o fornecedor/beneficiário.');
    }

    const paymentMethod = (saidaForm.payment_method || '').trim();
    if (!paymentMethod) {
      return alert('Selecione a forma de pagamento.');
    }

    const resolvedTenantId = user?.tenant_id || (user as any)?.company_id;
    if (!resolvedTenantId) {
      return alert('Empresa não identificada. Faça login novamente.');
    }

    try {
      const brokerFromList = financeBrokers.find((b) => b.id === saidaForm.broker_id);
      const projectFromList = financeProjects.find((p) => p.id === saidaForm.project_id);
      const movementMetadata = buildSaidaCashMovementMetadata({
        contractId: saidaForm.contract_id,
        customerId: saidaForm.customer_id,
        brokerId: saidaForm.broker_id,
        brokerManual: saidaForm.broker_manual,
        beneficiaryManual: saidaForm.beneficiary_manual,
        beneficiaryDocument: saidaForm.beneficiary_document,
        brokerNameFromList: brokerFromList?.name || brokerFromList?.full_name,
        customerManual: saidaForm.customer_manual,
        contractManual: saidaForm.contract_number_manual,
        quadraManual: saidaForm.quadra_manual,
        loteManual: saidaForm.lote_manual,
        projectId: saidaForm.project_id,
        projectName: projectFromList?.name,
        paymentMethod,
      });

      const coreFields = stripUndefinedFields({
        type: 'saida',
        category: saidaForm.category.trim(),
        description: desc,
        amount,
        movement_date: movementDate,
        status: 'ativo',
        project_id: emptyUuidToNull(saidaForm.project_id),
        contract_id: emptyUuidToNull(saidaForm.contract_id),
        sale_id: emptyUuidToNull(saidaForm.sale_id),
        customer_id: emptyUuidToNull(saidaForm.customer_id),
        metadata: movementMetadata,
      });

      const payload = editingCashMovementId
        ? coreFields
        : stripUndefinedFields({
            ...coreFields,
            tenant_id: resolvedTenantId,
            company_id: resolvedTenantId,
            created_by: emptyUuidToNull(user?.id),
          });

      console.log('[FINANCEIRO] payload saída', payload);

      let error;
      if (editingCashMovementId) {
        const { error: updErr } = await supabase
          .from('cash_movements')
          .update(payload)
          .eq('id', editingCashMovementId);
        error = updErr;
      } else {
        const { error: insErr } = await supabase
          .from('cash_movements')
          .insert(payload);
        error = insErr;
      }

      if (error) throw error;

      console.log('[FINANCEIRO] saída salva', editingCashMovementId || 'novo');

      try {
        await supabase.from('audit_logs').insert([
          {
            tenant_id: resolvedTenantId,
            company_id: resolvedTenantId,
            user_id: user?.id,
            action: editingCashMovementId ? 'CASH_OUT_UPDATED' : 'CASH_OUT_CREATED',
            module: 'FINANCE',
            description: `Saída de ${amount} - ${saidaForm.category}`,
          },
        ]);
      } catch (auditErr) {
        console.warn(auditErr);
      }

      const wasEdit = !!editingCashMovementId;
      setShowSaidaModal(false);
      setEditingCashMovementId(null);
      setSaidaForm({ ...INITIAL_SAIDA_FORM });
      await loadFinance();
      setFinanceToast(
        wasEdit ? 'Saída atualizada com sucesso.' : 'Saída registrada com sucesso.',
      );
    } catch (err: unknown) {
      console.error('[FINANCEIRO] erro completo ao registrar saída', err);
      alert(
        'Erro ao registrar saída: ' + formatSupabaseFinanceError(err),
      );
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

    const { addProfessionalFooterAndSignature } = await import('@/lib/pdfUtils');
    await addProfessionalFooterAndSignature(doc, companyName, 'Recibo/Carnê');

    doc.save(`Carne_${contractNo}_${dueDate.replace(/\//g,'')}.pdf`);
  };

  const enrichReceiptCashFlowItem = (item: CashFlowItem): CashFlowItem => {
    if (!item.cashMovementId) return item;
    const cm = cashMovements.find((c) => c.id === item.cashMovementId);
    if (!cm) return item;
    const md = getCashMovementMetadata(cm);
    const projectFromJoin =
      cm.projects?.name || cm.contracts?.projects?.name || cm.sales?.projects?.name;
    const mergedMeta = {
      ...(item.metadata || {}),
      ...md,
      project_name: md.project_name || projectFromJoin || undefined,
    };
    const merged: CashFlowItem = {
      ...item,
      metadata: mergedMeta,
      description:
        (cm.description || item.description || '').split('[[sv_meta]]')[0].trim() ||
        item.description,
    };
    const contractResolved = resolveReceiptContractNumber(merged, mergedMeta);
    const customerResolved = resolveReceiptCustomerName(merged, mergedMeta);
    return {
      ...merged,
      contractNumber: contractResolved || merged.contractNumber,
      customerName: customerResolved || merged.customerName,
    };
  };

  const handleGenerateExpenseReceipt = async (item: CashFlowItem) => {
    if (item.tipo !== 'saida') {
      alert('Recibo de pagamento disponível apenas para saídas.');
      return;
    }
    if (item.status === 'estornado') {
      alert('Não é possível gerar recibo para lançamento estornado.');
      return;
    }

    const enriched = enrichReceiptCashFlowItem(item);
    const cm = item.cashMovementId
      ? cashMovements.find((c) => c.id === item.cashMovementId)
      : null;
    const projectFromJoin =
      cm?.projects?.name ||
      cm?.contracts?.projects?.name ||
      cm?.sales?.projects?.name;
    const md = enriched.metadata || {};
    const defaultPayment =
      item.payment_method || md.payment_method || undefined;

    const validationCode = createDocumentValidationCode();
    const persistId = item.cashMovementId || item.commissionId || item.id;
    const receiptNumber = createExpenseReceiptNumber(persistId);
    const validationUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/validar-recibo/${encodeURIComponent(validationCode)}`
        : getReceiptValidationUrl(validationCode);

    const receiptItem = buildNormalizedExpenseReceiptItem(enriched, {
      projectNameFromDb: projectFromJoin,
      paymentMethod: defaultPayment,
    });
    receiptItem.payment_method =
      receiptItem.payment_method || defaultPayment || undefined;

    console.log('[RECIBO] item normalizado', receiptItem);

    try {
      const doc = await generateExpenseReceiptPdf({
        item: receiptItem,
        tenantData,
        receiptNumber,
        validationCode,
        validationUrl,
      });

      const fileName = `recibo_pagamento_saida_${receiptNumber}.pdf`;
      doc.save(fileName);
      console.log('[RECIBO] pdf salvo', fileName);
    } catch (err: unknown) {
      console.error('[RECIBO] erro completo', err);
      alert('Erro ao gerar recibo de saída: ' + formatReceiptError(err));
      return;
    }

    if (item.cashMovementId) {
      const cmRow = cashMovements.find((c) => c.id === item.cashMovementId);
      const persistResult = await persistExpenseReceiptValidation(
        supabase,
        item.cashMovementId,
        cmRow,
        {
          validationCode,
          receiptNumber,
          validationUrl,
        },
      );
      if (!persistResult.ok) {
        console.error('[RECIBO] falha ao persistir validação', persistResult.error);
        alert(
          'Recibo gerado, mas o código de validação não foi salvo. Tente gerar novamente ou contate o suporte.',
        );
        return;
      }
    } else if (item.commissionId) {
      try {
        const { error } = await supabase
          .from('broker_commissions')
          .update({
            receipt_number: receiptNumber,
            receipt_url: validationUrl,
            validation_code: validationCode,
          })
          .eq('id', item.commissionId);
        if (error) {
          console.warn('[RECIBO] persistência comissão', error);
        }
      } catch (persistErr) {
        console.warn('[RECIBO] erro ao persistir comissão', persistErr);
      }
    }

    console.log('[RECIBO] recibo gerado', receiptNumber);
    console.log('[RECIBO] validacao criada', validationCode, validationUrl);

    try {
      await loadFinance();
    } catch (reloadErr) {
      console.warn('[RECIBO] reload finance', reloadErr);
    }

    setFinanceToast('Recibo de saída gerado com sucesso.');
  };

  const handleFlowView = (item: CashFlowItem) => {
    if (item.source === 'finance_receipts' && item.receiptId) {
      const payment = payments.find((p) => p.id === item.receiptId);
      if (payment) {
        setSelectedPayment(payment);
        return;
      }
    }
    setSelectedFlowItem(item);
  };

  const handleFlowOpenContract = (item: CashFlowItem) => {
    if (!item.contractId) return;
    console.log('[FINANCEIRO] abrir contrato', item.contractId);
    sessionStorage.setItem('sv_contract_focus', item.contractId);
    router.push('/contracts');
  };

  const handleFlowReverse = async (item: CashFlowItem) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!window.confirm(CONFIRM_ESTORNAR_PAGAMENTO)) {
      return;
    }
    try {
      if (item.receiptId && item.source === 'finance_receipts') {
        await supabase
          .from('finance_receipts')
          .update({ status: 'pendente', paid_amount: null, paid_at: null })
          .eq('id', item.receiptId);
        const linkedCash = cashMovements.find(
          (c) => c.finance_receipt_id === item.receiptId,
        );
        if (linkedCash?.id) {
          await supabase
            .from('cash_movements')
            .update({ status: 'estornado' })
            .eq('id', linkedCash.id);
        }
      } else if (item.cashMovementId) {
        await supabase
          .from('cash_movements')
          .update({ status: 'estornado' })
          .eq('id', item.cashMovementId);
      } else if (item.commissionId) {
        await supabase
          .from('broker_commissions')
          .update({ status: 'pendente' })
          .eq('id', item.commissionId);
      }
      if (item.blockId) {
        void logLotAuditEvent(supabase, {
          blockId: item.blockId,
          lotId: item.blockId,
          saleId: item.saleId ?? null,
          contractId: item.contractId ?? null,
          userId: user?.id ?? null,
          action: 'payment_reversed',
          title: 'Pagamento estornado',
          description: item.description || 'Estorno de parcela',
          newData: {
            receipt_id: item.receiptId ?? null,
            cash_movement_id: item.cashMovementId ?? null,
          },
          source: 'finance_flow',
        });
      }

      await loadFinance();
      alert('Movimentação estornada.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert('Erro ao estornar: ' + message);
    }
  };

  const handleFlowEditSaida = (item: CashFlowItem) => {
    if (!item.cashMovementId) return;
    const isManualDespesa =
      item.isManual || (!item.contractId && !item.saleId);
    if (!isManualDespesa) return;
    const cm = cashMovements.find((c) => c.id === item.cashMovementId);
    if (!cm) return;
    console.log('[FINANCEIRO] editar saída', item.cashMovementId);
    const { text } = splitCashMovementDescription(cm.description);
    const md = getCashMovementMetadata(cm);
    const block = cm.contracts?.blocks || cm.sales?.blocks;
    const quadFromBlock = block?.block_name || block?.name || '';
    const lotFromBlock = block?.lot_number || block?.number || '';
    setEditingCashMovementId(item.cashMovementId);
    setSaidaForm({
      category: cm.category || 'Outros',
      description: text,
      amount: String(cm.amount ?? ''),
      project_id: cm.project_id || cm.contracts?.project_id || '',
      contract_id: cm.contract_id || '',
      broker_id: md.broker_id || '',
      beneficiary_manual:
        md.beneficiary_manual || md.broker_manual || md.broker_name || '',
      beneficiary_document: md.beneficiary_document || '',
      broker_manual: md.broker_manual || '',
      payment_method: (() => {
        const pm = String(md.payment_method || '').trim();
        if (
          SAIDA_PAYMENT_METHODS.includes(
            pm as (typeof SAIDA_PAYMENT_METHODS)[number],
          )
        ) {
          return pm;
        }
        if (pm.toLowerCase().includes('pix')) return 'PIX';
        if (pm.toLowerCase().includes('transfer')) return 'Transferência';
        if (pm.toLowerCase().includes('dinheiro')) return 'Dinheiro';
        if (pm.toLowerCase().includes('boleto')) return 'Boleto';
        if (pm.toLowerCase().includes('cart')) return 'Cartão';
        return 'PIX';
      })(),
      customer_id: cm.customer_id || '',
      sale_id: cm.sale_id || '',
      customer_manual:
        md.customer_manual ||
        (!cm.customer_id
          ? cm.customers?.name || cm.customers?.full_name || ''
          : ''),
      contract_number_manual:
        md.contract_manual ||
        (cm.contracts?.contract_number
          ? displayContractNumber(cm.contracts.contract_number)
          : ''),
      quadra_manual: md.quadra_manual || quadFromBlock,
      lote_manual: md.lote_manual || lotFromBlock,
      movement_date: (cm.movement_date || '').split('T')[0] || new Date().toISOString().split('T')[0],
    });
    setShowSaidaModal(true);
  };

  const applyOptimisticCashFlowRemoval = (item: CashFlowItem) => {
    const linkedCashIds = new Set<string>();
    if (item.commissionId) {
      cashMovements.forEach((c) => {
        const typeStr = (c.type || '').toLowerCase();
        const isSaidaStr = ['saida', 'saída', 'despesa', 'expense'].some((v) =>
          typeStr.includes(v),
        );
        if (!isSaidaStr) return;
        const cMd = getCashMovementMetadata(c);
        const matches =
          (c.source_table === 'broker_commissions' &&
            c.source_id === item.commissionId) ||
          (((c.sale_id && item.saleId && c.sale_id === item.saleId) ||
            (item.brokerId &&
              (cMd.broker_id === item.brokerId || c.broker_id === item.brokerId))) &&
            Math.abs(Number(c.amount) - item.amount) < 1);
        if (matches) linkedCashIds.add(c.id);
      });
    }
    if (item.cashMovementId) linkedCashIds.add(item.cashMovementId);

    setCashFlowItems((prev) =>
      prev.filter(
        (x) =>
          x.id !== item.id &&
          (!x.cashMovementId || !linkedCashIds.has(x.cashMovementId)),
      ),
    );

    if (linkedCashIds.size > 0) {
      setCashMovements((prev) =>
        prev.filter((c) => !linkedCashIds.has(c.id)),
      );
    }

    if (item.commissionId) {
      setBrokerCommissions((prev) =>
        prev.filter((c) => c.id !== item.commissionId),
      );
    }

    if (item.tipo === 'saida') {
      setStats((prev) => {
        const newSaidas = Math.max(0, (prev.saidasCaixa || 0) - item.amount);
        return {
          ...prev,
          saidasCaixa: newSaidas,
          saldoCaixa: (prev.entradasCaixa || 0) - newSaidas,
        };
      });
    }
  };

  const handleFlowDeleteLancamento = async (item: CashFlowItem) => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (item.tipo === 'entrada') {
      alert('Para entradas/parcelas, use Estornar em vez de excluir.');
      return;
    }
    if (!window.confirm(CONFIRM_DELETE_LANCAMENTO)) return;

    const resolvedTenantId = user?.tenant_id || (user as any)?.company_id;
    const snapshot = {
      flow: cashFlowItems,
      cash: cashMovements,
      comms: brokerCommissions,
      stats,
    };

    applyOptimisticCashFlowRemoval(item);

    try {
      await deleteCashFlowItem(supabase, item, cashMovements);

      try {
        await supabase.from('audit_logs').insert([
          {
            tenant_id: resolvedTenantId,
            company_id: resolvedTenantId,
            user_id: user?.id,
            action: 'CASH_FLOW_DELETE',
            module: 'FINANCE',
            description: `Exclusão fluxo: ${item.id} (${item.source_table}/${item.source_id})`,
          },
        ]);
      } catch (auditErr) {
        console.warn(auditErr);
      }

      console.log('[FINANCEIRO] deletado com sucesso');
      await loadFinance();
      console.log('[FINANCEIRO] cards recalculados');
      setFinanceToast('Lançamento excluído com sucesso.');
    } catch (err: unknown) {
      setCashFlowItems(snapshot.flow);
      setCashMovements(snapshot.cash);
      setBrokerCommissions(snapshot.comms);
      setStats(snapshot.stats);
      const message = err instanceof Error ? err.message : String(err);
      console.error('[FINANCEIRO] erro ao deletar', err);
      alert(message || 'Erro ao excluir lançamento.');
    }
  };

  const flowActionBar = (buttons: ReactNode) => (
    <div className="flex items-center justify-end gap-1 min-h-[32px]">
      {buttons}
    </div>
  );

  const guardEstornado = (item: CashFlowItem, action: () => void) => {
    if (item.status === 'estornado') {
      alert('Esta movimentação está estornada.');
      return;
    }
    action();
  };

  const renderFlowActions = (item: CashFlowItem) => {
    const isActive = item.status !== 'estornado';
    const canContract = !!item.contractId;
    const canReceiptPdf =
      item.tipo === 'entrada' &&
      !!item.receiptId &&
      item.source === 'finance_receipts';
    const isSaida = item.tipo === 'saida';
    const isSaidaCash =
      isSaida && item.source === 'cash_movements' && !!item.cashMovementId;
    const isCommissionSaida =
      isSaida && item.source === 'broker_commissions' && !!item.commissionId;
    const isManualDespesa =
      isSaidaCash &&
      (item.isManual || (!item.contractId && !item.saleId));
    const isLinkedSaidaCash = isSaidaCash && !isManualDespesa;
    const isLinkedParcel =
      item.tipo === 'entrada' && item.source === 'finance_receipts';
    const canDeleteSaida =
      isActive && (isManualDespesa || isCommissionSaida);
    const canEstornar =
      isActive &&
      (isLinkedParcel || isLinkedSaidaCash);

    if (item.tipo === 'entrada') {
      return flowActionBar(
        <>
          <FlowIconBtn
            title="Visualizar"
            variant="view"
            onClick={() => handleFlowView(item)}
          >
            <Eye size={16} />
          </FlowIconBtn>
          {canReceiptPdf && (
            <FlowIconBtn
              title="Recibo/PDF"
              variant="receipt"
              onClick={() => {
                const p = payments.find((pay) => pay.id === item.receiptId);
                if (p) handleGenerateCarne(p);
              }}
            >
              <FileText size={16} />
            </FlowIconBtn>
          )}
          {canContract && (
            <FlowIconBtn
              title="Abrir contrato"
              variant="contract"
              onClick={() => handleFlowOpenContract(item)}
            >
              <FileSignature size={16} />
            </FlowIconBtn>
          )}
          {canEstornar && !ownerReadOnly && (
            <FlowIconBtn
              title="Estornar"
              variant="reverse"
              onClick={() => handleFlowReverse(item)}
            >
              <RotateCcw size={16} />
            </FlowIconBtn>
          )}
        </>,
      );
    }

    if (isSaida) {
      return flowActionBar(
        <>
          <FlowIconBtn
            title="Visualizar"
            variant="view"
            onClick={() => handleFlowView(item)}
          >
            <Eye size={16} />
          </FlowIconBtn>
          {isManualDespesa && !ownerReadOnly && (
            <FlowIconBtn
              title="Editar"
              variant="edit"
              onClick={() => guardEstornado(item, () => handleFlowEditSaida(item))}
            >
              <Pencil size={16} />
            </FlowIconBtn>
          )}
          <FlowIconBtn
            title="Gerar recibo"
            variant="receipt"
            onClick={() =>
              guardEstornado(item, () => handleGenerateExpenseReceipt(item))
            }
          >
            <ReceiptText size={16} />
          </FlowIconBtn>
          {canDeleteSaida && !ownerReadOnly ? (
            <FlowIconBtn
              title="Excluir lançamento"
              variant="delete"
              onClick={() => handleFlowDeleteLancamento(item)}
            >
              <Trash2 size={16} />
            </FlowIconBtn>
          ) : (
            <>
              {canContract && (
                <FlowIconBtn
                  title="Abrir contrato"
                  variant="contract"
                  onClick={() => handleFlowOpenContract(item)}
                >
                  <FileSignature size={16} />
                </FlowIconBtn>
              )}
          {canEstornar && !ownerReadOnly && (
            <FlowIconBtn
              title="Estornar"
              variant="reverse"
              onClick={() => handleFlowReverse(item)}
            >
              <RotateCcw size={16} />
            </FlowIconBtn>
          )}
            </>
          )}
        </>,
      );
    }

    return flowActionBar(
      <>
        <FlowIconBtn
          title="Visualizar"
          variant="view"
          onClick={() => handleFlowView(item)}
        >
          <Eye size={16} />
        </FlowIconBtn>
      </>,
    );
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
     if (getReportHeaderLogoUrl(tenantData?.logo_url)) {
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
                 img.src = getReportHeaderLogoUrl(tenantData?.logo_url);
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
       
       if (getReportHeaderLogoUrl(tenantData?.logo_url)) {
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
                  img.src = getReportHeaderLogoUrl(tenantData?.logo_url);
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
       
       console.log("PDF_HEADER_RENDERED");

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

       const { addProfessionalFooterAndSignature } = await import('@/lib/pdfUtils');
       await addProfessionalFooterAndSignature(doc, companyName, 'Relatório Resumido');

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
     
     if (getReportHeaderLogoUrl(tenantData?.logo_url)) {
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
                 img.onerror = reject; img.src = getReportHeaderLogoUrl(tenantData?.logo_url);
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
      if (getReportHeaderLogoUrl(tenantData?.logo_url)) {
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
                 img.src = getReportHeaderLogoUrl(tenantData?.logo_url);
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
      
      console.log("PDF_HEADER_RENDERED");

      autoTable(doc, {
          startY: startY,
          head: [['Contrato', 'Cliente', 'Documento', 'Projeto', 'Quadra', 'Lote', 'Parcela', 'Vencimento', 'Valor Parcela', 'Valor Pago', 'Status', 'Data Pagamento']],
          body: data.map(d => [d.Contrato, d.Cliente, d['CPF/CNPJ'], d.Projeto, d.Quadra, d.Lote, d.Parcela, d.Vencimento, d['Valor Parcela'], d['Valor Pago'], d.Status, d['Data Pagamento']]),
          styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', cellWidth: 'wrap' },
          columnStyles: {
              1: { cellWidth: 35 }, // Cliente
              3: { cellWidth: 25 }, // Projeto
              0: { cellWidth: 30 }  // Contrato
          },
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
              styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', cellWidth: 'wrap' },
              columnStyles: {
                  4: { cellWidth: 80 } // Descrição
              },
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

      const { addProfessionalFooterAndSignature } = await import('@/lib/pdfUtils');
      await addProfessionalFooterAndSignature(doc, companyName, 'Relatório Financeiro Completo');

      doc.save(`relatorio_financeiro_${new Date().getTime()}.pdf`);
  };

  const handleGenerateProjectReport = async (format: 'pdf'|'excel') => {
      setIsGeneratingPr(true);
      try {
          console.log("FLOW_PROJECT_SELECTED", prFilterProject);

          const allReportRows = cashFlowItemsToReportRows(cashFlowItems);
          const flowRows = filterFlowReportRows(allReportRows, {
            project: prFilterProject,
            type: prType,
            status: prStatus,
            startDate: prStartDate,
            endDate: prEndDate,
          });

          flowRows.sort((a, b) => a.data.getTime() - b.data.getTime());
          console.log('[FINANCEIRO] fluxo enriquecido PDF', flowRows.length, flowRows);

          const totalEntradas = flowRows
            .filter((r) => r.tipo === 'Entrada')
            .reduce((s, r) => s + r.valor, 0);
          const totalSaidas = flowRows
            .filter((r) => r.tipo === 'Saída')
            .reduce((s, r) => s + r.valor, 0);
          const saldo = totalEntradas - totalSaidas;

          console.log("PDF_FINAL_TOTALS", { totalEntradas, totalSaidas, saldo });

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
              
              if (getReportHeaderLogoUrl(tenantData?.logo_url)) {
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
                          img.src = getReportHeaderLogoUrl(tenantData?.logo_url);
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
              
              console.log("PDF_HEADER_RENDERED");
              
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
                  styles: { fontSize: 8, overflow: 'linebreak', cellWidth: 'wrap' },
                  columnStyles: {
                      9: { cellWidth: 35 }, // Descrição
                      4: { cellWidth: 25 }, // Cliente
                      1: { cellWidth: 20 }  // Projeto
                  },
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
              
              const { addProfessionalFooterAndSignature } = await import('@/lib/pdfUtils');
              await addProfessionalFooterAndSignature(doc, companyName, 'Fluxo de Caixa');

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
    <div className="finance-premium flex-1 min-w-0 max-w-full overflow-x-hidden overflow-y-auto p-4 md:p-6 lg:p-7 h-full font-sans">
      {financeToast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 rounded-lg border border-[var(--success)]/30 bg-[color-mix(in_srgb,var(--success)_12%,var(--bg-card))] px-4 py-3 text-sm text-[var(--success)] shadow-lg"
        >
          <CheckCircle className="h-4 w-4 shrink-0" />
          {financeToast}
        </div>
      )}

      {/* HEADER */}
      <header className="mb-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 min-w-0 max-w-full">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            Módulo Financeiro
          </h1>
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.2em] mt-0.5">
            Contratos · Títulos · Inadimplência
          </p>
        </div>
        <div className="finance-header-actions mt-4 md:mt-0 md:w-auto">
          {!ownerReadOnly ? (
          <>
          <button onClick={handleBulkDelete} className="bg-transparent border border-[var(--danger)]/30 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger)] px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm opacity-80 hover:opacity-100 flex-1 md:flex-none whitespace-nowrap min-w-[140px]">
            <Trash2 className="w-4 h-4" />
            Limpar
          </button>
          
          <div className="h-6 w-[1px] bg-[var(--bg-card-alt)] hidden md:block mx-1"></div>
          </>
          ) : null}

          <button onClick={handleExportResumidoPDF} className="bg-[var(--bg-card-alt)] border border-[var(--border-color)] hover:bg-[var(--bg-card-alt)] text-[var(--text-secondary)] px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm flex-1 md:flex-none whitespace-nowrap min-w-[140px]">
            <FileText className="w-4 h-4 text-[#e74c3c]" />
            PDF Res.
          </button>
          <button onClick={handleExportResumidoExcel} className="bg-[var(--bg-card-alt)] border border-[var(--border-color)] hover:bg-[var(--bg-card-alt)] text-[var(--text-secondary)] px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm flex-1 md:flex-none whitespace-nowrap min-w-[140px]">
            <Download className="w-4 h-4 text-[#27ae60]" />
            Excel Res.
          </button>

          <div className="h-6 w-[1px] bg-[var(--bg-card-alt)] hidden md:block mx-1"></div>

          <button onClick={() => setShowProjectReportModal(true)} className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold transition-all text-sm w-full md:w-auto">
            <PieChart className="w-4 h-4" />
            Fluxo por Empreendimento
          </button>

          <div className="h-6 w-[1px] bg-[var(--bg-card-alt)] hidden md:block mx-1"></div>

          {!ownerReadOnly ? (
          <button onClick={() => { setEditingCashMovementId(null); setSaidaForm({ ...INITIAL_SAIDA_FORM }); setShowSaidaModal(true); }} className="bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold transition-all shadow-[0_0_15px_rgba(240,68,73,0.15)] text-sm w-full md:w-auto">
            <TrendingDown className="w-4 h-4" />
            Registrar Saída
          </button>
          ) : null}

          {!ownerReadOnly ? (
          <div className="h-6 w-[1px] bg-[var(--bg-card-alt)] hidden md:block mx-1"></div>
          ) : null}

          <button onClick={handleExportPDF} className="bg-transparent border border-[var(--border-color)] hover:bg-[var(--bg-card-alt)] text-[var(--text-secondary)] px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm flex-1 md:flex-none whitespace-nowrap min-w-[140px]">
            <FileText className="w-4 h-4" />
            PDF Compl.
          </button>
          <button onClick={handleExportExcel} className="bg-transparent border border-[var(--border-color)] hover:bg-[var(--bg-card-alt)] text-[var(--text-secondary)] px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm flex-1 md:flex-none whitespace-nowrap min-w-[140px]">
            <Download className="w-4 h-4" />
            Excel Compl.
          </button>
        </div>
      </header>

      {showEnterpriseValues && enterpriseSummary && enterpriseFinanceTotals ? (
        <>
          <p className="finance-section-title">
            {projectFilter === 'Todos os projetos'
              ? 'Resumo financeiro global'
              : 'Resumo do empreendimento'}
          </p>
          <EnterpriseFinanceSummary
            summary={enterpriseSummary}
            totalRecebido={enterpriseFinanceTotals.totalRecebido}
            saldoAReceber={enterpriseFinanceTotals.saldoAReceber}
            projectName={projectFilter}
            mode={projectFilter === 'Todos os projetos' ? 'global' : 'project'}
          />
        </>
      ) : null}

      {/* KPIs — 3 colunas desktop, compactos */}
      <p className="finance-section-title">Resumo financeiro</p>
      <div className="finance-kpi-grid mb-5">
        <FinanceStatCard
          title="Entradas Totais"
          value={formatCurrency(stats.entradasCaixa)}
          subtitle="Vendas e entradas manuais"
          icon={<TrendingUp />}
          iconWrapClass="bg-emerald-500/12 text-emerald-400"
        />
        <FinanceStatCard
          title="Saídas Totais"
          value={formatCurrency(stats.saidasCaixa)}
          subtitle="Comissões e despesas"
          icon={<TrendingDown />}
          iconWrapClass="bg-rose-500/12 text-rose-400"
        />
        <FinanceStatCard
          title="Saldo Atual"
          value={formatCurrency(stats.saldoCaixa)}
          subtitle="Entradas − Saídas"
          icon={<Wallet />}
          iconWrapClass={
            stats.saldoCaixa >= 0
              ? 'bg-emerald-500/12 text-emerald-400'
              : 'bg-rose-500/12 text-rose-400'
          }
        />
        <FinanceStatCard
          title="Recebido no mês"
          value={formatCurrency(stats.recebidoMes)}
          subtitle="Mês corrente"
          subtitleColor="text-emerald-400/90"
          icon={<TrendingUp />}
          iconWrapClass="bg-emerald-500/12 text-emerald-400"
          loading={loading}
        />
        <FinanceStatCard
          title="A Receber"
          value={formatCurrency(stats.aReceber)}
          subtitle={`${stats.qtyPending} parcelas pendentes`}
          subtitleColor="text-blue-400/90"
          icon={<FileText />}
          iconWrapClass="bg-blue-500/12 text-blue-400"
          loading={loading}
        />
        <FinanceStatCard
          title="Inadimplência"
          value={`${stats.inadimplencia.toFixed(2)}%`}
          subtitle={
            stats.inadimplencia > 5
              ? `${stats.qtyLate} em atraso · acima do ideal`
              : `${stats.qtyLate} em atraso · dentro do ideal`
          }
          subtitleColor={
            stats.inadimplencia > 5 ? 'text-rose-400/90' : 'text-[var(--text-muted)]'
          }
          icon={<AlertCircle />}
          iconWrapClass="bg-rose-500/12 text-rose-400"
          loading={loading}
        />
      </div>

      <div className="finance-tabs">
        <button
          type="button"
          onClick={() => setActiveTab('parcelas')}
          className={`finance-tab ${activeTab === 'parcelas' ? 'active' : ''}`}
        >
          Parcelas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('caixa')}
          className={`finance-tab ${activeTab === 'caixa' ? 'active' : ''}`}
        >
          Fluxo de Caixa
        </button>
      </div>

      {activeTab === 'parcelas' && (
      <>
      {/* FILTERS — barra compacta sticky */}
      <div className="finance-filters-bar" role="search">
        <div className="relative finance-filter-search">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="finance-filter-input w-full pl-8"
            placeholder="Buscar cliente, contrato ou lote…"
            aria-label="Buscar"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="finance-filter-input finance-filter-select"
          aria-label="Status"
        >
          <option>Todas as Situações</option>
          <option>Pago</option>
          <option>Pendente</option>
          <option>Atrasado</option>
          <option>Cancelado</option>
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="finance-filter-input finance-filter-select"
          aria-label="Projeto"
        >
          <option>Todos os projetos</option>
          {projectsList.map((p, i) => (
            <option key={i} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="finance-filter-input finance-filter-date"
          style={{ colorScheme: 'dark' }}
          aria-label="Data inicial"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="finance-filter-input finance-filter-date"
          style={{ colorScheme: 'dark' }}
          aria-label="Data final"
        />
        <button
          type="button"
          onClick={clearFilters}
          className="finance-filter-input shrink-0 flex items-center gap-1.5 px-3 hover:bg-[var(--bg-card-alt)]/80 whitespace-nowrap"
        >
          <Filter className="w-3.5 h-3.5" />
          Limpar filtros
        </button>
      </div>

      {/* TABELA PARCELAS — prioridade visual */}
      <div className="finance-table-panel mb-6 flex flex-col min-w-0 max-w-full">
        <div className="finance-table-scroll">
          <table className="finance-table finance-table-parcels text-left">
            <colgroup>
              <col className="finance-col-check" />
              <col className="finance-col-info" />
              <col className="finance-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="finance-col-check">
                  <input
                    type="checkbox"
                    className="rounded border-[var(--border-color)]"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(currentPayments.map((p) => p.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    checked={
                      currentPayments.length > 0 &&
                      selectedIds.size === currentPayments.length
                    }
                    aria-label="Selecionar todos"
                  />
                </th>
                <th className="finance-col-info">Parcela / Cliente / Projeto</th>
                <th className="finance-col-actions finance-sticky-actions text-center">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <FinanceTableLoading colSpan={3} />
              ) : currentPayments.length > 0 ? (
                currentPayments.map((p) => (
                  <PaymentTableRow
                    key={p.id}
                    payment={p}
                    selected={selectedIds.has(p.id)}
                    formatCurrency={formatCurrency}
                    onToggle={() => toggleSelection(p.id)}
                    onView={() => {
                      setSelectedPayment(p);
                    }}
                    onMarkPaid={() => handleMarkPaid(p)}
                    onWhatsApp={() => handleWhatsApp(p)}
                    onCarne={() => handleGenerateCarne(p)}
                    onDelete={() => handleDeleteReceipt(p)}
                    readOnly={ownerReadOnly}
                  />
                ))
              ) : (
                <FinanceTableEmpty
                  colSpan={3}
                  message="Nenhum registro encontrado para os filtros selecionados."
                />
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        {!loading && filteredPayments.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-[var(--border-color)] text-sm text-[var(--text-secondary)] gap-4 bg-[var(--bg-card)]">
             <div>Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, filteredPayments.length)} de {filteredPayments.length} registros</div>
             <div className="flex items-center gap-1">
                <button 
                   onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                   disabled={currentPage === 1}
                   className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--bg-card-alt)] disabled:opacity-50 transition-colors">
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
                         className={`w-8 h-8 flex items-center justify-center rounded text-xs font-semibold transition-colors ${currentPage === pageNum ? 'bg-[var(--bg-card-alt)] text-[var(--text-primary)]' : 'hover:bg-[var(--bg-card-alt)]'}`}>
                         {pageNum}
                      </button>
                   )
                })}

                <button 
                   onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                   disabled={currentPage === totalPages}
                   className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--bg-card-alt)] disabled:opacity-50 transition-colors">
                   <ChevronRight className="w-4 h-4" />
                </button>
             </div>
             <div className="flex items-center gap-2">
               Registros por página:
               <select 
                  value={itemsPerPage}
                  onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="bg-transparent border border-[var(--border-color)] rounded px-2 py-1 outline-none">
                 <option value={10}>10</option>
                 <option value={25}>25</option>
                 <option value={50}>50</option>
               </select>
             </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-color)]/60 bg-[var(--bg-card)]/50 px-4 py-3 mb-4 text-xs text-[var(--text-muted)]">
        <BookOpen className="w-4 h-4 text-blue-400/70 shrink-0" />
        <span>
          Use os filtros para refinar · <Eye className="w-3 h-3 inline" /> detalhes ·{' '}
          <CheckCircle className="w-3 h-3 inline text-emerald-400/80" /> registrar pagamento
        </span>
      </div>
      </>
      )}

      {activeTab === 'caixa' && (
      <div className="finance-table-panel min-h-[360px] min-w-0 max-w-full">
         <div className="px-4 py-2.5 border-b border-[var(--border-color)]/80 bg-[var(--bg-card)]/90 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-blue-400" />
            <h3 className="text-[var(--text-primary)] font-semibold text-xs uppercase tracking-wider">
               Fluxo de caixa
            </h3>
         </div>
         {filteredCashFlowItems.length === 0 ? (
            <div className="p-10 text-center text-[var(--text-muted)] text-sm">
               Nenhuma movimentação de caixa registrada ainda.
            </div>
         ) : (
            <div className="finance-table-scroll">
            <table className="finance-table finance-table-caixa text-sm">
               <thead>
                  <tr>
                     <th>Data</th>
                     <th>Tipo</th>
                     <th>Categoria</th>
                     <th>Descrição</th>
                     <th>Origem</th>
                     <th className="text-right">Valor</th>
                     <th className="text-center">Status</th>
                     <th className="finance-sticky-actions text-center">Ações</th>
                  </tr>
               </thead>
               <tbody>
                  {filteredCashFlowItems.map((item) => (
                      <tr key={item.id} className="group">
                         <td className="text-[var(--text-secondary)] font-medium">
                            {formatFlowDate(item.movement_date)}
                         </td>
                         <td className="font-semibold">
                            {item.tipo === 'entrada' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px] tracking-wide">
                                <TrendingUp className="w-3 h-3"/> ENTRADA
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-400 text-[10px] tracking-wide">
                                <TrendingDown className="w-3 h-3"/> SAÍDA
                              </span>
                            )}
                         </td>
                         <td className="text-[var(--text-secondary)]">{item.category}</td>
                         <td className="finance-col-desc finance-cell-ellipsis text-[var(--text-secondary)]">
                            <span className="text-[var(--text-primary)] block truncate">{item.description}</span>
                            <span className="block text-[10px] text-[var(--text-muted)] mt-0.5">
                              {flowDisplayLabel(item.customerName, item.isManual)}
                              {item.brokerName ? ` · ${flowDisplayLabel(item.brokerName, item.isManual)}` : ''}
                            </span>
                         </td>
                         <td className="text-[var(--text-muted)] text-[10px] uppercase">
                            {item.source === 'finance_receipts' && 'Parcela'}
                            {item.source === 'cash_movements' && 'Caixa'}
                            {item.source === 'broker_commissions' && 'Comissão'}
                         </td>
                         <td className="text-right font-mono text-[var(--text-primary)]">
                            {formatCurrency(item.amount)}
                         </td>
                         <td className="text-center">
                            {item.status === 'estornado' ? (
                              <span className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider sv-brand-badge">Estornado</span>
                            ) : (
                              <span className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">Ativo</span>
                            )}
                         </td>
                         <td className="finance-col-actions finance-sticky-actions text-center">
                            <div className="finance-actions-row">
                            {renderFlowActions(item)}
                            </div>
                         </td>
                      </tr>
                  ))}
               </tbody>
            </table>
            </div>
         )}
      </div>
      )}

      {selectedFlowItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Detalhes da Movimentação</h3>
              <button onClick={() => setSelectedFlowItem(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm text-[var(--text-secondary)]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Data</span>
                  {formatFlowDate(selectedFlowItem.movement_date)}
                </div>
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Tipo</span>
                  {selectedFlowItem.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                </div>
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Categoria</span>
                  {selectedFlowItem.category}
                </div>
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Valor</span>
                  {formatCurrency(selectedFlowItem.amount)}
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-[var(--text-muted)] block">Descrição</span>
                  {selectedFlowItem.description}
                </div>
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Cliente</span>
                  {selectedFlowItem.metadata?.customer_manual ||
                    flowDisplayLabel(
                      selectedFlowItem.customerName,
                      selectedFlowItem.isManual,
                    )}
                </div>
                {selectedFlowItem.metadata?.beneficiary_document && (
                  <div>
                    <span className="text-xs text-[var(--text-muted)] block">CPF/CNPJ</span>
                    {formatBeneficiaryDocument(
                      selectedFlowItem.metadata.beneficiary_document,
                    )}
                  </div>
                )}
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Fornecedor / Beneficiário</span>
                  {selectedFlowItem.metadata?.beneficiary_manual ||
                    flowDisplayLabel(
                      selectedFlowItem.brokerName,
                      selectedFlowItem.isManual,
                    )}
                </div>
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Projeto</span>
                  {flowDisplayLabel(selectedFlowItem.projectName, selectedFlowItem.isManual)}
                </div>
                <div>
                  <span className="text-xs text-[var(--text-muted)] block">Contrato</span>
                  {selectedFlowItem.metadata?.contract_manual ||
                    (selectedFlowItem.contractNumber &&
                    selectedFlowItem.contractNumber !== 'Lançamento manual'
                      ? formatReceiptContractNumber(selectedFlowItem.contractNumber)
                      : '') ||
                    flowDisplayLabel('', selectedFlowItem.isManual)}
                </div>
                {selectedFlowItem.tipo === 'saida' && (
                  <div>
                    <span className="text-xs text-[var(--text-muted)] block">Forma de pagamento</span>
                    {resolveFlowPaymentMethod(selectedFlowItem)}
                  </div>
                )}
                {selectedFlowItem.locationLabel && selectedFlowItem.locationLabel !== 'Lançamento manual' && (
                  <div className="col-span-2">
                    <span className="text-xs text-[var(--text-muted)] block">Quadra / Lote</span>
                    {selectedFlowItem.locationLabel}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Detalhes do Recebimento</h3>
              <button onClick={() => setSelectedPayment(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm text-[var(--text-secondary)]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Cliente</span>
                  <div className="font-medium text-[var(--text-primary)]">{selectedPayment.customers?.name || 'Não localizado'}</div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Projeto / Lote / Contrato</span>
                  <div className="font-medium text-[var(--text-primary)]">
                    {selectedPayment.projects?.name || selectedPayment.sales?.projects?.name || selectedPayment.blocks?.projects?.name || 'Projeto'} - QD {selectedPayment.blocks?.block_name || selectedPayment.blocks?.name} LT {selectedPayment.blocks?.number}
                    <div className="text-xs text-[var(--text-secondary)] mt-1 uppercase">CT: {selectedPayment.sales?.contracts?.[0]?.contract_number || (selectedPayment.sales?.id ? 'CT-' + new Date(selectedPayment.created_at || new Date()).getFullYear() + '-' + selectedPayment.sales.id.substring(0, 6).toUpperCase() : 'CT-S/N')}</div>
                  </div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Vencimento</span>
                  <div>{selectedPayment.due_date ? new Date((selectedPayment.due_date?.split('T')[0]) + 'T12:00:00Z').toLocaleDateString('pt-BR') : '-'}</div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Parcela</span>
                  <div>
                    {selectedPayment.installment_number === 0 || selectedPayment.installment_number === '0' ? (
                       <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">ENTRADA</span>
                    ) : (
                       `${selectedPayment.installment_number || 1}${selectedPayment.sales?.installments_count ? ` / ${selectedPayment.sales.installments_count}` : ''}`
                    )}
                  </div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Valor Parcela</span>
                  <div className="font-medium text-[var(--text-primary)]">{formatCurrency(Number(selectedPayment.amount) || 0)}</div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Valor Pago</span>
                  <div className="font-medium text-[var(--text-primary)]">{formatCurrency(selectedPayment.status === 'pago' || selectedPayment.status === 'PAID' ? (Number(selectedPayment.paid_amount) || Number(selectedPayment.amount)) : 0)}</div>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Status</span>
                  <FinanceStatusBadge status={selectedPayment.status || 'pendente'} />
                </div>
                <div>
                  <span className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Data Criação</span>
                  <div>{selectedPayment.created_at ? new Date(selectedPayment.created_at).toLocaleDateString('pt-BR') : '-'}</div>
                </div>
              </div>
              <div className="pt-4 border-t border-[var(--border-color)]">
                <div className="text-[10px] text-[var(--text-muted)] font-mono space-y-1">
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
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleRegistrarSaida}>
              <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center sticky top-0 bg-[var(--bg-card)] z-10">
                <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-red-500" />
                  {editingCashMovementId ? 'Editar Saída' : 'Registrar Saída'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowSaidaModal(false);
                    setEditingCashMovementId(null);
                    setSaidaForm({ ...INITIAL_SAIDA_FORM });
                  }}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4 text-sm text-[var(--text-secondary)]">
                {loadingSaidaLookups && (
                  <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" /> Carregando projetos, contratos e corretores…
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Categoria *</label>
                    <select
                      required
                      value={saidaForm.category}
                      onChange={(e) => setSaidaForm({ ...saidaForm, category: e.target.value })}
                      className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition-colors"
                    >
                      {SAIDA_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Data *</label>
                    <input
                      required
                      type="date"
                      value={saidaForm.movement_date}
                      onChange={(e) => setSaidaForm({ ...saidaForm, movement_date: e.target.value })}
                      className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Descrição / Destino *</label>
                  <input
                    required
                    type="text"
                    value={saidaForm.description}
                    onChange={(e) => setSaidaForm({ ...saidaForm, description: e.target.value })}
                    placeholder="Para onde foi o dinheiro ou do que se trata..."
                    className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Valor (R$) *</label>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    value={saidaForm.amount}
                    onChange={(e) => setSaidaForm({ ...saidaForm, amount: e.target.value })}
                    placeholder="5685,37 ou 5685.37"
                    className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition-colors font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Forma de pagamento *</label>
                  <select
                    required
                    value={saidaForm.payment_method}
                    onChange={(e) =>
                      setSaidaForm({ ...saidaForm, payment_method: e.target.value })
                    }
                    className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 cursor-pointer focus:outline-none focus:border-teal-500"
                  >
                    {SAIDA_PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Projeto / Loteamento (opcional)</label>
                  <select
                    value={saidaForm.project_id}
                    onChange={(e) =>
                      setSaidaForm({
                        ...saidaForm,
                        project_id: e.target.value,
                        contract_id: '',
                        customer_id: '',
                        sale_id: '',
                        contract_number_manual: '',
                        quadra_manual: '',
                        lote_manual: '',
                      })
                    }
                    className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 cursor-pointer focus:outline-none focus:border-teal-500"
                  >
                    <option value="">Sem vínculo de projeto</option>
                    {financeProjects.map((proj) => (
                      <option key={proj.id} value={proj.id}>{proj.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Contrato (opcional)</label>
                  <select
                    value={saidaForm.contract_id}
                    onChange={(e) => applyContractToSaidaForm(e.target.value)}
                    className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 cursor-pointer focus:outline-none focus:border-teal-500"
                  >
                    <option value="">Nenhum contrato</option>
                    {contractsForSaida.map((c) => (
                      <option key={c.id} value={c.id}>
                        {displayContractNumber(c.contract_number)} — {c.customers?.name || c.customers?.full_name || 'Cliente'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Contrato manual (sem vínculo no sistema)
                  </label>
                  <input
                    type="text"
                    disabled={!!saidaForm.contract_id}
                    value={saidaForm.contract_number_manual}
                    onChange={(e) =>
                      setSaidaForm({ ...saidaForm, contract_number_manual: e.target.value })
                    }
                    placeholder="Ex.: 000000001/2026"
                    className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Cliente (cadastro)</label>
                    <select
                      disabled={!!saidaForm.contract_id}
                      value={saidaForm.customer_id}
                      onChange={(e) =>
                        setSaidaForm({
                          ...saidaForm,
                          customer_id: e.target.value,
                          customer_manual: '',
                        })
                      }
                      className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500 disabled:opacity-50"
                    >
                      <option value="">Nenhum / texto manual abaixo</option>
                      {financeCustomers.map((cust) => (
                        <option key={cust.id} value={cust.id}>
                          {cust.name || cust.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Cliente manual</label>
                    <input
                      type="text"
                      disabled={!!saidaForm.contract_id || !!saidaForm.customer_id}
                      value={saidaForm.customer_manual}
                      onChange={(e) =>
                        setSaidaForm({ ...saidaForm, customer_manual: e.target.value })
                      }
                      placeholder="Ex.: João Vitor Magão"
                      className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                      CPF/CNPJ do beneficiário
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={saidaForm.beneficiary_document}
                      onChange={(e) =>
                        setSaidaForm({
                          ...saidaForm,
                          beneficiary_document: e.target.value,
                        })
                      }
                      placeholder="000.000.000-00 ou CNPJ"
                      className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500 font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                      Fornecedor / Beneficiário
                    </label>
                    <input
                      type="text"
                      value={saidaForm.beneficiary_manual}
                      onChange={(e) =>
                        setSaidaForm({
                          ...saidaForm,
                          beneficiary_manual: e.target.value,
                        })
                      }
                      placeholder="Nome do fornecedor ou beneficiário do pagamento"
                      className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Quadra manual</label>
                    <input
                      type="text"
                      disabled={!!saidaForm.contract_id}
                      value={saidaForm.quadra_manual}
                      onChange={(e) =>
                        setSaidaForm({ ...saidaForm, quadra_manual: e.target.value })
                      }
                      placeholder="Ex.: A"
                      className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Lote manual</label>
                    <input
                      type="text"
                      disabled={!!saidaForm.contract_id}
                      value={saidaForm.lote_manual}
                      onChange={(e) =>
                        setSaidaForm({ ...saidaForm, lote_manual: e.target.value })
                      }
                      placeholder="Ex.: 12"
                      className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">
                    Corretor {saidaForm.category === 'Comissão' ? '*' : '(opcional)'}
                  </label>
                  <select
                    required={
                      saidaForm.category === 'Comissão' &&
                      !saidaForm.beneficiary_manual.trim()
                    }
                    value={saidaForm.broker_id}
                    onChange={(e) =>
                      setSaidaForm({
                        ...saidaForm,
                        broker_id: e.target.value,
                        broker_manual: e.target.value ? '' : saidaForm.broker_manual,
                      })
                    }
                    className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 cursor-pointer focus:outline-none focus:border-teal-500 disabled:opacity-50"
                    disabled={
                      !!saidaForm.beneficiary_manual.trim() && !saidaForm.broker_id
                    }
                  >
                    <option value="">Selecione o corretor</option>
                    {financeBrokers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name || b.full_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    disabled={!!saidaForm.broker_id}
                    value={saidaForm.broker_manual}
                    onChange={(e) =>
                      setSaidaForm({
                        ...saidaForm,
                        broker_manual: e.target.value,
                        broker_id: e.target.value.trim() ? '' : saidaForm.broker_id,
                      })
                    }
                    placeholder="Corretor manual (opcional, se não usar cadastro)"
                    className="mt-2 w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-teal-500 disabled:opacity-50"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-[var(--border-color)] flex justify-end gap-3">
                 <button type="button" onClick={() => setShowSaidaModal(false)} className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                   Cancelar
                 </button>
                 <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-[var(--text-primary)] text-sm font-bold rounded shadow transition-colors">
                   {editingCashMovementId ? 'Salvar alterações' : 'Confirmar Saída'}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProjectReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl w-full max-w-lg shadow-2xl flex flex-col mx-4 overflow-hidden">
            <div className="px-6 border-b border-[var(--border-color)] h-16 flex items-center justify-between bg-[var(--bg-card-alt)]/50">
              <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                <PieChart className="w-5 h-5 text-indigo-500" />
                Relatório de Fluxo de Caixa
              </h2>
              <button disabled={isGeneratingPr} onClick={() => setShowProjectReportModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Projeto/Loteamento</label>
                <select value={prFilterProject} onChange={e => setPrFilterProject(e.target.value)} className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors">
                   <option value="Todos">Consolidado (Todos)</option>
                   {projectsList.map((p, i) => <option key={i} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Data Inicial (Opcional)</label>
                  <input type="date" value={prStartDate} onChange={e => setPrStartDate(e.target.value)} className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Data Final (Opcional)</label>
                  <input type="date" value={prEndDate} onChange={e => setPrEndDate(e.target.value)} className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Tipo de Movimento</label>
                    <select value={prType} onChange={e => setPrType(e.target.value)} className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors">
                       <option value="Todos">Todos</option>
                       <option value="Entradas">Somente Entradas</option>
                       <option value="Saídas">Somente Saídas</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Situação</label>
                    <select value={prStatus} onChange={e => setPrStatus(e.target.value)} className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] rounded px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors">
                       <option value="Todos">Todas</option>
                       <option value="Pago">Pgto / Efetivado</option>
                       <option value="Pendente">Pendente</option>
                    </select>
                 </div>
              </div>
            </div>

            <div className="p-6 border-t border-[var(--border-color)] flex justify-end gap-3">
               <button disabled={isGeneratingPr} type="button" onClick={() => setShowProjectReportModal(false)} className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
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



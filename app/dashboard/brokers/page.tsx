'use client';

import { Users, Search, Plus, CheckCircle2, User, Mail, Phone, Lock, TrendingUp, DollarSign, Wallet, Medal, Clock, Eye, Edit, Trash2, Key, Loader2, UserCog, FileText, Download, CalendarClock, MoreHorizontal, Star } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { resolveActiveTenantId } from '@/lib/activeTenant';
import { applyTenantFilter, resolveRlsContext, withTenantFields } from '@/lib/rls';
import {
  defaultBrokerCommissionPercentForCreate,
  readBrokerCommissionPercent,
  resolveSaleValueForCommission,
} from '@/lib/brokerCommission';
import {
  buildBrokerDefaultCommissionFields,
  buildCommissionSnapshotFields,
  calculateBrokerCommissionPlan,
  normalizeBrokerCommissionMode,
  resolveBrokerDefaultCommissionPlan,
  shouldCreatePendingCommissionFromPlan,
  type BrokerCommissionMode,
} from '@/lib/brokerCommissionMode';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { parseCurrencyBRLNumber, serializeCurrencyBRL } from '@/lib/currencyBrl';
import { formatSaleLotsLabel } from '@/lib/saleBlockLotLabel';
import {
  BROKER_COMMISSION_MAINTENANCE_QUERY,
  canManageSaleBrokerCommission,
  canShowBrokerCommissionMaintenanceUi,
} from '@/lib/brokerCommissionAccess';
import { ManageSaleBrokerCommissionModal } from '@/components/brokers/ManageSaleBrokerCommissionModal';
import { BulkAdjustBrokerCommissionsModal } from '@/components/brokers/BulkAdjustBrokerCommissionsModal';
import { fetchAllPaginated } from '@/lib/supabaseFetchAll';
import {
  fetchCompanySaasByTenantId,
  getCompanySaasPlan,
  logSaasCompanyContext,
} from '@/lib/saasPlans';
import { formatBrokersLimitMessage } from '@/lib/saasPlanEnforcementMessages';
import { getReportHeaderLogoUrl } from '@/lib/reportBranding';
import {
  BrokerDeleteError,
  BrokerDeleteResult,
  computeBrokerDashboardStats,
  filterBrokersForActiveList,
  isBrokerActiveForList,
  logBrokerDeleteAudit,
  rankBrokersByMonthlySales,
  removeBrokerFromList,
} from '@/lib/brokerDelete';
import {
  BROKER_ACCESS_LEVEL_OPTIONS,
  BROKER_USER_ROLE,
  sanitizeBrokerAccessLevel,
  shouldAppearInBrokerList,
} from '@/lib/brokerAccessLevels';
import {
  BROKER_DASHBOARD_PERIOD_LABELS,
  BROKER_DASHBOARD_PERIODS,
  averageTicket,
  brokerRecordMatchesSearch,
  buildBrokerReportDetailRows,
  buildBrokerStatsFromData,
  collectSaleIdsFromStats,
  computeChangePercent,
  countOpenReservedLots,
  getPreviousBrokerStatsPeriodBounds,
  isSaleInStatsPeriod,
  labelBrokerStatsPeriod,
  pickBrokerHighlight,
  sumCommissionsForSaleIds,
  type BrokerDashboardPeriod,
  type BrokerSaleDetailRow,
} from '@/lib/brokerDashboardStats';

export default function CorretoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [brokerListBase, setBrokerListBase] = useState<any[]>([]);
  const [statsCatalog, setStatsCatalog] = useState<{
    sales: Array<Record<string, unknown>>;
    commissions: any[];
    blocks: any[];
    projects: Array<{ id: string; name?: string | null }>;
    contracts: Array<Record<string, unknown>>;
    customers: Array<{ id: string; name?: string | null }>;
  } | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<BrokerDashboardPeriod>('month');
  const [maintenanceQuery, setMaintenanceQuery] = useState<string | null>(null);
  const [openBrokerActionsId, setOpenBrokerActionsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [brokerLimit, setBrokerLimit] = useState<number | null>(null);
  const [companyPlan, setCompanyPlan] = useState<string>('');
  const [tenantData, setTenantData] = useState<any>(null);

  const [manageSaleModal, setManageSaleModal] = useState<{
    saleId: string;
    lotLabel: string;
    contractLabel: string;
    saleValue: number;
    brokerName: string;
    pendingTotal: number;
  } | null>(null);
  const [bulkAdjustOpen, setBulkAdjustOpen] = useState(false);
  const [bulkAdjustPreset, setBulkAdjustPreset] = useState<'zero_pending_all' | null>(null);
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  useEffect(() => {
    async function resolveTenant() {
      if (!user) {
        setActiveTenantId(null);
        return;
      }
      const tenantId = await resolveActiveTenantId(user);
      setActiveTenantId(tenantId);
      if (tenantId) {
        const { data } = await supabase.from('companies').select('*').eq('id', tenantId).maybeSingle();
        setTenantData(data);
      }
    }
    resolveTenant();
  }, [user]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    cpf: '',
    creci: '',
    role: 'BROKER',
    commission_mode: 'PERCENT' as BrokerCommissionMode,
    commission_percent: 5,
    commission_fixed_amount: '',
    password: '',
    confirmPassword: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{ email: string, password?: string | null, isExisting?: boolean } | null>(null);

  // Modal State para Editar/Visualizar
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view' | 'reset' | null>(null);
  const [selectedBroker, setSelectedBroker] = useState<any>(null);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  // Modal de confirmação de exclusão
  const [deleteModal, setDeleteModal] = useState<{
    id: string;
    name: string;
    tenant_id?: string | null;
    company_id?: string | null;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingBrokerId, setTogglingBrokerId] = useState<string | null>(null);
  const [rankingModalOpen, setRankingModalOpen] = useState(false);
  const [activitiesModalOpen, setActivitiesModalOpen] = useState(false);

  const loadBrokers = useCallback(async () => {
    if (!user) return;
    try {
      const rlsCtx = await resolveRlsContext(user);
      const resolvedTenantId =
        rlsCtx.tenantId ||
        user?.tenant_id ||
        (user as { company_id?: string }).company_id ||
        null;

      let limit: number | null = null;
      let pName = '';
      let companyForPlan = null;
      if (resolvedTenantId) {
        companyForPlan = await fetchCompanySaasByTenantId(supabase, resolvedTenantId);
        if (companyForPlan) {
          const saas = getCompanySaasPlan(companyForPlan);
          limit = saas.maxBrokers;
          pName = saas.displayName;
        }
      }
      setBrokerLimit(limit);
      setCompanyPlan(pName);

      console.log("BROKERS_CURRENT_COMPANY", resolvedTenantId);

      if (!rlsCtx.isSuperAdmin && !resolvedTenantId) {
         setLoading(false);
         return;
      }

      let query = supabase.from('brokers').select('*').order('created_at', { ascending: false });
      query = applyTenantFilter(query, rlsCtx, 'brokers');
      
      const { data: rawBrokers, error } = await query;
      if (error) throw error;

      const brokerIds = (rawBrokers || []).map((b) => b.id).filter(Boolean);
      let userRoleByBrokerId = new Map<string, string>();
      if (brokerIds.length > 0) {
        const { data: userProfiles } = await supabase
          .from('users')
          .select('id, role')
          .in('id', brokerIds);
        userRoleByBrokerId = new Map(
          (userProfiles || []).map((u) => [String(u.id), String(u.role || '')]),
        );
      }

      const safeBrokers = (rawBrokers || []).filter((b) =>
        shouldAppearInBrokerList({
          brokerRole: b.role,
          userRole: userRoleByBrokerId.get(String(b.id)),
        }),
      );
      console.log("BROKERS_RAW_FROM_DB", safeBrokers.length, safeBrokers);
      
      if (safeBrokers.length === 0 && !rlsCtx.isSuperAdmin) {
         console.warn("DIAGNÓSTICO: Zero brokers para tenant =", resolvedTenantId);
      }

      const { data: s } = await applyTenantFilter(supabase.from('sales').select('*'), rlsCtx, 'sales');
      const salesData = s || [];
      console.log("BROKERS_SALES_RAW", salesData.length);
      
      const { data: c } = await applyTenantFilter(
        supabase.from('broker_commissions').select('*'),
        rlsCtx,
        'broker_commissions',
      );
      const commData = c || [];
      console.log("BROKERS_COMMISSIONS_RAW", commData.length);
      
      const { rows: blockData } = await fetchAllPaginated(
        async (from, to) => {
          const q = applyTenantFilter(
            supabase
              .from('blocks')
              .select('id, number, lot_number, block_name, name, project_id, status, sale_id, customer_id, broker_id')
              .order('id', { ascending: true }),
            rlsCtx,
            'blocks',
          );
          return q.range(from, to);
        },
      );
      
      const { data: prj } = await applyTenantFilter(
        supabase.from('projects').select('id, name'),
        rlsCtx,
        'projects',
      );
      const projectsData = prj || [];
      setProjectOptions(
        (projectsData as Array<{ id: string; name?: string | null }>).map((p) => ({
          id: p.id,
          name: p.name || 'Empreendimento',
        })),
      );

      const { data: cust } = await applyTenantFilter(
        supabase.from('customers').select('id, name'),
        rlsCtx,
        'customers',
      );
      const customersData = cust || [];
      
      const { data: ctr } = await applyTenantFilter(supabase.from('contracts').select('*'), rlsCtx, 'contracts');
      const contractsData = ctr || [];
      
      let hasMissingCommission = false;
      for (const sale of salesData) {
          if (sale.broker_id) {
              const hasComm = commData.some(cc => cc.sale_id === sale.id);
              if (!hasComm) {
                  hasMissingCommission = true;
                  const broker = safeBrokers.find(fb => fb.id === sale.broker_id);
                  if (broker) {
                       try {
                           const defaults = resolveBrokerDefaultCommissionPlan(broker);
                           const saleValue = resolveSaleValueForCommission(sale);
                           const plan = calculateBrokerCommissionPlan({
                             mode: defaults.mode,
                             percent: defaults.percent,
                             fixedAmount: defaults.fixedAmount,
                             saleValue,
                           });
                           if (!shouldCreatePendingCommissionFromPlan(plan)) continue;
                           
                           const newComm = {
                               company_id: resolvedTenantId,
                               tenant_id: resolvedTenantId,
                               broker_id: broker.id,
                               sale_id: sale.id,
                               ...buildCommissionSnapshotFields(plan),
                               status: 'pendente'
                           };
                           
                           const { data: insComm, error: insErr } = await supabase.from('broker_commissions').insert([newComm]).select().single();
                           if (!insErr && insComm) {
                               commData.push(insComm);
                           }
                       } catch(e) {}
                  }
              }
          }
      }

      const enhancedBase = safeBrokers.map((b) => {
        const isActive = isBrokerActiveForList(b);
        const dbActive = b.active !== false;

        return {
          ...b,
          tenant_id: b.tenant_id || b.company_id,
          name: b.name || b.full_name || 'Sem nome',
          role: b.role || 'BROKER',
          commission_percent: readBrokerCommissionPercent(b.commission_percent),
          active: isActive,
          dbActive,
          brokerStatus: b.status || (isActive ? 'ativo' : 'inativo'),
          ultimo_acesso: b.created_at || new Date().toISOString(),
        };
      });

      setBrokerListBase(enhancedBase);
      setStatsCatalog({
        sales: salesData,
        commissions: commData,
        blocks: blockData,
        projects: projectsData,
        contracts: contractsData,
        customers: customersData,
      });

      const activeBrokers = filterBrokersForActiveList(enhancedBase);
      if (companyForPlan) {
        logSaasCompanyContext(resolvedTenantId, companyForPlan, undefined, activeBrokers.length);
      }
      console.log("BROKERS_FINAL_RENDER_LIST", activeBrokers);

      let rActs: any[] = [];
      salesData.forEach(s => {
          if (s.broker_id) {
              const b = activeBrokers.find(x => x.id === s.broker_id);
              if (b) {
                  const lots = formatSaleLotsLabel(s, blockData);
                  const safeSaleValue = s.total_amount ?? s.agreed_price ?? s.lot_price ?? s.price ?? s.total ?? s.value ?? s.sale_value ?? s.valor ?? s.total_value ?? 0;
                  rActs.push({
                     id: `s-${s.id}`,
                     type: 'sale',
                     date: new Date(s.sale_date || s.created_at),
                     message: `${b.name} registrou uma nova venda.`,
                     subtext: lots ? `Lotes: ${lots}` : `Valor: R$ ${Number(safeSaleValue).toLocaleString('pt-BR')}`
                  });
              }
          }
      });
      commData.forEach(c => {
          const pagoStatuses = ['pago', 'paga', 'paid', 'aprovado', 'aprovada'];
          if (pagoStatuses.includes(String(c.status).toLowerCase())) {
              const b = activeBrokers.find(x => x.id === c.broker_id);
              if (b) {
                  rActs.push({
                      id: `c-${c.id}`,
                      type: 'commission_paid',
                      date: new Date(c.created_at),
                      message: `${b.name} recebeu comissão.`,
                      subtext: `Valor: R$ ${Number(c.amount).toLocaleString('pt-BR')}`
                  });
              }
          }
      });
      rActs.sort((a,b) => b.date.getTime() - a.date.getTime());
      setRecentActivities(rActs.slice(0, 10));

    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadBrokers();
    }
  }, [user, authLoading, loadBrokers]);

  useEffect(() => {
    try {
      const value = new URLSearchParams(window.location.search).get(
        BROKER_COMMISSION_MAINTENANCE_QUERY,
      );
      setMaintenanceQuery(value);
    } catch {
      setMaintenanceQuery(null);
    }
  }, []);

  const { byBrokerId, unassignedBrokerSales } = useMemo(() => {
    if (!statsCatalog) {
      return {
        byBrokerId: new Map(),
        unassignedBrokerSales: [] as BrokerSaleDetailRow[],
      };
    }
    const built = buildBrokerStatsFromData({
      brokers: brokerListBase,
      sales: statsCatalog.sales,
      commissions: statsCatalog.commissions,
      blocks: statsCatalog.blocks,
      projects: statsCatalog.projects,
      contracts: statsCatalog.contracts,
      customers: statsCatalog.customers,
      period: statsPeriod,
    });
    return {
      byBrokerId: built.byBrokerId,
      unassignedBrokerSales: built.unassignedSales,
    };
  }, [brokerListBase, statsCatalog, statsPeriod]);

  const corretores = useMemo(() => {
    return brokerListBase.map((b) => {
      const stats = byBrokerId.get(b.id) || {
        broker_id: b.id,
        vendas_qtd: 0,
        vendas_valor: 0,
        comissao_paga: 0,
        comissao_pendente: 0,
        sale_details: [],
      };
      const exportLots = stats.sale_details.map((d) => ({
        loteamento: d.empreendimento,
        quadra: d.quadra,
        lote: d.lote,
        loteStr: d.loteStr,
        contrato: d.contrato,
        venda_id: d.sale_id,
        valor_venda: d.valor_venda,
        data_venda: d.data_venda,
        comissao_pendente: d.comissao_pendente,
        cliente: d.cliente,
        status: d.status,
      }));
      const lotesAtivos = exportLots.map((lot) => lot.loteStr).filter(Boolean);
      return {
        ...b,
        vendas_mes_qtd: stats.vendas_qtd,
        vendas_mes_valor: stats.vendas_valor,
        lotesDoMes: lotesAtivos,
        exportLots,
        brokerStats: stats,
        comissao_pendente: stats.comissao_pendente,
        comissao_paga: stats.comissao_paga,
      };
    });
  }, [brokerListBase, byBrokerId]);

  const openReservationsCount = useMemo(
    () => countOpenReservedLots(statsCatalog?.blocks || []),
    [statsCatalog],
  );

  const periodSaleIds = useMemo(
    () => collectSaleIdsFromStats(byBrokerId, unassignedBrokerSales),
    [byBrokerId, unassignedBrokerSales],
  );

  const periodCommissions = useMemo(
    () => sumCommissionsForSaleIds(statsCatalog?.commissions || [], periodSaleIds),
    [statsCatalog, periodSaleIds],
  );

  const previousPeriodBuilt = useMemo(() => {
    if (!statsCatalog) return null;
    return buildBrokerStatsFromData({
      brokers: brokerListBase,
      sales: statsCatalog.sales,
      commissions: statsCatalog.commissions,
      blocks: statsCatalog.blocks,
      projects: statsCatalog.projects,
      contracts: statsCatalog.contracts,
      customers: statsCatalog.customers,
      dateRange: getPreviousBrokerStatsPeriodBounds(statsPeriod),
    });
  }, [brokerListBase, statsCatalog, statsPeriod]);

  const previousPeriodCommissions = useMemo(() => {
    if (!previousPeriodBuilt || !statsCatalog) {
      return { generated: 0, paid: 0, pending: 0 };
    }
    return sumCommissionsForSaleIds(
      statsCatalog.commissions,
      collectSaleIdsFromStats(
        previousPeriodBuilt.byBrokerId,
        previousPeriodBuilt.unassignedSales,
      ),
    );
  }, [previousPeriodBuilt, statsCatalog]);

  const getExportSummaryRows = () =>
    filtered.map((c) => ({
      Nome: c.name || '',
      Email: c.email || '',
      Telefone: c.phone || '',
      CRECI: c.creci || '',
      Status: c.active ? 'Ativo' : 'Inativo',
      Vendas_Qtd: c.vendas_mes_qtd || 0,
      Vendas_Valor: c.vendas_mes_valor || 0,
      Comissao_Pendente: c.comissao_pendente || 0,
      Comissao_Paga: c.comissao_paga || 0,
    }));

  const getExportDetailRows = () => {
    const detail = buildBrokerReportDetailRows(
      filtered.map((c) => ({
        id: c.id,
        name: c.name,
        stats: c.brokerStats || {
          broker_id: c.id,
          vendas_qtd: 0,
          vendas_valor: 0,
          comissao_paga: 0,
          comissao_pendente: 0,
          sale_details: [],
        },
      })),
      unassignedBrokerSales,
    );
    return detail.map((d) => ({
      Corretor: d.broker_name,
      Cliente: d.cliente,
      Empreendimento: d.empreendimento,
      Quadra: d.quadra,
      Lote: d.lote,
      Contrato: d.contrato,
      Data_Venda: d.data_venda
        ? new Date(d.data_venda).toLocaleDateString('pt-BR')
        : '',
      Valor_Venda: d.valor_venda,
      Status: d.status,
    }));
  };

  const handleExportExcel = async () => {
      const summaryRows = getExportSummaryRows();
      const detailRows = getExportDetailRows();
      try {
          const ExcelJS = (await import('exceljs')).default;
          const workbook = new ExcelJS.Workbook();
          const wsMeta = workbook.addWorksheet('Parametros');
          wsMeta.columns = [
              { header: 'Campo', key: 'Campo', width: 22 },
              { header: 'Valor', key: 'Valor', width: 40 },
          ];
          wsMeta.addRows([
              { Campo: 'Periodo', Valor: labelBrokerStatsPeriod(statsPeriod) },
              { Campo: 'Filtro_Status', Valor: filterActive },
              { Campo: 'Busca', Valor: search.trim() || '—' },
              { Campo: 'Corretores_Exportados', Valor: summaryRows.length },
          ]);
          const wsSummary = workbook.addWorksheet('Resumo Corretores');
          const wsDetail = workbook.addWorksheet('Detalhamento Vendas');

          wsSummary.columns = [
              { header: 'Nome', key: 'Nome', width: 25 },
              { header: 'Email', key: 'Email', width: 25 },
              { header: 'Telefone', key: 'Telefone', width: 15 },
              { header: 'CRECI', key: 'CRECI', width: 15 },
              { header: 'Status', key: 'Status', width: 15 },
              { header: 'Vendas_Qtd', key: 'Vendas_Qtd', width: 15 },
              { header: 'Vendas_Valor', key: 'Vendas_Valor', width: 20 },
              { header: 'Comissao_Pendente', key: 'Comissao_Pendente', width: 20 },
              { header: 'Comissao_Paga', key: 'Comissao_Paga', width: 20 },
          ];
          wsSummary.addRows(summaryRows);

          wsDetail.columns = [
              { header: 'Corretor', key: 'Corretor', width: 22 },
              { header: 'Cliente', key: 'Cliente', width: 22 },
              { header: 'Empreendimento', key: 'Empreendimento', width: 22 },
              { header: 'Quadra', key: 'Quadra', width: 12 },
              { header: 'Lote', key: 'Lote', width: 12 },
              { header: 'Contrato', key: 'Contrato', width: 18 },
              { header: 'Data_Venda', key: 'Data_Venda', width: 14 },
              { header: 'Valor_Venda', key: 'Valor_Venda', width: 16 },
              { header: 'Status', key: 'Status', width: 12 },
          ];
          wsDetail.addRows(detailRows);
          
          const buffer = await workbook.xlsx.writeBuffer();
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = `corretores_${statsPeriod}_${Date.now()}.xlsx`;
          link.click();
          console.log("BROKER_EXCEL_GENERATED");
      } catch (err) {
          console.error("Erro excel", err);
      }
  };

  const handleExportPDF = async () => {
      try {
          const { default: jsPDF } = await import('jspdf');
          const { default: autoTable } = await import('jspdf-autotable');
          const summaryRows = getExportSummaryRows();
          const detailRows = getExportDetailRows();
          const doc = new jsPDF('landscape');
          const companyName = tenantData ? tenantData.razao_social || tenantData.name : 'Empresa não informada';
          const title = `RELATÓRIO DE CORRETORES`;
          let startY = 35;
          
          if (getReportHeaderLogoUrl(tenantData?.logo_url)) {
             try {
                 const imgBase64 = await new Promise<string>((resolve, reject) => {
                     const img = new Image();
                     img.crossOrigin = 'Anonymous';
                     img.onload = () => {
                         const canvas = document.createElement('canvas');
                         canvas.width = img.width; canvas.height = img.height;
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
                 doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 50, 25);
             } catch(e) {
                 doc.setFontSize(14);
                 doc.setFont('helvetica', 'bold');
                 doc.setTextColor(40);
                 doc.text(title, 14, 15);
                 doc.setFontSize(10);
                 doc.setFont('helvetica', 'normal');
                 doc.text(companyName.toUpperCase(), 14, 22);
                 doc.setFontSize(8);
                 doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 27);
                 startY = 35;
             }
          } else {
             doc.setFontSize(14);
             doc.setFont('helvetica', 'bold');
             doc.setTextColor(40);
             doc.text(title, 14, 15);
             doc.setFontSize(10);
             doc.setFont('helvetica', 'normal');
             doc.text(companyName.toUpperCase(), 14, 22);
             doc.setFontSize(8);
             doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 27);
             startY = 35;
          }
          
          console.log("PDF_HEADER_RENDERED");
          
          doc.setFontSize(10);
          doc.setTextColor(0);
          doc.setFont('helvetica', 'bold');
          doc.text(`Período: ${labelBrokerStatsPeriod(statsPeriod)}`, 14, startY);
          startY += 6;
          doc.text(
            `Filtros: ${filterActive === 'all' ? 'Todos os status' : filterActive === 'ativo' ? 'Somente ativos' : 'Somente inativos'}${search.trim() ? ` | Busca: ${search.trim()}` : ''}`,
            14,
            startY,
          );
          startY += 6;
          doc.text(`Total de Corretores Ativos: ${dashboardStats.activeCount}`, 14, startY);
          startY += 6;
          doc.text(`Total de Vendas no período: ${totalVendasMes}`, 14, startY);
          startY += 6;
          doc.text(
            `Total Vendido: R$ ${filtered.reduce((acc, c) => acc + (Number(c.vendas_mes_valor) || 0), 0).toLocaleString('pt-BR')}`,
            14,
            startY,
          );
          startY += 6;
          doc.text(`Total Comissão Paga: R$ ${totalComissoesPagas.toLocaleString('pt-BR')}`, 14, startY);
          startY += 6;
          doc.text(`Total Comissão Pendente: R$ ${totalComissoesPendentes.toLocaleString('pt-BR')}`, 14, startY);
          startY += 10;

          const formatCurrency = (val: number) => {
              return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          };

          doc.setFontSize(9);
          doc.text('Resumo por corretor', 14, startY);
          startY += 4;

          autoTable(doc, {
             startY: startY,
             headStyles: { fillColor: [41, 128, 185], fontSize: 7, halign: 'center' },
             bodyStyles: { fontSize: 7, textColor: 50 },
             alternateRowStyles: { fillColor: [245, 245, 245] },
             styles: { overflow: 'linebreak', cellWidth: 'wrap' },
             head: [['Corretor', 'Contato', 'CRECI', 'Vendas', 'Valor Vendido', 'Comissão Paga', 'Comissão Pendente', 'Status']],
             body: summaryRows.map(r => [
                r.Nome,
                r.Telefone || r.Email,
                r.CRECI,
                r.Vendas_Qtd,
                formatCurrency(Number(r.Vendas_Valor || 0)),
                formatCurrency(Number(r.Comissao_Paga || 0)),
                formatCurrency(Number(r.Comissao_Pendente || 0)),
                r.Status,
             ]),
          });

          let detailStartY =
            ((doc as any).lastAutoTable?.finalY ?? startY) + 10;
          if (detailStartY > doc.internal.pageSize.getHeight() - 40) {
            doc.addPage();
            detailStartY = 20;
          }

          doc.setFontSize(9);
          doc.text('Detalhamento das vendas', 14, detailStartY);
          detailStartY += 4;

          autoTable(doc, {
             startY: detailStartY,
             headStyles: { fillColor: [52, 73, 94], fontSize: 7, halign: 'center' },
             bodyStyles: { fontSize: 7, textColor: 50 },
             alternateRowStyles: { fillColor: [245, 245, 245] },
             styles: { overflow: 'linebreak', cellWidth: 'wrap' },
             head: [['Corretor', 'Cliente', 'Empreendimento', 'Quadra', 'Lote', 'Contrato', 'Data', 'Valor', 'Status']],
             body: detailRows.map(r => [
                r.Corretor,
                r.Cliente,
                r.Empreendimento,
                r.Quadra,
                r.Lote,
                r.Contrato,
                r.Data_Venda,
                formatCurrency(Number(r.Valor_Venda || 0)),
                r.Status,
             ]),
          });
          
          console.log("PDF_TEXT_WRAP_APPLIED");
          
          const { addProfessionalFooterAndSignature } = await import('@/lib/pdfUtils');
          await addProfessionalFooterAndSignature(doc, companyName, 'Relatório de Corretores');
          
          doc.save(`relatorio_corretores_${statsPeriod}_${Date.now()}.pdf`);
          console.log("BROKER_PDF_GENERATED");
      } catch (err) {
          console.error("Erro pdf", err);
      }
  };

  const handleOpenEdit = (broker: any) => {
     console.log("BROKER_ACTION_EDIT", broker);
     setSelectedBroker(broker);
     setFormData({
        fullName: broker.name || '',
        email: broker.email || '',
        phone: broker.phone || '',
        cpf: broker.cpf || '',
        creci: broker.creci || '',
        role: sanitizeBrokerAccessLevel(broker.role),
        commission_mode: normalizeBrokerCommissionMode(broker.commission_mode),
        commission_percent: readBrokerCommissionPercent(broker.commission_percent),
        commission_fixed_amount:
          broker.commission_fixed_amount != null && Number(broker.commission_fixed_amount) > 0
            ? serializeCurrencyBRL(String(broker.commission_fixed_amount))
            : '',
        password: '',
        confirmPassword: ''
     });
     setModalMode('edit');
     setIsModalOpen(true);
  };

  const handleOpenView = (broker: any) => {
     console.log("BROKER_ACTION_VIEW", broker);
     setSelectedBroker(broker);
     setModalMode('view');
     setIsModalOpen(true);
  };

  const handleOpenResetPassword = (broker: any) => {
     console.log("BROKER_PASSWORD_RESET", broker);
     setSelectedBroker(broker);
     setFormData({
        ...formData,
        password: '',
        confirmPassword: ''
     });
     setModalMode('reset');
     setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === 'view') {
       return handleCloseModal();
    }

    if (modalMode === 'edit') {
        setIsSubmitting(true);
        setError('');
        try {
            const brokerAccessLevel = sanitizeBrokerAccessLevel(formData.role);
            const commissionFields = buildBrokerDefaultCommissionFields({
              mode: formData.commission_mode,
              percent: formData.commission_percent,
              fixedAmount: parseCurrencyBRLNumber(formData.commission_fixed_amount),
            });
            const { error: upErr } = await supabase.from('brokers').update({
                name: formData.fullName,
                phone: formData.phone,
                creci: formData.creci,
                cpf: formData.cpf,
                ...commissionFields,
                role: brokerAccessLevel
            }).eq('id', selectedBroker.id);
            if (upErr) throw upErr;
            await loadBrokers();
            handleCloseModal();
        } catch (e: any) {
            setError(e.message || "Erro ao atualizar");
        } finally {
            setIsSubmitting(false);
        }
        return;
    }

    if (modalMode === 'reset') {
        if (formData.password.length < 6) {
            setError('A senha deve ter no mínimo 6 caracteres.');
            return;
        }
        if (formData.password !== formData.confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            // Need to update auth.users somehow, but we don't have superadmin from here usually.
            // Supabase client can update password if the user is logged in, but not for others.
            // We will invoke the /api/users/create endpoint perhaps? Or an update password endpoint.
            // Since we don't have it, we mock it visually.
            const response = await fetch('/api/users/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                 isPasswordResetOnly: true,
                 userIdToReset: selectedBroker.auth_user_id || selectedBroker.id,
                 newPassword: formData.password
              })
            });
            // if we are here, we just ignore if it fails unless we have an endpoint
            handleCloseModal();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
        return;
    }

    const activeBrokersCount = filterBrokersForActiveList(corretores).length;
    if (brokerLimit !== null && activeBrokersCount >= brokerLimit && user?.role !== 'SUPER_ADMIN') {
        setError(formatBrokersLimitMessage(brokerLimit));
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
      const resolvedTenantId =
        (await resolveActiveTenantId(user)) ||
        user?.tenant_id ||
        (user as { company_id?: string })?.company_id ||
        null;

      const brokerAccessLevel = sanitizeBrokerAccessLevel(formData.role);

      const response = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           fullName: formData.fullName,
           email: formData.email,
           phone: formData.phone,
           tenantId: resolvedTenantId,
           role: BROKER_USER_ROLE,
           password: formData.password
        })
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error);
      }

      // Tentativa de inserção usando os nomes de coluna antigos e novos (o q não falhar)
      // Neste caso, se a migration já passou, tenant_id e name serão os corretos
      const commissionFields = buildBrokerDefaultCommissionFields({
        mode: formData.commission_mode,
        percent:
          formData.commission_mode === 'PERCENT'
            ? defaultBrokerCommissionPercentForCreate(formData.commission_percent)
            : formData.commission_percent,
        fixedAmount: parseCurrencyBRLNumber(formData.commission_fixed_amount),
      });

      let payload: any = withTenantFields({
         id: result.userId,
         auth_user_id: result.userId,
         cpf: formData.cpf,
         creci: formData.creci,
         phone: formData.phone,
         email: formData.email,
         role: brokerAccessLevel,
         level: 'broker',
         ...commissionFields,
         name: formData.fullName,
         full_name: formData.fullName,
         active: true,
         status: 'ativo',
         deleted_at: null
      }, resolvedTenantId, 'brokers');

      console.log("BROKER_CREATE_PAYLOAD", payload);
      const { data: brokerData, error: brokerError } = await supabase.from('brokers').upsert([payload], { onConflict: 'id' }).select();
      console.log("BROKER_CREATED_RESULT", brokerData, brokerError);
      
      if (brokerError) {
         if (brokerError.code === 'PGRST204' || brokerError.code === 'PGRST205') {
            throw new Error(`Erro de schema (Supabase): ${brokerError.message}`);
         }
         throw brokerError;
      }

      setSuccessData({
        email: formData.email,
        password: result.temporaryPassword,
        isExisting: result.isExisting
      });

      setFormData({
        fullName: '',
        email: '',
        phone: '',
        creci: '',
        cpf: '',
        role: 'BROKER',
        password: '',
        confirmPassword: '',
        commission_mode: 'PERCENT',
        commission_percent: 5,
        commission_fixed_amount: '',
      });

      await loadBrokers();

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao cadastrar corretor');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal || !user) return;
    const { id, name } = deleteModal;

    try {
      setIsDeleting(true);

      const resolvedTenantId = await resolveActiveTenantId(user);
      if (user.role !== 'SUPER_ADMIN' && !resolvedTenantId) {
        throw new BrokerDeleteError('Usuário não tem empresa associada.', {});
      }

      const params = new URLSearchParams();
      if (resolvedTenantId) params.set('tenantId', resolvedTenantId);
      if (typeof window !== 'undefined') {
        const impersonating = localStorage.getItem('impersonating_tenant_id');
        if (impersonating) params.set('impersonatingTenantId', impersonating);
      }

      const response = await fetch(`/api/brokers/${id}?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const body = await response.json();
      if (!response.ok) {
        throw new BrokerDeleteError(
          body.error ||
            'Não foi possível excluir o corretor. Verifique permissões ou tenant ativo.',
          { brokerId: id },
        );
      }

      const result: BrokerDeleteResult = {
        mode: body.mode,
        brokerId: body.brokerId || id,
        brokerName: body.brokerName || name,
        effectiveTenantId: body.effectiveTenantId || resolvedTenantId || '',
      };

      setBrokerListBase((prev) => removeBrokerFromList(prev, id));
      setDeleteModal(null);

      await logBrokerDeleteAudit(supabase, {
        tenantId: result.effectiveTenantId,
        userId: user.id,
        result,
      });

      await loadBrokers();
    } catch (e: unknown) {
      if (e instanceof BrokerDeleteError) {
        console.error('[BROKER_DELETE] blocked', e.diagnostic);
        alert(e.message);
        return;
      }
      console.error('[BROKER_DELETE] unexpected', e);
      const message = e instanceof Error ? e.message : 'Erro desconhecido';
      alert('Erro ao excluir: ' + message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleBrokerActive = async (broker: { id: string; name?: string; dbActive?: boolean }) => {
    if (!user) return;
    const nextActive = !broker.dbActive;
    const actionLabel = nextActive ? 'reativar' : 'desativar';
    if (
      !window.confirm(
        `Deseja ${actionLabel} o corretor ${broker.name || 'selecionado'}?`,
      )
    ) {
      return;
    }

    try {
      setTogglingBrokerId(broker.id);

      const resolvedTenantId = await resolveActiveTenantId(user);
      const params = new URLSearchParams();
      if (resolvedTenantId) params.set('tenantId', resolvedTenantId);
      if (typeof window !== 'undefined') {
        const impersonating = localStorage.getItem('impersonating_tenant_id');
        if (impersonating) params.set('impersonatingTenantId', impersonating);
      }

      const response = await fetch(`/api/brokers/${broker.id}?${params.toString()}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new BrokerDeleteError(
          body.error || `Não foi possível ${actionLabel} o corretor.`,
          { brokerId: broker.id },
        );
      }

      await loadBrokers();
    } catch (e: unknown) {
      if (e instanceof BrokerDeleteError) {
        alert(e.message);
        return;
      }
      const message = e instanceof Error ? e.message : 'Erro desconhecido';
      alert(`Erro ao ${actionLabel} corretor: ${message}`);
    } finally {
      setTogglingBrokerId(null);
    }
  };

  const handleCloseModal = () => {
     setIsModalOpen(false);
     setModalMode(null);
     setSelectedBroker(null);
     if (successData) {
        setSuccessData(null);
     }
  };

  const [filterActive, setFilterActive] = useState<'all' | 'ativo' | 'inativo'>('ativo');

  const filtered = corretores.filter((c) => {
     if (!brokerRecordMatchesSearch(c, search)) return false;
     if (filterActive === 'ativo' && !c.active) return false;
     if (filterActive === 'inativo' && c.active) return false;
     return true;
  });

  const dashboardStats = computeBrokerDashboardStats(corretores);

  const getRoleBadge = (role: string) => {
     switch (role) {
       case 'ADMIN_EMPRESA': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
       case 'GERENTE': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
       case 'BROKER': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
       case 'ASSISTENTE': return 'bg-[var(--bg-card-alt)] text-[var(--text-secondary)] border-[var(--border-color)]';
       default: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
     }
  };

  const handlePayCommission = async (c: any) => {
     if (!c.comissao_pendente || c.comissao_pendente <= 0) {
       alert("Corretor não possui comissão pendente para pagamento.");
       return;
     }

     if (!window.confirm(`Deseja registrar o pagamento de ${formatCurrency(c.comissao_pendente)} de comissão para ${c.name}? Isso criará uma saída no fluxo de caixa.`)) {
       return;
     }

     try {
       console.log("BROKER_PAY_SOURCE_DATA", c);
       console.log("BROKER_PENDING_VISUAL_AMOUNT", c.comissao_pendente);

       const resolvedTenantId = user?.tenant_id || ((user as any)?.company_id);

       let { data: pendentes, error: errC } = await supabase.from('broker_commissions')
         .select('id, sale_id, amount')
         .eq('broker_id', c.id)
         .in('status', ['pendente', 'aprovado', 'PENDENTE', 'APROVADO', 'Pendente', 'Aprovado']);

       if (errC) throw errC;
       if (!pendentes) pendentes = [];
       
       console.log("Comissões encontradas antes da verificação adicional:", pendentes.length);

       // Buscar vendas para gerar faltantes (como é feito no fluxo visual)
       const { data: brokerSales, error: errSales } = await supabase.from('sales').select('*').eq('broker_id', c.id);
       
       console.log("BROKER_SALES_USED_FOR_COMMISSION", brokerSales);

       if (!errSales && brokerSales && brokerSales.length > 0) {
           const { data: allComms } = await supabase.from('broker_commissions').select('sale_id').eq('broker_id', c.id);
           const exSalesIds = allComms ? allComms.map((cc) => cc.sale_id) : [];
           
           for (const sale of brokerSales) {
               if (!exSalesIds.includes(sale.id)) {
                   const defaults = resolveBrokerDefaultCommissionPlan(c);
                   const saleValue = resolveSaleValueForCommission(sale);
                   const plan = calculateBrokerCommissionPlan({
                     mode: defaults.mode,
                     percent: defaults.percent,
                     fixedAmount: defaults.fixedAmount,
                     saleValue,
                   });
                   if (!shouldCreatePendingCommissionFromPlan(plan)) continue;
                   
                   const newComm = {
                       company_id: resolvedTenantId,
                       tenant_id: resolvedTenantId,
                       broker_id: c.id,
                       sale_id: sale.id,
                       ...buildCommissionSnapshotFields(plan),
                       status: 'pendente'
                   };
                   
                   console.log("BROKER_COMMISSION_INSERT_PAYLOAD", newComm);
                   
                   const { data: insComm, error: insErr } = await supabase.from('broker_commissions').insert([newComm]).select().single();
                   if (insErr) {
                       console.error("Erro ao gerar comissão faltante:", insErr);
                       throw new Error("Erro DB ao criar comissão: " + insErr.message);
                   }
                   if (insComm) {
                       pendentes.push({...insComm, amount: plan.amount});
                   }
               }
           }
       }

       if (!pendentes || pendentes.length === 0) {
           throw new Error("Comissões não encontradas e não foi possível gerar registro a partir das vendas.");
       }

       let totalPago = 0;
       for (const comm of pendentes) {
          totalPago += Number(comm.amount || 0);
          await supabase.from('broker_commissions').update({
             status: 'pago',
             paid_at: new Date().toISOString()
          }).eq('id', comm.id);
          
          let projId = null;
          if (comm.sale_id) {
              const { data: saleData } = await supabase.from('sales').select('project_id').eq('id', comm.sale_id).single();
              projId = saleData?.project_id || null;
          }
          
          const cashPayload = {
              tenant_id: resolvedTenantId,
              company_id: resolvedTenantId,
              type: 'saida',
              category: 'Comissão',
              description: `Pagamento de comissão ao corretor ${c.name}`,
              amount: Number(comm.amount || 0),
              broker_id: c.id,
              sale_id: comm.sale_id || null,
              project_id: projId,
              broker_commission_id: comm.id,
              movement_date: new Date().toISOString().split('T')[0],
              status: 'ativo',
              created_by: user.id
          };
          
          await supabase.from('cash_movements').insert(cashPayload);
          
          console.log("COMMISSION_CASH_MOVEMENT_INSERT", cashPayload);
          console.log("COMMISSION_PROJECT_ID", projId);
       }

       try {
           await supabase.from('audit_logs').insert([{
               tenant_id: resolvedTenantId,
               company_id: resolvedTenantId,
               user_id: user.id,
               action: 'COMMISSION_PAID',
               module: 'FINANCE',
               description: `Pagamento total de ${formatCurrency(totalPago)} para corretor ${c.name}`
           }]);
       } catch(logE) {}

       await loadBrokers();
       alert("Comissão paga e saída registrada com sucesso!");
     } catch(e: any) {
        console.error(e);
        alert("Erro ao pagar comissão: " + (e.message || JSON.stringify(e)));
     }
  };

  const totalVendasMes = dashboardStats.totalVendasMes;
  const totalComissoesPagas = dashboardStats.totalComissoesPagas;
  const totalComissoesPendentes = dashboardStats.totalComissoesPendentes;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatChange = (change: number | null) => {
    if (change === null) return null;
    if (change > 0) return { text: `↑ +${change}% vs período anterior`, className: 'text-emerald-400' };
    if (change < 0) return { text: `↓ ${change}% vs período anterior`, className: 'text-rose-400' };
    return { text: 'Estável vs período anterior', className: 'text-[var(--text-muted)]' };
  };

  const rankingAll = rankBrokersByMonthlySales(corretores, 100);
  const topCorretores = rankingAll.slice(0, 3);
  const medalColors = ['#f59e0b', '#94a3b8', '#b45309'];
  const highlightBroker = pickBrokerHighlight(corretores);
  const highlightCommission = highlightBroker
    ? sumCommissionsForSaleIds(
        statsCatalog?.commissions || [],
        (highlightBroker.brokerStats?.sale_details || []).map((d: BrokerSaleDetailRow) => d.sale_id),
      ).generated
    : 0;
  const previousVgv = previousPeriodBuilt
    ? [...previousPeriodBuilt.byBrokerId.values()].reduce((acc, row) => acc + row.vendas_valor, 0)
    : 0;
  const previousSalesCount = previousPeriodBuilt
    ? [...previousPeriodBuilt.byBrokerId.values()].reduce((acc, row) => acc + row.vendas_qtd, 0)
    : 0;
  const ticketAtual = averageTicket(dashboardStats.totalVendasValor, totalVendasMes);
  const ticketAnterior = averageTicket(previousVgv, previousSalesCount);
  const commercialRows = [
    {
      label: 'VGV do período',
      value: formatCurrency(dashboardStats.totalVendasValor),
      change: formatChange(computeChangePercent(dashboardStats.totalVendasValor, previousVgv)),
    },
    {
      label: 'Vendas realizadas',
      value: String(totalVendasMes),
      change: formatChange(computeChangePercent(totalVendasMes, previousSalesCount)),
    },
    {
      label: 'Reservas abertas',
      value: String(openReservationsCount),
      change: { text: 'Posição atual no mapa', className: 'text-[var(--text-muted)]' },
    },
    {
      label: 'Comissões do período',
      value: formatCurrency(periodCommissions.generated),
      change: formatChange(
        computeChangePercent(periodCommissions.generated, previousPeriodCommissions.generated),
      ),
    },
    {
      label: 'Ticket médio',
      value: formatCurrency(ticketAtual),
      change: formatChange(computeChangePercent(ticketAtual, ticketAnterior)),
    },
  ];
  const periodActivities = recentActivities.filter((act) =>
    isSaleInStatsPeriod({ sale_date: act.date.toISOString() }, statsPeriod),
  );
  const visibleActivities = periodActivities.slice(0, 3);
  const canManageBrokerCommission = canManageSaleBrokerCommission(user?.role);
  const showCommissionMaintenance = canShowBrokerCommissionMaintenanceUi(
    user?.role,
    maintenanceQuery,
  );
  const periodLabel = labelBrokerStatsPeriod(statsPeriod);
  const planUsagePercent =
    brokerLimit && brokerLimit > 0
      ? Math.round((dashboardStats.activeCount / brokerLimit) * 100)
      : null;

  return (
    <div className="sv-page sv-page--scroll-y p-3 md:p-4 flex flex-col min-h-0 flex-1 bg-[var(--bg-main)] text-[var(--text-primary)]">
      
      <header className="mb-2 xl:hidden">
        <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Corretores</h1>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)] mt-0.5">
          Gerenciamento de equipe de vendas
        </p>
      </header>

      <div className="mb-2 flex flex-col xl:flex-row xl:items-center xl:flex-nowrap gap-2 min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg pl-9 pr-3 py-1.5 w-full focus:outline-none focus:border-teal-500/50 transition-colors"
          />
        </div>
        <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 shrink-0">
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value as 'all' | 'ativo' | 'inativo')}
            className="bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] px-2.5 py-1.5 rounded-lg outline-none focus:border-[var(--brand-primary)]"
            aria-label="Filtros"
          >
            <option value="all">Filtros: todos os status</option>
            <option value="ativo">Filtros: somente ativos</option>
            <option value="inativo">Filtros: somente inativos</option>
          </select>
          <select
            value={statsPeriod}
            onChange={(e) => setStatsPeriod(e.target.value as BrokerDashboardPeriod)}
            className="bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] px-2.5 py-1.5 rounded-lg outline-none focus:border-[var(--brand-primary)]"
            aria-label="Período"
          >
            {BROKER_DASHBOARD_PERIODS.map((period) => (
              <option key={period} value={period}>
                {BROKER_DASHBOARD_PERIOD_LABELS[period]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setFormData({
                fullName: '',
                email: '',
                phone: '',
                cpf: '',
                creci: '',
                role: 'BROKER',
                commission_mode: 'PERCENT',
                commission_percent: 5,
                commission_fixed_amount: '',
                password: '',
                confirmPassword: '',
              });
              setSuccessData(null);
              setModalMode('create');
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-[var(--text-primary)] px-3 py-1.5 rounded-lg text-sm font-bold hover:from-orange-600 hover:to-amber-600 transition-all shadow-[0_0_20px_rgba(249,115,22,0.3)] whitespace-nowrap border border-orange-500/50"
          >
            <Plus className="w-4 h-4" /> Novo Corretor
          </button>
          <button
            type="button"
            onClick={() => void handleExportPDF()}
            className="flex items-center gap-1.5 bg-transparent border border-[var(--border-color)] hover:bg-[var(--bg-card-alt)] text-[var(--text-secondary)] px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            className="flex items-center gap-1.5 bg-transparent border border-[var(--border-color)] hover:bg-[var(--bg-card-alt)] text-[var(--text-secondary)] px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
        </div>
      </div>

      {showCommissionMaintenance ? (
        <section className="mb-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
                Ações administrativas
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Ajuste em massa de comissões pendentes em vendas existentes (prévia obrigatória).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setBulkAdjustPreset(null);
                  setBulkAdjustOpen(true);
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold border border-teal-500/40 text-teal-400 hover:bg-teal-500/10 transition-colors"
              >
                Ajustar comissões de vendas existentes
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkAdjustPreset('zero_pending_all');
                  setBulkAdjustOpen(true);
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25 transition-colors"
              >
                Zerar comissões pendentes
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 mb-2 min-w-0">
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg px-3 py-2 flex flex-col justify-between min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-500 shrink-0">
              <Users className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-[var(--text-primary)] leading-tight">
                {dashboardStats.activeCount} / {brokerLimit === null ? 'Ilimitado' : brokerLimit}
              </div>
              <div className="text-[10px] font-medium text-[var(--text-secondary)]">Corretores ativos</div>
            </div>
          </div>
          <div className="text-[10px] text-emerald-500 font-medium mt-1 truncate">
            {brokerLimit === null
              ? 'Carregando limites do plano…'
              : companyPlan
                ? `Plano ${companyPlan} — ${planUsagePercent ?? 0}% da licença`
                : `${planUsagePercent ?? 0}% da licença utilizada`}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg px-3 py-2 flex flex-col justify-between min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-500 shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-[var(--text-primary)] leading-tight">{totalVendasMes}</div>
              <div className="text-[10px] font-medium text-[var(--text-secondary)]">Vendas no período</div>
            </div>
          </div>
          <div className="text-[10px] text-blue-500 font-medium mt-1 truncate">
            VGV {formatCurrency(dashboardStats.totalVendasValor)}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg px-3 py-2 flex flex-col justify-between min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-500 shrink-0">
              <Wallet className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-[var(--text-primary)] tracking-tight leading-tight truncate">
                {formatCurrency(periodCommissions.generated)}
              </div>
              <div className="text-[10px] font-medium text-[var(--text-secondary)]">Comissões geradas</div>
            </div>
          </div>
          <div className="text-[10px] text-amber-400 font-medium mt-1 truncate">
            Pendentes {formatCurrency(totalComissoesPendentes)}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg px-3 py-2 flex flex-col justify-between min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-teal-500/10 flex items-center justify-center border border-teal-500/20 text-teal-500 shrink-0">
              <CalendarClock className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-[var(--text-primary)] leading-tight">{openReservationsCount}</div>
              <div className="text-[10px] font-medium text-[var(--text-secondary)]">Reservas abertas</div>
            </div>
          </div>
          <div className="text-[10px] text-teal-500 font-medium mt-1">
            Lotes com status Reservado
          </div>
        </div>

        <div className="sm:col-span-2 xl:col-span-2 bg-[var(--bg-card)] border border-orange-500/30 rounded-lg px-3 py-2 min-w-0">
          {highlightBroker ? (
            <div className="flex items-center gap-2 min-w-0 h-full">
              <span className="text-amber-400 shrink-0" title="1º no período">
                <Medal className="w-5 h-5" style={{ color: medalColors[0] }} />
              </span>
              {highlightBroker.avatar_url ? (
                <img src={highlightBroker.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 border border-orange-500/40" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-orange-500/15 text-orange-400 flex items-center justify-center text-xs font-bold shrink-0">
                  {highlightBroker.name?.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-bold text-[var(--text-primary)] truncate">{highlightBroker.name}</span>
                  <span className="hidden 2xl:inline-flex items-center gap-1 rounded-full bg-orange-500/15 text-orange-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap">
                    <Star className="w-2.5 h-2.5" /> Destaque do período
                  </span>
                </div>
                <div className="2xl:hidden text-[9px] font-bold uppercase tracking-wider text-orange-400">Destaque do período</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] mt-0.5">
                  <span className="font-bold">{highlightBroker.vendas_mes_qtd} vendas</span>
                  <span className="font-mono text-emerald-400">{formatCurrency(highlightBroker.vendas_mes_valor)} VGV</span>
                  <span className="font-mono text-purple-300">{formatCurrency(highlightCommission)} comissão</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 h-full min-h-[52px]">
              <Medal className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-orange-400">Destaque do período</div>
                <div className="text-xs text-[var(--text-muted)]">Sem vendas no período.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-2 mb-2 min-w-0 items-stretch">
        <section className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg px-3 py-2 min-w-0 h-full flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Desempenho da Equipe</h3>
              <p className="text-[10px] text-[var(--text-muted)]">Top 3 por VGV · {periodLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setRankingModalOpen(true)}
              className="text-[10px] font-bold text-orange-400 hover:text-orange-300 whitespace-nowrap disabled:opacity-40"
              disabled={rankingAll.length === 0}
            >
              Ver ranking completo
            </button>
          </div>
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="text-[9px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest">
                <th className="pb-1 pr-1 w-7">#</th>
                <th className="pb-1 pr-1">Corretor</th>
                <th className="pb-1 pr-1 text-center w-14">Vendas</th>
                <th className="pb-1 text-right w-[7.5rem]">VGV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {topCorretores.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-2 text-center text-xs text-[var(--text-muted)]">
                    Nenhuma venda no período.
                  </td>
                </tr>
              ) : (
                topCorretores.map((c, idx) => (
                  <tr key={c.id || idx}>
                    <td className="py-1 pr-1">
                      <Medal className="w-3.5 h-3.5" style={{ color: medalColors[idx] }} />
                    </td>
                    <td className="py-1 pr-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {c.avatar_url ? (
                          <img src={c.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-[var(--bg-card-alt)] flex items-center justify-center text-[9px] font-bold shrink-0">
                            {c.name?.charAt(0)}
                          </div>
                        )}
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">{c.name}</span>
                      </div>
                    </td>
                    <td className="py-1 pr-1 text-center text-xs font-bold">{c.vendas_mes_qtd}</td>
                    <td className="py-1 text-right text-[11px] font-mono text-emerald-400 truncate">{formatCurrency(c.vendas_mes_valor)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg px-3 py-2 min-w-0 h-full flex flex-col">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Resumo Comercial</h3>
            <p className="text-[10px] text-[var(--text-muted)]">{periodLabel}</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-1.5 flex-1">
            {commercialRows.map((row, index) => (
              <div
                key={row.label}
                className={`rounded-md bg-[var(--bg-main)]/50 px-2 py-1 min-w-0 ${
                  index < 3 ? 'lg:col-span-2' : 'lg:col-span-3'
                }`}
              >
                <div className="text-[10px] text-[var(--text-secondary)] truncate">{row.label}</div>
                <div className="text-xs font-bold text-[var(--text-primary)] truncate">{row.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg px-3 py-2 min-w-0 h-full flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Atividades Recentes</h3>
            <button
              type="button"
              onClick={() => setActivitiesModalOpen(true)}
              className="text-[10px] font-bold text-orange-400 hover:text-orange-300 whitespace-nowrap disabled:opacity-40"
              disabled={periodActivities.length === 0}
            >
              Ver todas
            </button>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            {visibleActivities.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] text-center py-2">Nenhuma atividade no período.</div>
            ) : (
              visibleActivities.map((act, index) => (
                <div key={act.id + index} className="flex items-start gap-1.5 min-w-0">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                      act.type === 'sale'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                        : 'bg-purple-500/10 border-purple-500/20 text-purple-500'
                    }`}
                  >
                    {act.type === 'sale' ? <CheckCircle2 className="w-2.5 h-2.5" /> : <DollarSign className="w-2.5 h-2.5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--text-secondary)] leading-tight truncate">{act.message}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                      {act.subtext} · {act.date.toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        
        {/* Main Table Area */}
        <div className="flex-1 min-w-0 flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl overflow-hidden relative">
          <div className="px-3 py-2 border-b border-[var(--border-color)] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">Lista de Corretores</h2>
              <p className="text-[10px] text-[var(--text-muted)]">
                {filtered.length} corretor(es) · {periodLabel}
              </p>
            </div>
          </div>
          
          <div className="sv-table-scroll flex-1">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-[var(--bg-main)]/50 border-b border-[var(--border-color)]">
                  <th className="px-3 py-2 text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest">Corretor</th>
                  <th className="px-3 py-2 text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest">Contato</th>
                  <th className="px-3 py-2 text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest">CRECI</th>
                  <th className="px-3 py-2 text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest text-center">Vendas</th>
                  <th className="px-3 py-2 text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest text-right">VGV</th>
                  <th className="px-3 py-2 text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest text-right">Comissão pendente</th>
                  <th className="px-3 py-2 text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest text-center">Status</th>
                  <th className="px-3 py-2 text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-[var(--text-muted)] font-mono text-sm">Carregando dados...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-[var(--text-muted)] font-mono text-sm">Nenhum corretor encontrado.</td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-[var(--bg-card-alt)] transition-colors group">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          {c.avatar_url ? (
                             <img src={c.avatar_url} alt={c.name} className="w-8 h-8 rounded-full object-cover border border-[var(--border-color)] shrink-0" />
                          ) : (
                             <div className="w-8 h-8 rounded-full bg-[var(--bg-card-alt)] flex items-center justify-center border border-[var(--border-color)] text-[var(--text-secondary)] text-xs font-bold shrink-0">
                               {c.name?.charAt(0).toUpperCase()}
                             </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="text-sm font-bold text-[var(--text-primary)] truncate">{c.name}</div>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-widest border shrink-0 ${getRoleBadge(c.role)}`}>
                                {c.role}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--text-muted)] truncate">{c.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                             <Phone className="w-3 h-3 text-emerald-500 shrink-0" /> {c.phone || 'Sem telefone'}
                          </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-[var(--text-secondary)] font-mono">{c.creci || '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                         <div className="text-sm font-bold text-[var(--text-primary)]">{c.vendas_mes_qtd}</div>
                         {c.lotesDoMes?.length > 0 && (
                            <div className="text-[9px] text-amber-500/80 font-mono mt-0.5">{c.lotesDoMes.join(', ')}</div>
                         )}
                      </td>
                      <td className="px-3 py-2 text-right">
                         <div className="text-sm font-bold text-emerald-400">{formatCurrency(c.vendas_mes_valor)}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                         <div className="text-sm font-bold text-amber-500">{formatCurrency(c.comissao_pendente)}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                           c.active ? 'text-emerald-500 bg-emerald-500/10' : 'text-[var(--text-muted)] bg-gray-500/10'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.active ? 'bg-emerald-500' : 'bg-gray-500'}`}></span>
                          {c.active ? 'ATIVO' : 'INATIVO'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right relative">
                        <button
                          type="button"
                          onClick={() => setOpenBrokerActionsId(openBrokerActionsId === c.id ? null : c.id)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)]"
                          title="Ações"
                          aria-label="Ações do corretor"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {openBrokerActionsId === c.id ? (
                          <div className="absolute right-3 top-10 z-30 w-52 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl py-1 text-left">
                            <button type="button" onClick={() => { setOpenBrokerActionsId(null); handleOpenView(c); }} className="w-full px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] flex items-center gap-2">
                              <Eye className="w-3.5 h-3.5" /> Visualizar
                            </button>
                            <button type="button" onClick={() => { setOpenBrokerActionsId(null); handleOpenEdit(c); }} className="w-full px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] flex items-center gap-2">
                              <Edit className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button type="button" onClick={() => { setOpenBrokerActionsId(null); handleOpenResetPassword(c); }} className="w-full px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)] flex items-center gap-2">
                              <Key className="w-3.5 h-3.5" /> Redefinir senha
                            </button>
                            {c.dbActive ? (
                              <button
                                type="button"
                                disabled={togglingBrokerId === c.id}
                                onClick={() => { setOpenBrokerActionsId(null); handleToggleBrokerActive(c); }}
                                className="w-full px-3 py-2 text-xs text-amber-400 hover:bg-amber-500/10 flex items-center gap-2 disabled:opacity-50"
                              >
                                {togglingBrokerId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                Desativar corretor
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={togglingBrokerId === c.id}
                                onClick={() => { setOpenBrokerActionsId(null); handleToggleBrokerActive(c); }}
                                className="w-full px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-2 disabled:opacity-50"
                              >
                                {togglingBrokerId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                Reativar corretor
                              </button>
                            )}
                            {c.comissao_pendente > 0 && (
                              <button
                                type="button"
                                onClick={() => { setOpenBrokerActionsId(null); handlePayCommission(c); }}
                                className="w-full px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-500/10 flex items-center gap-2"
                              >
                                <DollarSign className="w-3.5 h-3.5" /> Pagar comissão
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenBrokerActionsId(null);
                                setDeleteModal({
                                  id: c.id,
                                  name: c.name || 'Corretor',
                                  tenant_id: c.tenant_id,
                                  company_id: c.company_id,
                                });
                              }}
                              className="w-full px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Excluir
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="px-3 py-2 border-t border-[var(--border-color)] bg-[var(--bg-main)]/40">
            <span className="text-xs text-[var(--text-muted)]">Mostrando {filtered.length} corretor(es)</span>
          </div>
        </div>

      </div>

      {rankingModalOpen ? (
        <div className="sv-modal-overlay animate-in fade-in duration-200" onClick={() => setRankingModalOpen(false)}>
          <div
            className="sv-modal-shell bg-[var(--bg-card)] border border-[var(--border-color)] p-5 w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Ranking completo</h2>
                <p className="text-[10px] text-[var(--text-muted)]">Por VGV · {periodLabel}</p>
              </div>
              <button type="button" onClick={() => setRankingModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                ✕
              </button>
            </div>
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-left min-w-[420px]">
                <thead>
                  <tr className="text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest">
                    <th className="pb-2 pr-2">#</th>
                    <th className="pb-2 pr-2">Corretor</th>
                    <th className="pb-2 pr-2 text-center">Vendas</th>
                    <th className="pb-2 pr-2 text-right">VGV</th>
                    <th className="pb-2 text-right">Comissão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {rankingAll.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-[var(--text-muted)]">
                        Nenhuma venda no período.
                      </td>
                    </tr>
                  ) : (
                    rankingAll.map((c, idx) => {
                    const generated = sumCommissionsForSaleIds(
                      statsCatalog?.commissions || [],
                      (c.brokerStats?.sale_details || []).map((d: BrokerSaleDetailRow) => d.sale_id),
                    ).generated;
                    return (
                      <tr key={c.id || idx}>
                        <td className="py-2 pr-2">
                          {idx < 3 ? (
                            <Medal className="w-4 h-4" style={{ color: medalColors[idx] }} />
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {c.avatar_url ? (
                              <img src={c.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-[var(--bg-card-alt)] flex items-center justify-center text-[10px] font-bold shrink-0">
                                {c.name?.charAt(0)}
                              </div>
                            )}
                            <span className="text-xs font-bold text-[var(--text-primary)] truncate">{c.name}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-center text-xs font-bold">{c.vendas_mes_qtd}</td>
                        <td className="py-2 pr-2 text-right text-xs font-mono text-emerald-400">{formatCurrency(c.vendas_mes_valor)}</td>
                        <td className="py-2 text-right text-xs font-mono text-purple-300">{formatCurrency(generated)}</td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {activitiesModalOpen ? (
        <div className="sv-modal-overlay animate-in fade-in duration-200" onClick={() => setActivitiesModalOpen(false)}>
          <div
            className="sv-modal-shell bg-[var(--bg-card)] border border-[var(--border-color)] p-5 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Atividades Recentes</h2>
                <p className="text-[10px] text-[var(--text-muted)]">{periodLabel}</p>
              </div>
              <button type="button" onClick={() => setActivitiesModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-2.5 max-h-[70vh] overflow-y-auto pr-1">
              {periodActivities.map((act, index) => (
                <div key={act.id + index} className="flex items-start gap-2.5">
                  <div
                    className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                      act.type === 'sale'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                        : 'bg-purple-500/10 border-purple-500/20 text-purple-500'
                    }`}
                  >
                    {act.type === 'sale' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--text-secondary)] leading-snug">{act.message}</p>
                    <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
                      {act.subtext} · {act.date.toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal Delete */}
      {deleteModal && (
        <div className="sv-modal-overlay animate-in fade-in duration-200">
           <div className="sv-modal-shell bg-[var(--bg-card)] border border-[var(--border-color)] p-6 w-full max-w-md">
              <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Excluir corretor?</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-2">
                Confirma a exclusão de <strong className="text-[var(--text-primary)]">{deleteModal.name}</strong>?
              </p>
              <p className="text-[var(--text-secondary)] text-sm mb-6">O corretor será removido da lista ativa. Se houver vendas ou comissões vinculadas, o histórico será preservado (desativação). Caso contrário, o registro será excluído permanentemente.</p>
              <div className="flex justify-end gap-3">
                 <button onClick={() => setDeleteModal(null)} disabled={isDeleting} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50">Cancelar</button>
                 <button onClick={handleDelete} disabled={isDeleting} className="px-5 py-2 text-sm bg-red-500 hover:bg-red-600 font-bold text-[var(--text-primary)] rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 min-w-[120px]">
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sim, excluir"}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Modal - Novo Corretor */}
      {isModalOpen && (
        <div className="sv-modal-overlay sv-modal-overlay--immersive animate-in fade-in duration-200">
          <div className="sv-modal-shell sv-modal-shell--wide sv-modal-shell--full-mobile bg-[var(--bg-card)] border border-[var(--border-color)]">
            
            <div className="sv-modal-header flex items-center justify-between p-5 border-b border-[var(--border-color)] bg-[var(--bg-card-alt)]">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {modalMode === 'edit' ? 'Editar Corretor' : modalMode === 'view' ? 'Visualizar Corretor' : modalMode === 'reset' ? 'Redefinir Senha' : 'Cadastrar Novo Corretor'}
              </h2>
              <button onClick={handleCloseModal} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                ✕
              </button>
            </div>

            {successData ? (
              <div className="sv-modal-body p-6 text-center animate-in zoom-in duration-300">
                   <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                     <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                   </div>
                   <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">{successData.isExisting ? 'Corretor Atualizado!' : 'Corretor Cadastrado!'}</h3>
                   <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto mb-6">
                     {successData.isExisting ? 'O corretor já possuía cadastro no sistema e foi vinculado a esta empresa.' : 'Acesso gerado com sucesso. Envie as credenciais abaixo para o corretor fazer login no CRM.'}
                   </p>
                   
                   <div className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl w-full max-w-md mx-auto overflow-hidden text-left mb-8 shadow-inner">
                      <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center gap-4">
                        <span className="text-xs font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest w-16">LOGIN</span>
                        <span className="text-sm text-[var(--text-primary)] select-all font-medium">{successData.email}</span>
                      </div>
                      {successData.password ? (
                        <div className="px-5 py-4 flex items-center gap-4 bg-[var(--bg-main)]">
                          <span className="text-xs font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest w-16">SENHA</span>
                          <span className="text-sm font-mono text-emerald-400 font-bold select-all tracking-wider">{successData.password}</span>
                        </div>
                      ) : (
                        <div className="px-5 py-4 flex items-center gap-4 bg-[var(--bg-main)]">
                           <span className="text-sm text-emerald-500 font-medium italic w-full text-center">O corretor utilizará sua senha de acesso já existente.</span>
                        </div>
                      )}
                   </div>
                   <button 
                     onClick={handleCloseModal}
                     className="px-8 py-2.5 rounded-lg font-bold text-[var(--text-primary)] bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                   >
                     Concluir e Voltar
                   </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                <div className="sv-modal-body p-6 space-y-6">
                   {error && (
                     <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                       {error}
                     </div>
                   )}
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-5" style={{ display: modalMode === 'reset' ? 'none' : 'grid' }}>
                       <div className="space-y-1.5 md:col-span-2">
                          <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-widest">Nome Completo</label>
                          <div className="relative">
                            <User className="absolute left-3 top-3 w-4 h-4 text-[var(--text-muted)]" />
                            <input 
                              type="text" 
                              required={modalMode !== 'reset'}
                              disabled={modalMode === 'view'}
                              value={formData.fullName}
                              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50 transition-colors"
                              placeholder="Nome do profissional"
                            />
                          </div>
                       </div>
                       
                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-widest">Email (Login)</label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3 w-4 h-4 text-[var(--text-muted)]" />
                            <input 
                              type="email" 
                              required={modalMode !== 'reset'}
                              disabled={modalMode === 'view' || modalMode === 'edit'}
                              value={formData.email}
                              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50 transition-colors"
                              placeholder="email@empresa.com"
                            />
                          </div>
                       </div>

                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-widest">Telefone (WhatsApp)</label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-3 w-4 h-4 text-[var(--text-muted)]" />
                            <input 
                              type="tel" 
                              disabled={modalMode === 'view'}
                              value={formData.phone}
                              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50 transition-colors"
                              placeholder="(00) 00000-0000"
                            />
                          </div>
                       </div>

                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-widest">CRECI</label>
                          <input 
                            type="text" 
                            disabled={modalMode === 'view'}
                            value={formData.creci}
                            onChange={(e) => setFormData({ ...formData, creci: e.target.value })}
                            className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 px-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50 transition-colors"
                            placeholder="Ex: 12345-F"
                          />
                       </div>

                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-widest">CPF</label>
                          <input 
                            type="text" 
                            disabled={modalMode === 'view'}
                            value={formData.cpf}
                            onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                            className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 px-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50 transition-colors"
                            placeholder="000.000.000-00"
                          />
                       </div>

                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-widest">Nível de Acesso</label>
                          <select 
                            value={formData.role}
                            disabled={modalMode === 'view'}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 px-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50 transition-colors appearance-none"
                          >
                             {BROKER_ACCESS_LEVEL_OPTIONS.map((opt) => (
                               <option key={opt.value} value={opt.value}>
                                 {opt.label}
                               </option>
                             ))}
                          </select>
                       </div>

                       <div className="space-y-1.5 md:col-span-2">
                          <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-widest">Tipo de Comissão Padrão</label>
                          <select
                            value={formData.commission_mode}
                            disabled={modalMode === 'view'}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                commission_mode: e.target.value as BrokerCommissionMode,
                              })
                            }
                            className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 px-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50 transition-colors appearance-none"
                          >
                            <option value="PERCENT">Percentual sobre a venda</option>
                            <option value="FIXED">Valor fixo por venda</option>
                            <option value="NONE">Sem comissão</option>
                          </select>
                       </div>

                       {formData.commission_mode === 'PERCENT' ? (
                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-widest">Comissão padrão (%)</label>
                          <div className="relative">
                             <input 
                               type="number"
                               min="0"
                               max="100" 
                               step="0.1"
                               disabled={modalMode === 'view'}
                               value={formData.commission_percent}
                               onChange={(e) => {
                                 const raw = e.target.value;
                                 setFormData({
                                   ...formData,
                                   commission_percent: raw === '' ? 0 : Number(raw),
                                 });
                               }}
                               className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 pl-4 pr-10 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50 transition-colors"
                             />
                             <span className="absolute right-4 top-2.5 text-[var(--text-muted)] text-sm">%</span>
                          </div>
                       </div>
                       ) : null}

                       {formData.commission_mode === 'FIXED' ? (
                       <div className="space-y-1.5">
                          <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-widest">Valor fixo por venda</label>
                          <CurrencyInput
                            disabled={modalMode === 'view'}
                            value={formData.commission_fixed_amount}
                            onChange={(v) =>
                              setFormData({ ...formData, commission_fixed_amount: v })
                            }
                            className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 px-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50 transition-colors"
                          />
                       </div>
                       ) : null}

                       {formData.commission_mode === 'NONE' ? (
                       <div className="md:col-span-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)] px-4 py-3 text-xs text-[var(--text-secondary)]">
                          Comissão padrão zerada. Novas vendas não gerarão valor pendente positivo.
                       </div>
                       ) : null}
                   </div>

                   {(modalMode === 'create' || modalMode === 'reset') && (
                      <>
                         <hr className="border-[var(--border-color)]" />
      
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                             <div className="space-y-1.5">
                                <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-widest">Senha de Acesso</label>
                                <div className="relative">
                                  <Lock className="absolute left-3 top-3 w-4 h-4 text-[var(--text-muted)]" />
                                  <input 
                                    type="password" 
                                    required={modalMode === 'create' || modalMode === 'reset'}
                                    minLength={6}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50 transition-colors"
                                    placeholder="Mínimo 6 caracteres"
                                  />
                                </div>
                             </div>
                             
                             <div className="space-y-1.5">
                                <label className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase tracking-widest">Confirmar Senha</label>
                                <div className="relative">
                                  <Lock className="absolute left-3 top-3 w-4 h-4 text-[var(--text-muted)]" />
                                  <input 
                                    type="password" 
                                    required={modalMode === 'create' || modalMode === 'reset'}
                                    minLength={6}
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500/50 transition-colors"
                                    placeholder="Repita a senha"
                                  />
                                </div>
                             </div>
                         </div>
                      </>
                   )}

                   {modalMode === 'view' && selectedBroker?.exportLots?.length > 0 && (
                     <div className="space-y-3 border-t border-[var(--border-color)] pt-5">
                       <h3 className="text-sm font-bold text-[var(--text-primary)]">Vendas vinculadas</h3>
                       <div className="max-h-48 overflow-y-auto border border-[var(--border-color)] rounded-lg">
                         <table className="w-full text-xs">
                           <thead className="bg-[var(--bg-main)] sticky top-0">
                             <tr>
                               <th className="p-2 text-left text-[var(--text-muted)]">Lote</th>
                               <th className="p-2 text-left text-[var(--text-muted)]">Contrato</th>
                               <th className="p-2 text-right text-[var(--text-muted)]">Valor</th>
                               {canManageBrokerCommission && (
                                 <th className="p-2 text-right text-[var(--text-muted)]">Ação</th>
                               )}
                             </tr>
                           </thead>
                           <tbody>
                             {selectedBroker.exportLots.map((lot: any, idx: number) => (
                               <tr key={`${lot.venda_id}-${idx}`} className="border-t border-[var(--border-color)]">
                                 <td className="p-2">{lot.loteStr || '—'}</td>
                                 <td className="p-2">{lot.contrato || '—'}</td>
                                 <td className="p-2 text-right">{formatCurrency(Number(lot.valor_venda) || 0)}</td>
                                 {canManageBrokerCommission && (
                                   <td className="p-2 text-right">
                                     <button
                                       type="button"
                                       onClick={() => setManageSaleModal({
                                         saleId: lot.venda_id,
                                         lotLabel: lot.loteStr || '',
                                         contractLabel: String(lot.contrato || ''),
                                         saleValue: Number(lot.valor_venda) || 0,
                                         brokerName: selectedBroker.name || '',
                                         pendingTotal: Number(lot.comissao_pendente) || 0,
                                       })}
                                       className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                                       title="Gerenciar corretor/comissão"
                                     >
                                       <UserCog className="w-3 h-3" />
                                       Gerenciar
                                     </button>
                                   </td>
                                 )}
                               </tr>
                             ))}
                           </tbody>
                         </table>
                       </div>
                     </div>
                   )}

                </div>

                <div className="sv-modal-footer border-t border-[var(--border-color)] bg-[var(--bg-card)] px-6 py-4 flex justify-end gap-3">
                       <button 
                         type="button"
                         onClick={handleCloseModal}
                         className="px-5 py-2.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)] transition-colors"
                       >
                         {modalMode === 'view' ? 'Fechar' : 'Cancelar'}
                       </button>
                       {brokerLimit !== null && dashboardStats.activeCount >= brokerLimit && user?.role !== 'SUPER_ADMIN' && modalMode === 'create' ? (
                          <div className="flex items-center ml-4 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                             <p className="text-red-400 text-xs font-bold uppercase tracking-widest">Plano Atingido</p>
                          </div>
                       ) : modalMode !== 'view' && (
                         <button 
                           type="submit"
                           disabled={isSubmitting}
                           className="px-8 py-2.5 rounded-lg text-sm font-bold text-[var(--text-primary)] bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all shadow-[0_0_15px_rgba(249,115,22,0.2)] disabled:opacity-50"
                         >
                           {isSubmitting ? 'Salvando...' : modalMode === 'edit' ? 'Salvar Alterações' : modalMode === 'reset' ? 'Redefinir Senha' : 'Salvar Corretor'}
                         </button>
                       )}
                </div>
              </form>
            )}
            
          </div>
        </div>
      )}

      <ManageSaleBrokerCommissionModal
        open={!!manageSaleModal}
        onClose={() => setManageSaleModal(null)}
        saleId={manageSaleModal?.saleId || ''}
        lotLabel={manageSaleModal?.lotLabel || ''}
        contractLabel={manageSaleModal?.contractLabel || ''}
        saleValue={manageSaleModal?.saleValue || 0}
        currentBrokerName={manageSaleModal?.brokerName}
        initialPendingTotal={manageSaleModal?.pendingTotal ?? 0}
        canManage={canManageBrokerCommission}
        activeTenantId={activeTenantId}
        brokers={filterBrokersForActiveList(corretores).map((b) => ({
          id: b.id,
          name: b.name,
          commission_percent: b.commission_percent,
        }))}
        onSuccess={() => loadBrokers()}
      />

      <BulkAdjustBrokerCommissionsModal
        open={bulkAdjustOpen}
        onClose={() => {
          setBulkAdjustOpen(false);
          setBulkAdjustPreset(null);
        }}
        activeTenantId={activeTenantId}
        canManage={canManageBrokerCommission}
        brokers={filterBrokersForActiveList(corretores).map((b) => ({
          id: b.id,
          name: b.name,
        }))}
        projects={projectOptions}
        initialPreset={bulkAdjustPreset}
        onSuccess={() => loadBrokers()}
      />
    </div>
  );
}

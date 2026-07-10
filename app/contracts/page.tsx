"use client";

import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import {
  FileText,
  Loader2,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  SearchIcon,
  Download,
  Printer,
  Send,
  Edit,
  X,
  Receipt,
  Wallet,
  ChevronDown,
  MoreVertical,
  RefreshCw,
  Trash2,
  History,
  ShieldCheck,
} from "lucide-react";
import { ContractGenerator } from "@/components/contracts/ContractGenerator";
import { RegenerateContractModal } from "@/components/contracts/RegenerateContractModal";
import { canShowMobileVendorSignAction } from "@/lib/saleContractBilateralSignature";
import { isPartnerPanelAdmin } from "@/lib/partnerPanelAdmin";
import { isOwnerRole } from "@/lib/rolePermissions";
import { blockOwnerWriteOnClient } from "@/lib/ownerWriteGuard";
import {
  filterRowsByOwnerProjects,
  getOwnerAllowedProjectIdsForModule,
  loadOwnerAccessContext,
  resolveContractProjectId,
} from "@/lib/ownerProjectAccess";
import jsPDF from "jspdf";
import {
  displayContractNumber,
  isValidStoredContractNumber,
} from "@/lib/contractNumber";
import { getReportHeaderLogoUrl } from "@/lib/reportBranding";
import { normalizeBlockForContractRegeneration } from "@/lib/blockLotNormalize";
import { resolveLotMeasuresFromBlock } from "@/lib/lotChanfre";
import {
  CONTRACTS_FETCH_TIMEOUT_MS,
  fetchJsonWithTimeout,
  fetchWithTimeout,
} from "@/lib/fetchJsonWithTimeout";
import { formatClientFetchError } from "@/lib/clientFetchError";
import {
  CustomerContractValidationError,
  validateCustomerForContractFromContract,
  type CustomerContractValidation,
} from "@/lib/validateCustomerForContract";
import { CustomerContractValidationModal } from "@/components/contracts/CustomerContractValidationModal";
import {
  SaleContractSignatureSection,
  type SaleContractSignatureCapabilities,
  type SaleContractSignatureSectionHandle,
} from "@/components/contracts/SaleContractSignatureSection";
import { LegacyContractDocumentsSection } from "@/components/contracts/LegacyContractDocumentsSection";
import {
  canResendSaleSignature,
  canSendSaleSignature,
} from "@/lib/saleContractSignatureStatus";
import {
  computeSaleContractDashboardStats,
  isSaleContractFullySigned,
  saleContractDashboardPercent,
} from "@/lib/saleContractDashboardStats";
import {
  applyContractPdfChrome,
  buildContractPdfChromeFromTenant,
  getContractHtml2pdfOptions,
  resolveContractHtml2pdfOptions,
} from "@/lib/contractPdfPostProcess";
import { isRecantoPrimaveraContractModel } from "@/lib/contractModel";
import { embedRecantoContractSignatureInHtml } from "@/lib/recantoPrimaveraContractAssets";
import {
  loadContractsListForTenant,
} from "@/lib/contractsListService";

const PLATFORM_ADMIN_ROLES = ["SUPER_ADMIN", "MASTER-ADMIN", "MASTER_ADMIN"];

/** Valor compacto para faixa de KPIs no mobile (ex.: R$ 1,13M). */
function formatCompactCurrencyBRL(value: number): string {
  const n = Number(value) || 0;
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const s = m.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    return `R$ ${s}M`;
  }
  if (n >= 10_000) {
    const k = n / 1_000;
    const s = k.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    return `R$ ${s}k`;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Resolve tenant/empresa ativa (perfil + impersonação super admin). */
function resolveContractsTenantId(user: any): string | null {
  if (!user) return null;
  if (user.tenant_id) return user.tenant_id;
  if (typeof window !== "undefined") {
    const impersonating = localStorage.getItem("impersonating_tenant_id");
    if (impersonating && PLATFORM_ADMIN_ROLES.includes(user.role)) return impersonating;
  }
  return (user as any)?.company_id || null;
}

/** Sincroniza tenant com auth.uid() + users (fonte do RLS: current_tenant_id()). */
async function resolveContractsTenantWithDb(user: any): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const authUserId = sessionData?.session?.user?.id;

  if (authUserId) {
    const { data, error } = await supabase
      .from("users")
      .select("tenant_id, company_id")
      .eq("id", authUserId)
      .maybeSingle();
    if (!error && data?.tenant_id) return data.tenant_id;
    if (!error && data?.company_id) return data.company_id;
  }

  return resolveContractsTenantId(user);
}

/** Busca HTML no backend — fonte única para preview, PDF e fallback. */
async function fetchContractHtmlFromApi(
  contractId: string,
  user: any,
  options?: { refresh?: boolean },
): Promise<string | null> {
  const impersonatingTenantId =
    typeof window !== "undefined"
      ? localStorage.getItem("impersonating_tenant_id")
      : null;
  const activeTenantId = await resolveContractsTenantWithDb(user);
  const query = new URLSearchParams();
  if (activeTenantId) query.set("activeTenantId", activeTenantId);
  if (user?.role === "SUPER_ADMIN" && impersonatingTenantId) {
    query.set("impersonatingTenantId", impersonatingTenantId);
  }
  // PDF/preview pós-regeneração: força rebuild para não reutilizar HTML salvo com quadro errado.
  if (options?.refresh) query.set("refresh", "1");
  const { ok, data, error } = await fetchJsonWithTimeout<{
    html?: string;
    error?: string;
    source?: string;
  }>(
    `/api/contracts/${contractId}/html?${query.toString()}`,
    { credentials: "include" },
    CONTRACTS_FETCH_TIMEOUT_MS,
  );
  if (ok && typeof data?.html === "string" && data.html.trim().length > 0) {
    return data.html;
  }
  console.error("[contracts/global-pdf] fetch_html_failed", {
    contractId,
    error: error || data?.error,
  });
  return null;
}

/** @deprecated use loadContractsListForTenant — mantido para reload inline. */
async function loadContractsList(
  user: any,
  tenantId: string | null,
): Promise<{ rows: any[]; error: string | null }> {
  const isPlatformAdmin =
    Boolean(user?.role && PLATFORM_ADMIN_ROLES.includes(user.role));
  const result = await loadContractsListForTenant(supabase, {
    tenantId,
    isPlatformAdmin,
  });
  return { rows: result.rows, error: result.error };
}

const FINANCE_RECEIPTS_LIST_SELECT =
  "id, sale_id, due_date, amount, status, installment_number, description, payment_date";

/** Oculta versões substituídas na lista principal (histórico fica na aba do contrato). */
function isContractVisibleInList(c: any): boolean {
  const st = normalizeContractStatus(c?.status);
  return st !== "superseded";
}

function looksLikeUuidFragment(value: string): boolean {
  const s = String(value || "").trim();
  if (!s) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return true;
  if (s.length >= 12 && /^[0-9a-f-]+$/i.test(s)) return true;
  return false;
}

function resolveCustomerName(customer: any, contract: any): string {
  const name =
    customer?.name ||
    customer?.full_name ||
    customer?.nome ||
    contract?.customer_name ||
    "";
  return String(name).trim();
}

function resolveBlockQuadra(block: any): string {
  if (!block) return "";
  return String(
    block.block_name || block.block || block.quadra || block.name || "",
  ).trim();
}

function resolveLotNumber(block: any, contract: any): string {
  const raw =
    block?.lot_number ||
    block?.number ||
    block?.lot ||
    block?.name ||
    contract?.lot_number ||
    "";
  const s = String(raw).trim();
  if (!s || looksLikeUuidFragment(s)) return "";
  return s;
}

function resolveContractSaleValue(
  contract: any,
  sale?: any | null,
  block?: any | null,
): number {
  const candidates = [
    contract?.sale_value,
    contract?.sale_value_display,
    sale?.total_value,
    sale?.final_value,
    sale?.agreed_price,
    sale?.sale_value,
    sale?.sale_price,
    block?.price,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function buildLocationDisplay(blockName: string, lotNumber: string): string {
  const quad = blockName && blockName !== "?" ? blockName : "";
  const lot = lotNumber && !looksLikeUuidFragment(lotNumber) ? lotNumber : "";
  if (quad && lot) return `QD ${quad} • LT ${lot}`;
  if (quad) return `QD ${quad}`;
  if (lot) return `LT ${lot}`;
  return "Localização não informada";
}

const DOCK_EMPTY = "Não informado";

/** Resumo compacto para o painel de ações mobile. */
function resolveMobileDockSummary(contract: any) {
  const contractNo =
    displayContractNumber(contract.contract_number) || DOCK_EMPTY;
  const clientRaw =
    contract.customer_name ||
    contract.customers?.name ||
    resolveCustomerName(contract.customers, contract);
  const projectRaw =
    contract.project_name ||
    contract.project_name_snapshot ||
    contract.sales?.projects?.name ||
    contract.blocks?.projects?.name ||
    contract.projects?.name ||
    "";
  const locRaw =
    contract.location_display ||
    buildLocationDisplay(
      resolveBlockQuadra(contract.blocks),
      resolveLotNumber(contract.blocks, contract),
    );
  const lote =
    locRaw && locRaw !== "Localização não informada" ? locRaw : "";
  const val =
    Number(contract.sale_value_display) ||
    resolveContractSaleValue(contract, contract.sales, contract.blocks);
  const valueFmt =
    val > 0
      ? new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(val)
      : "";

  return {
    contractNo,
    client: String(clientRaw || "").trim() || DOCK_EMPTY,
    project: String(projectRaw || "").trim() || DOCK_EMPTY,
    lote: lote || "",
    valueFmt: valueFmt || DOCK_EMPTY,
  };
}

async function fetchRowsByIds(
  table: string,
  select: string,
  ids: string[],
): Promise<any[]> {
  if (!ids.length) return [];
  const unique = [...new Set(ids.filter(Boolean))];
  const chunkSize = 80;
  const rows: any[] = [];

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in("id", chunk);
    if (error) {
      console.error(`[CONTRATOS] erro ao buscar ${table}`, error);
    } else if (data?.length) {
      rows.push(...data);
    }
  }
  return rows;
}

/** Enriquece um contrato com dados reais de customer, block, project e sale. */
function enrichContractWithRelations(
  contract: any,
  maps: {
    customers: Map<string, any>;
    blocks: Map<string, any>;
    projects: Map<string, any>;
    sales: Map<string, any>;
  },
): any {
  const customer = contract.customer_id
    ? maps.customers.get(contract.customer_id)
    : null;
  const block = contract.block_id ? maps.blocks.get(contract.block_id) : null;
  const sale = contract.sale_id ? maps.sales.get(contract.sale_id) : null;

  const project =
    (contract.project_id && maps.projects.get(contract.project_id)) ||
    block?.projects ||
    null;

  const customer_name =
    resolveCustomerName(customer, contract) || "Cliente não informado";
  const block_name = resolveBlockQuadra(block);
  const lot_number = resolveLotNumber(block, contract);
  const project_name =
    contract.project_name_snapshot ||
    project?.name ||
    block?.projects?.name ||
    "Projeto não informado";
  const sale_value_display = resolveContractSaleValue(contract, sale, block);
  const location_display = buildLocationDisplay(block_name, lot_number);

  const customerDoc =
    customer?.document || customer?.cpf || contract?.customer_document || "";

  return {
    ...contract,
    customers: customer
      ? {
          ...customer,
          name: customer_name,
          document: customerDoc || customer.document,
        }
      : customer_name !== "Cliente não informado"
        ? { id: contract.customer_id, name: customer_name, document: customerDoc }
        : null,
    blocks: block
      ? {
          ...block,
          block_name: block_name || block.block_name,
          number: lot_number || block.number,
          projects: block.projects || project,
        }
      : null,
    projects: project?.id ? project : project?.name ? { name: project.name } : null,
    sales: sale || contract.sales || null,
    customer_name,
    project_name,
    block_name,
    lot_number,
    sale_value_display,
    location_display,
  };
}

/** Busca relações em lote quando o select(*) não traz joins. */
async function enrichContractsWithRelations(contracts: any[]): Promise<any[]> {
  if (!contracts.length) return [];

  const customerIds = contracts.map((c) => c.customer_id).filter(Boolean);
  const blockIds = contracts.map((c) => c.block_id).filter(Boolean);
  const projectIds = contracts.map((c) => c.project_id).filter(Boolean);
  const saleIds = contracts.map((c) => c.sale_id).filter(Boolean);

  const [customers, blocks, projects, sales] = await Promise.all([
    fetchRowsByIds("customers", "*", customerIds as string[]),
    fetchRowsByIds("blocks", `*, projects(name)`, blockIds as string[]),
    fetchRowsByIds("projects", "*", projectIds as string[]),
    fetchRowsByIds("sales", "*", saleIds as string[]),
  ]);

  console.log("[CONTRATOS] customer/block/sale encontrados", {
    customers: customers.length,
    blocks: blocks.length,
    projects: projects.length,
    sales: sales.length,
  });

  const maps = {
    customers: new Map(customers.map((r) => [r.id, r])),
    blocks: new Map(blocks.map((r) => [r.id, r])),
    projects: new Map(projects.map((r) => [r.id, r])),
    sales: new Map(sales.map((r) => [r.id, r])),
  };

  return contracts.map((contract) => {
    const enriched = enrichContractWithRelations(contract, maps);
    console.log("[CONTRATOS] contrato enriquecido", {
      id: enriched.id,
      contract_number: enriched.contract_number,
      customer_name: enriched.customer_name,
      project_name: enriched.project_name,
      location_display: enriched.location_display,
      sale_value_display: enriched.sale_value_display,
    });
    return enriched;
  });
}

function normalizeContractStatus(status?: string | null): string {
  const st = String(status ?? "").toLowerCase().trim();
  if (!st || st === "null" || st === "undefined") return "ativo";
  return st;
}

/** Unifica medidas do lote sem depender de colunas fixas no schema. */
function enrichBlockForContract(block: Record<string, any> | null | undefined): Record<string, any> {
  if (!block || typeof block !== "object") return {};
  const normalized = normalizeBlockForContractRegeneration(block);
  const lotMeasures = resolveLotMeasuresFromBlock(normalized);
  const display = {
    frente: normalized.frente || "Não informado",
    fundo: normalized.Fundo || normalized.fundo || "Não informado",
    ladoDireito: normalized["Lado Dir."] || "Não informado",
    ladoEsquerdo: normalized["Lado Esq."] || "Não informado",
  };
  return {
    ...normalized,
    frente: lotMeasures.sides.frente ?? normalized.frente ?? display.frente,
    Fundo: lotMeasures.sides.fundo ?? normalized.Fundo ?? display.fundo,
    "Lado Dir.": lotMeasures.sides.ladoDireito ?? normalized["Lado Dir."] ?? display.ladoDireito,
    "Lado Esq.": lotMeasures.sides.ladoEsquerdo ?? normalized["Lado Esq."] ?? display.ladoEsquerdo,
    chanfre: lotMeasures.chanfre?.total ?? null,
    chanfre_segments: lotMeasures.chanfre?.segments ?? [],
  };
}

export default function ContractsPage() {
  const { user, loading: authLoading } = useSessionGuard();
  const ownerReadOnly = isOwnerRole(user?.role);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoadError, setListLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [selectedContractIds, setSelectedContractIds] = useState<Set<string>>(
    new Set(),
  );
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("Visualização");
  const [receipts, setReceipts] = useState<any[]>([]);
  const [contractVersions, setContractVersions] = useState<any[]>([]);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regeneratingContract, setRegeneratingContract] = useState(false);
  const [contractToast, setContractToast] = useState<string | null>(null);
  const signatureSectionRef = useRef<SaleContractSignatureSectionHandle>(null);
  const [signatureCaps, setSignatureCaps] = useState<SaleContractSignatureCapabilities>({
    canSend: false,
    canShare: false,
    sending: false,
    canVendorSign: false,
    signingVendor: false,
  });

  const [stats, setStats] = useState({
    ativos: 0,
    assinados: 0,
    pendentes: 0,
    cancelados: 0,
    valorTotal: 0,
  });
  const [tenantData, setTenantData] = useState<any>(null);
  const [contractViewHtml, setContractViewHtml] = useState<string | null>(null);
  const [contractViewLoading, setContractViewLoading] = useState(false);
  const [contractViewError, setContractViewError] = useState<string | null>(null);
  const [contractViewNeedsRegenerar, setContractViewNeedsRegenerar] = useState(false);
  const [contractHtmlRetryKey, setContractHtmlRetryKey] = useState(0);
  const [customerContractValidation, setCustomerContractValidation] =
    useState<CustomerContractValidation | null>(null);

  const ensureCustomerValidForContractAction = (
    contract: Record<string, unknown> | null | undefined,
  ): boolean => {
    const validation = validateCustomerForContractFromContract(contract);
    if (!validation.valid) {
      setCustomerContractValidation(validation);
      return false;
    }
    return true;
  };

  useEffect(() => {
    setSignatureCaps({ canSend: false, canShare: false, sending: false });
  }, [selectedContract?.id]);

  useEffect(() => {
    async function loadTenant() {
      const resolvedTenantId = resolveContractsTenantId(user);
      if (resolvedTenantId) {
        const { data } = await supabase
          .from("companies")
          .select("*")
          .eq("id", resolvedTenantId)
          .single();
        if (data) setTenantData(data);
      }
    }
    if (user) loadTenant();
  }, [user]);

  useEffect(() => {
    async function loadContracts() {
      setLoading(true);

      try {
        const resolvedTenantId = await resolveContractsTenantWithDb(user);

        console.log("[CONTRATOS] empresa atual", {
          user_id: user?.id,
          role: user?.role,
          tenant_id_perfil: user?.tenant_id,
          company_id_perfil: (user as any)?.company_id,
          tenant_resolvido: resolvedTenantId,
          impersonating:
            typeof window !== "undefined"
              ? localStorage.getItem("impersonating_tenant_id")
              : null,
        });

        const isPlatformAdmin =
          user?.role && PLATFORM_ADMIN_ROLES.includes(user.role);

        if (!resolvedTenantId && !isPlatformAdmin) {
          console.warn("[CONTRATOS] erro — tenant não identificado no perfil");
          setContracts([]);
          setListLoadError("Empresa não identificada. Faça login novamente.");
          return;
        }

        const { rows: rawRows, error: listError } = await loadContractsList(
          user,
          resolvedTenantId,
        );
        if (listError && rawRows.length === 0) {
          setContracts([]);
          setListLoadError(
            formatClientFetchError({ apiError: listError }) ||
              "Não foi possível carregar a lista de contratos.",
          );
          return;
        }
        setListLoadError(null);
        const ownerCtx = await loadOwnerAccessContext(supabase, user, resolvedTenantId);
        const ownerContractProjectIds = ownerCtx.isOwner
          ? getOwnerAllowedProjectIdsForModule(ownerCtx.rows, 'contracts')
          : ownerCtx.allowedProjectIds;
        const ownerScopedRows = filterRowsByOwnerProjects(
          rawRows,
          ownerContractProjectIds,
          resolveContractProjectId,
        );
        const visible = ownerScopedRows.filter(isContractVisibleInList);
        const rows = await enrichContractsWithRelations(visible);

        console.log("[CONTRATOS] contratos encontrados", {
          total: rows.length,
          numeros: rows.map((c) => c.contract_number),
          statuses: rows.map((c) => c.status),
        });

        setContracts(rows);
        processContractsFromRows(rows);
      } catch (e) {
        console.error("[CONTRATOS] erro", e);
        setContracts([]);
        setListLoadError(
          formatClientFetchError({
            networkMessage: e instanceof Error ? e.message : undefined,
          }),
        );
      } finally {
        setLoading(false);
      }
    }

    if (user && !authLoading) {
      loadContracts();
    }
  }, [user, authLoading]);

  useEffect(() => {
    let active = true;
    const fetchReceipts = async () => {
      if (selectedContract?.sale_id) {
        const { data } = await supabase
          .from("finance_receipts")
          .select(FINANCE_RECEIPTS_LIST_SELECT)
          .eq("sale_id", selectedContract.sale_id)
          .order("due_date", { ascending: true });
        if (active) setReceipts(data || []);
      } else {
        if (active) setReceipts([]);
      }
    };
    fetchReceipts();
    return () => { active = false; };
  }, [selectedContract?.sale_id]);

  useEffect(() => {
    let active = true;
    async function loadVersions() {
      if (!selectedContract?.id) {
        if (active) setContractVersions([]);
        return;
      }
      try {
        const { ok, data, error } = await fetchJsonWithTimeout<{ versions?: unknown[] }>(
          `/api/contracts/${selectedContract.id}/versions`,
          { credentials: "include" },
          CONTRACTS_FETCH_TIMEOUT_MS,
        );
        if (active && ok) {
          setContractVersions(data?.versions || []);
        } else if (active) {
          setContractVersions([]);
          if (error) console.warn("[CONTRATOS] versions", error);
        }
      } catch {
        if (active) setContractVersions([]);
      }
    }
    void loadVersions();
    return () => {
      active = false;
    };
  }, [selectedContract?.id]);

  useEffect(() => {
    if (!contractToast) return;
    const t = setTimeout(() => setContractToast(null), 4500);
    return () => clearTimeout(t);
  }, [contractToast]);

  const filteredContracts = contracts.filter(isContractVisibleInList).filter((c) => {
    const p =
      (c.customer_name || c.customers?.name || "").toLowerCase();
    const proj = (
      c.project_name ||
      c.project_name_snapshot ||
      c.sales?.projects?.name ||
      c.blocks?.projects?.name ||
      c.projects?.name ||
      ""
    ).toLowerCase();
    const loc = (c.location_display || "").toLowerCase();
    const doc =
      c.customers?.document?.toLowerCase() ||
      c.customers?.cpf?.toLowerCase() ||
      "";
    const cnum = c.contract_number?.toLowerCase() || "";
    const cid = String(c.customer_id || "").toLowerCase();
    const bid = String(c.block_id || "").toLowerCase();
    const pid = String(c.project_id || "").toLowerCase();
    const st = normalizeContractStatus(c.status);
    const term = search.toLowerCase();

    if (!term) return true;

    return (
      p.includes(term) ||
      proj.includes(term) ||
      loc.includes(term) ||
      doc.includes(term) ||
      cnum.includes(term) ||
      cid.includes(term) ||
      bid.includes(term) ||
      pid.includes(term) ||
      st.includes(term)
    );
  });

  const getStatusColor = (status: string) => {
    const st = normalizeContractStatus(status);
    if (st === "assinado" || st === "signed")
      return "text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20";
    if (st === "cancelado" || st === "cancelled")
      return "text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20";
    if (st === "ativo" || st === "active")
      return "text-[var(--color-primary)] bg-[var(--color-primary)]/10 border-[var(--color-primary)]/20";
    if (st === "superseded")
      return "text-[var(--text-secondary)] bg-gray-500/10 border-gray-500/20";
    return "text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20";
  };

  const getStatusLabel = (status: string) => {
    const st = normalizeContractStatus(status);
    if (st === "assinado" || st === "signed") return "Assinado";
    if (st === "cancelado" || st === "cancelled") return "Cancelado";
    if (st === "ativo" || st === "active") return "Ativo";
    if (st === "superseded") return "Substituído";
    if (st === "pending" || st === "pendente") return "Pendente";
    if (st === "rascunho" || st === "draft") return "Rascunho";
    return st ? st.charAt(0).toUpperCase() + st.slice(1) : "Ativo";
  };

  const isSupersededContract = (c: any) =>
    normalizeContractStatus(c?.status) === "superseded";

  const canShowRegenerateContract = isPartnerPanelAdmin(user?.role) && !ownerReadOnly;

  useEffect(() => {
    if (selectedContract?.id) {
      console.log(
        "SHOW_REGENERATE_CONTRACT_BUTTON",
        selectedContract.id,
        user?.role,
        canShowRegenerateContract,
      );
    }
  }, [selectedContract?.id, user?.role, canShowRegenerateContract]);

  useEffect(() => {
    setContractViewHtml(null);
    setContractViewError(null);
    setContractViewNeedsRegenerar(false);
    setContractViewLoading(false);
    setCustomerContractValidation(null);
    // Retry key não deve forçar rebuild eterno entre contratos.
    setContractHtmlRetryKey(0);
  }, [selectedContract?.id]);

  useEffect(() => {
    if (!selectedContract?.id) {
      return;
    }
    let active = true;
    (async () => {
      setContractViewLoading(true);
      setContractViewError(null);
      try {
        const impersonatingTenantId =
          typeof window !== "undefined"
            ? localStorage.getItem("impersonating_tenant_id")
            : null;
        const activeTenantId = await resolveContractsTenantWithDb(user);
        const query = new URLSearchParams();
        if (activeTenantId) query.set("activeTenantId", activeTenantId);
        if (user?.role === "SUPER_ADMIN" && impersonatingTenantId) {
          query.set("impersonatingTenantId", impersonatingTenantId);
        }
        // Rebuild só quando o contrato realmente precisa regenerar.
        // Após regeneração bem-sucedida o HTML já foi persistido — não reconstruir.
        if (selectedContract.needs_regenerar === true) {
          query.set("refresh", "1");
        }
        const { ok, data, error } = await fetchJsonWithTimeout<{
          success?: boolean;
          html?: string;
          error?: string;
          source?: string;
          needs_regenerar?: boolean;
          missingFields?: string[];
          customerId?: string;
        }>(
          `/api/contracts/${selectedContract.id}/html?${query.toString()}`,
          { credentials: "include" },
          CONTRACTS_FETCH_TIMEOUT_MS,
        );
        if (!active) return;

        if (ok && data?.success !== false && typeof data?.html === "string" && data.html.trim().length > 0) {
          setContractViewHtml(data.html);
          setContractViewError(null);
          setContractViewNeedsRegenerar(data.needs_regenerar === true);
          setCustomerContractValidation(null);
        } else {
          setContractViewHtml(null);
          setContractViewNeedsRegenerar(false);
          if (data?.missingFields?.length) {
            setCustomerContractValidation({
              valid: false,
              missingFields: data.missingFields,
              missingRequired: data.missingFields,
              missingRecommended: [],
              customerId: data.customerId,
            });
          }
          setContractViewError(
            error ||
              (typeof data?.error === "string" ? data.error : null) ||
              "Não foi possível carregar a visualização do contrato.",
          );
        }
      } catch (e) {
        if (!active) return;
        console.error("[CONTRATOS] contractViewHtml", e);
        setContractViewHtml(null);
        setContractViewError(
          formatClientFetchError({
            networkMessage: e instanceof Error ? e.message : undefined,
          }),
        );
        if (e instanceof CustomerContractValidationError) {
          setCustomerContractValidation(e.validation);
        }
      } finally {
        if (active) setContractViewLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedContract?.id, selectedContract?.needs_regenerar, contractHtmlRetryKey, user?.id]);

  const resolvedContractHtml = contractViewHtml;

  const reloadContractsList = async () => {
    if (!user) return [];
    const resolvedTenantId = await resolveContractsTenantWithDb(user);
    const { rows: rawRows, error: listError } = await loadContractsList(
      user,
      resolvedTenantId,
    );
    if (listError) {
      setListLoadError(
        formatClientFetchError({ apiError: listError }) ||
          "Não foi possível recarregar contratos.",
      );
    } else {
      setListLoadError(null);
    }
    const visible = rawRows.filter(isContractVisibleInList);
    return enrichContractsWithRelations(visible);
  };

  const handleDownloadVersion = async (ver: {
    generated_html?: string | null;
    contract_number?: string;
    version?: number;
  }) => {
    if (!ver?.generated_html) {
      alert("Esta versão não possui conteúdo para download.");
      return;
    }
    try {
      const { default: html2pdf } = await import("html2pdf.js");
      const element = document.createElement("div");
      element.innerHTML = ver.generated_html;
      const pdfFilename = `contrato_${ver.contract_number || "versao"}_v${ver.version ?? 1}.pdf`;
      const htmlLooksRecanto = String(ver.generated_html || '').includes(
        'sv-contract-recanto-primavera',
      );
      const pdfOptions = htmlLooksRecanto
        ? resolveContractHtml2pdfOptions(tenantData || {}, pdfFilename)
        : getContractHtml2pdfOptions(pdfFilename);

      await html2pdf()
        .from(element)
        .set(pdfOptions)
        .toPdf()
        .get("pdf")
        .then((pdf: any) => {
          if (tenantData) {
            applyContractPdfChrome(
              pdf,
              buildContractPdfChromeFromTenant(
                tenantData,
                String(
                  ver.contract_number || selectedContract?.contract_number || "",
                ),
                null,
              ),
            );
          } else {
            applyContractPdfChrome(pdf, {
              tenantName: "Imobiliária",
              tenantCnpj: "",
              addressLine: "",
              cityUfLine: "",
              contractNumber: String(ver.contract_number || ""),
              logoBase64: null,
            });
          }
        })
        .save();
    } catch (e) {
      console.error(e);
      alert("Erro ao baixar PDF desta versão.");
    }
  };

  const handleBaixarPDF = async () => {
    if (!selectedContract) return;
    if (!ensureCustomerValidForContractAction(selectedContract)) return;
    try {
      const isElectronicallySigned = isSaleContractFullySigned(selectedContract);

      if (isElectronicallySigned) {
        const res = await fetchWithTimeout(
          `/api/contracts/${selectedContract.id}/pdf?download=1`,
          { credentials: "include" },
          CONTRACTS_FETCH_TIMEOUT_MS,
        );
        if (res.ok) {
          const blob = await res.blob();
          const disposition = res.headers.get('Content-Disposition') || '';
          const match = disposition.match(/filename="([^"]+)"/);
          const filename =
            match?.[1] ||
            `contrato-assinado_${selectedContract.contract_number || selectedContract.id}.pdf`;
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = filename;
          anchor.click();
          URL.revokeObjectURL(url);
          return;
        }
        alert('Não foi possível baixar o PDF assinado. Tente novamente ou use Abrir PDF Assinado.');
        return;
      }

      const { default: html2pdf } = await import("html2pdf.js");
      const element = document.createElement("div");

      // Sempre rebuild no PDF não assinado: evita baixar generated_html antigo (ex.: Quantidade 47).
      let htmlBody = await fetchContractHtmlFromApi(selectedContract.id, user, {
        refresh: true,
      });
      if (htmlBody) {
        setContractViewHtml(htmlBody);
        setContractViewError(null);
      } else {
        htmlBody = resolvedContractHtml;
      }

      if (!htmlBody?.trim()) {
        alert(
          "Não foi possível obter o conteúdo do contrato para gerar o PDF. Tente novamente ou regenerar o contrato.",
        );
        return;
      }

      if (isRecantoPrimaveraContractModel(tenantData || {})) {
        htmlBody = await embedRecantoContractSignatureInHtml(
          htmlBody,
          tenantData || {},
        );
      }

      element.innerHTML = htmlBody;

      let logoBase64: string | null = null;
      if (getReportHeaderLogoUrl(tenantData?.logo_url)) {
        try {
          logoBase64 = await new Promise<string>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL("image/png"));
              } else reject();
            };
            img.onerror = reject;
            img.src = getReportHeaderLogoUrl(tenantData?.logo_url);
          });
        } catch {
          /* ignore */
        }
      }

      const pdfFilename = `contrato_${selectedContract.contract_number || selectedContract.id}.pdf`;
      const opt = resolveContractHtml2pdfOptions(tenantData || {}, pdfFilename);

      html2pdf()
        .from(element)
        .set(opt)
        .toPdf()
        .get("pdf")
        .then((pdf: any) => {
          applyContractPdfChrome(
            pdf,
            buildContractPdfChromeFromTenant(
              tenantData || {},
              String(selectedContract.contract_number || ""),
              logoBase64,
            ),
          );
        })
        .save();
    } catch (e) {
      alert(
        "Erro ao tentar baixar PDF. Certifique-se que html2pdf.js está instalado.",
      );
      console.error(e);
    }
  };

  const handleImprimir = async () => {
    if (!selectedContract) return;
    if (!ensureCustomerValidForContractAction(selectedContract)) return;
    let htmlBody = await fetchContractHtmlFromApi(selectedContract.id, user, {
      refresh: true,
    });
    if (htmlBody) {
      setContractViewHtml(htmlBody);
      setContractViewError(null);
    } else {
      htmlBody = resolvedContractHtml;
    }
    if (!htmlBody?.trim()) {
      alert("Não foi possível carregar o conteúdo do contrato para impressão.");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
              <html>
                  <head><title>Imprimir Contrato - ${selectedContract.contract_number || ""}</title></head>
                  <body style="font-family: sans-serif; padding: 20px;">
                      ${htmlBody}
                      <script>window.onload = function() { window.print(); }</script>
                  </body>
              </html>
          `);
      printWindow.document.close();
    }
  };

  const handleAtivarContrato = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!selectedContract) return;
    if (!ensureCustomerValidForContractAction(selectedContract)) return;
    if (
      !confirm(
        "Tem certeza que deseja marcar este contrato como assinado e ativá-lo?",
      )
    )
      return;

    const { error } = await supabase
      .from("contracts")
      .update({ status: "assinado" })
      .eq("id", selectedContract.id);

    if (!error && selectedContract.sale_id) {
      await supabase
        .from("sales")
        .update({ status: "ativo" })
        .eq("id", selectedContract.sale_id);
    }

    if (error) {
      alert("Erro ao ativar contrato");
    } else {
      alert("Contrato ativado com sucesso!");
      setSelectedContract({ ...selectedContract, status: "assinado" });
      setContracts(
        contracts.map((c) =>
          c.id === selectedContract.id ? { ...c, status: "assinado" } : c,
        ),
      );

      setStats(
        computeSaleContractDashboardStats(
          contracts.map((c) =>
            c.id === selectedContract.id ? { ...c, status: "assinado" } : c,
          ),
        ),
      );
    }
  };

  const handleAlertDev = () => alert("Função em desenvolvimento");

  const toggleContractSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newMap = new Set(selectedContractIds);
    if (newMap.has(id)) {
      newMap.delete(id);
    } else {
      newMap.add(id);
    }
    setSelectedContractIds(newMap);
  };

  const handleSelectAll = () => {
    if (
      selectedContractIds.size === filteredContracts.length &&
      filteredContracts.length > 0
    ) {
      setSelectedContractIds(new Set());
    } else {
      setSelectedContractIds(new Set(filteredContracts.map((c) => c.id)));
    }
  };

  const handleLimparTestes = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (selectedContractIds.size === 0) return;

    const ids = Array.from(selectedContractIds);
    const testContractIds = contracts.filter((c) => ids.includes(c.id));

    const hasBlocked = testContractIds.some((c) => {
      const s = String(c.status || "")
        .toLowerCase()
        .trim();
      return ["assinado", "signed", "ativo", "active"].includes(s);
    });

    if (hasBlocked) {
      alert(
        "Existem contratos assinados/ativos selecionados. Eles não podem ser excluídos.",
      );
      return;
    }

    setShowPasswordModal(true);
  };

  const executeDelete = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!passwordInput) {
      alert("Por favor, digite sua senha.");
      return;
    }

    setIsDeleting(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.email) {
        alert("Usuário não encontrado.");
        setShowPasswordModal(false);
        return;
      }

      console.log("VALIDANDO SENHA DO USUÁRIO:", userData.user.email);

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: passwordInput,
      });

      if (authError) {
        alert("Senha incorreta. Exclusão cancelada.");
        setIsDeleting(false);
        return;
      }

      const ids = Array.from(selectedContractIds);
      console.log("IDS SELECIONADOS PARA DELETE:", ids);

      const resolvedTenantId = (user as any)?.company_id || user?.tenant_id;
      let deleteQuery = supabase
        .from("contracts")
        .delete()
        .in("id", ids);

      if (user?.role !== "SUPER_ADMIN" && resolvedTenantId) {
        deleteQuery = deleteQuery.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
      } else if (user?.role !== "SUPER_ADMIN" && !resolvedTenantId) {
        alert("Erro de segurança: Empresa não identificada.");
        return;
      }

      const { data, error } = await deleteQuery.select("id");

      console.log("DELETE CONTRATOS RESULT:", data, error);

      if (error) {
        alert("ERRO AO EXCLUIR CONTRATOS: " + JSON.stringify(error));
        return;
      }

      if (!data || data.length === 0) {
        alert(
          "Nenhum contrato foi excluído no banco. Verifique RLS/policies ou IDs.",
        );
        return;
      }

      const deletedIds = data.map((d) => d.id);
      alert(`${deletedIds.length} contrato(s) excluído(s) com sucesso.`);

      setContracts((prev) => prev.filter((c) => !deletedIds.includes(c.id)));
      if (selectedContract && deletedIds.includes(selectedContract.id)) {
        setSelectedContract(null);
      }
      setSelectedContractIds(new Set());

      // Re-calculate stats
      setStats(
        computeSaleContractDashboardStats(
          contracts.filter((c) => !deletedIds.includes(c.id)),
        ),
      );
    } catch (err) {
      console.error("ERRO EXCLUSÃO:", err);
      alert("Erro inexperado ao excluir contratos.");
    } finally {
      setIsDeleting(false);
      setShowPasswordModal(false);
      setPasswordInput("");
    }
  };

  const handleReenviar = () => {
    if (!selectedContract) return;
    let phone = selectedContract.customers?.phone || "";
    if (!phone) {
      alert("Cliente não possui telefone cadastrado.");
      return;
    }
    phone = phone.replace(/\\D/g, "");
    const msg = encodeURIComponent(
      `Olá ${selectedContract.customers?.name || "Cliente"}, segue atualizações sobre seu contrato de venda do lote. Por favor, qualquer dúvida entre em contato.`,
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const handleCancelar = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!selectedContract) return;
    if (
      !confirm(
        "Deseja realmente cancelar este contrato? Essa ação também cancelará a Venda relacionada.",
      )
    )
      return;

    const { error } = await supabase
      .from("contracts")
      .update({ status: "cancelado" })
      .eq("id", selectedContract.id);

    if (!error && selectedContract.sale_id) {
      await supabase
        .from("sales")
        .update({ status: "CANCELLED" })
        .eq("id", selectedContract.sale_id);
    }

    if (error) {
      alert("Erro ao cancelar contrato");
    } else {
      alert("Contrato cancelado com sucesso!");
      setSelectedContract({ ...selectedContract, status: "cancelado" });
      setContracts(
        contracts.map((c) =>
          c.id === selectedContract.id ? { ...c, status: "cancelado" } : c,
        ),
      );
    }
  };

  const handleGerarCarne = async () => {
    if (blockOwnerWriteOnClient(user?.role)) return;
    if (!selectedContract?.sale_id) return;
    try {
      const { data: receipts, error } = await supabase
        .from("finance_receipts")
        .select("*")
        .eq("sale_id", selectedContract.sale_id)
        .order("due_date", { ascending: true });

      if (error) throw error;

      if (!receipts || receipts.length === 0) {
        alert("Nenhuma parcela encontrada para esta venda.");
        return;
      }

      let html = `
              <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 10px; background: #ffffff; color: #111;">
                  <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                      <thead>
                          <tr style="background: #f1f3f5; color: #333; font-weight: bold; font-size: 11px;">
                              <th style="border-bottom: 2px solid #ccc; padding: 10px 8px; text-align: center;">Parcela</th>
                              <th style="border-bottom: 2px solid #ccc; padding: 10px 8px; text-align: center;">Vencimento</th>
                              <th style="border-bottom: 2px solid #ccc; padding: 10px 8px; text-align: right;">Valor</th>
                              <th style="border-bottom: 2px solid #ccc; padding: 10px 8px; text-align: center;">Status</th>
                          </tr>
                      </thead>
                      <tbody>
          `;

      const maxParcelas = receipts.filter(x => x.installment_number !== 0 && x.installment_number !== '0').length || 1;
      receipts.forEach((r, idx) => {
        const d = new Date(r.due_date);
        d.setUTCHours(12);
        const dataFmt = d.toLocaleDateString("pt-BR");
        const valFmt = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(Number(r.amount));
        const bg = idx % 2 === 0 ? "#ffffff" : "#f8f9fa";
        
        const isEntry = r.installment_number === 0 || r.installment_number === '0';
        const parcelLabel = isEntry ? "ENTRADA" : `${r.installment_number || 1}/${maxParcelas}`;

        html += `
                  <tr style="color: #333; font-size: 11px; background: ${bg}; border-bottom: 1px solid #eee;">
                      <td style="padding: 10px 8px; text-align: center;">${parcelLabel}</td>
                      <td style="padding: 10px 8px; text-align: center;">${dataFmt}</td>
                      <td style="padding: 10px 8px; text-align: right;">${valFmt}</td>
                      <td style="padding: 10px 8px; text-align: center; font-weight: bold;">${r.status}</td>
                  </tr>
              `;
      });

      html += `
                      </tbody>
                  </table>
                  <div style="margin-top: 30px; font-size: 10px; text-align: center; color: #777;">
                      Este é um documento auxiliar de controle de parcelas.
                  </div>
              </div>
          `;

      const tenantName = tenantData?.name || tenantData?.razao_social || "Imobiliária";
      const tenantCnpj = tenantData?.cnpj || tenantData?.document || "";
      const tenantEmail = tenantData?.email || "";
      const tenantPhone = tenantData?.phone || "";
      const tenantAddress = tenantData?.address || "";
      
      const isValid = (val: any) => typeof val === 'string' && val.trim() !== '' && !val.toLowerCase().includes('não informad') && val.toUpperCase() !== 'N/A';

      const projName = 
          (isValid(selectedContract.project_name_snapshot) ? selectedContract.project_name_snapshot : null) || 
          (isValid(selectedContract.sales?.projects?.name) ? selectedContract.sales.projects.name : null) || 
          (isValid(selectedContract.blocks?.projects?.name) ? selectedContract.blocks.projects.name : null) || 
          (isValid(selectedContract.projects?.name) ? selectedContract.projects.name : null) || 
          "Empreendimento/Projeto";
            
      const city = 
          (isValid(selectedContract.project_city_snapshot) ? selectedContract.project_city_snapshot : null) || 
          (isValid(selectedContract.projects?.city) ? selectedContract.projects.city : null) || 
          (isValid(selectedContract.sales?.projects?.city) ? selectedContract.sales.projects.city : null) || 
          (isValid(selectedContract.blocks?.projects?.city) ? selectedContract.blocks.projects.city : null) || 
          "";
      const uf = 
          (isValid(selectedContract.project_uf_snapshot) ? selectedContract.project_uf_snapshot : null) || 
          (isValid(selectedContract.projects?.uf) ? selectedContract.projects.uf : null) || 
          (isValid(selectedContract.sales?.projects?.uf) ? selectedContract.sales.projects.uf : null) || 
          (isValid(selectedContract.blocks?.projects?.uf) ? selectedContract.blocks.projects.uf : null) || 
          "";

      const clientName = selectedContract.customers?.name || "Cliente não informado";
      const blockName = selectedContract.blocks?.block || selectedContract.blocks?.block_name || selectedContract.blocks?.quadra || selectedContract.blocks?.name || selectedContract.sales?.blocks?.block_name || selectedContract.sales?.blocks?.name || "?";
      const lotNumber = selectedContract.blocks?.lot || selectedContract.blocks?.number || selectedContract.sales?.lot_number || selectedContract.sales?.blocks?.number || "?";

      let logoBase64: string | null = null;
      if (getReportHeaderLogoUrl(tenantData?.logo_url)) {
          try {
              logoBase64 = await new Promise<string>((resolve, reject) => {
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
          } catch (err) {}
      }

      const { default: html2pdf } = await import("html2pdf.js");
      const element = document.createElement("div");
      element.innerHTML = html;

      const opt = {
        margin: [55, 15, 25, 15],
        filename: `carne_${selectedContract.contract_number || selectedContract.id}.pdf`,
        image: { type: "jpeg", quality: 1 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "avoid-all"] }
      };

      html2pdf().from(element).set(opt).toPdf().get('pdf').then((pdf: any) => {
        const totalPages = pdf.internal.getNumberOfPages();
        const pageWidth = pdf.internal.pageSize.width;
        const pageHeight = pdf.internal.pageSize.height;

        for (let i = 1; i <= totalPages; i++) {
          pdf.setPage(i);
          
          let titleX = 14;
          if (logoBase64) {
             pdf.addImage(logoBase64, 'PNG', 14, 10, 30, 20, undefined, 'FAST');
             titleX = 48;
          }

          pdf.setFontSize(14);
          pdf.setTextColor(40);
          pdf.setFont("helvetica", "bold");
          pdf.text("CARNÊ DE PAGAMENTO", titleX, 15);
          
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(60);
          const splitName = pdf.splitTextToSize(tenantName.toUpperCase(), 80);
          pdf.text(splitName, titleX, 20);
          
          pdf.setFontSize(7);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(100);
          let infoArray2 = [];
          if (tenantCnpj) infoArray2.push(`CNPJ: ${tenantCnpj}`);
          if (tenantEmail) infoArray2.push(`Email: ${tenantEmail}`);
          if (tenantPhone) infoArray2.push(`Tel: ${tenantPhone}`);
          
          let yPos = 20 + (splitName.length * 3.5);
          pdf.text(infoArray2.join(' | '), titleX, yPos);
          yPos += 3.5;
          
          if (tenantAddress) {
              const splitAddr = pdf.splitTextToSize(`Endereço: ${tenantAddress}`, 80);
              pdf.text(splitAddr, titleX, yPos);
              yPos += (splitAddr.length * 3.5);
          }

          const rightX = pageWidth - 14;
          let ryPos = 15;
          
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(60);
          pdf.text(
            `Contrato: ${displayContractNumber(selectedContract.contract_number)}`,
            rightX,
            ryPos,
            { align: "right" },
          );
          ryPos += 4;
          
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(100);
          
          let empText2 = `Emp: ${projName}`;
          if (city && uf) empText2 += ` - ${city}/${uf}`;
          
          const splitEmp2 = pdf.splitTextToSize(empText2, 90);
          pdf.text(splitEmp2, rightX, ryPos, { align: 'right' });
          ryPos += (splitEmp2.length * 3.5);
          
          const splitClient2 = pdf.splitTextToSize(`Cliente: ${clientName}`, 90);
          pdf.text(splitClient2, rightX, ryPos, { align: 'right' });
          ryPos += (splitClient2.length * 3.5);
          
          pdf.text(`QD: ${blockName} | LT: ${lotNumber}`, rightX, ryPos, { align: 'right' });
          ryPos += 4;

          const finalY = Math.max(yPos, ryPos, 32) + 2;

          pdf.setDrawColor(200);
          pdf.setLineWidth(0.5);
          pdf.line(14, finalY, rightX, finalY);
          
          // RODAPÉ
          pdf.line(14, pageHeight - 20, rightX, pageHeight - 20);
          
          pdf.setFontSize(8);
          pdf.setTextColor(150);
          pdf.text(`Documento emitido digitalmente pelo SV LOTES GIS | Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, pageHeight - 14);
          pdf.text(`Emissor: ${user?.name || "Admin"}`, 14, pageHeight - 10);
          
          pdf.text(`Página ${i} de ${totalPages}`, rightX, pageHeight - 14, { align: 'right' });
        }
      }).save();
    } catch (e) {
      console.error(e);
      alert("Erro ao gerar carnê.");
    }
  };

  const openRegenerateModal = () => {
    if (!selectedContract) return;
    if (!canShowRegenerateContract) {
      alert("Apenas administradores podem regenerar contratos.");
      return;
    }
    console.log("CONTRACT_REGENERATE_CLICK", { contractId: selectedContract.id });
    setShowRegenerateModal(true);
  };

  const confirmRegenerateContract = async () => {
    if (!selectedContract) return;
    // NÃO validar o objeto resumido da lista aqui.
    // A API regenera com o mesmo loader canônico do Mapa GIS (customers * + clients).
    console.log("CONTRACT_REGENERATE_CONFIRM", {
      contractId: selectedContract.id,
    });
    setRegeneratingContract(true);
    setCustomerContractValidation(null);
    try {
      const impersonatingTenantId =
        typeof window !== "undefined"
          ? localStorage.getItem("impersonating_tenant_id")
          : null;
      const activeTenantId = await resolveContractsTenantWithDb(user);

      const { ok, data, error } = await fetchJsonWithTimeout<{
        success?: boolean;
        error?: string;
        diagnosticHint?: string;
        missingFields?: string[];
        customerId?: string;
        contract?: { id?: string; needs_regenerar?: boolean };
        versions?: unknown[];
      }>(
        `/api/contracts/${selectedContract.id}/regenerate`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activeTenantId,
            impersonatingTenantId:
              user?.role === "SUPER_ADMIN" ? impersonatingTenantId : null,
          }),
        },
        CONTRACTS_FETCH_TIMEOUT_MS,
      );
      if (!ok || !data?.success) {
        if (data?.missingFields?.length) {
          setCustomerContractValidation({
            valid: false,
            missingFields: data.missingFields,
            missingRequired: data.missingFields,
            missingRecommended: [],
            customerId: data.customerId,
          });
          return;
        }
        const detail = data?.error || error || "Erro ao regenerar contrato";
        console.error("CONTRACT_REGENERATE_UI_FAILED", {
          contractId: selectedContract.id,
          detail,
          diagnosticHint: data?.diagnosticHint,
        });
        throw new Error(detail);
      }

      const json = data;
      setContractVersions(json.versions || []);

      const newId = json.contract?.id;
      if (json.contract) {
        try {
          const [one] = await enrichContractsWithRelations([json.contract]);
          setSelectedContract(one || json.contract);
        } catch (enrichErr) {
          console.warn("[CONTRATOS] enrich após regenerar", enrichErr);
          setSelectedContract(json.contract);
        }
      }

      setCustomerContractValidation(null);
      setContractViewError(null);
      setContractToast("Contrato regenerado com sucesso.");
      setActiveTab("Visualização");
      // HTML já foi persistido pela API — apenas refetch (sem refresh=1 forçado).
      setContractHtmlRetryKey((k) => k + 1);

      void reloadContractsList()
        .then((rows) => {
          setContracts(rows);
          processContractsFromRows(rows);
          if (newId) {
            const enriched = rows.find((c: any) => c.id === newId);
            if (enriched) setSelectedContract(enriched);
          }
        })
        .catch((reloadErr) => {
          console.warn("[CONTRATOS] reload após regenerar", reloadErr);
        });
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Erro ao regenerar contrato";
      console.error("CONTRACT_REGENERATE_ERROR", msg);
      setContractToast(msg);
    } finally {
      setRegeneratingContract(false);
      setShowRegenerateModal(false);
    }
  };

  const processContractsFromRows = (data: any[]) => {
    setStats(computeSaleContractDashboardStats(data));
  };

  const showMobileSignatureAction = useMemo(() => {
    if (!selectedContract) return false;
    if (isSaleContractFullySigned(selectedContract)) {
      return false;
    }
    if (signatureCaps.canSend || signatureCaps.canShare) return true;
    return (
      canSendSaleSignature(selectedContract.status, selectedContract.signature_status) ||
      canResendSaleSignature(selectedContract.signature_status)
    );
  }, [selectedContract, signatureCaps]);

  const mobileSignatureCanSend = useMemo(() => {
    if (!selectedContract) return false;
    if (signatureCaps.canSend) return true;
    if (signatureCaps.canShare) return false;
    return canSendSaleSignature(selectedContract.status, selectedContract.signature_status);
  }, [selectedContract, signatureCaps]);

  const mobileSignatureCanShare = useMemo(() => {
    if (!selectedContract) return false;
    if (signatureCaps.canShare) return true;
    return canResendSaleSignature(selectedContract.signature_status);
  }, [selectedContract, signatureCaps]);

  const showMobileVendorSignAction = useMemo(() => {
    if (!selectedContract) return false;
    const signatureStatus = signatureCaps.canVendorSign
      ? "CLIENT_SIGNED"
      : selectedContract.signature_status;
    return canShowMobileVendorSignAction({
      signatureStatus,
      contractStatus: selectedContract.status,
      isAdmin: isPartnerPanelAdmin(user?.role),
      ownerReadOnly: blockOwnerWriteOnClient(user?.role),
    });
  }, [selectedContract, signatureCaps.canVendorSign, user?.role]);

  const handleMobileVendorSignAction = () => {
    signatureSectionRef.current?.openVendorSignModal();
  };

  if (authLoading) return null;

  const allFilteredSelected =
    filteredContracts.length > 0 &&
    selectedContractIds.size === filteredContracts.length;
  const bulkDeleteCount = selectedContractIds.size;

  const mobileDockSummary = selectedContract
    ? resolveMobileDockSummary(selectedContract)
    : null;
  const mobileDockStatusLabel = selectedContract
    ? getStatusLabel(selectedContract.status).toUpperCase()
    : "";

  const mobileSignatureLabel = signatureCaps.sending
    ? "Enviando…"
    : mobileSignatureCanShare && !mobileSignatureCanSend
      ? "Compartilhar link"
      : "Enviar p/ Assinatura";

  const handleMobileSignatureAction = () => {
    if (mobileSignatureCanSend) {
      void signatureSectionRef.current?.sendForSignature();
      return;
    }
    signatureSectionRef.current?.openShareModal();
  };

  return (
    <div
      className={`sv-page flex flex-col h-full font-sans overflow-hidden ${
        selectedContract ? "contracts-page--contract-selected" : ""
      }`}
    >
      {/* Mobile: busca + ações em massa (antes dos indicadores) */}
      <div className="contracts-mobile-top md:hidden">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)] transition-all"
            placeholder="Buscar por cliente, contrato, projeto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="contracts-mobile-bulk">
          <label>
            <input
              type="checkbox"
              className="rounded border-gray-600 bg-[var(--bg-card)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              checked={allFilteredSelected}
              onChange={handleSelectAll}
            />
            <span>Selecionar</span>
          </label>
          <button
            type="button"
            onClick={handleLimparTestes}
            disabled={bulkDeleteCount === 0 || ownerReadOnly}
            className={`contracts-mobile-bulk-delete transition-colors ${
              bulkDeleteCount > 0 && !ownerReadOnly
                ? "text-red-400 hover:text-red-300"
                : "text-[var(--text-muted)] cursor-not-allowed"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir{bulkDeleteCount > 0 ? ` (${bulkDeleteCount})` : ""}
          </button>
        </div>
      </div>

      {/* Mobile: indicadores horizontais */}
      <div className="contracts-mobile-stats-wrap md:hidden" aria-label="Resumo de contratos">
        <div className="contracts-mobile-stats-scroll">
          <div className="contracts-mobile-stat-chip">
            <span className="contracts-mobile-stat-label">Ativos</span>
            <span className="contracts-mobile-stat-value">{stats.ativos}</span>
          </div>
          <div className="contracts-mobile-stat-chip">
            <span className="contracts-mobile-stat-label">Pendentes</span>
            <span className="contracts-mobile-stat-value">{stats.pendentes}</span>
          </div>
          <div className="contracts-mobile-stat-chip">
            <span className="contracts-mobile-stat-label">Assinados</span>
            <span className="contracts-mobile-stat-value">{stats.assinados}</span>
          </div>
          <div className="contracts-mobile-stat-chip">
            <span className="contracts-mobile-stat-label">Cancelados</span>
            <span className="contracts-mobile-stat-value">{stats.cancelados}</span>
          </div>
          <div className="contracts-mobile-stat-chip contracts-mobile-stat-chip--valor">
            <span className="contracts-mobile-stat-label">Valor total</span>
            <span className="contracts-mobile-stat-value contracts-mobile-stat-value--currency">
              {formatCompactCurrencyBRL(stats.valorTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Desktop / tablet: cards de resumo */}
      <div className="hidden md:grid md:grid-cols-5 gap-4 p-4 sm:p-6 border-b border-[var(--color-border)] bg-[var(--bg-card)] min-w-0">
        <div className="bg-[var(--bg-elevated)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[var(--text-secondary)] text-sm font-medium mb-1">
              Contratos Ativos
            </p>
            <h3 className="text-2xl font-bold">{stats.ativos}</h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[var(--bg-elevated)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[var(--text-secondary)] text-sm font-medium mb-1">Assinados</p>
            <h3 className="text-2xl font-bold">{stats.assinados}</h3>
            <p className="text-[10px] text-[var(--color-success)] mt-1 font-medium">
              {saleContractDashboardPercent(stats.assinados, stats.ativos)}% do total
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center text-[var(--color-success)]">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[var(--bg-elevated)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[var(--text-secondary)] text-sm font-medium mb-1">Pendentes</p>
            <h3 className="text-2xl font-bold">{stats.pendentes}</h3>
            <p className="text-[10px] text-[var(--color-warning)] mt-1 font-medium">
              {saleContractDashboardPercent(stats.pendentes, stats.ativos)}% do total
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-[var(--color-warning)]/10 flex items-center justify-center text-[var(--color-warning)]">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[var(--bg-elevated)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[var(--text-secondary)] text-sm font-medium mb-1">Cancelados</p>
            <h3 className="text-2xl font-bold">{stats.cancelados}</h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-[var(--color-danger)]/10 flex items-center justify-center text-[var(--color-danger)]">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[var(--bg-elevated)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[var(--text-secondary)] text-sm font-medium mb-1">
              Val Total Contratado
            </p>
            <h3 className="text-xl lg:text-2xl font-bold">
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(stats.valorTotal)}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row flex-1 overflow-hidden min-w-0 max-md:min-h-0">
        {/* SIDEBAR LIST */}
        <div
          className={`flex flex-col border-b xl:border-b-0 border-r border-[var(--border-color)] bg-[var(--bg-main)] min-w-0 w-full xl:w-[min(100%,380px)] xl:max-w-[400px] shrink-0 md:flex-none md:max-h-[42vh] xl:max-h-none max-md:min-h-0 ${
            selectedContract
              ? "max-md:flex-none max-md:max-h-[36vh]"
              : "max-md:flex-1 max-md:max-h-none"
          }`}
        >
          <div className="hidden md:block p-4 border-b border-[var(--border-color)] shrink-0">
            <div className="relative mb-2">
              <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                className="w-full pl-9 pr-4 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary)] transition-all"
                placeholder="Buscar por cliente, contrato, projeto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex justify-between items-center mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-600 bg-[var(--bg-card)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                  checked={allFilteredSelected}
                  onChange={handleSelectAll}
                />
                <span className="text-xs text-[var(--text-secondary)]">Selecionar todos</span>
              </label>
              <button
                type="button"
                onClick={handleLimparTestes}
                disabled={bulkDeleteCount === 0}
                className={`text-xs transition-colors flex items-center gap-1 ${bulkDeleteCount > 0 ? "text-red-400 hover:text-red-300" : "text-[var(--text-muted)] cursor-not-allowed"}`}
              >
                <Trash2 className="w-3 h-3" /> Excluir selecionados{" "}
                {bulkDeleteCount > 0 ? `(${bulkDeleteCount})` : ""}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 contracts-list-scroll sv-scrollbar sv-scrollbar-dark">
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
              </div>
            ) : filteredContracts.length === 0 ? (
              <div className="text-center p-8 text-sm">
                {listLoadError ? (
                  <>
                    <p className="text-red-400 font-medium mb-2">
                      {listLoadError}
                    </p>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="text-[var(--color-primary)] hover:underline text-xs"
                    >
                      Tentar novamente
                    </button>
                  </>
                ) : (
                  <span className="text-[var(--text-muted)]">
                    Nenhum contrato encontrado.
                  </span>
                )}
              </div>
            ) : (
              filteredContracts.map((c) => {
                const isSelected = selectedContract?.id === c.id;
                const cnum = displayContractNumber(c.contract_number);
                const projName = c.project_name || "Projeto não informado";
                const loc = c.location_display || "Localização não informada";
                const val =
                  Number(c.sale_value_display) ||
                  resolveContractSaleValue(c, c.sales, c.blocks);

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedContract(c)}
                    className={`w-full text-left p-3 max-md:p-3 md:p-3.5 rounded-xl border transition-all duration-200 ${
                      isSelected
                        ? "bg-[var(--bg-card-alt)] border-[var(--color-primary)]/40 shadow-[0_0_15px_rgba(41,128,185,0.1)]"
                        : "bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--border-color)] hover:bg-[var(--bg-card-alt)]"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedContractIds.has(c.id)}
                        onChange={(e) =>
                          toggleContractSelection(c.id, e as any)
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-600 bg-[var(--bg-card)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer mt-1 shrink-0"
                      />
                      <FileText
                        className={`w-4 h-4 shrink-0 mt-1 ${isSelected ? "text-[var(--color-primary)]" : "text-[var(--text-secondary)]"}`}
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-mono text-sm font-bold text-[var(--text-primary)] break-words">
                            Contrato nº {cnum}
                          </span>
                          <span className="text-[var(--text-muted)] hidden sm:inline">|</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getStatusColor(c.status)}`}
                          >
                            {getStatusLabel(c.status)}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug break-words whitespace-normal">
                          Cliente:{' '}
                          {c.customer_name || c.customers?.name || "Cliente não informado"}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] leading-snug break-words whitespace-normal">
                          Projeto: {projName}
                          {loc && loc !== "Localização não informada" ? (
                            <span className="text-[var(--text-muted)]"> | {loc}</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] leading-snug break-words whitespace-normal">
                          Valor:{' '}
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(val)}
                          <span className="text-[var(--text-muted)] mx-1.5">|</span>
                          Data:{' '}
                          {new Date(c.created_at).toLocaleDateString("pt-BR")}
                        </p>
                        {(c.customers?.document || c.customers?.cpf) && (
                          <p className="text-[10px] text-[var(--text-muted)] break-words">
                            CPF/CNPJ: {c.customers?.document || c.customers?.cpf}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* MAIN PREVIEW PANEL — oculto no mobile até haver seleção */}
        <div
          className={`flex-1 min-w-0 bg-[var(--bg-card)] flex-col overflow-hidden relative min-h-0 ${
            selectedContract ? "flex max-md:flex-1" : "hidden md:flex"
          }`}
        >
          {selectedContract ? (
            <>
              <div className="p-6 border-b border-[var(--border-color)] shrink-0">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-[var(--color-primary)]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-3 flex-wrap">
                        {displayContractNumber(selectedContract.contract_number)}
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-[var(--border-subtle)] bg-white/5 text-[var(--text-secondary)]">
                          Versão {selectedContract.version ?? 1}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getStatusColor(selectedContract.status)}`}
                        >
                          {getStatusLabel(selectedContract.status)}
                        </span>
                      </h2>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Gerado em:{" "}
                        {new Date(
                          selectedContract.regenerated_at ||
                            selectedContract.created_at,
                        ).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <div className="contracts-header-actions-desktop flex flex-wrap items-center gap-2 justify-end">
                    {getStatusLabel(selectedContract.status) === "Pendente" && (
                      <button
                        onClick={handleAtivarContrato}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--color-success)] text-[var(--text-primary)] rounded-lg hover:bg-green-600 transition-colors text-sm font-medium shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Ativar Contrato
                      </button>
                    )}
                    {/* Botão Dropdown "Modelos" */}
                    <div className="relative group">
                      <button className="flex items-center gap-2 px-4 py-2 bg-transparent text-[var(--text-secondary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--bg-elevated)] transition-colors text-sm font-medium">
                        Modelos
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                        <a
                          href="/contracts/templates"
                          className="block px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--color-primary)] hover:text-[var(--text-primary)] border-b border-[var(--border-color)]/50"
                        >
                          Novo Contrato
                        </a>
                        <a
                          href="/contracts/templates"
                          className="block px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--color-primary)] hover:text-[var(--text-primary)] border-b border-[var(--border-color)]/50"
                        >
                          Modelos
                        </a>
                        <button className="block w-full text-left px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--color-primary)] hover:text-[var(--text-primary)] border-b border-[var(--border-color)]/50">
                          Gerar PDF
                        </button>
                        <button className="block w-full text-left px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--color-primary)] hover:text-[var(--text-primary)] border-b border-[var(--border-color)]/50">
                          Exportar
                        </button>
                        <button className="block w-full text-left px-4 py-2 text-sm text-[var(--color-success)] hover:bg-[var(--color-success)]/10 hover:text-[var(--color-success)]">
                          Assinar
                        </button>
                      </div>
                    </div>
                    {canShowRegenerateContract && (
                      <button
                        type="button"
                        onClick={openRegenerateModal}
                        disabled={regeneratingContract}
                        className="flex items-center gap-2 px-4 py-2 sv-brand-btn-primary rounded-lg transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${regeneratingContract ? "animate-spin" : ""}`}
                        />
                        Regenerar contrato
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleBaixarPDF()}
                      className="flex items-center gap-2 px-4 py-2 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-elevated)] transition-colors text-sm font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Baixar PDF
                    </button>
                  </div>
                </div>

                <SaleContractSignatureSection
                  ref={signatureSectionRef}
                  contract={selectedContract}
                  userRole={user?.role}
                  loggedInUserEmail={user?.email}
                  authUser={user}
                  onCapabilitiesChange={setSignatureCaps}
                  onSigned={async () => {
                    const rows = await reloadContractsList();
                    setContracts(rows);
                    if (selectedContract?.id) {
                      const updated = rows.find((c) => c.id === selectedContract.id);
                      if (updated) setSelectedContract(updated);
                    }
                  }}
                />

                {/* Header Infos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-sm mt-4">
                  <div>
                    <p className="text-[var(--text-muted)] text-xs mb-1">Cliente</p>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {selectedContract.customer_name ||
                        selectedContract.customers?.name ||
                        "Cliente não informado"}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      CPF:{" "}
                      {selectedContract.customers?.document ||
                        selectedContract.customers?.cpf ||
                        "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--text-muted)] text-xs mb-1">Projeto</p>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {selectedContract.project_name ||
                        selectedContract.project_name_snapshot ||
                        selectedContract.sales?.projects?.name ||
                        selectedContract.blocks?.projects?.name ||
                        selectedContract.projects?.name ||
                        "Projeto não informado"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--text-muted)] text-xs mb-1">Localização</p>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {selectedContract.location_display ||
                        buildLocationDisplay(
                          resolveBlockQuadra(selectedContract.blocks),
                          resolveLotNumber(
                            selectedContract.blocks,
                            selectedContract,
                          ),
                        )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--text-muted)] text-xs mb-1">
                      Valor do Contrato
                    </p>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(
                        Number(selectedContract.sale_value_display) ||
                          resolveContractSaleValue(
                            selectedContract,
                            selectedContract.sales,
                            selectedContract.blocks,
                          ),
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-4 sm:gap-6 px-4 sm:px-6 border-b border-[var(--border-color)] overflow-x-auto min-w-0 shrink-0 sv-scrollbar sv-scrollbar-dark">
                {[
                  "Visualização",
                  "Dados do Contrato",
                  "Parcelas",
                  "Arquivos",
                  "Histórico",
                ].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-3 text-sm font-medium border-b-2 transition-colors shrink-0 whitespace-nowrap ${activeTab === tab ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Body Content */}
              <div className="flex-1 overflow-hidden flex bg-[var(--bg-main)] min-w-0 min-h-0">
                {activeTab === "Visualização" && (
                  <>
                    <div className="flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto overflow-x-hidden max-md:contracts-detail-mobile-pad contracts-detail-mobile-pad sv-scrollbar sv-scrollbar-dark">
                      {contractViewNeedsRegenerar && (
                        <p className="max-w-[800px] mx-auto mb-3 text-xs text-amber-400/90">
                          Este contrato precisa ser regenerado para atualizar a visualização.
                        </p>
                      )}
                      <div className="max-w-[800px] mx-auto bg-white rounded shadow-lg overflow-hidden border border-[var(--border-color)] origin-top p-8 text-black min-h-[800px]">
                        {contractViewLoading && !resolvedContractHtml ? (
                          <div className="flex items-center justify-center py-32 text-[var(--text-muted)]">
                            <Loader2 className="w-8 h-8 animate-spin mr-2" />
                            Carregando visualização do contrato…
                          </div>
                        ) : contractViewError && !resolvedContractHtml ? (
                          <div className="flex flex-col items-center justify-center py-24 text-center gap-4 px-4">
                            <p className="text-base font-semibold text-[var(--text-primary)]">
                              Não foi possível carregar a visualização do contrato.
                            </p>
                            <p className="text-sm text-red-400 max-w-md">{contractViewError}</p>
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => setContractHtmlRetryKey((k) => k + 1)}
                                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
                              >
                                Tentar novamente
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleBaixarPDF()}
                                className="px-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] hover:bg-[var(--bg-main)] text-[var(--text-primary)] text-sm font-semibold"
                              >
                                Baixar PDF
                              </button>
                              {canShowRegenerateContract && (
                                <button
                                  type="button"
                                  onClick={openRegenerateModal}
                                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold"
                                >
                                  Regenerar contrato
                                </button>
                              )}
                            </div>
                          </div>
                        ) : resolvedContractHtml ? (
                          <div
                            dangerouslySetInnerHTML={{
                              __html: resolvedContractHtml,
                            }}
                          />
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-secondary)] h-full py-32">
                            <FileText className="w-16 h-16 mb-4 opacity-30" />
                            <p>
                              Contrato gerado sem conteúdo. Verifique o modelo.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Timeline Sidebar inside preview */}
                    <div className="hidden 2xl:block flex-none w-[min(100%,260px)] border-l border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-6 overflow-y-auto sv-scrollbar sv-scrollbar-dark shrink-0">
                      <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                        <History className="w-4 h-4 text-[var(--text-secondary)]" />
                        Histórico de versões
                      </h3>
                      <div className="space-y-2 mb-6">
                        {(contractVersions.length > 0
                          ? contractVersions
                          : [selectedContract]
                        ).map((ver: any) => (
                          <div
                            key={ver.id}
                            className="flex items-center justify-between gap-2 p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-xs"
                          >
                            <div>
                              <p className="font-semibold text-[var(--text-primary)]">
                                Versão {ver.version ?? 1}
                                <span
                                  className={`ml-2 px-1.5 py-0.5 rounded text-[10px] border ${getStatusColor(ver.status)}`}
                                >
                                  {getStatusLabel(ver.status)}
                                </span>
                              </p>
                              <p className="text-[var(--text-muted)] mt-0.5">
                                {new Date(
                                  ver.regenerated_at || ver.created_at,
                                ).toLocaleString("pt-BR")}
                              </p>
                              {ver.regenerated_from && (
                                <p className="text-amber-400/90 mt-0.5">
                                  Regenerado (v
                                  {Math.max(1, (ver.version ?? 2) - 1)} → v
                                  {ver.version ?? 1})
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleDownloadVersion(ver)}
                              className="text-[var(--color-primary)] hover:underline shrink-0 flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              Baixar
                            </button>
                          </div>
                        ))}
                      </div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)] mb-6">
                        Linha do Tempo
                      </h3>
                      <div className="space-y-6">
                        <TimelineItem
                          icon={<FileText />}
                          color="success"
                          title="Contrato criado"
                          date={new Date(
                            selectedContract.created_at,
                          ).toLocaleString("pt-BR")}
                          author="Admin"
                          active
                        />
                        <TimelineItem
                          icon={<CheckCircle2 />}
                          color="success"
                          title="Cliente cadastrado"
                          date={new Date(
                            selectedContract.customers?.created_at ||
                              selectedContract.created_at,
                          ).toLocaleString("pt-BR")}
                          author="Admin"
                          active
                        />
                        <TimelineItem
                          icon={<Wallet />}
                          color="info"
                          title="Entrada registrada"
                          subtitle="No momento da venda"
                          active={
                            Number(selectedContract.sales?.down_payment) > 0
                          }
                        />
                        <TimelineItem
                          icon={<FileText />}
                          color="purple"
                          title="PDF gerado"
                          subtitle="Sistema"
                          active={!!selectedContract.generated_html}
                        />
                        <TimelineItem
                          icon={<Clock />}
                          color="warning"
                          title="Assinatura pendente"
                          subtitle="Aguardando assinatura do cliente"
                          active={
                            getStatusLabel(selectedContract.status) ===
                            "Pendente"
                          }
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeTab === "Dados do Contrato" && (
                  <div className="flex-1 p-6 overflow-y-auto contracts-detail-mobile-pad sv-scrollbar sv-scrollbar-dark">
                    <div className="max-w-[800px] mx-auto bg-[var(--bg-elevated)] p-6 rounded-lg border border-[var(--border-color)]">
                      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-6">
                        Dados Principais do Contrato
                      </h3>
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">
                            Número do Contrato
                          </p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {displayContractNumber(
                              selectedContract.contract_number,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">Status</p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {getStatusLabel(selectedContract.status)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">Cliente</p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {selectedContract.customers?.name}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">CPF/CNPJ</p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {selectedContract.customers?.document ||
                              selectedContract.customers?.cpf}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">RG</p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {selectedContract.customers?.rg || "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">Projeto</p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {selectedContract.projects?.name ||
                              selectedContract.sales?.projects?.name ||
                              selectedContract.project_name_snapshot}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">Quadra</p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {selectedContract.blocks?.block_name ||
                              selectedContract.blocks?.name ||
                              selectedContract.sales?.blocks?.block_name}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">Lote</p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {selectedContract.blocks?.number ||
                              selectedContract.sales?.blocks?.number}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">
                            Valor Total
                          </p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            }).format(
                              Number(
                                selectedContract.sales?.total_value ||
                                  selectedContract.sales?.final_value ||
                                  selectedContract.sales?.agreed_price ||
                                  0,
                              ),
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">Entrada</p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            }).format(
                              Number(selectedContract.sales?.down_payment || 0),
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">
                            Quantidade de Parcelas
                          </p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {selectedContract.sales?.installments || "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">
                            Valor da Parcela
                          </p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            }).format(
                              Number(
                                selectedContract.sales?.installment_value || 0,
                              ),
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--text-muted)] text-xs mb-1">
                            Data da Venda
                          </p>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {selectedContract.sales?.created_at
                              ? new Date(
                                  selectedContract.sales.created_at,
                                ).toLocaleDateString("pt-BR")
                              : new Date(
                                  selectedContract.created_at,
                                ).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "Parcelas" && (
                  <div className="flex-1 p-6 overflow-y-auto contracts-detail-mobile-pad sv-scrollbar sv-scrollbar-dark">
                    <div className="max-w-[800px] mx-auto bg-[var(--bg-elevated)] p-6 rounded-lg border border-[var(--border-color)]">
                      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-6">
                        Parcelas do Contrato
                      </h3>
                      {receipts.length > 0 ? (
                        <table className="w-full text-left text-sm text-[var(--text-secondary)]">
                          <thead>
                            <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)]">
                              <th className="py-2">Parcela</th>
                              <th className="py-2">Vencimento</th>
                              <th className="py-2">Valor</th>
                              <th className="py-2">Recebido</th>
                              <th className="py-2">Status</th>
                              <th className="py-2">Data Pgto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {receipts.map((r, idx) => (
                              <tr
                                key={r.id}
                                className="border-b border-[var(--border-color)]/50 last:border-0 border-t-transparent hover:bg-[var(--bg-card-alt)]/20 transition-colors"
                              >
                                <td className="py-3 font-mono">
                                  {r.installment_number || idx + 1}
                                </td>
                                <td className="py-3">
                                  {r.due_date
                                    ? new Date(r.due_date).toLocaleDateString(
                                        "pt-BR",
                                        { timeZone: "UTC" },
                                      )
                                    : "-"}
                                </td>
                                <td className="py-3">
                                  {new Intl.NumberFormat("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  }).format(Number(r.amount))}
                                </td>
                                <td className="py-3 text-green-400">
                                  {r.amount_paid
                                    ? new Intl.NumberFormat("pt-BR", {
                                        style: "currency",
                                        currency: "BRL",
                                      }).format(Number(r.amount_paid))
                                    : "-"}
                                </td>
                                <td className="py-3">
                                  <span
                                    className={`px-2 py-1 rounded text-[10px] uppercase font-bold ${r.status === "paid" ? "bg-green-500/10 text-[var(--color-success)] border border-[var(--color-success)]/20" : r.status === "overdue" || (r.status === "pending" && new Date(r.due_date) < new Date()) ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"}`}
                                  >
                                    {r.status === "paid"
                                      ? "Pago"
                                      : r.status === "overdue" ||
                                          (r.status === "pending" &&
                                            new Date(r.due_date) < new Date())
                                        ? "Vencido"
                                        : "Pendente"}
                                  </span>
                                </td>
                                <td className="py-3">
                                  {r.payment_date
                                    ? new Date(
                                        r.payment_date,
                                      ).toLocaleDateString("pt-BR", {
                                        timeZone: "UTC",
                                      })
                                    : "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-center py-10 text-[var(--text-muted)]">
                          <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>Nenhuma parcela encontrada para este contrato.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "Arquivos" && (
                  <div className="flex-1 p-6 overflow-y-auto contracts-detail-mobile-pad sv-scrollbar sv-scrollbar-dark">
                    <div className="max-w-[800px] mx-auto bg-[var(--bg-elevated)] p-6 rounded-lg border border-[var(--border-color)]">
                      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-6">
                        Arquivos Anexados
                      </h3>

                      <div className="flex gap-4 mb-8">
                        <button
                          onClick={handleBaixarPDF}
                          className="flex flex-col items-center justify-center p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--color-primary)] transition-colors w-32"
                        >
                          <Download className="w-8 h-8 text-[var(--color-primary)] mb-2" />
                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            Baixar PDF
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] mt-1">
                            Contrato ativo
                          </span>
                        </button>
                        <button
                          onClick={handleImprimir}
                          className="flex flex-col items-center justify-center p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] hover:border-info transition-colors w-32"
                        >
                          <Printer className="w-8 h-8 text-info mb-2" />
                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            Imprimir
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] mt-1">
                            Contrato ativo
                          </span>
                        </button>
                        <button
                          onClick={handleGerarCarne}
                          className="flex flex-col items-center justify-center p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] hover:border-warning transition-colors w-32"
                        >
                          <Receipt className="w-8 h-8 text-warning mb-2" />
                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            Gerar Carnê
                          </span>
                        </button>
                      </div>

                      <LegacyContractDocumentsSection saleId={selectedContract.sale_id} />
                    </div>
                  </div>
                )}

                {activeTab === "Histórico" && (
                  <div className="flex-1 p-6 overflow-y-auto contracts-detail-mobile-pad sv-scrollbar sv-scrollbar-dark">
                    <div className="max-w-[800px] mx-auto space-y-6">
                      <div className="bg-[var(--bg-elevated)] p-6 rounded-lg border border-[var(--border-color)]">
                        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                          <History className="w-5 h-5 text-[var(--text-secondary)]" />
                          Histórico de versões
                        </h3>
                        <div className="space-y-2">
                          {(contractVersions.length > 0
                            ? contractVersions
                            : [selectedContract]
                          ).map((ver: any) => (
                            <div
                              key={ver.id}
                              className="flex items-center justify-between gap-3 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]"
                            >
                              <div>
                                <p className="text-sm font-semibold text-[var(--text-primary)]">
                                  Versão {ver.version ?? 1} —{" "}
                                  {getStatusLabel(ver.status)}
                                </p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">
                                  Gerado em:{" "}
                                  {new Date(
                                    ver.regenerated_at || ver.created_at,
                                  ).toLocaleString("pt-BR")}
                                </p>
                                {ver.regenerated_from && (
                                  <p className="text-xs text-amber-400/90 mt-0.5">
                                    Contrato regenerado (v
                                    {Math.max(1, (ver.version ?? 2) - 1)} → v
                                    {ver.version ?? 1})
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleDownloadVersion(ver)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-primary)]/30 text-[var(--color-primary)] text-sm hover:bg-[var(--color-primary)]/10"
                              >
                                <Download className="w-4 h-4" />
                                Baixar
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    <div className="bg-[var(--bg-elevated)] p-6 rounded-lg border border-[var(--border-color)]">
                      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-6">
                        Linha do Tempo
                      </h3>
                      <div className="space-y-6 ml-4">
                        <TimelineItem
                          icon={<FileText />}
                          color="success"
                          title="Contrato criado"
                          date={new Date(
                            selectedContract.created_at,
                          ).toLocaleString("pt-BR")}
                          author="Admin"
                          active
                        />
                        {selectedContract.customers && (
                          <TimelineItem
                            icon={<CheckCircle2 />}
                            color="success"
                            title="Cliente cadastrado"
                            date={new Date(
                              selectedContract.customers.created_at ||
                                selectedContract.created_at,
                            ).toLocaleString("pt-BR")}
                            author="Admin"
                            active
                          />
                        )}
                        <TimelineItem
                          icon={<Wallet />}
                          color="info"
                          title="Entrada registrada"
                          subtitle="No momento da venda"
                          active={
                            Number(selectedContract.sales?.down_payment) > 0
                          }
                        />
                        <TimelineItem
                          icon={<FileText />}
                          color="purple"
                          title="PDF gerado"
                          subtitle="Sistema"
                          active={!!selectedContract.generated_html}
                        />
                        {(contractVersions.length > 0
                          ? contractVersions
                          : [selectedContract]
                        )
                          .filter((ver: any) => ver.regenerated_from)
                          .sort(
                            (a: any, b: any) =>
                              (a.version ?? 0) - (b.version ?? 0),
                          )
                          .map((ver: any) => {
                            const prevVer = Math.max(1, (ver.version ?? 2) - 1);
                            return (
                              <TimelineItem
                                key={`regen-${ver.id}`}
                                icon={<RefreshCw />}
                                color="warning"
                                title="Contrato regenerado"
                                subtitle={`Versão anterior: v${prevVer} → Nova versão: v${ver.version ?? 1}`}
                                date={new Date(
                                  ver.regenerated_at || ver.created_at,
                                ).toLocaleString("pt-BR")}
                                author={user?.name || "Usuário"}
                                active
                              />
                            );
                          })}
                        {selectedContract.status === "assinado" && (
                          <TimelineItem
                            icon={<CheckCircle2 />}
                            color="success"
                            title="Contrato Assinado"
                            date={new Date(
                              selectedContract.updated_at ||
                                selectedContract.created_at,
                            ).toLocaleString("pt-BR")}
                            author="Sistema"
                            active
                          />
                        )}
                        {selectedContract.status === "cancelado" && (
                          <TimelineItem
                            icon={<X />}
                            color="danger"
                            title="Contrato Cancelado"
                            date={new Date(
                              selectedContract.updated_at ||
                                selectedContract.created_at,
                            ).toLocaleString("pt-BR")}
                            author="Sistema"
                            active
                          />
                        )}
                        {getStatusLabel(selectedContract.status) ===
                          "Pendente" && (
                          <TimelineItem
                            icon={<Clock />}
                            color="warning"
                            title="Assinatura pendente"
                            subtitle="Aguardando assinatura do cliente"
                            active
                          />
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                )}
              </div>

              {/* BOTTOM ACTION BAR — desktop/tablet */}
              <div className="contracts-desktop-action-bar p-4 border-t border-[var(--border-color)] bg-[var(--bg-card)] flex flex-wrap items-center justify-center gap-3">
                <ActionBtn
                  onClick={handleBaixarPDF}
                  icon={<Download />}
                  label="Baixar PDF"
                  color="primary"
                />
                <ActionBtn
                  onClick={handleImprimir}
                  icon={<Printer />}
                  label="Imprimir"
                  color="info"
                />
                <ActionBtn
                  onClick={handleReenviar}
                  icon={<Send />}
                  label="Reenviar"
                  color="purple"
                />
                <ActionBtn
                  onClick={() => setActiveTab("Templates")}
                  icon={<Edit />}
                  label="Editar Modelo"
                  color="warning"
                />
                {canShowRegenerateContract && (
                  <ActionBtn
                    onClick={openRegenerateModal}
                    icon={
                      <RefreshCw
                        className={`w-4 h-4 ${regeneratingContract ? "animate-spin" : ""}`}
                      />
                    }
                    label="Regenerar Contrato"
                    color="amber"
                    disabled={regeneratingContract}
                  />
                )}
                <ActionBtn
                  onClick={handleCancelar}
                  icon={<X />}
                  label="Cancelar"
                  color="danger"
                />

                <div className="h-8 w-[1px] bg-[var(--border-color)] mx-2 hidden sm:block"></div>

                <button
                  onClick={handleGerarCarne}
                  className="flex items-center gap-2 px-4 py-2 border border-[var(--border-color)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] rounded-lg text-sm font-medium transition-colors"
                >
                  <Receipt className="w-4 h-4" />
                  Gerar Carnê
                  <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
              <div className="w-24 h-24 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mb-6">
                <FileText className="w-10 h-10 opacity-30" />
              </div>
              <h3 className="text-xl font-bold text-[var(--text-secondary)] mb-2">
                Nenhum contrato selecionado
              </h3>
              <p className="text-sm">
                Selecione um contrato na lista à esquerda para visualizar os
                detalhes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: ações fixas acima da bottom navigation */}
      {selectedContract && mobileDockSummary && (
        <div
          className="contracts-mobile-action-dock md:hidden"
          role="region"
          aria-label="Ações do contrato selecionado"
        >
          <div className="contracts-mobile-dock-summary">
            <div className="contracts-mobile-dock-summary-head">
              <span className="contracts-mobile-dock-contract">
                Contrato {mobileDockSummary.contractNo}
              </span>
              <span
                className={`contracts-mobile-dock-status ${getStatusColor(selectedContract.status)}`}
              >
                {mobileDockStatusLabel}
              </span>
            </div>
            <p className="contracts-mobile-dock-line">
              <span className="contracts-mobile-dock-label">Cliente:</span>{" "}
              {mobileDockSummary.client}
            </p>
            <p className="contracts-mobile-dock-line">
              <span className="contracts-mobile-dock-label">Projeto:</span>{" "}
              {mobileDockSummary.project}
            </p>
            {mobileDockSummary.lote ? (
              <p className="contracts-mobile-dock-line">
                <span className="contracts-mobile-dock-label">Lote:</span>{" "}
                {mobileDockSummary.lote}
              </p>
            ) : null}
            <p className="contracts-mobile-dock-line contracts-mobile-dock-line--valor">
              <span className="contracts-mobile-dock-label">Valor:</span>{" "}
              {mobileDockSummary.valueFmt}
            </p>
          </div>
          <div className="contracts-mobile-action-dock-scroll">
            <div className="contracts-mobile-action-dock-grid">
              <button
                type="button"
                onClick={() => void handleBaixarPDF()}
                className="contracts-mobile-action-btn contracts-mobile-action-btn--primary"
              >
                <Download />
                Gerar PDF
              </button>
              <button
                type="button"
                onClick={() => void handleGerarCarne()}
                className="contracts-mobile-action-btn"
              >
                <Receipt />
                Carnê
              </button>
              <a
                href="/contracts/templates"
                className="contracts-mobile-action-btn"
              >
                <Edit />
                Modelos
              </a>
              {canShowRegenerateContract && (
                <button
                  type="button"
                  onClick={openRegenerateModal}
                  disabled={regeneratingContract}
                  className="contracts-mobile-action-btn sv-brand-muted-bg sv-brand-text sv-brand-muted-border"
                >
                  <RefreshCw
                    className={regeneratingContract ? "animate-spin" : ""}
                  />
                  Regenerar
                </button>
              )}
              {getStatusLabel(selectedContract.status) === "Pendente" && (
                <button
                  type="button"
                  onClick={handleAtivarContrato}
                  className="contracts-mobile-action-btn contracts-mobile-action-btn--success"
                >
                  <CheckCircle2 />
                  Ativar
                </button>
              )}
              <button
                type="button"
                onClick={handleImprimir}
                className="contracts-mobile-action-btn"
              >
                <Printer />
                Imprimir
              </button>
              {showMobileVendorSignAction && (
                <button
                  type="button"
                  disabled={
                    signatureCaps.signingVendor ||
                    blockOwnerWriteOnClient(user?.role)
                  }
                  onClick={handleMobileVendorSignAction}
                  className="contracts-mobile-action-btn contracts-mobile-action-btn--signature"
                >
                  <ShieldCheck
                    className={signatureCaps.signingVendor ? "animate-pulse" : ""}
                  />
                  {signatureCaps.signingVendor
                    ? "Assinando…"
                    : "Assinar como vendedor"}
                </button>
              )}
              {showMobileSignatureAction && (
                <button
                  type="button"
                  disabled={signatureCaps.sending || blockOwnerWriteOnClient(user?.role)}
                  onClick={handleMobileSignatureAction}
                  className="contracts-mobile-action-btn contracts-mobile-action-btn--signature"
                >
                  <ShieldCheck className={signatureCaps.sending ? "animate-pulse" : ""} />
                  {mobileSignatureLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab("Templates")}
                className="contracts-mobile-action-btn"
              >
                <Edit />
                Editar modelo
              </button>
              <button
                type="button"
                onClick={handleCancelar}
                className="contracts-mobile-action-btn contracts-mobile-action-btn--danger"
              >
                <X />
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {contractToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[3000] px-5 py-3 rounded-xl bg-[var(--bg-elevated)] border border-amber-500/40 text-amber-100 text-sm font-medium shadow-xl max-w-md text-center">
          {contractToast}
        </div>
      )}

      <RegenerateContractModal
        open={showRegenerateModal}
        busy={regeneratingContract}
        onCancel={() => setShowRegenerateModal(false)}
        onConfirm={() => void confirmRegenerateContract()}
      />

      <CustomerContractValidationModal
        open={Boolean(customerContractValidation)}
        validation={customerContractValidation}
        onClose={() => setCustomerContractValidation(null)}
      />

      {/* Modal de Senha para Exclusão */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" />
                Confirmar Exclusão
              </h3>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Digite sua senha para confirmar a exclusão de{" "}
              {selectedContractIds.size} contrato(s).
            </p>
            <input
              type="password"
              placeholder="Sua senha"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-gray-500 focus:outline-none focus:border-red-500 mb-6"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button
                onClick={executeDelete}
                disabled={isDeleting || !passwordInput}
                className={`px-4 py-2 text-sm font-bold text-[var(--text-primary)] rounded-lg transition-colors flex items-center gap-2 ${
                  isDeleting || !passwordInput
                    ? "bg-red-500/50 cursor-not-allowed"
                    : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Confirmar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineItem({
  icon,
  title,
  subtitle,
  date,
  author,
  color,
  active,
}: any) {
  const colors: Record<string, string> = {
    success: "text-[var(--color-success)] bg-[var(--color-success)]/20",
    warning: "text-[var(--color-warning)] bg-[var(--color-warning)]/20",
    danger: "text-[var(--color-danger)] bg-[var(--color-danger)]/20",
    info: "text-[var(--color-info)] bg-[var(--color-info)]/20",
    purple: "text-purple-400 bg-purple-500/20",
    inactive: "text-[var(--text-muted)] bg-[var(--bg-card-alt)]",
  };

  return (
    <div className="flex gap-4 relative">
      <div className="absolute left-[15px] top-8 bottom-[-24px] w-[2px] bg-[var(--bg-card-alt)] z-0"></div>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center z-10 shrink-0 ${active ? colors[color] : colors["inactive"]}`}
      >
        <div className="w-4 h-4">{icon}</div>
      </div>
      <div>
        <p
          className={`text-sm font-bold ${active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
        >
          {title}
        </p>
        {date && <p className="text-xs text-[var(--text-muted)] mt-0.5">{date}</p>}
        {subtitle && (
          <p
            className={`text-xs mt-0.5 ${active && color === "warning" ? "text-[var(--color-warning)]" : "text-[var(--text-muted)]"}`}
          >
            {subtitle}
          </p>
        )}
        {author && <p className="text-[10px] text-[var(--text-muted)] mt-1">{author}</p>}
      </div>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  color,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  color: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const colorClasses: Record<string, string> = {
    primary:
      "border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10",
    info: "border-[var(--color-info)]/30 text-[var(--color-info)] hover:bg-[var(--color-info)]/10",
    purple: "border-purple-500/30 text-purple-400 hover:bg-purple-500/10",
    warning:
      "border-[var(--color-warning)]/30 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10",
    amber:
      "sv-brand-muted-border text-[var(--brand-primary)] hover:bg-[color-mix(in_srgb,var(--brand-primary)_15%,transparent)] sv-brand-muted-bg",
    danger:
      "border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${colorClasses[color] || colorClasses.primary}`}
    >
      <div className="w-4 h-4">{icon}</div>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

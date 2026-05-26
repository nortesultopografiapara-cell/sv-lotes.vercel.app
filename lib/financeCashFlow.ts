import { displayContractNumber } from "@/lib/contractNumber";

export type CashFlowItem = {
  id: string;
  source: "finance_receipts" | "cash_movements" | "broker_commissions";
  /** Tabela de origem no banco (cash_movements, broker_commissions, finance_receipts). */
  source_table: string | null;
  source_id: string | null;
  /** Tipo do registro na tabela de origem (ex.: saida, entrada). */
  type: string | null;
  cashMovementId: string | null;
  receiptId: string | null;
  contractId: string | null;
  blockId: string | null;
  projectId: string | null;
  saleId: string | null;
  brokerId: string | null;
  commissionId: string | null;
  movement_date: string;
  tipo: "entrada" | "saida";
  category: string;
  description: string;
  amount: number;
  status: string;
  projectName: string;
  customerName: string;
  locationLabel: string;
  contractNumber: string;
  brokerName: string;
  isManual: boolean;
};

const MANUAL_LABEL = "Lançamento manual";

export const CASH_MOVEMENT_META_TAG = "[[sv_meta]]";

export type CashMovementManualMeta = {
  manual_customer?: string;
  manual_quadra?: string;
  manual_lote?: string;
  manual_contract?: string;
  manual_broker?: string;
};

/** Converte "5685,37" / "5.685,37" / "5685.37" para número. */
export function parseMoneyAmount(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  let s = String(raw ?? "").trim();
  if (!s) return null;
  s = s.replace(/[R$\s]/gi, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function emptyUuidToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

export function stripUndefinedFields(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) out[key] = val;
  }
  return out;
}

type SupabaseErrorShape = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

export function formatSupabaseFinanceError(err: unknown): string {
  if (!err) return "Erro desconhecido";
  if (err instanceof Error) return err.message;
  const e = err as SupabaseErrorShape;
  const parts = [e.message, e.details, e.hint, e.code].filter(
    (p) => typeof p === "string" && p.trim().length > 0,
  );
  if (parts.length > 0) return parts.join(" — ");
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function splitCashMovementDescription(raw: string | null | undefined): {
  text: string;
  meta: CashMovementManualMeta | null;
} {
  const desc = String(raw ?? "");
  const idx = desc.indexOf(CASH_MOVEMENT_META_TAG);
  if (idx === -1) return { text: desc.trim(), meta: null };
  const text = desc.slice(0, idx).trim();
  try {
    const meta = JSON.parse(
      desc.slice(idx + CASH_MOVEMENT_META_TAG.length),
    ) as CashMovementManualMeta;
    return { text, meta };
  } catch {
    return { text: desc.trim(), meta: null };
  }
}

export function buildCashMovementDescription(
  text: string,
  meta: CashMovementManualMeta | null,
): string {
  const clean = text.trim();
  const hasMeta =
    meta &&
    Object.values(meta).some((v) => String(v ?? "").trim().length > 0);
  if (!hasMeta) return clean;
  return `${clean}\n${CASH_MOVEMENT_META_TAG}${JSON.stringify(meta)}`;
}

function formatManualLocation(meta: CashMovementManualMeta | null): string {
  if (!meta) return "";
  const quad = String(meta.manual_quadra ?? "").trim();
  const lot = String(meta.manual_lote ?? "").trim();
  if (quad && lot) return `QD ${quad} • LT ${lot}`;
  if (quad) return `QD ${quad}`;
  if (lot) return `LT ${lot}`;
  return "";
}

export const SAIDA_CATEGORIES = [
  "Comissão",
  "Despesa administrativa",
  "Despesa de obra",
  "Despesa com documentação",
  "Saque",
  "Outros",
] as const;

function isCashMovementSaida(typeStr: string): boolean {
  return ["saida", "saída", "saida ", "despesa", "expense", "commission", "comissao", "comissão"].some(
    (val) => typeStr.includes(val),
  );
}

function isPlaceholderLabel(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    !v ||
    v === "-" ||
    v === "ni" ||
    v === "s/q" ||
    v === "s/l" ||
    v.includes("não informado") ||
    v.includes("nao informado")
  );
}

/** Rótulo para UI/PDF — nunca "Não Informado" se for lançamento sem vínculo. */
export function flowDisplayLabel(
  value: string | null | undefined,
  manual = false,
): string {
  if (manual) return MANUAL_LABEL;
  const v = String(value ?? "").trim();
  if (isPlaceholderLabel(v)) return MANUAL_LABEL;
  return v;
}

export function formatFlowDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const iso = String(dateStr).split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "-";
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

export function parseFlowDateForSort(dateStr: string): Date {
  const iso = String(dateStr || "").split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(`${iso}T12:00:00Z`);
  }
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function resolveBlockLocation(block: any): string {
  if (!block || typeof block !== "object") return "";
  const quad =
    block.block_name || block.block || block.quadra || block.name || "";
  const lot = block.lot_number || block.number || block.lot || "";
  if (quad && lot) return `QD ${quad} • LT ${lot}`;
  if (quad) return `QD ${quad}`;
  if (lot) return `LT ${lot}`;
  return "";
}

function splitLocation(locationLabel: string): { quadra: string; lote: string } {
  if (!locationLabel || locationLabel === MANUAL_LABEL) {
    return { quadra: MANUAL_LABEL, lote: MANUAL_LABEL };
  }
  const qd = locationLabel.match(/QD\s+([^•]+)/i);
  const lt = locationLabel.match(/LT\s+(.+)/i);
  return {
    quadra: qd ? qd[1].trim() : flowDisplayLabel(locationLabel),
    lote: lt ? lt[1].trim() : MANUAL_LABEL,
  };
}

function resolveCashMovementMeta(c: any): {
  projectName: string;
  customerName: string;
  brokerName: string;
  contractNumber: string;
  locationLabel: string;
  isManual: boolean;
  descriptionText: string;
} {
  const { text: descriptionText, meta: manualMeta } = splitCashMovementDescription(
    c.description,
  );

  const hasDbLink = !!(
    c.customer_id ||
    c.contract_id ||
    c.sale_id ||
    c.broker_id
  );
  const hasManualMeta = !!(
    manualMeta?.manual_customer ||
    manualMeta?.manual_quadra ||
    manualMeta?.manual_lote ||
    manualMeta?.manual_contract
  );

  const customer =
    c.customers ||
    c.contracts?.customers ||
    c.sales?.customers ||
    null;
  const block =
    c.blocks ||
    c.contracts?.blocks ||
    c.sales?.blocks ||
    null;

  let projectName =
    c.projects?.name ||
    c.contracts?.projects?.name ||
    c.sales?.projects?.name ||
    "";
  const saleContracts = c.sales?.contracts;
  const saleContractNum = Array.isArray(saleContracts)
    ? saleContracts[0]?.contract_number
    : saleContracts?.contract_number;

  let contractRaw =
    c.contracts?.contract_number || saleContractNum || "";

  let customerName = customer?.name || customer?.full_name || "";
  if (!customerName && manualMeta?.manual_customer) {
    customerName = manualMeta.manual_customer.trim();
  }

  let brokerName = c.brokers?.name || c.brokers?.full_name || "";
  if (!brokerName && manualMeta?.manual_broker) {
    brokerName = manualMeta.manual_broker.trim();
  }
  let locationLabel = resolveBlockLocation(block);
  if (!locationLabel) {
    locationLabel = formatManualLocation(manualMeta);
  }

  if (!contractRaw && manualMeta?.manual_contract) {
    contractRaw = manualMeta.manual_contract.trim();
  }

  const contractNumber = contractRaw
    ? displayContractNumber(contractRaw)
    : "";

  const typeStr = (c.type || "").toLowerCase();
  const isSaida = isCashMovementSaida(typeStr);
  /** Despesa/saque manual: sem vínculo formal de contrato ou venda. */
  const isManual =
    isSaida && !c.finance_receipt_id && !c.contract_id && !c.sale_id;

  const showManualLabel = isManual && !customerName && !contractNumber && !locationLabel;

  return {
    projectName: flowDisplayLabel(projectName, isManual && !projectName),
    customerName: flowDisplayLabel(
      customerName,
      showManualLabel && !customerName,
    ),
    brokerName: flowDisplayLabel(brokerName, isManual && !brokerName),
    contractNumber: contractNumber || (isManual ? MANUAL_LABEL : ""),
    locationLabel: locationLabel || (isManual ? MANUAL_LABEL : ""),
    isManual,
    descriptionText: descriptionText || "-",
  };
}

/** Lista unificada — mesma base dos cards Entradas/Saídas. */
export function buildCashFlowItems(
  receipts: any[],
  cashMvs: any[],
  comms: any[],
): CashFlowItem[] {
  const items: CashFlowItem[] = [];

  (receipts || []).forEach((p) => {
    const status = (p.status || "").toLowerCase();
    if (status !== "pago" && status !== "paid") return;

    const amount = Number(p.paid_amount) || Number(p.amount) || 0;
    if (amount <= 0) return;

    const projectName =
      p.projects?.name ||
      p.sales?.projects?.name ||
      p.blocks?.projects?.name ||
      "Geral/Outros";
    const saleContracts = p.sales?.contracts;
    const firstSaleContract = Array.isArray(saleContracts)
      ? saleContracts[0]
      : saleContracts;
    const contractNumber = displayContractNumber(
      p.contracts?.contract_number ||
        firstSaleContract?.contract_number ||
        "",
    );

    items.push({
      id: `rec_${p.id}`,
      source: "finance_receipts",
      source_table: "finance_receipts",
      source_id: p.id,
      type: "entrada",
      cashMovementId: null,
      receiptId: p.id,
      contractId: p.contract_id || firstSaleContract?.id || null,
      blockId: p.block_id || p.blocks?.id || null,
      projectId: p.project_id || p.projects?.id || p.sales?.project_id || null,
      saleId: p.sale_id || null,
      brokerId: p.broker_id || null,
      commissionId: null,
      movement_date: p.paid_at || p.due_date || p.created_at || "",
      tipo: "entrada",
      category:
        p.installment_number === 0 || p.installment_number === "0"
          ? "Sinal/Entrada"
          : "Parcela",
      description:
        p.description ||
        `Recebimento parcela ${p.installment_number ?? "1"}`.trim(),
      amount,
      status: "ativo",
      projectName,
      customerName: p.customers?.name || p.customers?.full_name || "",
      locationLabel: resolveBlockLocation(p.blocks),
      contractNumber: contractNumber === "S/N" ? "" : contractNumber,
      brokerName: p.brokers?.name || "",
      isManual: false,
    });
  });

  (cashMvs || []).forEach((c) => {
    const st = (c.status || "ativo").toLowerCase();
    if (st === "estornado" || st === "cancelado" || st === "deleted") return;

    const typeStr = (c.type || "").toLowerCase();
    const isSaida = isCashMovementSaida(typeStr);
    const isEntrada = typeStr.includes("entrada") && !isSaida;
    if (!isSaida && !isEntrada) return;
    if (isEntrada && c.finance_receipt_id) return;

    const amount = Number(c.amount) || 0;
    if (amount <= 0) return;

    const meta = resolveCashMovementMeta(c);

    items.push({
      id: `cash_${c.id}`,
      source: "cash_movements",
      source_table: "cash_movements",
      source_id: c.id,
      type: c.type || (isSaida ? "saida" : "entrada"),
      cashMovementId: c.id,
      receiptId: c.finance_receipt_id || null,
      contractId: c.contract_id || c.contracts?.id || null,
      blockId:
        c.contracts?.block_id ||
        c.sales?.block_id ||
        c.sales?.blocks?.id ||
        null,
      projectId:
        c.project_id ||
        c.contracts?.project_id ||
        c.sales?.project_id ||
        null,
      saleId: c.sale_id || null,
      brokerId: c.broker_id || null,
      commissionId: null,
      movement_date: c.movement_date || c.created_at?.split("T")[0] || "",
      tipo: isSaida ? "saida" : "entrada",
      category: c.category || (isSaida ? "Despesa" : "Entrada manual"),
      description: meta.descriptionText,
      amount,
      status: st === "estornado" ? "estornado" : "ativo",
      projectName: meta.projectName,
      customerName: meta.customerName,
      locationLabel: meta.locationLabel,
      contractNumber: meta.contractNumber,
      brokerName: meta.brokerName,
      isManual: meta.isManual,
    });
  });

  (comms || []).forEach((cm) => {
    const cmStatus = (cm.status || "").toLowerCase();
    const isCommPaid = ["pago", "paga", "paid", "aprovado", "aprovada"].includes(
      cmStatus,
    );
    if (!isCommPaid) return;

    const amount = Number(cm.amount) || 0;
    if (amount <= 0) return;

    const duplicatedInCash = (cashMvs || []).some((c) => {
      const typeStr = (c.type || "").toLowerCase();
      if (!isCashMovementSaida(typeStr)) return false;
      return (
        (c.sale_id === cm.sale_id || c.broker_id === cm.broker_id) &&
        Math.abs(Number(c.amount) - amount) < 1
      );
    });
    if (duplicatedInCash) return;

    const sContracts = Array.isArray(cm.sales?.contracts)
      ? cm.sales.contracts
      : [cm.sales?.contracts].filter(Boolean);
    const firstContract = sContracts[0] || {};
    const contractNumber = displayContractNumber(
      firstContract.contract_number ||
        firstContract.number ||
        cm.contracts?.contract_number ||
        "",
    );

    const sBlocks = Array.isArray(cm.sales?.blocks)
      ? cm.sales.blocks
      : [cm.sales?.blocks].filter(Boolean);
    const firstBlock = sBlocks[0] || {};
    const brokerName = cm.brokers?.name || cm.brokers?.full_name || "";

    items.push({
      id: `comm_${cm.id}`,
      source: "broker_commissions",
      source_table: "broker_commissions",
      source_id: cm.id,
      type: "saida",
      cashMovementId: null,
      receiptId: null,
      contractId: firstContract.id || cm.contract_id || cm.contracts?.id || null,
      blockId: firstBlock.id || cm.sales?.block_id || null,
      projectId:
        cm.sales?.project_id ||
        cm.contracts?.project_id ||
        cm.sales?.projects?.id ||
        null,
      saleId: cm.sale_id || null,
      brokerId: cm.broker_id || null,
      commissionId: cm.id,
      movement_date: cm.paid_at || cm.created_at || "",
      tipo: "saida",
      category: "Comissão",
      description: `Pagamento de comissão — ${brokerName}`,
      amount,
      status: "ativo",
      projectName:
        cm.sales?.projects?.name ||
        cm.contracts?.projects?.name ||
        "Geral/Outros",
      customerName:
        cm.sales?.customers?.name ||
        cm.sales?.customers?.full_name ||
        "",
      locationLabel: resolveBlockLocation(firstBlock),
      contractNumber: contractNumber === "S/N" ? "" : contractNumber,
      brokerName,
      isManual: false,
    });
  });

  items.sort(
    (a, b) =>
      parseFlowDateForSort(b.movement_date).getTime() -
      parseFlowDateForSort(a.movement_date).getTime(),
  );

  return items;
}

export type FlowReportRow = {
  id_check: string;
  data: Date;
  projeto: string;
  tipo: string;
  categoria: string;
  cliente: string;
  corretor: string;
  contrato: string;
  quadra: string;
  lote: string;
  descricao: string;
  valor: number;
  status: string;
};

/** Converte itens do fluxo para linhas do relatório PDF/Excel. */
export function cashFlowItemsToReportRows(items: CashFlowItem[]): FlowReportRow[] {
  return items.map((item) => {
    const loc = splitLocation(item.locationLabel);
    const contrato =
      item.contractNumber && !isPlaceholderLabel(item.contractNumber)
        ? displayContractNumber(item.contractNumber)
        : flowDisplayLabel("", item.isManual);

    let status = "Pago";
    if (item.status === "estornado") status = "Estornado";
    else if (item.status === "pendente" || item.status === "pending") status = "Pendente";

    return {
      id_check: item.id,
      data: parseFlowDateForSort(item.movement_date),
      projeto: flowDisplayLabel(item.projectName, item.isManual),
      tipo: item.tipo === "entrada" ? "Entrada" : "Saída",
      categoria: item.category,
      cliente: flowDisplayLabel(item.customerName, item.isManual),
      corretor: flowDisplayLabel(item.brokerName, item.isManual),
      contrato,
      quadra: loc.quadra,
      lote: loc.lote,
      descricao: item.description || "-",
      valor: item.amount,
      status,
    };
  });
}

export function filterFlowReportRows(
  rows: FlowReportRow[],
  opts: {
    project?: string;
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  },
): FlowReportRow[] {
  const start = opts.startDate ? new Date(`${opts.startDate}T00:00:00Z`) : null;
  const end = opts.endDate ? new Date(`${opts.endDate}T23:59:59Z`) : null;

  return rows.filter((m) => {
    if (opts.project && opts.project !== "Todos" && m.projeto !== opts.project) {
      return false;
    }
    if (opts.type && opts.type !== "Todos") {
      const want = opts.type.replace(/s$/, "");
      if (m.tipo !== want) return false;
    }
    if (opts.status === "Todos" || !opts.status) {
      if (m.status === "Pendente") return false;
    } else if (m.status !== opts.status) {
      return false;
    }
    if (start && m.data < start) return false;
    if (end && m.data > end) return false;
    return true;
  });
}

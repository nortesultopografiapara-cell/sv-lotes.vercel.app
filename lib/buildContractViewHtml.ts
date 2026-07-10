/**
 * HTML do contrato para visualização/PDF com dados atuais da empresa (medidas sem confrontações).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeCustomerData } from "@/lib/customerIdentity";
import { assertCustomerValidForContract } from "@/lib/validateCustomerForContract";
import { generateContractHTML } from "@/lib/contractTemplate";
import type { ContractFinanceReceiptRef } from "@/lib/contractTemplate";
import { COMPANY_CONTRACT_LOAD_SELECT } from "@/lib/companyContractFields";
import { isRecantoPrimaveraContractModel } from "@/lib/contractModel";
import { embedRecantoContractSignatureInHtml } from "@/lib/recantoPrimaveraContractAssets";
import { loadManualConfrontants } from "@/lib/lotConfrontations";
import {
  enrichSaleWithBrokerForContract,
} from "@/lib/saleBrokerSnapshot";
import { loadSaleBalloonRows, resolveContractBalloonAddons } from "@/lib/saleBalloonRepository";
import { loadSaleContractContext, parseMissingContractColumn } from "@/lib/contractRegeneration";
import { logContractHtmlGlobal, shouldLoadProjectBlocksForContract } from "@/lib/contractHtmlGlobal";

const COMPANY_CONTRACT_VIEW_SELECT = COMPANY_CONTRACT_LOAD_SELECT;

const SALE_CONTRACT_VIEW_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "block_id",
  "customer_id",
  "broker_id",
  "total_value",
  "final_value",
  "agreed_price",
  "sale_value",
  "down_payment",
  "installments_count",
  "installments",
  "payment_day",
  "first_due_date",
  "plan_type",
  "payment_type",
  "use_balloon_installments",
  "balloon_mode",
  "balloon_config",
  "spouse_name",
  "spouse_cpf",
  "spouse_rg",
  "spouse_nationality",
  "spouse_profession",
  "spouse_marital_status",
  "spouse_address",
  "sale_date",
  "created_at",
].join(", ");

const CUSTOMER_CONTRACT_VIEW_SELECT = [
  "id",
  "tenant_id",
  "name",
  "full_name",
  "document",
  "cpf",
  "rg",
  "email",
  "phone",
  "address",
  "address_number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "zip_code",
  "nationality",
  "profession",
  "marital_status",
  "spouse_name",
  "spouse_cpf",
  "spouse_rg",
  "spouse_nationality",
  "spouse_profession",
  "spouse_marital_status",
  "spouse_address",
].join(", ");

const BLOCK_CONTRACT_VIEW_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "block_name",
  "block",
  "quadra",
  "name",
  "lot_number",
  "number",
  "lot",
  "area",
  "price",
  "front",
  "back",
  "left_side",
  "right_side",
  "segments_json",
  "segment_edges",
  "measures_display",
  "front_street",
  "front_street_official",
  "front_source",
].join(", ");

const PROJECT_CONTRACT_VIEW_SELECT = [
  "id",
  "tenant_id",
  "name",
  "city",
  "state",
  "registry_office",
  "registry_number",
  "matricula",
  "address",
].join(", ");

const BLOCKS_PROJECT_LIST_SELECT = [
  "id",
  "project_id",
  "block_name",
  "block",
  "quadra",
  "name",
  "lot_number",
  "number",
  "lot",
  "area",
  "front",
  "back",
  "left_side",
  "right_side",
  "segments_json",
  "segment_edges",
  "measures_display",
  "front_street",
  "front_street_official",
].join(", ");

const STREET_GUIDES_SELECT =
  "id, project_id, street_name, official_name, guide_text, sort_order";

function logHtmlStep(step: string, startedAt: number, extra?: Record<string, unknown>) {
  console.log("[contracts/html]", step, {
    ms: Date.now() - startedAt,
    ...extra,
  });
}

function stripViewSelectColumn(select: string, column: string): string {
  return select
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && part !== column)
    .join(", ");
}

async function selectRowWithColumnFallback(
  supabase: SupabaseClient,
  table: string,
  select: string,
  eqColumn: string,
  eqValue: string,
): Promise<Record<string, unknown>> {
  let currentSelect = select;

  for (let attempt = 0; attempt < 25; attempt++) {
    const { data, error } = await supabase
      .from(table)
      .select(currentSelect)
      .eq(eqColumn, eqValue)
      .maybeSingle();

    if (!error && data) {
      return data as Record<string, unknown>;
    }

    if (error) {
      const missingCol = parseMissingContractColumn(error.message);
      if (missingCol && currentSelect.includes(missingCol)) {
        currentSelect = stripViewSelectColumn(currentSelect, missingCol);
        console.log("[contracts/html] view_select_fallback", {
          table,
          removed: missingCol,
          attempt: attempt + 1,
        });
        continue;
      }
      throw new Error(error.message);
    }
  }

  throw new Error(`Registro não encontrado em ${table}.`);
}

export async function buildContractViewHtmlForContractId(
  supabase: SupabaseClient,
  contractId: string,
): Promise<string> {
  const startedAt = Date.now();
  const contract = await loadSaleContractContext(supabase, contractId);
  logHtmlStep("context_loaded", startedAt);

  const tenantId = String(contract.tenant_id || contract.company_id || "").trim();
  if (!tenantId) {
    throw new Error("Contrato sem tenant_id.");
  }

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select(COMPANY_CONTRACT_VIEW_SELECT)
    .eq("id", tenantId)
    .single();
  logHtmlStep("company_loaded", startedAt);
  if (companyErr || !company) {
    try {
      const companyRow = await selectRowWithColumnFallback(
        supabase,
        "companies",
        COMPANY_CONTRACT_VIEW_SELECT,
        "id",
        tenantId,
      );
      logHtmlStep("company_loaded", startedAt, { fallback: true });
      return buildContractViewHtmlFromContext(
        supabase,
        contract,
        companyRow,
        startedAt,
      );
    } catch {
      throw new Error(companyErr?.message || "Empresa não encontrada.");
    }
  }

  return buildContractViewHtmlFromContext(
    supabase,
    contract,
    company as Record<string, unknown>,
    startedAt,
  );
}

async function buildContractViewHtmlFromContext(
  supabase: SupabaseClient,
  contract: Record<string, unknown>,
  company: Record<string, unknown>,
  startedAt: number,
): Promise<string> {
  const tenantId = String(contract.tenant_id || contract.company_id || "").trim();
  const saleId = String(contract.sale_id || "").trim();
  let sale: Record<string, unknown> = {};
  if (saleId) {
    const { data: saleRow } = await supabase
      .from("sales")
      .select(SALE_CONTRACT_VIEW_SELECT)
      .eq("id", saleId)
      .maybeSingle();
    sale = (saleRow as Record<string, unknown>) || {};
  }
  logHtmlStep("sale_loaded", startedAt, { saleId: saleId || null });

  let customer: Record<string, unknown> = {};
  const customerId = String(contract.customer_id || "").trim();
  if (customerId) {
    const { data: customerRow } = await supabase
      .from("customers")
      .select(CUSTOMER_CONTRACT_VIEW_SELECT)
      .eq("id", customerId)
      .maybeSingle();
    customer = (customerRow as Record<string, unknown>) || {};
  }
  logHtmlStep("customer_loaded", startedAt);

  let block: Record<string, unknown> = {};
  const blockId = String(contract.block_id || "").trim();
  if (blockId) {
    const { data: blockRow } = await supabase
      .from("blocks")
      .select(BLOCK_CONTRACT_VIEW_SELECT)
      .eq("id", blockId)
      .maybeSingle();
    block = (blockRow as Record<string, unknown>) || {};
  }
  logHtmlStep("block_loaded", startedAt);

  let project: Record<string, unknown> = {};
  const projectId = String(
    contract.project_id || block.project_id || sale.project_id || "",
  ).trim();
  if (projectId) {
    const { data: projectRow } = await supabase
      .from("projects")
      .select(PROJECT_CONTRACT_VIEW_SELECT)
      .eq("id", projectId)
      .maybeSingle();
    project = (projectRow as Record<string, unknown>) || {};
  }
  logHtmlStep("project_loaded", startedAt);

  let receipts: ContractFinanceReceiptRef[] = [];
  if (saleId) {
    const { data: receiptRows } = await supabase
      .from("finance_receipts")
      .select("amount, due_date, status, installment_number")
      .eq("sale_id", saleId)
      .neq("status", "cancelado");
    receipts = (receiptRows || []) as ContractFinanceReceiptRef[];
  }
  logHtmlStep("receipts_loaded", startedAt, { count: receipts.length });

  const balloonRows = saleId ? await loadSaleBalloonRows(supabase, saleId) : [];
  const balloonAddons = resolveContractBalloonAddons({
    sale: sale as Record<string, unknown>,
    tableRows: balloonRows,
  });
  logHtmlStep("balloon_addons_loaded", startedAt, {
    tableCount: balloonRows.length,
    count: balloonAddons.length,
    numbers: balloonAddons.map((a) => a.installment_number),
  });

  const html = await buildContractViewHtml(supabase, {
    contract,
    tenant: { ...(company as Record<string, unknown>), id: tenantId },
    receipts,
    balloonAddons,
    block,
    customer,
    sale,
    project,
  });
  logHtmlStep("html_built", startedAt, { bytes: html.length });
  return html;
}

export async function buildContractViewHtml(
  supabase: SupabaseClient,
  params: {
    contract: Record<string, unknown>;
    tenant: Record<string, unknown>;
    receipts?: ContractFinanceReceiptRef[] | null;
    balloonAddons?: Array<{ installment_number: number; additional_amount: number }> | null;
    block?: Record<string, unknown> | null;
    customer?: Record<string, unknown> | null;
    sale?: Record<string, unknown> | null;
    project?: Record<string, unknown> | null;
  },
): Promise<string> {
  const contract = params.contract;
  let block =
    params.block ||
    (contract.blocks as Record<string, unknown>) ||
    {};

  const blockId = String(
    block.id || contract.block_id || "",
  ).trim();

  if (blockId) {
    const { data: fullBlock } = await supabase
      .from("blocks")
      .select(BLOCK_CONTRACT_VIEW_SELECT)
      .eq("id", blockId)
      .maybeSingle();
    if (fullBlock) {
      block = {
        ...block,
        ...(fullBlock as Record<string, unknown>),
        id: blockId,
      };
    }
  }

  const projectId =
    (contract.project_id as string) ||
    (block.project_id as string) ||
    (params.sale?.project_id as string);

  let projectBlocks: Record<string, unknown>[] = [];
  let streetGuides: Record<string, unknown>[] = [];

  if (projectId && shouldLoadProjectBlocksForContract(params.tenant)) {
    const [{ data: blocks }, { data: guides }] = await Promise.all([
      supabase.from("blocks").select(BLOCKS_PROJECT_LIST_SELECT).eq("project_id", projectId),
      supabase.from("street_guides").select(STREET_GUIDES_SELECT).eq("project_id", projectId),
    ]);
    projectBlocks = (blocks || []) as Record<string, unknown>[];
    streetGuides = (guides || []) as Record<string, unknown>[];
    logContractHtmlGlobal("global-preview", "project_blocks_loaded", {
      projectId,
      blocksCount: projectBlocks.length,
    });
  }

  const manualConfrontants = blockId
    ? loadManualConfrontants(blockId)
    : null;

  const sale = {
    ...(params.sale || (contract.sales as Record<string, unknown>) || {}),
    id:
      (params.sale?.id as string | undefined) ||
      ((contract.sales as Record<string, unknown> | undefined)?.id as
        | string
        | undefined) ||
      (contract.sale_id as string | undefined),
    finance_receipts:
      params.receipts ||
      (contract.sales as { finance_receipts?: unknown })?.finance_receipts,
  };

  const saleForContract = await enrichSaleWithBrokerForContract(
    supabase,
    sale,
    {
      contract,
      block,
      contractSnapshot: contract,
    },
  );

  const mergedCustomer = mergeCustomerData(
    params.customer ||
      (contract.customers as Record<string, unknown>) ||
      {},
    params.sale || (contract.sales as Record<string, unknown>) || {},
    contract.customers as Record<string, unknown>,
  );

  assertCustomerValidForContract(mergedCustomer);

  let balloonAddons = params.balloonAddons ?? null;
  if (!balloonAddons) {
    const sid = String(saleForContract.id || contract.sale_id || "").trim();
    if (sid) {
      const rows = await loadSaleBalloonRows(supabase, sid);
      balloonAddons = resolveContractBalloonAddons({
        sale: saleForContract as Record<string, unknown>,
        tableRows: rows,
      });
    }
  }

  let html = generateContractHTML({
    tenant: params.tenant,
    customer: mergedCustomer,
    project:
      params.project ||
      (contract.projects as Record<string, unknown>) ||
      (block.projects as Record<string, unknown>) ||
      {},
    block,
    sale: saleForContract,
    contractSnapshot: contract,
    financeReceipts: params.receipts,
    balloonAddons,
    projectBlocks,
    streetGuides,
    manualConfrontants,
  });

  if (isRecantoPrimaveraContractModel(params.tenant)) {
    html = await embedRecantoContractSignatureInHtml(html, params.tenant);
  }

  return html;
}

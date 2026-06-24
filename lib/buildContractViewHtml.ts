/**
 * HTML do contrato para visualização/PDF com dados atuais da empresa (medidas sem confrontações).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeCustomerData } from "@/lib/customerIdentity";
import { assertCustomerValidForContract } from "@/lib/validateCustomerForContract";
import { generateContractHTML } from "@/lib/contractTemplate";
import type { ContractFinanceReceiptRef } from "@/lib/contractTemplate";
import { loadManualConfrontants } from "@/lib/lotConfrontations";
import {
  enrichSaleWithBrokerForContract,
} from "@/lib/saleBrokerSnapshot";
import { loadSaleContractContext } from "@/lib/contractRegeneration";

export async function buildContractViewHtmlForContractId(
  supabase: SupabaseClient,
  contractId: string,
): Promise<string> {
  const contract = await loadSaleContractContext(supabase, contractId);
  const tenantId = String(contract.tenant_id || contract.company_id || "").trim();
  if (!tenantId) {
    throw new Error("Contrato sem tenant_id.");
  }

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", tenantId)
    .single();
  if (companyErr || !company) {
    throw new Error(companyErr?.message || "Empresa não encontrada.");
  }

  const saleId = String(contract.sale_id || "").trim();
  let sale: Record<string, unknown> = {};
  if (saleId) {
    const { data: saleRow } = await supabase
      .from("sales")
      .select("*")
      .eq("id", saleId)
      .maybeSingle();
    sale = (saleRow as Record<string, unknown>) || {};
  }

  let customer: Record<string, unknown> = {};
  const customerId = String(contract.customer_id || "").trim();
  if (customerId) {
    const { data: customerRow } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .maybeSingle();
    customer = (customerRow as Record<string, unknown>) || {};
  }

  let block: Record<string, unknown> = {};
  const blockId = String(contract.block_id || "").trim();
  if (blockId) {
    const { data: blockRow } = await supabase
      .from("blocks")
      .select("*")
      .eq("id", blockId)
      .maybeSingle();
    block = (blockRow as Record<string, unknown>) || {};
  }

  let project: Record<string, unknown> = {};
  const projectId = String(
    contract.project_id || block.project_id || sale.project_id || "",
  ).trim();
  if (projectId) {
    const { data: projectRow } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();
    project = (projectRow as Record<string, unknown>) || {};
  }

  let receipts: ContractFinanceReceiptRef[] = [];
  if (saleId) {
    const { data: receiptRows } = await supabase
      .from("finance_receipts")
      .select("amount, due_date, status, installment_number")
      .eq("sale_id", saleId)
      .neq("status", "cancelado");
    receipts = (receiptRows || []) as ContractFinanceReceiptRef[];
  }

  return buildContractViewHtml(supabase, {
    contract,
    tenant: { ...(company as Record<string, unknown>), id: tenantId },
    receipts,
    block,
    customer,
    sale,
    project,
  });
}

export async function buildContractViewHtml(
  supabase: SupabaseClient,
  params: {
    contract: Record<string, unknown>;
    tenant: Record<string, unknown>;
    receipts?: ContractFinanceReceiptRef[] | null;
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
      .select("*")
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

  if (projectId) {
    const [{ data: blocks }, { data: guides }] = await Promise.all([
      supabase.from("blocks").select("*").eq("project_id", projectId),
      supabase.from("street_guides").select("*").eq("project_id", projectId),
    ]);
    projectBlocks = (blocks || []) as Record<string, unknown>[];
    streetGuides = (guides || []) as Record<string, unknown>[];
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

  // PDF: app/contracts usa getContractHtml2pdfOptions + applyContractPdfChrome (sem página vazia extra).
  return generateContractHTML({
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
    projectBlocks,
    streetGuides,
    manualConfrontants,
  });
}

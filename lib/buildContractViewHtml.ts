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
        ...(fullBlock as Record<string, unknown>),
        ...block,
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

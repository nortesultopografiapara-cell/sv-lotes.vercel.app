/**
 * HTML do contrato para visualização/PDF com dados atuais da empresa e confrontações.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateContractHTML } from "@/lib/contractTemplate";
import type { ContractFinanceReceiptRef } from "@/lib/contractTemplate";

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
  const block =
    params.block ||
    (contract.blocks as Record<string, unknown>) ||
    {};
  const projectId =
    (contract.project_id as string) ||
    (block.project_id as string) ||
    (params.sale?.project_id as string);

  let projectBlocks: Record<string, unknown>[] = [];
  let streetGuides: Record<string, unknown>[] = [];

  if (projectId) {
    const [{ data: blocks }, { data: guides }] = await Promise.all([
      supabase
        .from("blocks")
        .select(
          "id, number, lot, block, block_name, quadra, geometry, front_segment_index, front_street_name, front_street_type, segments, area",
        )
        .eq("project_id", projectId),
      supabase.from("street_guides").select("*").eq("project_id", projectId),
    ]);
    projectBlocks = (blocks || []) as Record<string, unknown>[];
    streetGuides = (guides || []) as Record<string, unknown>[];
  }

  const sale = {
    ...(params.sale || (contract.sales as Record<string, unknown>) || {}),
    finance_receipts:
      params.receipts ||
      (contract.sales as { finance_receipts?: unknown })?.finance_receipts,
  };

  return generateContractHTML({
    tenant: params.tenant,
    customer:
      params.customer ||
      (contract.customers as Record<string, unknown>) ||
      {},
    project:
      params.project ||
      (contract.projects as Record<string, unknown>) ||
      (block.projects as Record<string, unknown>) ||
      {},
    block,
    sale,
    contractSnapshot: contract,
    financeReceipts: params.receipts,
    projectBlocks,
    streetGuides,
  });
}

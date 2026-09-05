/**
 * Vínculo histórico venda → contrato.
 * Nunca cruza vendas pelo lote (block_id).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const SALE_REQUIRES_PERSISTED_CONTRACT_MESSAGE =
  'Não foi possível concluir a venda: o contrato não foi gerado. O lote permanece disponível.';

export type HistoricalSaleContractCandidate = {
  id: string;
  sale_id?: string | null;
  is_current?: boolean | null;
  created_at?: string | null;
};

function trimId(value: unknown): string | null {
  const id = String(value ?? '').trim();
  return id || null;
}

function belongsToSale(
  row: HistoricalSaleContractCandidate,
  saleId: string,
): boolean {
  const rowSale = trimId(row.sale_id);
  return !rowSale || rowSale === saleId;
}

function latestContractOfSale(
  rows: HistoricalSaleContractCandidate[],
  saleId: string,
): string | null {
  const ofSale = rows.filter((row) => trimId(row.id) && belongsToSale(row, saleId));
  const current = ofSale.find((row) => row.is_current === true);
  if (current?.id) return String(current.id);
  const sorted = [...ofSale].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')),
  );
  return sorted[0]?.id ? String(sorted[0].id) : null;
}

/**
 * Ordem segura:
 * 1. settlement.contract_id da própria venda
 * 2. contrato com contracts.sale_id da venda (is_current / mais recente)
 * 3. sales.contract_id da própria venda
 *
 * Nunca usa blocks.contract_id nem contrato de outra venda.
 */
export function pickHistoricalSaleContractId(input: {
  saleId: string;
  settlementContractId?: string | null;
  saleRowContractId?: string | null;
  contractsOfThisSale: HistoricalSaleContractCandidate[];
}): string | null {
  const saleId = trimId(input.saleId);
  if (!saleId) return null;

  const ofSale = (input.contractsOfThisSale || []).filter(
    (row) => trimId(row.id) && belongsToSale(row, saleId),
  );
  const ofSaleIds = new Set(ofSale.map((row) => String(row.id)));

  const settlementId = trimId(input.settlementContractId);
  if (settlementId && ofSaleIds.has(settlementId)) return settlementId;
  if (settlementId && ofSale.length === 0) return settlementId;

  const fromSaleRows = latestContractOfSale(ofSale, saleId);
  if (fromSaleRows) return fromSaleRows;

  const saleRowId = trimId(input.saleRowContractId);
  if (saleRowId && (ofSaleIds.size === 0 || ofSaleIds.has(saleRowId))) {
    return saleRowId;
  }
  return null;
}

export async function loadHistoricalSaleContractId(
  admin: SupabaseClient,
  params: {
    saleId: string;
    settlementContractId?: string | null;
  },
): Promise<string | null> {
  const saleId = trimId(params.saleId);
  if (!saleId) return null;

  const { data: saleRow } = await admin
    .from('sales')
    .select('id, contract_id')
    .eq('id', saleId)
    .maybeSingle();

  const { data: contractRows } = await admin
    .from('contracts')
    .select('id, sale_id, is_current, created_at')
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false });

  let settlementOk: string | null = null;
  const settlementId = trimId(params.settlementContractId);
  if (settlementId) {
    const { data: settlementContract } = await admin
      .from('contracts')
      .select('id, sale_id')
      .eq('id', settlementId)
      .maybeSingle();
    if (settlementContract && belongsToSale(settlementContract, saleId)) {
      settlementOk = String(settlementContract.id);
    }
  }

  return pickHistoricalSaleContractId({
    saleId,
    settlementContractId: settlementOk,
    saleRowContractId: saleRow?.contract_id != null ? String(saleRow.contract_id) : null,
    contractsOfThisSale: (contractRows || []) as HistoricalSaleContractCandidate[],
  });
}

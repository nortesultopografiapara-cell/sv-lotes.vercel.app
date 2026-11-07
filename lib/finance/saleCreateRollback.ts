/**
 * Compensação da venda que falhou.
 * Só remove o caixa criado nesta operação. Baixa manual fica intacta.
 * O lote só volta a disponível depois que a venda não existe mais
 * e nenhuma exclusão desta operação falhou.
 * Várias chamadas ao banco não formam uma transação. Queda no meio
 * deixa o que já foi gravado e não libera o lote.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OwnedSaleCreateCash } from '@/lib/finance/saleInitialReceiptCash';
import { SALE_INITIAL_CASH_PROVIDER } from '@/lib/finance/saleInitialReceiptCash';

export type SaleCreateRollbackFailure = {
  step: string;
};

export type SaleCreateRollbackDb = {
  deleteOwnedCash(cash: OwnedSaleCreateCash): Promise<{ error: string | null; removed: boolean }>;
  deleteBySale(
    table: 'sale_balloon_installments' | 'finance_receipts' | 'broker_commissions' | 'contracts',
    saleId: string,
    tenantId: string,
  ): Promise<{ error: string | null }>;
  deleteContractById(contractId: string, tenantId: string): Promise<{ error: string | null }>;
  deleteSale(saleId: string, tenantId: string): Promise<{ error: string | null }>;
  saleExists(saleId: string, tenantId: string): Promise<{ error: string | null; exists: boolean }>;
  releaseLot(lotId: string): Promise<{ error: string | null }>;
  lotHasSale?(lotId: string, tenantId: string): Promise<{ error: string | null; exists: boolean }>;
};

function failed(step: string): SaleCreateRollbackFailure {
  return { step };
}

export async function compensateSaleCreate(
  db: SaleCreateRollbackDb,
  input: {
    tenantId: string;
    saleId: string | null;
    contractId: string | null;
    lotId: string;
    ownedCash: OwnedSaleCreateCash[];
  },
): Promise<{ lotReleased: boolean; failures: SaleCreateRollbackFailure[] }> {
  const failures: SaleCreateRollbackFailure[] = [];
  const tenantId = String(input.tenantId || '').trim();
  const saleId = String(input.saleId || '').trim();
  const lotId = String(input.lotId || '').trim();
  if (!tenantId || !lotId) {
    return { lotReleased: false, failures: [failed('scope')] };
  }

  if (saleId) {
    for (const cash of input.ownedCash) {
      if (cash.tenantId !== tenantId || cash.saleId !== saleId || !cash.id || !cash.receiptId) {
        failures.push(failed('cash_scope'));
        continue;
      }
      const removed = await db.deleteOwnedCash(cash);
      if (removed.error || !removed.removed) failures.push(failed('cash'));
    }
    if (failures.length > 0) return { lotReleased: false, failures };

    for (const table of ['sale_balloon_installments', 'finance_receipts', 'broker_commissions', 'contracts'] as const) {
      const result = await db.deleteBySale(table, saleId, tenantId);
      if (result.error) {
        failures.push(failed(table));
        return { lotReleased: false, failures };
      }
    }
    if (input.contractId) {
      const contract = await db.deleteContractById(input.contractId, tenantId);
      if (contract.error) {
        failures.push(failed('contract'));
        return { lotReleased: false, failures };
      }
    }
    const sale = await db.deleteSale(saleId, tenantId);
    if (sale.error) {
      failures.push(failed('sale'));
      return { lotReleased: false, failures };
    }
    const still = await db.saleExists(saleId, tenantId);
    if (still.error || still.exists) {
      failures.push(failed('sale_still_exists'));
      return { lotReleased: false, failures };
    }
  }

  const blocking = db.lotHasSale
    ? await db.lotHasSale(lotId, tenantId)
    : { error: null, exists: true };
  if (blocking.error || blocking.exists) {
    failures.push(failed('lot_still_linked'));
    return { lotReleased: false, failures };
  }
  const released = await db.releaseLot(lotId);
  if (released.error) {
    failures.push(failed('lot'));
    return { lotReleased: false, failures };
  }
  return { lotReleased: true, failures };
}

export function supabaseSaleRollbackDb(supabase: SupabaseClient): SaleCreateRollbackDb {
  return {
    deleteOwnedCash: (cash) => deleteOwnedSaleCreateCash(supabase, cash),
    async deleteBySale(table, saleId, tenantId) {
      const { error } = await supabase.from(table).delete().eq('sale_id', saleId).eq('tenant_id', tenantId);
      return { error: error?.message || null };
    },
    async deleteContractById(contractId, tenantId) {
      const { error } = await supabase.from('contracts').delete().eq('id', contractId).eq('tenant_id', tenantId);
      return { error: error?.message || null };
    },
    async deleteSale(saleId, tenantId) {
      const { error } = await supabase.from('sales').delete().eq('id', saleId).eq('tenant_id', tenantId);
      return { error: error?.message || null };
    },
    async saleExists(saleId, tenantId) {
      const { data, error } = await supabase
        .from('sales')
        .select('id')
        .eq('id', saleId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) return { error: error.message, exists: true };
      return { error: null, exists: Boolean(data?.id) };
    },
    async lotHasSale(lotId, tenantId) {
      const byBlock = await supabase.from('sales').select('id').eq('tenant_id', tenantId).eq('block_id', lotId).limit(1);
      if (byBlock.error) return { error: byBlock.error.message, exists: true };
      if (byBlock.data?.length) return { error: null, exists: true };
      const byLot = await supabase.from('sales').select('id').eq('tenant_id', tenantId).eq('lot_id', lotId).limit(1);
      if (byLot.error) return { error: byLot.error.message, exists: true };
      return { error: null, exists: Boolean(byLot.data?.length) };
    },
    async releaseLot(lotId) {
      const { data, error } = await supabase
        .from('blocks')
        .update({
          status: 'Disponível',
          customer_id: null,
          sale_id: null,
          contract_id: null,
          broker_id: null,
        })
        .eq('id', lotId)
        .is('sale_id', null)
        .select('id');
      if (error || !data?.length) {
        return { error: error?.message || 'O lote permanece vinculado a uma venda.' };
      }
      return { error: null };
    },
  };
}

export async function deleteOwnedSaleCreateCash(
  supabase: SupabaseClient,
  cash: OwnedSaleCreateCash,
): Promise<{ error: string | null; removed: boolean }> {
  const { data, error } = await supabase
    .from('cash_movements')
    .delete()
    .eq('id', cash.id)
    .eq('tenant_id', cash.tenantId)
    .eq('company_id', cash.tenantId)
    .eq('sale_id', cash.saleId)
    .eq('type', 'entrada')
    .eq('status', 'ativo')
    .filter('metadata->>provider', 'eq', SALE_INITIAL_CASH_PROVIDER)
    .filter('metadata->>installment_id', 'eq', cash.receiptId)
    .select('id');
  if (error) return { error: error.message, removed: false };
  if (Array.isArray(data) && data.length === 1) return { error: null, removed: true };

  const still = await supabase
    .from('cash_movements')
    .select('id')
    .eq('id', cash.id)
    .maybeSingle();
  if (still.error) return { error: still.error.message, removed: false };
  if (still.data?.id) {
    return { error: 'O caixa desta operação não foi removido.', removed: false };
  }
  return { error: null, removed: true };
}

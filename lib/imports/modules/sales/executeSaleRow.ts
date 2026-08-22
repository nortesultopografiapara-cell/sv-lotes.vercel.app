/**
 * Execução linha a linha — importação de vendas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_INSTALLMENT_CORRECTION_TYPE } from '@/lib/installmentCorrectionType';
import { buildSaleEditFinancePayloads } from '@/lib/saleEditFinanceRecalc';
import type { ValidatedSaleRow } from '@/lib/imports/modules/sales/types';
import {
  buildBlockUpdatePayload,
  buildSaleInsertPayload,
  mapSaleRowToFinanceFormData,
} from '@/lib/imports/modules/sales/validateRows';
import {
  assertSaleContractModelConfigured,
  detectPreviewAraguaiaNameCoerce,
} from '@/lib/contractModel';
import { buildTerminationPolicySnapshot } from '@/lib/contract-termination/snapshot';
import { insertRowsWithColumnFallback } from '@/lib/gisSaleCreateService';

export type ExecuteSaleRowResult =
  | { ok: true; saleId?: string; blockId: string }
  | { ok: false; error: string };

export async function executeImportableSaleRow(params: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  row: ValidatedSaleRow;
}): Promise<ExecuteSaleRowResult> {
  const { admin, tenantId, userId, row } = params;

  if (!row.block_id || !row.customer_id || !row.project_id) {
    return { ok: false, error: 'Dados insuficientes para importar a venda.' };
  }

  try {
    if (row.resolved_block_status === 'Reservado') {
      const blockUpdate = buildBlockUpdatePayload(row);
      const { error } = await admin.from('blocks').update(blockUpdate).eq('id', row.block_id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, blockId: row.block_id };
    }

    const salePayload = buildSaleInsertPayload(row, tenantId, userId);
    salePayload.installment_correction_type = DEFAULT_INSTALLMENT_CORRECTION_TYPE;

    const { data: projectRow } = await admin
      .from('projects')
      .select('id, name, contract_model, tenant_id, company_id')
      .eq('id', row.project_id)
      .maybeSingle();
    const { data: companyRow } = await admin
      .from('companies')
      .select('id, contract_model')
      .eq('id', tenantId)
      .maybeSingle();

    const importModel = (() => {
      try {
        return assertSaleContractModelConfigured({
          projectModel: projectRow?.contract_model,
          projectName: projectRow?.name,
          companyModel: companyRow?.contract_model,
          companyFound: Boolean(companyRow),
        });
      } catch {
        return null;
      }
    })();
    const nameCoerce = detectPreviewAraguaiaNameCoerce({
      projectName: projectRow?.name,
      projectModel: projectRow?.contract_model,
    });
    const terminationPersist = buildTerminationPolicySnapshot({
      contractModel: importModel,
      persistSource: 'catalog',
      warnings: nameCoerce
        ? [
            'Modelo ARAGUAIA gravado explicitamente a partir do nome do empreendimento (Preview).',
          ]
        : undefined,
    });
    if (importModel) salePayload.contract_model = importModel;
    Object.assign(salePayload, terminationPersist);

    const inserted = await insertRowsWithColumnFallback(admin, 'sales', [salePayload], 'id');
    const saleData = inserted.data[0];
    if (inserted.error || !saleData) {
      return { ok: false, error: inserted.error?.message || 'Falha ao criar venda.' };
    }

    const saleId = saleData.id as string;
    const financeForm = mapSaleRowToFinanceFormData(row);
    const financePayloads = buildSaleEditFinancePayloads(
      tenantId,
      saleId,
      row.customer_id,
      row.broker_id,
      { id: row.block_id, project_id: row.project_id },
      financeForm as never,
      { cashInstallmentPaid: false },
    );

    if (financePayloads.length > 0) {
      const { error: financeError } = await admin.from('finance_receipts').insert(financePayloads);
      if (financeError) {
        await rollbackSale(admin, saleId);
        return { ok: false, error: financeError.message };
      }
    }

    if (row.broker_id && row.resolved_commission_percent > 0) {
      const commissionAmount =
        Math.round(((row.valor_total * row.resolved_commission_percent) / 100) * 100) / 100;
      const { error: commissionError } = await admin.from('broker_commissions').insert([
        {
          tenant_id: tenantId,
          company_id: tenantId,
          broker_id: row.broker_id,
          sale_id: saleId,
          customer_id: row.customer_id,
          commission_percent: row.resolved_commission_percent,
          amount: commissionAmount,
          status: 'pendente',
        },
      ]);
      if (commissionError) {
        console.warn('[executeImportableSaleRow] broker_commissions:', commissionError.message);
      }
    }

    const blockUpdate = {
      ...buildBlockUpdatePayload(row),
      sale_id: saleId,
    };
    const { error: blockError } = await admin
      .from('blocks')
      .update(blockUpdate)
      .eq('id', row.block_id);

    if (blockError) {
      await rollbackSale(admin, saleId);
      return { ok: false, error: blockError.message };
    }

    return { ok: true, saleId, blockId: row.block_id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro interno ao importar venda.',
    };
  }
}

async function rollbackSale(admin: SupabaseClient, saleId: string) {
  await admin.from('finance_receipts').delete().eq('sale_id', saleId);
  await admin.from('broker_commissions').delete().eq('sale_id', saleId);
  await admin.from('sales').delete().eq('id', saleId);
}

export function buildSaleExecutionExpectation(row: ValidatedSaleRow) {
  return {
    saleInsert: buildSaleInsertPayload(row, 'tenant-test', 'user-test'),
    blockUpdate: buildBlockUpdatePayload(row),
    createsSale: row.resolved_block_status === 'Vendido',
    createsFinanceReceipts: row.resolved_block_status === 'Vendido',
  };
}

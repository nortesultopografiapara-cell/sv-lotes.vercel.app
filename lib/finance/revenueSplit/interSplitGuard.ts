import { createRevenueSplitService } from './service';
import type { RevenueSplitStore } from './store';

export const INTER_REVENUE_SPLIT_UNSUPPORTED_MESSAGE =
  'Este empreendimento utiliza Split de Recebimentos. O provedor Inter ainda não suporta Split nesta versão.';

/**
 * v1 do Split: Inter não gera dois boletos, PIX manual nem transferência interna.
 * Projeto sem split operacional e sem snapshot na venda segue Inter normalmente.
 */
export async function assertInterEmissionAllowedForRevenueSplit(input: {
  store: RevenueSplitStore;
  companyId: string;
  saleId: string | null | undefined;
}): Promise<void> {
  const saleId = String(input.saleId || '').trim();
  if (!saleId) return;

  const sale = await input.store.getSale(saleId);
  if (!sale || sale.companyId !== input.companyId) return;

  const snapshot = await input.store.getSnapshotBySale(saleId);
  if (snapshot) {
    throw new Error(INTER_REVENUE_SPLIT_UNSUPPORTED_MESSAGE);
  }

  const service = createRevenueSplitService(input.store);
  const current = await service.getProjectRevenueSplit(sale.projectId, input.companyId);
  if (current.operational) {
    throw new Error(INTER_REVENUE_SPLIT_UNSUPPORTED_MESSAGE);
  }
}

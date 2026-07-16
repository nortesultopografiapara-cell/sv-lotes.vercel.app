/**
 * Mapeamento de movimentações do extrato Asaas → cash_movements (tenant).
 * Reutiliza classificação do Caixa SaaS Master, adaptando tipo/categoria empresa.
 */

import {
  mapAsaasFinancialTransaction,
  type MappedAsaasCashMovement,
} from '@/lib/asaasFinancialTransactions';
import type { AsaasFinancialTransaction } from '@/lib/payments/providers/asaas';

export type CompanyCashMovementType = 'entrada' | 'saida';

export type MappedCompanyAsaasCashMovement = {
  skip: boolean;
  skipReason?: string;
  type?: CompanyCashMovementType;
  category?: string;
  description?: string;
  amount?: number;
  movement_date?: string;
  asaas_payment_id?: string | null;
  metadata?: Record<string, unknown>;
};

function resolveCompanyCategory(mapped: MappedAsaasCashMovement): string {
  const source = mapped.source || '';
  const category = mapped.category || 'Asaas';

  if (mapped.type === 'income') {
    if (category === 'Entrada Pix') return 'Recebimento Asaas';
    if (source === 'asaas_refund') return 'Devolução';
    if (category === 'Ajuste de saldo' || category === 'Ajuste positivo') {
      return 'Ajuste de saldo';
    }
    return category;
  }

  if (source === 'asaas_fee') return 'Tarifa Asaas';
  if (source === 'asaas_transfer') {
    if (category === 'Transferência Pix' || category === 'Saque') {
      return 'Transferência/Saque Asaas';
    }
    return 'Transferência/Saque Asaas';
  }
  if (source === 'asaas_refund') return 'Estorno';
  return category;
}

/** Transforma lançamento do extrato Asaas em movimento de caixa da empresa (ou skip). */
export function mapCompanyAsaasFinancialTransaction(
  tx: AsaasFinancialTransaction,
): MappedCompanyAsaasCashMovement {
  const base = mapAsaasFinancialTransaction(tx);
  if (base.skip) {
    return {
      skip: true,
      skipReason: base.skipReason,
      metadata: base.metadata,
    };
  }

  const movementType: CompanyCashMovementType =
    base.type === 'income' ? 'entrada' : 'saida';

  return {
    skip: false,
    type: movementType,
    category: resolveCompanyCategory(base),
    description: base.description,
    amount: base.amount,
    movement_date: base.movement_date,
    asaas_payment_id: base.asaas_payment_id ?? null,
    metadata: {
      ...(base.metadata || {}),
      provider: 'ASAAS_COMPANY_EXTRACT',
      sync_scope: 'company',
    },
  };
}

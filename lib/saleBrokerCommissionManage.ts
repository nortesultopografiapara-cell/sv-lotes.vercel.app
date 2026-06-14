import {
  calculateCommissionAmount,
  isPaidBrokerCommission,
  isPendingBrokerCommission,
  readBrokerCommissionPercent,
  resolveSaleValueForCommission,
  shouldAutoCreatePendingCommission,
  withBrokerCommissionMonetaryFields,
  type BrokerCommissionRow,
} from '@/lib/brokerCommission';

export type SaleBrokerCommissionAction =
  | 'remove_broker'
  | 'transfer_broker'
  | 'update_commission'
  | 'cancel_commission';

export type ManageSaleBrokerCommissionInput =
  | { action: 'remove_broker' }
  | { action: 'transfer_broker'; broker_id: string }
  | {
      action: 'update_commission';
      commission_percent?: number;
      fixed_amount?: number;
    }
  | { action: 'cancel_commission' };

export class SaleBrokerCommissionError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function assertCanCancelCommissionRows(
  rows: BrokerCommissionRow[],
): void {
  const paid = rows.find((row) => isPaidBrokerCommission(row.status));
  if (paid) {
    throw new SaleBrokerCommissionError(
      'Comissão já paga não pode ser cancelada diretamente. Use estorno manual no Financeiro.',
      'COMMISSION_ALREADY_PAID',
      409,
    );
  }
}

export function buildCanceledCommissionPatch() {
  return {
    status: 'cancelado',
    ...withBrokerCommissionMonetaryFields(0),
    commission_percent: 0,
    paid_at: null,
  };
}

export function buildPendingCommissionInsert(params: {
  tenantId: string;
  brokerId: string;
  saleId: string;
  contractId?: string | null;
  customerId?: string | null;
  saleValue: number;
  commissionPercent: number;
}) {
  const amount = calculateCommissionAmount(
    params.saleValue,
    params.commissionPercent,
  );

  if (!shouldAutoCreatePendingCommission(params.commissionPercent)) {
    return null;
  }

  return {
    company_id: params.tenantId,
    tenant_id: params.tenantId,
    broker_id: params.brokerId,
    sale_id: params.saleId,
    contract_id: params.contractId ?? null,
    customer_id: params.customerId ?? null,
    ...withBrokerCommissionMonetaryFields(amount),
    commission_percent: params.commissionPercent,
    status: 'pendente',
  };
}

export function resolveTransferCommissionPlan(params: {
  sale: Record<string, unknown>;
  targetBroker: { id: string; commission_percent?: number | string | null };
}) {
  const saleValue = resolveSaleValueForCommission(params.sale);
  const percent = readBrokerCommissionPercent(params.targetBroker.commission_percent);

  return {
    brokerId: params.targetBroker.id,
    saleValue,
    commissionPercent: percent,
    pendingInsert: buildPendingCommissionInsert({
      tenantId: String(params.sale.tenant_id || params.sale.company_id || ''),
      brokerId: params.targetBroker.id,
      saleId: String(params.sale.id || ''),
      contractId: (params.sale.contract_id as string | null | undefined) ?? null,
      customerId: (params.sale.customer_id as string | null | undefined) ?? null,
      saleValue,
      commissionPercent: percent,
    }),
  };
}

export function resolveManualCommissionUpdate(params: {
  sale: Record<string, unknown>;
  commission_percent?: number;
  fixed_amount?: number;
}) {
  const saleValue = resolveSaleValueForCommission(params.sale);

  if (params.fixed_amount != null && Number.isFinite(params.fixed_amount)) {
    const amount = Math.max(0, Number(params.fixed_amount));
    return {
      amount,
      commission_percent:
        params.commission_percent != null
          ? readBrokerCommissionPercent(params.commission_percent)
          : amount > 0 && saleValue > 0
            ? Math.round((amount / saleValue) * 10000) / 100
            : 0,
      status: amount > 0 ? 'pendente' : 'cancelado',
    };
  }

  const percent = readBrokerCommissionPercent(params.commission_percent);
  const amount = calculateCommissionAmount(saleValue, percent);

  if (percent <= 0 || amount <= 0) {
    return {
      amount: 0,
      commission_percent: 0,
      status: 'cancelado',
    };
  }

  return {
    amount,
    commission_percent: percent,
    status: 'pendente',
  };
}

export function filterPendingCommissionRows(rows: BrokerCommissionRow[]) {
  return rows.filter((row) => isPendingBrokerCommission(row.status));
}

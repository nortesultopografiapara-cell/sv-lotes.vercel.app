import {
  calculateCommissionAmount,
  isPaidBrokerCommission,
  isPendingBrokerCommission,
  readBrokerCommissionPercent,
  resolveSaleValueForCommission,
  withBrokerCommissionMonetaryFields,
  type BrokerCommissionRow,
} from '@/lib/brokerCommission';
import {
  buildCommissionSnapshotFields,
  calculateBrokerCommissionPlan,
  resolveBrokerDefaultCommissionPlan,
  shouldCreatePendingCommissionFromPlan,
} from '@/lib/brokerCommissionMode';

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
      commission_mode?: string;
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
    commission_mode: 'NONE',
    commission_fixed_amount: null,
    calculation_base: null,
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
  commissionPercent?: number;
  commissionMode?: string | null;
  commissionFixedAmount?: number | null;
}) {
  const plan = calculateBrokerCommissionPlan({
    mode: params.commissionMode ?? 'PERCENT',
    percent: params.commissionPercent ?? 0,
    fixedAmount: params.commissionFixedAmount ?? 0,
    saleValue: params.saleValue,
  });

  if (!shouldCreatePendingCommissionFromPlan(plan)) {
    return null;
  }

  return {
    company_id: params.tenantId,
    tenant_id: params.tenantId,
    broker_id: params.brokerId,
    sale_id: params.saleId,
    contract_id: params.contractId ?? null,
    customer_id: params.customerId ?? null,
    ...buildCommissionSnapshotFields(plan),
    status: 'pendente',
  };
}

export function resolveTransferCommissionPlan(params: {
  sale: Record<string, unknown>;
  targetBroker: {
    id: string;
    commission_percent?: number | string | null;
    commission_mode?: string | null;
    commission_fixed_amount?: number | string | null;
  };
}) {
  const saleValue = resolveSaleValueForCommission(params.sale);
  const defaults = resolveBrokerDefaultCommissionPlan(params.targetBroker);
  const plan = calculateBrokerCommissionPlan({
    mode: defaults.mode,
    percent: defaults.percent,
    fixedAmount: defaults.fixedAmount,
    saleValue,
  });

  const snapshot = shouldCreatePendingCommissionFromPlan(plan)
    ? {
        company_id: String(params.sale.tenant_id || params.sale.company_id || ''),
        tenant_id: String(params.sale.tenant_id || params.sale.company_id || ''),
        broker_id: params.targetBroker.id,
        sale_id: String(params.sale.id || ''),
        contract_id: (params.sale.contract_id as string | null | undefined) ?? null,
        customer_id: (params.sale.customer_id as string | null | undefined) ?? null,
        ...buildCommissionSnapshotFields(plan),
        status: 'pendente',
      }
    : null;

  return {
    brokerId: params.targetBroker.id,
    saleValue,
    commissionPercent: plan.percent,
    commissionMode: plan.mode,
    pendingInsert: snapshot,
  };
}

export function resolveManualCommissionUpdate(params: {
  sale: Record<string, unknown>;
  commission_percent?: number;
  fixed_amount?: number;
  commission_mode?: string;
}) {
  const saleValue = resolveSaleValueForCommission(params.sale);

  if (params.commission_mode === 'NONE') {
    return {
      ...buildCommissionSnapshotFields(
        calculateBrokerCommissionPlan({
          mode: 'NONE',
          percent: 0,
          fixedAmount: 0,
          saleValue,
        }),
      ),
      status: 'cancelado' as const,
    };
  }

  if (
    params.commission_mode === 'FIXED' ||
    (params.fixed_amount != null && Number.isFinite(params.fixed_amount))
  ) {
    const plan = calculateBrokerCommissionPlan({
      mode: 'FIXED',
      fixedAmount: params.fixed_amount ?? 0,
      saleValue,
    });
    return {
      ...buildCommissionSnapshotFields(plan),
      status: plan.amount > 0 ? ('pendente' as const) : ('cancelado' as const),
    };
  }

  const percent = readBrokerCommissionPercent(params.commission_percent);
  const plan = calculateBrokerCommissionPlan({
    mode: 'PERCENT',
    percent,
    saleValue,
  });

  if (percent <= 0 || plan.amount <= 0) {
    return {
      ...buildCommissionSnapshotFields(
        calculateBrokerCommissionPlan({
          mode: 'NONE',
          percent: 0,
          fixedAmount: 0,
          saleValue,
        }),
      ),
      status: 'cancelado' as const,
    };
  }

  return {
    ...buildCommissionSnapshotFields(plan),
    status: 'pendente' as const,
  };
}

export function filterPendingCommissionRows(rows: BrokerCommissionRow[]) {
  return rows.filter((row) => isPendingBrokerCommission(row.status));
}

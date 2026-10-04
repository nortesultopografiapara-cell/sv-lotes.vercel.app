/**
 * Baixa global de comissão — independente do modelo de contrato.
 * Venda cria PENDENTE; só a baixa gera uma saída vinculada por IDs.
 */

import {
  isPaidBrokerCommission,
} from '@/lib/brokerCommission';
import { buildCashMovementEntradaPayload } from '@/lib/finance/cashMovementsSchema';
import { displayContractNumber } from '@/lib/contractNumber';

export const COMMISSION_CASH_CATEGORY = 'Comissão';

export const COMMISSION_PAYMENT_METHODS = [
  'PIX',
  'Dinheiro',
  'Boleto',
  'Cartão',
  'Transferência',
  'Outros',
] as const;

/** Colunas que quebram o insert de cash_movements na baixa (schema real). */
export const COMMISSION_SETTLEMENT_FORBIDDEN_COLUMNS = [
  'broker_commission_id',
  'broker_id',
  'source_table',
  'source_id',
  'finance_receipt_id',
] as const;

export type CommissionSettlementLinks = {
  tenantId: string;
  commissionId: string;
  saleId: string | null;
  brokerId: string | null;
  customerId: string | null;
  projectId: string | null;
  contractId: string | null;
  blockId: string | null;
  brokerName: string;
  brokerDocument: string;
  customerName: string;
  projectName: string;
  contractNumber: string;
  locationLabel: string;
  amount: number;
  paymentMethod: string;
  paidAt: string;
  userId: string;
};

export type CommissionCashFlowDisplay = {
  category: string;
  description: string;
  beneficiary: string;
  customerName: string;
  projectName: string;
  contractNumber: string;
  locationLabel: string;
  amount: number;
  paymentMethod: string;
  isManual: boolean;
};

export function assertCommissionTenantScope(params: {
  actorTenantId: string;
  rowTenantId?: string | null;
  rowCompanyId?: string | null;
}): void {
  const actor = String(params.actorTenantId || '').trim();
  if (!actor) throw new Error('Tenant da operação ausente.');
  const rowTenant = String(params.rowTenantId || '').trim();
  const rowCompany = String(params.rowCompanyId || '').trim();
  if (!rowTenant && !rowCompany) return;
  const sameTenant = !rowTenant || rowTenant === actor;
  const sameCompany = !rowCompany || rowCompany === actor;
  if (!sameTenant && !sameCompany) {
    throw new Error('Comissão fora do escopo da empresa.');
  }
}

export function normalizeCommissionPaymentMethod(raw: unknown): string {
  const value = String(raw || '').trim();
  if (
    COMMISSION_PAYMENT_METHODS.includes(
      value as (typeof COMMISSION_PAYMENT_METHODS)[number],
    )
  ) {
    return value;
  }
  const lower = value.toLowerCase();
  if (lower.includes('pix')) return 'PIX';
  if (lower.includes('dinheiro')) return 'Dinheiro';
  if (lower.includes('boleto')) return 'Boleto';
  if (lower.includes('cart')) return 'Cartão';
  if (lower.includes('transfer')) return 'Transferência';
  return 'PIX';
}

export function buildCommissionPaymentDescription(brokerName: string): string {
  const name = String(brokerName || '').trim();
  return name
    ? `Pagamento de comissão — ${name}`
    : 'Pagamento de comissão';
}

export function pendingCommissionCreatesPaidCash(
  status?: string | null,
): boolean {
  return isPaidBrokerCommission(status);
}

function readMetadataCommissionId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const id = String((metadata as { commission_id?: unknown }).commission_id || '').trim();
  return id || null;
}

export function cashMovementSettlesCommission(
  cash: {
    type?: string | null;
    status?: string | null;
    amount?: number | string | null;
    sale_id?: string | null;
    metadata?: unknown;
  } | null
  | undefined,
  commission: { id: string; sale_id?: string | null; amount?: number | string | null },
): boolean {
  if (!cash) return false;
  const st = String(cash.status || 'ativo').toLowerCase();
  if (st === 'estornado' || st === 'cancelado' || st === 'deleted') return false;
  const typeStr = String(cash.type || '').toLowerCase();
  if (!['saida', 'saída', 'despesa', 'expense'].some((v) => typeStr.includes(v))) {
    return false;
  }
  const linkedId = readMetadataCommissionId(cash.metadata);
  return Boolean(linkedId && linkedId === commission.id);
}

export function shouldSkipDuplicateCommissionSettlement(params: {
  existingCash: Array<{
    type?: string | null;
    status?: string | null;
    amount?: number | string | null;
    sale_id?: string | null;
    metadata?: unknown;
  }>;
  commission: { id: string; sale_id?: string | null; amount?: number | string | null };
}): boolean {
  return params.existingCash.some((c) =>
    cashMovementSettlesCommission(c, params.commission),
  );
}

function splitLocationParts(locationLabel: string): {
  quadra?: string;
  lote?: string;
} {
  const loc = String(locationLabel || '');
  const qd = loc.match(/QD\s+([^•/]+)/i);
  const lt = loc.match(/LT\s+(.+)/i);
  return {
    quadra: qd ? qd[1].trim() : undefined,
    lote: lt ? lt[1].trim() : undefined,
  };
}

export function buildCommissionSettlementMetadata(
  links: CommissionSettlementLinks,
): Record<string, string> {
  const loc = splitLocationParts(links.locationLabel);
  const meta: Record<string, string> = {
    commission_id: links.commissionId,
    payment_method: links.paymentMethod,
  };
  if (links.brokerId) meta.broker_id = links.brokerId;
  if (links.brokerName) {
    meta.broker_name = links.brokerName;
    meta.beneficiary_manual = links.brokerName;
  }
  if (links.brokerDocument) meta.beneficiary_document = links.brokerDocument;
  if (links.customerName) meta.customer_manual = links.customerName;
  if (links.contractNumber) meta.contract_manual = links.contractNumber;
  if (links.projectName) meta.project_name = links.projectName;
  if (loc.quadra) meta.quadra_manual = loc.quadra;
  if (loc.lote) meta.lote_manual = loc.lote;
  return meta;
}

export function buildCommissionCashMovementPayload(
  links: CommissionSettlementLinks,
): Record<string, unknown> {
  const metadata = buildCommissionSettlementMetadata(links);
  const payload = buildCashMovementEntradaPayload({
    tenant_id: links.tenantId,
    company_id: links.tenantId,
    project_id: links.projectId,
    type: 'saida',
    category: COMMISSION_CASH_CATEGORY,
    description: buildCommissionPaymentDescription(links.brokerName),
    amount: links.amount,
    customer_id: links.customerId,
    sale_id: links.saleId,
    contract_id: links.contractId,
    movement_date: String(links.paidAt || '').split('T')[0],
    status: 'ativo',
    created_by: links.userId,
    metadata,
  });
  for (const forbidden of COMMISSION_SETTLEMENT_FORBIDDEN_COLUMNS) {
    delete payload[forbidden];
  }
  return payload;
}

export function resolveCommissionCashFlowDisplay(
  links: Pick<
    CommissionSettlementLinks,
    | 'brokerName'
    | 'customerName'
    | 'projectName'
    | 'contractNumber'
    | 'locationLabel'
    | 'amount'
    | 'paymentMethod'
  >,
): CommissionCashFlowDisplay {
  const contractNumber = links.contractNumber
    ? displayContractNumber(links.contractNumber)
    : '';
  return {
    category: COMMISSION_CASH_CATEGORY,
    description: buildCommissionPaymentDescription(links.brokerName),
    beneficiary: links.brokerName,
    customerName: links.customerName,
    projectName: links.projectName,
    contractNumber: contractNumber === 'S/N' ? '' : contractNumber,
    locationLabel: links.locationLabel,
    amount: links.amount,
    paymentMethod: links.paymentMethod,
    isManual: false,
  };
}

export function resolveLocationFromBlock(
  block: Record<string, unknown> | null | undefined,
): string {
  if (!block || typeof block !== 'object') return '';
  const quad = String(
    block.block_name || block.block || block.quadra || block.name || '',
  ).trim();
  const lot = String(
    block.lot_number || block.number || block.lot || '',
  ).trim();
  if (quad && lot) return `QD ${quad} • LT ${lot}`;
  if (quad) return `QD ${quad}`;
  if (lot) return `LT ${lot}`;
  return '';
}

export function pickBrokerDocument(
  broker: Record<string, unknown> | null | undefined,
): string {
  if (!broker) return '';
  return String(
    broker.cpf || broker.cpf_cnpj || broker.document || broker.cnpj || '',
  ).replace(/\D/g, '');
}

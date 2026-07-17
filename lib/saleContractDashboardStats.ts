/**
 * Indicadores do dashboard de Contratos — mesma regra da listagem/assinatura eletrônica.
 */

export type SaleContractDashboardBucket = 'signed' | 'pending' | 'cancelled';

export type SaleContractDashboardStats = {
  ativos: number;
  assinados: number;
  pendentes: number;
  cancelados: number;
  valorTotal: number;
};

export type SaleContractDashboardRow = {
  status?: string | null;
  signature_status?: string | null;
  sale_value_display?: number | null;
  sale_value?: number | null;
  sales?: {
    total_value?: number | null;
    final_value?: number | null;
    agreed_price?: number | null;
    sale_value?: number | null;
    sale_price?: number | null;
  } | null;
  blocks?: { price?: number | null } | null;
};

function normalizeContractStatus(status?: string | null): string {
  const st = String(status ?? '').toLowerCase().trim();
  if (!st || st === 'null' || st === 'undefined') return 'ativo';
  return st;
}

/** Mesmo critério de SaleContractSignatureSection (isElectronicallySigned). */
export function isSaleContractFullySigned(contract: {
  status?: string | null;
  signature_status?: string | null;
}): boolean {
  const signatureStatus = String(contract.signature_status || '').toUpperCase();
  const contractStatus = String(contract.status || '').toLowerCase();
  return (
    signatureStatus === 'SIGNED' ||
    ['assinado', 'signed'].includes(contractStatus)
  );
}

export function isSaleContractCancelled(contract: {
  status?: string | null;
}): boolean {
  const st = normalizeContractStatus(contract.status);
  return ['cancelado', 'cancelled', 'canceled'].includes(st);
}

export function isSaleContractSuperseded(contract: {
  status?: string | null;
}): boolean {
  return normalizeContractStatus(contract.status) === 'superseded';
}

export function classifySaleContractForDashboard(contract: {
  status?: string | null;
  signature_status?: string | null;
}): SaleContractDashboardBucket {
  if (isSaleContractCancelled(contract)) return 'cancelled';
  if (isSaleContractFullySigned(contract)) return 'signed';
  return 'pending';
}

/**
 * Estado de assinatura para Minhas Vendas / listagens — mesma regra do dashboard
 * administrativo (`isSaleContractFullySigned`), com distinção de “sem contrato”.
 *
 * SIGNED: signature_status=SIGNED OU contracts.status assinado/signed
 * PENDING: contrato existe e ainda não está totalmente assinado
 * CANCELLED: contrato cancelado
 * NOT_GENERATED: venda sem contrato
 * UNAVAILABLE: consulta de contratos falhou
 */
export type ContractSignatureState =
  | 'SIGNED'
  | 'PENDING'
  | 'CANCELLED'
  | 'NOT_GENERATED'
  | 'UNAVAILABLE';

export function resolveContractSignatureState(input: {
  contract?: {
    status?: string | null;
    signature_status?: string | null;
  } | null;
  contractsAvailable?: boolean;
}): ContractSignatureState {
  if (input.contractsAvailable === false) return 'UNAVAILABLE';
  if (!input.contract) return 'NOT_GENERATED';
  if (isSaleContractSuperseded(input.contract)) return 'CANCELLED';
  if (isSaleContractCancelled(input.contract)) return 'CANCELLED';
  if (isSaleContractFullySigned(input.contract)) return 'SIGNED';
  return 'PENDING';
}

export function contractSignatureStateLabel(state: ContractSignatureState): string {
  switch (state) {
    case 'SIGNED':
      return 'Contrato assinado';
    case 'PENDING':
      return 'Contrato pendente';
    case 'CANCELLED':
      return 'Cancelado';
    case 'NOT_GENERATED':
      return 'Contrato ainda não gerado';
    case 'UNAVAILABLE':
      return 'Status de contrato indisponível';
    default:
      return state;
  }
}

export function contractSignatureStateBadgeKey(state: ContractSignatureState): string {
  switch (state) {
    case 'SIGNED':
      return 'assinado';
    case 'PENDING':
      return 'contrato_pendente';
    case 'CANCELLED':
      return 'cancelado';
    case 'NOT_GENERATED':
      return 'sem_contrato';
    case 'UNAVAILABLE':
      return 'indisponivel';
    default:
      return 'contrato_pendente';
  }
}

export function resolveSaleContractDashboardValue(
  contract: SaleContractDashboardRow,
): number {
  const candidates = [
    contract.sale_value_display,
    contract.sale_value,
    contract.sales?.total_value,
    contract.sales?.final_value,
    contract.sales?.agreed_price,
    contract.sales?.sale_value,
    contract.sales?.sale_price,
    contract.blocks?.price,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function computeSaleContractDashboardStats(
  contracts: SaleContractDashboardRow[],
): SaleContractDashboardStats {
  let ativos = 0;
  let assinados = 0;
  let pendentes = 0;
  let cancelados = 0;
  let valorTotal = 0;

  for (const contract of contracts) {
    const bucket = classifySaleContractForDashboard(contract);
    valorTotal += resolveSaleContractDashboardValue(contract);

    if (isSaleContractSuperseded(contract)) continue;

    if (bucket === 'cancelled') {
      cancelados++;
      continue;
    }

    ativos++;
    if (bucket === 'signed') {
      assinados++;
    } else {
      pendentes++;
    }
  }

  return { ativos, assinados, pendentes, cancelados, valorTotal };
}

export function saleContractDashboardPercent(
  part: number,
  total: number,
): number {
  if (total <= 0 || part <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

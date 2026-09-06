/**
 * Preview/simulação da Troca de lote (Fase 2).
 * Puro: sem I/O, sem mutação, sem ReleaseLot, sem settlement.
 *
 * Fase 4 (não aqui): nova validação com SELECT … FOR UPDATE em sales +
 * from_block + to_block dentro de RPC transacional. Este preview é stateless.
 */

import {
  deriveSaleLotSwapFinancials,
  isLotSwapV1DestinationStatusAllowed,
  isSameProjectLotSwap,
  LOT_SWAP_CREDIT_EXCEEDS_PRICE,
  LOT_SWAP_CREDIT_EXCEEDS_PRICE_MESSAGE,
  LOT_SWAP_SCHEDULE_PREVIEW_NOTICE,
  LOT_SWAP_V1_DESTINATION_REQUIRED_STATUS,
  LOT_SWAP_V1_REJECTED_DESTINATION_STATUSES,
  v1TransferableCreditFromAppropriatedPayments,
  type SaleLotSwapFinancialDerivation,
} from '@/lib/finance/saleLotSwap';

export {
  LOT_SWAP_CREDIT_EXCEEDS_PRICE,
  LOT_SWAP_CREDIT_EXCEEDS_PRICE_MESSAGE,
  LOT_SWAP_SCHEDULE_PREVIEW_NOTICE,
};

export const LOT_SWAP_SALE_CANCELLED = 'LOT_SWAP_SALE_CANCELLED';
export const LOT_SWAP_SALE_NOT_ACTIVE = 'LOT_SWAP_SALE_NOT_ACTIVE';
export const LOT_SWAP_ORIGIN_MISMATCH = 'LOT_SWAP_ORIGIN_MISMATCH';
export const LOT_SWAP_ORIGIN_NOT_SOLD = 'LOT_SWAP_ORIGIN_NOT_SOLD';
export const LOT_SWAP_SAME_BLOCK = 'LOT_SWAP_SAME_BLOCK';
export const LOT_SWAP_CROSS_PROJECT = 'LOT_SWAP_CROSS_PROJECT';
export const LOT_SWAP_DESTINATION_RESERVED = 'LOT_SWAP_DESTINATION_RESERVED';
export const LOT_SWAP_DESTINATION_NOT_AVAILABLE = 'LOT_SWAP_DESTINATION_NOT_AVAILABLE';
export const LOT_SWAP_DESTINATION_HAS_SALE = 'LOT_SWAP_DESTINATION_HAS_SALE';
export const LOT_SWAP_DESTINATION_HAS_CONTRACT = 'LOT_SWAP_DESTINATION_HAS_CONTRACT';
export const LOT_SWAP_CROSS_TENANT = 'CROSS_TENANT';

export const LOT_SWAP_PLATFORM_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MASTER',
  'MASTER_ADMIN',
  'MASTER-ADMIN',
]);

export function isLotSwapPlatformAdminRole(role?: string | null): boolean {
  return LOT_SWAP_PLATFORM_ADMIN_ROLES.has(String(role || '').trim().toUpperCase());
}

export function resolveLotSwapResourceCompanyId(input: {
  companyId?: string | null;
  tenantId?: string | null;
}): string {
  return String(input.companyId || input.tenantId || '').trim();
}

/**
 * Isolamento entre empresas. Super admin da plataforma pode operar qualquer tenant.
 * Qualquer outro perfil só acessa o tenant do próprio perfil.
 */
export function assertLotSwapCallerOwnsCompany(input: {
  callerTenantId?: string | null;
  resourceCompanyId?: string | null;
  callerRole?: string | null;
}): { ok: true; code: null } | { ok: false; code: typeof LOT_SWAP_CROSS_TENANT } {
  if (isLotSwapPlatformAdminRole(input.callerRole)) {
    return { ok: true, code: null };
  }
  const caller = String(input.callerTenantId || '').trim();
  const resource = String(input.resourceCompanyId || '').trim();
  if (!caller || !resource || caller === resource) {
    if (!caller || !resource) {
      return { ok: false, code: LOT_SWAP_CROSS_TENANT };
    }
    return { ok: true, code: null };
  }
  return { ok: false, code: LOT_SWAP_CROSS_TENANT };
}

/**
 * Simula dois tenants distintos sem I/O. Usado para provar que empresa A
 * não visualiza nem executa troca da empresa B, mesmo conhecendo UUIDs.
 */
export function simulateLotSwapCrossTenantAccess(input: {
  callerTenantId: string;
  callerRole?: string | null;
  saleCompanyId: string;
  originLotCompanyId: string;
  destLotCompanyId: string;
  originProjectId: string;
  destProjectId: string;
  destStatus?: string | null;
  destSaleId?: string | null;
  destContractId?: string | null;
}): {
  canPreviewSale: boolean;
  canListDestination: boolean;
  canExecute: boolean;
  codes: string[];
} {
  const codes: string[] = [];
  const saleGuard = assertLotSwapCallerOwnsCompany({
    callerTenantId: input.callerTenantId,
    resourceCompanyId: input.saleCompanyId,
    callerRole: input.callerRole,
  });
  if (!saleGuard.ok) codes.push(saleGuard.code);
  const originGuard = assertLotSwapCallerOwnsCompany({
    callerTenantId: input.callerTenantId,
    resourceCompanyId: input.originLotCompanyId,
    callerRole: input.callerRole,
  });
  if (!originGuard.ok) codes.push(originGuard.code);
  const destCompanyGuard = assertLotSwapCallerOwnsCompany({
    callerTenantId: input.callerTenantId,
    resourceCompanyId: input.destLotCompanyId,
    callerRole: input.callerRole,
  });
  if (!destCompanyGuard.ok) codes.push(destCompanyGuard.code);
  const destVerdict = evaluateLotSwapDestination(
    {
      id: 'dest-lot',
      projectId: input.destProjectId,
      status: input.destStatus || 'Disponível',
      saleId: input.destSaleId || null,
      contractId: input.destContractId || null,
      companyId: input.destLotCompanyId,
      quadra: '02',
      lote: '62',
      area: null,
      price: 50,
    },
    {
      id: 'origin-lot',
      projectId: input.originProjectId,
      companyId: input.originLotCompanyId,
    },
  );
  if (!destVerdict.ok && destVerdict.code) codes.push(destVerdict.code);
  const unique = Array.from(new Set(codes));
  const canPreviewSale = saleGuard.ok;
  const canListDestination = canPreviewSale && destVerdict.ok && destCompanyGuard.ok;
  const canExecute =
    canPreviewSale && originGuard.ok && destCompanyGuard.ok && destVerdict.ok;
  return { canPreviewSale, canListDestination, canExecute, codes: unique };
}

/**
 * Colunas de leitura em public.sales para o preview da Troca de lote.
 * `sale_price` NÃO existe no schema oficial (agreed_price + lot_price).
 * Incluir sale_price no SELECT do PostgREST quebra as três tentativas e
 * devolve HTTP 500 "Não foi possível carregar a venda."
 */
export const SALE_LOT_SWAP_SALE_SELECT_COLUMNS = [
  'id',
  'status',
  'customer_id',
  'broker_id',
  'contract_id',
  'block_id',
  'lot_id',
  'project_id',
  'tenant_id',
  'company_id',
  'agreed_price',
  'lot_price',
  'total_value',
  'financial_account_id',
  'installment_correction_type',
] as const;

export const LOT_SWAP_PREVIEW_GENERIC_LOAD_SALE_MESSAGE =
  'Não foi possível carregar a venda.';

export function parseMissingSelectColumn(message: string | undefined): string | null {
  if (!message) return null;
  const match = message.match(/Could not find the '(\w+)' column/i);
  return match?.[1] ?? null;
}

export function dropColumnFromSelectList(
  columns: readonly string[],
  missing: string,
): string[] {
  return columns.filter((column) => column !== missing);
}

/**
 * Identidade da venda já carregada no modal Operações da venda.
 * Prefere o saleId resolvido pelo GET /api/lots/:id/release.
 * Nunca usa blockId (lote GIS) nem contractId.
 */
export function resolveLotSwapPreviewSaleId(input: {
  previewSaleId?: string | null;
  lotSaleId?: string | null;
  lotSaleIdSnake?: string | null;
  lotId?: string | null;
  contractId?: string | null;
}): string {
  const previewSaleId = String(input.previewSaleId || '').trim();
  const lotSaleId = String(input.lotSaleId || '').trim();
  const lotSaleIdSnake = String(input.lotSaleIdSnake || '').trim();
  const resolved = previewSaleId || lotSaleId || lotSaleIdSnake;
  const lotId = String(input.lotId || '').trim();
  const contractId = String(input.contractId || '').trim();
  if (resolved && resolved === lotId) return '';
  if (resolved && resolved === contractId) return '';
  return resolved;
}

export function mapLotSwapPreviewUserMessage(input: {
  status?: number;
  code?: string | null;
  message?: string | null;
  error?: string | null;
}): string {
  const code = String(input.code || '').trim();
  const fromServer = String(input.message || input.error || '').trim();
  if (code === 'SALE_NOT_FOUND') {
    return 'Venda não encontrada.';
  }
  if (code === 'CROSS_TENANT') {
    return 'A venda não pertence à empresa atual.';
  }
  if (code === 'UNAUTHORIZED' || code === 'NO_PROFILE' || input.status === 401) {
    return 'Sessão ou autorização inválida.';
  }
  if (code === 'LOAD_FINANCE_FAILED') {
    return 'Erro ao carregar dados financeiros da venda.';
  }
  if (code === LOT_SWAP_SALE_NOT_ACTIVE || code === LOT_SWAP_SALE_CANCELLED) {
    return lotSwapPreviewBlockMessage(code) || fromServer;
  }
  if (code === 'SALE_ID_REQUIRED') {
    return 'Não foi possível identificar a venda.';
  }
  if (code === 'LOT_SWAP_REASON_REQUIRED' || code === 'DESTINATION_REQUIRED') {
    return fromServer || 'Informe o motivo da troca de lote.';
  }
  if (code === 'PLAN_NOT_CALCULATED' || code === 'NOT_CALCULATED') {
    return 'Confirme o plano CALCULATED antes de executar a troca.';
  }
  if (code === 'EXECUTING_IN_PROGRESS' || code === 'PLAN_IN_FLIGHT') {
    return 'Já existe uma troca em execução para esta venda.';
  }
  if (code === 'DESTINATION_NOT_AVAILABLE') {
    return 'O lote destino precisa estar Disponível, sem venda e sem contrato.';
  }
  if (code === 'ORIGIN_MISMATCH') {
    return 'O lote origem não está mais vinculado a esta venda. Recalcule o plano.';
  }
  if (code === 'RECEIPT_PAID_SINCE_PLAN' || code === 'PRESERVE_RECEIPT_CHANGED') {
    return 'As parcelas mudaram depois do plano. Recalcule o plano antes de executar.';
  }
  if (code === 'CONTRACT_NUMBER_REUSED' || code === 'CONTRACT_NUMBER_INVALID') {
    return 'Não foi possível numerar o novo contrato. O número anterior não pode ser reutilizado.';
  }
  if (code === 'CONTRACT_HTML_REQUIRED' || code === 'CONTRACT_HTML_FAILED') {
    return 'Não foi possível gerar o novo contrato da unidade destino.';
  }
  if (code === 'ALREADY_EXECUTED') {
    return fromServer || 'Esta troca já foi executada.';
  }
  if (code === 'LOAD_SALE_FAILED') {
    return 'Erro interno inesperado ao carregar a prévia.';
  }
  if (
    fromServer &&
    fromServer !== LOT_SWAP_PREVIEW_GENERIC_LOAD_SALE_MESSAGE
  ) {
    return fromServer;
  }
  if (input.status === 403) {
    return 'A venda não pertence à empresa atual.';
  }
  if (input.status === 404) {
    return fromServer || 'Venda não encontrada.';
  }
  if (input.status === 409) {
    return fromServer || 'A troca de lote exige uma venda ativa.';
  }
  return 'Erro interno inesperado ao carregar a prévia.';
}

export const LOT_SWAP_EXECUTE_GENERIC_FAILURE_MESSAGE =
  'Não foi possível executar a troca de lote. Nenhum lote, parcela ou contrato foi alterado.';

export function mapLotSwapExecuteUserMessage(input: {
  status?: number;
  code?: string | null;
  message?: string | null;
  error?: string | null;
}): string {
  const code = String(input.code || '').trim();
  const fromServer = String(input.message || input.error || '').trim();
  if (code === 'UNAUTHORIZED' || code === 'NO_PROFILE' || input.status === 401) {
    return 'Sessão ou autorização inválida.';
  }
  if (code === 'PLAN_NOT_CALCULATED' || code === 'NOT_CALCULATED') {
    return 'Confirme o plano CALCULATED antes de executar a troca.';
  }
  if (code === 'EXECUTING_IN_PROGRESS' || code === 'PLAN_IN_FLIGHT') {
    return 'Já existe uma troca em execução para esta venda.';
  }
  if (code === 'DESTINATION_NOT_AVAILABLE') {
    return 'O lote destino precisa estar Disponível, sem venda e sem contrato.';
  }
  if (code === 'ORIGIN_MISMATCH') {
    return 'O lote origem não está mais vinculado a esta venda. Recalcule o plano.';
  }
  if (code === 'RECEIPT_PAID_SINCE_PLAN' || code === 'PRESERVE_RECEIPT_CHANGED') {
    return 'As parcelas mudaram depois do plano. Recalcule o plano antes de executar.';
  }
  if (code === 'CONTRACT_NUMBER_REUSED' || code === 'CONTRACT_NUMBER_INVALID') {
    return 'Não foi possível numerar o novo contrato. O número anterior não pode ser reutilizado.';
  }
  if (code === 'CONTRACT_HTML_REQUIRED' || code === 'CONTRACT_HTML_FAILED') {
    return 'Não foi possível gerar o novo contrato da unidade destino.';
  }
  if (code === 'ALREADY_EXECUTED') {
    return fromServer || 'Esta troca já foi executada.';
  }
  if (code === 'TENANT_MISMATCH' || input.status === 403) {
    return fromServer || 'A troca não pertence à empresa atual.';
  }
  const looksLikePostgres =
    /coalesce types|could not find the .* column|column .* does not exist|invalid input syntax/i.test(
      fromServer,
    );
  if (
    fromServer &&
    fromServer !== LOT_SWAP_PREVIEW_GENERIC_LOAD_SALE_MESSAGE &&
    fromServer !== 'Erro interno inesperado ao carregar a prévia.' &&
    !looksLikePostgres
  ) {
    return fromServer;
  }
  return LOT_SWAP_EXECUTE_GENERIC_FAILURE_MESSAGE;
}

const PAID_STATUSES = new Set(['pago', 'paid']);
const CANCELED_STATUSES = new Set(['cancelado', 'canceled', 'cancelled']);

export type LotSwapBlockSnapshot = {
  id: string;
  projectId: string | null;
  status: string | null;
  saleId: string | null;
  contractId: string | null;
  companyId?: string | null;
  quadra: string | null;
  lote: string | null;
  area: number | null;
  price: number;
};

export type LotSwapReceiptLike = {
  id?: string | null;
  installment_number?: number | string | null;
  status?: string | null;
  paid_at?: string | null;
  amount?: number | string | null;
  paid_amount?: number | string | null;
  due_date?: string | null;
};

export type LotSwapBalloonLike = {
  installment_number?: number | string | null;
  additional_amount?: number | string | null;
  due_date?: string | null;
};

export type LotSwapDestinationVerdict = {
  ok: boolean;
  code: string | null;
};

function money2(n: number | string | null | undefined): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

export function isLotSwapCancelledSaleStatus(status?: string | null): boolean {
  const st = String(status || '')
    .trim()
    .toLowerCase();
  return st === 'cancelled' || st === 'canceled' || st === 'cancelado' || st === 'cancelada';
}

export function isLotSwapActiveSaleStatus(status?: string | null): boolean {
  const st = String(status || '')
    .trim()
    .toLowerCase();
  return st === 'active' || st === 'ativo';
}

export function isLotSwapPaidReceipt(row: LotSwapReceiptLike): boolean {
  const st = String(row.status || '')
    .toLowerCase()
    .trim();
  if (PAID_STATUSES.has(st)) return true;
  return Boolean(row.paid_at);
}

export function isLotSwapCanceledReceipt(row: LotSwapReceiptLike): boolean {
  const st = String(row.status || '')
    .toLowerCase()
    .trim();
  return CANCELED_STATUSES.has(st);
}

export function isLotSwapFutureReceipt(row: LotSwapReceiptLike): boolean {
  if (isLotSwapPaidReceipt(row) || isLotSwapCanceledReceipt(row)) return false;
  return true;
}

export function assertSaleEligibleForLotSwapPreview(input: {
  saleStatus?: string | null;
}): LotSwapDestinationVerdict {
  if (isLotSwapCancelledSaleStatus(input.saleStatus)) {
    return { ok: false, code: LOT_SWAP_SALE_CANCELLED };
  }
  if (!isLotSwapActiveSaleStatus(input.saleStatus)) {
    return { ok: false, code: LOT_SWAP_SALE_NOT_ACTIVE };
  }
  return { ok: true, code: null };
}

export function assertOriginBelongsToSale(input: {
  saleId: string;
  saleBlockId?: string | null;
  origin: Pick<LotSwapBlockSnapshot, 'id' | 'saleId' | 'status'>;
}): LotSwapDestinationVerdict {
  const saleId = String(input.saleId || '').trim();
  const originId = String(input.origin.id || '').trim();
  const saleBlockId = String(input.saleBlockId || '').trim();
  const originSaleId = String(input.origin.saleId || '').trim();
  if (!saleId || !originId) return { ok: false, code: LOT_SWAP_ORIGIN_MISMATCH };
  if (saleBlockId && saleBlockId !== originId) {
    return { ok: false, code: LOT_SWAP_ORIGIN_MISMATCH };
  }
  if (originSaleId && originSaleId !== saleId) {
    return { ok: false, code: LOT_SWAP_ORIGIN_MISMATCH };
  }
  if (String(input.origin.status || '').trim() !== 'Vendido') {
    return { ok: false, code: LOT_SWAP_ORIGIN_NOT_SOLD };
  }
  return { ok: true, code: null };
}

export function evaluateLotSwapDestination(
  destination: LotSwapBlockSnapshot,
  origin: Pick<LotSwapBlockSnapshot, 'id' | 'projectId' | 'companyId'>,
): LotSwapDestinationVerdict {
  const destId = String(destination.id || '').trim();
  const originId = String(origin.id || '').trim();
  if (!destId || destId === originId) {
    return { ok: false, code: LOT_SWAP_SAME_BLOCK };
  }
  const destCompany = String(destination.companyId || '').trim();
  const originCompany = String(origin.companyId || '').trim();
  if (destCompany && originCompany && destCompany !== originCompany) {
    return { ok: false, code: LOT_SWAP_CROSS_TENANT };
  }
  if (!isSameProjectLotSwap(origin.projectId, destination.projectId)) {
    return { ok: false, code: LOT_SWAP_CROSS_PROJECT };
  }
  const status = String(destination.status || '').trim();
  if (
    (LOT_SWAP_V1_REJECTED_DESTINATION_STATUSES as readonly string[]).includes(status)
  ) {
    return { ok: false, code: LOT_SWAP_DESTINATION_RESERVED };
  }
  if (!isLotSwapV1DestinationStatusAllowed(status)) {
    return { ok: false, code: LOT_SWAP_DESTINATION_NOT_AVAILABLE };
  }
  if (String(destination.saleId || '').trim()) {
    return { ok: false, code: LOT_SWAP_DESTINATION_HAS_SALE };
  }
  if (String(destination.contractId || '').trim()) {
    return { ok: false, code: LOT_SWAP_DESTINATION_HAS_CONTRACT };
  }
  if (status !== LOT_SWAP_V1_DESTINATION_REQUIRED_STATUS) {
    return { ok: false, code: LOT_SWAP_DESTINATION_NOT_AVAILABLE };
  }
  return { ok: true, code: null };
}

export function sumLotSwapPaidAmount(receipts: LotSwapReceiptLike[]): {
  totalPaid: number;
  paidCount: number;
} {
  let totalPaid = 0;
  let paidCount = 0;
  for (const row of receipts) {
    if (!isLotSwapPaidReceipt(row)) continue;
    paidCount += 1;
    totalPaid = money2(totalPaid + money2(row.amount));
  }
  return { totalPaid, paidCount };
}

/**
 * V1: crédito transferível = pagamentos apropriados ao preço da aquisição.
 * total_paid permanece campo separado — não tratar os dois como a mesma coisa.
 */
export function deriveLotSwapPreviewFinancials(input: {
  oldSalePrice: number;
  newLotPrice: number;
  appropriatedToAcquisitionPrice: number;
}): SaleLotSwapFinancialDerivation {
  const totalPaid = money2(input.appropriatedToAcquisitionPrice);
  return deriveSaleLotSwapFinancials({
    oldSalePrice: input.oldSalePrice,
    newLotPrice: input.newLotPrice,
    totalPaid,
    transferableCredit: v1TransferableCreditFromAppropriatedPayments(totalPaid),
  });
}

export type LotSwapSchedulePreview = {
  futureInstallmentCount: number;
  newBalance: number;
  estimatedAverageAmount: number | null;
  firstFutureDueDate: string | null;
  correctionLabel: string | null;
  balloons: Array<{
    installmentNumber: number;
    additionalAmount: number;
    dueDate: string | null;
  }>;
  notice: string;
};

export function simulateLotSwapSchedule(input: {
  newBalance: number;
  blocked?: boolean;
  futureReceipts: LotSwapReceiptLike[];
  balloons?: LotSwapBalloonLike[];
  correctionLabel?: string | null;
}): LotSwapSchedulePreview {
  const future = input.futureReceipts.filter(isLotSwapFutureReceipt);
  const dueDates = future
    .map((r) => String(r.due_date || '').trim())
    .filter(Boolean)
    .sort();
  const count = future.length;
  const newBalance = money2(input.newBalance);
  const estimatedAverageAmount =
    !input.blocked && count > 0 ? money2(newBalance / count) : null;
  const balloons = (input.balloons || []).map((b) => ({
    installmentNumber: Math.max(0, Math.floor(Number(b.installment_number) || 0)),
    additionalAmount: money2(b.additional_amount),
    dueDate: b.due_date ? String(b.due_date) : null,
  }));
  return {
    futureInstallmentCount: count,
    newBalance,
    estimatedAverageAmount,
    firstFutureDueDate: dueDates[0] || null,
    correctionLabel: input.correctionLabel || null,
    balloons,
    notice: LOT_SWAP_SCHEDULE_PREVIEW_NOTICE,
  };
}

export function lotSwapPreviewBlockMessage(code?: string | null): string | null {
  if (code === LOT_SWAP_CREDIT_EXCEEDS_PRICE) return LOT_SWAP_CREDIT_EXCEEDS_PRICE_MESSAGE;
  if (code === LOT_SWAP_SALE_CANCELLED) {
    return 'A venda está encerrada. A troca de lote não se aplica.';
  }
  if (code === LOT_SWAP_SALE_NOT_ACTIVE) {
    return 'A troca de lote exige uma venda ativa.';
  }
  if (code === LOT_SWAP_ORIGIN_MISMATCH) {
    return 'O lote de origem não pertence a esta venda.';
  }
  if (code === LOT_SWAP_ORIGIN_NOT_SOLD) {
    return 'O lote de origem precisa estar Vendido por esta venda.';
  }
  if (code === LOT_SWAP_SAME_BLOCK) {
    return 'Selecione um lote destino diferente do lote atual.';
  }
  if (code === LOT_SWAP_CROSS_PROJECT) {
    return 'A troca na V1 só é permitida dentro do mesmo empreendimento.';
  }
  if (code === LOT_SWAP_CROSS_TENANT) {
    return 'A venda não pertence à empresa atual.';
  }
  if (code === LOT_SWAP_DESTINATION_RESERVED) {
    return 'Lote Reservado não é aceito como destino na V1.';
  }
  if (code === LOT_SWAP_DESTINATION_NOT_AVAILABLE) {
    return 'O lote destino precisa estar Disponível.';
  }
  if (code === LOT_SWAP_DESTINATION_HAS_SALE || code === LOT_SWAP_DESTINATION_HAS_CONTRACT) {
    return 'O lote destino não pode ter vínculo comercial.';
  }
  return null;
}

/**
 * Carrega a prévia da Transferência de titularidade (P2).
 * Somente leitura. Não grava sale_title_transfers, sales, blocks, receipts,
 * contratos nem cobranças. Não chama a RPC da Troca nem o encerramento do lote.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureExternalChargeProvidersRegistered,
  listRegisteredExternalChargeProviders,
} from '@/lib/finance/externalCharges';
import type { ExternalChargeRecord } from '@/lib/finance/externalCharges/types';
import { reduceTitleTransferExternalCharges } from '@/lib/finance/saleTitleTransferExternalCharges';
import { loadLotSwapCallerProfile } from '@/lib/finance/saleLotSwapPreviewService';
import {
  dropColumnFromSelectList,
  parseMissingSelectColumn,
} from '@/lib/finance/saleLotSwapPreview';
import {
  assertTitleTransferCallerOwnsCompany,
  assertTitleTransferLotUnchanged,
  buildTitleTransferHistoryChain,
  mapTitleTransferPreviewUserMessage,
  summarizeTitleTransferFinance,
  titleTransferHistoryNotice,
  TITLE_TRANSFER_CROSS_TENANT,
  TITLE_TRANSFER_ORIGINAL_HOLDER_NOTICE,
  TITLE_TRANSFER_PREVIEW_NOTICE,
  TITLE_TRANSFER_SALE_NOT_FOUND,
  type TitleTransferFinanceKpis,
  type TitleTransferHistoryEntry,
  type TitleTransferReceiptLike,
} from '@/lib/finance/saleTitleTransferPreview';
import { SALE_TITLE_TRANSFER_TABLE } from '@/lib/finance/saleTitleTransfer';

export class TitleTransferPreviewError extends Error {
  status: number;
  code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'TitleTransferPreviewError';
    this.status = status;
    this.code = code;
  }
}

export type TitleTransferCurrentContract = {
  id: string | null;
  number: string | null;
  status: string | null;
  isCurrent: boolean;
};

export type TitleTransferExternalChargesPreview = {
  mutation: false;
  remoteApiCalled: false;
  cancelCharges: false;
  generateCharges: false;
  activeProvider: string | null;
  paid: ExternalChargeRecord[];
  open: ExternalChargeRecord[];
  cancelledReusable: ExternalChargeRecord[];
  nonCancelable: ExternalChargeRecord[];
  orphans: ExternalChargeRecord[];
  ambiguousReceiptIds: string[];
  blockCode: string | null;
  blockMessage: string | null;
};

export type TitleTransferPreviewPayload = {
  mutation: false;
  persistTransfer: false;
  persistSale: false;
  persistLot: false;
  persistContract: false;
  persistReceipts: false;
  persistCharges: false;
  remoteApiCalled: false;
  cancelCharges: false;
  generateCharges: false;
  notice: string;
  current: {
    saleId: string;
    saleStatus: string | null;
    companyId: string;
    titular: {
      id: string | null;
      name: string | null;
      document: string | null;
    };
    property: {
      projectId: string | null;
      projectName: string | null;
      blockId: string;
      quadra: string | null;
      lote: string | null;
      status: string | null;
    };
    salePrice: number;
    contract: TitleTransferCurrentContract;
    contracts: TitleTransferCurrentContract[];
    finance: TitleTransferFinanceKpis;
  };
  externalCharges: TitleTransferExternalChargesPreview;
  history: {
    isOriginalHolder: boolean;
    notice: string;
    chain: TitleTransferHistoryEntry[];
  };
};

const SALE_SELECT_COLUMNS = [
  'id',
  'status',
  'customer_id',
  'contract_id',
  'block_id',
  'lot_id',
  'project_id',
  'tenant_id',
  'company_id',
  'agreed_price',
  'lot_price',
  'total_value',
] as const;

function money2(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function text(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

function todayIsoSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function loadSaleRow(
  admin: SupabaseClient,
  saleId: string,
): Promise<Record<string, unknown>> {
  let columns: string[] = [...SALE_SELECT_COLUMNS];
  let lastMessage = '';
  while (columns.length > 0) {
    const query = await admin
      .from('sales')
      .select(columns.join(', '))
      .eq('id', saleId)
      .maybeSingle();
    if (!query.error) {
      if (!query.data) {
        throw new TitleTransferPreviewError(
          'Venda não encontrada.',
          TITLE_TRANSFER_SALE_NOT_FOUND,
          404,
        );
      }
      return query.data as unknown as Record<string, unknown>;
    }
    lastMessage = String(query.error.message || '');
    const missing = parseMissingSelectColumn(lastMessage);
    if (missing && columns.includes(missing)) {
      columns = dropColumnFromSelectList(columns, missing);
      continue;
    }
    throw new TitleTransferPreviewError(
      'Erro interno inesperado ao carregar a venda.',
      'LOAD_SALE_FAILED',
      500,
    );
  }
  throw new TitleTransferPreviewError(
    lastMessage || 'Erro interno inesperado ao carregar a venda.',
    'LOAD_SALE_FAILED',
    500,
  );
}

async function loadBlock(
  admin: SupabaseClient,
  blockId: string,
): Promise<Record<string, unknown>> {
  const full = await admin
    .from('blocks')
    .select(
      'id, status, price, sale_id, contract_id, project_id, tenant_id, company_id, block_name, name, number, lot_number, customer_id',
    )
    .eq('id', blockId)
    .maybeSingle();
  if (!full.error && full.data) return full.data as Record<string, unknown>;
  const core = await admin
    .from('blocks')
    .select(
      'id, status, price, sale_id, contract_id, project_id, tenant_id, company_id, block_name, name, number, lot_number',
    )
    .eq('id', blockId)
    .maybeSingle();
  if (core.error || !core.data) {
    throw new TitleTransferPreviewError('Lote não encontrado.', 'LOT_NOT_FOUND', 404);
  }
  return core.data as Record<string, unknown>;
}

function classifyExternalCharges(
  charges: ExternalChargeRecord[],
  receipts: Array<{ id?: string | null; status?: string | null }>,
): TitleTransferExternalChargesPreview {
  const reduced = reduceTitleTransferExternalCharges({ receipts, charges });
  const providers = new Set<string>();
  for (const row of charges) {
    if (row.provider) providers.add(row.provider);
  }
  const activeProvider =
    [...providers].find((code) => code === 'ASAAS' || code === 'INTER') ||
    [...providers][0] ||
    null;
  return {
    mutation: false,
    remoteApiCalled: false,
    cancelCharges: false,
    generateCharges: false,
    activeProvider,
    paid: reduced.paid,
    open: reduced.open,
    cancelledReusable: reduced.cancelledReusable,
    nonCancelable: reduced.nonCancelable,
    orphans: reduced.orphans,
    ambiguousReceiptIds: reduced.ambiguousReceiptIds,
    blockCode: reduced.blockCode,
    blockMessage: reduced.blockMessage,
  };
}

export async function loadSaleTitleTransferPreview(
  admin: SupabaseClient,
  input: { saleId: string; userId: string; todayIso?: string },
): Promise<TitleTransferPreviewPayload> {
  const saleId = String(input.saleId || '').trim();
  const userId = String(input.userId || '').trim();
  if (!saleId) {
    throw new TitleTransferPreviewError('saleId obrigatório.', 'SALE_ID_REQUIRED', 400);
  }
  if (!userId) {
    throw new TitleTransferPreviewError(
      'Sessão ou autorização inválida.',
      'UNAUTHORIZED',
      401,
    );
  }

  const profile = await loadLotSwapCallerProfile(admin, userId);
  if (!profile) {
    throw new TitleTransferPreviewError(
      'Sessão ou autorização inválida.',
      'NO_PROFILE',
      403,
    );
  }
  const callerRole = String(profile.role || '').trim();
  const callerTenant = String(
    profile.tenant_id || (profile as { company_id?: string }).company_id || '',
  ).trim();

  const sale = await loadSaleRow(admin, saleId);
  const companyId = String(sale.company_id || sale.tenant_id || '').trim();
  const tenantGuard = assertTitleTransferCallerOwnsCompany({
    callerTenantId: callerTenant,
    resourceCompanyId: companyId,
    callerRole,
  });
  if (!tenantGuard.ok) {
    throw new TitleTransferPreviewError(
      mapTitleTransferPreviewUserMessage({ code: TITLE_TRANSFER_CROSS_TENANT }),
      TITLE_TRANSFER_CROSS_TENANT,
      403,
    );
  }

  const blockId = String(sale.block_id || sale.lot_id || '').trim();
  if (!blockId) {
    throw new TitleTransferPreviewError(
      'A venda não possui lote vinculado.',
      'LOT_NOT_FOUND',
      409,
    );
  }
  const block = await loadBlock(admin, blockId);
  const lotGuard = assertTitleTransferLotUnchanged({
    saleId,
    saleBlockId: blockId,
    blockId: String(block.id || ''),
    blockSaleId: text(block.sale_id),
    blockStatus: text(block.status),
  });
  if (!lotGuard.ok) {
    throw new TitleTransferPreviewError(
      mapTitleTransferPreviewUserMessage({ code: lotGuard.code }),
      lotGuard.code || 'LOT_GUARD',
      409,
    );
  }

  const customerId = text(sale.customer_id);
  const projectId = text(sale.project_id) || text(block.project_id);
  const [customerRes, projectRes, contractRes, receiptsRes, historyRes] =
    await Promise.all([
      customerId
        ? admin
            .from('customers')
            .select('id, name, cpf_cnpj, document')
            .eq('id', customerId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      projectId
        ? admin.from('projects').select('id, name').eq('id', projectId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin
        .from('contracts')
        .select('id, contract_number, status, is_current, created_at')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: false }),
      admin
        .from('finance_receipts')
        .select('id, status, amount, paid_at, due_date, sale_id')
        .eq('sale_id', saleId),
      admin
        .from(SALE_TITLE_TRANSFER_TABLE)
        .select(
          'id, from_customer_id, to_customer_id, from_contract_id, to_contract_id, previous_transfer_id, declared_agio_amount, transfer_date, executed_at, status, sale_id, block_id',
        )
        .eq('sale_id', saleId)
        .eq('status', 'EXECUTED')
        .order('executed_at', { ascending: true }),
    ]);

  const salePrice = money2(
    sale.agreed_price ?? sale.lot_price ?? sale.total_value ?? block.price,
  );
  const receipts = (receiptsRes.data || []) as TitleTransferReceiptLike[];
  const finance = summarizeTitleTransferFinance({
    receipts,
    salePrice,
    todayIso: input.todayIso || todayIsoSaoPaulo(),
  });

  const contracts = ((contractRes.data || []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: text(row.id),
      number: text(row.contract_number),
      status: text(row.status),
      isCurrent: row.is_current === true,
    }),
  );
  const currentContract =
    contracts.find((row) => row.isCurrent) ||
    contracts.find((row) => String(row.status || '').toLowerCase() === 'ativo') ||
    contracts[0] || {
      id: text(sale.contract_id),
      number: null,
      status: null,
      isCurrent: true,
    };

  const historyRows = ((historyRes.error ? [] : historyRes.data) || []) as Array<
    Record<string, unknown>
  >;
  const customerIds = new Set<string>();
  for (const row of historyRows) {
    const fromId = text(row.from_customer_id);
    const toId = text(row.to_customer_id);
    if (fromId) customerIds.add(fromId);
    if (toId) customerIds.add(toId);
  }
  const names = new Map<string, string>();
  if (customerIds.size) {
    const namesRes = await admin
      .from('customers')
      .select('id, name')
      .in('id', [...customerIds]);
    for (const row of (namesRes.data || []) as Array<Record<string, unknown>>) {
      const id = text(row.id);
      if (id) names.set(id, text(row.name) || id);
    }
  }
  const chain = buildTitleTransferHistoryChain(
    historyRows.map((row) => {
      const fromId = text(row.from_customer_id) || '';
      const toId = text(row.to_customer_id) || '';
      return {
        id: String(row.id),
        fromCustomerId: fromId,
        toCustomerId: toId,
        fromCustomerName: names.get(fromId) || null,
        toCustomerName: names.get(toId) || null,
        fromContractId: text(row.from_contract_id),
        toContractId: text(row.to_contract_id),
        transferDate: text(row.transfer_date),
        declaredAgioAmount: money2(row.declared_agio_amount),
        previousTransferId: text(row.previous_transfer_id),
        executedAt: text(row.executed_at),
      };
    }),
  );

  ensureExternalChargeProvidersRegistered();
  const receiptIds = receipts
    .map((row) => String(row.id || '').trim())
    .filter(Boolean);
  const listed: ExternalChargeRecord[] = [];
  for (const provider of listRegisteredExternalChargeProviders()) {
    const rows = await provider.listChargesForReceipts(admin, {
      companyId,
      saleId,
      receiptIds,
    });
    listed.push(...rows);
  }

  const customer = customerRes.data as Record<string, unknown> | null;
  const project = projectRes.data as Record<string, unknown> | null;

  return {
    mutation: false,
    persistTransfer: false,
    persistSale: false,
    persistLot: false,
    persistContract: false,
    persistReceipts: false,
    persistCharges: false,
    remoteApiCalled: false,
    cancelCharges: false,
    generateCharges: false,
    notice: TITLE_TRANSFER_PREVIEW_NOTICE,
    current: {
      saleId,
      saleStatus: text(sale.status),
      companyId,
      titular: {
        id: customerId,
        name: text(customer?.name),
        document: text(customer?.cpf_cnpj) || text(customer?.document),
      },
      property: {
        projectId,
        projectName: text(project?.name),
        blockId,
        quadra: text(block.block_name) || text(block.name),
        lote: text(block.number) || text(block.lot_number),
        status: text(block.status),
      },
      salePrice,
      contract: currentContract,
      contracts,
      finance,
    },
    externalCharges: classifyExternalCharges(listed, receipts),
    history: {
      isOriginalHolder: chain.length === 0,
      notice: chain.length
        ? titleTransferHistoryNotice(chain)
        : TITLE_TRANSFER_ORIGINAL_HOLDER_NOTICE,
      chain,
    },
  };
}

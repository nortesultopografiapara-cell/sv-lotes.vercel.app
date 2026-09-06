/**
 * Fase 5A — classificação de cobranças externas na Troca de lote.
 *
 * Sem cancelamento remoto. Sem geração remota. Sem ReleaseLot.
 * Sem alterar a RPC/execução da Fase 4.
 *
 * Estratégia compensatória (documentada para a 5B, não executada aqui):
 * Postgres e APIs bancárias não são atômicos. Não fingir rollback remoto.
 * Ordem segura futura:
 *   PREPARED   — classificar (esta fase) e congelar snapshot
 *   CANCELLING — cancelar cobranças abertas das parcelas que serão CANCEL
 *                Falha remota → FAILED e NÃO executar a mutação financeira
 *   CANCELED   — remoto ok; aí sim efetivar a Fase 4 já homologada
 *   GENERATING — gerar faltantes nas novas parcelas, com idempotência do provider
 *   COMPLETED  — geração ok
 *   FAILED     — persistir erro; retry não cancela duas vezes nem duplica boleto/Pix
 * Cobrança paga jamais entra em cancelamento. Pagamento histórico permanece
 * na mesma sale_id. Sem restituição.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveFinancialAccountForSaleOptional } from '@/lib/finance/companyFinancialAccountResolver';
import {
  ensureExternalChargeProvidersRegistered,
  getExternalChargeProvider,
  getRegisteredExternalChargeProvider,
  listRegisteredExternalChargeProviders,
} from '@/lib/finance/externalCharges';
import type {
  ExternalChargeProvider,
  ExternalChargeRecord,
} from '@/lib/finance/externalCharges/types';
import { normalizeExternalChargeProviderCode } from '@/lib/finance/externalCharges/types';
import type { LotSwapFinancialPlan } from '@/lib/finance/saleLotSwapPlan';

export const LOT_SWAP_EXTERNAL_CHARGES_PHASE = '5A' as const;
export const LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE =
  'LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE';
export const LOT_SWAP_EXTERNAL_CHARGES_NOTICE =
  'Fase 5A: classificação local das cobranças externas. Nenhuma API bancária é chamada. Cancelamento e geração ficam para a Fase 5B.';

export type LotSwapExternalChargePhase5Status = 'PREPARED' | 'BLOCKED';

export type LotSwapChargeGenerationItem = {
  receiptId: string | null;
  installmentNumber: number | null;
  provider: string;
  reason: 'missing' | 'already_exists' | 'paid' | 'unsupported_provider';
};

export type LotSwapExternalChargePreview = {
  mutation: false;
  persistCharges: false;
  remoteApiCalled: false;
  phase: typeof LOT_SWAP_EXTERNAL_CHARGES_PHASE;
  phase5Status: LotSwapExternalChargePhase5Status;
  activeProvider: string | null;
  activeProviderImplemented: boolean;
  supportsCancellation: boolean;
  supportsGeneration: boolean;
  charges: ExternalChargeRecord[];
  paid: ExternalChargeRecord[];
  cancelable: ExternalChargeRecord[];
  nonCancelable: ExternalChargeRecord[];
  wouldCancel: ExternalChargeRecord[];
  wouldPreservePaid: ExternalChargeRecord[];
  wouldGenerate: LotSwapChargeGenerationItem[];
  wouldSkipGenerate: LotSwapChargeGenerationItem[];
  wouldBlock: boolean;
  blockCode: string | null;
  blockMessage: string | null;
  notice: string;
};

function text(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

function uniqueRecords(rows: ExternalChargeRecord[]): ExternalChargeRecord[] {
  const byId = new Map<string, ExternalChargeRecord>();
  for (const row of rows) {
    byId.set(`${row.provider}:${row.chargeId}`, row);
  }
  return [...byId.values()];
}

export function classifyLotSwapExternalCharges(input: {
  charges: ExternalChargeRecord[];
  cancelReceiptIds?: string[];
  preserveReceiptIds?: string[];
  createReceiptIds?: Array<string | null>;
  createCount?: number;
  activeProvider?: string | null;
  provider?: ExternalChargeProvider | null;
}): Omit<
  LotSwapExternalChargePreview,
  'mutation' | 'persistCharges' | 'remoteApiCalled' | 'phase' | 'notice'
> {
  const provider = input.provider || null;
  const activeProvider = text(input.activeProvider) || provider?.code || null;
  const implemented = Boolean(
    activeProvider && getRegisteredExternalChargeProvider(activeProvider),
  );
  const supportsCancellation = Boolean(provider?.supportsCancellation);
  const supportsGeneration = Boolean(provider?.supportsGeneration);
  const cancelSet = new Set((input.cancelReceiptIds || []).map((id) => String(id)));
  const preserveSet = new Set((input.preserveReceiptIds || []).map((id) => String(id)));
  const charges = uniqueRecords(input.charges || []);
  const paid = charges.filter((row) => row.classification === 'paid');
  const cancelable = charges.filter((row) => row.classification === 'cancelable');
  const nonCancelable = charges.filter((row) => row.classification === 'non_cancelable');

  const wouldPreservePaid = paid.filter((row) => {
    const receiptId = row.receiptId || '';
    return preserveSet.has(receiptId) || cancelSet.has(receiptId) || !receiptId;
  });
  const wouldCancel = cancelable.filter((row) => {
    if (row.classification === 'paid') return false;
    if (!row.receiptId) return cancelSet.size > 0;
    return cancelSet.has(row.receiptId);
  });
  const blocking = nonCancelable.filter((row) => {
    if (!row.receiptId) return true;
    if (preserveSet.has(row.receiptId) && !cancelSet.has(row.receiptId)) return false;
    if (cancelSet.size === 0) return true;
    return cancelSet.has(row.receiptId);
  });

  const existingByReceipt = new Map<string, ExternalChargeRecord[]>();
  for (const row of charges) {
    if (!row.receiptId) continue;
    const list = existingByReceipt.get(row.receiptId) || [];
    list.push(row);
    existingByReceipt.set(row.receiptId, list);
  }

  const wouldGenerate: LotSwapChargeGenerationItem[] = [];
  const wouldSkipGenerate: LotSwapChargeGenerationItem[] = [];
  const createIds = (input.createReceiptIds || []).filter((id) => id);
  if (!supportsGeneration) {
    const count = createIds.length || Math.max(0, input.createCount || 0);
    if (count > 0 && activeProvider) {
      wouldSkipGenerate.push({
        receiptId: createIds[0] ? String(createIds[0]) : null,
        installmentNumber: null,
        provider: activeProvider,
        reason: 'unsupported_provider',
      });
    }
  } else {
    const targets =
      createIds.length > 0
        ? createIds.map((id) => String(id))
        : Array.from({ length: Math.max(0, input.createCount || 0) }, (_, i) => `planned:${i}`);
    for (const receiptId of targets) {
      const existing = existingByReceipt.get(receiptId) || [];
      const paidExisting = existing.find((row) => row.classification === 'paid');
      const activeExisting = existing.find(
        (row) => row.classification === 'cancelable' || row.classification === 'paid',
      );
      if (paidExisting) {
        wouldSkipGenerate.push({
          receiptId: receiptId.startsWith('planned:') ? null : receiptId,
          installmentNumber: null,
          provider: activeProvider || '',
          reason: 'paid',
        });
        continue;
      }
      if (activeExisting) {
        wouldSkipGenerate.push({
          receiptId: receiptId.startsWith('planned:') ? null : receiptId,
          installmentNumber: null,
          provider: activeProvider || '',
          reason: 'already_exists',
        });
        continue;
      }
      wouldGenerate.push({
        receiptId: receiptId.startsWith('planned:') ? null : receiptId,
        installmentNumber: null,
        provider: activeProvider || '',
        reason: 'missing',
      });
    }
  }

  const unimplementedBlocks = Boolean(activeProvider && !implemented && (input.createCount || 0) > 0);
  const wouldBlock = blocking.length > 0 || unimplementedBlocks;
  return {
    phase5Status: wouldBlock ? 'BLOCKED' : 'PREPARED',
    activeProvider,
    activeProviderImplemented: implemented,
    supportsCancellation,
    supportsGeneration,
    charges,
    paid,
    cancelable,
    nonCancelable,
    wouldCancel,
    wouldPreservePaid,
    wouldGenerate,
    wouldSkipGenerate,
    wouldBlock,
    blockCode: wouldBlock ? LOT_SWAP_EXTERNAL_CHARGES_NON_CANCELABLE : null,
    blockMessage: wouldBlock
      ? 'Há cobrança externa incompatível (não cancelável ou provider ainda não implementado). A Fase 4 permanece intacta; a Fase 5B não deve cancelar nem gerar até revisão.'
      : null,
  };
}

export function buildLotSwapExternalChargePreviewFromPlan(
  plan: LotSwapFinancialPlan,
  charges: ExternalChargeRecord[],
  active?: {
    provider: ExternalChargeProvider | null;
    code: string | null;
  },
): LotSwapExternalChargePreview {
  const classified = classifyLotSwapExternalCharges({
    charges,
    cancelReceiptIds: plan.receipts.cancel
      .map((item) => item.receiptId)
      .filter((id): id is string => Boolean(id)),
    preserveReceiptIds: plan.receipts.preserve
      .map((item) => item.receiptId)
      .filter((id): id is string => Boolean(id)),
    createReceiptIds: plan.receipts.create.map((item) => item.receiptId),
    createCount: plan.receipts.create.length,
    activeProvider: active?.code || active?.provider?.code || null,
    provider: active?.provider || null,
  });
  return {
    mutation: false,
    persistCharges: false,
    remoteApiCalled: false,
    phase: LOT_SWAP_EXTERNAL_CHARGES_PHASE,
    notice: LOT_SWAP_EXTERNAL_CHARGES_NOTICE,
    ...classified,
  };
}

async function discoverUnknownBankProviders(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<string[]> {
  const query = await admin
    .from('bank_charges')
    .select('provider')
    .eq('company_id', companyId)
    .eq('sale_id', saleId);
  if (query.error) return [];
  const known = new Set(
    listRegisteredExternalChargeProviders().map((provider) => provider.code),
  );
  const extra = new Set<string>();
  for (const row of (query.data || []) as Array<{ provider?: string | null }>) {
    const code = normalizeExternalChargeProviderCode(row.provider);
    if (code && !known.has(code)) extra.add(code);
  }
  return [...extra];
}

export async function resolveLotSwapActiveExternalChargeProvider(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<{ code: string | null; provider: ExternalChargeProvider | null }> {
  ensureExternalChargeProvidersRegistered();
  const { data: sale, error } = await admin
    .from('sales')
    .select(
      `
      id,
      company_id,
      tenant_id,
      financial_account_id,
      project_id,
      projects:project_id ( financial_account_id )
    `,
    )
    .eq('id', saleId)
    .maybeSingle();
  if (error) {
    return { code: null, provider: null };
  }
  if (sale) {
    const saleCompany = String(sale.company_id || sale.tenant_id || '');
    if (saleCompany && saleCompany !== companyId) {
      return { code: null, provider: null };
    }
  }
  const project = sale?.projects as { financial_account_id?: string | null } | null;
  const resolved = await resolveFinancialAccountForSaleOptional(admin, companyId, {
    financialAccountId: sale?.financial_account_id
      ? String(sale.financial_account_id)
      : null,
    projectId: sale?.project_id ? String(sale.project_id) : null,
    projectFinancialAccountId: project?.financial_account_id
      ? String(project.financial_account_id)
      : null,
  });
  const account = resolved?.account || null;
  if (!account?.bankIntegrationId) {
    const asaas = getExternalChargeProvider('ASAAS');
    return { code: asaas.code, provider: asaas };
  }
  const integration = await admin
    .from('bank_integrations')
    .select('id, provider')
    .eq('id', account.bankIntegrationId)
    .eq('company_id', companyId)
    .maybeSingle();
  const raw = String(integration.data?.provider || account.provider || '').trim();
  const code = normalizeExternalChargeProviderCode(raw);
  if (!code) {
    const asaas = getExternalChargeProvider('ASAAS');
    return { code: asaas.code, provider: asaas };
  }
  return { code, provider: getExternalChargeProvider(code) };
}

export async function loadLotSwapExternalChargePreview(
  admin: SupabaseClient,
  input: {
    companyId: string;
    saleId: string;
    plan?: LotSwapFinancialPlan | null;
  },
): Promise<LotSwapExternalChargePreview> {
  ensureExternalChargeProvidersRegistered();
  const companyId = String(input.companyId || '').trim();
  const saleId = String(input.saleId || '').trim();
  const fallbackPlan = input.plan || ({
    receipts: { preserve: [], cancel: [], create: [], ignoredCanceled: 0 },
  } as LotSwapFinancialPlan);
  const emptyPlanPreview = buildLotSwapExternalChargePreviewFromPlan(
    fallbackPlan,
    [],
    { code: null, provider: null },
  );
  if (!companyId || !saleId) return emptyPlanPreview;

  const receiptIds = [
    ...((input.plan?.receipts.preserve || []).map((item) => item.receiptId)),
    ...((input.plan?.receipts.cancel || []).map((item) => item.receiptId)),
    ...((input.plan?.receipts.create || []).map((item) => item.receiptId)),
  ].filter((id): id is string => Boolean(id));

  const listed: ExternalChargeRecord[] = [];
  for (const provider of listRegisteredExternalChargeProviders()) {
    const rows = await provider.listChargesForReceipts(admin, {
      companyId,
      saleId,
      receiptIds,
    });
    listed.push(...rows);
  }
  const unknown = await discoverUnknownBankProviders(admin, companyId, saleId);
  for (const code of unknown) {
    const extra = getExternalChargeProvider(code);
    const rows = await extra.listChargesForReceipts(admin, {
      companyId,
      saleId,
      receiptIds,
    });
    listed.push(...rows);
  }

  const active = await resolveLotSwapActiveExternalChargeProvider(
    admin,
    companyId,
    saleId,
  );
  return buildLotSwapExternalChargePreviewFromPlan(fallbackPlan, listed, active);
}

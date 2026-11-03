/**
 * Cobrança em massa via WhatsApp — persistência e envio sequencial.
 * Reutiliza sendText do provider Z-API sem alterar callers SaaS/OTP.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCompanyDisplayName } from '@/lib/contractCompanyDisplay';
import {
  buildChargeWhatsAppBatchPreview,
  CHARGE_WHATSAPP_BATCH_CHANNEL,
  CHARGE_WHATSAPP_BATCH_MAX_CUSTOMERS,
  CHARGE_WHATSAPP_BATCH_SEND_GAP_MS,
  CHARGE_WHATSAPP_BATCH_TEMPLATE_KEY,
  mapReceiptRowToBatchParcel,
  parseChargeWhatsAppInstallmentIds,
  pickExistingChargeForWhatsApp,
  receiptBelongsToTenant,
  resolveBatchStatusFromCounts,
  resolveChargeWhatsAppBatchPortalUrl,
  filterChargeWhatsAppItemsForDispatch,
  selectFailedItemsForRetry,
  shouldReplayExistingBatch,
  type ChargeWhatsAppBatchPreview,
  type ChargeWhatsAppCustomerGroup,
} from '@/lib/charges/chargeWhatsAppBatch';
import type { FinanceReceiptRow } from '@/lib/charges/chargeInstallmentHelpers';
import { listCompanyAsaasChargesForInstallments } from '@/lib/finance/companyAsaasChargeRepository';
import {
  bankChargeToSummaryLike,
  listInterChargesForInstallments,
} from '@/lib/banking/inter/interSaleChargeService';
import { FINANCE_RECEIPTS_LIST_SELECT, FINANCE_RECEIPTS_LIST_SELECT_FALLBACK } from '@/lib/finance/financeReceiptsEmbed';
import { tenantOrClause } from '@/lib/rls';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import { isZapiConfigured, sendText } from '@/lib/whatsapp/zapiProvider';

const RECEIPT_ID_CHUNK = 80;

export type ChargeWhatsAppSendFn = typeof sendText;

export type ChargeWhatsAppBatchItemResult = {
  id: string | null;
  customerId: string;
  customerName: string;
  phone: string | null;
  status: 'queued' | 'sent' | 'skipped' | 'failed';
  skipReason: string | null;
  error: string | null;
  providerMessageId: string | null;
  financeReceiptIds: string[];
  message: string | null;
};

export type ChargeWhatsAppBatchResult = {
  action: 'preview' | 'send' | 'retry';
  replayed: boolean;
  batchId: string | null;
  status: string;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  preview: ChargeWhatsAppBatchPreview;
  items: ChargeWhatsAppBatchItemResult[];
};

function chunkIds(ids: string[], size = RECEIPT_ID_CHUNK): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asUuid(value: string | null | undefined): string | null {
  const id = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function asUuidArray(values: string[]): string[] {
  return values.map((value) => asUuid(value)).filter((value): value is string => Boolean(value));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

async function loadLoteadoraName(admin: SupabaseClient, tenantId: string): Promise<string> {
  const { data } = await admin
    .from('companies')
    .select('name, fantasy_name')
    .eq('id', tenantId)
    .maybeSingle();
  const name = getCompanyDisplayName((data as Record<string, unknown> | null) || {});
  return name && name !== 'Não Informado' ? name : 'a empresa responsável pelo empreendimento';
}

async function loadTenantReceipts(
  admin: SupabaseClient,
  tenantId: string,
  installmentIds: string[],
): Promise<FinanceReceiptRow[]> {
  const rows: FinanceReceiptRow[] = [];
  for (const chunk of chunkIds(installmentIds)) {
    const { data, error } = await admin
      .from('finance_receipts')
      .select(FINANCE_RECEIPTS_LIST_SELECT)
      .in('id', chunk)
      .or(tenantOrClause(tenantId));
    let rowsChunk = data;
    let chunkError = error;
    if (chunkError) {
      const fallback = await admin
        .from('finance_receipts')
        .select(FINANCE_RECEIPTS_LIST_SELECT_FALLBACK)
        .in('id', chunk)
        .or(tenantOrClause(tenantId));
      rowsChunk = fallback.data;
      chunkError = fallback.error;
    }
    if (chunkError) throw new Error(chunkError.message);
    for (const row of rowsChunk || []) {
      const typed = row as FinanceReceiptRow;
      if (!receiptBelongsToTenant(typed, tenantId)) continue;
      rows.push(typed);
    }
  }
  return rows;
}

async function loadChargesForInstallments(
  admin: SupabaseClient,
  tenantId: string,
  installmentIds: string[],
): Promise<{
  asaas: Record<string, CompanyAsaasChargeResponse>;
  inter: Record<string, CompanyAsaasChargeResponse>;
}> {
  const asaas: Record<string, CompanyAsaasChargeResponse> = {};
  const inter: Record<string, CompanyAsaasChargeResponse> = {};
  if (installmentIds.length === 0) return { asaas, inter };

  const asaasList = await listCompanyAsaasChargesForInstallments(admin, tenantId, installmentIds);
  for (const charge of asaasList) {
    asaas[charge.installmentId] = charge;
  }

  const interMap = await listInterChargesForInstallments(admin, tenantId, installmentIds);
  for (const [installmentId, row] of interMap.entries()) {
    inter[installmentId] = bankChargeToSummaryLike(row, tenantId);
  }
  return { asaas, inter };
}

export async function buildTenantChargeWhatsAppPreview(
  admin: SupabaseClient,
  input: { tenantId: string; installmentIds: unknown },
): Promise<ChargeWhatsAppBatchPreview> {
  const installmentIds = parseChargeWhatsAppInstallmentIds(input.installmentIds);
  const [receipts, loteadoraName] = await Promise.all([
    loadTenantReceipts(admin, input.tenantId, installmentIds),
    loadLoteadoraName(admin, input.tenantId),
  ]);
  const loadedIds = receipts.map((row) => String(row.id));
  const charges = await loadChargesForInstallments(admin, input.tenantId, loadedIds);
  const parcels = receipts.map((row) => {
    const id = String(row.id);
    return mapReceiptRowToBatchParcel(
      row,
      pickExistingChargeForWhatsApp(id, charges.asaas, charges.inter),
    );
  });

  return buildChargeWhatsAppBatchPreview({
    requestedIds: installmentIds,
    loadedParcels: parcels,
    tenantId: input.tenantId,
    loteadoraName,
    zapiConfigured: isZapiConfigured(),
    portalUrl: resolveChargeWhatsAppBatchPortalUrl(),
  });
}

function previewToItemResults(preview: ChargeWhatsAppBatchPreview): ChargeWhatsAppBatchItemResult[] {
  return preview.customers.map((group) => ({
    id: null,
    customerId: group.customerId,
    customerName: group.customerName,
    phone: group.normalizedPhone || group.phone,
    status: group.sendable ? 'queued' : 'skipped',
    skipReason: group.skipReason,
    error: group.sendable ? null : group.skipReason,
    providerMessageId: null,
    financeReceiptIds: group.sendable
      ? group.financeReceiptIds
      : group.skippedParcels.map((p) => p.installmentId),
    message: group.message,
  }));
}

type BatchRow = {
  id: string;
  status: string;
  customer_count: number | null;
  installment_count: number | null;
  total_amount: number | null;
};

type ItemRow = {
  id: string;
  customer_id: string | null;
  phone: string | null;
  finance_receipt_ids: string[] | null;
  charge_ids: string[] | null;
  message_body: string | null;
  status: string;
  skip_reason: string | null;
  error_message: string | null;
  provider_message_id: string | null;
};

async function loadBatchWithItems(
  admin: SupabaseClient,
  companyId: string,
  batchId: string,
): Promise<{ batch: BatchRow; items: ItemRow[] } | null> {
  const { data: batch, error } = await admin
    .from('company_collection_whatsapp_batches')
    .select('id, status, customer_count, installment_count, total_amount')
    .eq('company_id', companyId)
    .eq('id', batchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!batch) return null;
  const { data: items, error: itemsError } = await admin
    .from('company_collection_whatsapp_items')
    .select(
      'id, customer_id, phone, finance_receipt_ids, charge_ids, message_body, status, skip_reason, error_message, provider_message_id',
    )
    .eq('company_id', companyId)
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });
  if (itemsError) throw new Error(itemsError.message);
  return { batch: batch as BatchRow, items: (items || []) as ItemRow[] };
}

async function findBatchByIdempotency(
  admin: SupabaseClient,
  companyId: string,
  idempotencyKey: string,
): Promise<BatchRow | null> {
  const { data, error } = await admin
    .from('company_collection_whatsapp_batches')
    .select('id, status, customer_count, installment_count, total_amount')
    .eq('company_id', companyId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BatchRow | null) || null;
}

function itemRowsToResults(
  items: ItemRow[],
  previewCustomers: ChargeWhatsAppCustomerGroup[],
): ChargeWhatsAppBatchItemResult[] {
  const names = new Map(previewCustomers.map((g) => [g.customerId, g.customerName]));
  return items.map((item) => ({
    id: item.id,
    customerId: item.customer_id || '',
    customerName: names.get(item.customer_id || '') || item.customer_id || 'Cliente',
    phone: item.phone,
    status: item.status as ChargeWhatsAppBatchItemResult['status'],
    skipReason: item.skip_reason,
    error: item.error_message,
    providerMessageId: item.provider_message_id,
    financeReceiptIds: asStringArray(item.finance_receipt_ids),
    message: item.message_body,
  }));
}

function countsFromItems(items: Array<{ status: string }>): {
  sent: number;
  failed: number;
  skipped: number;
} {
  return {
    sent: items.filter((i) => i.status === 'sent').length,
    failed: items.filter((i) => i.status === 'failed').length,
    skipped: items.filter((i) => i.status === 'skipped').length,
  };
}

async function insertBatchAndItems(input: {
  admin: SupabaseClient;
  tenantId: string;
  userId: string;
  idempotencyKey: string;
  preview: ChargeWhatsAppBatchPreview;
}): Promise<{ batchId: string; replayed: boolean; items: ItemRow[] }> {
  const { admin, tenantId, userId, idempotencyKey, preview } = input;
  const ready = preview.customers.filter((g) => g.sendable);
  const skipped = preview.customers.filter((g) => !g.sendable);

  const { data, error } = await admin
    .from('company_collection_whatsapp_batches')
    .insert({
      company_id: tenantId,
      created_by: userId,
      channel: CHARGE_WHATSAPP_BATCH_CHANNEL,
      status: 'sending',
      customer_count: preview.customerCount,
      installment_count: preview.installmentCount,
      ready_customer_count: ready.length,
      total_amount: preview.selectedAmount,
      idempotency_key: idempotencyKey,
      metadata: {
        readyAmount: preview.readyAmount,
        loteadoraName: preview.loteadoraName,
      },
    })
    .select('id, status, customer_count, installment_count, total_amount')
    .maybeSingle();

  if (error) {
    if (String(error.code) === '23505' || /duplicate|unique/i.test(error.message || '')) {
      const existing = await findBatchByIdempotency(admin, tenantId, idempotencyKey);
      if (existing && shouldReplayExistingBatch(existing.status)) {
        const loaded = await loadBatchWithItems(admin, tenantId, existing.id);
        return {
          batchId: existing.id,
          replayed: true,
          items: loaded?.items || [],
        };
      }
    }
    throw new Error(error.message);
  }

  if (!data?.id) throw new Error('Falha ao criar lote de WhatsApp.');

  const asCustomerId = (value: string | null | undefined): string | null => asUuid(value);

  const rows = [
    ...ready.map((group) => ({
      batch_id: data.id,
      company_id: tenantId,
      customer_id: asCustomerId(group.customerId),
      phone: group.normalizedPhone,
      finance_receipt_ids: asUuidArray(group.financeReceiptIds),
      charge_ids: asUuidArray(group.chargeIds),
      message_body: group.message,
      template_key: CHARGE_WHATSAPP_BATCH_TEMPLATE_KEY,
      status: 'queued',
      skip_reason: null,
    })),
    ...skipped.map((group) => ({
      batch_id: data.id,
      company_id: tenantId,
      customer_id: asCustomerId(group.customerId),
      phone: group.normalizedPhone || group.phone,
      finance_receipt_ids: asUuidArray(group.skippedParcels.map((p) => p.installmentId)),
      charge_ids: [],
      message_body: group.message,
      template_key: CHARGE_WHATSAPP_BATCH_TEMPLATE_KEY,
      status: 'skipped',
      skip_reason: group.skipReason,
    })),
  ];

  if (rows.length) {
    const { error: itemError } = await admin.from('company_collection_whatsapp_items').insert(rows);
    if (itemError) throw new Error(itemError.message);
  }

  const loaded = await loadBatchWithItems(admin, tenantId, data.id);
  return { batchId: data.id, replayed: false, items: loaded?.items || [] };
}

async function sendQueuedItems(input: {
  admin: SupabaseClient;
  tenantId: string;
  items: ItemRow[];
  sendFn: ChargeWhatsAppSendFn;
  gapMs?: number;
}): Promise<ItemRow[]> {
  const gap = input.gapMs ?? CHARGE_WHATSAPP_BATCH_SEND_GAP_MS;
  const updated: ItemRow[] = [];
  const queued = filterChargeWhatsAppItemsForDispatch(input.items);

  for (let index = 0; index < queued.length; index += 1) {
    const item = queued[index];
    if (item.status === 'sent') {
      updated.push(item);
      continue;
    }
    const phone = String(item.phone || '').trim();
    const message = String(item.message_body || '').trim();
    if (!phone || !message) {
      const patch = {
        status: 'failed',
        error_message: 'Telefone ou mensagem ausente no envio.',
        provider_message_id: null,
      };
      await input.admin
        .from('company_collection_whatsapp_items')
        .update(patch)
        .eq('id', item.id)
        .eq('company_id', input.tenantId)
        .neq('status', 'sent');
      updated.push({ ...item, ...patch });
      continue;
    }

    const result = await input.sendFn({ phone, message });
    const patch = result.ok
      ? {
          status: 'sent',
          error_message: null,
          provider_message_id: result.messageId ?? null,
          sent_at: new Date().toISOString(),
        }
      : {
          status: 'failed',
          error_message: result.error || 'Falha ao enviar WhatsApp.',
          provider_message_id: null,
        };

    await input.admin
      .from('company_collection_whatsapp_items')
      .update(patch)
      .eq('id', item.id)
      .eq('company_id', input.tenantId)
      .neq('status', 'sent');

    updated.push({
      ...item,
      status: patch.status,
      error_message: patch.error_message,
      provider_message_id: patch.provider_message_id,
    });

    if (index < queued.length - 1 && gap > 0) {
      await sleep(gap);
    }
  }

  const byId = new Map(updated.map((item) => [item.id, item]));
  return input.items.map((item) => byId.get(item.id) || item);
}

export async function sendChargeWhatsAppBatch(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    userId: string;
    installmentIds: unknown;
    idempotencyKey: string;
    sendFn?: ChargeWhatsAppSendFn;
  },
): Promise<ChargeWhatsAppBatchResult> {
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (!idempotencyKey) {
    throw new Error('idempotency_key é obrigatória para o envio.');
  }

  const preview = await buildTenantChargeWhatsAppPreview(admin, {
    tenantId: input.tenantId,
    installmentIds: input.installmentIds,
  });

  if (preview.sendBlockedReason) {
    return {
      action: 'send',
      replayed: false,
      batchId: null,
      status: 'blocked',
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: preview.skippedInstallmentCount,
      preview,
      items: previewToItemResults(preview),
    };
  }

  const existing = await findBatchByIdempotency(admin, input.tenantId, idempotencyKey);
  if (existing && shouldReplayExistingBatch(existing.status)) {
    const loaded = await loadBatchWithItems(admin, input.tenantId, existing.id);
    const items = loaded?.items || [];
    const counts = countsFromItems(items);
    return {
      action: 'send',
      replayed: true,
      batchId: existing.id,
      status: existing.status,
      processed: items.filter((i) => i.status === 'sent' || i.status === 'failed').length,
      ...counts,
      preview,
      items: itemRowsToResults(items, preview.customers),
    };
  }

  const created = await insertBatchAndItems({
    admin,
    tenantId: input.tenantId,
    userId: input.userId,
    idempotencyKey,
    preview,
  });

  if (created.replayed) {
    const counts = countsFromItems(created.items);
    return {
      action: 'send',
      replayed: true,
      batchId: created.batchId,
      status: 'sent',
      processed: created.items.filter((i) => i.status === 'sent' || i.status === 'failed').length,
      ...counts,
      preview,
      items: itemRowsToResults(created.items, preview.customers),
    };
  }

  const sendFn = input.sendFn || sendText;
  const sentItems = await sendQueuedItems({
    admin,
    tenantId: input.tenantId,
    items: created.items,
    sendFn,
  });
  const counts = countsFromItems(sentItems);
  const status = resolveBatchStatusFromCounts(counts);
  await admin
    .from('company_collection_whatsapp_batches')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', created.batchId)
    .eq('company_id', input.tenantId);

  return {
    action: 'send',
    replayed: false,
    batchId: created.batchId,
    status,
    processed: counts.sent + counts.failed,
    ...counts,
    preview,
    items: itemRowsToResults(sentItems, preview.customers),
  };
}

export async function retryFailedChargeWhatsAppBatch(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    userId: string;
    batchId: string;
    sendFn?: ChargeWhatsAppSendFn;
  },
): Promise<ChargeWhatsAppBatchResult> {
  const batchId = String(input.batchId || '').trim();
  if (!batchId) throw new Error('batchId é obrigatório para reenviar falhas.');

  const loaded = await loadBatchWithItems(admin, input.tenantId, batchId);
  if (!loaded) throw new Error('Lote não encontrado nesta empresa.');

  const failed = selectFailedItemsForRetry(loaded.items);
  if (!failed.length) {
    const preview = await buildTenantChargeWhatsAppPreview(admin, {
      tenantId: input.tenantId,
      installmentIds: loaded.items.flatMap((item) => asStringArray(item.finance_receipt_ids)),
    });
    const counts = countsFromItems(loaded.items);
    return {
      action: 'retry',
      replayed: true,
      batchId,
      status: loaded.batch.status,
      processed: 0,
      ...counts,
      preview,
      items: itemRowsToResults(loaded.items, preview.customers),
    };
  }

  const installmentIds = failed.flatMap((item) => asStringArray(item.finance_receipt_ids));
  const preview = await buildTenantChargeWhatsAppPreview(admin, {
    tenantId: input.tenantId,
    installmentIds,
  });
  const sendableByCustomer = new Map(
    preview.customers.filter((g) => g.sendable).map((g) => [g.customerId, g]),
  );

  const stillFailed: ItemRow[] = [];
  for (const item of failed) {
    const group = sendableByCustomer.get(item.customer_id || '');
    if (!group?.message || !group.normalizedPhone) {
      const reason = group?.skipReason || 'no_payment_method';
      await admin
        .from('company_collection_whatsapp_items')
        .update({
          status: 'skipped',
          skip_reason: reason,
          error_message: 'Item não é mais elegível para reenvio.',
        })
        .eq('id', item.id)
        .eq('company_id', input.tenantId)
        .eq('status', 'failed');
      continue;
    }
    stillFailed.push({
      ...item,
      phone: group.normalizedPhone,
      message_body: group.message,
      finance_receipt_ids: group.financeReceiptIds,
      charge_ids: group.chargeIds,
      status: 'failed',
    });
  }

  const sendFn = input.sendFn || sendText;
  await sendQueuedItems({
    admin,
    tenantId: input.tenantId,
    items: stillFailed,
    sendFn,
  });

  const fresh = await loadBatchWithItems(admin, input.tenantId, batchId);
  const items = fresh?.items || loaded.items;
  const counts = countsFromItems(items);
  const status = resolveBatchStatusFromCounts(counts);
  await admin
    .from('company_collection_whatsapp_batches')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', batchId)
    .eq('company_id', input.tenantId);

  return {
    action: 'retry',
    replayed: false,
    batchId,
    status,
    processed: stillFailed.length,
    ...counts,
    preview,
    items: itemRowsToResults(items, preview.customers),
  };
}

export function assertChargeWhatsAppBatchCustomerCap(readyCustomerCount: number): string | null {
  if (readyCustomerCount > CHARGE_WHATSAPP_BATCH_MAX_CUSTOMERS) {
    return `Selecione no máximo ${CHARGE_WHATSAPP_BATCH_MAX_CUSTOMERS} clientes por lote (homologação).`;
  }
  return null;
}

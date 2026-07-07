/**
 * Cobranças SaaS (saas_charges) — PIX real via providers desacoplados.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getPaymentProvider, mapProviderStatusToChargeStatus } from '@/lib/payments/providers';
import { fetchAsaasPaymentPixData } from '@/lib/payments/providers/asaas';
import { assertSaasPaymentGatewayConfigured } from '@/lib/saasPaymentGateway';
import {
  currentReferenceMonth,
  generateInvoiceForCompany,
  markInvoicePaid,
  reactivateCompanyOnPayment,
  findExistingSaasPaymentForReference,
  findConfirmedSaasPaymentForReference,
  countPaidSaasPaymentsForReference,
  advanceSubscriptionAfterSaasPayment,
  reopenSaasInvoiceForNewCharge,
  syncPendingInvoiceAmountsFromPricing,
  type MasterSaasInvoice,
} from '@/lib/saasBilling';
import {
  assertSaasBoletoMinimumAmount,
  buildSaasPriceDiagnostic,
  validateCompanyDocumentForAsaas,
  resolveAsaasDueDate,
  resolveSaasChargeDueDate,
} from '@/lib/saasPixValidation';
import { isBillableCompany } from '@/lib/companyPricing';
import { todayIsoDate, toIsoDateOnly } from '@/lib/companySubscriptionDates';
import { updateCompanyFinancialStatus } from '@/lib/saasCompanyFinancialStatus';
import { logMasterApiStep } from '@/lib/masterApiPerfLog';
import { referenceMonthFromDate } from '@/lib/masterSaasPayments';
import type { SaasMasterBillingType } from '@/lib/saasMasterConfig';
import { SAAS_AUTO_SUSPEND_AFTER_DAYS } from '@/lib/saasMasterConfig';
import { resolveSaasLateFeePercents } from '@/lib/saasLateFeeConfig';
import { buildSaasChargeLateFeeDbPatch } from '@/lib/saasLateFees';
import type { CompanySubscription } from '@/lib/saasSubscription';
import type { CompanyPricingSource } from '@/lib/companyPricing';
import { ensureSaasCashIncomeForPaidCharge } from '@/lib/saasCashMovements';

export type SaasChargeStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export type SaasCharge = {
  id: string;
  company_id: string;
  subscription_id?: string | null;
  invoice_id?: string | null;
  master_payment_id?: string | null;
  amount: number;
  due_date: string;
  status: SaasChargeStatus;
  payment_provider: string;
  payment_id?: string | null;
  pix_qr_code?: string | null;
  pix_copy_paste?: string | null;
  payment_url?: string | null;
  billing_type?: SaasMasterBillingType;
  bank_slip_url?: string | null;
  invoice_url?: string | null;
  bank_slip_identification?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  delete_reason?: string | null;
  asaas_delete_status?: string | null;
  fine_percent?: number | null;
  interest_percent?: number | null;
  late_fee_enabled?: boolean | null;
  late_fee_configured_at?: string | null;
  company_name?: string;
  plan_label?: string;
};

export function mapSaasChargeRow(row: Record<string, unknown>): SaasCharge {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    subscription_id: row.subscription_id ? String(row.subscription_id) : null,
    invoice_id: row.invoice_id ? String(row.invoice_id) : null,
    master_payment_id: row.master_payment_id ? String(row.master_payment_id) : null,
    amount: Number(row.amount || 0),
    due_date: String(row.due_date || '').split('T')[0],
    status: String(row.status || 'PENDING').toUpperCase() as SaasChargeStatus,
    payment_provider: String(row.payment_provider || 'mock'),
    payment_id: row.payment_id ? String(row.payment_id) : null,
    pix_qr_code: row.pix_qr_code ? String(row.pix_qr_code) : null,
    pix_copy_paste: row.pix_copy_paste ? String(row.pix_copy_paste) : null,
    payment_url: row.payment_url ? String(row.payment_url) : null,
    billing_type: (String(row.billing_type || 'PIX').toUpperCase() === 'BOLETO'
      ? 'BOLETO'
      : 'PIX') as SaasMasterBillingType,
    bank_slip_url: row.bank_slip_url ? String(row.bank_slip_url) : null,
    invoice_url: row.invoice_url ? String(row.invoice_url) : null,
    bank_slip_identification: row.bank_slip_identification
      ? String(row.bank_slip_identification)
      : null,
    paid_at: row.paid_at ? String(row.paid_at) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    deleted_by: row.deleted_by ? String(row.deleted_by) : null,
    delete_reason: row.delete_reason ? String(row.delete_reason) : null,
    asaas_delete_status: row.asaas_delete_status ? String(row.asaas_delete_status) : null,
    fine_percent: row.fine_percent != null ? Number(row.fine_percent) : null,
    interest_percent: row.interest_percent != null ? Number(row.interest_percent) : null,
    late_fee_enabled: row.late_fee_enabled === true,
    late_fee_configured_at: row.late_fee_configured_at
      ? String(row.late_fee_configured_at)
      : null,
  };
}

export function isSaasChargeSoftDeleted(
  charge: Pick<SaasCharge, 'deleted_at'> | null | undefined,
): boolean {
  return !!String(charge?.deleted_at || '').trim();
}

export function canDeleteCancelledSaasCharge(status: string | null | undefined): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'CANCELLED' || key === 'CANCELADA' || key === 'CANCELED';
}

/** Cobrança visível como ativa (Fatura Atual / GERADA) — exclui órfãs e canceladas. */
export function isSaasChargeActiveForDisplay(
  charge: Pick<
    SaasCharge,
    | 'status'
    | 'deleted_at'
    | 'payment_id'
    | 'pix_copy_paste'
    | 'payment_url'
    | 'master_payment_id'
  > | null,
): boolean {
  if (!charge || isSaasChargeSoftDeleted(charge)) return false;
  const st = String(charge.status || '').toUpperCase();
  if (['CANCELLED', 'CANCELADA', 'CANCELED'].includes(st)) return false;
  if (st === 'PAID') return false;
  if (isOrphanSaasCharge(charge)) return false;
  return st === 'PENDING' || st === 'OVERDUE';
}

/** Linha de cobrança no painel — inclui cancelada aguardando exclusão. */
export function isSaasChargeSelectableForInvoiceRow(
  charge: Pick<
    SaasCharge,
    | 'status'
    | 'deleted_at'
    | 'payment_id'
    | 'pix_copy_paste'
    | 'payment_url'
    | 'master_payment_id'
  > | null,
): boolean {
  if (!charge || isSaasChargeSoftDeleted(charge)) return false;
  if (canDeleteCancelledSaasCharge(charge.status)) return true;
  return isSaasChargeActiveForDisplay(charge);
}

export function canSoftDeleteSaasCharge(
  charge: Pick<
    SaasCharge,
    | 'status'
    | 'deleted_at'
    | 'payment_id'
    | 'pix_copy_paste'
    | 'payment_url'
    | 'master_payment_id'
  >,
): boolean {
  if (isSaasChargeSoftDeleted(charge)) return false;
  if (canDeleteCancelledSaasCharge(charge.status)) return true;
  if (!isOrphanSaasCharge(charge)) return false;
  const st = String(charge.status || '').toUpperCase();
  return ['PENDING', 'OVERDUE', 'CANCELLED', 'CANCELADA', 'CANCELED'].includes(st);
}

export function assertCanDeleteCancelledSaasCharge(
  charge: Pick<
    SaasCharge,
    | 'status'
    | 'deleted_at'
    | 'payment_id'
    | 'pix_copy_paste'
    | 'payment_url'
    | 'master_payment_id'
  >,
): void {
  if (isSaasChargeSoftDeleted(charge)) {
    throw new Error('Cobrança já foi excluída.');
  }
  if (!canSoftDeleteSaasCharge(charge)) {
    throw new Error(
      'Somente cobranças canceladas ou órfãs sem vínculo Asaas podem ser excluídas. Cobranças ativas, vencidas ou pagas não podem ser removidas.',
    );
  }
}

export function saasChargeStatusLabel(status: SaasChargeStatus | string): string {
  const key = String(status || '').toUpperCase();
  if (key === 'PAID') return 'Pago';
  if (key === 'OVERDUE') return 'Vencido';
  if (key === 'CANCELLED') return 'Cancelado';
  return 'Pendente';
}

export async function listSaasCharges(
  supabaseAdmin: SupabaseClient,
  filters?: { companyId?: string; status?: string; limit?: number },
): Promise<SaasCharge[]> {
  const scope = 'listSaasCharges';
  const chargesStarted = performance.now();
  let query = supabaseAdmin
    .from('saas_charges')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 200);

  if (filters?.companyId) query = query.eq('company_id', filters.companyId);
  if (filters?.status) query = query.eq('status', filters.status.toUpperCase());

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  logMasterApiStep(scope, 'supabase.saas_charges.select', chargesStarted, data?.length ?? 0);

  const rows = (data || []).map((r) => mapSaasChargeRow(r as Record<string, unknown>));
  const companyIds = [...new Set(rows.map((r) => r.company_id))];
  const companiesStarted = performance.now();
  const { data: companies } = companyIds.length
    ? await supabaseAdmin.from('companies').select('id, name, plan, plan_type').in('id', companyIds)
    : { data: [] };
  logMasterApiStep(scope, 'supabase.companies.select', companiesStarted, companies?.length ?? 0);

  const enrichStarted = performance.now();
  const companyMap = Object.fromEntries(
    (companies || []).map((c) => [c.id, { name: c.name, plan: c.plan || c.plan_type }]),
  );

  const enriched = rows.map((row) => ({
    ...row,
    company_name: companyMap[row.company_id]?.name || '—',
    plan_label: companyMap[row.company_id]?.plan || '—',
  }));
  logMasterApiStep(scope, 'process.enrich_charges', enrichStarted, enriched.length);

  return enriched;
}

export async function markOverdueSaasCharges(
  supabaseAdmin: SupabaseClient,
  today = todayIsoDate(),
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('saas_charges')
    .update({ status: 'OVERDUE', updated_at: new Date().toISOString() })
    .eq('status', 'PENDING')
    .is('deleted_at', null)
    .not('payment_id', 'is', null)
    .lt('due_date', today)
    .select('id');

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export type CreateSaasPixChargeOptions = {
  referenceMonth?: string;
  dueDate?: string;
  notes?: string | null;
  actorUserId?: string | null;
  /** PIX (default) ou BOLETO — Asaas não combina ambos no mesmo payment. */
  billingType?: SaasMasterBillingType;
};

export type SaasPixChargeOutcome = 'created' | 'completed' | 'skipped';

export type SaasChargeSkipCode =
  | 'invoice_missing'
  | 'active_local_charge'
  | 'asaas_external_charge'
  | 'confirmed_manual_payment';

export type SaasChargeSkipDiagnostic = {
  reason: SaasChargeSkipCode;
  message: string;
  company_id: string;
  reference_month: string;
  invoice_id: string | null;
  external_charge_id: string | null;
  activeChargesCount: number;
  paidPaymentsCount: number;
  invoiceStatus: string | null;
  paymentMethod: string | null;
};

export type CreateSaasPixChargeResult = {
  charge: SaasCharge;
  invoice: MasterSaasInvoice | null;
  created: boolean;
  skipped?: string;
  skipCode?: SaasChargeSkipCode;
  skipDiagnostic?: SaasChargeSkipDiagnostic;
  outcome?: SaasPixChargeOutcome;
  invoiceCreated?: boolean;
};

export type ExternalChargeIdKind = 'empty' | 'mock' | 'pay_asaas' | 'legacy_uuid' | 'other';

export function classifyExternalChargeId(id: string | null | undefined): ExternalChargeIdKind {
  const value = String(id || '').trim();
  if (!value) return 'empty';
  if (value.startsWith('mock_')) return 'mock';
  if (value.startsWith('pay_')) return 'pay_asaas';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return 'legacy_uuid';
  }
  return 'other';
}

export type SaasChargeSkipInput = Pick<
  SaasCharge,
  'status' | 'payment_id' | 'pix_copy_paste' | 'payment_url' | 'master_payment_id' | 'deleted_at'
>;

/** Status local/Asaas que impede nova cobrança na mesma competência. */
export function isSaasChargeStatusBlockingDuplicate(
  status: string | null | undefined,
): boolean {
  const key = String(status || '').toUpperCase();
  if (['CANCELLED', 'CANCELED', 'CANCELADA', 'DELETED', 'REFUNDED'].includes(key)) {
    return false;
  }
  return ['PENDING', 'OVERDUE', 'PAID', 'RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(
    key,
  );
}

/** Cobrança cancelada/deletada não bloqueia nova emissão; ativa/paga sim. */
export function isSaasChargeBlockingDuplicate(
  charge: SaasChargeSkipInput | null,
): boolean {
  if (!charge) return false;
  if (String(charge.deleted_at || '').trim()) return false;
  if (isOrphanSaasCharge(charge)) return false;
  return isSaasChargeStatusBlockingDuplicate(charge.status);
}

export function isSaasInvoiceCancelled(
  invoice: Pick<MasterSaasInvoice, 'status'> | null | undefined,
): boolean {
  const key = String(invoice?.status || '').toUpperCase();
  return key === 'CANCELADO' || key === 'CANCELLED' || key === 'CANCELADA';
}

/** Cobrança com payment_id ou PIX/link válido no gateway. */
export function hasSaasChargeRealPixData(
  charge: Pick<SaasCharge, 'payment_id' | 'pix_copy_paste' | 'payment_url'> | null,
): boolean {
  if (!charge) return false;
  if (String(charge.payment_id || '').trim()) return true;
  if (String(charge.pix_copy_paste || '').trim()) return true;
  if (String(charge.payment_url || '').trim()) return true;
  return false;
}

/** Sem payment_id/PIX/link — órfã (inclui OVERDUE fantasma). */
export function isOrphanSaasCharge(charge: SaasChargeSkipInput | null): boolean {
  if (!charge) return false;
  if (hasSaasChargeRealPixData(charge)) return false;
  const status = String(charge.status || '').toUpperCase();
  if (status === 'PAID' && charge.master_payment_id) return false;
  return true;
}

/** Cobrança real/protegida — órfãs e canceladas/deletadas nunca bloqueiam nova emissão. */
export function isProtectedSaasCharge(charge: SaasChargeSkipInput | null): boolean {
  return isSaasChargeBlockingDuplicate(charge);
}

/** Bloqueio síncrono — apenas saas_charges ativa/em aberto/paga. */
export function resolveSaasPixChargeSkipReason(
  invoice: Pick<MasterSaasInvoice, 'external_charge_id' | 'status'>,
  existingCharge: SaasChargeSkipInput | null,
): string | null {
  void invoice;
  if (isProtectedSaasCharge(existingCharge)) {
    return 'Cobrança PIX já existe para esta fatura';
  }
  return null;
}

export type AsaasPaymentVerifyResult = 'blocking' | 'inactive' | 'missing';

export type AsaasPaymentVerifier = (paymentId: string) => Promise<AsaasPaymentVerifyResult>;

/** Consulta Asaas — missing quando pay_ não existe mais. */
export async function verifyAsaasPaymentBlockingState(
  paymentId: string,
  verifyAsaasPayment?: AsaasPaymentVerifier,
): Promise<AsaasPaymentVerifyResult> {
  try {
    const verify =
      verifyAsaasPayment ??
      (async (id: string): Promise<AsaasPaymentVerifyResult> => {
        const provider = getPaymentProvider();
        const remote = await provider.getChargeStatus(id);
        const mapped = mapProviderStatusToChargeStatus(remote.status);
        if (isSaasChargeStatusBlockingDuplicate(mapped)) return 'blocking';
        return 'inactive';
      });
    return await verify(paymentId);
  } catch {
    return 'missing';
  }
}

export function shouldReconcileSaasChargeFromAsaasVerify(
  result: AsaasPaymentVerifyResult,
): boolean {
  return result === 'missing' || result === 'inactive';
}

/** payment_id cancelado/deletado localmente — não bloqueia mesmo se Asaas ainda responder. */
export function isLocalAsaasPaymentInactive(
  paymentId: string,
  charges: SaasChargeSkipInput[],
): boolean {
  const pid = String(paymentId || '').trim();
  if (!pid) return false;
  const linked = charges.filter((c) => String(c.payment_id || '').trim() === pid);
  if (linked.length === 0) return false;
  return linked.every((c) => !isSaasChargeBlockingDuplicate(c));
}

/**
 * Sem cobrança ativa local — não bloquear por external_charge_id legado no Asaas.
 * Cobre fatura com pay_ antigo sem saas_charge correspondente (ex.: após cancelar/excluir).
 */
export function shouldIgnoreInvoiceExternalChargeForRegeneration(
  existingCharge: SaasChargeSkipInput | null,
  invoiceCharges: SaasChargeSkipInput[],
): boolean {
  if (existingCharge && isSaasChargeBlockingDuplicate(existingCharge)) return false;
  if (!invoiceCharges.length) return true;
  return invoiceCharges.every((c) => !isSaasChargeBlockingDuplicate(c));
}

export type ResolveSaasPixChargeSkipAsyncOptions = {
  /** Todas as cobranças da fatura (inclui soft-deleted) para auditoria local. */
  invoiceCharges?: SaasChargeSkipInput[];
};

/** Bloqueio completo — inclui external_charge_id pay_ ativo no Asaas. */
export async function resolveSaasPixChargeSkipReasonAsync(
  invoice: Pick<MasterSaasInvoice, 'external_charge_id' | 'status'>,
  existingCharge: SaasChargeSkipInput | null,
  verifyAsaasPayment?: AsaasPaymentVerifier,
  options?: ResolveSaasPixChargeSkipAsyncOptions,
): Promise<string | null> {
  const syncReason = resolveSaasPixChargeSkipReason(invoice, existingCharge);
  if (syncReason) return syncReason;

  if (isSaasInvoiceCancelled(invoice)) return null;

  const extId = String(invoice.external_charge_id || '').trim();
  if (!extId) return null;

  const kind = classifyExternalChargeId(extId);
  if (kind === 'mock' || kind === 'legacy_uuid' || kind === 'other') return null;

  if (options?.invoiceCharges?.length && isLocalAsaasPaymentInactive(extId, options.invoiceCharges)) {
    return null;
  }

  if (
    options?.invoiceCharges &&
    shouldIgnoreInvoiceExternalChargeForRegeneration(existingCharge, options.invoiceCharges)
  ) {
    return null;
  }

  if (kind === 'pay_asaas') {
    const result = await verifyAsaasPaymentBlockingState(extId, verifyAsaasPayment);
    if (result === 'blocking') {
      return 'Fatura já possui cobrança Asaas';
    }
  }

  return null;
}

/**
 * Antes de regenerar: órfãs → CANCELLED; pay_ ausente/inativo no Asaas → soft delete (auditoria).
 */
export async function reconcileSaasChargesBeforeRegeneration(
  supabaseAdmin: SupabaseClient,
  invoiceId: string,
  verifyAsaasPayment?: AsaasPaymentVerifier,
): Promise<void> {
  const { data: chargeRows } = await supabaseAdmin
    .from('saas_charges')
    .select('*')
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const now = new Date().toISOString();

  for (const row of chargeRows || []) {
    const parsed = mapSaasChargeRow(row as Record<string, unknown>);

    if (isOrphanSaasCharge(parsed)) {
      await supabaseAdmin
        .from('saas_charges')
        .update({ status: 'CANCELLED', updated_at: now })
        .eq('id', parsed.id);
      continue;
    }

    if (!isSaasChargeBlockingDuplicate(parsed)) continue;

    const paymentId = String(parsed.payment_id || '').trim();
    const paymentKind = paymentId ? classifyExternalChargeId(paymentId) : 'empty';

    if (!paymentId || paymentKind !== 'pay_asaas') {
      const statusKey = String(parsed.status || '').toUpperCase();
      if (['PENDING', 'OVERDUE'].includes(statusKey)) {
        await supabaseAdmin
          .from('saas_charges')
          .update({
            status: 'CANCELLED',
            deleted_at: now,
            delete_reason: paymentId
              ? 'stale_charge_without_asaas_payment_id'
              : 'stale_charge_missing_payment_id',
            asaas_delete_status: 'skipped',
            updated_at: now,
          })
          .eq('id', parsed.id)
          .is('deleted_at', null);
      }
      continue;
    }

    const asaasState = await verifyAsaasPaymentBlockingState(paymentId, verifyAsaasPayment);
    if (!shouldReconcileSaasChargeFromAsaasVerify(asaasState)) continue;

    await supabaseAdmin
      .from('saas_charges')
      .update({
        status: 'CANCELLED',
        deleted_at: now,
        delete_reason:
          asaasState === 'missing' ? 'asaas_payment_missing' : 'asaas_payment_inactive',
        asaas_delete_status: asaasState === 'missing' ? 'not_found' : 'inactive',
        updated_at: now,
      })
      .eq('id', parsed.id)
      .is('deleted_at', null);
  }
}

function logSaasChargeSkipDiagnostic(diag: SaasChargeSkipDiagnostic): void {
  console.warn('[saas-charge-skip]', JSON.stringify(diag));
}

function toSaasChargeSkipInput(ch: SaasCharge): SaasChargeSkipInput {
  return {
    status: ch.status,
    payment_id: ch.payment_id,
    pix_copy_paste: ch.pix_copy_paste,
    payment_url: ch.payment_url,
    master_payment_id: ch.master_payment_id,
    deleted_at: ch.deleted_at,
  };
}

async function loadSaasChargeRegenerationContext(
  supabaseAdmin: SupabaseClient,
  invoice: MasterSaasInvoice,
): Promise<{
  invoiceCharges: SaasChargeSkipInput[];
  activeCharges: SaasChargeSkipInput[];
  existingCharge: SaasChargeSkipInput | null;
}> {
  const { data: allChargeRows } = await supabaseAdmin
    .from('saas_charges')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('created_at', { ascending: false });

  const invoiceCharges = (allChargeRows || []).map((row) =>
    toSaasChargeSkipInput(mapSaasChargeRow(row as Record<string, unknown>)),
  );

  const { data: chargeRows } = await supabaseAdmin
    .from('saas_charges')
    .select('*')
    .eq('invoice_id', invoice.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const activeCharges = (chargeRows || [])
    .map((row) => toSaasChargeSkipInput(mapSaasChargeRow(row as Record<string, unknown>)))
    .filter((ch) => isSaasChargeBlockingDuplicate(ch));

  const existingCharge = activeCharges[0] ?? null;

  return { invoiceCharges, activeCharges, existingCharge };
}

async function reopenInvoiceWhenSafeForRegeneration(
  supabaseAdmin: SupabaseClient,
  invoice: MasterSaasInvoice,
  options?: { dueDate?: string },
): Promise<MasterSaasInvoice> {
  const { activeCharges } = await loadSaasChargeRegenerationContext(supabaseAdmin, invoice);
  if (activeCharges.length > 0) return invoice;

  const confirmedPayment = await findConfirmedSaasPaymentForReference(
    supabaseAdmin,
    invoice.company_id,
    invoice.reference_month,
    invoice.id,
  );
  if (confirmedPayment) return invoice;

  if (String(invoice.status || '').toUpperCase() === 'PAGO') return invoice;

  const requestedDue = options?.dueDate
    ? resolveSaasChargeDueDate(options.dueDate, invoice.due_date)
    : null;

  const invoiceStatus = String(invoice.status || '').toUpperCase();
  const needsReopen =
    invoiceStatus === 'CANCELADO' ||
    invoiceStatus === 'CANCELLED' ||
    invoiceStatus === 'CANCELADA' ||
    String(invoice.external_charge_id || '').trim() !== '';

  const needsDueDateUpdate = requestedDue != null && requestedDue !== invoice.due_date;

  if (!needsReopen && !needsDueDateUpdate) return invoice;

  return reopenSaasInvoiceForNewCharge(supabaseAdmin, invoice.id, {
    dueDate: requestedDue ?? undefined,
  });
}

async function buildSaasChargeSkipDiagnostic(
  supabaseAdmin: SupabaseClient,
  params: {
    reason: SaasChargeSkipCode;
    message: string;
    companyId: string;
    referenceMonth: string;
    invoice: MasterSaasInvoice | null;
    activeChargesCount: number;
  },
): Promise<SaasChargeSkipDiagnostic> {
  const paidPaymentsCount = await countPaidSaasPaymentsForReference(
    supabaseAdmin,
    params.companyId,
    params.referenceMonth,
  );

  return {
    reason: params.reason,
    message: params.message,
    company_id: params.companyId,
    reference_month: params.referenceMonth,
    invoice_id: params.invoice?.id ?? null,
    external_charge_id: params.invoice?.external_charge_id
      ? String(params.invoice.external_charge_id)
      : null,
    activeChargesCount: params.activeChargesCount,
    paidPaymentsCount,
    invoiceStatus: params.invoice?.status ? String(params.invoice.status) : null,
    paymentMethod: params.invoice?.payment_method
      ? String(params.invoice.payment_method)
      : null,
  };
}

async function returnSaasPixChargeSkipped(
  supabaseAdmin: SupabaseClient,
  params: {
    reason: SaasChargeSkipCode;
    message: string;
    companyId: string;
    referenceMonth: string;
    invoice: MasterSaasInvoice | null;
    existingCharge: SaasCharge | null;
    invoiceCreated: boolean;
    activeChargesCount: number;
  },
): Promise<CreateSaasPixChargeResult> {
  const skipDiagnostic = await buildSaasChargeSkipDiagnostic(supabaseAdmin, params);
  logSaasChargeSkipDiagnostic(skipDiagnostic);

  return {
    charge: params.existingCharge ?? (null as unknown as SaasCharge),
    invoice: params.invoice,
    created: false,
    skipped: params.message,
    skipCode: params.reason,
    skipDiagnostic,
    outcome: 'skipped',
    invoiceCreated: params.invoiceCreated,
  };
}

async function reopenInvoiceIfNoActiveCharges(
  supabaseAdmin: SupabaseClient,
  invoiceId: string,
): Promise<void> {
  const { data: chargeRows } = await supabaseAdmin
    .from('saas_charges')
    .select('status, payment_id, pix_copy_paste, payment_url, master_payment_id, deleted_at')
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null);

  const hasBlocking = (chargeRows || []).some((row) =>
    isSaasChargeBlockingDuplicate(row as SaasChargeSkipInput),
  );
  if (hasBlocking) return;

  await reopenSaasInvoiceForNewCharge(supabaseAdmin, invoiceId);
}

/** Após cancelar/excluir cobranças — oculta fatura fantasma (PENDENTE sem cobrança). */
async function finalizeSaasInvoiceAfterChargeRemoval(
  supabaseAdmin: SupabaseClient,
  invoiceId: string,
): Promise<void> {
  const { data: chargeRows } = await supabaseAdmin
    .from('saas_charges')
    .select('status, deleted_at')
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null);

  const hasSelectableCharge = (chargeRows || []).some((row) =>
    isSaasChargeSelectableForInvoiceRow(row as SaasCharge),
  );
  if (hasSelectableCharge) return;

  await detachSaasInvoiceFromGateway(supabaseAdmin, invoiceId, 'CANCELADO');
}

async function detachSaasInvoiceFromGateway(
  supabaseAdmin: SupabaseClient,
  invoiceId: string,
  invoiceStatus: 'CANCELADO' | 'PENDENTE' = 'CANCELADO',
): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from('master_saas_invoices')
    .update({
      status: invoiceStatus,
      external_charge_id: null,
      pix_code: null,
      pix_qrcode: null,
      payment_method: null,
      updated_at: now,
    })
    .eq('id', invoiceId);
}

export type GenerateMonthlySaasChargesResult = {
  created: number;
  completed: number;
  skipped: number;
  errors: string[];
  charges: SaasCharge[];
  invoices: MasterSaasInvoice[];
};

/** Gera cobranças mensais reais (Asaas) para empresas faturáveis. */
export async function generateMonthlySaasCharges(
  supabaseAdmin: SupabaseClient,
  options?: { referenceMonth?: string; actorUserId?: string | null },
): Promise<GenerateMonthlySaasChargesResult> {
  assertSaasPaymentGatewayConfigured();

  const referenceMonth = options?.referenceMonth || currentReferenceMonth();
  const result: GenerateMonthlySaasChargesResult = {
    created: 0,
    completed: 0,
    skipped: 0,
    errors: [],
    charges: [],
    invoices: [],
  };

  const { data: companies, error: companiesErr } = await supabaseAdmin
    .from('companies')
    .select('*')
    .order('name');

  if (companiesErr) {
    result.errors.push(companiesErr.message);
    return result;
  }

  const { data: subscriptions } = await supabaseAdmin.from('company_subscriptions').select('*');
  const subMap = new Map(
    (subscriptions || []).map((s) => [s.company_id, s as CompanySubscription]),
  );

  for (const company of companies || []) {
    if (!isBillableCompany(company)) continue;

    const subscription = subMap.get(company.id) ?? null;
    try {
      const gen = await createSaasPixCharge(
        supabaseAdmin,
        company as CompanyPricingSource & {
          id: string;
          name?: string | null;
          cnpj?: string | null;
          email?: string | null;
        },
        subscription,
        {
          referenceMonth,
          actorUserId: options?.actorUserId ?? null,
        },
      );

      if (gen.invoice) result.invoices.push(gen.invoice);

      if (gen.outcome === 'created') {
        result.created += 1;
        if (gen.charge?.id) result.charges.push(gen.charge);
      } else if (gen.outcome === 'completed') {
        result.completed += 1;
        if (gen.charge?.id) result.charges.push(gen.charge);
      } else {
        result.skipped += 1;
      }
    } catch (err) {
      result.errors.push(
        `${company.name || company.id}: ${err instanceof Error ? err.message : 'erro'}`,
      );
    }
  }

  return result;
}

/** Gera fatura (se necessário) + cobrança PIX em saas_charges. */
export async function createSaasPixCharge(
  supabaseAdmin: SupabaseClient,
  company: CompanyPricingSource & {
    id: string;
    name?: string | null;
    cnpj?: string | null;
    email?: string | null;
  },
  subscription: CompanySubscription | null | undefined,
  options?: CreateSaasPixChargeOptions,
): Promise<CreateSaasPixChargeResult> {
  assertSaasPaymentGatewayConfigured();

  const invoiceResult = await generateInvoiceForCompany(
    supabaseAdmin,
    company,
    subscription,
    {
      referenceMonth: options?.referenceMonth,
      dueDate: options?.dueDate,
      notes: options?.notes ?? null,
      skipPix: true,
    },
  );

  const invoiceCreated = invoiceResult.created;
  let invoice = invoiceResult.invoice;
  if (!invoice) {
    const referenceMonth = options?.referenceMonth || currentReferenceMonth();
    return returnSaasPixChargeSkipped(supabaseAdmin, {
      reason: 'invoice_missing',
      message: invoiceResult.skipped || 'Não foi possível gerar fatura',
      companyId: company.id,
      referenceMonth,
      invoice: null,
      existingCharge: null,
      invoiceCreated: false,
      activeChargesCount: 0,
    });
  }

  await reconcileSaasChargesBeforeRegeneration(supabaseAdmin, invoice.id);

  let { invoiceCharges, activeCharges, existingCharge } =
    await loadSaasChargeRegenerationContext(supabaseAdmin, invoice);

  invoice = await reopenInvoiceWhenSafeForRegeneration(supabaseAdmin, invoice, {
    dueDate: options?.dueDate || invoice.due_date,
  });

  if (
    shouldIgnoreInvoiceExternalChargeForRegeneration(existingCharge, invoiceCharges) &&
    String(invoice.external_charge_id || '').trim()
  ) {
    const reopenDue = resolveSaasChargeDueDate(options?.dueDate, invoice.due_date);
    invoice = await reopenSaasInvoiceForNewCharge(supabaseAdmin, invoice.id, {
      dueDate: reopenDue,
    });
  }

  ({ invoiceCharges, activeCharges, existingCharge } =
    await loadSaasChargeRegenerationContext(supabaseAdmin, invoice));

  const skipReason = await resolveSaasPixChargeSkipReasonAsync(invoice, existingCharge, undefined, {
    invoiceCharges,
  });
  if (skipReason) {
    const reason: SaasChargeSkipCode =
      skipReason.includes('Asaas') || skipReason.includes('asaas')
        ? 'asaas_external_charge'
        : 'active_local_charge';
    return returnSaasPixChargeSkipped(supabaseAdmin, {
      reason,
      message: skipReason,
      companyId: company.id,
      referenceMonth: invoice.reference_month,
      invoice,
      existingCharge: null,
      invoiceCreated,
      activeChargesCount: activeCharges.length,
    });
  }

  const existingPayment = await findConfirmedSaasPaymentForReference(
    supabaseAdmin,
    company.id,
    invoice.reference_month,
    invoice.id,
  );
  if (existingPayment) {
    return returnSaasPixChargeSkipped(supabaseAdmin, {
      reason: 'confirmed_manual_payment',
      message: 'Pagamento já confirmado para esta competência',
      companyId: company.id,
      referenceMonth: invoice.reference_month,
      invoice,
      existingCharge: null,
      invoiceCreated,
      activeChargesCount: activeCharges.length,
    });
  }

  const docError = validateCompanyDocumentForAsaas(company.name, company.cnpj);
  if (docError) {
    throw new Error(docError);
  }

  const requestedDueDate = options?.dueDate ? toIsoDateOnly(options.dueDate) : null;
  const resolvedDueDate = resolveSaasChargeDueDate(options?.dueDate, invoice.due_date);
  const billingType = options?.billingType === 'BOLETO' ? 'BOLETO' : 'PIX';

  console.warn(
    '[saas-charge-create-payload]',
    JSON.stringify({
      referenceMonth: invoice.reference_month,
      requestedDueDate,
      resolvedDueDate,
      billingType,
    }),
  );

  await reopenSaasInvoiceForNewCharge(supabaseAdmin, invoice.id, { dueDate: resolvedDueDate });
  invoice = {
    ...invoice,
    status: 'PENDENTE',
    external_charge_id: null,
    pix_code: null,
    pix_qrcode: null,
    payment_method: null,
    paid_at: null,
    due_date: resolvedDueDate,
  };

  invoice = await syncPendingInvoiceAmountsFromPricing(
    supabaseAdmin,
    invoice,
    company,
    subscription,
  );

  const priceDiagnostic = buildSaasPriceDiagnostic(company, subscription, { billingType });
  const chargeAmount = Number(invoice.final_amount || 0);

  console.warn(
    '[saas-charge-create-amount]',
    JSON.stringify({
      ...priceDiagnostic,
      invoice_final_amount: chargeAmount,
    }),
  );

  if (billingType === 'BOLETO') {
    assertSaasBoletoMinimumAmount(chargeAmount, priceDiagnostic);
  }

  const lateFee = resolveSaasLateFeePercents();
  const now = new Date().toISOString();

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('saas_charges')
    .insert({
      company_id: company.id,
      subscription_id: subscription?.id ?? invoice.subscription_id ?? null,
      invoice_id: invoice.id,
      amount: chargeAmount,
      due_date: resolvedDueDate,
      status: 'PENDING',
      payment_provider: 'pending',
      billing_type: billingType,
      fine_percent: lateFee.finePercent,
      interest_percent: lateFee.interestPercent,
      late_fee_enabled: true,
      updated_at: now,
    })
    .select('*')
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || 'Falha ao criar cobrança SaaS');
  }

  let charge = mapSaasChargeRow(inserted as Record<string, unknown>);
  const provider = getPaymentProvider();

  const pix = await provider.createPixCharge({
    companyId: company.id,
    chargeId: charge.id,
    amount: charge.amount,
    dueDate: resolvedDueDate,
    description: `SV LOTES — Assinatura ${invoice.reference_month}`,
    payerName: company.name || undefined,
    payerDocument: company.cnpj || undefined,
    payerEmail: company.email || undefined,
    billingType,
    finePercent: lateFee.finePercent,
    interestPercent: lateFee.interestPercent,
  });

  const { data: withPix, error: pixErr } = await supabaseAdmin
    .from('saas_charges')
    .update({
      payment_provider: pix.provider,
      payment_id: pix.paymentId,
      pix_qr_code: pix.pixQrCode || null,
      pix_copy_paste: pix.pixCopyPaste || null,
      payment_url: pix.paymentUrl ?? pix.invoiceUrl ?? pix.bankSlipUrl ?? null,
      invoice_url: pix.invoiceUrl ?? null,
      bank_slip_url: pix.bankSlipUrl ?? null,
      bank_slip_identification: pix.bankSlipIdentification ?? null,
      billing_type: pix.billingType || billingType,
      status: mapProviderStatusToChargeStatus(pix.status),
      ...buildSaasChargeLateFeeDbPatch({
        finePercent: lateFee.finePercent,
        interestPercent: lateFee.interestPercent,
      }),
    })
    .eq('id', charge.id)
    .select('*')
    .single();

  if (pixErr || !withPix) {
    throw new Error(pixErr?.message || 'Falha ao anexar cobrança ao gateway');
  }

  if (billingType === 'PIX' && !String(pix.pixCopyPaste || '').trim()) {
    throw new Error('Asaas não retornou Pix Copia e Cola — cobrança não concluída.');
  }

  if (
    billingType === 'BOLETO' &&
    !String(pix.bankSlipUrl || pix.invoiceUrl || pix.paymentUrl || '').trim()
  ) {
    throw new Error('Asaas não retornou URL do boleto — cobrança não concluída.');
  }

  charge = mapSaasChargeRow(withPix as Record<string, unknown>);

  console.warn(
    '[saas-charge-create-result]',
    JSON.stringify({
      asaasPaymentId: charge.payment_id ?? null,
      asaasDueDate: resolvedDueDate,
      invoiceDueDate: resolvedDueDate,
      chargeDueDate: charge.due_date,
    }),
  );

  await supabaseAdmin
    .from('master_saas_invoices')
    .update({
      due_date: resolvedDueDate,
      pix_code: charge.pix_copy_paste,
      pix_qrcode: charge.pix_qr_code,
      external_charge_id: charge.payment_id,
      payment_method: billingType === 'BOLETO' ? 'boleto' : 'pix',
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id);

  invoice = { ...invoice, due_date: resolvedDueDate };

  if (options?.actorUserId) {
    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: company.id,
      company_id: company.id,
      user_id: options.actorUserId,
      module: 'SAAS_BILLING',
      action: 'SAAS_CHARGE_CREATED',
      description: `Cobrança ${billingType} ${charge.id.slice(0, 8)} — ${invoice.invoice_number}`,
      reference_id: charge.id,
    });
  }

  await updateCompanyFinancialStatus(supabaseAdmin, company.id);

  return {
    charge,
    invoice,
    created: true,
    outcome: invoiceCreated ? 'created' : 'completed',
    invoiceCreated,
  };
}

export type ProcessChargePaidInput = {
  chargeId?: string;
  paymentId?: string;
  paidAt?: string;
  actorUserId?: string | null;
  source?: string;
};

async function findSaasChargeRowForPayment(
  supabaseAdmin: SupabaseClient,
  input: ProcessChargePaidInput,
): Promise<Record<string, unknown> | null> {
  if (input.chargeId) {
    const { data } = await supabaseAdmin
      .from('saas_charges')
      .select('*')
      .eq('id', input.chargeId)
      .is('deleted_at', null)
      .maybeSingle();
    if (data) return data as Record<string, unknown>;
  }

  if (input.paymentId) {
    const { data: byPayment } = await supabaseAdmin
      .from('saas_charges')
      .select('*')
      .eq('payment_id', input.paymentId)
      .is('deleted_at', null)
      .maybeSingle();
    if (byPayment) return byPayment as Record<string, unknown>;

    const { data: invoice } = await supabaseAdmin
      .from('master_saas_invoices')
      .select('id')
      .eq('external_charge_id', input.paymentId)
      .maybeSingle();

    if (invoice?.id) {
      const { data: byInvoice } = await supabaseAdmin
        .from('saas_charges')
        .select('*')
        .eq('invoice_id', invoice.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byInvoice) return byInvoice as Record<string, unknown>;
    }
  }

  return null;
}

/** Confirma pagamento PIX — registra master_saas_payments e reativa empresa. */
export async function processSaasChargePaid(
  supabaseAdmin: SupabaseClient,
  input: ProcessChargePaidInput,
): Promise<{ charge: SaasCharge; paymentId: string }> {
  if (!input.chargeId && !input.paymentId) {
    throw new Error('chargeId ou paymentId obrigatório.');
  }

  const row = await findSaasChargeRowForPayment(supabaseAdmin, input);
  if (!row) throw new Error('Cobrança não encontrada.');

  const charge = mapSaasChargeRow(row as Record<string, unknown>);
  if (charge.status === 'PAID' && charge.master_payment_id) {
    await ensureSaasCashIncomeForPaidCharge(supabaseAdmin, {
      charge,
      paidAt: input.paidAt || (charge.paid_at ? charge.paid_at.split('T')[0] : undefined),
      createdBy: input.actorUserId ?? null,
    });
    return { charge, paymentId: charge.master_payment_id };
  }

  const paidAt = input.paidAt || todayIsoDate();
  const now = new Date().toISOString();
  let masterPaymentId = charge.master_payment_id || null;

  if (charge.invoice_id) {
    const paid = await markInvoicePaid(supabaseAdmin, {
      invoiceId: charge.invoice_id,
      paidAt,
      paymentMethod: charge.billing_type === 'BOLETO' ? 'boleto' : 'pix',
      notes: `${charge.billing_type || 'PIX'} webhook — charge ${charge.id}`,
      createdBy: input.actorUserId ?? null,
    });
    masterPaymentId = paid.paymentId;
  } else if (!masterPaymentId) {
    let referenceMonth = referenceMonthFromDate(charge.due_date);
    if (charge.invoice_id) {
      const { data: inv } = await supabaseAdmin
        .from('master_saas_invoices')
        .select('reference_month')
        .eq('id', charge.invoice_id)
        .maybeSingle();
      if (inv?.reference_month) referenceMonth = String(inv.reference_month);
    }

    const existing = await findExistingSaasPaymentForReference(
      supabaseAdmin,
      charge.company_id,
      referenceMonth,
    );
    if (existing) {
      masterPaymentId = existing.id;
    } else {
      const { data: payment, error: payErr } = await supabaseAdmin
        .from('master_saas_payments')
        .insert({
          company_id: charge.company_id,
          subscription_id: charge.subscription_id,
          amount: charge.amount,
          paid_at: paidAt,
          payment_method: 'pix',
          reference_month: referenceMonth,
          status: 'paid',
          notes: `PIX confirmado (${input.source || charge.payment_provider}) — charge ${charge.id}`,
          created_by: input.actorUserId ?? null,
        })
        .select('id')
        .single();

      if (payErr || !payment) {
        throw new Error(payErr?.message || 'Falha ao registrar pagamento SaaS');
      }
      masterPaymentId = payment.id;
    }

    await advanceSubscriptionAfterSaasPayment(supabaseAdmin, charge.company_id, referenceMonth);
  }

  await reactivateCompanyOnPayment(supabaseAdmin, charge.company_id, {
    skipSubscriptionDates: true,
  });

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('saas_charges')
    .update({
      status: 'PAID',
      paid_at: `${paidAt}T12:00:00.000Z`,
      master_payment_id: masterPaymentId,
      updated_at: now,
    })
    .eq('id', charge.id)
    .select('*')
    .single();

  if (updErr || !updated) {
    throw new Error(updErr?.message || 'Falha ao atualizar cobrança');
  }

  await updateCompanyFinancialStatus(supabaseAdmin, charge.company_id);

  await supabaseAdmin.from('audit_logs').insert({
    tenant_id: charge.company_id,
    company_id: charge.company_id,
    user_id: input.actorUserId,
    module: 'SAAS_BILLING',
    action: 'SAAS_CHARGE_PAID',
    description: `Pagamento PIX confirmado — R$ ${charge.amount.toFixed(2)}`,
    reference_id: charge.id,
  });

  const updatedCharge = mapSaasChargeRow(updated as Record<string, unknown>);
  await ensureSaasCashIncomeForPaidCharge(supabaseAdmin, {
    charge: updatedCharge,
    paidAt,
    createdBy: input.actorUserId ?? null,
  });

  return {
    charge: updatedCharge,
    paymentId: masterPaymentId!,
  };
}

export type ProcessChargeStatusInput = {
  chargeId?: string;
  paymentId?: string;
  actorUserId?: string | null;
  source?: string;
};

async function updateChargeAndInvoiceStatus(
  supabaseAdmin: SupabaseClient,
  charge: SaasCharge,
  mapped: SaasChargeStatus,
  invoiceStatus: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'CANCELADO',
): Promise<SaasCharge> {
  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('saas_charges')
    .update({ status: mapped, updated_at: now })
    .eq('id', charge.id)
    .select('*')
    .single();

  if (updErr || !updated) {
    throw new Error(updErr?.message || 'Falha ao atualizar cobrança');
  }

  if (charge.invoice_id) {
    await supabaseAdmin
      .from('master_saas_invoices')
      .update({ status: invoiceStatus, updated_at: now })
      .eq('id', charge.invoice_id);
  }

  await updateCompanyFinancialStatus(supabaseAdmin, charge.company_id);
  return mapSaasChargeRow(updated as Record<string, unknown>);
}

/** Webhook/sync — cobrança vencida no Asaas. */
export async function processSaasChargeOverdue(
  supabaseAdmin: SupabaseClient,
  input: ProcessChargeStatusInput,
): Promise<{ charge: SaasCharge }> {
  const row = await findSaasChargeRowForPayment(supabaseAdmin, input);
  if (!row) throw new Error('Cobrança não encontrada.');

  const charge = mapSaasChargeRow(row as Record<string, unknown>);
  if (charge.status === 'PAID') return { charge };

  const updated = await updateChargeAndInvoiceStatus(
    supabaseAdmin,
    charge,
    'OVERDUE',
    'VENCIDO',
  );

  await supabaseAdmin.from('audit_logs').insert({
    tenant_id: charge.company_id,
    company_id: charge.company_id,
    user_id: input.actorUserId ?? null,
    module: 'SAAS_BILLING',
    action: 'SAAS_CHARGE_OVERDUE',
    description: `Cobrança vencida — ${input.source || 'asaas'}`,
    reference_id: charge.id,
  });

  await autoSuspendCompanyIfEligible(supabaseAdmin, charge.company_id);

  return { charge: updated };
}

/** Webhook/sync — cobrança cancelada ou excluída no Asaas. */
export async function processSaasChargeCancelled(
  supabaseAdmin: SupabaseClient,
  input: ProcessChargeStatusInput,
): Promise<{ charge: SaasCharge }> {
  const row = await findSaasChargeRowForPayment(supabaseAdmin, input);
  if (!row) throw new Error('Cobrança não encontrada.');

  const charge = mapSaasChargeRow(row as Record<string, unknown>);
  if (charge.status === 'PAID') return { charge };

  const updated = await updateChargeAndInvoiceStatus(
    supabaseAdmin,
    charge,
    'CANCELLED',
    'CANCELADO',
  );

  await supabaseAdmin.from('audit_logs').insert({
    tenant_id: charge.company_id,
    company_id: charge.company_id,
    user_id: input.actorUserId ?? null,
    module: 'SAAS_BILLING',
    action: 'SAAS_CHARGE_CANCELLED',
    description: `Cobrança cancelada — ${input.source || 'asaas'}`,
    reference_id: charge.id,
  });

  return { charge: updated };
}

/** Suspende empresa se inadimplente há SAAS_AUTO_SUSPEND_AFTER_DAYS+ dias sem pagamento da competência. */
export async function autoSuspendCompanyIfEligible(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  today = todayIsoDate(),
  graceDays = SAAS_AUTO_SUSPEND_AFTER_DAYS,
): Promise<boolean> {
  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('id, name, status_operacional, active')
    .eq('id', companyId)
    .maybeSingle();

  if (!company) return false;
  const opStatus = (company.status_operacional || '').toLowerCase();
  if (opStatus === 'suspensa' || company.active === false) return false;
  if (opStatus === 'inativo' || opStatus === 'inativa') return false;

  const { data: overdueCharges } = await supabaseAdmin
    .from('saas_charges')
    .select('id, due_date, invoice_id, status')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('status', ['OVERDUE', 'PENDING'])
    .not('payment_id', 'is', null);

  let eligible = false;
  for (const ch of overdueCharges || []) {
    const due = String(ch.due_date || '').split('T')[0];
    if (!due) continue;
    const daysLate = Math.floor(
      (new Date(`${today}T12:00:00`).getTime() - new Date(`${due}T12:00:00`).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (daysLate < graceDays) continue;

    let referenceMonth: string | null = null;
    if (ch.invoice_id) {
      const { data: inv } = await supabaseAdmin
        .from('master_saas_invoices')
        .select('reference_month')
        .eq('id', ch.invoice_id)
        .maybeSingle();
      referenceMonth = inv?.reference_month ? String(inv.reference_month) : null;
    }
    if (!referenceMonth) referenceMonth = referenceMonthFromDate(due);

    const existing = await findExistingSaasPaymentForReference(
      supabaseAdmin,
      companyId,
      referenceMonth,
    );
    if (existing) continue;

    eligible = true;
    break;
  }

  if (!eligible) {
    const { data: overdueInvoices } = await supabaseAdmin
      .from('master_saas_invoices')
      .select('due_date, reference_month')
      .eq('company_id', companyId)
      .eq('status', 'VENCIDO');

    for (const inv of overdueInvoices || []) {
      const due = String(inv.due_date || '').split('T')[0];
      if (!due) continue;
      const daysLate = Math.floor(
        (new Date(`${today}T12:00:00`).getTime() - new Date(`${due}T12:00:00`).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (daysLate < graceDays) continue;
      const ref = String(inv.reference_month || referenceMonthFromDate(due));
      const existing = await findExistingSaasPaymentForReference(supabaseAdmin, companyId, ref);
      if (!existing) {
        eligible = true;
        break;
      }
    }
  }

  if (!eligible) return false;

  await supabaseAdmin
    .from('companies')
    .update({
      status_operacional: 'Suspensa',
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId);

  const { data: sub } = await supabaseAdmin
    .from('company_subscriptions')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle();

  if (sub?.id) {
    await supabaseAdmin
      .from('company_subscriptions')
      .update({
        contract_status: 'suspended',
        payment_status: 'overdue',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id);
  }

  await supabaseAdmin.from('audit_logs').insert({
    tenant_id: companyId,
    company_id: companyId,
    module: 'SAAS_BILLING',
    action: 'SAAS_COMPANY_AUTO_SUSPENDED',
    description: `Empresa suspensa automaticamente após ${graceDays} dias de inadimplência SaaS`,
    reference_id: companyId,
  });

  return true;
}

export async function cancelSaasCharge(
  supabaseAdmin: SupabaseClient,
  chargeId: string,
  actorUserId?: string | null,
): Promise<SaasCharge> {
  const { data: row, error } = await supabaseAdmin
    .from('saas_charges')
    .select('*')
    .eq('id', chargeId)
    .single();

  if (error || !row) throw new Error('Cobrança não encontrada.');

  const charge = mapSaasChargeRow(row as Record<string, unknown>);
  if (charge.payment_id) {
    const provider = getPaymentProvider();
    if (provider.providerName === charge.payment_provider) {
      try {
        await provider.cancelCharge(charge.payment_id);
      } catch {
        /* gateway pode já ter cancelado */
      }
    }
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('saas_charges')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', chargeId)
    .select('*')
    .single();

  if (updErr || !updated) throw new Error(updErr?.message || 'Falha ao cancelar cobrança');

  if (charge.invoice_id) {
    await finalizeSaasInvoiceAfterChargeRemoval(supabaseAdmin, charge.invoice_id);
  }

  await updateCompanyFinancialStatus(supabaseAdmin, charge.company_id);

  if (actorUserId) {
    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: charge.company_id,
      company_id: charge.company_id,
      user_id: actorUserId,
      module: 'SAAS_BILLING',
      action: 'SAAS_CHARGE_CANCELLED',
      description: `Cobrança cancelada — ${chargeId}`,
      reference_id: chargeId,
    });
  }

  return mapSaasChargeRow(updated as Record<string, unknown>);
}

export type DeleteCancelledSaasChargeResult = {
  chargeId: string;
  companyId: string;
  paymentId: string | null;
  asaasDelete: {
    status: string;
    httpStatus: number;
    message?: string;
  };
};

/**
 * Soft delete de cobrança cancelada — oculta Master e Minha Assinatura.
 * Tenta DELETE no Asaas quando houver payment_id.
 */
export async function deleteCancelledSaasCharge(
  supabaseAdmin: SupabaseClient,
  chargeId: string,
  actorUserId?: string | null,
  deleteReason = 'master_delete_cancelled',
): Promise<DeleteCancelledSaasChargeResult> {
  const { data: row, error } = await supabaseAdmin
    .from('saas_charges')
    .select('*')
    .eq('id', chargeId)
    .single();

  if (error || !row) throw new Error('Cobrança não encontrada.');

  const charge = mapSaasChargeRow(row as Record<string, unknown>);
  assertCanDeleteCancelledSaasCharge(charge);

  let asaasResult: DeleteCancelledSaasChargeResult['asaasDelete'] = {
    status: 'skipped',
    httpStatus: 0,
    message: 'Sem payment_id',
  };

  const paymentId = String(charge.payment_id || '').trim();
  if (paymentId) {
    const provider = getPaymentProvider();
    if (provider.deleteCharge) {
      const result = await provider.deleteCharge(paymentId);
      asaasResult = {
        status: result.status,
        httpStatus: result.httpStatus,
        message: result.message,
      };
      if (result.blocking) {
        throw new Error(
          result.message ||
            'Não foi possível excluir a cobrança no Asaas. A cobrança permanece no painel.',
        );
      }
    } else if (provider.providerName === charge.payment_provider) {
      try {
        await provider.cancelCharge(paymentId);
        asaasResult = {
          status: 'deleted',
          httpStatus: 200,
          message: 'Excluída via cancelCharge',
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/404|not found|não encontrad/i.test(msg)) {
          asaasResult = {
            status: 'not_found',
            httpStatus: 404,
            message: msg,
          };
        } else if (/paga|paid|received|confirmad|recebida|não pode|nao pode/i.test(msg)) {
          throw new Error(
            `Não foi possível excluir no Asaas: ${msg}. A cobrança permanece no painel.`,
          );
        } else {
          throw new Error(
            `Erro ao excluir no Asaas: ${msg}. A cobrança permanece no painel.`,
          );
        }
      }
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('saas_charges')
    .update({
      status: 'CANCELLED',
      deleted_at: now,
      deleted_by: actorUserId || null,
      delete_reason: deleteReason,
      asaas_delete_status: asaasResult.status,
      updated_at: now,
    })
    .eq('id', chargeId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (updErr || !updated) {
    throw new Error(updErr?.message || 'Falha ao excluir cobrança localmente.');
  }

  if (charge.invoice_id) {
    await finalizeSaasInvoiceAfterChargeRemoval(supabaseAdmin, charge.invoice_id);
  }

  await updateCompanyFinancialStatus(supabaseAdmin, charge.company_id);

  await supabaseAdmin.from('audit_logs').insert({
    tenant_id: charge.company_id,
    company_id: charge.company_id,
    user_id: actorUserId || null,
    module: 'SAAS_BILLING',
    action: 'SAAS_CHARGE_DELETED',
    description: `Cobrança cancelada excluída — ${chargeId} | payment_id=${paymentId || '—'} | asaas=${asaasResult.status} (${asaasResult.httpStatus})${asaasResult.message ? ` — ${asaasResult.message}` : ''}`,
    reference_id: chargeId,
  });

  return {
    chargeId,
    companyId: charge.company_id,
    paymentId: paymentId || null,
    asaasDelete: asaasResult,
  };
}

async function persistSaasChargeGatewayFields(
  supabaseAdmin: SupabaseClient,
  chargeId: string,
  invoiceId: string | null | undefined,
  gateway: {
    paymentId: string;
    pixQrCode: string;
    pixCopyPaste: string;
    paymentUrl?: string | null;
    invoiceUrl?: string | null;
    bankSlipUrl?: string | null;
    bankSlipIdentification?: string | null;
    billingType?: SaasMasterBillingType;
    provider: string;
    status: SaasChargeStatus;
  },
): Promise<SaasCharge> {
  const now = new Date().toISOString();
  const billingType = gateway.billingType || 'PIX';
  const { data: updated, error } = await supabaseAdmin
    .from('saas_charges')
    .update({
      payment_provider: gateway.provider,
      payment_id: gateway.paymentId,
      pix_qr_code: gateway.pixQrCode || null,
      pix_copy_paste: gateway.pixCopyPaste || null,
      payment_url: gateway.paymentUrl ?? gateway.invoiceUrl ?? gateway.bankSlipUrl ?? null,
      invoice_url: gateway.invoiceUrl ?? null,
      bank_slip_url: gateway.bankSlipUrl ?? null,
      bank_slip_identification: gateway.bankSlipIdentification ?? null,
      billing_type: billingType,
      status: gateway.status,
      updated_at: now,
    })
    .eq('id', chargeId)
    .select('*')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Falha ao persistir cobrança do gateway');
  }

  const charge = mapSaasChargeRow(updated as Record<string, unknown>);

  if (invoiceId) {
    await supabaseAdmin
      .from('master_saas_invoices')
      .update({
        pix_code: charge.pix_copy_paste,
        pix_qrcode: charge.pix_qr_code,
        external_charge_id: charge.payment_id,
        payment_method: billingType === 'BOLETO' ? 'boleto' : 'pix',
        updated_at: now,
      })
      .eq('id', invoiceId);
  }

  return charge;
}

/** @deprecated use persistSaasChargeGatewayFields */
async function persistSaasChargePixFields(
  supabaseAdmin: SupabaseClient,
  chargeId: string,
  invoiceId: string | null | undefined,
  pix: {
    paymentId: string;
    pixQrCode: string;
    pixCopyPaste: string;
    paymentUrl?: string | null;
    provider: string;
    status: SaasChargeStatus;
  },
): Promise<SaasCharge> {
  return persistSaasChargeGatewayFields(supabaseAdmin, chargeId, invoiceId, {
    ...pix,
    billingType: 'PIX',
  });
}

/** Backfill PIX/link Asaas quando payment_id existe mas campos PIX estão vazios. */
export async function refreshSaasChargePixFromAsaas(
  supabaseAdmin: SupabaseClient,
  chargeId: string,
): Promise<SaasCharge> {
  const { data: row, error } = await supabaseAdmin
    .from('saas_charges')
    .select('*')
    .eq('id', chargeId)
    .single();

  if (error || !row) throw new Error('Cobrança não encontrada.');

  const charge = mapSaasChargeRow(row as Record<string, unknown>);
  if (!charge.payment_id) {
    throw new Error('Cobrança sem payment_id no Asaas.');
  }

  if (
    String(charge.pix_copy_paste || '').trim() &&
    String(charge.pix_qr_code || '').trim() &&
    String(charge.payment_url || '').trim()
  ) {
    return charge;
  }

  const pix = await fetchAsaasPaymentPixData(charge.payment_id);
  return persistSaasChargeGatewayFields(supabaseAdmin, charge.id, charge.invoice_id, {
    paymentId: pix.paymentId,
    pixQrCode: pix.pixQrCode,
    pixCopyPaste: pix.pixCopyPaste,
    paymentUrl: pix.paymentUrl,
    invoiceUrl: pix.invoiceUrl,
    bankSlipUrl: pix.bankSlipUrl,
    bankSlipIdentification: pix.bankSlipIdentification,
    billingType:
      pix.bankSlipUrl && !pix.pixCopyPaste ? 'BOLETO' : charge.billing_type || 'PIX',
    provider: 'asaas',
    status: mapProviderStatusToChargeStatus(pix.status),
  });
}

export type SyncSaasChargeResult = {
  charge: SaasCharge;
  paid: boolean;
  statusSynced: SaasChargeStatus;
};

async function syncSaasDueDatesFromAsaas(
  supabaseAdmin: SupabaseClient,
  charge: SaasCharge,
  remoteDueDate: string | null | undefined,
): Promise<SaasCharge> {
  const due = remoteDueDate ? toIsoDateOnly(remoteDueDate) : null;
  if (!due || due === charge.due_date) return charge;

  const now = new Date().toISOString();
  const { data: updatedCharge, error } = await supabaseAdmin
    .from('saas_charges')
    .update({ due_date: due, updated_at: now })
    .eq('id', charge.id)
    .select('*')
    .single();

  if (error || !updatedCharge) return charge;

  if (charge.invoice_id) {
    await supabaseAdmin
      .from('master_saas_invoices')
      .update({ due_date: due, updated_at: now })
      .eq('id', charge.invoice_id);
  }

  return mapSaasChargeRow(updatedCharge as Record<string, unknown>);
}

/** Consulta status no Asaas e sincroniza saas_charges / fatura / pagamento. */
export async function syncSaasChargeStatusFromAsaas(
  supabaseAdmin: SupabaseClient,
  chargeId: string,
  actorUserId?: string | null,
): Promise<SyncSaasChargeResult> {
  const { data: row, error } = await supabaseAdmin
    .from('saas_charges')
    .select('*')
    .eq('id', chargeId)
    .single();

  if (error || !row) throw new Error('Cobrança não encontrada.');

  let charge = mapSaasChargeRow(row as Record<string, unknown>);
  if (!charge.payment_id) {
    throw new Error('Cobrança sem payment_id no Asaas.');
  }

  if (!String(charge.pix_copy_paste || '').trim() || !String(charge.pix_qr_code || '').trim()) {
    try {
      const refreshed = await refreshSaasChargePixFromAsaas(supabaseAdmin, charge.id);
      Object.assign(charge, refreshed);
    } catch (err) {
      console.warn('[SAAS_CHARGE_PIX_REFRESH_FAIL]', {
        chargeId: charge.id,
        paymentId: charge.payment_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (charge.status === 'PAID' && charge.master_payment_id) {
    await ensureSaasCashIncomeForPaidCharge(supabaseAdmin, {
      charge,
      paidAt: charge.paid_at ? charge.paid_at.split('T')[0] : undefined,
      createdBy: actorUserId ?? null,
    });
    return { charge, paid: true, statusSynced: 'PAID' };
  }

  const provider = getPaymentProvider();
  const remote = await provider.getChargeStatus(charge.payment_id);
  charge = await syncSaasDueDatesFromAsaas(supabaseAdmin, charge, remote.dueDate);
  const mapped = mapProviderStatusToChargeStatus(remote.status);

  if (mapped === 'PAID') {
    const result = await processSaasChargePaid(supabaseAdmin, {
      chargeId: charge.id,
      paymentId: charge.payment_id,
      paidAt: remote.paidAt || todayIsoDate(),
      actorUserId,
      source: 'sync:asaas',
    });
    return { charge: result.charge, paid: true, statusSynced: 'PAID' };
  }

  if (mapped === 'OVERDUE') {
    const result = await processSaasChargeOverdue(supabaseAdmin, {
      chargeId: charge.id,
      paymentId: charge.payment_id,
      actorUserId,
      source: 'sync:asaas',
    });
    return { charge: result.charge, paid: false, statusSynced: 'OVERDUE' };
  }

  if (mapped === 'CANCELLED') {
    const result = await processSaasChargeCancelled(supabaseAdmin, {
      chargeId: charge.id,
      paymentId: charge.payment_id,
      actorUserId,
      source: 'sync:asaas',
    });
    return { charge: result.charge, paid: false, statusSynced: 'CANCELLED' };
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('saas_charges')
    .update({ status: mapped, updated_at: now })
    .eq('id', charge.id)
    .select('*')
    .single();

  if (updErr || !updated) {
    throw new Error(updErr?.message || 'Falha ao sincronizar cobrança');
  }

  const synced = mapSaasChargeRow(updated as Record<string, unknown>);

  if (charge.invoice_id) {
    const invoiceStatus =
      mapped === 'OVERDUE' ? 'VENCIDO' : mapped === 'CANCELLED' ? 'CANCELADO' : 'PENDENTE';
    await supabaseAdmin
      .from('master_saas_invoices')
      .update({ status: invoiceStatus, updated_at: now })
      .eq('id', charge.invoice_id);
  }

  await updateCompanyFinancialStatus(supabaseAdmin, charge.company_id);

  return { charge: synced, paid: false, statusSynced: mapped };
}

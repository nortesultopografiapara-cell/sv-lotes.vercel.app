/**
 * Cobrança recorrente SaaS — faturas, PIX mock, suspensão e métricas.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addOneMonthToIsoDate,
  companyNextPaymentPatch,
  dueDayFromDate,
  toIsoDateOnly,
  todayIsoDate,
} from '@/lib/companySubscriptionDates';
import {
  isBillableCompany,
  resolveCompanyPricing,
  type CompanyPricingSource,
} from '@/lib/companyPricing';
import { getGatewayBillingProvider } from '@/lib/gatewayBillingProvider';
import {
  formatReferenceMonthLabel,
  referenceMonthFromDate,
} from '@/lib/masterSaasPayments';
import type { CompanySubscription } from '@/lib/saasSubscription';
import { SAAS_AUTO_SUSPEND_AFTER_DAYS } from '@/lib/saasMasterConfig';
import { resolveAsaasDueDate } from '@/lib/saasPixValidation';
import { ensureSaasCashAfterInvoicePaid } from '@/lib/saasCashMovements';

export type SaasInvoiceStatus = 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'CANCELADO';

export type MasterSaasInvoice = {
  id: string;
  company_id: string;
  subscription_id?: string | null;
  contract_id?: string | null;
  invoice_number: string;
  reference_month: string;
  amount: number;
  discount_amount: number;
  final_amount: number;
  due_date: string;
  issued_at: string;
  paid_at?: string | null;
  status: SaasInvoiceStatus;
  payment_method?: string | null;
  pix_code?: string | null;
  pix_qrcode?: string | null;
  external_charge_id?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  company_name?: string;
  plan_label?: string;
};

export type SaasBillingMetrics = {
  projectedRevenue: number;
  receivedRevenue: number;
  revenueToReceive: number;
  overdueRevenue: number;
  delinquencyAmount: number;
  pendingCount: number;
  overdueCount: number;
  dueSoonCount: number;
  suspendedCount: number;
};

export type SaasBillingAlerts = {
  dueInSevenDays: MasterSaasInvoice[];
  overdue: MasterSaasInvoice[];
  delinquentCompanies: { companyId: string; companyName: string; daysLate: number }[];
  suspendedCompanies: { companyId: string; companyName: string }[];
};

const INVOICE_NUMBER_PATTERN = /^(\d{5})\/(\d{4}-\d{2})$/;

export function formatSaasInvoiceNumber(seq: number, referenceMonth: string): string {
  return `${String(seq).padStart(5, '0')}/${referenceMonth}`;
}

export function isValidSaasInvoiceNumber(value: string): boolean {
  return INVOICE_NUMBER_PATTERN.test(String(value).trim());
}

export function computeInvoiceAmounts(
  company: CompanyPricingSource,
  subscription?: CompanySubscription | null,
): {
  amount: number;
  discount_amount: number;
  final_amount: number;
} {
  const pricing = resolveCompanyPricing(company, subscription);
  const amount = pricing.standardPrice;
  const final_amount = pricing.appliedPrice;
  const discount_amount = Math.max(0, Number((amount - final_amount).toFixed(2)));
  return { amount, discount_amount, final_amount };
}

const PAID_INVOICE_STATUSES = new Set(['PAGO', 'PAGA', 'PAID']);
const CANCELLED_INVOICE_STATUSES = new Set(['CANCELADA', 'CANCELLED', 'CANCELED']);

/** Sincroniza valores de fatura pendente com o preço SaaS efetivo atual da empresa. */
export async function syncPendingInvoiceAmountsFromPricing(
  supabaseAdmin: SupabaseClient,
  invoice: MasterSaasInvoice,
  company: CompanyPricingSource & { id: string },
  subscription?: CompanySubscription | null,
): Promise<MasterSaasInvoice> {
  const status = String(invoice.status || '').toUpperCase();
  if (PAID_INVOICE_STATUSES.has(status) || CANCELLED_INVOICE_STATUSES.has(status)) {
    return invoice;
  }

  const amounts = computeInvoiceAmounts(company, subscription);
  const current = Number(invoice.final_amount || 0);
  if (Math.abs(current - amounts.final_amount) < 0.009) {
    return invoice;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('master_saas_invoices')
    .update({
      amount: amounts.amount,
      discount_amount: amounts.discount_amount,
      final_amount: amounts.final_amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id)
    .select('*')
    .single();

  if (error || !updated) return invoice;
  return parseInvoiceRow(updated);
}

export function isMockSaasExternalChargeId(id: string | null | undefined): boolean {
  return String(id || '').trim().startsWith('mock_');
}

/** Fatura mock/zerada — não bloqueia cobrança real Asaas. */
export function isPhantomSaasInvoice(
  invoice: Pick<MasterSaasInvoice, 'final_amount' | 'status' | 'external_charge_id' | 'amount'>,
): boolean {
  if (Number(invoice.final_amount || 0) <= 0) return true;
  if (isMockSaasExternalChargeId(invoice.external_charge_id)) return true;
  return false;
}

async function repairPhantomSaasInvoiceIfNeeded(
  supabaseAdmin: SupabaseClient,
  invoice: MasterSaasInvoice,
  company: CompanyPricingSource & { id: string },
  subscription: CompanySubscription | null | undefined,
  options?: GenerateInvoiceOptions,
): Promise<MasterSaasInvoice> {
  if (!isPhantomSaasInvoice(invoice)) return invoice;

  const amounts = computeInvoiceAmounts(company, subscription);
  const due_date =
    options?.dueDate ||
    invoice.due_date ||
    resolveInvoiceDueDate(company, subscription, invoice.reference_month);
  const now = new Date().toISOString();

  await supabaseAdmin
    .from('saas_charges')
    .update({ status: 'CANCELLED', updated_at: now })
    .eq('invoice_id', invoice.id);

  const { data: updated, error } = await supabaseAdmin
    .from('master_saas_invoices')
    .update({
      amount: amounts.amount,
      discount_amount: amounts.discount_amount,
      final_amount: amounts.final_amount,
      status: 'PENDENTE',
      paid_at: null,
      payment_method: null,
      pix_code: null,
      pix_qrcode: null,
      external_charge_id: null,
      due_date,
      updated_at: now,
    })
    .eq('id', invoice.id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Falha ao reparar fatura mock');
  }

  return parseInvoiceRow(updated);
}

/** Reabre fatura após cancelamento/exclusão da cobrança — limpa gateway legado. */
export async function reopenSaasInvoiceForNewCharge(
  supabaseAdmin: SupabaseClient,
  invoiceId: string,
  options?: { dueDate?: string },
): Promise<MasterSaasInvoice> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: 'PENDENTE',
    external_charge_id: null,
    pix_code: null,
    pix_qrcode: null,
    payment_method: null,
    paid_at: null,
    updated_at: now,
  };
  if (options?.dueDate) patch.due_date = options.dueDate;

  const { data: updated, error } = await supabaseAdmin
    .from('master_saas_invoices')
    .update(patch)
    .eq('id', invoiceId)
    .select('*')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Falha ao reabrir fatura para nova cobrança');
  }

  return parseInvoiceRow(updated);
}

/** Atualiza due_date de fatura existente quando o Master informa vencimento explícito. */
async function applyRequestedDueDateToExistingInvoice(
  supabaseAdmin: SupabaseClient,
  invoice: MasterSaasInvoice,
  requestedDueDate?: string,
): Promise<MasterSaasInvoice> {
  if (!requestedDueDate) return invoice;
  if (String(invoice.status || '').toUpperCase() === 'PAGO') return invoice;

  const resolved = resolveAsaasDueDate(requestedDueDate);
  if (resolved === invoice.due_date) return invoice;

  const { data: updated, error } = await supabaseAdmin
    .from('master_saas_invoices')
    .update({
      due_date: resolved,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id)
    .select('*')
    .single();

  if (error || !updated) return invoice;
  return parseInvoiceRow(updated);
}

export function resolveInvoiceDueDate(
  company: CompanyPricingSource,
  subscription: CompanySubscription | null | undefined,
  referenceMonth: string,
): string {
  const dueDay =
    Number(company.subscription_due_day) ||
    dueDayFromDate(subscription?.start_date || company.subscription_start_date || todayIsoDate());

  const [year, month] = referenceMonth.split('-').map(Number);
  if (!year || !month) return todayIsoDate();

  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(Math.max(dueDay, 1), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function currentReferenceMonth(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseInvoiceRow(row: Record<string, unknown>): MasterSaasInvoice {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    subscription_id: row.subscription_id ? String(row.subscription_id) : null,
    contract_id: row.contract_id ? String(row.contract_id) : null,
    invoice_number: String(row.invoice_number || ''),
    reference_month: String(row.reference_month || ''),
    amount: Number(row.amount || 0),
    discount_amount: Number(row.discount_amount || 0),
    final_amount: Number(row.final_amount || 0),
    due_date: String(row.due_date || '').split('T')[0],
    issued_at: String(row.issued_at || ''),
    paid_at: row.paid_at ? String(row.paid_at) : null,
    status: String(row.status || 'PENDENTE').toUpperCase() as SaasInvoiceStatus,
    payment_method: row.payment_method ? String(row.payment_method) : null,
    pix_code: row.pix_code ? String(row.pix_code) : null,
    pix_qrcode: row.pix_qrcode ? String(row.pix_qrcode) : null,
    external_charge_id: row.external_charge_id ? String(row.external_charge_id) : null,
    notes: row.notes ? String(row.notes) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    company_name: row.company_name ? String(row.company_name) : undefined,
    plan_label: row.plan_label ? String(row.plan_label) : undefined,
  };
}

async function generateNextInvoiceNumber(
  supabaseAdmin: SupabaseClient,
  referenceMonth: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('generate_next_saas_invoice_number', {
    p_reference_month: referenceMonth,
  });

  if (!error && typeof data === 'string' && data.length > 0) {
    return data;
  }

  const { data: existing } = await supabaseAdmin
    .from('master_saas_invoices')
    .select('invoice_number')
    .eq('reference_month', referenceMonth);

  let max = 0;
  for (const row of existing || []) {
    const match = String(row.invoice_number || '').match(INVOICE_NUMBER_PATTERN);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return formatSaasInvoiceNumber(max + 1, referenceMonth);
}

async function getActiveContractId(
  supabaseAdmin: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('company_contracts')
    .select('id')
    .eq('company_id', companyId)
    .in('status', ['active', 'generated', 'signed'])
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export type GenerateInvoiceOptions = {
  referenceMonth?: string;
  dueDate?: string;
  notes?: string | null;
  skipPix?: boolean;
};

/** Gera fatura para uma empresa (não duplica competência). */
export async function generateInvoiceForCompany(
  supabaseAdmin: SupabaseClient,
  company: CompanyPricingSource & { id: string; name?: string | null },
  subscription: CompanySubscription | null | undefined,
  options?: GenerateInvoiceOptions,
): Promise<{ invoice: MasterSaasInvoice | null; created: boolean; skipped?: string }> {
  if (!isBillableCompany(company)) {
    return { invoice: null, created: false, skipped: 'Empresa não faturável' };
  }

  const referenceMonth = options?.referenceMonth || currentReferenceMonth();
  const { data: existing } = await supabaseAdmin
    .from('master_saas_invoices')
    .select('*')
    .eq('company_id', company.id)
    .eq('reference_month', referenceMonth)
    .maybeSingle();

  if (existing) {
    const parsed = parseInvoiceRow(existing);
    if (isPhantomSaasInvoice(parsed)) {
      const repaired = await repairPhantomSaasInvoiceIfNeeded(
        supabaseAdmin,
        parsed,
        company,
        subscription,
        options,
      );
      return { invoice: repaired, created: false };
    }
    let withDueDate = await applyRequestedDueDateToExistingInvoice(
      supabaseAdmin,
      parsed,
      options?.dueDate,
    );
    withDueDate = await syncPendingInvoiceAmountsFromPricing(
      supabaseAdmin,
      withDueDate,
      company,
      subscription,
    );
    return { invoice: withDueDate, created: false, skipped: 'Competência já faturada' };
  }

  const amounts = computeInvoiceAmounts(company, subscription);
  const due_date = options?.dueDate
    ? resolveAsaasDueDate(options.dueDate)
    : resolveInvoiceDueDate(company, subscription, referenceMonth);
  const invoice_number = await generateNextInvoiceNumber(supabaseAdmin, referenceMonth);
  const contract_id = await getActiveContractId(supabaseAdmin, company.id);
  const now = new Date().toISOString();

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('master_saas_invoices')
    .insert({
      company_id: company.id,
      subscription_id: subscription?.id ?? null,
      contract_id,
      invoice_number,
      reference_month: referenceMonth,
      amount: amounts.amount,
      discount_amount: amounts.discount_amount,
      final_amount: amounts.final_amount,
      due_date,
      issued_at: now,
      status: 'PENDENTE',
      notes: options?.notes ?? null,
      updated_at: now,
    })
    .select('*')
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || 'Falha ao criar fatura');
  }

  let invoice = parseInvoiceRow(inserted);

  if (!options?.skipPix) {
    const provider = getGatewayBillingProvider();
    const pix = await provider.createPixCharge({
      companyId: company.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      amount: invoice.final_amount,
      dueDate: invoice.due_date,
      description: `SV LOTES — ${formatReferenceMonthLabel(referenceMonth)}`,
      payerName: company.name || undefined,
    });

    const { data: withPix } = await supabaseAdmin
      .from('master_saas_invoices')
      .update({
        pix_code: pix.pixCode,
        pix_qrcode: pix.pixQrCode,
        external_charge_id: pix.externalChargeId,
        payment_method: 'pix',
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice.id)
      .select('*')
      .single();

    if (withPix) invoice = parseInvoiceRow(withPix);
  }

  if (subscription?.id) {
    await supabaseAdmin
      .from('company_subscriptions')
      .update({
        payment_status: 'pending',
        updated_at: now,
      })
      .eq('id', subscription.id);
  }

  return { invoice, created: true };
}

export type GenerateMonthlyInvoicesResult = {
  created: number;
  skipped: number;
  errors: string[];
  invoices: MasterSaasInvoice[];
};

/** Gera cobranças mensais para todas as empresas faturáveis (sem duplicar competência). */
export async function generateMonthlyInvoices(
  supabaseAdmin: SupabaseClient,
  options?: { referenceMonth?: string },
): Promise<GenerateMonthlyInvoicesResult> {
  const referenceMonth = options?.referenceMonth || currentReferenceMonth();
  const result: GenerateMonthlyInvoicesResult = {
    created: 0,
    skipped: 0,
    errors: [],
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
  const subMap = new Map((subscriptions || []).map((s) => [s.company_id, s as CompanySubscription]));

  for (const company of companies || []) {
    if (!isBillableCompany(company)) continue;

    const subscription = subMap.get(company.id) ?? null;
    try {
      const gen = await generateInvoiceForCompany(
        supabaseAdmin,
        company as CompanyPricingSource & { id: string; name?: string | null },
        subscription,
        { referenceMonth },
      );
      if (gen.created && gen.invoice) {
        result.created += 1;
        result.invoices.push(gen.invoice);
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

/** Marca faturas PENDENTE com vencimento passado como VENCIDO. */
export async function markOverdueInvoices(
  supabaseAdmin: SupabaseClient,
  today = todayIsoDate(),
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('master_saas_invoices')
    .update({
      status: 'VENCIDO',
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'PENDENTE')
    .lt('due_date', today)
    .select('id');

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

function daysBetweenIso(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Empresa elegível para suspensão automática (> graceDays após vencimento). */
export function isInvoiceEligibleForSuspension(
  dueDate: string,
  today: string,
  graceDays = SAAS_AUTO_SUSPEND_AFTER_DAYS,
): boolean {
  const due = toIsoDateOnly(dueDate);
  if (!due) return false;
  return daysBetweenIso(due, today) >= graceDays;
}

/** Suspende empresas com fatura VENCIDA há mais de SAAS_AUTO_SUSPEND_AFTER_DAYS dias. */
export async function suspendOverdueCompanies(
  supabaseAdmin: SupabaseClient,
  today = todayIsoDate(),
  graceDays = SAAS_AUTO_SUSPEND_AFTER_DAYS,
): Promise<string[]> {
  const { data: overdueInvoices } = await supabaseAdmin
    .from('master_saas_invoices')
    .select('company_id, due_date, reference_month')
    .eq('status', 'VENCIDO');

  const companyIds = new Set<string>();
  for (const inv of overdueInvoices || []) {
    const due = toIsoDateOnly(inv.due_date);
    if (!due) continue;
    if (!isInvoiceEligibleForSuspension(due, today, graceDays)) continue;

    const ref = String(inv.reference_month || referenceMonthFromDate(due));
    const existing = await findExistingSaasPaymentForReference(
      supabaseAdmin,
      inv.company_id,
      ref,
    );
    if (existing) continue;

    companyIds.add(inv.company_id);
  }

  const suspended: string[] = [];
  for (const companyId of companyIds) {
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('status_operacional, active')
      .eq('id', companyId)
      .maybeSingle();

    const op = (company?.status_operacional || '').toLowerCase();
    if (op === 'suspensa') continue;
    if (company?.active === false && op === 'suspensa') continue;
    if (op === 'inativo' || op === 'inativa') continue;

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
      description: `Empresa suspensa após ${graceDays} dias de inadimplência (fatura vencida)`,
      reference_id: companyId,
    });

    suspended.push(companyId);
  }

  return suspended;
}

/** Pagamento confirmado para company + competência (idempotência). */
export async function findExistingSaasPaymentForReference(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  referenceMonth: string,
): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from('master_saas_payments')
    .select('id, amount')
    .eq('company_id', companyId)
    .eq('reference_month', referenceMonth)
    .eq('status', 'paid')
    .maybeSingle();

  if (!data?.id) return null;
  if (Number(data.amount || 0) <= 0) return null;
  return { id: String(data.id) };
}

/**
 * Pagamento manual/gateway que realmente confirma a competência — bloqueia nova cobrança.
 * Registro órfão (fatura não PAGO e sem cobrança PAID vinculada) não bloqueia regeneração.
 */
export async function findConfirmedSaasPaymentForReference(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  referenceMonth: string,
  invoiceId?: string | null,
): Promise<{ id: string } | null> {
  const existing = await findExistingSaasPaymentForReference(
    supabaseAdmin,
    companyId,
    referenceMonth,
  );
  if (!existing) return null;

  let invoiceStatus = '';
  if (invoiceId) {
    const { data: inv } = await supabaseAdmin
      .from('master_saas_invoices')
      .select('status')
      .eq('id', invoiceId)
      .maybeSingle();
    invoiceStatus = String(inv?.status || '').toUpperCase();
  } else {
    const { data: inv } = await supabaseAdmin
      .from('master_saas_invoices')
      .select('status')
      .eq('company_id', companyId)
      .eq('reference_month', referenceMonth)
      .maybeSingle();
    invoiceStatus = String(inv?.status || '').toUpperCase();
  }

  if (invoiceStatus === 'PAGO') return existing;

  const { data: linkedCharge } = await supabaseAdmin
    .from('saas_charges')
    .select('status, deleted_at')
    .eq('company_id', companyId)
    .eq('master_payment_id', existing.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (
    linkedCharge &&
    String(linkedCharge.status || '').toUpperCase() === 'PAID'
  ) {
    return existing;
  }

  return null;
}

/** Contagem de pagamentos paid na competência (diagnóstico). */
export async function countPaidSaasPaymentsForReference(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  referenceMonth: string,
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('master_saas_payments')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('reference_month', referenceMonth)
    .eq('status', 'paid');

  if (error) return 0;
  return count ?? 0;
}

/** Avança próximo vencimento após pagamento confirmado da competência. */
export async function advanceSubscriptionAfterSaasPayment(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  referenceMonth: string,
): Promise<void> {
  const { data: sub } = await supabaseAdmin
    .from('company_subscriptions')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle();

  if (!sub?.id) return;

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('subscription_due_day')
    .eq('id', companyId)
    .maybeSingle();

  const [yRaw, mRaw] = referenceMonth.split('-').map(Number);
  const y = yRaw || new Date().getFullYear();
  const m = mRaw || new Date().getMonth() + 1;
  const dueDayRaw = Number(company?.subscription_due_day);
  const dueDay =
    Number.isFinite(dueDayRaw) && dueDayRaw >= 1 && dueDayRaw <= 31
      ? dueDayRaw
      : new Date(`${referenceMonth}-15T12:00:00`).getDate();
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(Math.max(dueDay, 1), lastDay);
  const referenceDue = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const nextDue = addOneMonthToIsoDate(referenceDue);
  const now = new Date().toISOString();

  await supabaseAdmin
    .from('company_subscriptions')
    .update({
      payment_status: 'paid',
      contract_status: 'active',
      next_due_date: nextDue,
      updated_at: now,
    })
    .eq('id', sub.id);

  await supabaseAdmin
    .from('companies')
    .update({
      ...companyNextPaymentPatch(nextDue),
      updated_at: now,
    })
    .eq('id', companyId);
}

/** Reativa empresa após pagamento de fatura. */
export async function reactivateCompanyOnPayment(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  options?: { skipSubscriptionDates?: boolean },
): Promise<void> {
  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('status_operacional')
    .eq('id', companyId)
    .maybeSingle();

  const status = (company?.status_operacional || '').toLowerCase();
  if (status !== 'suspensa' && status !== 'inadimplente') return;

  const { data: openOverdue } = await supabaseAdmin
    .from('master_saas_invoices')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'VENCIDO')
    .limit(1);

  if ((openOverdue || []).length > 0) return;

  await supabaseAdmin
    .from('companies')
    .update({
      status_operacional: 'Ativa',
      active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId);

  const { data: sub } = await supabaseAdmin
    .from('company_subscriptions')
    .select('id, next_due_date')
    .eq('company_id', companyId)
    .maybeSingle();

  if (sub?.id) {
    const subUpdate: Record<string, unknown> = {
      contract_status: 'active',
      payment_status: 'paid',
      updated_at: new Date().toISOString(),
    };

    if (!options?.skipSubscriptionDates) {
      const nextDue = sub.next_due_date
        ? addOneMonthToIsoDate(String(sub.next_due_date).split('T')[0])
        : addOneMonthToIsoDate(todayIsoDate());
      subUpdate.next_due_date = nextDue;

      await supabaseAdmin
        .from('companies')
        .update({
          ...companyNextPaymentPatch(nextDue),
          updated_at: new Date().toISOString(),
        })
        .eq('id', companyId);
    }

    await supabaseAdmin.from('company_subscriptions').update(subUpdate).eq('id', sub.id);
  }

  await supabaseAdmin.from('audit_logs').insert({
    tenant_id: companyId,
    company_id: companyId,
    module: 'SAAS_BILLING',
    action: 'SAAS_COMPANY_AUTO_REACTIVATED',
    description: 'Empresa reativada automaticamente após confirmação de pagamento SaaS',
    reference_id: companyId,
  });
}

export type MarkInvoicePaidInput = {
  invoiceId: string;
  paidAt?: string;
  paymentMethod?: string;
  notes?: string | null;
  createdBy?: string | null;
};

/** Marca fatura como PAGO e registra pagamento em master_saas_payments. */
export async function markInvoicePaid(
  supabaseAdmin: SupabaseClient,
  input: MarkInvoicePaidInput,
): Promise<{ invoice: MasterSaasInvoice; paymentId: string }> {
  const paidAt = input.paidAt || todayIsoDate();
  const now = new Date().toISOString();

  const { data: invoice, error: invErr } = await supabaseAdmin
    .from('master_saas_invoices')
    .select('*')
    .eq('id', input.invoiceId)
    .single();

  if (invErr || !invoice) {
    throw new Error(invErr?.message || 'Fatura não encontrada');
  }

  const existing = await findExistingSaasPaymentForReference(
    supabaseAdmin,
    String(invoice.company_id),
    String(invoice.reference_month),
  );

  if (existing) {
    const invoiceStatus = String(invoice.status || '').toUpperCase();
    let parsed = parseInvoiceRow(invoice);

    if (invoiceStatus !== 'PAGO') {
      const { data: updated, error: updErr } = await supabaseAdmin
        .from('master_saas_invoices')
        .update({
          status: 'PAGO',
          paid_at: `${paidAt}T12:00:00.000Z`,
          payment_method: input.paymentMethod || invoice.payment_method || 'manual',
          updated_at: now,
        })
        .eq('id', input.invoiceId)
        .select('*')
        .single();

      if (updErr || !updated) {
        throw new Error(updErr?.message || 'Falha ao atualizar fatura');
      }
      parsed = parseInvoiceRow(updated);
    }

    if (invoice.subscription_id) {
      await supabaseAdmin
        .from('company_subscriptions')
        .update({
          payment_status: 'paid',
          updated_at: now,
        })
        .eq('id', invoice.subscription_id);
    }

    await advanceSubscriptionAfterSaasPayment(
      supabaseAdmin,
      String(invoice.company_id),
      String(invoice.reference_month),
    );
    await reactivateCompanyOnPayment(supabaseAdmin, String(invoice.company_id), {
      skipSubscriptionDates: true,
    });

    await ensureSaasCashAfterInvoicePaid(supabaseAdmin, {
      invoiceId: input.invoiceId,
      paymentId: existing.id,
      paidAt,
      amount: Number(invoice.final_amount || 0),
      companyId: String(invoice.company_id),
      referenceMonth: String(invoice.reference_month),
      createdBy: input.createdBy ?? null,
    });

    return { invoice: parsed, paymentId: existing.id };
  }

  const { data: payment, error: payErr } = await supabaseAdmin
    .from('master_saas_payments')
    .insert({
      company_id: invoice.company_id,
      subscription_id: invoice.subscription_id,
      amount: invoice.final_amount,
      paid_at: paidAt,
      payment_method: input.paymentMethod || invoice.payment_method || 'manual',
      reference_month: invoice.reference_month,
      status: 'paid',
      notes: input.notes || `Pagamento fatura ${invoice.invoice_number}`,
      created_by: input.createdBy ?? null,
    })
    .select('id')
    .single();

  if (payErr || !payment) {
    throw new Error(payErr?.message || 'Falha ao registrar pagamento');
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('master_saas_invoices')
    .update({
      status: 'PAGO',
      paid_at: `${paidAt}T12:00:00.000Z`,
      payment_method: input.paymentMethod || invoice.payment_method || 'manual',
      updated_at: now,
    })
    .eq('id', input.invoiceId)
    .select('*')
    .single();

  if (updErr || !updated) {
    throw new Error(updErr?.message || 'Falha ao atualizar fatura');
  }

  if (invoice.subscription_id) {
    await supabaseAdmin
      .from('company_subscriptions')
      .update({
        payment_status: 'paid',
        updated_at: now,
      })
      .eq('id', invoice.subscription_id);
  }

  await advanceSubscriptionAfterSaasPayment(
    supabaseAdmin,
    String(invoice.company_id),
    String(invoice.reference_month),
  );
  await reactivateCompanyOnPayment(supabaseAdmin, invoice.company_id, {
    skipSubscriptionDates: true,
  });

  await ensureSaasCashAfterInvoicePaid(supabaseAdmin, {
    invoiceId: input.invoiceId,
    paymentId: payment.id,
    paidAt,
    amount: Number(invoice.final_amount || 0),
    companyId: String(invoice.company_id),
    referenceMonth: String(invoice.reference_month),
    createdBy: input.createdBy ?? null,
  });

  return {
    invoice: parseInvoiceRow(updated),
    paymentId: payment.id,
  };
}

export function computeSaasBillingMetrics(
  invoices: MasterSaasInvoice[],
  mrrProjected = 0,
  paymentsReceivedTotal = 0,
  today = todayIsoDate(),
): SaasBillingMetrics {
  let receivedFromInvoices = 0;
  let revenueToReceive = 0;
  let overdueRevenue = 0;
  let pendingCount = 0;
  let overdueCount = 0;
  let dueSoonCount = 0;

  for (const inv of invoices) {
    const status = String(inv.status || '').toUpperCase();

    if (status === 'PAGO' && inv.paid_at) {
      receivedFromInvoices += inv.final_amount;
    }

    if (status === 'PENDENTE') {
      const due = toIsoDateOnly(inv.due_date) || inv.due_date;
      if (due >= today) {
        revenueToReceive += inv.final_amount;
        pendingCount += 1;
        const days = daysBetweenIso(today, due);
        if (days >= 0 && days <= 7) dueSoonCount += 1;
      } else {
        overdueRevenue += inv.final_amount;
        overdueCount += 1;
      }
    }

    if (status === 'VENCIDO') {
      overdueRevenue += inv.final_amount;
      overdueCount += 1;
    }
  }

  const receivedRevenue =
    paymentsReceivedTotal > 0 ? paymentsReceivedTotal : receivedFromInvoices;

  return {
    projectedRevenue: mrrProjected,
    receivedRevenue,
    revenueToReceive,
    overdueRevenue,
    delinquencyAmount: overdueRevenue,
    pendingCount,
    overdueCount,
    dueSoonCount,
    suspendedCount: 0,
  };
}

export function formatInvoiceStatusDetail(
  invoice: Pick<MasterSaasInvoice, 'status' | 'due_date' | 'paid_at'>,
  formatDate: (iso?: string | null) => string = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
  },
): string {
  const status = String(invoice.status || '').toUpperCase();
  if (status === 'PAGO') {
    return `Pago em ${formatDate(invoice.paid_at || invoice.due_date)}`;
  }
  if (status === 'PENDENTE') {
    return `Aguardando pagamento até ${formatDate(invoice.due_date)}`;
  }
  if (status === 'VENCIDO') {
    return 'Pagamento em atraso';
  }
  if (status === 'CANCELADO') {
    return 'Cobrança cancelada';
  }
  return '—';
}

export function invoiceStatusBadgeTone(
  status: SaasInvoiceStatus | string,
): 'green' | 'amber' | 'red' | 'gray' {
  const key = String(status || '').toUpperCase();
  if (key === 'PAGO') return 'green';
  if (key === 'PENDENTE') return 'amber';
  if (key === 'VENCIDO') return 'red';
  return 'gray';
}

export function buildSaasBillingAlerts(
  invoices: MasterSaasInvoice[],
  companies: Array<{ id?: string; name?: string | null; status_operacional?: string | null }>,
  today = todayIsoDate(),
): SaasBillingAlerts {
  const dueInSevenDays = invoices.filter((inv) => {
    if (inv.status !== 'PENDENTE') return false;
    const days = daysBetweenIso(today, inv.due_date);
    return days >= 0 && days <= 7;
  });

  const overdue = invoices.filter((inv) => inv.status === 'VENCIDO');

  const delinquentCompanies = overdue.map((inv) => ({
    companyId: inv.company_id,
    companyName: inv.company_name || '—',
    daysLate: Math.max(0, daysBetweenIso(inv.due_date, today)),
  }));

  const suspendedCompanies = companies
    .filter((c) => (c.status_operacional || '').toLowerCase() === 'suspensa')
    .map((c) => ({
      companyId: String(c.id || ''),
      companyName: c.name || '—',
    }));

  return { dueInSevenDays, overdue, delinquentCompanies, suspendedCompanies };
}

export function invoiceStatusLabel(status: SaasInvoiceStatus | string): string {
  const key = String(status || '').toUpperCase();
  if (key === 'PAGO') return 'Pago';
  if (key === 'VENCIDO') return 'Vencido';
  if (key === 'CANCELADO') return 'Cancelado';
  return 'Pendente';
}

export async function listMasterSaasInvoices(
  supabaseAdmin: SupabaseClient,
  filters?: {
    companyId?: string;
    referenceMonth?: string;
    status?: string;
    limit?: number;
  },
): Promise<MasterSaasInvoice[]> {
  let query = supabaseAdmin
    .from('master_saas_invoices')
    .select('*')
    .order('due_date', { ascending: false })
    .limit(filters?.limit ?? 500);

  if (filters?.companyId) query = query.eq('company_id', filters.companyId);
  if (filters?.referenceMonth) query = query.eq('reference_month', filters.referenceMonth);
  if (filters?.status) query = query.eq('status', filters.status.toUpperCase());

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data || []).map(parseInvoiceRow);
  const companyIds = [...new Set(rows.map((r) => r.company_id))];

  const { data: companies } = companyIds.length
    ? await supabaseAdmin.from('companies').select('id, name, plan, plan_type').in('id', companyIds)
    : { data: [] };

  const companyMap = Object.fromEntries(
    (companies || []).map((c) => [
      c.id,
      { name: c.name, plan: c.plan || c.plan_type },
    ]),
  );

  return rows.map((row) => ({
    ...row,
    company_name: companyMap[row.company_id]?.name || '—',
    plan_label: companyMap[row.company_id]?.plan || '—',
  }));
}

/** Pipeline diário: vencimento → suspensão. */
export async function runSaasBillingMaintenance(
  supabaseAdmin: SupabaseClient,
): Promise<{
  overdueMarked: number;
  chargesOverdueMarked: number;
  suspended: string[];
}> {
  const overdueMarked = await markOverdueInvoices(supabaseAdmin);
  let chargesOverdueMarked = 0;
  try {
    const { markOverdueSaasCharges } = await import('@/lib/saasCharges');
    chargesOverdueMarked = await markOverdueSaasCharges(supabaseAdmin);
  } catch {
    chargesOverdueMarked = 0;
  }
  const suspended = await suspendOverdueCompanies(supabaseAdmin, todayIsoDate(), SAAS_AUTO_SUSPEND_AFTER_DAYS);
  return { overdueMarked, chargesOverdueMarked, suspended };
}

export { referenceMonthFromDate, formatReferenceMonthLabel };

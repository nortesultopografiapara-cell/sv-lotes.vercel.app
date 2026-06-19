/**
 * Cobranças SaaS (saas_charges) — PIX real via providers desacoplados.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getPaymentProvider, mapProviderStatusToChargeStatus } from '@/lib/payments/providers';
import { assertSaasPaymentGatewayConfigured } from '@/lib/saasPaymentGateway';
import {
  currentReferenceMonth,
  generateInvoiceForCompany,
  markInvoicePaid,
  reactivateCompanyOnPayment,
  type MasterSaasInvoice,
} from '@/lib/saasBilling';
import { isBillableCompany } from '@/lib/companyPricing';
import { todayIsoDate } from '@/lib/companySubscriptionDates';
import { updateCompanyFinancialStatus } from '@/lib/saasCompanyFinancialStatus';
import { referenceMonthFromDate } from '@/lib/masterSaasPayments';
import type { CompanySubscription } from '@/lib/saasSubscription';
import type { CompanyPricingSource } from '@/lib/companyPricing';

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
  paid_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  company_name?: string;
  plan_label?: string;
};

function parseChargeRow(row: Record<string, unknown>): SaasCharge {
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
    paid_at: row.paid_at ? String(row.paid_at) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
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
  let query = supabaseAdmin
    .from('saas_charges')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 200);

  if (filters?.companyId) query = query.eq('company_id', filters.companyId);
  if (filters?.status) query = query.eq('status', filters.status.toUpperCase());

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data || []).map((r) => parseChargeRow(r as Record<string, unknown>));
  const companyIds = [...new Set(rows.map((r) => r.company_id))];
  const { data: companies } = companyIds.length
    ? await supabaseAdmin.from('companies').select('id, name, plan, plan_type').in('id', companyIds)
    : { data: [] };

  const companyMap = Object.fromEntries(
    (companies || []).map((c) => [c.id, { name: c.name, plan: c.plan || c.plan_type }]),
  );

  return rows.map((row) => ({
    ...row,
    company_name: companyMap[row.company_id]?.name || '—',
    plan_label: companyMap[row.company_id]?.plan || '—',
  }));
}

export async function markOverdueSaasCharges(
  supabaseAdmin: SupabaseClient,
  today = todayIsoDate(),
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('saas_charges')
    .update({ status: 'OVERDUE', updated_at: new Date().toISOString() })
    .eq('status', 'PENDING')
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
};

export type SaasPixChargeOutcome = 'created' | 'completed' | 'skipped';

export type CreateSaasPixChargeResult = {
  charge: SaasCharge;
  invoice: MasterSaasInvoice | null;
  created: boolean;
  skipped?: string;
  outcome?: SaasPixChargeOutcome;
  invoiceCreated?: boolean;
};

const ACTIVE_SAAS_CHARGE_STATUSES = ['PENDING', 'OVERDUE', 'PAID'] as const;

/** Evita duplicar cobrança Asaas para a mesma fatura. */
export function resolveSaasPixChargeSkipReason(
  invoice: Pick<MasterSaasInvoice, 'external_charge_id'>,
  existingCharge: Pick<SaasCharge, 'status'> | null,
): string | null {
  if (String(invoice.external_charge_id || '').trim()) {
    return 'Fatura já possui cobrança Asaas';
  }
  if (
    existingCharge &&
    ACTIVE_SAAS_CHARGE_STATUSES.includes(
      String(existingCharge.status).toUpperCase() as (typeof ACTIVE_SAAS_CHARGE_STATUSES)[number],
    )
  ) {
    return 'Cobrança PIX já existe para esta fatura';
  }
  return null;
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
  const invoice = invoiceResult.invoice;
  if (!invoice) {
    return {
      charge: null as unknown as SaasCharge,
      invoice: null,
      created: false,
      skipped: invoiceResult.skipped || 'Não foi possível gerar fatura',
      outcome: 'skipped',
      invoiceCreated: false,
    };
  }

  const { data: existingCharge } = await supabaseAdmin
    .from('saas_charges')
    .select('*')
    .eq('invoice_id', invoice.id)
    .in('status', [...ACTIVE_SAAS_CHARGE_STATUSES])
    .maybeSingle();

  const skipReason = resolveSaasPixChargeSkipReason(
    invoice,
    existingCharge ? parseChargeRow(existingCharge as Record<string, unknown>) : null,
  );
  if (skipReason) {
    return {
      charge: existingCharge
        ? parseChargeRow(existingCharge as Record<string, unknown>)
        : (null as unknown as SaasCharge),
      invoice,
      created: false,
      skipped: skipReason,
      outcome: 'skipped',
      invoiceCreated,
    };
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('saas_charges')
    .insert({
      company_id: company.id,
      subscription_id: subscription?.id ?? invoice.subscription_id ?? null,
      invoice_id: invoice.id,
      amount: invoice.final_amount,
      due_date: invoice.due_date,
      status: 'PENDING',
      payment_provider: 'pending',
      updated_at: now,
    })
    .select('*')
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || 'Falha ao criar cobrança SaaS');
  }

  let charge = parseChargeRow(inserted as Record<string, unknown>);
  const provider = getPaymentProvider();

  const pix = await provider.createPixCharge({
    companyId: company.id,
    chargeId: charge.id,
    amount: charge.amount,
    dueDate: charge.due_date,
    description: `SV LOTES — Assinatura ${invoice.reference_month}`,
    payerName: company.name || undefined,
    payerDocument: company.cnpj || undefined,
    payerEmail: company.email || undefined,
  });

  const { data: withPix, error: pixErr } = await supabaseAdmin
    .from('saas_charges')
    .update({
      payment_provider: pix.provider,
      payment_id: pix.paymentId,
      pix_qr_code: pix.pixQrCode,
      pix_copy_paste: pix.pixCopyPaste,
      payment_url: pix.paymentUrl,
      status: mapProviderStatusToChargeStatus(pix.status),
      updated_at: new Date().toISOString(),
    })
    .eq('id', charge.id)
    .select('*')
    .single();

  if (pixErr || !withPix) {
    throw new Error(pixErr?.message || 'Falha ao anexar PIX à cobrança');
  }

  charge = parseChargeRow(withPix as Record<string, unknown>);

  await supabaseAdmin
    .from('master_saas_invoices')
    .update({
      pix_code: charge.pix_copy_paste,
      pix_qrcode: charge.pix_qr_code,
      external_charge_id: charge.payment_id,
      payment_method: 'pix',
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoice.id);

  if (options?.actorUserId) {
    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: company.id,
      company_id: company.id,
      user_id: options.actorUserId,
      module: 'SAAS_BILLING',
      action: 'SAAS_CHARGE_CREATED',
      description: `Cobrança PIX ${charge.id.slice(0, 8)} — ${invoice.invoice_number}`,
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

/** Confirma pagamento PIX — registra master_saas_payments e reativa empresa. */
export async function processSaasChargePaid(
  supabaseAdmin: SupabaseClient,
  input: ProcessChargePaidInput,
): Promise<{ charge: SaasCharge; paymentId: string }> {
  let query = supabaseAdmin.from('saas_charges').select('*');
  if (input.chargeId) query = query.eq('id', input.chargeId);
  else if (input.paymentId) query = query.eq('payment_id', input.paymentId);
  else throw new Error('chargeId ou paymentId obrigatório.');

  const { data: row, error } = await query.maybeSingle();
  if (error || !row) throw new Error('Cobrança não encontrada.');

  const charge = parseChargeRow(row as Record<string, unknown>);
  if (charge.status === 'PAID' && charge.master_payment_id) {
    return { charge, paymentId: charge.master_payment_id };
  }

  const paidAt = input.paidAt || todayIsoDate();
  const now = new Date().toISOString();
  let masterPaymentId = charge.master_payment_id || null;

  if (charge.invoice_id) {
    const paid = await markInvoicePaid(supabaseAdmin, {
      invoiceId: charge.invoice_id,
      paidAt,
      paymentMethod: 'pix',
      notes: `PIX webhook — charge ${charge.id}`,
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

  if (!charge.invoice_id) {
    await reactivateCompanyOnPayment(supabaseAdmin, charge.company_id);
  }

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

  return {
    charge: parseChargeRow(updated as Record<string, unknown>),
    paymentId: masterPaymentId!,
  };
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

  const charge = parseChargeRow(row as Record<string, unknown>);
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

  return parseChargeRow(updated as Record<string, unknown>);
}

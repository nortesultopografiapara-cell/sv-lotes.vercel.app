/**
 * Execução diária dos lembretes automáticos de cobrança SaaS.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BRAZIL_TIMEZONE, addDaysToIsoDate, todayBrazilIsoDate } from '@/lib/companySubscriptionDates';
import { referenceMonthFromDate } from '@/lib/masterSaasPayments';
import { hasSaasChargeRealPixData } from '@/lib/saasCharges';
import {
  isSaasBillingEmailConfigured,
  sendSaasBillingReminderEmail,
} from '@/lib/saasBillingReminderEmail';
import {
  isSaasBillingWhatsAppConfigured,
  normalizeBrazilianWhatsAppPhone,
  sendSaasBillingReminderWhatsApp,
} from '@/lib/saasBillingReminderWhatsApp';
import {
  getSaasBillingReminderDefinition,
  isSaasChargeStatusBlockedForReminder,
  isSaasChargeStatusEligibleForReminder,
  resolveReminderTypesForCharge,
  SAAS_BILLING_REMINDER_DEFINITIONS,
  type SaasBillingReminderChannel,
  type SaasBillingReminderType,
} from '@/lib/saasBillingReminderTypes';

export type SaasBillingReminderCandidate = {
  chargeId: string;
  companyId: string;
  companyName: string;
  companyEmail: string | null;
  companyPhone: string | null;
  amount: number;
  dueDate: string;
  status: string;
  paymentId: string | null;
  paymentUrl: string | null;
  referenceMonth: string;
};

export type SaasBillingReminderRunItem = {
  chargeId: string;
  companyId: string;
  companyName?: string;
  dueDate?: string;
  reminderType: SaasBillingReminderType;
  automationKey?: string;
  channel: SaasBillingReminderChannel;
  outcome: 'sent' | 'skipped' | 'failed' | 'duplicate';
  sentTo?: string | null;
  message?: string;
};

export type SaasBillingReminderAutomationSummary = {
  automationKey: string;
  reminderType: SaasBillingReminderType;
  channel: SaasBillingReminderChannel;
  targetDueDate: string;
  chargesMatched: number;
  sent: number;
  skipped: number;
  failed: number;
  duplicates: number;
};

export type SaasBillingReminderRunResult = {
  runDate: string;
  timezone: string;
  candidatesFound: number;
  candidatesExcluded: number;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  duplicates: number;
  automations: SaasBillingReminderAutomationSummary[];
  excluded: Array<{
    chargeId: string;
    companyId: string;
    companyName: string;
    dueDate: string;
    reason: string;
  }>;
  items: SaasBillingReminderRunItem[];
};

export type SaasBillingReminderAutomationStat = {
  automationId: string;
  reminderType: SaasBillingReminderType;
  channel: SaasBillingReminderChannel;
  totalSent: number;
  lastSentAt: string | null;
  lastSentTo: string | null;
};

function resolvePaymentUrl(charge: Record<string, unknown>): string | null {
  return (
    String(charge.invoice_url || charge.payment_url || charge.bank_slip_url || '').trim() || null
  );
}

export async function listSaasBillingReminderCandidates(
  supabaseAdmin: SupabaseClient,
): Promise<SaasBillingReminderCandidate[]> {
  const { data: charges, error } = await supabaseAdmin
    .from('saas_charges')
    .select(
      'id, company_id, amount, due_date, status, payment_id, payment_url, invoice_url, bank_slip_url, pix_copy_paste, invoice_id, created_at',
    )
    .is('deleted_at', null)
    .in('status', ['PENDING', 'OVERDUE'])
    .order('due_date', { ascending: true });

  if (error) throw new Error(error.message);
  if (!charges?.length) return [];

  const companyIds = [...new Set(charges.map((row) => String(row.company_id)))];
  const { data: companies, error: companyErr } = await supabaseAdmin
    .from('companies')
    .select('id, name, email, phone')
    .in('id', companyIds);

  if (companyErr) throw new Error(companyErr.message);

  const companyById = new Map(
    (companies || []).map((company) => [String(company.id), company]),
  );

  const invoiceIds = charges
    .map((row) => row.invoice_id)
    .filter(Boolean)
    .map(String);

  const invoiceMonthById = new Map<string, string>();
  if (invoiceIds.length) {
    const { data: invoices } = await supabaseAdmin
      .from('master_saas_invoices')
      .select('id, reference_month')
      .in('id', invoiceIds);
    for (const invoice of invoices || []) {
      invoiceMonthById.set(String(invoice.id), String(invoice.reference_month || ''));
    }
  }

  return charges
    .filter((row) => isSaasChargeStatusEligibleForReminder(String(row.status || '')))
    .filter((row) => !isSaasChargeStatusBlockedForReminder(String(row.status || '')))
    .filter((row) =>
      hasSaasChargeRealPixData({
        payment_id: row.payment_id ? String(row.payment_id) : null,
        pix_copy_paste: row.pix_copy_paste ? String(row.pix_copy_paste) : null,
        payment_url: row.payment_url ? String(row.payment_url) : null,
      }),
    )
    .map((row) => {
      const company = companyById.get(String(row.company_id));
      const invoiceId = row.invoice_id ? String(row.invoice_id) : '';
      const referenceMonth =
        invoiceMonthById.get(invoiceId) || referenceMonthFromDate(String(row.due_date || ''));

      return {
        chargeId: String(row.id),
        companyId: String(row.company_id),
        companyName: String(company?.name || 'Empresa'),
        companyEmail: company?.email ? String(company.email).trim() : null,
        companyPhone: company?.phone ? String(company.phone).trim() : null,
        amount: Number(row.amount || 0),
        dueDate: String(row.due_date || '').split('T')[0],
        status: String(row.status || 'PENDING').toUpperCase(),
        paymentId: row.payment_id ? String(row.payment_id) : null,
        paymentUrl: resolvePaymentUrl(row as Record<string, unknown>),
        referenceMonth,
      };
    });
}

export async function wasSaasBillingReminderSent(
  supabaseAdmin: SupabaseClient,
  chargeId: string,
  reminderType: SaasBillingReminderType,
  channel: SaasBillingReminderChannel = 'email',
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('saas_billing_reminder_logs')
    .select('id')
    .eq('saas_charge_id', chargeId)
    .eq('reminder_type', reminderType)
    .eq('channel', channel)
    .eq('status', 'sent')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data?.id;
}

async function insertSaasBillingReminderLog(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string;
    chargeId: string;
    paymentId: string | null;
    reminderType: SaasBillingReminderType;
    channel: SaasBillingReminderChannel;
    sentTo: string | null;
    status: 'sent' | 'failed';
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabaseAdmin.from('saas_billing_reminder_logs').insert({
    company_id: input.companyId,
    saas_charge_id: input.chargeId,
    asaas_payment_id: input.paymentId,
    reminder_type: input.reminderType,
    channel: input.channel,
    sent_to: input.sentTo,
    status: input.status,
    error_message: input.errorMessage || null,
    metadata: input.metadata || null,
    sent_at: new Date().toISOString(),
  });

  if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
    throw new Error(error.message);
  }
}

async function insertSaasBillingReminderAudit(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string;
    chargeId: string;
    reminderType: SaasBillingReminderType;
    channel: SaasBillingReminderChannel;
    sentTo: string;
    ok: boolean;
    errorMessage?: string;
  },
): Promise<void> {
  const definition = getSaasBillingReminderDefinition(input.reminderType);
  const action =
    input.channel === 'whatsapp'
      ? input.ok
        ? 'SAAS_BILLING_REMINDER_WHATSAPP'
        : 'SAAS_BILLING_REMINDER_WHATSAPP_FAILED'
      : input.ok
        ? 'SAAS_BILLING_REMINDER_EMAIL'
        : 'SAAS_BILLING_REMINDER_EMAIL_FAILED';

  await supabaseAdmin.from('audit_logs').insert({
    tenant_id: input.companyId,
    company_id: input.companyId,
    module: 'SAAS_BILLING',
    action,
    description: input.ok
      ? `${definition.label} (${input.channel}) enviado para ${input.sentTo}`
      : `${definition.label} (${input.channel}) falhou para ${input.sentTo}: ${input.errorMessage || 'erro'}`,
    reference_id: input.chargeId,
  });
}

export async function processSaasBillingReminderForCharge(
  supabaseAdmin: SupabaseClient,
  candidate: SaasBillingReminderCandidate,
  reminderType: SaasBillingReminderType,
  options?: { dryRun?: boolean },
): Promise<SaasBillingReminderRunItem> {
  const channel: SaasBillingReminderChannel = 'email';
  const baseItem: SaasBillingReminderRunItem = {
    chargeId: candidate.chargeId,
    companyId: candidate.companyId,
    reminderType,
    channel,
    outcome: 'skipped',
  };

  if (!candidate.companyEmail?.includes('@')) {
    return { ...baseItem, message: 'Empresa sem e-mail válido.' };
  }

  if (!isSaasBillingEmailConfigured()) {
    return { ...baseItem, message: 'RESEND_API_KEY não configurada.' };
  }

  const duplicate = await wasSaasBillingReminderSent(
    supabaseAdmin,
    candidate.chargeId,
    reminderType,
    channel,
  );
  if (duplicate) {
    return { ...baseItem, outcome: 'duplicate', sentTo: candidate.companyEmail };
  }

  if (options?.dryRun) {
    return {
      ...baseItem,
      outcome: 'skipped',
      sentTo: candidate.companyEmail,
      message: 'dryRun',
    };
  }

  const emailResult = await sendSaasBillingReminderEmail({
    to: candidate.companyEmail,
    companyName: candidate.companyName,
    amount: candidate.amount,
    dueDate: candidate.dueDate,
    referenceMonth: candidate.referenceMonth,
    paymentUrl: candidate.paymentUrl,
    reminderType,
  });

  if (!emailResult.ok) {
    await insertSaasBillingReminderLog(supabaseAdmin, {
      companyId: candidate.companyId,
      chargeId: candidate.chargeId,
      paymentId: candidate.paymentId,
      reminderType,
      channel,
      sentTo: candidate.companyEmail,
      status: 'failed',
      errorMessage: emailResult.error || 'Falha no envio',
    });
    await insertSaasBillingReminderAudit(supabaseAdmin, {
      companyId: candidate.companyId,
      chargeId: candidate.chargeId,
      reminderType,
      channel,
      sentTo: candidate.companyEmail,
      ok: false,
      errorMessage: emailResult.error,
    });
    return {
      ...baseItem,
      outcome: 'failed',
      sentTo: candidate.companyEmail,
      message: emailResult.error,
    };
  }

  await insertSaasBillingReminderLog(supabaseAdmin, {
    companyId: candidate.companyId,
    chargeId: candidate.chargeId,
    paymentId: candidate.paymentId,
    reminderType,
    channel,
    sentTo: candidate.companyEmail,
    status: 'sent',
    metadata: { providerId: emailResult.providerId || null },
  });
  await insertSaasBillingReminderAudit(supabaseAdmin, {
    companyId: candidate.companyId,
    chargeId: candidate.chargeId,
    reminderType,
    channel,
    sentTo: candidate.companyEmail,
    ok: true,
  });

  return {
    ...baseItem,
    outcome: 'sent',
    sentTo: candidate.companyEmail,
  };
}

export async function processSaasBillingReminderWhatsAppForCharge(
  supabaseAdmin: SupabaseClient,
  candidate: SaasBillingReminderCandidate,
  reminderType: SaasBillingReminderType,
  options?: { dryRun?: boolean },
): Promise<SaasBillingReminderRunItem> {
  const channel: SaasBillingReminderChannel = 'whatsapp';
  const normalizedPhone = normalizeBrazilianWhatsAppPhone(candidate.companyPhone);
  const baseItem: SaasBillingReminderRunItem = {
    chargeId: candidate.chargeId,
    companyId: candidate.companyId,
    reminderType,
    channel,
    outcome: 'skipped',
  };

  if (!normalizedPhone) {
    return { ...baseItem, message: 'Empresa sem telefone válido.' };
  }

  if (!candidate.paymentUrl) {
    return { ...baseItem, message: 'Cobrança sem link Asaas.' };
  }

  if (!isSaasChargeStatusEligibleForReminder(candidate.status)) {
    return { ...baseItem, message: 'Status da cobrança não elegível.' };
  }

  if (!isSaasBillingWhatsAppConfigured()) {
    return { ...baseItem, message: 'Z-API não configurada.' };
  }

  const duplicate = await wasSaasBillingReminderSent(
    supabaseAdmin,
    candidate.chargeId,
    reminderType,
    channel,
  );
  if (duplicate) {
    return { ...baseItem, outcome: 'duplicate', sentTo: normalizedPhone };
  }

  if (options?.dryRun) {
    return {
      ...baseItem,
      outcome: 'skipped',
      sentTo: normalizedPhone,
      message: 'dryRun',
    };
  }

  const whatsappResult = await sendSaasBillingReminderWhatsApp({
    phone: candidate.companyPhone || '',
    companyName: candidate.companyName,
    amount: candidate.amount,
    dueDate: candidate.dueDate,
    paymentUrl: candidate.paymentUrl,
    reminderType,
  });

  if (!whatsappResult.ok) {
    await insertSaasBillingReminderLog(supabaseAdmin, {
      companyId: candidate.companyId,
      chargeId: candidate.chargeId,
      paymentId: candidate.paymentId,
      reminderType,
      channel,
      sentTo: normalizedPhone,
      status: 'failed',
      errorMessage: whatsappResult.error || 'Falha no envio',
    });
    await insertSaasBillingReminderAudit(supabaseAdmin, {
      companyId: candidate.companyId,
      chargeId: candidate.chargeId,
      reminderType,
      channel,
      sentTo: normalizedPhone,
      ok: false,
      errorMessage: whatsappResult.error,
    });
    return {
      ...baseItem,
      outcome: 'failed',
      sentTo: normalizedPhone,
      message: whatsappResult.error,
    };
  }

  await insertSaasBillingReminderLog(supabaseAdmin, {
    companyId: candidate.companyId,
    chargeId: candidate.chargeId,
    paymentId: candidate.paymentId,
    reminderType,
    channel,
    sentTo: normalizedPhone,
    status: 'sent',
    metadata: { providerId: whatsappResult.providerId || null },
  });
  await insertSaasBillingReminderAudit(supabaseAdmin, {
    companyId: candidate.companyId,
    chargeId: candidate.chargeId,
    reminderType,
    channel,
    sentTo: normalizedPhone,
    ok: true,
  });

  return {
    ...baseItem,
    outcome: 'sent',
    sentTo: normalizedPhone,
  };
}

function pushReminderRunItem(
  result: SaasBillingReminderRunResult,
  item: SaasBillingReminderRunItem,
  automationStats: Map<string, SaasBillingReminderAutomationSummary>,
): void {
  result.items.push(item);
  if (item.outcome === 'sent') result.sent += 1;
  else if (item.outcome === 'failed') result.failed += 1;
  else if (item.outcome === 'duplicate') result.duplicates += 1;
  else result.skipped += 1;

  const automationKey = item.automationKey || item.reminderType;
  const channelKey = `${automationKey}:${item.channel}`;
  const summary =
    automationStats.get(channelKey) ||
    ({
      automationKey,
      reminderType: item.reminderType,
      channel: item.channel,
      targetDueDate: '',
      chargesMatched: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      duplicates: 0,
    } satisfies SaasBillingReminderAutomationSummary);

  summary.chargesMatched += 1;
  if (item.outcome === 'sent') summary.sent += 1;
  else if (item.outcome === 'failed') summary.failed += 1;
  else if (item.outcome === 'duplicate') summary.duplicates += 1;
  else summary.skipped += 1;
  automationStats.set(channelKey, summary);
}

function buildAutomationSummaries(
  runDate: string,
  automationStats: Map<string, SaasBillingReminderAutomationSummary>,
): SaasBillingReminderAutomationSummary[] {
  return SAAS_BILLING_REMINDER_DEFINITIONS.flatMap((definition) => {
    const targetDueDate =
      typeof definition.daysBeforeDue === 'number'
        ? addDaysToIsoDate(runDate, definition.daysBeforeDue)
        : runDate;

    return (['email', 'whatsapp'] as SaasBillingReminderChannel[]).map((channel) => {
      const key = `${definition.automationId}:${channel}`;
      const existing = automationStats.get(key);
      return {
        automationKey: definition.automationId,
        reminderType: definition.type,
        channel,
        targetDueDate,
        chargesMatched: existing?.chargesMatched ?? 0,
        sent: existing?.sent ?? 0,
        skipped: existing?.skipped ?? 0,
        failed: existing?.failed ?? 0,
        duplicates: existing?.duplicates ?? 0,
      };
    });
  });
}

export async function runSaasBillingReminders(
  supabaseAdmin: SupabaseClient,
  options?: { today?: string; dryRun?: boolean },
): Promise<SaasBillingReminderRunResult> {
  const runDate = options?.today || todayBrazilIsoDate();
  const allOpenCharges = await supabaseAdmin
    .from('saas_charges')
    .select('id, company_id, due_date, status, payment_id, payment_url, pix_copy_paste, deleted_at')
    .is('deleted_at', null)
    .in('status', ['PENDING', 'OVERDUE']);

  const candidates = await listSaasBillingReminderCandidates(supabaseAdmin);
  const candidateIds = new Set(candidates.map((item) => item.chargeId));

  const companyIds = [
    ...new Set(
      (allOpenCharges.data || [])
        .filter((row) => !candidateIds.has(String(row.id)))
        .map((row) => String(row.company_id)),
    ),
  ];
  const companyNameById = new Map<string, string>();
  if (companyIds.length) {
    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('id, name')
      .in('id', companyIds);
    for (const company of companies || []) {
      companyNameById.set(String(company.id), String(company.name || 'Empresa'));
    }
  }

  const excluded = (allOpenCharges.data || [])
    .filter((row) => !candidateIds.has(String(row.id)))
    .map((row) => {
      const status = String(row.status || '').toUpperCase();
      let reason = 'Cobrança não elegível para lembrete automático.';
      if (!isSaasChargeStatusEligibleForReminder(status)) {
        reason = `Status ${status} não elegível.`;
      } else if (
        !hasSaasChargeRealPixData({
          payment_id: row.payment_id ? String(row.payment_id) : null,
          pix_copy_paste: row.pix_copy_paste ? String(row.pix_copy_paste) : null,
          payment_url: row.payment_url ? String(row.payment_url) : null,
        })
      ) {
        reason = 'Sem payment_id, PIX ou link Asaas — ignorada na busca de candidatos.';
      }
      return {
        chargeId: String(row.id),
        companyId: String(row.company_id),
        companyName: companyNameById.get(String(row.company_id)) || 'Empresa',
        dueDate: String(row.due_date || '').split('T')[0],
        reason,
      };
    });

  const result: SaasBillingReminderRunResult = {
    runDate,
    timezone: BRAZIL_TIMEZONE,
    candidatesFound: candidates.length,
    candidatesExcluded: excluded.length,
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    duplicates: 0,
    automations: [],
    excluded,
    items: [],
  };

  const automationStats = new Map<string, SaasBillingReminderAutomationSummary>();

  for (const candidate of candidates) {
    const reminderTypes = resolveReminderTypesForCharge(
      candidate.dueDate,
      candidate.status,
      runDate,
    );

    if (!reminderTypes.length) {
      result.excluded.push({
        chargeId: candidate.chargeId,
        companyId: candidate.companyId,
        companyName: candidate.companyName,
        dueDate: candidate.dueDate,
        reason: `Nenhum lembrete agendado para ${runDate} (vencimento ${candidate.dueDate}).`,
      });
      continue;
    }

    for (const reminderType of reminderTypes) {
      const definition = getSaasBillingReminderDefinition(reminderType);
      const itemBase = {
        chargeId: candidate.chargeId,
        companyId: candidate.companyId,
        companyName: candidate.companyName,
        dueDate: candidate.dueDate,
        reminderType,
        automationKey: definition.automationId,
      };

      result.processed += 1;
      try {
        const emailItem = await processSaasBillingReminderForCharge(
          supabaseAdmin,
          candidate,
          reminderType,
          { dryRun: options?.dryRun },
        );
        pushReminderRunItem(result, { ...itemBase, ...emailItem }, automationStats);
      } catch (err) {
        pushReminderRunItem(
          result,
          {
            ...itemBase,
            channel: 'email',
            outcome: 'failed',
            message: err instanceof Error ? err.message : String(err),
          },
          automationStats,
        );
      }

      result.processed += 1;
      try {
        const whatsappItem = await processSaasBillingReminderWhatsAppForCharge(
          supabaseAdmin,
          candidate,
          reminderType,
          { dryRun: options?.dryRun },
        );
        pushReminderRunItem(result, { ...itemBase, ...whatsappItem }, automationStats);
      } catch (err) {
        pushReminderRunItem(
          result,
          {
            ...itemBase,
            channel: 'whatsapp',
            outcome: 'failed',
            message: err instanceof Error ? err.message : String(err),
          },
          automationStats,
        );
      }
    }
  }

  result.automations = buildAutomationSummaries(runDate, automationStats);
  return result;
}

export async function getSaasBillingReminderStats(
  supabaseAdmin: SupabaseClient,
): Promise<SaasBillingReminderAutomationStat[]> {
  const { data, error } = await supabaseAdmin
    .from('saas_billing_reminder_logs')
    .select('reminder_type, channel, sent_to, sent_at, status')
    .eq('status', 'sent')
    .in('channel', ['email', 'whatsapp'])
    .order('sent_at', { ascending: false });

  if (error) throw new Error(error.message);

  const channels: SaasBillingReminderChannel[] = ['email', 'whatsapp'];

  return SAAS_BILLING_REMINDER_DEFINITIONS.flatMap((definition) =>
    channels.map((channel) => {
      const rows = (data || []).filter(
        (row) => row.reminder_type === definition.type && row.channel === channel,
      );
      const last = rows[0];
      return {
        automationId: definition.automationId,
        reminderType: definition.type,
        channel,
        totalSent: rows.length,
        lastSentAt: last?.sent_at ? String(last.sent_at) : null,
        lastSentTo: last?.sent_to ? String(last.sent_to) : null,
      };
    }),
  );
}

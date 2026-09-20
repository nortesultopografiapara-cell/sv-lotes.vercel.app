/**
 * Job de lembretes automáticos ao comprador.
 * Sequencial, teto conservador de WhatsApp, sem gerar cobrança.
 * Production bloqueada nesta fase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildBuyerReminderEmailHtml,
  buildBuyerReminderEmailText,
  buildBuyerReminderWhatsAppMessage,
  buyerReminderEmailSubject,
} from '@/lib/charges/buyerCollectionMessages';
import {
  buildBuyerCollectionFromHeader,
  resolveBuyerCollectionReplyTo,
} from '@/lib/charges/buyerCollectionEmail';
import {
  enabledBuyerReminderChannels,
  enabledBuyerReminderEvents,
  evaluateBuyerReminderEligibility,
  isValidReminderEmail,
  receiptRowSaleStatus,
  type BuyerReminderCandidateInput,
} from '@/lib/charges/buyerReminderEligibility';
import {
  listEnabledBuyerReminderSettings,
  loadBuyerReminderSettings,
} from '@/lib/charges/buyerReminderSettings';
import { allocateWhatsAppSlots } from '@/lib/charges/buyerReminderFairShare';
import {
  BUYER_REMINDER_MAX_FAILED_ATTEMPTS,
  BUYER_REMINDER_MAX_WHATSAPP_PER_RUN,
  BUYER_REMINDER_SEND_GAP_MS,
  BUYER_REMINDER_TEMPLATE_KEY,
  BUYER_REMINDER_TIMEZONE,
  resolveBuyerReminderTargetDueDate,
  type BuyerReminderChannel,
  type BuyerReminderEventType,
  type BuyerReminderSkipReason,
} from '@/lib/charges/buyerReminderTypes';
import {
  buyerReminderSkipReasonLabel,
  describeBuyerReminderPaymentMethod,
  formatBuyerReminderEventLabel,
  maskBuyerReminderRecipient,
} from '@/lib/charges/buyerReminderPresentation';
import {
  mapReceiptRowToBatchParcel,
  pickExistingChargeForWhatsApp,
  resolveChargeWhatsAppBatchPortalUrl,
} from '@/lib/charges/chargeWhatsAppBatch';
import { resolveChargeCustomerEmail } from '@/lib/charges/chargeWhatsAppMessage';
import type { FinanceReceiptRow } from '@/lib/charges/chargeInstallmentHelpers';
import { getCompanyDisplayName } from '@/lib/contractCompanyDisplay';
import { listCompanyAsaasChargesForInstallments } from '@/lib/finance/companyAsaasChargeRepository';
import {
  bankChargeToSummaryLike,
  listInterChargesForInstallments,
} from '@/lib/banking/inter/interSaleChargeService';
import { FINANCE_RECEIPTS_CUSTOMER_FKEY } from '@/lib/finance/financeReceiptsEmbed';
import { isProductionSupabaseRuntime } from '@/lib/homolog/env';
import { todayBrazilIsoDate } from '@/lib/companySubscriptionDates';
import { isZapiConfigured, sendText } from '@/lib/whatsapp/zapiProvider';
import { isResendEmailConfigured, sendResendEmail } from '@/lib/email/resendSend';

const BUYER_REMINDER_RECEIPT_SELECT = `
  id, company_id, tenant_id, sale_id, customer_id, project_id, due_date, amount, status, installment_number,
  customers!${FINANCE_RECEIPTS_CUSTOMER_FKEY}(id, name, phone, email),
  sales:sale_id(id, status, installments_count, projects(name), contracts(contract_number)),
  projects:project_id(name),
  blocks:block_id(block_name, name, number)
`;

export type BuyerReminderRunItem = {
  companyId: string;
  installmentId: string;
  customerId: string | null;
  customerName: string;
  projectName: string | null;
  lotLabel: string | null;
  parcelLabel: string | null;
  dueDateIso: string | null;
  dueDateLabel: string | null;
  eventType: BuyerReminderEventType;
  eventLabel: string;
  channel: BuyerReminderChannel;
  recipientMasked: string | null;
  paymentMethodLabel: string | null;
  status: 'sent' | 'skipped' | 'failed';
  skipReason: BuyerReminderSkipReason | null;
  skipReasonLabel: string | null;
  error: string | null;
  providerMessageId: string | null;
  messagePreview: string | null;
  emailFrom?: string | null;
  emailReplyTo?: string | null;
};

export type BuyerReminderRunResult = {
  dryRun: boolean;
  runDate: string;
  timezone: string;
  productionBlocked: boolean;
  companies: number;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  whatsappSent: number;
  truncated: boolean;
  items: BuyerReminderRunItem[];
};

export function buyerRemindersProductionBlockedReason(): string | null {
  if (isProductionSupabaseRuntime()) {
    return 'Lembretes automáticos ao comprador estão bloqueados em Production nesta fase.';
  }
  if (String(process.env.VERCEL_ENV || '').trim().toLowerCase() === 'production') {
    return 'Lembretes automáticos ao comprador estão bloqueados em Production nesta fase.';
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadLoteadoraProfile(
  admin: SupabaseClient,
  companyId: string,
): Promise<{ name: string; email: string | null }> {
  const { data } = await admin
    .from('companies')
    .select('name, fantasy_name, email')
    .eq('id', companyId)
    .maybeSingle();
  const name = getCompanyDisplayName((data as Record<string, unknown> | null) || {});
  const email = String((data as { email?: string | null } | null)?.email || '').trim() || null;
  return {
    name: name && name !== 'Não Informado' ? name : 'a empresa responsável pelo empreendimento',
    email,
  };
}

async function loadDueReceipts(
  admin: SupabaseClient,
  companyId: string,
  dueDate: string,
): Promise<FinanceReceiptRow[]> {
  const { data, error } = await admin
    .from('finance_receipts')
    .select(BUYER_REMINDER_RECEIPT_SELECT)
    .eq('company_id', companyId)
    .eq('due_date', dueDate)
    .in('status', ['pendente', 'pending']);
  if (error) throw new Error(error.message);
  return (data || []) as FinanceReceiptRow[];
}

async function alreadySent(
  admin: SupabaseClient,
  input: {
    companyId: string;
    installmentId: string;
    channel: BuyerReminderChannel;
    eventType: BuyerReminderEventType;
    dueDate: string;
  },
): Promise<boolean> {
  const { data, error } = await admin
    .from('company_buyer_reminder_logs')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('finance_receipt_id', input.installmentId)
    .eq('channel', input.channel)
    .eq('event_type', input.eventType)
    .eq('due_date', input.dueDate)
    .eq('status', 'sent')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

async function countFailedAttempts(
  admin: SupabaseClient,
  input: {
    companyId: string;
    installmentId: string;
    channel: BuyerReminderChannel;
    eventType: BuyerReminderEventType;
    dueDate: string;
  },
): Promise<number> {
  const { data, error } = await admin
    .from('company_buyer_reminder_logs')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('finance_receipt_id', input.installmentId)
    .eq('channel', input.channel)
    .eq('event_type', input.eventType)
    .eq('due_date', input.dueDate)
    .eq('status', 'failed');
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.length : 0;
}

type PendingWhatsAppJob = {
  companyId: string;
  installmentId: string;
  customerId: string | null;
  dueDate: string;
  eventType: BuyerReminderEventType;
  recipient: string;
  message: string | null;
  phone: string;
  logMeta: {
    customerName?: string | null;
    projectName?: string | null;
    parcelLabel?: string | null;
    lotLabel?: string | null;
  };
  toItem: (
    status: 'sent' | 'skipped' | 'failed',
    extra?: {
      skipReason?: BuyerReminderSkipReason | null;
      error?: string | null;
      providerMessageId?: string | null;
      includePreview?: boolean;
    },
  ) => BuyerReminderRunItem;
};

async function insertLog(
  admin: SupabaseClient,
  row: {
    companyId: string;
    customerId: string | null;
    installmentId: string;
    dueDate: string;
    eventType: BuyerReminderEventType;
    channel: BuyerReminderChannel;
    recipient: string | null;
    status: 'sent' | 'skipped' | 'failed';
    skipReason: BuyerReminderSkipReason | null;
    messageBody: string | null;
    providerMessageId: string | null;
    errorMessage: string | null;
    customerName?: string | null;
    projectName?: string | null;
    parcelLabel?: string | null;
    lotLabel?: string | null;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {
    company_id: row.companyId,
    customer_id: row.customerId,
    finance_receipt_id: row.installmentId,
    due_date: row.dueDate,
    event_type: row.eventType,
    channel: row.channel,
    recipient: row.recipient,
    status: row.status,
    skip_reason: row.skipReason,
    message_body: row.messageBody,
    template_key: BUYER_REMINDER_TEMPLATE_KEY,
    provider_message_id: row.providerMessageId,
    error_message: row.errorMessage,
    customer_name: row.customerName || null,
    project_name: row.projectName || null,
    parcel_label: row.parcelLabel || null,
    lot_label: row.lotLabel || null,
    sent_at: row.status === 'sent' ? new Date().toISOString() : null,
  };
  let { error } = await admin.from('company_buyer_reminder_logs').insert(payload);
  if (error && /lot_label/i.test(error.message || '')) {
    const fallback = { ...payload };
    delete fallback.lot_label;
    ({ error } = await admin.from('company_buyer_reminder_logs').insert(fallback));
  }
  if (error) {
    if (row.status === 'sent' && /duplicate key|23505/i.test(error.message || '')) return;
    throw new Error(error.message);
  }
}

function toCandidate(
  row: FinanceReceiptRow,
  charge: ReturnType<typeof pickExistingChargeForWhatsApp>,
): BuyerReminderCandidateInput {
  const parcel = mapReceiptRowToBatchParcel(row, charge);
  return {
    installmentId: parcel.installmentId,
    companyId: parcel.companyId,
    tenantId: parcel.tenantId,
    customerId: parcel.customerId,
    customerName: parcel.customerName,
    phone: parcel.phone,
    email: resolveChargeCustomerEmail(row),
    dueDateIso: parcel.dueDateIso,
    rawStatus: parcel.rawStatus,
    saleStatus: receiptRowSaleStatus(row),
    charge,
  };
}

export async function runBuyerInstallmentReminders(
  admin: SupabaseClient,
  options?: {
    dryRun?: boolean;
    runDate?: string;
    companyId?: string;
    forceEnabled?: boolean;
    sendTextFn?: typeof sendText;
    sendEmailFn?: typeof sendResendEmail;
    listAsaasChargesFn?: typeof listCompanyAsaasChargesForInstallments;
    listInterChargesFn?: typeof listInterChargesForInstallments;
  },
): Promise<BuyerReminderRunResult> {
  const blocked = buyerRemindersProductionBlockedReason();
  const runDate = options?.runDate || todayBrazilIsoDate();
  const result: BuyerReminderRunResult = {
    dryRun: Boolean(options?.dryRun),
    runDate,
    timezone: BUYER_REMINDER_TIMEZONE,
    productionBlocked: Boolean(blocked),
    companies: 0,
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    whatsappSent: 0,
    truncated: false,
    items: [],
  };

  if (blocked) {
    return result;
  }

  const settingsList = options?.companyId
    ? [
        {
          ...(await loadBuyerReminderSettings(admin, options.companyId)),
          ...(options.forceEnabled ? { enabled: true } : {}),
        },
      ]
    : await listEnabledBuyerReminderSettings(admin);

  const sendTextFn = options?.sendTextFn || sendText;
  const sendEmailFn = options?.sendEmailFn || sendResendEmail;
  const listAsaasFn = options?.listAsaasChargesFn || listCompanyAsaasChargesForInstallments;
  const listInterFn = options?.listInterChargesFn || listInterChargesForInstallments;
  const zapiReady = Boolean(options?.sendTextFn) || isZapiConfigured();
  const emailReady = Boolean(options?.sendEmailFn) || isResendEmailConfigured();
  const portalUrl = resolveChargeWhatsAppBatchPortalUrl();
  const pendingWhatsApp: PendingWhatsAppJob[] = [];

  for (const settings of settingsList) {
    if (!settings.enabled) continue;
    result.companies += 1;
    const loteadora = await loadLoteadoraProfile(admin, settings.companyId);
    const loteadoraName = loteadora.name;
    const emailFromHeader = buildBuyerCollectionFromHeader(loteadoraName);
    const emailReplyTo = resolveBuyerCollectionReplyTo(loteadora.email);
    const includeReplyHint = isValidReminderEmail(loteadora.email);
    const events = enabledBuyerReminderEvents(settings);
    const channels = enabledBuyerReminderChannels(settings);

    for (const event of events) {
      const dueDate = resolveBuyerReminderTargetDueDate(event, runDate, settings);
      const receipts = await loadDueReceipts(admin, settings.companyId, dueDate);
      const ids = receipts.map((row) => String(row.id));
      const asaasList = await listAsaasFn(admin, settings.companyId, ids);
      const asaas: Record<string, (typeof asaasList)[number]> = {};
      for (const charge of asaasList) asaas[charge.installmentId] = charge;
      const interMap = await listInterFn(admin, settings.companyId, ids);
      const inter: Record<string, ReturnType<typeof bankChargeToSummaryLike>> = {};
      for (const [id, row] of interMap.entries()) {
        inter[id] = bankChargeToSummaryLike(row, settings.companyId);
      }

      for (const row of receipts) {
        const installmentId = String(row.id);
        const charge = pickExistingChargeForWhatsApp(installmentId, asaas, inter);
        const candidate = toCandidate(row, charge);
        const parcel = mapReceiptRowToBatchParcel(row, charge, runDate);

        for (const channel of channels) {
          result.processed += 1;
          const sentBefore = await alreadySent(admin, {
            companyId: settings.companyId,
            installmentId,
            channel,
            eventType: event,
            dueDate,
          });
          const evaluation = evaluateBuyerReminderEligibility(candidate, {
            tenantId: settings.companyId,
            event,
            channel,
            settings,
            runDate,
            todayStr: runDate,
            alreadySent: sentBefore,
          });

          const message = evaluation.sendable
            ? buildBuyerReminderWhatsAppMessage({
                kind: event,
                customerName: candidate.customerName,
                loteadoraName,
                projectName: parcel.projectName,
                portalUrl,
                parcel: {
                  parcelLabel: parcel.parcelLabel,
                  dueDateLabel: parcel.dueDateLabel,
                  amount: parcel.amount,
                  projectName: parcel.projectName,
                  blockName: parcel.blockName,
                  lotNumber: parcel.lotNumber,
                  lotLabel: parcel.lotLabel,
                  charge: parcel.charge,
                },
              })
            : null;

          const recipient =
            channel === 'whatsapp' ? evaluation.normalizedPhone : String(candidate.email || '').trim();

          const logMeta = {
            customerName: candidate.customerName,
            projectName: parcel.projectName,
            parcelLabel: parcel.parcelLabel,
            lotLabel: parcel.lotLabel,
          };

          const previewForChannel =
            evaluation.sendable && message
              ? channel === 'email'
                ? [
                    `From: ${emailFromHeader || '—'}`,
                    `Reply-To: ${emailReplyTo}`,
                    `Assunto: ${buyerReminderEmailSubject(event, parcel.projectName)}`,
                    '',
                    buildBuyerReminderEmailText(message, {
                      companyName: loteadoraName,
                      includeReplyHint,
                    }),
                  ].join('\n')
                : message
              : null;

          const toItem = (
            status: 'sent' | 'skipped' | 'failed',
            extra?: {
              skipReason?: BuyerReminderSkipReason | null;
              error?: string | null;
              providerMessageId?: string | null;
              includePreview?: boolean;
            },
          ): BuyerReminderRunItem => ({
            companyId: settings.companyId,
            installmentId,
            customerId: candidate.customerId,
            customerName: candidate.customerName,
            projectName: parcel.projectName || null,
            lotLabel: parcel.lotLabel || null,
            parcelLabel: parcel.parcelLabel || null,
            dueDateIso: parcel.dueDateIso || null,
            dueDateLabel: parcel.dueDateLabel || null,
            eventType: event,
            eventLabel: formatBuyerReminderEventLabel(event, settings),
            channel,
            recipientMasked: maskBuyerReminderRecipient(channel, recipient),
            paymentMethodLabel: describeBuyerReminderPaymentMethod(parcel.charge),
            status,
            skipReason: extra?.skipReason ?? null,
            skipReasonLabel: buyerReminderSkipReasonLabel(extra?.skipReason ?? null),
            error: extra?.error ?? null,
            providerMessageId: extra?.providerMessageId ?? null,
            messagePreview: extra?.includePreview ? previewForChannel : null,
            emailFrom: channel === 'email' ? emailFromHeader : null,
            emailReplyTo: channel === 'email' ? emailReplyTo : null,
          });

          if (!evaluation.sendable) {
            result.skipped += 1;
            result.items.push(
              toItem('skipped', { skipReason: evaluation.skipReason }),
            );
            if (!options?.dryRun && evaluation.skipReason !== 'already_sent') {
              await insertLog(admin, {
                companyId: settings.companyId,
                customerId: candidate.customerId,
                installmentId,
                dueDate,
                eventType: event,
                channel,
                recipient,
                status: 'skipped',
                skipReason: evaluation.skipReason,
                messageBody: message,
                providerMessageId: null,
                errorMessage: null,
                ...logMeta,
              });
            }
            continue;
          }

          const failedAttempts = await countFailedAttempts(admin, {
            companyId: settings.companyId,
            installmentId,
            channel,
            eventType: event,
            dueDate,
          });
          if (failedAttempts >= BUYER_REMINDER_MAX_FAILED_ATTEMPTS) {
            result.skipped += 1;
            result.items.push(toItem('skipped', { skipReason: 'retry_exhausted' }));
            if (!options?.dryRun) {
              await insertLog(admin, {
                companyId: settings.companyId,
                customerId: candidate.customerId,
                installmentId,
                dueDate,
                eventType: event,
                channel,
                recipient,
                status: 'skipped',
                skipReason: 'retry_exhausted',
                messageBody: message,
                providerMessageId: null,
                errorMessage: null,
                ...logMeta,
              });
            }
            continue;
          }

          if (options?.dryRun) {
            result.sent += 1;
            if (channel === 'whatsapp') result.whatsappSent += 1;
            result.items.push(toItem('sent', { includePreview: true }));
            continue;
          }

          if (channel === 'whatsapp') {
            pendingWhatsApp.push({
              companyId: settings.companyId,
              installmentId,
              customerId: candidate.customerId,
              dueDate,
              eventType: event,
              recipient,
              message,
              phone: evaluation.normalizedPhone || '',
              logMeta,
              toItem,
            });
            continue;
          }

          if (!emailReady) {
            result.failed += 1;
            await insertLog(admin, {
              companyId: settings.companyId,
              customerId: candidate.customerId,
              installmentId,
              dueDate,
              eventType: event,
              channel,
              recipient,
              status: 'failed',
              skipReason: null,
              messageBody: message,
              providerMessageId: null,
              errorMessage: 'E-mail transacional (Resend) não configurado.',
              ...logMeta,
            });
            result.items.push(
              toItem('failed', { error: 'E-mail transacional (Resend) não configurado.' }),
            );
            continue;
          }

          const email = await sendEmailFn({
            to: recipient || '',
            subject: buyerReminderEmailSubject(event, parcel.projectName),
            html: buildBuyerReminderEmailHtml(message || '', {
              companyName: loteadoraName,
              includeReplyHint,
            }),
            text: buildBuyerReminderEmailText(message || '', {
              companyName: loteadoraName,
              includeReplyHint,
            }),
            fromHeader: emailFromHeader,
            replyTo: emailReplyTo,
          });
          if (email.ok) {
            result.sent += 1;
            await insertLog(admin, {
              companyId: settings.companyId,
              customerId: candidate.customerId,
              installmentId,
              dueDate,
              eventType: event,
              channel,
              recipient,
              status: 'sent',
              skipReason: null,
              messageBody: message,
              providerMessageId: email.providerId ?? null,
              errorMessage: null,
              ...logMeta,
            });
            result.items.push(
              toItem('sent', { providerMessageId: email.providerId ?? null }),
            );
          } else {
            result.failed += 1;
            await insertLog(admin, {
              companyId: settings.companyId,
              customerId: candidate.customerId,
              installmentId,
              dueDate,
              eventType: event,
              channel,
              recipient,
              status: 'failed',
              skipReason: null,
              messageBody: message,
              providerMessageId: null,
              errorMessage: email.error || 'Falha no e-mail.',
              ...logMeta,
            });
            result.items.push(
              toItem('failed', { error: email.error || 'Falha no e-mail.' }),
            );
          }
        }
      }
    }
  }

  const selectedWhatsApp = allocateWhatsAppSlots(
    pendingWhatsApp.map((job) => job.companyId),
    BUYER_REMINDER_MAX_WHATSAPP_PER_RUN,
  );
  if (pendingWhatsApp.some((_, index) => !selectedWhatsApp[index])) {
    result.truncated = true;
  }

  for (let index = 0; index < pendingWhatsApp.length; index += 1) {
    if (!selectedWhatsApp[index]) continue;
    const job = pendingWhatsApp[index];
    if (!zapiReady) {
      result.failed += 1;
      await insertLog(admin, {
        companyId: job.companyId,
        customerId: job.customerId,
        installmentId: job.installmentId,
        dueDate: job.dueDate,
        eventType: job.eventType,
        channel: 'whatsapp',
        recipient: job.recipient,
        status: 'failed',
        skipReason: null,
        messageBody: job.message,
        providerMessageId: null,
        errorMessage: 'Z-API não configurada.',
        ...job.logMeta,
      });
      result.items.push(job.toItem('failed', { error: 'Z-API não configurada.' }));
      continue;
    }
    const sent = await sendTextFn({
      phone: job.phone,
      message: job.message || '',
    });
    if (sent.ok) {
      result.sent += 1;
      result.whatsappSent += 1;
      await insertLog(admin, {
        companyId: job.companyId,
        customerId: job.customerId,
        installmentId: job.installmentId,
        dueDate: job.dueDate,
        eventType: job.eventType,
        channel: 'whatsapp',
        recipient: job.recipient,
        status: 'sent',
        skipReason: null,
        messageBody: job.message,
        providerMessageId: sent.messageId ?? null,
        errorMessage: null,
        ...job.logMeta,
      });
      result.items.push(job.toItem('sent', { providerMessageId: sent.messageId ?? null }));
      if (!options?.sendTextFn) await sleep(BUYER_REMINDER_SEND_GAP_MS);
    } else {
      result.failed += 1;
      await insertLog(admin, {
        companyId: job.companyId,
        customerId: job.customerId,
        installmentId: job.installmentId,
        dueDate: job.dueDate,
        eventType: job.eventType,
        channel: 'whatsapp',
        recipient: job.recipient,
        status: 'failed',
        skipReason: null,
        messageBody: job.message,
        providerMessageId: null,
        errorMessage: sent.error || 'Falha no WhatsApp.',
        ...job.logMeta,
      });
      result.items.push(job.toItem('failed', { error: sent.error || 'Falha no WhatsApp.' }));
    }
  }

  return result;
}

export type BuyerReminderLogRow = {
  id: string;
  createdAt: string;
  eventType: string;
  channel: string;
  status: string;
  skipReason: string | null;
  recipient: string | null;
  customerId: string | null;
  customerName: string | null;
  installmentId: string;
  dueDate: string;
  projectName: string | null;
  lotLabel: string | null;
  parcelLabel: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
};

export type BuyerReminderLogFilters = {
  limit?: number;
  eventType?: string | null;
  channel?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
};

export async function listBuyerReminderLogs(
  admin: SupabaseClient,
  companyId: string,
  filters: number | BuyerReminderLogFilters = 50,
): Promise<BuyerReminderLogRow[]> {
  const opts: BuyerReminderLogFilters = typeof filters === 'number' ? { limit: filters } : filters || {};
  const limit = Math.min(100, Math.max(1, Number(opts.limit || 50)));
  const eventType = String(opts.eventType || '').trim();
  const channel = String(opts.channel || '').trim();
  const status = String(opts.status || '').trim();
  const from = String(opts.from || '').trim();
  const to = String(opts.to || '').trim();
  const selectWithLot =
    'id, created_at, event_type, channel, status, skip_reason, recipient, customer_id, customer_name, finance_receipt_id, due_date, project_name, lot_label, parcel_label, error_message, provider_message_id';
  const selectWithoutLot =
    'id, created_at, event_type, channel, status, skip_reason, recipient, customer_id, customer_name, finance_receipt_id, due_date, project_name, parcel_label, error_message, provider_message_id';

  const run = async (select: string) => {
    let query = admin.from('company_buyer_reminder_logs').select(select).eq('company_id', companyId);
    if (eventType) query = query.eq('event_type', eventType);
    if (channel) query = query.eq('channel', channel);
    if (status) query = query.eq('status', status);
    if (from) query = query.gte('created_at', `${from}T00:00:00.000-03:00`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999-03:00`);
    return query.order('created_at', { ascending: false }).limit(limit);
  };

  let { data, error } = await run(selectWithLot);
  if (error && /lot_label/i.test(error.message || '')) {
    ({ data, error } = await run(selectWithoutLot));
  }
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    eventType: String(row.event_type),
    channel: String(row.channel),
    status: String(row.status),
    skipReason: row.skip_reason ? String(row.skip_reason) : null,
    recipient: row.recipient ? String(row.recipient) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerName: row.customer_name ? String(row.customer_name) : null,
    installmentId: String(row.finance_receipt_id),
    dueDate: String(row.due_date),
    projectName: row.project_name ? String(row.project_name) : null,
    lotLabel: row.lot_label ? String(row.lot_label) : null,
    parcelLabel: row.parcel_label ? String(row.parcel_label) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
  }));
}

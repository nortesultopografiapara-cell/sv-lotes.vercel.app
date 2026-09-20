/**
 * Lembretes automáticos ao comprador + template da cobrança em massa.
 * npx tsx scripts/mandatory-buyer-installment-reminders-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';
import {
  buildBuyerMassCollectionMessage,
  buildBuyerReminderEmailHtml,
  buildBuyerReminderEmailText,
  buildBuyerReminderWhatsAppMessage,
  buyerReminderEmailSubject,
  firstNameFromFullName,
  formatBuyerDisplayName,
  formatBuyerParcelNumberLabel,
} from '../lib/charges/buyerCollectionMessages';
import {
  buildBuyerCollectionFromHeader,
  resolveBuyerCollectionReplyTo,
  resolveBuyerCollectionTechnicalMailbox,
  sanitizeEmailFromDisplayName,
  SV_LOTES_TECHNICAL_FROM_EMAIL,
} from '../lib/charges/buyerCollectionEmail';
import { composeResendFromHeader } from '../lib/email/resendSend';
import { evaluateBuyerReminderEligibility } from '../lib/charges/buyerReminderEligibility';
import { allocateWhatsAppSlots, countAllocatedByCompany } from '../lib/charges/buyerReminderFairShare';
import {
  buyerRemindersProductionBlockedReason,
  runBuyerInstallmentReminders,
} from '../lib/charges/buyerReminderRunner';
import {
  BUYER_REMINDER_CRON_UTC,
  BUYER_REMINDER_MAX_FAILED_ATTEMPTS,
  BUYER_REMINDER_MAX_WHATSAPP_PER_RUN,
  DEFAULT_BUYER_REMINDER_SETTINGS,
  normalizeBuyerReminderSettings,
  resolveBuyerReminderTargetDueDate,
  type BuyerReminderSettings,
} from '../lib/charges/buyerReminderTypes';
import {
  BUYER_REMINDER_SKIP_REASON_LABELS,
  describeBuyerReminderPaymentMethod,
  formatBuyerReminderEventLabel,
  formatBuyerReminderRunDateLabel,
  maskBuyerReminderRecipient,
} from '../lib/charges/buyerReminderPresentation';
import { CHARGE_WHATSAPP_BATCH_TEMPLATE_KEY } from '../lib/charges/chargeWhatsAppBatch';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const ROOT = process.cwd();
function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const CUSTOMER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INST = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function settings(partial?: Partial<BuyerReminderSettings>): BuyerReminderSettings {
  return {
    companyId: TENANT,
    ...DEFAULT_BUYER_REMINDER_SETTINGS,
    enabled: true,
    emailEnabled: true,
    ...partial,
  };
}

function charge(partial?: Partial<CompanyAsaasChargeResponse>): CompanyAsaasChargeResponse {
  return {
    id: 'ch-1',
    companyId: TENANT,
    customerId: CUSTOMER,
    saleId: 'sale-1',
    installmentId: INST,
    asaasPaymentId: 'pay_1',
    billingType: 'UNDEFINED',
    status: 'PENDING',
    value: 1000,
    dueDate: '2026-09-22',
    invoiceUrl: 'https://asaas.example/i/1',
    bankSlipUrl: 'https://asaas.example/b/1',
    bankSlipIdentification: '00190.00009 01234',
    pixQrCode: null,
    pixCopyPaste: 'PIXCOPY1',
    financialAccountId: null,
    paymentLink: 'https://asaas.example/p/1',
    paidAt: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...partial,
  };
}

function candidate(partial?: Record<string, unknown>) {
  return {
    installmentId: INST,
    companyId: TENANT,
    tenantId: TENANT,
    customerId: CUSTOMER,
    customerName: 'João da Silva',
    phone: '11999887766',
    email: 'joao@example.com',
    dueDateIso: '2026-09-22',
    rawStatus: 'pendente',
    saleStatus: 'ativa',
    charge: charge(),
    ...partial,
  };
}

function evalEvent(
  event: 'due_soon' | 'due_today' | 'overdue_friendly',
  input: ReturnType<typeof candidate>,
  extra?: {
    channel?: 'whatsapp' | 'email';
    runDate?: string;
    alreadySent?: boolean;
    cfg?: BuyerReminderSettings;
  },
) {
  return evaluateBuyerReminderEligibility(input as never, {
    tenantId: TENANT,
    event,
    channel: extra?.channel || 'whatsapp',
    settings: extra?.cfg || settings(),
    runDate: extra?.runDate || '2026-09-19',
    alreadySent: extra?.alreadySent,
  });
}

function testNamesAndDates() {
  assert(firstNameFromFullName('Maria Clara Souza') === 'Maria', 'primeiro nome');
  assert(resolveBuyerReminderTargetDueDate('due_soon', '2026-09-19', settings()) === '2026-09-22', 'D-3');
  assert(resolveBuyerReminderTargetDueDate('due_today', '2026-09-19', settings()) === '2026-09-19', 'D0');
  assert(
    resolveBuyerReminderTargetDueDate('overdue_friendly', '2026-09-19', settings()) === '2026-09-16',
    'D+3',
  );
  assert(
    resolveBuyerReminderTargetDueDate('overdue_friendly', '2026-09-19', settings({ overdueDays: 5 })) ===
      '2026-09-14',
    'pós-vencimento configurável',
  );
  const off = normalizeBuyerReminderSettings(TENANT, { enabled: false });
  assert(off.enabled === false, 'padrão master desligado quando omitido');
  console.log('OK testNamesAndDates');
}

function testHomologationLabels() {
  assert(formatBuyerReminderEventLabel('due_soon') === 'D-3', 'D-3');
  assert(formatBuyerReminderEventLabel('due_today') === 'D0', 'D0');
  assert(
    formatBuyerReminderEventLabel('overdue_friendly', { dueSoonDays: 3, overdueDays: 5 }) === 'D+5',
    'D+N configurável',
  );
  assert(formatBuyerReminderRunDateLabel('2026-09-13') === '13/09/2026', 'data pt-BR');
  assert(BUYER_REMINDER_SKIP_REASON_LABELS.already_paid === 'Parcela já paga', 'paga');
  assert(BUYER_REMINDER_SKIP_REASON_LABELS.canceled === 'Parcela cancelada', 'cancelada');
  assert(BUYER_REMINDER_SKIP_REASON_LABELS.invalid_phone === 'Telefone inválido', 'telefone');
  assert(BUYER_REMINDER_SKIP_REASON_LABELS.missing_email === 'E-mail não cadastrado', 'e-mail');
  assert(BUYER_REMINDER_SKIP_REASON_LABELS.missing_payment_method === 'Sem meio de pagamento', 'sem meio');
  assert(BUYER_REMINDER_SKIP_REASON_LABELS.already_sent === 'Evento já enviado', 'já enviado');
  assert(BUYER_REMINDER_SKIP_REASON_LABELS.channel_disabled === 'Canal desativado', 'canal');
  assert(BUYER_REMINDER_SKIP_REASON_LABELS.retry_exhausted === 'Limite de tentativas', 'retry esgotado');
  const pay = describeBuyerReminderPaymentMethod(charge());
  assert(Boolean(pay && pay.includes('PIX') && pay.includes('Boleto')), 'meio de pagamento da simulação');
  const maskedPhone = maskBuyerReminderRecipient('whatsapp', '11999887766');
  assert(Boolean(maskedPhone && maskedPhone.includes('****')), 'telefone mascarado');
  const maskedEmail = maskBuyerReminderRecipient('email', 'joao@example.com');
  assert(Boolean(maskedEmail && maskedEmail.includes('***') && !maskedEmail.includes('joao@')), 'e-mail mascarado');
  console.log('OK testHomologationLabels');
}

function testEmailFromAndReplyTo() {
  const prevFrom = process.env.RESEND_FROM;
  const prevFromEmail = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_FROM = 'SV LOTES <noreply@svlotes.com.br>';
  delete process.env.RESEND_FROM_EMAIL;
  try {
    assert(resolveBuyerCollectionTechnicalMailbox() === SV_LOTES_TECHNICAL_FROM_EMAIL, 'mailbox técnico suporte@');
    const from = buildBuyerCollectionFromHeader('Menezes Imobiliária');
    assert(Boolean(from && from.startsWith('Menezes Imobiliária via SV Lotes <')), 'nome da empresa no From');
    assert(Boolean(from && from.endsWith('<suporte@svlotes.com.br>')), 'From usa domínio SV Lotes');
    assert(!from?.includes('financeiro@'), 'From não usa e-mail da imobiliária');

    const injected = buildBuyerCollectionFromHeader('Acme\r\nBcc: evil@x.com');
    assert(Boolean(injected && !injected.includes('\r') && !injected.includes('\n')), 'header injection bloqueado');
    assert(Boolean(injected && !injected.toLowerCase().includes('bcc:')), 'sem Bcc injetado');
    assert(sanitizeEmailFromDisplayName('A\r\nB') === 'A B', 'CR/LF removidos');

    assert(resolveBuyerCollectionReplyTo('financeiro@empresa.com.br') === 'financeiro@empresa.com.br', 'reply-to tenant');
    assert(resolveBuyerCollectionReplyTo('') === SV_LOTES_TECHNICAL_FROM_EMAIL, 'fallback sem e-mail');
    assert(resolveBuyerCollectionReplyTo('nao-e-email') === SV_LOTES_TECHNICAL_FROM_EMAIL, 'fallback inválido');
    assert(
      resolveBuyerCollectionReplyTo('financeiro@empresa-a.com.br') !== 'contato@empresa-b.com.br',
      'tenant A não usa reply-to B',
    );

    const locked = composeResendFromHeader('SV LOTES <noreply@svlotes.com.br>', {
      fromHeader: 'Evil <financeiro@imobiliaria.com.br>',
      fromDisplayName: 'Should Not Appear If Domain Mismatch Alone',
    });
    assert(locked.includes('noreply@svlotes.com.br') || locked.includes('suporte@svlotes.com.br'), 'domínio travado');
    assert(!locked.includes('financeiro@imobiliaria.com.br'), 'tenant não altera mailbox');
  } finally {
    if (prevFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = prevFrom;
    if (prevFromEmail === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = prevFromEmail;
  }
  console.log('OK testEmailFromAndReplyTo');
}

function testEligibilityCore() {
  const dueSoon = evalEvent('due_soon', candidate({ dueDateIso: '2026-09-22' }));
  assert(dueSoon.sendable, 'D-3 pendente envia');

  const again = evalEvent('due_soon', candidate({ dueDateIso: '2026-09-22' }), { alreadySent: true });
  assert(!again.sendable && again.skipReason === 'already_sent', 'D-3 não envia duas vezes');

  const dueToday = evalEvent('due_today', candidate({ dueDateIso: '2026-09-19' }), {
    runDate: '2026-09-19',
  });
  assert(dueToday.sendable, 'D0 envia');
  assert(dueSoon.sendable, 'D0 é independente do D-3');

  const overdue = evalEvent(
    'overdue_friendly',
    candidate({ dueDateIso: '2026-09-16', rawStatus: 'pendente' }),
    { runDate: '2026-09-19' },
  );
  assert(overdue.sendable && overdue.computedStatus === 'atrasado', 'pós-vencimento usa computeInstallmentStatus');

  const paid = evalEvent('due_soon', candidate({ rawStatus: 'pago', dueDateIso: '2026-09-22' }));
  assert(!paid.sendable && paid.skipReason === 'already_paid', 'paga não envia');

  const paidBeforeD0 = evalEvent('due_today', candidate({ rawStatus: 'pago', dueDateIso: '2026-09-19' }), {
    runDate: '2026-09-19',
  });
  assert(!paidBeforeD0.sendable && paidBeforeD0.skipReason === 'already_paid', 'paga após D-3 não recebe D0');

  const canceled = evalEvent('due_soon', candidate({ rawStatus: 'cancelado', dueDateIso: '2026-09-22' }));
  assert(!canceled.sendable && canceled.skipReason === 'canceled', 'cancelada não envia');

  const distrato = evalEvent('due_soon', candidate({ saleStatus: 'distrato', dueDateIso: '2026-09-22' }));
  assert(!distrato.sendable && distrato.skipReason === 'sale_canceled', 'distrato não envia');

  const other = evalEvent('due_soon', candidate({ companyId: OTHER, tenantId: OTHER, dueDateIso: '2026-09-22' }));
  assert(!other.sendable && other.skipReason === 'other_tenant', 'tenant A não envia tenant B');

  const phone = evalEvent('due_soon', candidate({ phone: '123', dueDateIso: '2026-09-22' }));
  assert(!phone.sendable && phone.skipReason === 'invalid_phone', 'telefone inválido skip');

  const noEmail = evalEvent(
    'due_soon',
    candidate({ email: null, dueDateIso: '2026-09-22' }),
    { channel: 'email' },
  );
  assert(!noEmail.sendable && noEmail.skipReason === 'missing_email', 'e-mail ausente skip no canal e-mail');

  const waWithoutEmail = evalEvent(
    'due_soon',
    candidate({ email: null, dueDateIso: '2026-09-22' }),
    { channel: 'whatsapp' },
  );
  assert(waWithoutEmail.sendable, 'WhatsApp continua se e-mail ausente');

  const noPay = evalEvent('due_soon', candidate({ charge: null, dueDateIso: '2026-09-22' }));
  assert(!noPay.sendable && noPay.skipReason === 'missing_payment_method', 'sem meio de pagamento não inventa link');

  const disabled = evalEvent('due_soon', candidate({ dueDateIso: '2026-09-22' }), {
    cfg: settings({ enabled: false }),
  });
  assert(!disabled.sendable && disabled.skipReason === 'automation_disabled', 'automação desligada');
  console.log('OK testEligibilityCore');
}

function testTemplates() {
  const parcel = {
    parcelLabel: 'Parcela 5',
    dueDateLabel: '22/09/2026',
    amount: 1500,
    projectName: 'Mundo Novo',
    blockName: '01',
    lotNumber: '12',
    charge: charge(),
  };
  const soon = buildBuyerReminderWhatsAppMessage({
    kind: 'due_soon',
    customerName: 'João da Silva',
    loteadoraName: 'Loteadora Alfa',
    projectName: 'Mundo Novo',
    parcel,
  });
  assert(soon.includes('Olá, João! Tudo bem?'), 'D-3 cordial');
  assert(soon.includes('*Parcela:* 5'), 'parcela D-3 sem prefixo duplicado');
  assert(!soon.includes('Parcela: Parcela'), 'não existe Parcela: Parcela no D-3');
  assert(!soon.includes('responda este e-mail'), 'WhatsApp não leva rodapé de reply');
  assert(formatBuyerParcelNumberLabel('Parcela 1 / 1') === '1/1', '1/1');
  assert(formatBuyerDisplayName('SEVERINO JOSE DE FRANÇA').includes('Severino'), 'nome apresentado');
  assert(formatBuyerDisplayName('SEVERINO JOSE DE FRANÇA').includes(' de '), 'partícula de');
  assert(
    formatBuyerDisplayName('S.V Topografia e Projeto Ltda.') === 'S.V Topografia e Projeto Ltda.',
    'nome misto não é reescrito',
  );
  assert(formatBuyerDisplayName('NOVA CARAJAS 5º ETAPA').startsWith('Nova'), 'empreendimento em caixa alta só na apresentação');
  assert(formatBuyerDisplayName('Menezes Imobiliária') === 'Menezes Imobiliária', 'nome já misto permanece');
  assert(soon.includes('lembrete automático do *SV Lotes*'), 'D-3 origem');
  assert(!soon.toLowerCase().includes('atraso'), 'D-3 sem linguagem de atraso');
  assert(!soon.includes('portal.svlotes'), 'sem portal se desligado');
  assert(!soon.includes('https://preview'), 'não hardcodar preview');

  const withPortal = buildBuyerReminderWhatsAppMessage({
    kind: 'due_soon',
    customerName: 'João da Silva',
    loteadoraName: 'Loteadora Alfa',
    projectName: 'Mundo Novo',
    parcel,
    portalUrl: 'https://example.com/portal-cliente',
  });
  assert(withPortal.includes('https://example.com/portal-cliente'), 'portal ligado aparece');
  assert(withPortal.includes('Portal do Cliente SV Lotes'), 'bloco portal');

  const today = buildBuyerReminderWhatsAppMessage({
    kind: 'due_today',
    customerName: 'João',
    loteadoraName: 'Alfa',
    projectName: 'Mundo Novo',
    parcel,
  });
  assert(today.includes('vence *hoje*'), 'D0 hoje');
  assert(today.includes('*Parcela:* 5'), 'parcela D0');
  assert(!today.includes('Parcela: Parcela'), 'não existe Parcela: Parcela no D0');

  const overdue = buildBuyerReminderWhatsAppMessage({
    kind: 'overdue_friendly',
    customerName: 'João',
    loteadoraName: 'Alfa',
    projectName: 'Mundo Novo',
    parcel,
  });
  assert(overdue.includes('permanece em aberto'), 'pós-vencimento amigável');
  assert(overdue.includes('*Parcela:* 5'), 'parcela pós');
  assert(!overdue.includes('Parcela: Parcela'), 'não existe Parcela: Parcela no pós');
  assert(!overdue.toLowerCase().includes('protesto'), 'sem tom agressivo');

  assert(buyerReminderEmailSubject('due_soon', 'Mundo Novo') === 'Lembrete de vencimento — Mundo Novo', 'assunto D-3');
  assert(buyerReminderEmailSubject('due_today', 'Mundo Novo') === 'Sua parcela vence hoje — Mundo Novo', 'assunto D0');
  assert(
    buyerReminderEmailSubject('overdue_friendly', 'Mundo Novo') === 'Aviso de parcela em aberto — Mundo Novo',
    'assunto pós',
  );
  assert(buildBuyerReminderEmailHtml(soon).includes('<strong>SV Lotes</strong>'), 'e-mail reusa texto');
  const emailHtml = buildBuyerReminderEmailHtml(soon, {
    companyName: 'Loteadora Alfa',
    includeReplyHint: true,
  });
  assert(emailHtml.includes('em nome de'), 'rodapé automático');
  assert(emailHtml.includes('responda este e-mail'), 'dica de reply-to');
  assert(
    !buildBuyerReminderEmailText(soon, { companyName: 'Alfa', includeReplyHint: false }).includes(
      'responda este e-mail',
    ),
    'sem dica se reply-to ausente',
  );

  const mass = buildBuyerMassCollectionMessage({
    customerName: 'João da Silva',
    loteadoraName: 'Loteadora Alfa',
    parcels: [parcel, { ...parcel, parcelLabel: 'Parcela 6', amount: 1600 }],
  });
  assert(mass.includes('*Parcela:* 5') && mass.includes('*Parcela:* 6'), 'várias parcelas na mesma mensagem');
  assert(!mass.includes('Parcela: Parcela'), 'massa sem Parcela duplicada');
  assert(mass.includes('*Total:*'), 'total consolidado');
  assert(mass.includes('SV Lotes — Central de Cobranças'), 'rodapé');
  assert(mass.includes(CHARGE_WHATSAPP_BATCH_TEMPLATE_KEY) === false, 'template key fora da mensagem');
  console.log('OK testTemplates');
}

type MemoryDb = {
  settings: Record<string, unknown>[];
  receipts: Record<string, unknown>[];
  logs: Record<string, unknown>[];
  companies: Record<string, unknown>[];
};

function createMemoryAdmin(db: MemoryDb) {
  const tables: Record<string, Record<string, unknown>[]> = {
    company_buyer_reminder_settings: db.settings,
    finance_receipts: db.receipts,
    company_buyer_reminder_logs: db.logs,
    companies: db.companies,
  };

  function matches(
    row: Record<string, unknown>,
    filters: Array<{ col: string; val: unknown; op: string }>,
  ) {
    return filters.every((f) => {
      if (f.op === 'eq') return String(row[f.col] ?? '') === String(f.val ?? '');
      if (f.op === 'in') return (f.val as unknown[]).map(String).includes(String(row[f.col] ?? ''));
      return true;
    });
  }

  return {
    from(table: string) {
      const rows = () => tables[table] || [];
      const state = {
        filters: [] as Array<{ col: string; val: unknown; op: string }>,
        single: false,
      };
      const run = () => {
        const found = rows().filter((row) => matches(row, state.filters));
        if (state.single) return { data: found[0] || null, error: null };
        return { data: found, error: null };
      };
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (col: string, val: unknown) => {
          state.filters.push({ col, val, op: 'eq' });
          return api;
        },
        in: (col: string, val: unknown[]) => {
          state.filters.push({ col, val, op: 'in' });
          return api;
        },
        order: () => api,
        limit: () => api,
        maybeSingle: () => {
          state.single = true;
          return Promise.resolve(run());
        },
        insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
          const list = Array.isArray(payload) ? payload : [payload];
          for (const row of list) {
            if (
              table === 'company_buyer_reminder_logs' &&
              row.status === 'sent' &&
              rows().some(
                (existing) =>
                  existing.status === 'sent' &&
                  existing.company_id === row.company_id &&
                  existing.finance_receipt_id === row.finance_receipt_id &&
                  existing.channel === row.channel &&
                  existing.event_type === row.event_type &&
                  String(existing.due_date) === String(row.due_date),
              )
            ) {
              return Promise.resolve({
                data: null,
                error: { message: 'duplicate key value violates unique constraint (23505)' },
              });
            }
            rows().push({ id: `row-${rows().length + 1}`, created_at: new Date().toISOString(), ...row });
          }
          return Promise.resolve({ data: list[0], error: null });
        },
        then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
          Promise.resolve(run()).then(resolve, reject),
      };
      return api;
    },
  };
}

function receiptRow(partial?: Record<string, unknown>) {
  return {
    id: INST,
    company_id: TENANT,
    tenant_id: TENANT,
    sale_id: 'sale-1',
    customer_id: CUSTOMER,
    project_id: 'proj-1',
    due_date: '2026-09-22',
    amount: 1500,
    status: 'pendente',
    installment_number: 5,
    customers: { id: CUSTOMER, name: 'João da Silva', phone: '11999887766', email: 'joao@example.com' },
    sales: { id: 'sale-1', status: 'ativa', installments_count: 12, projects: { name: 'Mundo Novo' } },
    projects: { name: 'Mundo Novo' },
    blocks: { block_name: '01', name: '01', number: '12' },
    ...partial,
  };
}

async function testRunnerIdempotencyAndChannels() {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevVercel = process.env.VERCEL_ENV;
  const prevFrom = process.env.RESEND_FROM;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://hoynysmynxncdlptuzub.supabase.co';
  process.env.VERCEL_ENV = 'preview';
  process.env.RESEND_FROM = 'SV LOTES <noreply@svlotes.com.br>';

  try {
    const db: MemoryDb = {
      settings: [
        {
          company_id: TENANT,
          enabled: true,
          whatsapp_enabled: true,
          email_enabled: true,
          due_soon_enabled: true,
          due_soon_days: 3,
          due_today_enabled: true,
          overdue_enabled: true,
          overdue_days: 3,
        },
      ],
      receipts: [receiptRow()],
      logs: [],
      companies: [
        { id: TENANT, name: 'Loteadora Alfa', fantasy_name: 'Alfa', email: 'financeiro@alfa.com.br' },
        { id: OTHER, name: 'Outra', fantasy_name: 'Beta', email: 'contato@beta.com.br' },
      ],
    };
    const sent: Array<{
      phone?: string;
      to?: string;
      message?: string;
      subject?: string;
      fromHeader?: string | null;
      replyTo?: string | null;
      text?: string;
    }> = [];
    const admin = createMemoryAdmin(db) as never;
    const asaas = [charge({ installmentId: INST })];
    const dryCalls = { wa: 0, email: 0 };
    const dry = await runBuyerInstallmentReminders(admin, {
      dryRun: true,
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async () => {
        dryCalls.wa += 1;
        return { ok: true, messageId: 'should-not' };
      },
      sendEmailFn: async () => {
        dryCalls.email += 1;
        return { ok: true, providerId: 'should-not' };
      },
      listAsaasChargesFn: async () => asaas,
      listInterChargesFn: async () => new Map(),
    });
    assert(dryCalls.wa === 0 && dryCalls.email === 0, 'simular não dispara provider');
    assert(db.logs.length === 0, 'simular não grava log');
    const dryEligible = dry.items.filter((item) => item.status === 'sent');
    assert(dryEligible.length === 2, 'simular marca elegíveis');
    assert(dryEligible.every((item) => Boolean(item.messagePreview)), 'prévia da mensagem');
    assert(dryEligible.some((item) => item.eventLabel === 'D-3'), 'evento D-3 na simulação');
    assert(dryEligible.every((item) => Boolean(item.recipientMasked)), 'destinatário mascarado');
    assert(
      dryEligible.some((item) => String(item.paymentMethodLabel || '').includes('PIX')),
      'meio de pagamento na simulação',
    );

    const first = await runBuyerInstallmentReminders(admin, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async ({ phone, message }) => {
        sent.push({ phone, message });
        return { ok: true, messageId: 'wa-1' };
      },
      sendEmailFn: async ({ to, subject, fromHeader, replyTo, text }) => {
        sent.push({ to: String(to), subject, fromHeader, replyTo, text });
        return { ok: true, providerId: 'em-1' };
      },
      listAsaasChargesFn: async () => asaas,
      listInterChargesFn: async () => new Map(),
    });
    assert(first.sent === 2, 'D-3 envia WhatsApp e e-mail uma vez');
    assert(first.whatsappSent === 1, 'um WhatsApp no D-3');
    assert(db.logs.filter((row) => row.status === 'sent').length === 2, 'dois logs sent');
    const emailSent = sent.find((row) => row.to);
    assert(Boolean(emailSent?.fromHeader && emailSent.fromHeader.includes('suporte@svlotes.com.br')), 'From técnico');
    assert(Boolean(emailSent?.fromHeader && emailSent.fromHeader.includes('via SV Lotes')), 'nome no From');
    assert(emailSent?.replyTo === 'financeiro@alfa.com.br', 'Reply-To do tenant A');
    assert(!String(emailSent?.replyTo || '').includes('contato@beta.com.br'), 'não usa Reply-To do tenant B');
    assert(Boolean(emailSent?.text?.includes('responda este e-mail')), 'dica de resposta com Reply-To da empresa');
    const emailItem = first.items.find((item) => item.channel === 'email' && item.status === 'sent');
    assert(emailItem?.emailFrom?.includes('suporte@svlotes.com.br') === true, 'item registra From');
    assert(emailItem?.emailReplyTo === 'financeiro@alfa.com.br', 'item registra Reply-To');

    const second = await runBuyerInstallmentReminders(admin, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async ({ phone, message }) => {
        sent.push({ phone, message });
        return { ok: true, messageId: 'wa-2' };
      },
      sendEmailFn: async ({ to, subject }) => {
        sent.push({ to: String(to), subject });
        return { ok: true, providerId: 'em-2' };
      },
      listAsaasChargesFn: async () => asaas,
      listInterChargesFn: async () => new Map(),
    });
    assert(second.sent === 0, 'D-3 não reenvia');
    assert(
      second.items.every((item) => item.skipReason === 'already_sent'),
      'segunda execução D-3 = already_sent',
    );

    db.receipts[0].due_date = '2026-09-19';
    asaas[0].dueDate = '2026-09-19';
    const d0 = await runBuyerInstallmentReminders(admin, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async ({ phone, message }) => {
        sent.push({ phone, message });
        return { ok: true, messageId: 'wa-d0' };
      },
      sendEmailFn: async ({ to, subject }) => {
        sent.push({ to: String(to), subject });
        return { ok: true, providerId: 'em-d0' };
      },
      listAsaasChargesFn: async () => asaas,
      listInterChargesFn: async () => new Map(),
    });
    assert(d0.sent === 2, 'D0 é independente do D-3');
    assert(
      d0.items.every((item) => item.eventType === 'due_today'),
      'D0 registra event_type próprio',
    );

    const failDb: MemoryDb = {
      settings: db.settings,
      receipts: [receiptRow({ id: 'inst-fail', due_date: '2026-09-22' })],
      logs: [],
      companies: db.companies,
    };
    const failed = await runBuyerInstallmentReminders(createMemoryAdmin(failDb) as never, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async () => ({ ok: false, error: 'Z-API timeout' }),
      sendEmailFn: async () => ({ ok: true, providerId: 'em-ok' }),
      listAsaasChargesFn: async () => [charge({ installmentId: 'inst-fail' })],
      listInterChargesFn: async () => new Map(),
    });
    assert(
      failed.items.some((item) => item.channel === 'whatsapp' && item.status === 'failed'),
      'Z-API falha registra failed',
    );

    const otherDb: MemoryDb = {
      settings: db.settings,
      receipts: [receiptRow({ company_id: OTHER, tenant_id: OTHER, due_date: '2026-09-22' })],
      logs: [],
      companies: db.companies,
    };
    const isolated = await runBuyerInstallmentReminders(createMemoryAdmin(otherDb) as never, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async () => ({ ok: true, messageId: 'leak' }),
      sendEmailFn: async () => ({ ok: true, providerId: 'leak' }),
      listAsaasChargesFn: async () => asaas,
      listInterChargesFn: async () => new Map(),
    });
    assert(isolated.sent === 0, 'tenant A não carrega parcela do tenant B');

    const noPay = await runBuyerInstallmentReminders(createMemoryAdmin({
      settings: db.settings,
      receipts: [receiptRow()],
      logs: [],
      companies: db.companies,
    }) as never, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async () => ({ ok: true, messageId: 'no' }),
      sendEmailFn: async () => ({ ok: true, providerId: 'no' }),
      listAsaasChargesFn: async () => [],
      listInterChargesFn: async () => new Map(),
    });
    assert(
      noPay.items.every((item) => item.skipReason === 'missing_payment_method'),
      'cobrança inexistente não inventa link',
    );

    const mailDb: MemoryDb = {
      settings: [{ ...db.settings[0], whatsapp_enabled: false, email_enabled: true }],
      receipts: [receiptRow({ id: 'inst-mail' })],
      logs: [],
      companies: [{ id: TENANT, name: 'Loteadora Alfa', fantasy_name: 'Alfa', email: null }],
    };
    const mailAsaas = [charge({ installmentId: 'inst-mail' })];
    let fallbackEmailText = '';
    const mailFailed = await runBuyerInstallmentReminders(createMemoryAdmin(mailDb) as never, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async () => ({ ok: true, messageId: 'wa' }),
      sendEmailFn: async ({ text }) => {
        fallbackEmailText = String(text || '');
        return { ok: false, error: 'Resend down' };
      },
      listAsaasChargesFn: async () => mailAsaas,
      listInterChargesFn: async () => new Map(),
    });
    assert(
      mailFailed.items.some((item) => item.channel === 'email' && item.status === 'failed'),
      'falha Resend registra failed',
    );
    assert(
      mailFailed.items.some((item) => item.emailReplyTo === SV_LOTES_TECHNICAL_FROM_EMAIL),
      'empresa sem e-mail usa fallback SV Lotes',
    );
    assert(!fallbackEmailText.includes('responda este e-mail'), 'sem dica de resposta no fallback');

    const mailRetried = await runBuyerInstallmentReminders(createMemoryAdmin(mailDb) as never, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async () => ({ ok: true, messageId: 'wa' }),
      sendEmailFn: async () => ({ ok: true, providerId: 'retry-ok' }),
      listAsaasChargesFn: async () => mailAsaas,
      listInterChargesFn: async () => new Map(),
    });
    assert(
      mailRetried.items.some((item) => item.channel === 'email' && item.status === 'sent'),
      'retry de failed funciona',
    );

    const mailThird = await runBuyerInstallmentReminders(createMemoryAdmin(mailDb) as never, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async () => ({ ok: true, messageId: 'wa' }),
      sendEmailFn: async () => ({ ok: true, providerId: 'should-not' }),
      listAsaasChargesFn: async () => mailAsaas,
      listInterChargesFn: async () => new Map(),
    });
    assert(
      mailThird.items.every((item) => item.skipReason === 'already_sent'),
      'e-mail sent não é reenviado',
    );

    const capIds = Array.from({ length: BUYER_REMINDER_MAX_WHATSAPP_PER_RUN + 1 }, (_, i) => `inst-cap-${i}`);
    const capDb: MemoryDb = {
      settings: db.settings,
      receipts: capIds.map((id) => receiptRow({ id, due_date: '2026-09-22' })),
      logs: [],
      companies: db.companies,
    };
    const capAsaas = capIds.map((id) => charge({ installmentId: id }));
    let capWa = 0;
    let capEmail = 0;
    const capped = await runBuyerInstallmentReminders(createMemoryAdmin(capDb) as never, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async () => {
        capWa += 1;
        return { ok: true, messageId: `wa-cap-${capWa}` };
      },
      sendEmailFn: async () => {
        capEmail += 1;
        return { ok: true, providerId: `em-cap-${capEmail}` };
      },
      listAsaasChargesFn: async () => capAsaas,
      listInterChargesFn: async () => new Map(),
    });
    assert(capped.truncated, 'teto de WhatsApp marca truncated');
    assert(capped.whatsappSent === BUYER_REMINDER_MAX_WHATSAPP_PER_RUN, 'teto 20 WhatsApp por execução');
    assert(capEmail === capIds.length, 'e-mail continua após o teto de WhatsApp');
    const remaining = await runBuyerInstallmentReminders(createMemoryAdmin(capDb) as never, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async () => {
        capWa += 1;
        return { ok: true, messageId: `wa-cap-${capWa}` };
      },
      sendEmailFn: async () => {
        capEmail += 1;
        return { ok: true, providerId: `em-cap-${capEmail}` };
      },
      listAsaasChargesFn: async () => capAsaas,
      listInterChargesFn: async () => new Map(),
    });
    assert(remaining.whatsappSent === 1, 'segunda execução no mesmo dia pega o WhatsApp restante');
    assert(
      remaining.items.filter((item) => item.channel === 'email').every((item) => item.skipReason === 'already_sent'),
      'e-mails já sent não reenviam na continuação',
    );
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    process.env.VERCEL_ENV = prevVercel;
    if (prevFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = prevFrom;
  }
  console.log('OK testRunnerIdempotencyAndChannels');
}

function reminderSettingsRow(companyId: string, extra?: Record<string, unknown>) {
  return {
    company_id: companyId,
    enabled: true,
    whatsapp_enabled: true,
    email_enabled: false,
    due_soon_enabled: true,
    due_soon_days: 3,
    due_today_enabled: true,
    overdue_enabled: true,
    overdue_days: 3,
    ...extra,
  };
}

function sentWhatsApp(logs: Record<string, unknown>[], companyId?: string) {
  return logs.filter(
    (row) =>
      row.status === 'sent' &&
      row.channel === 'whatsapp' &&
      (!companyId || row.company_id === companyId),
  ).length;
}

function testFairShareUnit() {
  const companyIds = [...Array.from({ length: 80 }, () => 'A'), ...Array.from({ length: 10 }, () => 'B')];
  const selected = allocateWhatsAppSlots(companyIds, BUYER_REMINDER_MAX_WHATSAPP_PER_RUN);
  const counts = countAllocatedByCompany(companyIds, selected);
  assert(selected.filter(Boolean).length === 20, 'teto 20 no round-robin');
  assert(counts.A === 10 && counts.B === 10, 'A e B recebem 10 na primeira execução');
  const nextIds = companyIds.filter((_, index) => !selected[index]);
  const next = allocateWhatsAppSlots(nextIds, BUYER_REMINDER_MAX_WHATSAPP_PER_RUN);
  const nextCounts = countAllocatedByCompany(nextIds, next);
  assert(nextCounts.A === 20 && !nextCounts.B, 'segunda execução drena A sem reenviar B');
  console.log('OK testFairShareUnit');
}

async function testContinuationScenarios() {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevVercel = process.env.VERCEL_ENV;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://hoynysmynxncdlptuzub.supabase.co';
  process.env.VERCEL_ENV = 'preview';
  try {
    const companies = [
      { id: TENANT, name: 'Loteadora Alfa', fantasy_name: 'Alfa', email: 'financeiro@alfa.com.br' },
      { id: OTHER, name: 'Outra', fantasy_name: 'Beta', email: 'contato@beta.com.br' },
    ];

    const aIds = Array.from({ length: 80 }, (_, i) => `inst-a-${i}`);
    const aDb: MemoryDb = {
      settings: [reminderSettingsRow(TENANT)],
      receipts: aIds.map((id) => receiptRow({ id, due_date: '2026-09-22' })),
      logs: [],
      companies,
    };
    const aAsaas = aIds.map((id) => charge({ installmentId: id }));
    let aWa = 0;
    const runA = () =>
      runBuyerInstallmentReminders(createMemoryAdmin(aDb) as never, {
        runDate: '2026-09-19',
        companyId: TENANT,
        sendTextFn: async () => {
          aWa += 1;
          return { ok: true, messageId: `wa-a-${aWa}` };
        },
        sendEmailFn: async () => ({ ok: true, providerId: 'should-not-email' }),
        listAsaasChargesFn: async () => aAsaas,
        listInterChargesFn: async () => new Map(),
      });
    const a1 = await runA();
    const a2 = await runA();
    const a3 = await runA();
    const a4 = await runA();
    const a5 = await runA();
    assert(a1.whatsappSent === 20 && a1.truncated, 'A: 20 na 1ª');
    assert(a2.whatsappSent === 20 && a2.truncated, 'A: 20 na 2ª');
    assert(a3.whatsappSent === 20 && a3.truncated, 'A: 20 na 3ª');
    assert(a4.whatsappSent === 20 && !a4.truncated, 'A: 20 na 4ª e encerra');
    assert(a5.whatsappSent === 0 && !a5.truncated, 'A: nada pendente na 5ª');
    assert(sentWhatsApp(aDb.logs, TENANT) === 80, 'A: 80 enviados sem duplicar');
    assert(new Set(aDb.logs.filter((row) => row.status === 'sent').map((row) => row.finance_receipt_id)).size === 80, 'A: 80 parcelas distintas');

    const bIds = Array.from({ length: 10 }, (_, i) => `inst-b-${i}`);
    const abDb: MemoryDb = {
      settings: [reminderSettingsRow(TENANT), reminderSettingsRow(OTHER)],
      receipts: [
        ...aIds.map((id) => receiptRow({ id, company_id: TENANT, tenant_id: TENANT, due_date: '2026-09-22' })),
        ...bIds.map((id) =>
          receiptRow({
            id,
            company_id: OTHER,
            tenant_id: OTHER,
            due_date: '2026-09-22',
            customer_id: CUSTOMER,
          }),
        ),
      ],
      logs: [],
      companies,
    };
    const abAsaas = [...aIds, ...bIds].map((id) => charge({ installmentId: id }));
    let abWa = 0;
    const runAb = () =>
      runBuyerInstallmentReminders(createMemoryAdmin(abDb) as never, {
        runDate: '2026-09-19',
        sendTextFn: async () => {
          abWa += 1;
          return { ok: true, messageId: `wa-ab-${abWa}` };
        },
        sendEmailFn: async () => ({ ok: true, providerId: 'should-not-email' }),
        listAsaasChargesFn: async () => abAsaas,
        listInterChargesFn: async () => new Map(),
      });
    const ab1 = await runAb();
    assert(ab1.whatsappSent === 20, 'B: teto 20 na 1ª execução compartilhada');
    assert(sentWhatsApp(abDb.logs, TENANT) === 10, 'B: empresa A não monopoliza a 1ª execução');
    assert(sentWhatsApp(abDb.logs, OTHER) === 10, 'B: empresa B envia na 1ª execução');
    const ab2 = await runAb();
    assert(sentWhatsApp(abDb.logs, OTHER) === 10, 'B: empresa B não reenvia');
    assert(ab2.whatsappSent === 20, 'B: 2ª execução continua A');
    assert(sentWhatsApp(abDb.logs, TENANT) === 30, 'B: A avança depois da partilha');

    const cIds = Array.from({ length: 25 }, (_, i) => `inst-c-${i}`);
    const cDb: MemoryDb = {
      settings: [reminderSettingsRow(TENANT)],
      receipts: cIds.map((id) => receiptRow({ id, due_date: '2026-09-22' })),
      logs: [],
      companies,
    };
    const cAsaas = cIds.map((id) => charge({ installmentId: id }));
    let cWa = 0;
    const runC = () =>
      runBuyerInstallmentReminders(createMemoryAdmin(cDb) as never, {
        runDate: '2026-09-19',
        companyId: TENANT,
        sendTextFn: async () => {
          cWa += 1;
          return { ok: true, messageId: `wa-c-${cWa}` };
        },
        sendEmailFn: async () => ({ ok: true, providerId: 'should-not-email' }),
        listAsaasChargesFn: async () => cAsaas,
        listInterChargesFn: async () => new Map(),
      });
    const c1 = await runC();
    assert(c1.whatsappSent === 20, 'C: 20 enviados na 1ª');
    const leftover = cIds.filter(
      (id) => !cDb.logs.some((row) => row.finance_receipt_id === id && row.status === 'sent'),
    );
    assert(leftover.length === 5, 'C: 5 ficaram fora do teto');
    for (const id of leftover) {
      cDb.logs.push({
        id: `failed-${id}`,
        company_id: TENANT,
        finance_receipt_id: id,
        channel: 'whatsapp',
        event_type: 'due_soon',
        due_date: '2026-09-22',
        status: 'failed',
        error_message: 'falha temporária',
      });
    }
    const beforeRetry = cWa;
    const c2 = await runC();
    assert(c2.whatsappSent === 5, 'C: retry dos 5 failed e não reenvia os 20');
    assert(cWa - beforeRetry === 5, 'C: provider chamado só para os 5');
    assert(sentWhatsApp(cDb.logs, TENANT) === 25, 'C: 25 sent ao final');
    const c3 = await runC();
    assert(c3.items.every((item) => item.skipReason === 'already_sent'), 'C: sent não reenvia');

    const dIds = Array.from({ length: 25 }, (_, i) => `inst-d-${i}`);
    const dDb: MemoryDb = {
      settings: [reminderSettingsRow(TENANT)],
      receipts: dIds.map((id) => receiptRow({ id, due_date: '2026-09-22' })),
      logs: [],
      companies,
    };
    const dAsaas = dIds.map((id) => charge({ installmentId: id }));
    let dWa = 0;
    const runD = () =>
      runBuyerInstallmentReminders(createMemoryAdmin(dDb) as never, {
        runDate: '2026-09-19',
        companyId: TENANT,
        sendTextFn: async () => {
          dWa += 1;
          return { ok: true, messageId: `wa-d-${dWa}` };
        },
        sendEmailFn: async () => ({ ok: true, providerId: 'should-not-email' }),
        listAsaasChargesFn: async () => dAsaas,
        listInterChargesFn: async () => new Map(),
      });
    const d1 = await runD();
    assert(d1.whatsappSent === 20, 'D: 20 na 1ª');
    const unpaid = dIds.filter(
      (id) => !dDb.logs.some((row) => row.finance_receipt_id === id && row.status === 'sent'),
    );
    for (const row of dDb.receipts) {
      if (unpaid.includes(String(row.id))) row.status = 'pago';
    }
    const d2 = await runD();
    assert(d2.whatsappSent === 0, 'D: não envia parcela paga entre execuções');
    assert(sentWhatsApp(dDb.logs, TENANT) === 20, 'D: sent permanece nos 20 da 1ª execução');
    assert(
      !d2.items.some((item) => unpaid.includes(item.installmentId) && item.status === 'sent'),
      'D: parcelas pagas saem da elegibilidade na leitura do banco',
    );

    const eDb: MemoryDb = {
      settings: [reminderSettingsRow(TENANT)],
      receipts: [receiptRow({ id: 'inst-retry', due_date: '2026-09-22' })],
      logs: Array.from({ length: BUYER_REMINDER_MAX_FAILED_ATTEMPTS }, (_, i) => ({
        id: `fail-${i}`,
        company_id: TENANT,
        finance_receipt_id: 'inst-retry',
        channel: 'whatsapp',
        event_type: 'due_soon',
        due_date: '2026-09-22',
        status: 'failed',
        error_message: 'permanente',
      })),
      companies,
    };
    let eWa = 0;
    const exhausted = await runBuyerInstallmentReminders(createMemoryAdmin(eDb) as never, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async () => {
        eWa += 1;
        return { ok: true, messageId: 'should-not' };
      },
      sendEmailFn: async () => ({ ok: true, providerId: 'should-not-email' }),
      listAsaasChargesFn: async () => [charge({ installmentId: 'inst-retry' })],
      listInterChargesFn: async () => new Map(),
    });
    assert(eWa === 0, 'retry esgotado não chama Z-API');
    assert(
      exhausted.items.some((item) => item.skipReason === 'retry_exhausted'),
      'retry_exhausted após 5 falhas',
    );
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    process.env.VERCEL_ENV = prevVercel;
  }
  console.log('OK testContinuationScenarios');
}

function testProductionBlockAndIsolation() {
  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  try {
    assert(!buyerRemindersProductionBlockedReason(), 'Production não bloqueia mais o runner');
  } finally {
    process.env.VERCEL_ENV = prev;
  }

  const vercel = read('vercel.json');
  assert(vercel.includes('/api/cron/buyer-installment-reminders'), 'cron preparado no vercel.json');
  assert(vercel.includes(BUYER_REMINDER_CRON_UTC), 'frequência comercial BR no cron');
  assert(vercel.includes('/api/cron/saas-billing-reminders'), 'cron SaaS intacto');

  const saasWa = read('lib/saasBillingReminderWhatsApp.ts');
  const saasReminders = read('lib/saasBillingReminders.ts');
  const portalWa = read('lib/portal-cliente/whatsapp.ts');
  const runner = read('lib/charges/buyerReminderRunner.ts');
  const batchService = read('lib/charges/chargeWhatsAppBatchService.ts');
  const cron = read('app/api/cron/buyer-installment-reminders/route.ts');
  const api = read('app/api/finance/charges/buyer-reminders/route.ts');
  const migration = read('supabase/migrations/20261024120000_company_buyer_reminders.sql');
  const settingsUi = read('components/charges/BuyerReminderSettingsPanel.tsx');
  const historyUi = read('components/charges/BuyerReminderHistoryPanel.tsx');
  const finance = read('components/finance/FinancialIntegrationPanel.tsx');
  const charges = read('components/charges/ChargesPageClient.tsx');

  assert(saasWa.includes('sendText'), 'SaaS WhatsApp intacto');
  assert(!saasWa.includes('buyerReminder'), 'SaaS WhatsApp não usa lembrete comprador');
  assert(saasReminders.includes('processSaasBillingReminderWhatsAppForCharge'), 'runner SaaS intacto');
  assert(!saasReminders.includes('buyerReminder'), 'SaaS não acopla lembrete comprador');
  assert(!read('lib/saasBillingReminderEmail.ts').includes('buyerCollection'), 'e-mail SaaS isolado');
  assert(portalWa.includes('sendClientPortalOtpWhatsApp'), 'OTP intacto');
  assert(!portalWa.includes('buyerReminder'), 'OTP não usa lembrete comprador');
  assert(runner.includes("from '@/lib/whatsapp/zapiProvider'"), 'lembrete reutiliza Z-API');
  assert(runner.includes('sendResendEmail'), 'e-mail reutiliza Resend');
  assert(!runner.includes('createCompanyInstallmentCharge'), 'não gera cobrança Asaas');
  assert(!runner.includes('generateMissing'), 'não emite cobrança faltante');
  assert(runner.includes('BUYER_REMINDER_MAX_WHATSAPP_PER_RUN'), 'teto WhatsApp');
  assert(runner.includes('allocateWhatsAppSlots'), 'partilha justa entre empresas');
  assert(runner.includes('BUYER_REMINDER_MAX_FAILED_ATTEMPTS'), 'teto de retry');
  assert(runner.includes('BUYER_REMINDER_SEND_GAP_MS'), 'intervalo Z-API');
  assert(runner.includes('result.truncated = true'), 'teto marca truncated');
  assert(!/if \(result\.truncated\) break/.test(runner), 'teto de WhatsApp não aborta e-mail');
  assert(runner.includes('America/Sao_Paulo') || read('lib/charges/buyerReminderTypes.ts').includes('America/Sao_Paulo'), 'timezone BR');
  assert(cron.includes('isCronSecretValid'), 'cron autenticado');
  assert(!cron.includes('production_blocked'), 'cron não recusa Production');
  assert(!api.includes('productionBlocked: true'), 'API POST não recusa Production');
  assert(read('lib/charges/buyerReminderTypes.ts').includes('enabled: false'), 'default desligado');
  assert(read('supabase/migrations/20261024120000_company_buyer_reminders.sql').includes('enabled boolean NOT NULL DEFAULT false'), 'SQL default false');
  assert(api.includes("action !== 'run'"), 'API simula por padrão');
  assert(api.includes('authorizeTenantBilling'), 'API isolada por tenant');
  assert(migration.includes('company_buyer_reminder_settings'), 'tabela settings');
  assert(migration.includes('company_buyer_reminder_logs'), 'tabela logs');
  assert(migration.includes('ENABLE ROW LEVEL SECURITY'), 'RLS');
  assert(migration.includes('company_buyer_reminder_logs_sent_unique'), 'idempotência sent');
  assert(!migration.includes('REFERENCES public.saas_charges'), 'sem FK saas_charges');
  assert(settingsUi.includes('Ativar lembretes automáticos'), 'configuração por empresa');
  assert(settingsUi.includes('elegíveis'), 'simulação usa elegíveis');
  assert(settingsUi.includes('Ver mensagem'), 'prévia da mensagem na simulação');
  assert(settingsUi.includes('Simulação'), 'rótulo Simulação');
  assert(settingsUi.includes('skipReasonLabel'), 'motivo amigável nos ignorados');
  assert(historyUi.includes('Lembretes automáticos'), 'histórico simples');
  assert(historyUi.includes('Central de Lembretes'), 'central operacional');
  assert(historyUi.includes('Configurar'), 'atalho para configuração');
  assert(historyUi.includes('BUYER_REMINDER_SETTINGS_HREF'), 'Configurar aponta para settings');
  assert(!historyUi.includes('Executar agora'), 'charges sem disparo manual');
  assert(finance.includes('BuyerReminderSettingsPanel'), 'painel em Configurações Financeiro');
  assert(finance.includes('financeiro-cobrancas') || finance.includes('cobrancas'), 'hash abre aba Cobranças');
  assert(charges.includes('BuyerReminderHistoryPanel'), 'histórico em /charges');
  assert(charges.includes('Lembretes'), 'botão Lembretes em /charges');
  assert(!charges.includes('Executar agora'), 'sem Executar agora em /charges');
  assert(settingsUi.includes('Executar agora'), 'execução manual permanece protegida nas configurações');
  assert(batchService.includes('chargeWhatsAppBatch'), 'cobrança em massa permanece');
  assert(!batchService.includes('runBuyerInstallmentReminders'), 'massa não mistura com automático');
  console.log('OK testProductionBlockAndIsolation');
}

async function main() {
  testNamesAndDates();
  testHomologationLabels();
  testEmailFromAndReplyTo();
  testEligibilityCore();
  testTemplates();
  await testRunnerIdempotencyAndChannels();
  testFairShareUnit();
  await testContinuationScenarios();
  testProductionBlockAndIsolation();
  console.log('OK buyer-installment-reminders');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

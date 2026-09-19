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
  buildBuyerReminderWhatsAppMessage,
  buyerReminderEmailSubject,
  firstNameFromFullName,
} from '../lib/charges/buyerCollectionMessages';
import { evaluateBuyerReminderEligibility } from '../lib/charges/buyerReminderEligibility';
import {
  buyerRemindersProductionBlockedReason,
  runBuyerInstallmentReminders,
} from '../lib/charges/buyerReminderRunner';
import {
  DEFAULT_BUYER_REMINDER_SETTINGS,
  normalizeBuyerReminderSettings,
  resolveBuyerReminderTargetDueDate,
  type BuyerReminderSettings,
} from '../lib/charges/buyerReminderTypes';
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

  const overdue = buildBuyerReminderWhatsAppMessage({
    kind: 'overdue_friendly',
    customerName: 'João',
    loteadoraName: 'Alfa',
    projectName: 'Mundo Novo',
    parcel,
  });
  assert(overdue.includes('permanece em aberto'), 'pós-vencimento amigável');
  assert(!overdue.toLowerCase().includes('protesto'), 'sem tom agressivo');

  assert(buyerReminderEmailSubject('due_soon', 'Mundo Novo') === 'Lembrete de vencimento — Mundo Novo', 'assunto D-3');
  assert(buyerReminderEmailSubject('due_today', 'Mundo Novo') === 'Sua parcela vence hoje — Mundo Novo', 'assunto D0');
  assert(
    buyerReminderEmailSubject('overdue_friendly', 'Mundo Novo') === 'Aviso de parcela em aberto — Mundo Novo',
    'assunto pós',
  );
  assert(buildBuyerReminderEmailHtml(soon).includes('<strong>SV Lotes</strong>'), 'e-mail reusa texto');

  const mass = buildBuyerMassCollectionMessage({
    customerName: 'João da Silva',
    loteadoraName: 'Loteadora Alfa',
    parcels: [parcel, { ...parcel, parcelLabel: 'Parcela 6', amount: 1600 }],
  });
  assert(mass.includes('Parcela 5') && mass.includes('Parcela 6'), 'várias parcelas na mesma mensagem');
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
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://hoynysmynxncdlptuzub.supabase.co';
  process.env.VERCEL_ENV = 'preview';

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
      companies: [{ id: TENANT, name: 'Loteadora Alfa', fantasy_name: 'Alfa' }],
    };
    const sent: Array<{ phone?: string; to?: string; message?: string; subject?: string }> = [];
    const admin = createMemoryAdmin(db) as never;
    const asaas = [charge({ installmentId: INST })];

    const first = await runBuyerInstallmentReminders(admin, {
      runDate: '2026-09-19',
      companyId: TENANT,
      sendTextFn: async ({ phone, message }) => {
        sent.push({ phone, message });
        return { ok: true, messageId: 'wa-1' };
      },
      sendEmailFn: async ({ to, subject }) => {
        sent.push({ to: String(to), subject });
        return { ok: true, providerId: 'em-1' };
      },
      listAsaasChargesFn: async () => asaas,
      listInterChargesFn: async () => new Map(),
    });
    assert(first.sent === 2, 'D-3 envia WhatsApp e e-mail uma vez');
    assert(first.whatsappSent === 1, 'um WhatsApp no D-3');
    assert(db.logs.filter((row) => row.status === 'sent').length === 2, 'dois logs sent');

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
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    process.env.VERCEL_ENV = prevVercel;
  }
  console.log('OK testRunnerIdempotencyAndChannels');
}

function testProductionBlockAndIsolation() {
  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  try {
    assert(Boolean(buyerRemindersProductionBlockedReason()), 'Production bloqueada');
  } finally {
    process.env.VERCEL_ENV = prev;
  }

  const vercel = read('vercel.json');
  assert(!vercel.includes('buyer-installment-reminders'), 'cron NÃO entra no vercel.json');
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
  assert(portalWa.includes('sendClientPortalOtpWhatsApp'), 'OTP intacto');
  assert(!portalWa.includes('buyerReminder'), 'OTP não usa lembrete comprador');
  assert(runner.includes("from '@/lib/whatsapp/zapiProvider'"), 'lembrete reutiliza Z-API');
  assert(runner.includes('sendResendEmail'), 'e-mail reutiliza Resend');
  assert(!runner.includes('createCompanyInstallmentCharge'), 'não gera cobrança Asaas');
  assert(!runner.includes('generateMissing'), 'não emite cobrança faltante');
  assert(runner.includes('BUYER_REMINDER_MAX_WHATSAPP_PER_RUN'), 'teto WhatsApp');
  assert(runner.includes('America/Sao_Paulo') || read('lib/charges/buyerReminderTypes.ts').includes('America/Sao_Paulo'), 'timezone BR');
  assert(cron.includes('isCronSecretValid'), 'cron autenticado');
  assert(cron.includes('production_blocked') || cron.includes('productionBlocked'), 'cron recusa Production');
  assert(api.includes("action !== 'run'"), 'API simula por padrão');
  assert(api.includes('authorizeTenantBilling'), 'API isolada por tenant');
  assert(migration.includes('company_buyer_reminder_settings'), 'tabela settings');
  assert(migration.includes('company_buyer_reminder_logs'), 'tabela logs');
  assert(migration.includes('ENABLE ROW LEVEL SECURITY'), 'RLS');
  assert(migration.includes('company_buyer_reminder_logs_sent_unique'), 'idempotência sent');
  assert(!migration.includes('REFERENCES public.saas_charges'), 'sem FK saas_charges');
  assert(settingsUi.includes('Ativar lembretes automáticos'), 'configuração por empresa');
  assert(historyUi.includes('Lembretes automáticos'), 'histórico simples');
  assert(finance.includes('BuyerReminderSettingsPanel'), 'painel em Configurações Financeiro');
  assert(charges.includes('BuyerReminderHistoryPanel'), 'histórico em /charges');
  assert(batchService.includes('chargeWhatsAppBatch'), 'cobrança em massa permanece');
  assert(!batchService.includes('runBuyerInstallmentReminders'), 'massa não mistura com automático');
  console.log('OK testProductionBlockAndIsolation');
}

async function main() {
  testNamesAndDates();
  testEligibilityCore();
  testTemplates();
  await testRunnerIdempotencyAndChannels();
  testProductionBlockAndIsolation();
  console.log('OK buyer-installment-reminders');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

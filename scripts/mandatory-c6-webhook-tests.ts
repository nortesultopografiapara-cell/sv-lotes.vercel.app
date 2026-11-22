/**
 * Webhook C6 simulado. Nenhum HTTP real e nenhuma baixa real.
 * npx tsx scripts/mandatory-c6-webhook-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { POST as rejectUnsignedWebhook } from '../app/api/banking/c6/webhook/route';
import { applyC6SettlementTransaction } from '../lib/banking/c6/c6SettlementTransaction';
import { processC6WebhookNotification } from '../lib/banking/c6/c6WebhookProcessor';
import { ensureC6WebhookReceiptToken, isC6WebhookReceiptToken } from '../lib/banking/c6/c6WebhookReceipt';
import { consumeC6WebhookAttempt } from '../lib/banking/c6/c6WebhookNotification';
import { redactC6ErrorMessage } from '../lib/banking/c6/c6ConfigRepository';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const COMPANY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TOKEN = 'a'.repeat(43);

type Row = Record<string, unknown> & { id?: string };

function memory() {
  const tables: Record<string, Row[]> = {
    bank_integrations: [
      {
        id: 'int-1',
        company_id: COMPANY,
        provider: 'C6',
        client_id: 'client-a',
        metadata: {
          c6: {
            emission_enabled: true,
            webhook_enabled: false,
            settlement_enabled: false,
            webhook_receipt_token: TOKEN,
          },
        },
      },
    ],
    bank_charges: [
      {
        id: 'charge-1',
        company_id: COMPANY,
        provider: 'C6',
        integration_id: 'int-1',
        financial_account_id: 'fa-1',
        finance_receipt_id: 'receipt-1',
        external_id: 'slip-1',
        status: 'REGISTERED',
      },
    ],
    finance_receipts: [
      {
        id: 'receipt-1',
        company_id: COMPANY,
        tenant_id: COMPANY,
        amount: 10.5,
        status: 'pendente',
        financial_account_id: 'fa-1',
        installment_number: 1,
      },
    ],
    company_financial_accounts: [{ id: 'fa-1', company_id: COMPANY, bank_integration_id: 'int-1' }],
    cash_movements: [],
    bank_webhook_events: [],
    audit_logs: [],
  };

  function from(table: string) {
    const state = {
      op: 'select' as 'select' | 'insert' | 'update',
      filters: [] as Array<[string, unknown]>,
      payload: null as Row | null,
      one: false,
    };
    const matches = () =>
      (tables[table] || []).filter((row) => state.filters.every(([key, value]) => row[key] === value));
    const exec = () => {
      const rows = tables[table] || (tables[table] = []);
      if (state.op === 'insert' && state.payload) {
        if (
          state.payload.idempotency_key &&
          rows.some((row) => row.idempotency_key === state.payload?.idempotency_key)
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        const row = {
          id: `${table}-${rows.length + 1}`,
          created_at: new Date().toISOString(),
          ...state.payload,
        };
        rows.push(row);
        return { data: state.one ? row : [row], error: null };
      }
      if (state.op === 'update' && state.payload) {
        for (const row of matches()) Object.assign(row, state.payload);
        return { data: matches(), error: null };
      }
      const found = matches();
      return { data: state.one ? found[0] || null : found, error: null };
    };
    const api = {
      select() {
        return api;
      },
      eq(key: string, value: unknown) {
        state.filters.push([key, value]);
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      insert(payload: Row) {
        state.op = 'insert';
        state.payload = payload;
        return api;
      },
      update(payload: Row) {
        state.op = 'update';
        state.payload = payload;
        return api;
      },
      maybeSingle() {
        state.one = true;
        return exec();
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(exec()).then(resolve, reject);
      },
    };
    return api;
  }

  const admin = {
    from,
    async rpc(name: string, args: Record<string, unknown>) {
      if (name !== 'settle_company_c6_bank_slip') return { data: null, error: { message: 'rpc desconhecida' } };
      const result = await applyC6SettlementTransaction(tables, {
        companyId: String(args.p_company_id || ''),
        chargeId: String(args.p_charge_id || ''),
        receiptId: String(args.p_receipt_id || ''),
        integrationId: String(args.p_integration_id || ''),
        financialAccountId: String(args.p_financial_account_id || ''),
        bankSlipId: String(args.p_bank_slip_id || ''),
        paidAmount: Number(args.p_paid_amount),
        paidOn: String(args.p_paid_on || ''),
      });
      return { data: result, error: null };
    },
  };
  return { admin, tables };
}

function notice(overrides: Record<string, unknown> = {}) {
  return {
    external_id: 'slip-1',
    date_time: '2026-12-21T10:00:00-03:00',
    client_id: 'client-a',
    partner_id: 'partner-1',
    service: 'BANK_SLIP',
    status: 'PAID',
    information: '{"amount":1}',
    ...overrides,
  };
}

function paidBody() {
  return {
    id: 'slip-1',
    status: 'PAID',
    amount: 10.5,
    payments: [{ date: '2026-12-21', amount: 10.5 }],
  };
}

async function main() {
  const created = memory();
  const createdResult = await processC6WebhookNotification(created.admin as never, {
    receiptToken: TOKEN,
    body: notice({ status: 'CREATED' }),
    confirmSlip: async () => {
      throw new Error('CREATED não consulta o banco');
    },
  });
  assert(createdResult.body.informational === true, 'CREATED é informativo');
  assert(created.tables.finance_receipts[0].status === 'pendente', 'CREATED não baixa');
  assert(created.tables.cash_movements.length === 0, 'CREATED não gera caixa');

  const paid = memory();
  let queries = 0;
  const paidResult = await processC6WebhookNotification(paid.admin as never, {
    receiptToken: TOKEN,
    body: notice(),
    confirmSlip: async () => {
      queries += 1;
      return { httpStatus: 200, body: paidBody() };
    },
  });
  assert(paidResult.body.paid === true && queries === 1, 'PAID confirmado consulta o banco e baixa');
  assert(paid.tables.finance_receipts[0].status === 'pago', 'PAID confirmado quita a parcela');
  assert(paid.tables.cash_movements.length === 1, 'PAID confirmado gera um caixa');

  const unconfirmed = memory();
  const unconfirmedResult = await processC6WebhookNotification(unconfirmed.admin as never, {
    receiptToken: TOKEN,
    body: notice(),
    confirmSlip: async () => ({ httpStatus: 200, body: { id: 'slip-1', status: 'CREATED', amount: 10.5 } }),
  });
  assert(unconfirmedResult.body.paid === false, 'PAID não confirmado não baixa');
  assert(unconfirmed.tables.cash_movements.length === 0, 'PAID não confirmado não gera caixa');

  const replay = memory();
  await processC6WebhookNotification(replay.admin as never, {
    receiptToken: TOKEN,
    body: notice(),
    confirmSlip: async () => ({ httpStatus: 200, body: paidBody() }),
  });
  const replayResult = await processC6WebhookNotification(replay.admin as never, {
    receiptToken: TOKEN,
    body: notice(),
    confirmSlip: async () => {
      throw new Error('repetição não consulta de novo');
    },
  });
  assert(replayResult.body.duplicate === true && replay.tables.cash_movements.length === 1, 'evento duplicado não baixa de novo');

  const malformed = memory();
  const malformedResult = await processC6WebhookNotification(malformed.admin as never, {
    receiptToken: TOKEN,
    body: { service: 'BANK_SLIP', information: { amount: 10.5 } },
  });
  assert(malformedResult.status === 400 && malformed.tables.bank_webhook_events.length === 0, 'evento malformado é recusado');

  const foreign = memory();
  foreign.tables.bank_charges[0].company_id = OTHER;
  const foreignResult = await processC6WebhookNotification(foreign.admin as never, {
    receiptToken: TOKEN,
    body: notice(),
    confirmSlip: async () => ({ httpStatus: 200, body: paidBody() }),
  });
  assert(foreignResult.body.paid !== true && foreign.tables.cash_movements.length === 0, 'cobrança de outra empresa não baixa');

  const temporary = memory();
  let attempts = 0;
  const firstTry = await processC6WebhookNotification(temporary.admin as never, {
    receiptToken: TOKEN,
    body: notice(),
    confirmSlip: async () => {
      attempts += 1;
      throw new Error('timeout');
    },
  });
  assert(firstTry.status === 503 && temporary.tables.bank_webhook_events[0].processing_status === 'FAILED', 'falha temporária fica registrada');
  const secondTry = await processC6WebhookNotification(temporary.admin as never, {
    receiptToken: TOKEN,
    body: notice(),
    confirmSlip: async () => ({ httpStatus: 200, body: paidBody() }),
  });
  assert(secondTry.body.paid === true && attempts === 1, 'reprocessamento após falha consulta o banco outra vez');
  assert(temporary.tables.cash_movements.length === 1, 'reprocessamento gera um caixa');

  const cancelled = memory();
  cancelled.tables.finance_receipts[0].status = 'cancelado';
  const cancelledResult = await processC6WebhookNotification(cancelled.admin as never, {
    receiptToken: TOKEN,
    body: notice(),
    confirmSlip: async () => ({ httpStatus: 200, body: paidBody() }),
  });
  assert(cancelledResult.body.paid === false && cancelled.tables.finance_receipts[0].status === 'cancelado', 'parcela cancelada não baixa');

  const reversed = memory();
  reversed.tables.cash_movements.push({
    id: 'cash-old',
    company_id: COMPANY,
    type: 'entrada',
    status: 'estornado',
    metadata: { provider: 'C6', bank_charge_id: 'charge-1', installment_id: 'receipt-1' },
  });
  const reversedResult = await processC6WebhookNotification(reversed.admin as never, {
    receiptToken: TOKEN,
    body: notice(),
    confirmSlip: async () => ({ httpStatus: 200, body: paidBody() }),
  });
  assert(reversedResult.body.paid === false && reversed.tables.cash_movements.length === 1, 'parcela estornada não gera outro caixa');
  assert(reversed.tables.cash_movements[0].status === 'estornado', 'estorno permanece estornado');

  const race = memory();
  const [firstRace, secondRace] = await Promise.all([
    processC6WebhookNotification(race.admin as never, {
      receiptToken: TOKEN,
      body: notice({ date_time: '2026-12-21T11:00:00-03:00' }),
      confirmSlip: async () => ({ httpStatus: 200, body: paidBody() }),
    }),
    processC6WebhookNotification(race.admin as never, {
      receiptToken: TOKEN,
      body: notice({ date_time: '2026-12-21T11:00:00-03:00' }),
      confirmSlip: async () => ({ httpStatus: 200, body: paidBody() }),
    }),
  ]);
  const winners = [firstRace, secondRace].filter((item) => item.body.paid && !item.body.duplicate);
  assert(winners.length === 1 && race.tables.cash_movements.length === 1, 'duas notificações simultâneas geram uma baixa');

  const preserved = memory();
  const before = JSON.stringify(preserved.tables.bank_integrations[0].metadata);
  const prepared = await ensureC6WebhookReceiptToken(preserved.admin as never, COMPANY);
  const preparedAgain = await ensureC6WebhookReceiptToken(preserved.admin as never, COMPANY);
  assert(prepared === TOKEN && preparedAgain === TOKEN, 'a URL reutiliza o identificador já gravado');
  assert(JSON.stringify(preserved.tables.bank_integrations[0].metadata) === before, 'preparar a URL não altera a emissão');

  const createdToken = memory();
  const metadata = createdToken.tables.bank_integrations[0].metadata as { c6: Record<string, unknown> };
  delete metadata.c6.webhook_receipt_token;
  const firstToken = await ensureC6WebhookReceiptToken(createdToken.admin as never, COMPANY);
  const secondToken = await ensureC6WebhookReceiptToken(createdToken.admin as never, COMPANY);
  const stored = createdToken.tables.bank_integrations[0].metadata as { c6: Record<string, unknown> };
  assert(isC6WebhookReceiptToken(firstToken) && firstToken === secondToken, 'o identificador permanece o mesmo ao recarregar');
  assert(stored.c6.webhook_receipt_token === firstToken, 'o identificador fica gravado na integração');
  assert(stored.c6.emission_enabled === true, 'gerar o identificador não desliga a emissão');
  assert(stored.c6.webhook_enabled === false && stored.c6.settlement_enabled === false, 'gerar o identificador não liga o webhook');
  assert(
    redactC6ErrorMessage(new Error(`falha /api/banking/c6/webhook/${firstToken}`), 'Não foi possível preparar a URL do C6.') ===
      'Não foi possível preparar a URL do C6.',
    'o identificador não volta em mensagem de erro',
  );

  const bare = await rejectUnsignedWebhook();
  assert(bare.status === 422, 'a URL sem identificador não recebe pagamento');

  let blocked = false;
  for (let index = 0; index < 31; index += 1) {
    blocked = !consumeC6WebhookAttempt('teste-limite', 1_000 + index, 30, 60_000) || blocked;
  }
  assert(blocked, 'o excesso de notificações é recusado');

  const root = path.resolve(__dirname, '..');
  const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8');
  const publicBlock = middleware.slice(
    middleware.indexOf('const publicRoutes'),
    middleware.indexOf('const isCompanyExportApi'),
  );
  assert(middleware.includes('isC6BankSlipWebhook'), 'o receptor C6 fica acessível sem sessão');
  assert(!publicBlock.includes('/api/banking/c6/webhook'), 'preparar a URL continua exigindo sessão');
  const receiver = fs.readFileSync(
    path.join(root, 'app/api/banking/c6/webhook/[receiptToken]/route.ts'),
    'utf8',
  );
  const panel = fs.readFileSync(path.join(root, 'components/finance/C6BankConfigPanel.tsx'), 'utf8');
  assert(receiver.includes('executeC6BankSlipGet') && receiver.includes('processC6WebhookNotification'), 'o receptor consulta o boleto');
  assert(!receiver.includes('allowSimulatedHttp'), 'o receptor não usa consulta simulada');
  assert(panel.includes('Não cadastrado no Banco C6'), 'a tela não mostra o webhook como cadastrado');
  assert(panel.includes('Conciliação automática desligada'), 'a conciliação automática permanece desligada');

  console.log('C6_WEBHOOK_OK');
}

void main();

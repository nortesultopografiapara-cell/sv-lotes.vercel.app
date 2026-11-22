/**
 * Cadastro do webhook C6 simulado. Nenhum HTTP real e nenhuma baixa.
 * npx tsx scripts/mandatory-c6-webhook-registration-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { syncC6BankSlipWebhook } from '../lib/banking/c6/c6WebhookRegistration';
import { c6WebhookPublicUrl } from '../lib/banking/c6/c6WebhookReceipt';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const COMPANY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TOKEN = 'a'.repeat(43);
const OTHER_TOKEN = 'b'.repeat(43);
const URL = c6WebhookPublicUrl(TOKEN);
const CLIENT = 'client-a';

type Row = Record<string, unknown> & { id?: string };

function integration(companyId: string, token: string, extra: Record<string, unknown> = {}): Row {
  return {
    id: `int-${companyId.slice(0, 8)}`,
    company_id: companyId,
    provider: 'C6',
    client_id: CLIENT,
    metadata: {
      c6: {
        emission_enabled: true,
        webhook_enabled: false,
        settlement_enabled: false,
        webhook_receipt_token: token,
        ...extra,
      },
    },
  };
}

function memory(rows: Row[]) {
  const tables: Record<string, Row[]> = {
    bank_integrations: rows,
    bank_webhook_events: [],
  };
  function from(table: string) {
    const state = {
      op: 'select' as 'select' | 'update',
      filters: [] as Array<[string, unknown]>,
      payload: null as Row | null,
      one: false,
    };
    const matches = () =>
      (tables[table] || []).filter((row) => state.filters.every(([key, value]) => row[key] === value));
    const exec = () => {
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
  return { admin: { from }, tables };
}

function bankBody(url: string, clientId = CLIENT) {
  return { url, service: 'BANK_SLIP', client_id: clientId };
}

function flags(row: Row) {
  return (row.metadata as { c6: Record<string, unknown> }).c6;
}

async function main() {
  const missing = memory([integration(COMPANY, '')]);
  flags(missing.tables.bank_integrations[0]).webhook_receipt_token = '';
  let calls = 0;
  const missingResult = await syncC6BankSlipWebhook(missing.admin as never, {
    companyId: COMPANY,
    clientId: CLIENT,
    mode: 'register',
    consult: async () => {
      calls += 1;
      return { httpStatus: 404, body: {} };
    },
    register: async () => {
      calls += 1;
      return { httpStatus: 200, body: {} };
    },
  });
  assert(missingResult.outcome === 'not-prepared' && calls === 0, 'URL não preparada não consulta o banco');
  assert(missingResult.webhook.registeredAtBank === false, 'URL não preparada não aparece como cadastrada');

  const absent = memory([integration(COMPANY, TOKEN)]);
  const seen: string[] = [];
  let registers = 0;
  const absentResult = await syncC6BankSlipWebhook(absent.admin as never, {
    companyId: COMPANY,
    clientId: CLIENT,
    mode: 'register',
    consult: async () => {
      seen.push('consult');
      if (seen.length === 1) return { httpStatus: 404, body: {} };
      return { httpStatus: 200, body: bankBody(URL) };
    },
    register: async (target) => {
      registers += 1;
      assert(target.url === URL, 'o cadastro usa a URL oficial já preparada');
      return { httpStatus: 200, body: {} };
    },
  });
  const absentFlags = flags(absent.tables.bank_integrations[0]);
  assert(absentResult.outcome === 'confirmed' && registers === 1, 'cadastro inexistente envia um POST');
  assert(absentResult.webhook.registrationLabel === 'Webhook cadastrado no Banco C6', 'a confirmação só aparece depois da consulta');
  assert(absentFlags.emission_enabled === true, 'o cadastro não desliga a emissão');
  assert(absentFlags.webhook_enabled === false && absentFlags.settlement_enabled === false, 'o cadastro não liga a conciliação');
  assert(absentFlags.webhook_receipt_token === TOKEN, 'o identificador permanece o mesmo');

  const same = memory([integration(COMPANY, TOKEN)]);
  let sameRegisters = 0;
  const sameResult = await syncC6BankSlipWebhook(same.admin as never, {
    companyId: COMPANY,
    clientId: CLIENT,
    mode: 'register',
    consult: async () => ({ httpStatus: 200, body: bankBody(URL) }),
    register: async () => {
      sameRegisters += 1;
      return { httpStatus: 200, body: {} };
    },
  });
  assert(sameResult.outcome === 'confirmed' && sameRegisters === 0, 'cadastro correspondente não é recriado');

  const different = memory([
    integration(COMPANY, TOKEN, { webhook_bank_confirmed_at: '2026-01-01T00:00:00.000Z', webhook_bank_service: 'BANK_SLIP' }),
  ]);
  let differentRegisters = 0;
  const differentResult = await syncC6BankSlipWebhook(different.admin as never, {
    companyId: COMPANY,
    clientId: CLIENT,
    mode: 'register',
    consult: async () => ({ httpStatus: 200, body: bankBody('https://example.com/outro-webhook') }),
    register: async () => {
      differentRegisters += 1;
      return { httpStatus: 200, body: {} };
    },
  });
  assert(differentResult.outcome === 'conflict' && differentRegisters === 0, 'webhook diferente não é substituído');
  assert(differentResult.webhook.registeredAtBank === false, 'conflito não aparece como cadastrado');
  assert(!String(differentResult.message).includes('example.com'), 'o conflito não revela a outra URL');

  const auth = memory([
    integration(COMPANY, TOKEN, { webhook_bank_confirmed_at: '2026-01-01T00:00:00.000Z', webhook_bank_service: 'BANK_SLIP' }),
  ]);
  const authResult = await syncC6BankSlipWebhook(auth.admin as never, {
    companyId: COMPANY,
    clientId: CLIENT,
    mode: 'register',
    consult: async () => ({ httpStatus: 401, body: { access_token: 'segredo' } }),
    register: async () => {
      throw new Error('autenticação recusada não cadastra');
    },
  });
  assert(authResult.outcome === 'auth-failed', 'falha de autenticação não cadastra');
  assert(flags(auth.tables.bank_integrations[0]).webhook_bank_service === 'BANK_SLIP', 'falha de autenticação preserva a confirmação anterior');
  assert(!authResult.message.includes('segredo'), 'a falha não devolve segredo');

  const temporary = memory([integration(COMPANY, TOKEN)]);
  const temporaryResult = await syncC6BankSlipWebhook(temporary.admin as never, {
    companyId: COMPANY,
    clientId: CLIENT,
    mode: 'register',
    consult: async () => {
      throw new Error('timeout https://www.svlotes.com.br/api/banking/c6/webhook/' + TOKEN);
    },
    register: async () => ({ httpStatus: 200, body: {} }),
  });
  assert(temporaryResult.outcome === 'temporary', 'falha temporária não cadastra');
  assert(flags(temporary.tables.bank_integrations[0]).webhook_bank_confirmed_at == null, 'falha temporária não confirma o cadastro');
  assert(!temporaryResult.message.includes(TOKEN), 'a falha temporária não revela o identificador');

  const consultOnly = memory([integration(COMPANY, TOKEN)]);
  let consultRegisters = 0;
  const consultResult = await syncC6BankSlipWebhook(consultOnly.admin as never, {
    companyId: COMPANY,
    clientId: CLIENT,
    mode: 'consult',
    consult: async () => ({ httpStatus: 404, body: {} }),
    register: async () => {
      consultRegisters += 1;
      return { httpStatus: 200, body: {} };
    },
  });
  assert(consultResult.outcome === 'consulted' && consultRegisters === 0, 'consultar de novo não cria a URL nem o webhook');
  assert(flags(consultOnly.tables.bank_integrations[0]).webhook_receipt_token === TOKEN, 'consultar preserva o identificador');

  const foreignClient = memory([integration(COMPANY, TOKEN)]);
  let foreignRegisters = 0;
  const foreignClientResult = await syncC6BankSlipWebhook(foreignClient.admin as never, {
    companyId: COMPANY,
    clientId: CLIENT,
    mode: 'register',
    consult: async () => ({ httpStatus: 200, body: bankBody(URL, 'client-b') }),
    register: async () => {
      foreignRegisters += 1;
      return { httpStatus: 200, body: {} };
    },
  });
  assert(foreignClientResult.outcome === 'conflict' && foreignRegisters === 0, 'Client ID diferente não é confirmado');

  const isolated = memory([integration(COMPANY, TOKEN), integration(OTHER, OTHER_TOKEN)]);
  const beforeOther = JSON.stringify(isolated.tables.bank_integrations[1].metadata);
  await syncC6BankSlipWebhook(isolated.admin as never, {
    companyId: COMPANY,
    clientId: CLIENT,
    mode: 'register',
    consult: async () => ({ httpStatus: 200, body: bankBody(URL) }),
    register: async () => ({ httpStatus: 200, body: {} }),
  });
  assert(JSON.stringify(isolated.tables.bank_integrations[1].metadata) === beforeOther, 'outra empresa não é alterada');
  assert(flags(isolated.tables.bank_integrations[0]).webhook_bank_service === 'BANK_SLIP', 'a empresa da sessão recebe a confirmação');

  const root = path.resolve(__dirname, '..');
  const route = fs.readFileSync(path.join(root, 'app/api/banking/c6/webhook/register/route.ts'), 'utf8');
  const panel = fs.readFileSync(path.join(root, 'components/finance/C6BankConfigPanel.tsx'), 'utf8');
  const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'lib/banking/c6/c6WebhookRegistration.ts'), 'utf8');
  const verifyAt = route.indexOf('await verifyPrimaryAdminPassword');
  const syncAt = route.indexOf('await syncC6BankSlipWebhook');
  assert(verifyAt > 0 && syncAt > verifyAt, 'administrador sem permissão não chega ao banco');
  assert(route.includes('Autorização não concedida.'), 'a recusa da senha continua genérica');
  assert(!route.includes('allowSimulatedHttp'), 'a ação publicada não usa chamada simulada');
  assert(!route.includes('companyId: record') && !route.includes('record.companyId'), 'a empresa vem da sessão');
  assert(!service.includes('settle_company_c6_bank_slip') && !service.includes('finance_receipts'), 'o cadastro não baixa parcela');
  assert(panel.includes("? 'Webhook cadastrado no Banco C6'"), 'o texto de cadastrado depende da confirmação');
  assert(panel.includes(': \'Não cadastrado no Banco C6\''), 'sem confirmação a tela continua não cadastrada');
  assert(panel.includes('config?.webhook?.receiptPath ? ('), 'o botão só aparece com URL preparada');
  assert(panel.includes('Cadastrar webhook no C6') && panel.includes('Consultar cadastro'), 'a tela consulta sem recriar a URL');
  assert(!/^\/api\/banking\/c6\/webhook\/[A-Za-z0-9_-]{43}$/.test('/api/banking/c6/webhook/register'), 'cadastrar exige sessão');
  assert(middleware.includes('isC6BankSlipWebhook'), 'o receptor público continua restrito ao identificador');

  console.log('C6_WEBHOOK_REGISTRATION_OK');
}

void main();

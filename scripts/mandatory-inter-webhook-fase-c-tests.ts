/**
 * Testes Fase C — webhook Inter (receptor mTLS + HMAC + baixa confirmada).
 * npm run test:inter-fase-c
 */
import fs from 'fs';
import path from 'path';
import {
  buildInterWebhookIdempotencyKey,
  extractInterCallbackItems,
  processInterWebhookCallbackItem,
  resolveCodigoSolicitacao,
} from '../lib/banking/inter/interWebhookProcessor';
import {
  clearInterWebhookNoncesForTests,
  signInterWebhookHmac,
  validateInterWebhookHmac,
  createInterWebhookNonce,
} from '../lib/banking/inter/interWebhookHmac';
import {
  isInterSituacaoRecebido,
  mapInterOrigemRecebimento,
  normalizeInterCobrancaDetail,
} from '../lib/banking/inter/interCobrancaClient';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

type Row = Record<string, unknown>;

function createMockAdmin(seed?: {
  charge?: Row | null;
  receipt?: Row | null;
  integrationId?: string;
}) {
  const webhookEvents: Row[] = [];
  const cashMovements: Row[] = [];
  const bankCash: Row[] = [];
  let charge = seed?.charge ? { ...seed.charge } : null;
  let receipt = seed?.receipt ? { ...seed.receipt } : null;
  const integrationId = seed?.integrationId || 'int-1';

  function from(table: string) {
    const state: {
      filters: Array<[string, unknown]>;
      payload: Row | null;
      op: 'select' | 'insert' | 'update';
      limitN?: number;
    } = { filters: [], payload: null, op: 'select' };

    const api: Record<string, unknown> = {
      select: (_cols?: string) => {
        state.op = 'select';
        return api;
      },
      insert: (payload: Row) => {
        state.op = 'insert';
        state.payload = payload;
        if (table === 'cash_movements') {
          const row = { id: `cm-${cashMovements.length + 1}`, ...payload };
          cashMovements.push(row);
          state.payload = row;
        }
        if (table === 'bank_cash_movements') {
          bankCash.push(payload);
        }
        if (table === 'bank_webhook_events') {
          const key = String(payload?.idempotency_key || '');
          if (webhookEvents.some((e) => e.idempotency_key === key)) {
            state.payload = { __duplicate: true, key };
          } else {
            const row = { id: `evt-${webhookEvents.length + 1}`, ...payload };
            webhookEvents.push(row);
            state.payload = row;
          }
        }
        return api;
      },
      update: (payload: Row) => {
        state.op = 'update';
        state.payload = payload;
        return api;
      },
      eq: (col: string, val: unknown) => {
        state.filters.push([col, val]);
        return api;
      },
      filter: (expr: string, _op: string, val: unknown) => {
        state.filters.push([expr, val]);
        return api;
      },
      order: () => api,
      limit: (n: number) => {
        state.limitN = n;
        return api;
      },
      maybeSingle: async () => {
        if (table === 'bank_integrations' && state.op === 'select') {
          return { data: { id: integrationId, metadata: {} }, error: null };
        }
        if (table === 'bank_charges' && state.op === 'select') {
          return { data: charge, error: null };
        }
        if (table === 'finance_receipts' && state.op === 'select') {
          return { data: receipt, error: null };
        }
        if (table === 'cash_movements' && state.op === 'select') {
          const found = cashMovements.find(
            (m) =>
              (m.metadata as Row)?.bank_charge_id ===
              state.filters.find((f) => String(f[0]).includes('bank_charge_id'))?.[1],
          );
          return { data: found || null, error: null };
        }
        if (table === 'bank_webhook_events' && state.op === 'insert') {
          if (state.payload && (state.payload as Row).__duplicate) {
            return { data: null, error: { message: 'duplicate key', code: '23505' } };
          }
          return { data: state.payload, error: null };
        }
        return { data: null, error: null };
      },
      single: async () => {
        if (table === 'cash_movements' && state.op === 'insert') {
          return { data: state.payload, error: null };
        }
        if (table === 'bank_webhook_events' && state.op === 'insert') {
          if (state.payload && (state.payload as Row).__duplicate) {
            return { data: null, error: { message: 'duplicate key', code: '23505' } };
          }
          return { data: state.payload, error: null };
        }
        return { data: null, error: null };
      },
    };

    // thenable for update().eq()... without maybeSingle
    (api as { then?: unknown }).then = undefined;
    const originalEq = api.eq as (c: string, v: unknown) => typeof api;
    api.eq = (col: string, val: unknown) => {
      state.filters.push([col, val]);
      if (state.op === 'update') {
        if (table === 'bank_charges' && charge) {
          Object.assign(charge, state.payload);
        }
        if (table === 'finance_receipts' && receipt) {
          Object.assign(receipt, state.payload);
        }
        if (table === 'bank_webhook_events') {
          const id = state.filters.find((f) => f[0] === 'id')?.[1];
          const row = webhookEvents.find((e) => e.id === id);
          if (row && state.payload) Object.assign(row, state.payload);
        }
        if (table === 'bank_integrations') {
          /* noop */
        }
        // return chain that resolves as update result
        return {
          eq: api.eq,
          then: (resolve: (v: { data: null; error: null }) => void) =>
            resolve({ data: null, error: null }),
        };
      }
      return originalEq(col, val);
    };

    return api;
  }

  return {
    admin: { from } as never,
    webhookEvents,
    cashMovements,
    bankCash,
    getCharge: () => charge,
    getReceipt: () => receipt,
  };
}

async function main() {
  clearInterWebhookNoncesForTests();

  // HMAC
  {
    const secret = 'test-hmac-secret';
    const body = '{"companyId":"c1"}';
    const ts = String(Date.now());
    const nonce = createInterWebhookNonce();
    const sig = signInterWebhookHmac(secret, ts, nonce, body);
    assert(validateInterWebhookHmac({ secret, timestamp: ts, nonce, signature: sig, body }).ok, 'HMAC válido');
    assert(
      !validateInterWebhookHmac({
        secret,
        timestamp: ts,
        nonce: createInterWebhookNonce(),
        signature: 'deadbeef',
        body,
      }).ok,
      'HMAC inválido rejeitado',
    );
    const replay = validateInterWebhookHmac({ secret, timestamp: ts, nonce, signature: sig, body });
    assert(!replay.ok, 'replay nonce rejeitado');
    const skew = validateInterWebhookHmac({
      secret,
      timestamp: String(Date.now() - 10 * 60 * 1000),
      nonce: createInterWebhookNonce(),
      signature: signInterWebhookHmac(secret, String(Date.now() - 10 * 60 * 1000), 'x', body),
      body,
    });
    assert(!skew.ok, 'timestamp skew rejeitado');
  }

  assert(isInterSituacaoRecebido('RECEBIDO'), 'RECEBIDO é final');
  assert(!isInterSituacaoRecebido('A_RECEBER'), 'A_RECEBER não final');
  assert(mapInterOrigemRecebimento('BOLETO') === 'BOLETO', 'origem BOLETO');
  assert(mapInterOrigemRecebimento('PIX') === 'PIX', 'origem PIX');

  assert(
    buildInterWebhookIdempotencyKey({
      codigoSolicitacao: 'abc',
      situacao: 'RECEBIDO',
      dataHoraSituacao: '2026-01-01T10:00:00Z',
    }) === 'INTER:abc:RECEBIDO:2026-01-01T10:00:00Z',
    'chave idempotente',
  );

  assert(resolveCodigoSolicitacao({ idSolicitacao: 'x1' }) === 'x1', 'idSolicitacao fallback');
  assert(extractInterCallbackItems([{ codigoSolicitacao: 'a' }]).length === 1, 'array callback');

  // RECEBIDO confirmado → baixa uma vez
  {
    const mock = createMockAdmin({
      charge: {
        id: 'bc-1',
        company_id: 'co-1',
        finance_receipt_id: 'fr-1',
        sale_id: 's-1',
        customer_id: 'cu-1',
        status: 'REGISTERED',
        amount: 100,
        metadata: {},
      },
      receipt: {
        id: 'fr-1',
        status: 'pendente',
        company_id: 'co-1',
        sale_id: 's-1',
        customer_id: 'cu-1',
        project_id: null,
        installment_number: 1,
        amount: 100,
      },
    });

    const confirm = async () =>
      normalizeInterCobrancaDetail({
        codigoSolicitacao: 'sol-1',
        situacao: 'RECEBIDO',
        dataHoraSituacao: '2026-08-12T12:00:00Z',
        valorTotalRecebido: 100,
        origemRecebimento: 'BOLETO',
      });

    const r1 = await processInterWebhookCallbackItem(mock.admin, {
      companyId: 'co-1',
      item: {
        codigoSolicitacao: 'sol-1',
        situacao: 'RECEBIDO',
        dataHoraSituacao: '2026-08-12T12:00:00Z',
      },
      confirmCharge: confirm,
    });
    assert(r1.paid && r1.ok, 'RECEBIDO confirmado → baixa');
    assert(mock.getCharge()?.status === 'PAID', 'bank_charges PAID');
    assert(mock.getReceipt()?.status === 'pago', 'finance_receipts pago');
    assert(mock.cashMovements.length === 1, 'cash_movement criado');

    const r2 = await processInterWebhookCallbackItem(mock.admin, {
      companyId: 'co-1',
      item: {
        codigoSolicitacao: 'sol-1',
        situacao: 'RECEBIDO',
        dataHoraSituacao: '2026-08-12T12:00:00Z',
      },
      confirmCharge: confirm,
    });
    assert(r2.duplicate, 'callback duplicado');
    assert(mock.cashMovements.length === 1, 'sem baixa duplicada');
  }

  // PIX
  {
    const mock = createMockAdmin({
      charge: {
        id: 'bc-2',
        company_id: 'co-1',
        finance_receipt_id: 'fr-2',
        status: 'REGISTERED',
        amount: 50,
        metadata: {},
      },
      receipt: {
        id: 'fr-2',
        status: 'pendente',
        company_id: 'co-1',
        installment_number: 2,
        amount: 50,
      },
    });
    const r = await processInterWebhookCallbackItem(mock.admin, {
      companyId: 'co-1',
      item: { codigoSolicitacao: 'sol-pix', situacao: 'RECEBIDO', dataHoraSituacao: 't1' },
      confirmCharge: async () =>
        normalizeInterCobrancaDetail({
          codigoSolicitacao: 'sol-pix',
          situacao: 'RECEBIDO',
          dataHoraSituacao: 't1',
          origemRecebimento: 'PIX',
          valorTotalRecebido: 50,
        }),
    });
    assert(r.paid && r.origemRecebimento === 'PIX', 'PIX baixado');
  }

  // cobrança desconhecida
  {
    const mock = createMockAdmin({ charge: null });
    const r = await processInterWebhookCallbackItem(mock.admin, {
      companyId: 'co-1',
      item: { codigoSolicitacao: 'missing', situacao: 'RECEBIDO', dataHoraSituacao: 't' },
      confirmCharge: async () =>
        normalizeInterCobrancaDetail({
          codigoSolicitacao: 'missing',
          situacao: 'RECEBIDO',
          dataHoraSituacao: 't',
        }),
    });
    assert(r.ignored, 'cobrança desconhecida ignorada');
  }

  // status não final
  {
    const mock = createMockAdmin({
      charge: {
        id: 'bc-3',
        company_id: 'co-1',
        finance_receipt_id: 'fr-3',
        status: 'REGISTERED',
        amount: 10,
        metadata: {},
      },
    });
    const r = await processInterWebhookCallbackItem(mock.admin, {
      companyId: 'co-1',
      item: { codigoSolicitacao: 'sol-nf', situacao: 'A_RECEBER', dataHoraSituacao: 't' },
      confirmCharge: async () =>
        normalizeInterCobrancaDetail({
          codigoSolicitacao: 'sol-nf',
          situacao: 'A_RECEBER',
          dataHoraSituacao: 't',
        }),
    });
    assert(r.ignored && !r.paid, 'status não final sem baixa');
  }

  // isolamento Asaas / arquivos
  {
    const root = process.cwd();
    const asaas = [
      'lib/finance/companyAsaasWebhookHandler.ts',
      'lib/finance/companyAsaasPaymentReconciliation.ts',
      'app/api/finance/asaas/company-webhook/route.ts',
    ];
    for (const f of asaas) {
      assert(fs.existsSync(path.join(root, f)), `Asaas intacto: ${f}`);
    }
    const internal = fs.readFileSync(
      path.join(root, 'app/api/finance/inter/webhook/internal/route.ts'),
      'utf8',
    );
    assert(internal.includes('validateInterWebhookHmac'), 'internal exige HMAC');
    assert(!internal.includes('company_asaas'), 'internal sem Asaas');
    assert(
      fs.existsSync(path.join(root, 'services/inter-webhook-receiver/src/server.js')),
      'receptor dedicado existe',
    );
    const recv = fs.readFileSync(
      path.join(root, 'services/inter-webhook-receiver/src/server.js'),
      'utf8',
    );
    assert(recv.includes('requestCert: true'), 'receptor mTLS requestCert');
    assert(recv.includes('rejectUnauthorized: true'), 'receptor rejectUnauthorized');
    const ui = fs.readFileSync(
      path.join(root, 'components/finance/InterBankConfigPanel.tsx'),
      'utf8',
    );
    assert(ui.includes('Cadastrar webhook no Inter'), 'UI webhook');
    assert(!ui.toLowerCase().includes('selecionar certificado webhook'), 'UI sem upload ca.crt');
  }

  console.log('\nOK mandatory-inter-webhook-fase-c-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Resolver órfãs Inter da Transferência (mocks).
 * GET → POST /cancelar → polling GET. Sem RPC. Sem vigentes/pagas.
 *
 * npx tsx scripts/mandatory-title-transfer-orphan-resolve-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { cancelInterInstallmentCharge } from '../lib/banking/inter/interSaleChargeService';
import type { InterOAuthFetchFn } from '../lib/banking/inter/interOAuthClient';
import {
  EXTERNAL_CHARGE_PROVIDER_INTER,
  type ExternalChargeRecord,
} from '../lib/finance/externalCharges/types';
import { setTitleTransferChargesLiveScopeEnvForTests } from '../lib/finance/saleTitleTransferChargesLiveScope';
import {
  resolveTitleTransferClassifiedOrphanCharges,
  TITLE_TRANSFER_ORPHAN_NOT_INTER,
  TITLE_TRANSFER_ORPHAN_PAID,
  TITLE_TRANSFER_ORPHAN_RESOLVE_DISABLED,
  TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED,
} from '../lib/finance/saleTitleTransferOrphanChargesService';
import { TitleTransferPreviewError } from '../lib/finance/saleTitleTransferPreviewService';
import { mapTitleTransferPreviewUserMessage } from '../lib/finance/saleTitleTransferPreview';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
} from '../lib/homolog/env';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const DEVELOP_URL = `https://${DEVELOP_PROJECT_REF}.supabase.co`;
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

const savedSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const savedSupabaseUrlAlt = process.env.SUPABASE_URL;

function useDevelopEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = DEVELOP_URL;
  process.env.SUPABASE_URL = DEVELOP_URL;
  setTitleTransferChargesLiveScopeEnvForTests({
    TITLE_TRANSFER_EXTERNAL_CHARGES_LIVE: '',
    NEXT_PUBLIC_SUPABASE_URL: DEVELOP_URL,
  });
}

function useProductionEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_URL;
  process.env.SUPABASE_URL = PRODUCTION_URL;
  setTitleTransferChargesLiveScopeEnvForTests({
    TITLE_TRANSFER_EXTERNAL_CHARGES_LIVE: '',
    NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
  });
}

function restoreEnv() {
  if (savedSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedSupabaseUrl;
  if (savedSupabaseUrlAlt === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = savedSupabaseUrlAlt;
  setTitleTransferChargesLiveScopeEnvForTests(null);
}

type BankChargeRow = {
  id: string;
  status: string;
  charge_type?: string | null;
  external_id: string | null;
  integration_id: string | null;
  financial_account_id: string | null;
  provider: string;
  metadata?: Record<string, unknown>;
  company_id: string;
};

function makeMockAdmin(state: {
  charges: BankChargeRow[];
  updates: Array<{ id: string; patch: Record<string, unknown> }>;
}) {
  return {
    from(table: string) {
      if (table !== 'bank_charges') throw new Error(`unexpected table ${table}`);
      return {
        select(_cols: string) {
          const filters: Record<string, string> = {};
          const chain: {
            eq: (col: string, val: string) => typeof chain;
            maybeSingle: () => Promise<{ data: BankChargeRow | null; error: null }>;
          } = {
            eq(col: string, val: string) {
              filters[col] = val;
              return chain;
            },
            maybeSingle: async () => {
              const row =
                state.charges.find((c) => {
                  if (filters.id && c.id !== filters.id) return false;
                  if (filters.company_id && c.company_id !== filters.company_id) return false;
                  if (filters.provider && c.provider !== filters.provider) return false;
                  return true;
                }) || null;
              return { data: row ? { ...row } : null, error: null };
            },
          };
          return chain;
        },
        update(patch: Record<string, unknown>) {
          const filters: Record<string, string> = {};
          const chain = {
            eq(col: string, val: string) {
              filters[col] = val;
              return chain;
            },
            select() {
              return {
                maybeSingle: async () => {
                  const idx = state.charges.findIndex((c) => c.id === filters.id);
                  if (idx >= 0) {
                    state.charges[idx] = { ...state.charges[idx], ...patch } as BankChargeRow;
                    state.updates.push({ id: filters.id, patch });
                  }
                  return { data: { status: 'CANCELLED' }, error: null };
                },
              };
            },
          };
          return chain;
        },
      };
    },
  };
}

function makeFetch(opts: {
  getSituacoes: string[];
  cancelStatus?: number;
}): {
  fetchFn: InterOAuthFetchFn;
  cancelPosts: string[];
  getUrls: string[];
} {
  const cancelPosts: string[] = [];
  const getUrls: string[] = [];
  let getIdx = 0;
  const fetchFn: InterOAuthFetchFn = async (url, init) => {
    const u = String(url);
    if (u.includes('/oauth/v2/token')) {
      return {
        status: 200,
        bodyText: JSON.stringify({
          access_token: 'tok',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      };
    }
    if (init.method === 'GET' && u.includes('/cobrancas/')) {
      getUrls.push(u);
      const situacao =
        opts.getSituacoes[Math.min(getIdx, opts.getSituacoes.length - 1)] || 'A_RECEBER';
      getIdx += 1;
      return {
        status: 200,
        bodyText: JSON.stringify({
          codigoSolicitacao: 'b17a8b34-6fe5-4b5b-b6fd-b6f153e17708',
          situacao,
          valorNominal: 8,
        }),
      };
    }
    if (init.method === 'POST' && u.includes('/cancelar')) {
      cancelPosts.push(u);
      return {
        status: opts.cancelStatus || 202,
        bodyText: JSON.stringify({ status: 'PROCESSANDO' }),
      };
    }
    return { status: 404, bodyText: '{}' };
  };
  return { fetchFn, cancelPosts, getUrls };
}

const INSTANT_POLL = {
  maxAttempts: 3,
  initialDelayMs: 0,
  maxDelayMs: 0,
  sleepFn: async () => {},
};

const fakeSecretsLoader = async () => ({
  integrationId: 'int-1',
  environment: 'SANDBOX' as const,
  clientId: 'cid',
  clientSecret: 'sec',
  certificatePem: '-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nY\n-----END PRIVATE KEY-----',
});

function openCharge(id: string, externalId: string): BankChargeRow {
  return {
    id,
    status: 'REGISTERED',
    charge_type: 'BOLETO_PIX',
    external_id: externalId,
    integration_id: 'int-1',
    financial_account_id: 'fa-1',
    provider: 'INTER',
    company_id: 'co-1',
    metadata: { interSituacao: 'A_RECEBER', codigoSolicitacao: externalId },
  };
}

function charge(partial: Partial<ExternalChargeRecord> & { chargeId: string }): ExternalChargeRecord {
  return {
    provider: EXTERNAL_CHARGE_PROVIDER_INTER,
    companyId: 'co-1',
    saleId: 'sale-lt22',
    receiptId: null,
    status: 'REGISTERED',
    externalId: partial.externalId || partial.chargeId,
    classification: 'cancelable',
    amount: 8,
    dueDate: '2026-10-05',
    ...partial,
  };
}

const PAID = charge({
  chargeId: '2ba53e6c-8f71-47bc-a001-66d66745f827',
  receiptId: 'r-paid',
  status: 'PAID',
  classification: 'paid',
});
const OPEN_1 = charge({
  chargeId: '923de699-open-1',
  receiptId: 'r-1',
  classification: 'cancelable',
});
const OPEN_2 = charge({
  chargeId: '500ee461-open-2',
  receiptId: 'r-2',
  classification: 'cancelable',
});
const ORPHAN_1 = charge({
  chargeId: 'cb342d20-caf8-4b1d-b477-1590992e6a90',
  externalId: 'b17a8b34-6fe5-4b5b-b6fd-b6f153e17708',
  dueDate: '2026-10-05',
});
const ORPHAN_2 = charge({
  chargeId: 'dc092750-4759-4409-b8c2-1afd4aa93c4a',
  externalId: '2bbda860-bc31-4359-bfbd-cb397fca4bdb',
  dueDate: '2026-11-05',
});

async function testMockCancelTwoOrphans() {
  useDevelopEnv();
  const called: string[] = [];
  const result = await resolveTitleTransferClassifiedOrphanCharges({} as never, {
    companyId: 'co-1',
    saleId: 'sale-lt22',
    orphans: [ORPHAN_1, ORPHAN_2],
    paid: [PAID],
    open: [OPEN_1, OPEN_2],
    cancelCharge: async (_admin, input) => {
      called.push(input.chargeId);
      assert(
        input.chargeId !== PAID.chargeId &&
          input.chargeId !== OPEN_1.chargeId &&
          input.chargeId !== OPEN_2.chargeId,
        'não cancela paga/vigente',
      );
      return {
        ok: true as const,
        reused: false,
        remoteConfirmed: true,
        chargeId: input.chargeId,
        status: 'CANCELLED',
      };
    },
  });
  assert(result.ok === true, 'duas órfãs resolvidas');
  assert(result.executeTransfer === false, 'não executa transferência');
  assert(result.persistReceipts === false, 'não altera finance_receipts');
  assert(result.persistSale === false, 'não altera sale');
  assert(called.join() === `${ORPHAN_1.chargeId},${ORPHAN_2.chargeId}`, 'ordem GET/cancel 1 depois 2');
  assert(result.resolvedChargeIds.length === 2, 'duas IDs resolvidas');
}

async function testFailFastStopsSecond() {
  useDevelopEnv();
  const called: string[] = [];
  try {
    await resolveTitleTransferClassifiedOrphanCharges({} as never, {
      companyId: 'co-1',
      saleId: 'sale-lt22',
      orphans: [ORPHAN_1, ORPHAN_2],
      paid: [PAID],
      open: [OPEN_1, OPEN_2],
      cancelCharge: async (_admin, input) => {
        called.push(input.chargeId);
        if (input.chargeId === ORPHAN_1.chargeId) {
          throw new Error('POST aceito, porém consulta permaneceu A_RECEBER');
        }
        return {
          ok: true as const,
          reused: false,
          remoteConfirmed: true,
          chargeId: input.chargeId,
          status: 'CANCELLED',
        };
      },
    });
    throw new Error('deveria parar na primeira falha');
  } catch (err) {
    assert(err instanceof TitleTransferPreviewError, 'erro tipado');
    assert(err.code === TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED, 'RESOLVE_FAILED');
    assert(called.join() === ORPHAN_1.chargeId, 'não chama a órfã 2');
  }
}

async function testNeverTouchPaidOrOpen() {
  useDevelopEnv();
  let called = 0;
  try {
    await resolveTitleTransferClassifiedOrphanCharges({} as never, {
      companyId: 'co-1',
      saleId: 'sale-lt22',
      orphans: [PAID, ORPHAN_1],
      paid: [PAID],
      open: [OPEN_1, OPEN_2],
      cancelCharge: async () => {
        called += 1;
        return {
          ok: true as const,
          reused: false,
          remoteConfirmed: true,
          chargeId: 'x',
          status: 'CANCELLED',
        };
      },
    });
    throw new Error('deveria recusar paga no conjunto de órfãs');
  } catch (err) {
    assert(err instanceof TitleTransferPreviewError, 'erro tipado');
    assert(err.code === TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED, 'protege vigente/paga');
    assert(called === 0, 'não dispara cancel');
  }
}

async function testPaidClassificationBlocks() {
  useDevelopEnv();
  try {
    await resolveTitleTransferClassifiedOrphanCharges({} as never, {
      companyId: 'co-1',
      saleId: 'sale-lt22',
      orphans: [charge({ chargeId: 'orphan-paid', classification: 'paid', status: 'PAID' })],
      paid: [PAID],
      open: [OPEN_1, OPEN_2],
      cancelCharge: async () => {
        throw new Error('não deveria cancelar órfã paga');
      },
    });
    throw new Error('deveria recusar órfã paga');
  } catch (err) {
    assert(err instanceof TitleTransferPreviewError, 'erro tipado');
    assert(err.code === TITLE_TRANSFER_ORPHAN_PAID, 'ORPHAN_PAID');
  }
}

async function testNonInterBlocks() {
  useDevelopEnv();
  try {
    await resolveTitleTransferClassifiedOrphanCharges({} as never, {
      companyId: 'co-1',
      saleId: 'sale-lt22',
      orphans: [charge({ chargeId: 'asaas-orphan', provider: 'ASAAS' })],
      paid: [PAID],
      open: [OPEN_1, OPEN_2],
      cancelCharge: async () => {
        throw new Error('não deveria cancelar Asaas');
      },
    });
    throw new Error('deveria recusar não-Inter');
  } catch (err) {
    assert(err instanceof TitleTransferPreviewError, 'erro tipado');
    assert(err.code === TITLE_TRANSFER_ORPHAN_NOT_INTER, 'ORPHAN_NOT_INTER');
  }
}

async function testProductionAbort() {
  useProductionEnv();
  try {
    await resolveTitleTransferClassifiedOrphanCharges({} as never, {
      companyId: 'co-1',
      saleId: 'sale-lt22',
      orphans: [ORPHAN_1],
      paid: [PAID],
      open: [OPEN_1, OPEN_2],
      cancelCharge: async () => {
        throw new Error('não deveria cancelar em Production');
      },
    });
    throw new Error('deveria abortar Production');
  } catch (err) {
    assert(err instanceof TitleTransferPreviewError, 'erro tipado');
    assert(err.code === TITLE_TRANSFER_ORPHAN_RESOLVE_DISABLED, 'DISABLED');
    assert(err.status === 404, '404 Production');
  }
}

async function testAlreadyCancelledNoSecondPost() {
  useDevelopEnv();
  const state = {
    charges: [openCharge(ORPHAN_1.chargeId, ORPHAN_1.externalId || '')],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const { fetchFn, cancelPosts } = makeFetch({ getSituacoes: ['CANCELADO'] });
  const result = await resolveTitleTransferClassifiedOrphanCharges(makeMockAdmin(state) as never, {
    companyId: 'co-1',
    saleId: 'sale-lt22',
    orphans: [ORPHAN_1],
    paid: [PAID],
    open: [OPEN_1, OPEN_2],
    fetchFn,
    secretsLoader: fakeSecretsLoader as never,
    poll: INSTANT_POLL,
  });
  assert(result.ok === true, 'já CANCELADO sincroniza local');
  assert(result.items[0]?.reused === true, 'não faz POST de novo');
  assert(cancelPosts.length === 0, 'sem POST /cancelar');
  assert(state.charges[0].status === 'CANCELLED', 'local CANCELLED após GET');
  assert(state.updates.length === 1, 'persistiu uma vez');
  assert(
    (state.updates[0]?.patch.metadata as { remoteCancelConfirmed?: boolean })?.remoteCancelConfirmed ===
      true,
    'remoteCancelConfirmed',
  );
}

async function testPaidRemoteNoPersist() {
  useDevelopEnv();
  const state = {
    charges: [openCharge(ORPHAN_1.chargeId, ORPHAN_1.externalId || '')],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const { fetchFn, cancelPosts } = makeFetch({ getSituacoes: ['RECEBIDO'] });
  try {
    await resolveTitleTransferClassifiedOrphanCharges(makeMockAdmin(state) as never, {
      companyId: 'co-1',
      saleId: 'sale-lt22',
      orphans: [ORPHAN_1],
      paid: [PAID],
      open: [OPEN_1, OPEN_2],
      fetchFn,
      secretsLoader: fakeSecretsLoader as never,
      poll: INSTANT_POLL,
    });
    throw new Error('não deveria cancelar RECEBIDO');
  } catch (err) {
    assert(err instanceof TitleTransferPreviewError, 'erro tipado');
    assert(err.code === TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED, 'bloqueia pago remoto');
    assert(cancelPosts.length === 0, 'sem POST em RECEBIDO');
    assert(state.charges[0].status === 'REGISTERED', 'local inalterado');
    assert(state.updates.length === 0, 'não persistiu CANCELLED');
  }
}

async function test202AReceberNoLocalCancelled() {
  useDevelopEnv();
  const state = {
    charges: [openCharge(ORPHAN_1.chargeId, ORPHAN_1.externalId || '')],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const { fetchFn, cancelPosts } = makeFetch({
    getSituacoes: ['A_RECEBER', 'A_RECEBER', 'A_RECEBER'],
    cancelStatus: 202,
  });
  try {
    await resolveTitleTransferClassifiedOrphanCharges(makeMockAdmin(state) as never, {
      companyId: 'co-1',
      saleId: 'sale-lt22',
      orphans: [ORPHAN_1],
      paid: [PAID],
      open: [OPEN_1, OPEN_2],
      fetchFn,
      secretsLoader: fakeSecretsLoader as never,
      poll: INSTANT_POLL,
    });
    throw new Error('202 + A_RECEBER não é sucesso');
  } catch (err) {
    assert(err instanceof TitleTransferPreviewError, 'erro tipado');
    assert(err.code === TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED, 'falha fechada');
    assert(cancelPosts.length === 1, 'POST ocorreu');
    assert(state.charges[0].status === 'REGISTERED', '202 não marca CANCELLED');
    assert(state.updates.length === 0, 'local permanece');
  }
}

async function test202ThenCancelledPersists() {
  useDevelopEnv();
  const state = {
    charges: [openCharge(ORPHAN_1.chargeId, ORPHAN_1.externalId || '')],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const { fetchFn, cancelPosts } = makeFetch({
    getSituacoes: ['A_RECEBER', 'CANCELADO'],
    cancelStatus: 202,
  });
  const result = await resolveTitleTransferClassifiedOrphanCharges(makeMockAdmin(state) as never, {
    companyId: 'co-1',
    saleId: 'sale-lt22',
    orphans: [ORPHAN_1],
    paid: [PAID],
    open: [OPEN_1, OPEN_2],
    fetchFn,
    secretsLoader: fakeSecretsLoader as never,
    poll: INSTANT_POLL,
  });
  assert(result.ok === true, 'GET confirma CANCELADO');
  assert(result.items[0]?.remoteConfirmed === true, 'remoteConfirm');
  assert(cancelPosts.length === 1, 'um POST');
  assert(state.charges[0].status === 'CANCELLED', 'persistiu só após GET');
}

async function testUsesOfficialCancelNotReleaseLot() {
  const called: string[] = [];
  useDevelopEnv();
  await resolveTitleTransferClassifiedOrphanCharges({} as never, {
    companyId: 'co-1',
    saleId: 'sale-lt22',
    orphans: [ORPHAN_1],
    paid: [PAID],
    open: [OPEN_1, OPEN_2],
    cancelCharge: async (admin, input) => {
      called.push('injected');
      return cancelInterInstallmentCharge(admin, {
        companyId: input.companyId,
        chargeId: input.chargeId,
        fetchFn: async () => ({ status: 404, bodyText: '{}' }),
        persistLocalCancelled: false,
      }).catch(() => {
        return {
          ok: true as const,
          reused: false,
          remoteConfirmed: true,
          chargeId: input.chargeId,
          status: 'CANCELLED',
        };
      });
    },
  });
  assert(called.length === 1, 'usa função de cancelamento injetável');
}

function testSourceIsolation() {
  const svc = read('lib/finance/saleTitleTransferOrphanChargesService.ts');
  assert(svc.includes('cancelInterInstallmentCharge'), 'reusa cancel Inter homologado');
  assert(!svc.includes('execute_sale_title_transfer'), 'sem RPC da transferência');
  assert(!/\.rpc\s*\(/.test(svc), 'sem rpc()');
  assert(!svc.includes('executeSaleTitleTransfer'), 'sem execute local');
  assert(!svc.includes('sale_lot_swaps'), 'sem Troca de Lote');
  assert(!svc.includes('interChargeCancelForRelease'), 'sem ReleaseLot');
  assert(!svc.includes('asaasCompanyChargeService'), 'sem Asaas');
  assert(!svc.includes('cancelCompanyCharge'), 'sem cancel Asaas');
  assert(!/\bC6\b/.test(svc), 'sem C6');
  assert(!svc.includes('.delete('), 'não deleta bank_charges');
  assert(!svc.includes('from(\'finance_receipts\')'), 'não altera receipts');

  const route = read('app/api/sales/[saleId]/title-transfer/resolve-orphans/route.ts');
  assert(route.includes('resolveSaleTitleTransferOrphanCharges'), 'API oficial');
  assert(route.includes('isProductionSupabaseRuntime'), 'bloqueia Production');
  assert(!route.includes('execute_sale_title_transfer'), 'API sem RPC');
  assert(!route.includes('title-transfer/execute'), 'não chama execute');

  assert(
    !fs.existsSync(path.join(__dirname, '..', 'app/api/finance/preview-inter-orphan-get/route.ts')),
    'probe GET removido',
  );
  assert(
    !fs.existsSync(path.join(__dirname, '..', 'app/api/finance/preview-inter-orphan-resolve/route.ts')),
    'probe resolve removido',
  );
  const mw = read('middleware.ts');
  assert(!mw.includes('preview-inter-orphan-get'), 'middleware sem probe GET');
  assert(!mw.includes('preview-inter-orphan-resolve'), 'middleware sem probe resolve');

  const panel = read('components/map/TitleTransferPreviewPanel.tsx');
  assert(panel.includes('Resolver cobranças órfãs'), 'botão na UI DEVELOP');
  assert(panel.includes('orphanResolveEnabled'), 'botão oculto em Production');
  assert(panel.includes('title-transfer/resolve-orphans'), 'POST resolver órfãs');
  assert(panel.includes('orphans.length > 0'), 'bloqueia Transfer com órfãs');
  assert(!panel.includes('title-transfer/execute') || panel.includes('executeTransfer'), 'Transfer permanece ação à parte');

  const asaas = read('lib/finance/externalCharges/asaasAdapter.ts');
  assert(!asaas.includes('amount, due_date'), 'Asaas adapter intacto');
  const release = read('lib/finance/releaseLotShared.ts');
  assert(release.includes('classifyInterBankChargeForRelease'), 'ReleaseLot intacto');

  const mapped = mapTitleTransferPreviewUserMessage({
    code: TITLE_TRANSFER_ORPHAN_RESOLVE_FAILED,
    message: 'POST aceito, porém consulta permaneceu A_RECEBER',
  });
  assert(/órfã|A_RECEBER/.test(mapped), 'mensagem operacional');
}

async function main() {
  try {
    await testMockCancelTwoOrphans();
    await testFailFastStopsSecond();
    await testNeverTouchPaidOrOpen();
    await testPaidClassificationBlocks();
    await testNonInterBlocks();
    await testProductionAbort();
    await testAlreadyCancelledNoSecondPost();
    await testPaidRemoteNoPersist();
    await test202AReceberNoLocalCancelled();
    await test202ThenCancelledPersists();
    await testUsesOfficialCancelNotReleaseLot();
    testSourceIsolation();
    console.log('OK mandatory-title-transfer-orphan-resolve-tests');
  } finally {
    restoreEnv();
  }
}

void main().catch((err) => {
  restoreEnv();
  console.error(err);
  process.exit(1);
});

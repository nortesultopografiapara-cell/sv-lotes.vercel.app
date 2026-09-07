/**
 * Cancelamento Inter da Transferência de titularidade (mocks).
 * GET → POST /cancelar (202 async) → polling GET até CANCELADO.
 * Sem HTTP Inter/Asaas real. Sem RPC local. Sem ReleaseLot.
 *
 * npx tsx scripts/mandatory-inter-title-transfer-cancel-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { cancelInterInstallmentCharge, diagnoseIsolatedInterCancel } from '../lib/banking/inter/interSaleChargeService';
import {
  INTER_CANCEL_CONFIRM_POLL,
  INTER_COBRANCA_V3_CANCEL_ACCEPT,
  InterRemoteCancelError,
  sanitizeInterCobrancaHttpPayload,
} from '../lib/banking/inter/interCobrancaClient';
import { INTER_OAUTH_SCOPES } from '../lib/banking/inter/interEndpoints';
import type { InterOAuthCredentials, InterOAuthFetchFn } from '../lib/banking/inter/interOAuthClient';
import { mapTitleTransferPreviewUserMessage } from '../lib/finance/saleTitleTransferPreview';
import { TITLE_TRANSFER_CHARGES_CANCEL_FAILED } from '../lib/finance/saleTitleTransferExecute';

function asCancelError(err: unknown): InterRemoteCancelError {
  if (!(err instanceof InterRemoteCancelError)) throw err;
  return err;
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const CREDENTIALS: InterOAuthCredentials = {
  companyId: 'co-1',
  integrationId: 'int-1',
  environment: 'SANDBOX',
  clientId: 'cid',
  clientSecret: 'sec',
  certificatePem: '-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nY\n-----END PRIVATE KEY-----',
};

const fakeSecretsLoader = async () => ({
  integrationId: 'int-1',
  environment: 'SANDBOX' as const,
  clientId: 'cid',
  clientSecret: 'sec',
  certificatePem: CREDENTIALS.certificatePem,
  privateKeyPem: CREDENTIALS.privateKeyPem,
});

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
  getExtra?: Record<string, unknown>;
  cancelStatus?: number;
  cancelFail?: boolean;
  cancelEmptyBody?: boolean;
  cancelBody?: Record<string, unknown>;
}): {
  fetchFn: InterOAuthFetchFn;
  cancelPosts: string[];
  cancelBodies: string[];
  cancelAccepts: string[];
  getUrls: string[];
} {
  const cancelPosts: string[] = [];
  const cancelBodies: string[] = [];
  const cancelAccepts: string[] = [];
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
          codigoSolicitacao: 'dcd8ceee-a72f-4a2c-bd38-f23eb64d0923',
          situacao,
          valorNominal: 10,
          ...(opts.getExtra || {}),
        }),
      };
    }
    if (init.method === 'POST' && u.includes('/cancelar')) {
      cancelPosts.push(u);
      cancelBodies.push(String(init.body || ''));
      cancelAccepts.push(String(init.headers?.Accept || ''));
      if (opts.cancelEmptyBody) {
        return { status: opts.cancelStatus || 202, bodyText: '' };
      }
      if (opts.cancelFail) {
        return {
          status: opts.cancelStatus || 400,
          bodyText: JSON.stringify(
            opts.cancelBody || {
              title: 'Erro',
              detail: 'Falha simulada ao cancelar',
            },
          ),
        };
      }
      return {
        status: opts.cancelStatus || 202,
        bodyText: JSON.stringify(
          opts.cancelBody || { status: 'PROCESSANDO' },
        ),
      };
    }
    return { status: 404, bodyText: '{}' };
  };
  return { fetchFn, cancelPosts, cancelBodies, cancelAccepts, getUrls };
}

const INSTANT_POLL = {
  maxAttempts: 3,
  initialDelayMs: 0,
  maxDelayMs: 0,
  sleepFn: async () => {},
};

function openCharge(id = 'bc-open', chargeType = 'BOLETO_PIX'): BankChargeRow {
  return {
    id,
    status: 'REGISTERED',
    charge_type: chargeType,
    external_id: 'dcd8ceee-a72f-4a2c-bd38-f23eb64d0923',
    integration_id: 'int-1',
    financial_account_id: 'fa-1',
    provider: 'INTER',
    company_id: 'co-1',
    metadata: { interSituacao: 'A_RECEBER', codigoSolicitacao: 'dcd8ceee-a72f-4a2c-bd38-f23eb64d0923' },
  };
}

async function runCancel(
  charge: BankChargeRow,
  fetchOpts: Parameters<typeof makeFetch>[0],
  poll = INSTANT_POLL,
) {
  const state = { charges: [charge], updates: [] as Array<{ id: string; patch: Record<string, unknown> }> };
  const { fetchFn, cancelPosts, cancelBodies, cancelAccepts, getUrls } = makeFetch(fetchOpts);
  const result = await cancelInterInstallmentCharge(makeMockAdmin(state) as never, {
    companyId: 'co-1',
    chargeId: charge.id,
    fetchFn,
    secretsLoader: fakeSecretsLoader as never,
    poll,
  });
  return { result, state, cancelPosts, cancelBodies, cancelAccepts, getUrls };
}

async function testGetThenPostThenCancelled() {
  const { result, state, cancelPosts, cancelBodies, cancelAccepts, getUrls } = await runCancel(
    openCharge(),
    { getSituacoes: ['A_RECEBER', 'CANCELADO'] },
  );
  assert(result.ok && result.remoteConfirmed === true, 'GET A_RECEBER → POST → GET CANCELADO confirma');
  assert(result.reused === false, 'não é reuse');
  assert(cancelPosts.length === 1, 'POST /cancelar 1x');
  assert(
    cancelPosts[0].includes('/cobrancas/dcd8ceee-a72f-4a2c-bd38-f23eb64d0923/cancelar'),
    'POST usa codigoSolicitacao UUID, não seuNumero',
  );
  assert(getUrls[0].includes('/cobrancas/dcd8ceee-a72f-4a2c-bd38-f23eb64d0923'), 'GET usa o mesmo UUID');
  assert(
    JSON.parse(cancelBodies[0]).motivoCancelamento === 'Solicitado Pela Empresa',
    'BOLETO_PIX envia motivo Solicitado Pela Empresa',
  );
  assert(cancelAccepts[0] === 'application/problem+json', 'Accept exclusivo problem+json');
  assert(!cancelAccepts[0].includes('application/json'), 'Accept não mistura application/json');
  assert(state.charges[0].status === 'CANCELLED', 'local CANCELLED só após GET CANCELADO');
  assert(
    (state.updates[0]?.patch.metadata as { remoteCancelConfirmed?: boolean })?.remoteCancelConfirmed ===
      true,
    'remoteCancelConfirmed',
  );
}

async function test202FirstGetStillAReceberThenCancelled() {
  const { result, cancelPosts, state } = await runCancel(openCharge(), {
    getSituacoes: ['A_RECEBER', 'A_RECEBER', 'CANCELADO'],
    cancelStatus: 202,
  });
  assert(result.remoteConfirmed === true, '202 + 1º GET A_RECEBER + 2º GET CANCELADO');
  assert(cancelPosts.length === 1, 'um POST');
  assert(state.charges[0].status === 'CANCELLED', 'persistiu após 2º GET');
}

async function testAlreadyCancelledIdempotent() {
  const { result, cancelPosts, state } = await runCancel(openCharge(), {
    getSituacoes: ['CANCELADO'],
  });
  assert(result.reused === true && result.remoteConfirmed === true, 'já CANCELADO é idempotente');
  assert(cancelPosts.length === 0, 'não chama POST');
  assert(state.charges[0].status === 'CANCELLED', 'sincroniza local');
}

async function testPaidNeverPosts() {
  const paid = { ...openCharge(), status: 'REGISTERED' };
  const state = { charges: [paid], updates: [] as Array<{ id: string; patch: Record<string, unknown> }> };
  const { fetchFn, cancelPosts } = makeFetch({ getSituacoes: ['RECEBIDO'] });
  try {
    await cancelInterInstallmentCharge(makeMockAdmin(state) as never, {
      companyId: 'co-1',
      chargeId: paid.id,
      fetchFn,
      secretsLoader: fakeSecretsLoader as never,
      poll: INSTANT_POLL,
    });
    throw new Error('deveria recusar paga');
  } catch (err) {
    const cancelErr = asCancelError(err);
    assert(true, 'erro operacional');
    assert(cancelErr.stage === 'consulta_inicial', 'etapa consulta inicial');
    assert(/paga/i.test(cancelErr.message), 'mensagem de paga');
    assert(!/token|secret|BEGIN /i.test(cancelErr.message), 'sem segredo');
  }
  assert(cancelPosts.length === 0, 'PAGO nunca POST cancel');
  assert(state.charges[0].status === 'REGISTERED', 'não marca CANCELLED');
}

async function testTimeoutInconclusiveNoLocalCancel() {
  const state = {
    charges: [openCharge()],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const { fetchFn, cancelPosts } = makeFetch({
    getSituacoes: ['A_RECEBER', 'A_RECEBER', 'A_RECEBER'],
    cancelStatus: 202,
  });
  try {
    await cancelInterInstallmentCharge(makeMockAdmin(state) as never, {
      companyId: 'co-1',
      chargeId: 'bc-open',
      fetchFn,
      secretsLoader: fakeSecretsLoader as never,
      poll: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0, sleepFn: async () => {} },
    });
    throw new Error('deveria falhar timeout');
  } catch (err) {
    const cancelErr = asCancelError(err);
    assert(true, 'timeout = InterRemoteCancelError');
    assert(cancelErr.stage === 'confirmacao', 'etapa confirmação');
    assert(cancelErr.situacao === 'A_RECEBER', 'permaneceu A_RECEBER');
    assert(cancelErr.httpStatus === 202, 'HTTP 202 do POST');
    assert(cancelErr.message.includes('codigoSolicitacao: dcd8ceee-a72f-4a2c-bd38-f23eb64d0923'), 'codigo no erro');
    assert(/POST aceito, porém consulta permaneceu A_RECEBER/.test(cancelErr.message), 'texto operacional');
  }
  assert(cancelPosts.length === 1, 'POST ocorreu');
  assert(state.charges[0].status === 'REGISTERED', 'timeout não marca CANCELLED');
  assert(state.updates.length === 0, 'nenhum UPDATE local');
}

async function testBoletoPuroStillAcertos() {
  const { cancelBodies } = await runCancel(openCharge('bc-boleto', 'BOLETO'), {
    getSituacoes: ['A_RECEBER', 'CANCELADO'],
  });
  assert(
    JSON.parse(cancelBodies[0]).motivoCancelamento === 'ACERTOS',
    'BOLETO puro permanece ACERTOS',
  );
}

async function test202ViolacoesNoLocalCancel() {
  const state = {
    charges: [openCharge()],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const { fetchFn, cancelPosts } = makeFetch({
    getSituacoes: ['A_RECEBER'],
    cancelStatus: 202,
    cancelBody: {
      title: 'Falha durante a execução da request.',
      detail: 'Verifique os dados informados',
      status: 'ERRO',
      violacoes: [{ razao: 'motivoCancelamento inválido' }],
    },
  });
  try {
    await cancelInterInstallmentCharge(makeMockAdmin(state) as never, {
      companyId: 'co-1',
      chargeId: 'bc-open',
      fetchFn,
      secretsLoader: fakeSecretsLoader as never,
      poll: INSTANT_POLL,
    });
    throw new Error('deveria recusar 202 com violacoes');
  } catch (err) {
    const cancelErr = asCancelError(err);
    assert(cancelErr.stage === 'pedido_cancelamento', '202+violacoes = pedido_cancelamento');
    assert(cancelErr.httpStatus === 202, 'HTTP 202 rejeitado pelo body');
    assert(/violacoes|motivoCancelamento|Falha/i.test(cancelErr.message), 'body sanitizado no erro');
  }
  assert(cancelPosts.length === 1, 'POST ocorreu');
  assert(state.charges[0].status === 'REGISTERED', '202 rejeitado não marca CANCELLED');
  assert(state.updates.length === 0, 'nenhum UPDATE local');
}

async function testGetAReceberWithProcessingError() {
  const state = {
    charges: [openCharge()],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const { fetchFn } = makeFetch({
    getSituacoes: ['A_RECEBER', 'A_RECEBER'],
    cancelStatus: 202,
    getExtra: { falha: 'Erro ao processar' },
  });
  try {
    await cancelInterInstallmentCharge(makeMockAdmin(state) as never, {
      companyId: 'co-1',
      chargeId: 'bc-open',
      fetchFn,
      secretsLoader: fakeSecretsLoader as never,
      poll: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0, sleepFn: async () => {} },
    });
    throw new Error('deveria falhar com falha de processamento');
  } catch (err) {
    const cancelErr = asCancelError(err);
    assert(cancelErr.stage === 'confirmacao', 'etapa confirmação');
    assert(cancelErr.situacao === 'A_RECEBER', 'permaneceu A_RECEBER');
    assert(/Erro ao processar/.test(cancelErr.message), 'expõe substatus de processamento');
  }
  assert(state.charges[0].status === 'REGISTERED', 'GET com falha não marca CANCELLED');
  assert(state.updates.length === 0, 'nenhum UPDATE local');
}

async function testEmpty202BodyStaysFailClosed() {
  const state = {
    charges: [openCharge()],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const { fetchFn } = makeFetch({
    getSituacoes: ['A_RECEBER', 'A_RECEBER', 'A_RECEBER'],
    cancelEmptyBody: true,
    cancelStatus: 202,
  });
  try {
    await cancelInterInstallmentCharge(makeMockAdmin(state) as never, {
      companyId: 'co-1',
      chargeId: 'bc-open',
      fetchFn,
      secretsLoader: fakeSecretsLoader as never,
      poll: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0, sleepFn: async () => {} },
    });
    throw new Error('deveria falhar 202 vazio');
  } catch (err) {
    const cancelErr = asCancelError(err);
    assert(cancelErr.stage === 'confirmacao', '202 vazio segue para confirmação');
    assert(cancelErr.message.includes('"empty":true'), 'erro operacional registra POST sem body');
    assert(!/token|secret|BEGIN /i.test(cancelErr.message), '202 vazio sem segredo');
  }
  assert(state.charges[0].status === 'REGISTERED', '202 vazio não marca CANCELLED');
}

function testSanitizeKeepsUnknownFieldsAndRedactsCpf() {
  const sanitized = sanitizeInterCobrancaHttpPayload(
    JSON.stringify({
      status: 'PROCESSANDO',
      mensagem: 'Cancelamento solicitado',
      violacoes: [],
      origem: { falha: 'Erro ao processar' },
      pagador: { cpfCnpj: '65082028200', nome: 'SEVERINO' },
      access_token: 'leak',
    }),
  );
  assert(sanitized.empty === false, 'body presente');
  assert(sanitized.status === 'PROCESSANDO', 'preserva status');
  assert((sanitized.origem as { falha?: string })?.falha === 'Erro ao processar', 'preserva nested falha');
  assert(String((sanitized.pagador as { cpfCnpj?: string })?.cpfCnpj) === '[cpf-redacted]', 'redige CPF');
  assert(sanitized.access_token === '[REDACTED]', 'redige token');
  const empty = sanitizeInterCobrancaHttpPayload('');
  assert(empty.empty === true, 'body vazio');
}

async function testPersistLocalFalseDoesNotUpdate() {
  const { result, state } = await runCancel(
    openCharge(),
    { getSituacoes: ['A_RECEBER', 'CANCELADO'] },
  );
  assert(result.ok && result.remoteConfirmed, 'GET CANCELADO confirma remoto');
  assert(state.charges[0].status === 'CANCELLED', 'default persiste local');

  const state2 = { charges: [openCharge('bc-diag')], updates: [] as Array<{ id: string; patch: Record<string, unknown> }> };
  const { fetchFn } = makeFetch({ getSituacoes: ['A_RECEBER', 'CANCELADO'] });
  const isolated = await cancelInterInstallmentCharge(makeMockAdmin(state2) as never, {
    companyId: 'co-1',
    chargeId: 'bc-diag',
    fetchFn,
    secretsLoader: fakeSecretsLoader as never,
    poll: INSTANT_POLL,
    persistLocalCancelled: false,
  });
  assert(isolated.remoteConfirmed === true, 'isolado confirma remoto');
  assert(state2.charges[0].status === 'REGISTERED', 'isolado não marca CANCELLED');
  assert(state2.updates.length === 0, 'isolado sem UPDATE');
}

async function testDiagnoseIsolatedAReceber() {
  const state = { charges: [openCharge('bc-iso')], updates: [] as Array<{ id: string; patch: Record<string, unknown> }> };
  const { fetchFn, cancelAccepts } = makeFetch({
    getSituacoes: ['A_RECEBER', 'A_RECEBER', 'A_RECEBER'],
    cancelStatus: 202,
  });
  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try {
    const diag = await diagnoseIsolatedInterCancel(makeMockAdmin(state) as never, {
      companyId: 'co-1',
      chargeId: 'bc-iso',
      fetchFn,
      secretsLoader: fakeSecretsLoader as never,
      poll: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0, sleepFn: async () => {} },
    });
    assert(diag.ok === false, 'A_RECEBER não é sucesso');
    assert(diag.remoteConfirmed === false, 'sem confirmação remota');
    assert(diag.markedLocalCancelled === false, 'não marcou local');
    assert(diag.executedTransfer === false, 'sem RPC');
    assert(diag.localStatus === 'REGISTERED', 'status local intacto');
    assert(diag.post.accept === 'application/problem+json', 'Accept problem+json');
    assert(diag.post.contentType === 'application/json', 'Content-Type json');
    assert(diag.post.motivo === 'Solicitado Pela Empresa', 'motivo bolepix');
    assert(diag.post.httpStatus === 202, 'POST 202');
    assert(diag.gets.length >= 1, 'registrou GETs posteriores');
    assert(diag.gets.every((g) => typeof g.elapsedMsFromPost === 'number'), 'tempo desde POST');
    assert(diag.situacaoBeforePost === 'A_RECEBER', 'situação antes do POST');
    assert(state.updates.length === 0, 'diagnóstico sem UPDATE');
    assert(cancelAccepts[0] === 'application/problem+json', 'Accept exclusivo no POST');
  } finally {
    process.env.VERCEL_ENV = prev;
  }
}

async function testDiagnoseIsolatedRemoteCancelNoLocalWrite() {
  const state = { charges: [openCharge('bc-ok')], updates: [] as Array<{ id: string; patch: Record<string, unknown> }> };
  const { fetchFn } = makeFetch({ getSituacoes: ['A_RECEBER', 'CANCELADO'] });
  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try {
    const diag = await diagnoseIsolatedInterCancel(makeMockAdmin(state) as never, {
      companyId: 'co-1',
      chargeId: 'bc-ok',
      fetchFn,
      secretsLoader: fakeSecretsLoader as never,
      poll: INSTANT_POLL,
    });
    assert(diag.ok === true && diag.remoteConfirmed === true, 'GET CANCELADO = sucesso remoto');
    assert(diag.localStatus === 'REGISTERED', 'mesmo com GET CANCELADO não persiste local');
    assert(state.updates.length === 0, 'sem UPDATE em sucesso remoto isolado');
  } finally {
    process.env.VERCEL_ENV = prev;
  }
}

async function testHttpErrorNoLocalCancel() {
  const state = {
    charges: [openCharge()],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const { fetchFn } = makeFetch({ getSituacoes: ['A_RECEBER'], cancelFail: true, cancelStatus: 403 });
  try {
    await cancelInterInstallmentCharge(makeMockAdmin(state) as never, {
      companyId: 'co-1',
      chargeId: 'bc-open',
      fetchFn,
      secretsLoader: fakeSecretsLoader as never,
      poll: INSTANT_POLL,
    });
    throw new Error('deveria falhar HTTP');
  } catch (err) {
    const cancelErr = asCancelError(err);
    assert(true, 'HTTP = InterRemoteCancelError');
    assert(cancelErr.stage === 'pedido_cancelamento', 'etapa pedido');
    assert(cancelErr.httpStatus === 403, 'HTTP 403');
  }
  assert(state.charges[0].status === 'REGISTERED', 'HTTP erro não marca CANCELLED');
}

async function testOperatorMessageAndUi() {
  const err = new InterRemoteCancelError({
    stage: 'confirmacao',
    httpStatus: 202,
    situacao: 'A_RECEBER',
    codigoSolicitacao: 'dcd8ceee-a72f-4a2c-bd38-f23eb64d0923',
  });
  const labeled = `${err.withParcelLabel(2, 4)} A transferência local não foi executada.`;
  assert(labeled.startsWith('Inter — Parcela 2/4 — cancelamento não confirmado'), 'rótulo parcela');
  assert(labeled.includes('POST aceito, porém consulta permaneceu A_RECEBER'), 'situação');
  assert(labeled.includes('codigoSolicitacao: dcd8ceee-a72f-4a2c-bd38-f23eb64d0923'), 'codigo');
  const shown = mapTitleTransferPreviewUserMessage({
    code: TITLE_TRANSFER_CHARGES_CANCEL_FAILED,
    message: labeled,
  });
  assert(shown === labeled, 'UI DEVELOP mostra erro operacional');
  const redacted = mapTitleTransferPreviewUserMessage({
    code: TITLE_TRANSFER_CHARGES_CANCEL_FAILED,
    message: 'Bearer token abc',
  });
  assert(
    redacted ===
      'Falha ao cancelar cobrança bancária do titular anterior. A transferência local não foi executada.',
    'não exibe token',
  );
}

function testSourceAndReleaseLotUntouched() {
  const cancel = read('lib/banking/inter/interSaleChargeService.ts');
  const client = read('lib/banking/inter/interCobrancaClient.ts');
  const release = read('lib/banking/inter/interChargeCancelForRelease.ts');
  const releaseShared = read('lib/finance/releaseLotShared.ts');
  const orch = read('lib/finance/saleTitleTransferChargesExecuteService.ts');
  assert(client.includes('pollInterCobrancaUntilCancelSettled'), 'helper de polling compartilhado');
  assert(client.includes("INTER_BOLEPIX_CANCEL_MOTIVO = 'Solicitado Pela Empresa'"), 'motivo bolepix');
  assert(client.includes("INTER_COBRANCA_V3_CANCEL_ACCEPT = 'application/problem+json'"), 'Accept exclusivo');
  assert(!client.includes("accept: 'application/problem+json, application/json'"), 'sem Accept misto');
  assert(INTER_COBRANCA_V3_CANCEL_ACCEPT === 'application/problem+json', 'constante Accept');
  assert(cancel.includes('resolveInterCobrancaV3CancelMotivo'), 'adapter escolhe motivo por charge_type');
  assert(cancel.includes('logInterCancelDiagnostics'), 'diag DEVELOP sanitizado');
  assert(!cancel.includes("motivoCancelamento: 'ACERTOS'"), 'adapter não força ACERTOS em bolepix');
  assert(INTER_OAUTH_SCOPES === 'boleto-cobranca.read boleto-cobranca.write', 'scopes oficiais');
  assert(INTER_CANCEL_CONFIRM_POLL.maxAttempts === 5, 'limite pequeno de tentativas');
  assert(release.includes('await cancelInterCobranca'), 'ReleaseLot segue POST homologado');
  assert(!release.includes('pollInterCobrancaUntilCancelSettled'), 'ReleaseLot não foi reescrito');
  assert(releaseShared.includes("return 'ACERTOS'"), 'ReleaseLot ainda mapeia ACERTOS');
  assert(orch.includes('formatTitleTransferBankCancelFailure'), 'erro operacional no orquestrador');
  assert(!orch.includes("provider === 'INTER'"), 'orquestrador sem if INTER');
  const api = read('app/api/finance/inter/diagnose-cancel/route.ts');
  assert(api.includes('diagnoseIsolatedInterCancel'), 'rota de diagnóstico isolado');
  assert(api.includes('execute_sale_title_transfer: false'), 'rota não dispara RPC');
  assert(api.includes("error: 'Not found'"), '404 fora de DEVELOP/Preview');
  const transferOrch = read('lib/finance/saleTitleTransferChargesExecuteService.ts');
  assert(transferOrch.includes('cancelCancelableCharge'), 'Transferência usa registry');
  assert(!transferOrch.includes('diagnoseIsolatedInterCancel'), 'orquestrador sem diagnóstico isolado');
}

async function main() {
  await testGetThenPostThenCancelled();
  await test202FirstGetStillAReceberThenCancelled();
  await testAlreadyCancelledIdempotent();
  await testPaidNeverPosts();
  await testTimeoutInconclusiveNoLocalCancel();
  await testBoletoPuroStillAcertos();
  await test202ViolacoesNoLocalCancel();
  await testGetAReceberWithProcessingError();
  await testEmpty202BodyStaysFailClosed();
  testSanitizeKeepsUnknownFieldsAndRedactsCpf();
  await testPersistLocalFalseDoesNotUpdate();
  await testDiagnoseIsolatedAReceber();
  await testDiagnoseIsolatedRemoteCancelNoLocalWrite();
  await testHttpErrorNoLocalCancel();
  await testOperatorMessageAndUi();
  testSourceAndReleaseLotUntouched();
  console.log('OK mandatory-inter-title-transfer-cancel-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

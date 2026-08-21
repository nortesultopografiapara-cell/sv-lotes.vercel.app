/**
 * Liberar lote × Banco Inter — cenário homolog + falha API.
 * npx tsx scripts/mandatory-release-lot-inter-tests.ts
 *
 * NÃO altera o fluxo Asaas. Cobre:
 * - Entrada R$100 paga preservada
 * - Parcela R$110 Inter A_RECEBER cancelada via POST …/cancelar
 * - 9 parcelas sem cobrança só limpeza local
 * - Falha na API Inter bloqueia limpeza local (INTER_CANCEL_FAILED)
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  cancelInterCobranca,
  InterCobrancaHttpError,
} from '../lib/banking/inter/interCobrancaClient';
import { resolveInterChargesForRelease } from '../lib/banking/inter/interChargeCancelForRelease';
import {
  classifyRemoteInterSituacaoForRelease,
  isActiveUnpaidFinanceReceipt,
  isLocalInterCancelCandidateStatus,
  isOperationalFinanceReceiptForListing,
  isPaidFinanceReceiptStatus,
  summarizeReleaseInterCharges,
  summarizeReleaseReceipts,
} from '../lib/finance/releaseLotShared';
import { filterChargeInstallments } from '../lib/charges/chargeInstallmentHelpers';
import { resolveChargeActionVisibility } from '../lib/charges/chargeOperationsHelpers';
import type { InterOAuthCredentials, InterOAuthFetchFn } from '../lib/banking/inter/interOAuthClient';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const CREDENTIALS: InterOAuthCredentials = {
  companyId: 'co-inter-release',
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
      if (table !== 'bank_charges') {
        throw new Error(`unexpected table ${table}`);
      }

      return {
        select(_cols: string) {
          const filters: Record<string, string> = {};
          const chain: any = {
            eq(col: string, val: string) {
              filters[col] = val;
              return chain;
            },
            maybeSingle: async () => {
              const row =
                state.charges.find((c) => {
                  if (filters.id && c.id !== filters.id) return false;
                  if (filters.company_id && c.company_id !== filters.company_id)
                    return false;
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
          const chain: any = {
            eq(col: string, val: string) {
              filters[col] = val;
              const done =
                filters.id != null && filters.company_id != null;
              if (!done) return chain;
              const idx = state.charges.findIndex((c) => c.id === filters.id);
              if (idx >= 0) {
                state.charges[idx] = {
                  ...state.charges[idx],
                  ...patch,
                } as BankChargeRow;
                state.updates.push({ id: filters.id, patch });
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
          return chain;
        },
      };
    },
  } as any;
}

function makeInterFetch(opts: {
  situacao?: string;
  cancelStatus?: number;
  cancelFail?: boolean;
}): {
  fetchFn: InterOAuthFetchFn;
  cancelPosts: string[];
} {
  const cancelPosts: string[] = [];
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
      return {
        status: 200,
        bodyText: JSON.stringify({
          codigoSolicitacao: 'SOL-110',
          situacao: opts.situacao || 'A_RECEBER',
          valorNominal: 110,
        }),
      };
    }
    if (init.method === 'POST' && u.includes('/cancelar')) {
      cancelPosts.push(u);
      if (opts.cancelFail) {
        return {
          status: opts.cancelStatus || 500,
          bodyText: JSON.stringify({
            title: 'Erro',
            detail: 'Falha simulada ao cancelar cobrança Inter',
          }),
        };
      }
      return {
        status: opts.cancelStatus || 202,
        bodyText: JSON.stringify({
          status: 'PROCESSANDO',
          mensagem: 'Cancelamento solicitado',
        }),
      };
    }
    return { status: 404, bodyText: '{}' };
  };
  return { fetchFn, cancelPosts };
}

/** Cenário real: entrada 100 paga + parcela 110 Inter + 9 sem cobrança. */
function testCanonicalReceiptPlan() {
  const receipts = [
    { id: 'r-entrada', status: 'pago', amount: 100, paid_at: '2026-08-01' },
    { id: 'r-1', status: 'pendente', amount: 110, paid_at: null },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `r-${i + 2}`,
      status: 'pendente',
      amount: 110,
      paid_at: null as string | null,
    })),
  ];

  const summary = summarizeReleaseReceipts(receipts);
  assert(summary.paidReceipts === 1, '1 entrada paga preservada');
  assert(summary.totalPaidAmount === 100, 'total pago R$100');
  assert(summary.unpaidToCancel === 10, '10 parcelas não pagas a cancelar localmente');
  assert(isPaidFinanceReceiptStatus(receipts[0]), 'entrada isPaid');
  assert(
    receipts.slice(1).every((r) => isActiveUnpaidFinanceReceipt(r)),
    '10 unpaid ativas',
  );

  const interOpen = [{ status: 'REGISTERED' }];
  const interSum = summarizeReleaseInterCharges(interOpen);
  assert(interSum.openInterCharges === 1, '1 cobrança Inter aberta');
  assert(isLocalInterCancelCandidateStatus('REGISTERED'), 'REGISTERED candidata');
  assert(classifyRemoteInterSituacaoForRelease('A_RECEBER') === 'cancel', 'A_RECEBER cancelável');
}

async function testCancelInterHappyPath() {
  const state = {
    charges: [
      {
        id: 'bc-110',
        status: 'REGISTERED',
        external_id: 'SOL-110',
        integration_id: 'int-1',
        financial_account_id: 'fa-1',
        provider: 'INTER',
        company_id: 'co-inter-release',
        metadata: { interSituacao: 'A_RECEBER' },
      },
    ] as BankChargeRow[],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };

  const { fetchFn, cancelPosts } = makeInterFetch({ situacao: 'A_RECEBER' });
  await cancelInterCobranca(CREDENTIALS, 'SOL-110', {
    fetchFn,
    motivoCancelamento: 'ACERTOS',
  });
  assert(cancelPosts.length === 1, 'POST /cancelar chamado 1x');
  assert(cancelPosts[0].includes('/cobrancas/SOL-110/cancelar'), 'endpoint cancelar correto');

  const admin = makeMockAdmin(state);
  const { fetchFn: fetch2, cancelPosts: posts2 } = makeInterFetch({
    situacao: 'A_RECEBER',
  });
  const result = await resolveInterChargesForRelease(
    admin,
    'co-inter-release',
    ['bc-110'],
    {
      executeCancel: true,
      motiveCode: 'distrato',
      fetchFn: fetch2,
      secretsLoader: fakeSecretsLoader as any,
    },
  );
  assert(result.failed.length === 0, 'sem falhas no cancel Inter');
  assert(result.cancelled === 1, '1 cobrança Inter cancelada');
  assert(result.preservedPaid === 0, 'não preservou paga indevidamente');
  assert(posts2.length === 1, 'cancel API chamada no resolve');
  assert(state.charges[0].status === 'CANCELLED', 'bank_charges local CANCELLED');
}

async function testPreservePaidInterNeverCancelled() {
  const state = {
    charges: [
      {
        id: 'bc-paid',
        status: 'REGISTERED',
        external_id: 'SOL-PAID',
        integration_id: 'int-1',
        financial_account_id: 'fa-1',
        provider: 'INTER',
        company_id: 'co-inter-release',
      },
    ] as BankChargeRow[],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const admin = makeMockAdmin(state);
  const { fetchFn, cancelPosts } = makeInterFetch({ situacao: 'RECEBIDO' });
  const result = await resolveInterChargesForRelease(
    admin,
    'co-inter-release',
    ['bc-paid'],
    {
      executeCancel: true,
      fetchFn,
      secretsLoader: fakeSecretsLoader as any,
    },
  );
  assert(result.preservedPaid === 1, 'RECEBIDO preservado');
  assert(result.cancelled === 0, 'não cancelou paga');
  assert(cancelPosts.length === 0, 'sem POST cancelar em paga');
}

async function testInterCancelApiFailureBlocksRelease() {
  const state = {
    charges: [
      {
        id: 'bc-fail',
        status: 'REGISTERED',
        external_id: 'SOL-FAIL',
        integration_id: 'int-1',
        financial_account_id: 'fa-1',
        provider: 'INTER',
        company_id: 'co-inter-release',
      },
    ] as BankChargeRow[],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const admin = makeMockAdmin(state);
  const { fetchFn } = makeInterFetch({ situacao: 'A_RECEBER', cancelFail: true });
  const result = await resolveInterChargesForRelease(
    admin,
    'co-inter-release',
    ['bc-fail'],
    {
      executeCancel: true,
      fetchFn,
      secretsLoader: fakeSecretsLoader as any,
    },
  );
  assert(result.failed.length === 1, '1 falha registrada');
  assert(result.failed[0].chargeId === 'bc-fail', 'identifica cobrança que falhou');
  assert(result.cancelled === 0, 'nenhuma cancelada');
  assert(state.charges[0].status === 'REGISTERED', 'status local NÃO marcado CANCELLED');

  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('INTER_CANCEL_FAILED'), 'código INTER_CANCEL_FAILED');
  assert(
    svc.includes('O lote NÃO foi liberado e o contrato NÃO foi cancelado'),
    'mensagem explícita sem liberação silenciosa',
  );
  assert(
    svc.indexOf('resolveInterChargesForRelease') < svc.indexOf('applyLocalRelease'),
    'Inter antes de applyLocalRelease',
  );
  assert(
    svc.indexOf("'cancel_inter'") < svc.indexOf('applyLocalRelease'),
    'stage cancel_inter antes do local',
  );
}

function testWiringSourceGuards() {
  const client = read('lib/banking/inter/interCobrancaClient.ts');
  assert(client.includes('cancelInterCobranca'), 'cliente exporta cancelInterCobranca');
  assert(client.includes('/cancelar'), 'usa endpoint /cancelar');
  assert(client.includes('motivoCancelamento'), 'envia motivoCancelamento');

  const cancelMod = read('lib/banking/inter/interChargeCancelForRelease.ts');
  assert(cancelMod.includes('resolveInterChargesForRelease'), 'resolve Inter release');
  assert(cancelMod.includes('fetchInterCobrancaByCodigo'), 'sync GET antes de cancelar');
  assert(cancelMod.includes('cancelInterCobranca'), 'cancela via API Inter');
  assert(cancelMod.includes('preserve_paid'), 'nunca cancela paga');

  const svc = read('lib/finance/releaseLotService.ts');
  assert(svc.includes('bank_charges'), 'release carrega/atualiza bank_charges');
  assert(svc.includes("'INTER'"), 'provider INTER');
  assert(svc.includes('resolveAsaasChargesForRelease'), 'Asaas intacto');
  assert(svc.includes('cancelCompanyCharge'), 'Asaas cancelCompanyCharge intacto');
  assert(svc.includes('ASAAS_CANCEL_FAILED'), 'Asaas fail code intacto');

  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  assert(modal.includes('Cobranças bancárias canceláveis'), 'modal agnóstico');
  assert(!modal.includes('Cobranças Asaas canceláveis'), 'sem label só Asaas');
}

async function testFullReleaseScenarioWithRealInterChargeShape() {
  // Espelha o contrato homolog: entrada paga + 1 Inter A_RECEBER + 1 sem cobrança.
  const receipts = [
    { id: 'r-entrada', status: 'pago', amount: 100, paid_at: '2026-08-01' },
    { id: 'r-1', status: 'pendente', amount: 110, paid_at: null },
    { id: 'r-2', status: 'pendente', amount: 110, paid_at: null },
  ];
  const afterRelease = receipts.map((r) =>
    isPaidFinanceReceiptStatus(r)
      ? r
      : { ...r, status: 'cancelado', paid_at: null },
  );

  assert(
    afterRelease.filter((r) => isOperationalFinanceReceiptForListing(r)).length === 1,
    'após cleanup, só entrada paga na listagem operacional',
  );
  assert(
    afterRelease.filter((r) => !isOperationalFinanceReceiptForListing(r)).length === 2,
    '2 não pagas saem da listagem operacional (status cancelado)',
  );

  const operationalCharges = filterChargeInstallments(
    afterRelease.map((r) => ({
      ...r,
      due_date: '2026-09-01',
      installment_number: r.id === 'r-entrada' ? 0 : 1,
    })),
    {
      search: '',
      statusFilter: 'Todas',
      projectFilter: 'Todos os projetos',
      financialAccountFilter: 'Todas as contas',
      startDate: '',
      endDate: '',
    },
  );
  assert(operationalCharges.length === 1, 'Cobranças/Todas: só parcela paga');
  assert(String(operationalCharges[0].id) === 'r-entrada', 'parcela preservada = entrada');

  const canceledActions = resolveChargeActionVisibility({
    charge: {
      id: 'bc-old',
      companyId: 'co',
      customerId: null,
      saleId: 's1',
      installmentId: 'r-1',
      asaasPaymentId: 'SOL-110',
      billingType: 'BOLETO',
      status: 'CANCELLED',
      value: 110,
      dueDate: '2026-09-01',
      invoiceUrl: null,
      bankSlipUrl: null,
      bankSlipIdentification: 'linha',
      pixQrCode: null,
      pixCopyPaste: 'pix',
      financialAccountId: null,
      paymentLink: null,
      paidAt: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    installmentPaid: false,
    integrationActive: true,
    companyAsaasEnabled: true,
    ownerReadOnly: false,
    installmentCanceled: true,
  });
  assert(!canceledActions.showGenerate, 'sem Gerar cobrança em parcela cancelada');
  assert(!canceledActions.showCopyPix, 'sem Copiar Pix em parcela cancelada');
  assert(!canceledActions.showCopyBarcodeLine, 'sem boleto em parcela cancelada');

  const state = {
    charges: [
      {
        id: 'bc-110',
        status: 'REGISTERED',
        external_id: 'SOL-REAL-110',
        integration_id: 'int-1',
        financial_account_id: 'fa-1',
        provider: 'INTER',
        company_id: 'co-inter-release',
        metadata: { interSituacao: 'A_RECEBER', codigoSolicitacao: 'SOL-REAL-110' },
      },
    ] as BankChargeRow[],
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };
  const admin = makeMockAdmin(state);
  const { fetchFn, cancelPosts } = makeInterFetch({ situacao: 'A_RECEBER' });
  const result = await resolveInterChargesForRelease(
    admin,
    'co-inter-release',
    ['bc-110'],
    {
      executeCancel: true,
      motiveCode: 'desistencia',
      fetchFn,
      secretsLoader: fakeSecretsLoader as any,
    },
  );
  assert(result.cancelled === 1, 'cobrança Inter A_RECEBER cancelada');
  assert(cancelPosts.length === 1, 'POST /cancelar exercitado (não 0 canceláveis)');
  assert(
    cancelPosts[0].includes('/cobrancas/SOL-REAL-110/cancelar'),
    'usa codigoSolicitacao=external_id',
  );
  assert(state.charges[0].status === 'CANCELLED', 'bank_charges deixa de ativo');
}

function testZeroCancelableWhenNoBankCharges() {
  const interSum = summarizeReleaseInterCharges([]);
  assert(interSum.openInterCharges === 0, 'sem bank_charges → 0 canceláveis Inter');
  assert(
    !isLocalInterCancelCandidateStatus('CANCELLED'),
    'CANCELLED local não é candidata',
  );
  // Explica o modal do contrato 000000007/2026: parcelas futuras sem emissão Inter.
  assert(
    summarizeReleaseInterCharges([{ status: 'CANCELLED' }]).openInterCharges === 0,
    'só CANCELLED → 0 open',
  );
}

async function testCancelHttpErrorShape() {
  const { fetchFn } = makeInterFetch({ cancelFail: true, cancelStatus: 422 });
  let caught: unknown = null;
  try {
    await cancelInterCobranca(CREDENTIALS, 'SOL-X', { fetchFn });
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof InterCobrancaHttpError, 'InterCobrancaHttpError');
  assert((caught as InterCobrancaHttpError).status === 422, 'status 422');
}

async function main() {
  testCanonicalReceiptPlan();
  testWiringSourceGuards();
  testZeroCancelableWhenNoBankCharges();
  await testCancelHttpErrorShape();
  await testCancelInterHappyPath();
  await testPreservePaidInterNeverCancelled();
  await testInterCancelApiFailureBlocksRelease();
  await testFullReleaseScenarioWithRealInterChargeShape();
  console.log('\nALL mandatory-release-lot-inter-tests PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

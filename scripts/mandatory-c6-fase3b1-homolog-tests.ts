/**
 * C6 Bank Fase 3B.1 — alinhamento oficial B_01–B_08 + executor B_01 (sem C6 real).
 * npm run test:c6-fase3b1
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import {
  C6_BOLETO_HOMOLOG_CASES,
  C6_HOMOLOG_ROTEIRO_FILE,
  C6_HOMOLOG_ROTEIRO_REQUESTED_FILE,
} from '../lib/banking/c6/c6BoletoHomologCatalog';
import {
  C6_B01_CONFIRMATION_PHRASE,
  C6HomologAuthorizationError,
  authorizeC6HomologB01,
  captureC6HomologB01Blocked,
  executeC6HomologB01Simulated,
} from '../lib/banking/c6/c6BoletoHomologB01';
import {
  assertC6HomologRefAvailable,
  c6HomologIdempotencyKey,
  mergeC6HomologIdempotencyMetadata,
  parseC6HomologIdempotency,
} from '../lib/banking/c6/c6BoletoIdempotency';
import { parseC6OAuthBodyFields } from '../lib/banking/c6/c6At01Evidence';
import { C6_EMIT_NOT_HOMOLOGATED_MESSAGE } from '../lib/banking/c6/c6EmitGuard';
import { C6BoletoValidationError } from '../lib/banking/c6/c6BoletoValidation';
import { C6BoletoTransportError, executeC6BankSlipCreate } from '../lib/banking/c6/c6BoletoClient';
import type { C6AuthCredentials } from '../lib/banking/c6/c6AuthClient';
import type { C6BoletoCreateInput } from '../lib/banking/c6/c6BoletoTypes';
import { assertC6BoletoEvidencePublicSafe } from '../lib/banking/c6/c6BoletoEvidence';

const root = process.cwd();
const now = new Date('2026-10-26T15:00:00-03:00');
const TOKEN = 'c6-test-access-token-bbb';

const creds: C6AuthCredentials = {
  companyId: 'company-homolog',
  integrationId: 'int-h',
  environment: 'SANDBOX',
  clientId: 'c6-client-id',
  clientSecret: 'c6-client-secret',
  certificatePem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
};

function payload(ref = 'B01A000001'): C6BoletoCreateInput {
  return {
    companyId: creds.companyId,
    environment: 'SANDBOX',
    external_reference_id: ref,
    amount: 123.45,
    due_date: '2026-11-15',
    payer: {
      name: 'José da Silva',
      tax_id: '11144477735',
      address: {
        street: 'Av. Nove de Julho',
        number: 123,
        city: 'Rio de Janeiro',
        state: 'RJ',
        zip_code: '05093000',
      },
    },
  };
}

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testOfficialCatalog() {
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_01.title, 'Emissão de boleto simples');
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_02.title, 'Emissão de boleto com juros e multa variáveis');
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_03.title, 'Emissão de boleto com desconto');
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_04.title, 'Alteração de dados do boleto');
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_05.title, 'Consulta de boleto');
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_06.title, 'Geração do PDF do boleto');
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_07.title, 'Cadastro do webhook de boleto');
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_08.title, 'Baixa/cancelamento de boleto emitido');
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_01.roteiroExpectedStatus, 201);
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_08.roteiroExpectedStatus, 200);
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_08.openapiExpectedStatus, 204);
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_07.openapiExpectedStatus, null);
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_07.operation, 'webhook');
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_01.returnedStatus, null);
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_01.returnedBody, null);
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_01.readyToExecute, false);
  console.log('OK testOfficialCatalog');
}

function testRoteiroAndMatrixPresent() {
  assert.equal(fs.existsSync(path.join(root, C6_HOMOLOG_ROTEIRO_FILE)), true);
  assert.equal(C6_HOMOLOG_ROTEIRO_REQUESTED_FILE.includes('(4)'), true);
  const matrix = read('docs/c6/matriz-homologacao-boleto-b01-b08.md');
  assert.match(matrix, /B_01/);
  assert.match(matrix, /B_07/);
  assert.match(matrix, /B_08/);
  assert.match(matrix, /Status retornado/);
  assert.doesNotMatch(matrix, /Status retornado: 20/);
  assert.match(matrix, /não encontrado/);
  console.log('OK testRoteiroAndMatrixPresent');
}

function testOauthExpires600() {
  const parsed = parseC6OAuthBodyFields({ expires_in: 600 });
  assert.equal(parsed.expiresIn, 600);
  assert.equal(parsed.expiresInForCache, 600);
  assert.equal(parsed.expiresInReturned, true);
  console.log('OK testOauthExpires600');
}

function testB01ExecutorGuards() {
  assert.throws(
    () =>
      authorizeC6HomologB01({
        role: 'ADMIN',
        confirmation: C6_B01_CONFIRMATION_PHRASE,
        credentials: creds,
        payload: payload(),
        now,
      }),
    C6HomologAuthorizationError,
  );
  assert.throws(
    () =>
      authorizeC6HomologB01({
        role: 'SUPER_ADMIN',
        confirmation: 'sim',
        credentials: creds,
        payload: payload(),
        now,
      }),
    C6HomologAuthorizationError,
  );
  assert.throws(
    () =>
      authorizeC6HomologB01({
        role: 'SUPER_ADMIN',
        confirmation: C6_B01_CONFIRMATION_PHRASE,
        credentials: { ...creds, environment: 'PRODUCTION' },
        payload: { ...payload(), environment: 'PRODUCTION' },
        now,
      }),
    (err: unknown) =>
      err instanceof Error && /Sandbox|homologada/i.test(err.message),
  );
  assert.throws(
    () =>
      authorizeC6HomologB01({
        role: 'SUPER_ADMIN',
        confirmation: C6_B01_CONFIRMATION_PHRASE,
        credentials: creds,
        payload: {
          ...payload(),
          interest: { type: 'V', value: 1, dead_line: 0 },
        },
        now,
      }),
    C6BoletoValidationError,
  );
  const prepared = authorizeC6HomologB01({
    role: 'SUPER_ADMIN',
    confirmation: C6_B01_CONFIRMATION_PHRASE,
    credentials: creds,
    payload: payload('B01A000002'),
    now,
  });
  assert.equal(prepared.jsonBody?.billing_scheme, '21');
  assert.equal(prepared.environment, 'SANDBOX');
  authorizeC6HomologB01({
    role: 'SUPER_ADMIN',
    confirmation: C6_B01_CONFIRMATION_PHRASE,
    credentials: creds,
    payload: payload('B01A000002'),
    now,
  });
  assert.throws(
    () =>
      authorizeC6HomologB01({
        role: 'SUPER_ADMIN',
        confirmation: C6_B01_CONFIRMATION_PHRASE,
        credentials: creds,
        sessionCompanyId: 'other-company',
        payload: payload('B01A000009'),
        now,
      }),
    C6HomologAuthorizationError,
  );
  console.log('OK testB01ExecutorGuards');
}

function testPersistentIdempotency() {
  const integrationId = 'int-h';
  const ref = 'B01A000088';
  const key = c6HomologIdempotencyKey(creds.companyId, integrationId, ref);
  const merged = mergeC6HomologIdempotencyMetadata(
    { keep: true },
    {
      status: 'emitted',
      companyId: creds.companyId,
      integrationId,
      externalReferenceId: ref,
      at: '2026-10-26T18:00:00.000Z',
      httpStatus: 201,
    },
  );
  const index = parseC6HomologIdempotency(merged);
  assert.equal(merged.keep, true);
  assert.equal(index[key].status, 'emitted');
  assert.throws(
    () => assertC6HomologRefAvailable(index, creds.companyId, integrationId, ref),
    C6BoletoValidationError,
  );
  assert.throws(
    () =>
      authorizeC6HomologB01({
        role: 'SUPER_ADMIN',
        confirmation: C6_B01_CONFIRMATION_PHRASE,
        credentials: creds,
        payload: payload(ref),
        integrationId,
        persistedIdempotency: index,
        now,
      }),
    C6BoletoValidationError,
  );
  assert.doesNotThrow(() =>
    authorizeC6HomologB01({
      role: 'SUPER_ADMIN',
      confirmation: C6_B01_CONFIRMATION_PHRASE,
      credentials: creds,
      payload: payload('B01A000089'),
      integrationId,
      persistedIdempotency: index,
      now,
    }),
  );
  console.log('OK testPersistentIdempotency');
}

function testB01BlockedEvidence() {
  const { evidence } = captureC6HomologB01Blocked({
    role: 'SUPER_ADMIN',
    confirmation: C6_B01_CONFIRMATION_PHRASE,
    credentials: creds,
    payload: payload('B01A000003'),
    now,
  });
  assert.equal(evidence.testCase, 'B_01');
  assert.equal(evidence.blocked, true);
  assert.equal(evidence.executed, false);
  assert.equal(evidence.httpStatus, null);
  assert.equal(evidence.roteiroExpectedStatus, 201);
  assert.equal(evidence.openapiExpectedStatus, 201);
  assert.match(evidence.message, new RegExp(C6_EMIT_NOT_HOMOLOGATED_MESSAGE));
  assertC6BoletoEvidencePublicSafe(evidence);
  console.log('OK testB01BlockedEvidence');
}

async function testB01SimulatedOnly() {
  const result = await executeC6HomologB01Simulated(
    {
      role: 'SUPER_ADMIN',
      confirmation: C6_B01_CONFIRMATION_PHRASE,
      credentials: creds,
      payload: payload('B01A000004'),
      now,
    },
    {
      accessToken: TOKEN,
      fetchFn: async (url, init) => {
        assert.match(url, /\/v1\/bank_slips\/$/);
        assert.equal(init.method, 'POST');
        assert.equal(init.agent instanceof https.Agent, true);
        const body = JSON.parse(String(init.body || '{}')) as Record<string, unknown>;
        assert.equal(body.billing_scheme, '21');
        assert.equal(Object.prototype.hasOwnProperty.call(body, 'interest'), false);
        return {
          status: 201,
          bodyText: JSON.stringify({
            id: '01J3NCKY6Q99QC4D7T733D35QD',
            amount: 123.45,
            due_date: '2026-11-15',
            billing_scheme: '21',
          }),
        };
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.evidence.testCase, 'B_01');
  assert.equal(result.httpStatus, 201);
  const json = JSON.stringify(result.evidence);
  assert.equal(json.includes(TOKEN), false);
  assert.equal(json.includes('11144477735'), false);
  console.log('OK testB01SimulatedOnly');
}

async function testTimeoutInternalCase() {
  const result = await executeC6BankSlipCreate(creds, payload('B01A000005'), {
    now,
    accessToken: TOKEN,
    allowSimulatedHttp: true,
    fetchFn: async () => {
      throw new C6BoletoTransportError('TIMEOUT', 'Timeout ao contatar o C6 Bank (boleto).');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.evidence.testCase, 'INT_TIMEOUT');
  console.log('OK testTimeoutInternalCase');
}

function testWebhookGapAndNoSalesWiring() {
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_07.readyToExecute, false);
  assert.match(C6_BOLETO_HOMOLOG_CASES.B_07.notes.join(' '), /notificações/);
  const sale = read('components/sales/SaleChargesPanel.tsx');
  const central = read('components/charges/ChargesPageClient.tsx');
  assert.doesNotMatch(sale, /homolog\/b01/);
  assert.doesNotMatch(central, /homolog\/b01/);
  const route = read('app/api/banking/c6/homolog/b01/route.ts');
  assert.match(route, /isPlatformAdmin/);
  assert.match(route, /captureC6HomologB01Blocked/);
  assert.match(route, /loadC6HomologIdempotency/);
  assert.match(route, /assertC6HomologB01SandboxOnly/);
  assert.doesNotMatch(route, /executeC6BankSlipCreate/);
  assert.doesNotMatch(route, /executeC6HomologB01Simulated/);
  assert.doesNotMatch(route, /reserveC6HomologIdempotency/);
  assert.match(route, /hasClientLiveOverride/);
  assert.match(route, /Parâmetros de emissão ao vivo não são aceitos/);
  assert.match(route, /status: 409/);
  console.log('OK testWebhookGapAndNoSalesWiring');
}

async function main() {
  testOfficialCatalog();
  testRoteiroAndMatrixPresent();
  testOauthExpires600();
  testB01ExecutorGuards();
  testPersistentIdempotency();
  testB01BlockedEvidence();
  await testB01SimulatedOnly();
  await testTimeoutInternalCase();
  testWebhookGapAndNoSalesWiring();
  console.log('ALL mandatory-c6-fase3b1-homolog-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

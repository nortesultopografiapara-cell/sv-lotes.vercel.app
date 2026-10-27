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
  C6_B02_CONFIRMATION_PHRASE,
  authorizeC6HomologB02,
  requestC6HomologB02EmitAccessToken,
} from '../lib/banking/c6/c6BoletoHomologB02';
import {
  C6_B03_CONFIRMATION_PHRASE,
  authorizeC6HomologB03,
} from '../lib/banking/c6/c6BoletoHomologB03';
import {
  C6_B04_ALTER_CONFIRMATION_PHRASE,
  C6_B04_ALTER_REF,
  C6_B04_SOURCE_CONFIRMATION_PHRASE,
  C6_B04_SOURCE_REF,
  authorizeC6HomologB04Alter,
  authorizeC6HomologB04Source,
  buildC6HomologB04AlterPatch,
  buildC6HomologB04SourcePayload,
} from '../lib/banking/c6/c6BoletoHomologB04';
import {
  C6_B05_AUTHORIZED_BANK_SLIP_ID,
  C6_B05_CONFIRMATION_PHRASE,
  C6_B05_IDEMPOTENCY_REF,
  authorizeC6HomologB05,
  requestC6HomologReadAccessToken,
} from '../lib/banking/c6/c6BoletoHomologB05';
import {
  C6_B06_AUTHORIZED_BANK_SLIP_ID,
  C6_B06_CONFIRMATION_PHRASE,
  C6_B06_FIRST_ATTEMPT_REF,
  C6_B06_IDEMPOTENCY_REF,
  C6_B06_SECOND_ATTEMPT_REF,
  authorizeC6HomologB06,
  executeC6HomologB06WithIdempotency,
} from '../lib/banking/c6/c6BoletoHomologB06';
import {
  C6_B07_CONFIRMATION_PHRASE,
  C6_B07_IDEMPOTENCY_REF,
  authorizeC6HomologB07,
} from '../lib/banking/c6/c6BoletoHomologB07';
import { C6_WEBHOOK_FINANCE_MUTATION } from '../lib/banking/c6/c6WebhookReceiver';
import { C6_WEBHOOKS_URL } from '../lib/banking/c6/c6WebhookEndpoints';
import { C6_NOTIFICATIONS_SERVICE } from '../lib/banking/c6/c6NotificationsOpenApi';
import { prepareC6WebhookRegister } from '../lib/banking/c6/c6BoletoClient';
import {
  C6_HOMOLOG_B01_BANK_SLIP_ID,
  C6_HOMOLOG_B02_BANK_SLIP_ID,
  C6_HOMOLOG_B03_BANK_SLIP_ID,
  isC6HomologProtectedBankSlipId,
} from '../lib/banking/c6/c6BoletoHomologIssuedIds';
import { C6_BANK_SLIPS_URL, buildC6BankSlipPdfUrl } from '../lib/banking/c6/c6BoletoEndpoints';
import {
  mapC6AuthHttpError,
  type C6AuthCredentials,
  type C6AuthFetchFn,
} from '../lib/banking/c6/c6AuthClient';
import {
  clearAllC6TokenCacheForTests,
  setCachedC6Token,
} from '../lib/banking/c6/c6TokenCache';
import {
  assertC6BankSlipReadScope,
  assertC6BankSlipWriteScope,
  C6BoletoScopeError,
} from '../lib/banking/c6/c6BoletoOpenApi';
import {
  assertC6HomologRefAvailable,
  c6HomologIdempotencyKey,
  mergeC6HomologIdempotencyMetadata,
  parseC6HomologIdempotency,
} from '../lib/banking/c6/c6BoletoIdempotency';
import { parseC6OAuthBodyFields } from '../lib/banking/c6/c6At01Evidence';
import { C6_EMIT_NOT_HOMOLOGATED_MESSAGE } from '../lib/banking/c6/c6EmitGuard';
import { C6BoletoValidationError, buildC6BankSlipCreateBody } from '../lib/banking/c6/c6BoletoValidation';
import { C6BoletoTransportError, executeC6BankSlipCreate } from '../lib/banking/c6/c6BoletoClient';
import type { C6BoletoCreateInput } from '../lib/banking/c6/c6BoletoTypes';
import {
  assertC6BoletoEvidencePublicSafe,
  collectC6HomologWordEvidence,
} from '../lib/banking/c6/c6BoletoEvidence';
import {
  C6_B01_SANDBOX_COMPANY_ID,
  C6_B01_SANDBOX_INTEGRATION_ID,
  C6_B01_SANDBOX_PREPARED_REF,
  buildC6HomologB01SandboxPayload,
} from './develop/c6-homolog-b01-sandbox-ready';
import {
  C6_B02_SANDBOX_PREPARED_REF,
  buildC6HomologB02SandboxPayload,
} from './develop/c6-homolog-b02-sandbox-ready';
import {
  C6_B03_SANDBOX_PREPARED_REF,
  buildC6HomologB03SandboxPayload,
} from './develop/c6-homolog-b03-sandbox-ready';
import { C6_BOLETO_EXTERNAL_REFERENCE_PATTERN } from '../lib/banking/c6/c6BoletoOpenApi';
import {
  C6HomologIdempotencyError,
  createMemoryC6HomologIdempotencyStore,
} from '../lib/banking/c6/c6HomologIdempotency';

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
  const word = collectC6HomologWordEvidence(evidence);
  assert.equal(word.testCase, 'B_01');
  assert.equal(word.httpStatus, null);
  assert.equal(word.responseBody, null);
  assert.equal(word.roteiroExpectedStatus, 201);
  assert.equal(word.executed, false);
  assert.equal(word.blocked, true);
  assert.equal(word.wordColumnsReady, false);
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
  assert.match(C6_BOLETO_HOMOLOG_CASES.B_07.notes.join(' '), /financeMutation=false/);
  assert.match(C6_BOLETO_HOMOLOG_CASES.B_07.notes.join(' '), /B07S261027/);
  assert.equal(C6_WEBHOOK_FINANCE_MUTATION, false);
  const sale = read('components/sales/SaleChargesPanel.tsx');
  const central = read('components/charges/ChargesPageClient.tsx');
  assert.doesNotMatch(sale, /homolog\/b01/);
  assert.doesNotMatch(central, /homolog\/b01/);
  assert.doesNotMatch(sale, /homolog\/b02/);
  assert.doesNotMatch(central, /homolog\/b02/);
  assert.doesNotMatch(sale, /homolog\/b03/);
  assert.doesNotMatch(central, /homolog\/b03/);
  assert.doesNotMatch(sale, /homolog\/b04/);
  assert.doesNotMatch(central, /homolog\/b04/);
  assert.doesNotMatch(sale, /homolog\/b05/);
  assert.doesNotMatch(central, /homolog\/b05/);
  assert.doesNotMatch(sale, /homolog\/b06/);
  assert.doesNotMatch(central, /homolog\/b06/);
  assert.doesNotMatch(sale, /homolog\/b07/);
  assert.doesNotMatch(central, /homolog\/b07/);
  const middleware = read('middleware.ts');
  assert.match(middleware, /isC6HomologApi/);
  assert.match(middleware, /\/api\/banking\/c6\/homolog/);
  assert.match(middleware, /\/api\/banking\/c6\/webhooks/);
  assert.doesNotMatch(
    middleware.slice(middleware.indexOf('const publicRoutes'), middleware.indexOf('const isCompanyExportApi')),
    /homolog/,
  );
  const route = read('app/api/banking/c6/homolog/b01/route.ts');
  assert.match(route, /isPlatformAdmin/);
  assert.match(route, /captureC6HomologB01Blocked/);
  assert.match(route, /loadC6HomologIdempotency/);
  assert.match(route, /loadC6HomologAtomicRow/);
  assert.match(route, /assertC6HomologB01SandboxOnly/);
  assert.match(route, /executeC6HomologB01WithIdempotency/);
  assert.match(route, /createSupabaseC6HomologIdempotencyAdapter/);
  assert.match(route, /persistReservation: true/);
  assert.match(route, /collectC6HomologWordEvidence/);
  assert.doesNotMatch(route, /executeC6BankSlipCreate/);
  assert.doesNotMatch(route, /executeC6HomologB01Simulated/);
  assert.doesNotMatch(route, /fetchFn:/);
  assert.doesNotMatch(route, /accessToken:/);
  assert.doesNotMatch(route, /C6_BOLETO_SANDBOX_LIVE_ENABLED/);
  assert.doesNotMatch(route, /reserveC6HomologIdempotency/);
  assert.doesNotMatch(route, /reserve_c6_homolog_idempotency/);
  assert.match(route, /hasClientLiveOverride/);
  assert.match(route, /Parâmetros de emissão ao vivo não são aceitos/);
  assert.match(route, /status: 409/);
  assert.match(route, /export async function GET/);
  assert.match(route, /getBankingEncryptionKeyDiagnostics/);
  assert.match(route, /assertNotProductionRuntime/);
  assert.match(route, /encryptionKeyConfigured/);
  assert.doesNotMatch(route, /BANKING_CREDENTIALS_ENCRYPTION_KEY/);
  const routeB02 = read('app/api/banking/c6/homolog/b02/route.ts');
  assert.match(routeB02, /export async function GET/);
  assert.match(routeB02, /executeC6HomologB02WithIdempotency/);
  assert.match(routeB02, /EMITIR_B02_SANDBOX/);
  assert.match(routeB02, /B02S261027/);
  assert.match(routeB02, /C6_B01_FORBIDDEN_REF/);
  assert.match(routeB02, /não reutiliza B_01/);
  assert.match(routeB02, /requestC6HomologB02EmitAccessToken/);
  assert.equal((routeB02.match(/bypassCache: true/g) || []).length, 1);
  assert.doesNotMatch(routeB02, /fetchFn:/);
  assert.doesNotMatch(routeB02, /accessToken:/);
  assert.doesNotMatch(routeB02, /C6_BOLETO_SANDBOX_LIVE_ENABLED/);
  assert.doesNotMatch(routeB02, /BANKING_CREDENTIALS_ENCRYPTION_KEY/);
  const routeB03 = read('app/api/banking/c6/homolog/b03/route.ts');
  assert.match(routeB03, /export async function GET/);
  assert.match(routeB03, /executeC6HomologB03WithIdempotency/);
  assert.match(routeB03, /EMITIR_B03_SANDBOX/);
  assert.match(routeB03, /B03S261027/);
  assert.match(routeB03, /C6_B01_FORBIDDEN_REF/);
  assert.match(routeB03, /C6_B02_FORBIDDEN_REF/);
  assert.match(routeB03, /não reutiliza B_01\/B_02/);
  assert.match(routeB03, /requestC6HomologB02EmitAccessToken/);
  assert.equal((routeB03.match(/bypassCache: true/g) || []).length, 1);
  assert.doesNotMatch(routeB03, /fetchFn:/);
  assert.doesNotMatch(routeB03, /accessToken:/);
  assert.doesNotMatch(routeB03, /C6_BOLETO_SANDBOX_LIVE_ENABLED/);
  assert.doesNotMatch(routeB03, /BANKING_CREDENTIALS_ENCRYPTION_KEY/);
  const routeB04 = read('app/api/banking/c6/homolog/b04/route.ts');
  assert.match(routeB04, /export async function GET/);
  assert.match(routeB04, /export async function POST/);
  assert.match(routeB04, /export async function PUT/);
  assert.match(routeB04, /executeC6HomologB04SourceWithIdempotency/);
  assert.match(routeB04, /executeC6HomologB04AlterWithIdempotency/);
  assert.match(routeB04, /EMITIR_B04_ORIGEM_SANDBOX/);
  assert.match(routeB04, /ALTERAR_B04_SANDBOX/);
  assert.match(routeB04, /B04S261027/);
  assert.match(routeB04, /C6_B01_FORBIDDEN_REF/);
  assert.match(routeB04, /C6_B02_FORBIDDEN_REF/);
  assert.match(routeB04, /C6_B03_FORBIDDEN_REF/);
  assert.match(routeB04, /não reutiliza B_01\/B_02\/B_03/);
  assert.match(routeB04, /requestC6HomologB02EmitAccessToken/);
  assert.equal((routeB04.match(/bypassCache: true/g) || []).length, 1);
  assert.doesNotMatch(routeB04, /fetchFn:/);
  assert.doesNotMatch(routeB04, /accessToken:/);
  assert.doesNotMatch(routeB04, /C6_BOLETO_SANDBOX_LIVE_ENABLED/);
  assert.doesNotMatch(routeB04, /BANKING_CREDENTIALS_ENCRYPTION_KEY/);
  const routeB05 = read('app/api/banking/c6/homolog/b05/route.ts');
  assert.match(routeB05, /export async function GET/);
  assert.match(routeB05, /executeC6HomologB05WithIdempotency/);
  assert.match(routeB05, /CONSULTAR_B05_SANDBOX/);
  assert.match(routeB05, /C6_B05_AUTHORIZED_BANK_SLIP_ID/);
  assert.match(read('lib/banking/c6/c6BoletoHomologIssuedIds.ts'), /01M5YPX04ZB8H14XAPJDA8MRV8/);
  assert.match(routeB05, /requestC6HomologReadAccessToken/);
  assert.match(routeB05, /assertC6BankSlipReadScope/);
  assert.equal((routeB05.match(/bypassCache: true/g) || []).length, 1);
  assert.doesNotMatch(routeB05, /fetchFn:/);
  assert.doesNotMatch(routeB05, /accessToken:/);
  assert.doesNotMatch(routeB05, /C6_BOLETO_SANDBOX_LIVE_ENABLED/);
  const routeB06 = read('app/api/banking/c6/homolog/b06/route.ts');
  assert.match(routeB06, /export async function GET/);
  assert.match(routeB06, /executeC6HomologB06WithIdempotency/);
  assert.match(routeB06, /CONSULTAR_B06_TERCEIRA_TENTATIVA_SANDBOX/);
  assert.match(routeB06, /C6_B06_AUTHORIZED_BANK_SLIP_ID/);
  assert.match(routeB06, /C6_B06_FIRST_ATTEMPT_REF/);
  assert.match(routeB06, /C6_B06_SECOND_ATTEMPT_REF/);
  assert.match(routeB06, /B06T261027|C6_B06_IDEMPOTENCY_REF/);
  assert.match(routeB06, /C6_BOLETO_PDF_ACCEPT/);
  assert.doesNotMatch(routeB06, /accept: 'application\/pdf'/);
  assert.match(routeB06, /requestC6HomologReadAccessToken/);
  assert.match(routeB06, /assertC6BankSlipReadScope/);
  assert.equal((routeB06.match(/bypassCache: true/g) || []).length, 1);
  assert.doesNotMatch(routeB06, /fetchFn:/);
  assert.doesNotMatch(routeB06, /accessToken:/);
  assert.doesNotMatch(routeB06, /C6_BOLETO_SANDBOX_LIVE_ENABLED/);
  const routeB07 = read('app/api/banking/c6/homolog/b07/route.ts');
  assert.match(routeB07, /export async function GET/);
  assert.match(routeB07, /executeC6HomologB07WithIdempotency/);
  assert.match(routeB07, /CADASTRAR_B07_WEBHOOK_SANDBOX/);
  assert.match(routeB07, /B07S261027/);
  assert.match(routeB07, /financeMutation/);
  assert.match(routeB07, /buildC6WebhookRegisterUrl/);
  assert.doesNotMatch(routeB07, /executeC6BankSlipCreate/);
  assert.doesNotMatch(routeB07, /fetchFn:/);
  assert.doesNotMatch(routeB07, /accessToken:/);
  assert.doesNotMatch(routeB07, /C6_BOLETO_SANDBOX_LIVE_ENABLED/);
  assert.doesNotMatch(routeB07, /BANKING_CREDENTIALS_ENCRYPTION_KEY/);
  const receiver = read('app/api/banking/c6/webhooks/[integrationId]/route.ts');
  assert.match(receiver, /financeMutation/);
  assert.doesNotMatch(receiver, /finance_receipts/);
  assert.doesNotMatch(receiver, /cash_movements/);
  assert.doesNotMatch(receiver, /broker_commissions/);
  assert.doesNotMatch(receiver, /processInterWebhookCallbackItem/);
  console.log('OK testWebhookGapAndNoSalesWiring');
}

function testPreparedB01SandboxPayload() {
  assert.equal(C6_BOLETO_EXTERNAL_REFERENCE_PATTERN.test(C6_B01_SANDBOX_PREPARED_REF), true);
  assert.equal(C6_B01_SANDBOX_PREPARED_REF, 'B01S261027');
  const prepared = buildC6HomologB01SandboxPayload(C6_B01_SANDBOX_COMPANY_ID);
  assert.equal(prepared.companyId, C6_B01_SANDBOX_COMPANY_ID);
  assert.equal(prepared.environment, 'SANDBOX');
  assert.equal(prepared.billing_scheme, '21');
  assert.equal(prepared.amount, 123.45);
  assert.equal(prepared.due_date, '2026-11-15');
  assert.equal(prepared.external_reference_id, C6_B01_SANDBOX_PREPARED_REF);
  const { evidence } = captureC6HomologB01Blocked({
    role: 'SUPER_ADMIN',
    confirmation: C6_B01_CONFIRMATION_PHRASE,
    credentials: {
      companyId: C6_B01_SANDBOX_COMPANY_ID,
      integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
      environment: 'SANDBOX',
      clientId: 'blocked',
      clientSecret: 'blocked',
      certificatePem: 'blocked',
      privateKeyPem: 'blocked',
    },
    payload: prepared,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
    now,
  });
  assert.equal(evidence.blocked, true);
  assert.equal(evidence.executed, false);
  assert.equal(evidence.httpStatus, null);
  assert.equal(collectC6HomologWordEvidence(evidence).wordColumnsReady, false);
  console.log('OK testPreparedB01SandboxPayload');
}

function testPreparedB02SandboxPayload() {
  assert.equal(C6_BOLETO_EXTERNAL_REFERENCE_PATTERN.test(C6_B02_SANDBOX_PREPARED_REF), true);
  assert.equal(C6_B02_SANDBOX_PREPARED_REF, 'B02S261027');
  assert.notEqual(C6_B02_SANDBOX_PREPARED_REF, C6_B01_SANDBOX_PREPARED_REF);
  const prepared = buildC6HomologB02SandboxPayload(C6_B01_SANDBOX_COMPANY_ID);
  const body = buildC6BankSlipCreateBody(prepared, now);
  assert.equal(body.external_reference_id, 'B02S261027');
  assert.equal(body.amount, 234.56);
  assert.equal(body.due_date, '2026-11-20');
  assert.equal(body.billing_scheme, '21');
  assert.deepEqual(body.interest, { type: 'V', value: 2, dead_line: 0 });
  assert.deepEqual(body.fine, { type: 'V', value: 10, dead_line: 0 });
  assert.throws(
    () =>
      authorizeC6HomologB01({
        role: 'SUPER_ADMIN',
        confirmation: C6_B01_CONFIRMATION_PHRASE,
        credentials: {
          companyId: C6_B01_SANDBOX_COMPANY_ID,
          integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
          environment: 'SANDBOX',
          clientId: 'blocked',
          clientSecret: 'blocked',
          certificatePem: 'blocked',
          privateKeyPem: 'blocked',
        },
        payload: prepared,
        integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
        sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
        now,
      }),
    C6BoletoValidationError,
  );
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_02.readyToExecute, false);
  const authorized = authorizeC6HomologB02({
    role: 'SUPER_ADMIN',
    confirmation: C6_B02_CONFIRMATION_PHRASE,
    credentials: {
      companyId: C6_B01_SANDBOX_COMPANY_ID,
      integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
      environment: 'SANDBOX',
      clientId: 'blocked',
      clientSecret: 'blocked',
      certificatePem: 'blocked',
      privateKeyPem: 'blocked',
    },
    payload: prepared,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
    now,
  });
  assert.equal(authorized.jsonBody?.interest?.type, 'V');
  assert.equal(authorized.jsonBody?.fine?.type, 'V');
  assert.throws(
    () =>
      authorizeC6HomologB02({
        role: 'SUPER_ADMIN',
        confirmation: C6_B02_CONFIRMATION_PHRASE,
        credentials: {
          companyId: C6_B01_SANDBOX_COMPANY_ID,
          integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
          environment: 'SANDBOX',
          clientId: 'blocked',
          clientSecret: 'blocked',
          certificatePem: 'blocked',
          privateKeyPem: 'blocked',
        },
        payload: { ...prepared, external_reference_id: C6_B01_SANDBOX_PREPARED_REF },
        integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
        sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
        now,
      }),
    C6BoletoValidationError,
  );
  console.log('OK testPreparedB02SandboxPayload');
}

function testPreparedB03SandboxPayload() {
  assert.equal(C6_BOLETO_EXTERNAL_REFERENCE_PATTERN.test(C6_B03_SANDBOX_PREPARED_REF), true);
  assert.equal(C6_B03_SANDBOX_PREPARED_REF, 'B03S261027');
  assert.notEqual(C6_B03_SANDBOX_PREPARED_REF, C6_B01_SANDBOX_PREPARED_REF);
  assert.notEqual(C6_B03_SANDBOX_PREPARED_REF, C6_B02_SANDBOX_PREPARED_REF);
  const prepared = buildC6HomologB03SandboxPayload(C6_B01_SANDBOX_COMPANY_ID);
  const body = buildC6BankSlipCreateBody(prepared, now);
  assert.equal(body.external_reference_id, 'B03S261027');
  assert.equal(body.amount, 300);
  assert.equal(body.due_date, '2026-11-25');
  assert.equal(body.billing_scheme, '21');
  assert.deepEqual(body.discount, {
    discount_type: 'V',
    first: { value: 15, dead_line: 5 },
  });
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_03.readyToExecute, false);
  const authorized = authorizeC6HomologB03({
    role: 'SUPER_ADMIN',
    confirmation: C6_B03_CONFIRMATION_PHRASE,
    credentials: {
      companyId: C6_B01_SANDBOX_COMPANY_ID,
      integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
      environment: 'SANDBOX',
      clientId: 'blocked',
      clientSecret: 'blocked',
      certificatePem: 'blocked',
      privateKeyPem: 'blocked',
    },
    payload: prepared,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
    now,
  });
  assert.equal((authorized.jsonBody?.discount as { discount_type?: string } | undefined)?.discount_type, 'V');
  assert.throws(
    () =>
      authorizeC6HomologB03({
        role: 'SUPER_ADMIN',
        confirmation: C6_B03_CONFIRMATION_PHRASE,
        credentials: {
          companyId: C6_B01_SANDBOX_COMPANY_ID,
          integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
          environment: 'SANDBOX',
          clientId: 'blocked',
          clientSecret: 'blocked',
          certificatePem: 'blocked',
          privateKeyPem: 'blocked',
        },
        payload: { ...prepared, external_reference_id: C6_B01_SANDBOX_PREPARED_REF },
        integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
        sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
        now,
      }),
    C6BoletoValidationError,
  );
  assert.throws(
    () =>
      authorizeC6HomologB03({
        role: 'SUPER_ADMIN',
        confirmation: C6_B03_CONFIRMATION_PHRASE,
        credentials: {
          companyId: C6_B01_SANDBOX_COMPANY_ID,
          integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
          environment: 'SANDBOX',
          clientId: 'blocked',
          clientSecret: 'blocked',
          certificatePem: 'blocked',
          privateKeyPem: 'blocked',
        },
        payload: { ...prepared, external_reference_id: C6_B02_SANDBOX_PREPARED_REF },
        integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
        sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
        now,
      }),
    C6BoletoValidationError,
  );
  console.log('OK testPreparedB03SandboxPayload');
}

function blockedHomologCreds(): C6AuthCredentials {
  return {
    companyId: C6_B01_SANDBOX_COMPANY_ID,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    environment: 'SANDBOX',
    clientId: 'blocked',
    clientSecret: 'blocked',
    certificatePem: 'blocked',
    privateKeyPem: 'blocked',
  };
}

function testPreparedB04SandboxPayload() {
  assert.equal(C6_BOLETO_EXTERNAL_REFERENCE_PATTERN.test(C6_B04_SOURCE_REF), true);
  assert.equal(C6_BOLETO_EXTERNAL_REFERENCE_PATTERN.test(C6_B04_ALTER_REF), true);
  assert.equal(C6_B04_SOURCE_REF, 'B04S261027');
  assert.equal(C6_B04_ALTER_REF, 'B04A261027');
  assert.notEqual(C6_B04_SOURCE_REF, C6_B01_SANDBOX_PREPARED_REF);
  assert.notEqual(C6_B04_SOURCE_REF, C6_B02_SANDBOX_PREPARED_REF);
  assert.notEqual(C6_B04_SOURCE_REF, C6_B03_SANDBOX_PREPARED_REF);
  const prepared = buildC6HomologB04SourcePayload(C6_B01_SANDBOX_COMPANY_ID);
  const body = buildC6BankSlipCreateBody(prepared, now);
  assert.equal(body.external_reference_id, 'B04S261027');
  assert.equal(body.amount, 150);
  assert.equal(body.due_date, '2026-12-01');
  assert.equal(body.billing_scheme, '21');
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_04.readyToExecute, false);
  const authorized = authorizeC6HomologB04Source({
    role: 'SUPER_ADMIN',
    confirmation: C6_B04_SOURCE_CONFIRMATION_PHRASE,
    credentials: blockedHomologCreds(),
    payload: prepared,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
    now,
  });
  assert.equal(authorized.jsonBody?.amount, 150);
  assert.throws(
    () =>
      authorizeC6HomologB04Source({
        role: 'SUPER_ADMIN',
        confirmation: C6_B04_SOURCE_CONFIRMATION_PHRASE,
        credentials: blockedHomologCreds(),
        payload: { ...prepared, external_reference_id: C6_B01_SANDBOX_PREPARED_REF },
        integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
        sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
        now,
      }),
    C6BoletoValidationError,
  );
  const exclusiveId = '01B04EXCLUSIVETESTSLIP0001';
  const alter = authorizeC6HomologB04Alter({
    role: 'SUPER_ADMIN',
    confirmation: C6_B04_ALTER_CONFIRMATION_PHRASE,
    credentials: blockedHomologCreds(),
    bankSlipId: exclusiveId,
    patch: buildC6HomologB04AlterPatch(),
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
    now,
  });
  assert.equal(alter.method, 'PUT');
  assert.equal(alter.url, `${C6_BANK_SLIPS_URL.SANDBOX}${exclusiveId}`);
  assert.equal(alter.jsonBody?.due_date, '2026-12-10');
  assert.equal(isC6HomologProtectedBankSlipId(C6_HOMOLOG_B01_BANK_SLIP_ID), true);
  assert.throws(
    () =>
      authorizeC6HomologB04Alter({
        role: 'SUPER_ADMIN',
        confirmation: C6_B04_ALTER_CONFIRMATION_PHRASE,
        credentials: blockedHomologCreds(),
        bankSlipId: C6_HOMOLOG_B01_BANK_SLIP_ID,
        patch: buildC6HomologB04AlterPatch(),
        integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
        sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
        now,
      }),
    C6BoletoValidationError,
  );
  assert.throws(
    () =>
      authorizeC6HomologB04Alter({
        role: 'SUPER_ADMIN',
        confirmation: C6_B04_ALTER_CONFIRMATION_PHRASE,
        credentials: blockedHomologCreds(),
        bankSlipId: exclusiveId,
        patch: { amount: 175 },
        integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
        sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
        now,
      }),
    C6BoletoValidationError,
  );
  console.log('OK testPreparedB04SandboxPayload');
}

function testPreparedB05AndB06() {
  assert.equal(C6_B05_AUTHORIZED_BANK_SLIP_ID, C6_HOMOLOG_B01_BANK_SLIP_ID);
  assert.equal(C6_B06_AUTHORIZED_BANK_SLIP_ID, C6_HOMOLOG_B01_BANK_SLIP_ID);
  assert.equal(C6_B05_IDEMPOTENCY_REF, 'B05S261027');
  assert.equal(C6_B06_FIRST_ATTEMPT_REF, 'B06S261027');
  assert.equal(C6_B06_SECOND_ATTEMPT_REF, 'B06R261027');
  assert.equal(C6_B06_IDEMPOTENCY_REF, 'B06T261027');
  assert.equal(isC6HomologProtectedBankSlipId(C6_HOMOLOG_B02_BANK_SLIP_ID), true);
  assert.equal(isC6HomologProtectedBankSlipId(C6_HOMOLOG_B03_BANK_SLIP_ID), true);
  const getPrepared = authorizeC6HomologB05({
    role: 'SUPER_ADMIN',
    confirmation: C6_B05_CONFIRMATION_PHRASE,
    credentials: blockedHomologCreds(),
    bankSlipId: C6_B05_AUTHORIZED_BANK_SLIP_ID,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
  });
  assert.equal(getPrepared.method, 'GET');
  assert.equal(getPrepared.url, `${C6_BANK_SLIPS_URL.SANDBOX}${C6_HOMOLOG_B01_BANK_SLIP_ID}`);
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_05.readyToExecute, false);
  assert.throws(
    () =>
      authorizeC6HomologB05({
        role: 'SUPER_ADMIN',
        confirmation: C6_B05_CONFIRMATION_PHRASE,
        credentials: blockedHomologCreds(),
        bankSlipId: C6_HOMOLOG_B02_BANK_SLIP_ID,
        integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
        sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
      }),
    C6BoletoValidationError,
  );
  const pdfPrepared = authorizeC6HomologB06({
    role: 'SUPER_ADMIN',
    confirmation: C6_B06_CONFIRMATION_PHRASE,
    credentials: blockedHomologCreds(),
    bankSlipId: C6_B06_AUTHORIZED_BANK_SLIP_ID,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
  });
  assert.equal(pdfPrepared.method, 'GET');
  assert.equal(pdfPrepared.url, buildC6BankSlipPdfUrl('SANDBOX', C6_HOMOLOG_B01_BANK_SLIP_ID));
  assert.equal(pdfPrepared.headers.Accept, 'application/pdf');
  assert.equal(pdfPrepared.headers['Content-Type'], undefined);
  assert.equal(
    Object.keys(pdfPrepared.headers).some((key) => key.toLowerCase() === 'content-type'),
    false,
  );
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_06.readyToExecute, false);
  console.log('OK testPreparedB05AndB06');
}

function testPreparedB07Webhook() {
  assert.equal(C6_B07_IDEMPOTENCY_REF, 'B07S261027');
  assert.equal(C6_BOLETO_EXTERNAL_REFERENCE_PATTERN.test(C6_B07_IDEMPOTENCY_REF), true);
  assert.equal(C6_B07_CONFIRMATION_PHRASE, 'CADASTRAR_B07_WEBHOOK_SANDBOX');
  assert.equal(C6_NOTIFICATIONS_SERVICE, 'BANK_SLIP');
  assert.equal(C6_WEBHOOK_FINANCE_MUTATION, false);
  const callbackUrl = `https://preview.example/api/banking/c6/webhooks/${C6_B01_SANDBOX_INTEGRATION_ID}?token=test`;
  const prepared = authorizeC6HomologB07({
    role: 'SUPER_ADMIN',
    confirmation: C6_B07_CONFIRMATION_PHRASE,
    credentials: blockedHomologCreds(),
    callbackUrl,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
  });
  assert.equal(prepared.method, 'POST');
  assert.equal(prepared.operation, 'webhook');
  assert.equal(prepared.url, C6_WEBHOOKS_URL.SANDBOX);
  assert.equal(prepared.jsonBody?.service, 'BANK_SLIP');
  assert.match(String(prepared.jsonBody?.url || ''), /token=\[redacted\]/);
  assert.doesNotMatch(JSON.stringify(prepared.jsonBody), /token=test/);
  assert.throws(
    () =>
      authorizeC6HomologB07({
        role: 'SUPER_ADMIN',
        confirmation: 'WRONG',
        credentials: blockedHomologCreds(),
        callbackUrl,
        integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
        sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
      }),
    (err: unknown) => err instanceof Error && /CADASTRAR_B07_WEBHOOK_SANDBOX/.test(err.message),
  );
  assert.throws(
    () =>
      prepareC6WebhookRegister(blockedHomologCreds(), {
        url: 'http://insecure.example/hook',
        service: 'BANK_SLIP',
      }),
    C6BoletoValidationError,
  );
  assert.equal(C6_BOLETO_HOMOLOG_CASES.B_07.readyToExecute, false);
  console.log('OK testPreparedB07Webhook');
}

async function seedB06History(
  store: ReturnType<typeof createMemoryC6HomologIdempotencyStore>,
  ref: string,
  status: 'FAILED' | 'UNKNOWN',
  httpStatus: number,
) {
  const reserved = await store.reserve({
    companyId: C6_B01_SANDBOX_COMPANY_ID,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    externalReferenceId: ref,
    environment: 'SANDBOX',
    scenario: 'B_06',
    requestFingerprint: 'ab'.repeat(32),
    now,
  });
  assert.equal(reserved.acquired, true);
  const processing = await store.markProcessing({
    companyId: C6_B01_SANDBOX_COMPANY_ID,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    externalReferenceId: ref,
    attemptCount: 1,
    now,
  });
  assert.equal(processing.acquired, true);
  const done = await store.complete({
    companyId: C6_B01_SANDBOX_COMPANY_ID,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    externalReferenceId: ref,
    status,
    attemptCount: 1,
    httpStatus,
    errorCode: `HTTP_${httpStatus}`,
    errorMessage: 'historical',
    now,
  });
  assert.equal(done.acquired, true);
}

async function testB06ThirdAttemptPreservesHistory() {
  const store = createMemoryC6HomologIdempotencyStore([
    {
      companyId: C6_B01_SANDBOX_COMPANY_ID,
      integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
      provider: 'C6',
      environment: 'SANDBOX',
    },
  ]);
  await seedB06History(store, C6_B06_FIRST_ATTEMPT_REF, 'UNKNOWN', 406);
  await seedB06History(store, C6_B06_SECOND_ATTEMPT_REF, 'FAILED', 400);
  const creds: C6AuthCredentials = {
    companyId: C6_B01_SANDBOX_COMPANY_ID,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    environment: 'SANDBOX',
    clientId: 'c6-client-id',
    clientSecret: 'c6-client-secret',
    certificatePem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
    privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
  };
  const input = {
    role: 'SUPER_ADMIN',
    confirmation: C6_B06_CONFIRMATION_PHRASE,
    credentials: creds,
    bankSlipId: C6_B06_AUTHORIZED_BANK_SLIP_ID,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    sessionCompanyId: C6_B01_SANDBOX_COMPANY_ID,
    store,
    now,
  };
  const ok = await executeC6HomologB06WithIdempotency(input, {
    accessToken: TOKEN,
    persistReservation: true,
    fetchFn: async (_url, init) => {
      assert.equal(init.headers.Accept, 'application/pdf');
      assert.equal(init.headers['Content-Type'], undefined);
      return { status: 200, bodyText: '%PDF-1.7 fake', contentType: 'application/pdf', pdfMagic: true };
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.idempotency?.externalReferenceId, 'B06T261027');
  assert.equal(ok.idempotency?.status, 'SUCCEEDED');
  const first = await store.get({
    companyId: C6_B01_SANDBOX_COMPANY_ID,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    externalReferenceId: C6_B06_FIRST_ATTEMPT_REF,
  });
  const second = await store.get({
    companyId: C6_B01_SANDBOX_COMPANY_ID,
    integrationId: C6_B01_SANDBOX_INTEGRATION_ID,
    externalReferenceId: C6_B06_SECOND_ATTEMPT_REF,
  });
  assert.equal(first?.status, 'UNKNOWN');
  assert.equal(first?.lastHttpStatus, 406);
  assert.equal(second?.status, 'FAILED');
  assert.equal(second?.lastHttpStatus, 400);
  await assert.rejects(
    () =>
      executeC6HomologB06WithIdempotency(
        { ...input, existingAtomic: ok.idempotency },
        {
          accessToken: TOKEN,
          persistReservation: true,
          fetchFn: async () => ({ status: 200, bodyText: '%PDF-1.7 fake', contentType: 'application/pdf', pdfMagic: true }),
        },
      ),
    (err: unknown) => err instanceof C6HomologIdempotencyError && err.reason === 'already_succeeded',
  );
  console.log('OK testB06ThirdAttemptPreservesHistory');
}

async function testB05ReadOauthReusesCache() {
  const readCreds: C6AuthCredentials = {
    ...creds,
    companyId: 'company-b05-oauth',
    integrationId: 'int-b05-oauth',
  };
  clearAllC6TokenCacheForTests();
  setCachedC6Token(
    readCreds.companyId,
    'SANDBOX',
    {
      accessToken: 'cached-b05-token',
      expiresAtMs: Date.now() + 600_000,
      tokenType: 'Bearer',
      scope: 'bankslip.read bankslip.write',
    },
    readCreds.integrationId,
  );
  let liveCalls = 0;
  const blockedLive: C6AuthFetchFn = async () => {
    liveCalls += 1;
    throw new Error('OAuth live não deveria ser chamado com cache válido.');
  };
  const reused = await requestC6HomologReadAccessToken(readCreds, { fetchFn: blockedLive });
  assert.equal(reused.ok, true);
  if (reused.ok) {
    assert.equal(reused.fromCache, true);
    assert.equal(reused.accessToken, 'cached-b05-token');
    assert.deepEqual(assertC6BankSlipReadScope(reused.scopeRaw || reused.scope), [
      'bankslip.read',
      'bankslip.write',
    ]);
  }
  assert.equal(liveCalls, 0);
  assert.throws(() => assertC6BankSlipReadScope('bankslip.write'), C6BoletoScopeError);
  console.log('OK testB05ReadOauthReusesCache');
}

async function testB02EmitOauthReusesCacheAndDoesNotRetry502() {
  assert.equal(mapC6AuthHttpError(502), 'AUTH_UNAVAILABLE');
  const emitCreds: C6AuthCredentials = {
    ...creds,
    companyId: 'company-b02-oauth',
    integrationId: 'int-b02-oauth',
  };
  const writeScope = 'bankslip.write pix.read';

  clearAllC6TokenCacheForTests();
  setCachedC6Token(
    emitCreds.companyId,
    'SANDBOX',
    {
      accessToken: 'cached-b02-token',
      expiresAtMs: Date.now() + 600_000,
      tokenType: 'Bearer',
      scope: writeScope,
    },
    emitCreds.integrationId,
  );
  let liveCalls = 0;
  const blockedLive: C6AuthFetchFn = async () => {
    liveCalls += 1;
    throw new Error('OAuth live não deveria ser chamado com cache válido.');
  };
  const reused = await requestC6HomologB02EmitAccessToken(emitCreds, { fetchFn: blockedLive });
  assert.equal(reused.ok, true);
  if (reused.ok) {
    assert.equal(reused.fromCache, true);
    assert.equal(reused.accessToken, 'cached-b02-token');
    assert.deepEqual(assertC6BankSlipWriteScope(reused.scopeRaw || reused.scope), [
      'bankslip.write',
      'pix.read',
    ]);
  }
  assert.equal(liveCalls, 0);

  liveCalls = 0;
  const isolatedFetch: C6AuthFetchFn = async () => {
    liveCalls += 1;
    return {
      status: 200,
      bodyText: JSON.stringify({
        access_token: 'isolated-b02-token',
        token_type: 'Bearer',
        expires_in: 600,
        scope: writeScope,
      }),
    };
  };
  const otherCompany = await requestC6HomologB02EmitAccessToken(
    { ...emitCreds, companyId: 'company-b02-other' },
    { fetchFn: isolatedFetch },
  );
  assert.equal(otherCompany.ok, true);
  if (otherCompany.ok) {
    assert.equal(otherCompany.fromCache, false);
    assert.equal(otherCompany.accessToken, 'isolated-b02-token');
  }
  assert.equal(liveCalls, 1);

  liveCalls = 0;
  const otherIntegration = await requestC6HomologB02EmitAccessToken(
    { ...emitCreds, integrationId: 'int-b02-other' },
    { fetchFn: isolatedFetch },
  );
  assert.equal(otherIntegration.ok, true);
  if (otherIntegration.ok) {
    assert.equal(otherIntegration.fromCache, false);
  }
  assert.equal(liveCalls, 1);

  liveCalls = 0;
  const productionBlocked = await requestC6HomologB02EmitAccessToken(
    { ...emitCreds, environment: 'PRODUCTION' },
    { fetchFn: isolatedFetch },
  );
  assert.equal(productionBlocked.ok, false);
  if (!productionBlocked.ok) {
    assert.equal(productionBlocked.code, 'PRODUCTION_AUTH_BLOCKED');
  }
  assert.equal(liveCalls, 0);

  liveCalls = 0;
  const stillCached = await requestC6HomologB02EmitAccessToken(emitCreds, { fetchFn: blockedLive });
  assert.equal(stillCached.ok, true);
  if (stillCached.ok) {
    assert.equal(stillCached.fromCache, true);
    assert.equal(stillCached.accessToken, 'cached-b02-token');
  }
  assert.equal(liveCalls, 0);

  clearAllC6TokenCacheForTests();
  setCachedC6Token(
    emitCreds.companyId,
    'SANDBOX',
    {
      accessToken: 'cached-without-write',
      expiresAtMs: Date.now() + 600_000,
      tokenType: 'Bearer',
      scope: 'pix.read',
    },
    emitCreds.integrationId,
  );
  liveCalls = 0;
  const liveWithWrite: C6AuthFetchFn = async () => {
    liveCalls += 1;
    return {
      status: 200,
      bodyText: JSON.stringify({
        access_token: 'fresh-b02-token',
        token_type: 'Bearer',
        expires_in: 600,
        scope: writeScope,
      }),
    };
  };
  const refreshed = await requestC6HomologB02EmitAccessToken(emitCreds, { fetchFn: liveWithWrite });
  assert.equal(refreshed.ok, true);
  if (refreshed.ok) {
    assert.equal(refreshed.fromCache, false);
    assert.equal(refreshed.accessToken, 'fresh-b02-token');
    assert.deepEqual(assertC6BankSlipWriteScope(refreshed.scopeRaw || refreshed.scope), [
      'bankslip.write',
      'pix.read',
    ]);
  }
  assert.equal(liveCalls, 1);

  clearAllC6TokenCacheForTests();
  liveCalls = 0;
  const unavailable: C6AuthFetchFn = async () => {
    liveCalls += 1;
    return {
      status: 502,
      bodyText: JSON.stringify({ error: 'bad_gateway', access_token: 'nope' }),
      durationMs: 88,
    };
  };
  const failed = await requestC6HomologB02EmitAccessToken(emitCreds, { fetchFn: unavailable });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.code, 'AUTH_UNAVAILABLE');
    assert.equal(failed.httpStatus, 502);
    assert.match(failed.message, /não foram classificadas como inválidas/);
  }
  assert.equal(liveCalls, 1);
  assert.throws(() => assertC6BankSlipWriteScope('pix.read'), C6BoletoScopeError);
  console.log('OK testB02EmitOauthReusesCacheAndDoesNotRetry502');
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
  testPreparedB01SandboxPayload();
  testPreparedB02SandboxPayload();
  testPreparedB03SandboxPayload();
  testPreparedB04SandboxPayload();
  testPreparedB05AndB06();
  testPreparedB07Webhook();
  await testB06ThirdAttemptPreservesHistory();
  await testB05ReadOauthReusesCache();
  await testB02EmitOauthReusesCacheAndDoesNotRetry502();
  console.log('ALL mandatory-c6-fase3b1-homolog-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

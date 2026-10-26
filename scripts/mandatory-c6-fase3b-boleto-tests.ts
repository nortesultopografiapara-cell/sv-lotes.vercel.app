/**
 * C6 Bank Fase 3B — cliente de boleto (OpenAPI 1.7.2), sem chamada real.
 * npm run test:c6-fase3b
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import {
  C6_BOLETO_BILLING_SCHEME,
  C6_BOLETO_CREATE_REQUIRED_FIELDS,
  C6_BOLETO_OPENAPI_SPEC,
  C6_BOLETO_OPENAPI_VERSION,
  C6_BOLETO_OPERATIONS,
} from '../lib/banking/c6/c6BoletoOpenApi';
import {
  C6_BANK_SLIPS_URL,
  getC6BillingScheme,
} from '../lib/banking/c6/c6BoletoEndpoints';
import {
  capturePreparedC6BoletoEvidence,
  executeC6BankSlipAlter,
  executeC6BankSlipCancel,
  executeC6BankSlipCreate,
  executeC6BankSlipGet,
  executeC6BankSlipPdf,
  prepareC6BankSlipAlter,
  prepareC6BankSlipCancel,
  prepareC6BankSlipCreate,
  prepareC6BankSlipGet,
  prepareC6BankSlipPdf,
  type C6BoletoFetchFn,
} from '../lib/banking/c6/c6BoletoClient';
import {
  assertC6BoletoEvidencePublicSafe,
  formatC6BoletoEvidenceReport,
} from '../lib/banking/c6/c6BoletoEvidence';
import {
  C6_BOLETO_SANDBOX_LIVE_ENV_KEY,
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  C6EmissionNotHomologatedError,
  isC6BoletoSandboxLiveAuthorized,
  throwIfC6EmissionAttempt,
} from '../lib/banking/c6/c6EmitGuard';
import {
  C6BoletoCompanyIsolationError,
  C6BoletoValidationError,
  buildC6BankSlipCreateBody,
} from '../lib/banking/c6/c6BoletoValidation';
import type { C6AuthCredentials } from '../lib/banking/c6/c6AuthClient';
import type { C6BoletoCreateInput } from '../lib/banking/c6/c6BoletoTypes';

const root = process.cwd();
const now = new Date('2026-10-26T15:00:00-03:00');
const DUE = '2026-11-15';
const CPF = '11144477735';
const CNPJ = '11222333000181';
const BANK_SLIP_ID = '01J3NCKY6Q99QC4D7T733D35QD';
const TOKEN = 'c6-test-access-token-aaa';

const credsA: C6AuthCredentials = {
  companyId: 'company-a',
  integrationId: 'int-a',
  environment: 'SANDBOX',
  clientId: 'c6-client-id',
  clientSecret: 'c6-client-secret',
  certificatePem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
};

function b01Input(overrides: Partial<C6BoletoCreateInput> = {}): C6BoletoCreateInput {
  return {
    companyId: credsA.companyId,
    environment: 'SANDBOX',
    external_reference_id: 'B01A000001',
    amount: 123.45,
    due_date: DUE,
    payer: {
      name: 'José da Silva',
      tax_id: CPF,
      address: {
        street: 'Av. Nove de Julho',
        number: 123,
        city: 'Rio de Janeiro',
        state: 'RJ',
        zip_code: '05093000',
      },
    },
    ...overrides,
  };
}

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function testOpenApiContract() {
  const spec = JSON.parse(read('docs/c6/boleto-bancario.json')) as {
    openapi: string;
    info: { version: string; title: string };
    paths: Record<string, unknown>;
    components: {
      schemas: {
        bank_slip_create_request: { required: string[]; properties: Record<string, unknown> };
        billing_scheme: { description: string };
      };
    };
  };
  assert.equal(spec.openapi, C6_BOLETO_OPENAPI_SPEC);
  assert.equal(spec.info.version, C6_BOLETO_OPENAPI_VERSION);
  assert.deepEqual(spec.components.schemas.bank_slip_create_request.required, [
    ...C6_BOLETO_CREATE_REQUIRED_FIELDS,
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(spec.paths, '/'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(spec.paths, '/{id}'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(spec.paths, '/{id}/pdf'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(spec.paths, '/{id}/cancel'), true);
  assert.match(spec.components.schemas.billing_scheme.description, /15/);
  assert.match(spec.components.schemas.billing_scheme.description, /21/);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      spec.components.schemas.bank_slip_create_request.properties,
      'billing_scheme',
    ),
    true,
  );
  assert.equal(C6_BOLETO_OPERATIONS.emit.successStatus, 201);
  assert.equal(C6_BOLETO_OPERATIONS.cancel.successStatus, 204);
  console.log('OK testOpenApiContract');
}

function testWalletAndUrls() {
  assert.equal(getC6BillingScheme('SANDBOX'), C6_BOLETO_BILLING_SCHEME.SANDBOX);
  assert.equal(getC6BillingScheme('PRODUCTION'), C6_BOLETO_BILLING_SCHEME.PRODUCTION);
  assert.equal(C6_BOLETO_BILLING_SCHEME.SANDBOX, '21');
  assert.equal(C6_BOLETO_BILLING_SCHEME.PRODUCTION, '15');
  assert.equal(C6_BANK_SLIPS_URL.SANDBOX, 'https://baas-api-sandbox.c6bank.info/v1/bank_slips/');
  assert.equal(C6_BANK_SLIPS_URL.PRODUCTION, 'https://baas-api.c6bank.info/v1/bank_slips/');
  const prepared = prepareC6BankSlipCreate(credsA, b01Input(), { now });
  assert.equal(prepared.method, 'POST');
  assert.equal(prepared.url, C6_BANK_SLIPS_URL.SANDBOX);
  assert.equal(prepared.jsonBody?.billing_scheme, '21');
  assert.equal(prepared.headers['Content-Type'], 'application/json');
  const prod = prepareC6BankSlipCreate(
    { ...credsA, environment: 'PRODUCTION' },
    { ...b01Input(), environment: 'PRODUCTION' },
    { now },
  );
  assert.equal(prod.jsonBody?.billing_scheme, '15');
  assert.equal(prod.url, C6_BANK_SLIPS_URL.PRODUCTION);
  console.log('OK testWalletAndUrls');
}

function testB01ValidationSuccessAndFailures() {
  const body = buildC6BankSlipCreateBody(b01Input(), now);
  assert.equal(body.external_reference_id, 'B01A000001');
  assert.equal(body.amount, 123.45);
  assert.equal(body.due_date, DUE);
  assert.equal(body.payer.tax_id, CPF);
  assert.equal(body.payer.address.zip_code, '05093000');
  assert.equal(body.billing_scheme, '21');
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'discount'), false);

  const cnpjBody = buildC6BankSlipCreateBody(
    b01Input({ payer: { ...b01Input().payer, tax_id: CNPJ, name: 'Empresa LTDA' } }),
    now,
  );
  assert.equal(cnpjBody.payer.tax_id, CNPJ);

  const cases: Array<[string, () => void]> = [
    ['cpf', () => buildC6BankSlipCreateBody(b01Input({ payer: { ...b01Input().payer, tax_id: '12345678901' } }), now)],
    ['cnpj', () => buildC6BankSlipCreateBody(b01Input({ payer: { ...b01Input().payer, tax_id: '11222333000180' } }), now)],
    ['due', () => buildC6BankSlipCreateBody(b01Input({ due_date: '2020-01-01' }), now)],
    ['ref', () => buildC6BankSlipCreateBody(b01Input({ external_reference_id: 'too-long-id' }), now)],
    ['zip', () => buildC6BankSlipCreateBody(b01Input({
      payer: { ...b01Input().payer, address: { ...b01Input().payer.address, zip_code: '123' } },
    }), now)],
    ['uf', () => buildC6BankSlipCreateBody(b01Input({
      payer: { ...b01Input().payer, address: { ...b01Input().payer.address, state: 'XX' } },
    }), now)],
    ['wallet', () => buildC6BankSlipCreateBody(b01Input({ billing_scheme: '15' }), now)],
    ['amount', () => buildC6BankSlipCreateBody(b01Input({ amount: 0 }), now)],
  ];
  for (const [label, fn] of cases) {
    assert.throws(fn, C6BoletoValidationError, label);
  }
  console.log('OK testB01ValidationSuccessAndFailures');
}

function testPreparedSecondaryOperations() {
  const getReq = prepareC6BankSlipGet(credsA, BANK_SLIP_ID);
  assert.equal(getReq.method, 'GET');
  assert.equal(getReq.url, `${C6_BANK_SLIPS_URL.SANDBOX}${BANK_SLIP_ID}`);
  assert.equal(getReq.headers['Content-Type'], 'application/x-www-form-urlencoded');

  const alterReq = prepareC6BankSlipAlter(credsA, BANK_SLIP_ID, { amount: 200.5 }, { now });
  assert.equal(alterReq.method, 'PUT');
  assert.equal(alterReq.jsonBody?.amount, 200.5);

  const pdfReq = prepareC6BankSlipPdf(credsA, BANK_SLIP_ID);
  assert.equal(pdfReq.method, 'GET');
  assert.match(pdfReq.url, /\/pdf$/);
  assert.equal(pdfReq.headers.Accept, 'application/pdf');

  const cancelReq = prepareC6BankSlipCancel(credsA, BANK_SLIP_ID);
  assert.equal(cancelReq.method, 'PUT');
  assert.match(cancelReq.url, /\/cancel$/);
  console.log('OK testPreparedSecondaryOperations');
}

function testEmitRemainsBlocked() {
  assert.throws(() => throwIfC6EmissionAttempt('C6'), (err: unknown) => {
    assert.equal(err instanceof C6EmissionNotHomologatedError, true);
    assert.equal((err as Error).message, C6_EMIT_NOT_HOMOLOGATED_MESSAGE);
    return true;
  });

  const prev = process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY];
  process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY] = 'true';
  try {
    assert.equal(isC6BoletoSandboxLiveAuthorized('SANDBOX'), true);
    assert.equal(isC6BoletoSandboxLiveAuthorized('PRODUCTION'), false);
  } finally {
    if (prev == null) delete process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY];
    else process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY] = prev;
  }
  assert.equal(isC6BoletoSandboxLiveAuthorized('SANDBOX'), false);
  console.log('OK testEmitRemainsBlocked');
}

async function testExecuteBlockedWithoutSimulation() {
  await assert.rejects(
    () => executeC6BankSlipCreate(credsA, b01Input(), { now, accessToken: TOKEN, allowSandboxLive: true }),
    C6EmissionNotHomologatedError,
  );
  const prev = process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY];
  process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY] = 'true';
  try {
    await assert.rejects(
      () => executeC6BankSlipCreate(credsA, b01Input(), { now, accessToken: TOKEN, allowSandboxLive: true }),
      C6EmissionNotHomologatedError,
    );
  } finally {
    if (prev == null) delete process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY];
    else process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY] = prev;
  }
  console.log('OK testExecuteBlockedWithoutSimulation');
}

function mockFetch(status: number, body: unknown, contentType = 'application/json'): C6BoletoFetchFn {
  return async (url, init) => {
    assert.match(url, /baas-api-sandbox\.c6bank\.info\/v1\/bank_slips/);
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(init.agent instanceof https.Agent, true);
    return {
      status,
      bodyText: typeof body === 'string' ? body : JSON.stringify(body),
      contentType,
    };
  };
}

async function testSimulatedB01Success() {
  const created = {
    id: BANK_SLIP_ID,
    amount: 123.45,
    due_date: DUE,
    billing_scheme: '21',
    billing_type: '3',
    bar_code: '33695969000000123450000003048720009224128213',
    digitable_line: '33690.00009 03048.720001 92241.282133 5 96900000012345',
    our_number: '3048',
    originator_id: '304872',
  };
  const result = await executeC6BankSlipCreate(credsA, b01Input(), {
    now,
    accessToken: TOKEN,
    allowSimulatedHttp: true,
    fetchFn: mockFetch(201, created),
    testCase: 'B_01',
  });
  assert.equal(result.ok, true);
  assert.equal(result.httpStatus, 201);
  assert.equal(result.evidence.testCase, 'B_01');
  assert.equal(result.evidence.executed, true);
  assert.equal(result.evidence.billingScheme, '21');
  const json = JSON.stringify(result.evidence);
  assert.equal(json.includes(TOKEN), false);
  assert.equal(json.includes(CPF), false);
  assert.equal(json.includes('BEGIN CERTIFICATE'), false);
  assert.equal(json.includes('BEGIN PRIVATE KEY'), false);
  assert.equal(json.includes(credsA.clientSecret), false);
  assertC6BoletoEvidencePublicSafe(result.evidence);
  const report = formatC6BoletoEvidenceReport(result.evidence);
  assert.match(report, /B_01/);
  assert.equal(report.includes(TOKEN), false);
  console.log('OK testSimulatedB01Success');
}

async function testSimulatedFailuresAuthAndHttp() {
  await assert.rejects(
    () =>
      executeC6BankSlipCreate(
        { ...credsA, environment: 'PRODUCTION' },
        { ...b01Input(), environment: 'PRODUCTION' },
        { now, accessToken: TOKEN, allowSimulatedHttp: true, fetchFn: mockFetch(201, {}) },
      ),
    C6EmissionNotHomologatedError,
  );

  const failed = await executeC6BankSlipCreate(credsA, b01Input(), {
    now,
    accessToken: TOKEN,
    allowSimulatedHttp: true,
    fetchFn: mockFetch(401, { error: 'invalid_token' }),
    testCase: 'INT_AUTH_HTTP_401',
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.httpStatus, 401);
  assert.equal(failed.evidence.testCase, 'INT_AUTH_HTTP_401');
  console.log('OK testSimulatedFailuresAuthAndHttp');
}

async function testSimulatedSecondaryOps() {
  const getRes = await executeC6BankSlipGet(credsA, BANK_SLIP_ID, {
    accessToken: TOKEN,
    allowSimulatedHttp: true,
    fetchFn: mockFetch(200, { id: BANK_SLIP_ID, status: 'CREATED', payer: { tax_id: CPF, email: 'a@b.com' } }),
    testCase: 'B_05',
  });
  assert.equal(getRes.ok, true);
  const getJson = JSON.stringify(getRes.evidence);
  assert.equal(getJson.includes(CPF), false);
  assert.equal(getJson.includes('a@b.com'), false);

  const alterRes = await executeC6BankSlipAlter(
    credsA,
    BANK_SLIP_ID,
    { due_date: '2026-12-01' },
    { now, accessToken: TOKEN, allowSimulatedHttp: true, fetchFn: mockFetch(200, { id: BANK_SLIP_ID, due_date: '2026-12-01' }), testCase: 'B_04' },
  );
  assert.equal(alterRes.ok, true);

  const pdfRes = await executeC6BankSlipPdf(credsA, BANK_SLIP_ID, {
    accessToken: TOKEN,
    allowSimulatedHttp: true,
    fetchFn: async () => ({ status: 200, bodyText: '%PDF-1.7 fake', contentType: 'application/pdf' }),
    testCase: 'B_06',
  });
  assert.equal(pdfRes.ok, true);
  assert.match(String(pdfRes.evidence.responseBody), /pdf/);

  const cancelRes = await executeC6BankSlipCancel(credsA, BANK_SLIP_ID, {
    accessToken: TOKEN,
    allowSimulatedHttp: true,
    fetchFn: mockFetch(204, ''),
    testCase: 'B_08',
  });
  assert.equal(cancelRes.ok, true);
  assert.equal(cancelRes.httpStatus, 204);
  assert.equal(cancelRes.evidence.roteiroExpectedStatus, 200);
  assert.equal(cancelRes.evidence.openapiExpectedStatus, 204);

  const cancel200 = await executeC6BankSlipCancel(credsA, BANK_SLIP_ID, {
    accessToken: TOKEN,
    allowSimulatedHttp: true,
    fetchFn: mockFetch(200, { status: 'CANCELLED' }),
    testCase: 'B_08',
  });
  assert.equal(cancel200.httpStatus, 200);
  assert.equal(cancel200.ok, false);
  assert.equal(cancel200.evidence.httpStatus, 200);
  console.log('OK testSimulatedSecondaryOps');
}

function testIsolationAndEvidenceCapture() {
  assert.throws(
    () => prepareC6BankSlipCreate(credsA, b01Input({ companyId: 'company-b' }), { now }),
    C6BoletoCompanyIsolationError,
  );

  const prepared = prepareC6BankSlipCreate(credsA, b01Input(), { now });
  const evidence = capturePreparedC6BoletoEvidence(prepared, {
    testCase: 'INT_ISOLATION',
    message: C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  });
  assert.equal(evidence.companyId, 'company-a');
  assert.equal(evidence.blocked, true);
  assert.equal(evidence.executed, false);
  assert.equal(evidence.httpStatus, null);
  const json = JSON.stringify(evidence);
  assert.equal(json.includes(CPF), false);
  assertC6BoletoEvidencePublicSafe(evidence);
  console.log('OK testIsolationAndEvidenceCapture');
}

function testGuardsUnchangedOnAsaasInter() {
  const asaas = read('lib/finance/asaasCompanyChargeService.ts');
  assert.match(asaas, /throwIfC6EmissionAttempt/);
  const inter = read('lib/banking/inter/interSaleChargeService.ts');
  assert.equal((inter.match(/throwIfC6EmissionAttempt/g) || []).length >= 3, true);
  const client = read('lib/banking/c6/c6BoletoClient.ts');
  assert.match(client, /throwIfC6EmissionAttempt/);
  assert.match(client, /allowSimulatedHttp/);
  console.log('OK testGuardsUnchangedOnAsaasInter');
}

async function main() {
  testOpenApiContract();
  testWalletAndUrls();
  testB01ValidationSuccessAndFailures();
  testPreparedSecondaryOperations();
  testEmitRemainsBlocked();
  await testExecuteBlockedWithoutSimulation();
  await testSimulatedB01Success();
  await testSimulatedFailuresAuthAndHttp();
  await testSimulatedSecondaryOps();
  testIsolationAndEvidenceCapture();
  testGuardsUnchangedOnAsaasInter();
  console.log('ALL mandatory-c6-fase3b-boleto-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

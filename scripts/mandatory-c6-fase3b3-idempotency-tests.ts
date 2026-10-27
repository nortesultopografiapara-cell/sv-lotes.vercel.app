/**
 * C6 Bank Fase 3B.3 — idempotência transacional B_01 (sem emissão real, sem migration aplicada).
 * npm run test:c6-fase3b3
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import {
  C6_B01_CONFIRMATION_PHRASE,
  C6HomologAuthorizationError,
  authorizeC6HomologB01,
  captureC6HomologB01Blocked,
  executeC6HomologB01WithIdempotency,
} from '../lib/banking/c6/c6BoletoHomologB01';
import {
  C6_B01_RECONCILE_PHRASE,
  C6_HOMOLOG_COMPLETE_RPC,
  C6_HOMOLOG_PROCESSING_RPC,
  C6_HOMOLOG_RECONCILE_RPC,
  C6_HOMOLOG_RESERVE_RPC,
  C6_HOMOLOG_STALE_IN_FLIGHT_MS,
  C6_HOMOLOG_TABLE,
  C6HomologIdempotencyError,
  buildC6HomologRequestFingerprint,
  classifyC6HomologHttpOutcome,
  createMemoryC6HomologIdempotencyStore,
  sanitizeC6HomologErrorMessage,
} from '../lib/banking/c6/c6HomologIdempotency';
import { C6BoletoTransportError } from '../lib/banking/c6/c6BoletoClient';
import {
  C6_BOLETO_SANDBOX_LIVE_ENV_KEY,
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  C6EmissionNotHomologatedError,
} from '../lib/banking/c6/c6EmitGuard';
import type { C6AuthCredentials } from '../lib/banking/c6/c6AuthClient';
import type { C6BoletoCreateInput } from '../lib/banking/c6/c6BoletoTypes';
import { assertC6BoletoEvidencePublicSafe } from '../lib/banking/c6/c6BoletoEvidence';

const root = process.cwd();
const now = new Date('2026-10-26T18:00:00-03:00');
const TOKEN = 'c6-live-access-token-should-never-leak';
const MIGRATION = 'supabase/migrations/20261026200000_c6_homolog_idempotency.sql';

const companyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const companyB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const integrationA = '11111111-1111-4111-8111-111111111111';
const integrationB = '22222222-2222-4222-8222-222222222222';

function credsFor(companyId: string, integrationId: string): C6AuthCredentials {
  return {
    companyId,
    integrationId,
    environment: 'SANDBOX',
    clientId: 'c6-client-id',
    clientSecret: 'c6-client-secret',
    certificatePem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
    privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----',
  };
}

function payloadFor(companyId: string, ref: string, amount = 123.45): C6BoletoCreateInput {
  return {
    companyId,
    environment: 'SANDBOX',
    billing_scheme: '21',
    external_reference_id: ref,
    amount,
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

function fpFor(
  ref: string,
  companyId = companyA,
  integrationId = integrationA,
  amount = 123.45,
): string {
  return buildC6HomologRequestFingerprint({
    companyId,
    integrationId,
    externalReferenceId: ref,
    amount,
    dueDate: '2026-11-15',
    billingScheme: '21',
  });
}

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function storeForCompanies() {
  return createMemoryC6HomologIdempotencyStore([
    { companyId: companyA, integrationId: integrationA, provider: 'C6', environment: 'SANDBOX' },
    { companyId: companyB, integrationId: integrationB, provider: 'C6', environment: 'SANDBOX' },
  ]);
}

async function successFetch(): Promise<{ status: number; bodyText: string }> {
  return {
    status: 201,
    bodyText: JSON.stringify({
      id: '01J3NCKY6Q99QC4D7T733D35QD',
      amount: 123.45,
      due_date: '2026-11-15',
      billing_scheme: '21',
    }),
  };
}

function testMigrationSql() {
  const sql = read(MIGRATION);
  assert.match(sql, /DO NOT APPLY on Production|APLICAR em Production/);
  assert.match(sql, /hoynysmynxncdlptuzub/);
  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${C6_HOMOLOG_TABLE}`));
  assert.match(sql, /UNIQUE \(company_id, integration_id, external_reference_id\)/);
  assert.match(sql, /INSERT INTO public\.c6_homolog_idempotency/);
  assert.match(sql, /ON CONFLICT \(company_id, integration_id, external_reference_id\)/);
  assert.match(sql, /WHERE public\.c6_homolog_idempotency\.status = 'FAILED'/);
  assert.match(
    sql,
    /AND public\.c6_homolog_idempotency\.request_fingerprint = EXCLUDED\.request_fingerprint/,
  );
  assert.match(sql, /request_fingerprint = public\.c6_homolog_idempotency\.request_fingerprint/);
  assert.match(sql, /request_fingerprint text NOT NULL/);
  assert.match(sql, /request_fingerprint ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(sql, /invalid_fingerprint/);
  assert.match(sql, /payload_mismatch/);
  assert.match(sql, /'RESERVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'/);
  assert.match(sql, /needs_reconciliation/);
  assert.match(sql, /needs_bank_confirmation/);
  assert.match(sql, /STALE_IN_FLIGHT/);
  assert.match(sql, /interval '20 seconds'/);
  assert.match(sql, /SET search_path = public, pg_temp/);
  assert.match(sql, /c6_homolog_idempotency_company_status_idx/);
  assert.match(sql, /c6_homolog_idempotency_integration_idx/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /c6_homolog_idempotency_tenant_select/);
  assert.match(sql, /c6_homolog_idempotency_environment_check/);
  assert.match(sql, /c6_homolog_idempotency_status_check/);
  assert.match(sql, /c6_homolog_idempotency_fingerprint_check/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.c6_homolog_idempotency TO service_role/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.c6_homolog_idempotency FROM authenticated/);
  assert.match(sql, /attempt_count = p_attempt_count/);
  assert.match(
    sql,
    /mark_c6_homolog_idempotency_processing\(\s*p_company_id uuid,\s*p_integration_id uuid,\s*p_external_reference_id text,\s*p_attempt_count integer/,
  );
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.mark_c6_homolog_idempotency_processing\(uuid, uuid, text, integer\) TO service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reconcile_c6_homolog_idempotency\(uuid, uuid, text, text, text\) TO service_role/);
  assert.match(sql, /auto_reemit_released', false/);
  assert.match(sql, /http_404_not_absence/);
  assert.match(sql, /client_json_not_proof/);
  assert.match(sql, /official_get_path', '\/v1\/bank_slips\/\{id\}'/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.c6_homolog_evidence_is_valid/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.c6_homolog_evidence_is_valid/);
  assert.doesNotMatch(sql, /invalid_evidence/);
  assert.doesNotMatch(sql, /GET_BANK_SLIP/);
  assert.doesNotMatch(sql, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.c6_homolog_idempotency TO authenticated/);
  assert.match(sql, new RegExp(`FUNCTION public\\.${C6_HOMOLOG_RESERVE_RPC}`));
  assert.match(sql, new RegExp(`FUNCTION public\\.${C6_HOMOLOG_PROCESSING_RPC}`));
  assert.match(sql, new RegExp(`FUNCTION public\\.${C6_HOMOLOG_COMPLETE_RPC}`));
  assert.match(sql, new RegExp(`FUNCTION public\\.${C6_HOMOLOG_RECONCILE_RPC}`));
  assert.match(sql, /GRANT EXECUTE[\s\S]*service_role/);
  assert.doesNotMatch(sql, /aezktedncttwpqeunjej/);
  const developTests = read('scripts/develop/c6-homolog-idempotency-develop-tests.sql');
  assert.match(developTests, /f26f2331-1885-4ac6-8d0e-4131cc8a8014/);
  assert.match(developTests, /e4d0e3c1-29c3-47a1-a04d-156e45fa4b25/);
  assert.match(developTests, /\bROLLBACK\s*;/);
  assert.match(developTests, /FAIL grants/);
  assert.doesNotMatch(developTests, /aezktedncttwpqeunjej/);
  assert.doesNotMatch(sql, /BEGIN RSA PRIVATE KEY/);
  console.log('OK testMigrationSql');
}

function testClassifyOutcome() {
  assert.equal(classifyC6HomologHttpOutcome({ httpStatus: 201, transport: 'ok' }), 'SUCCEEDED');
  assert.equal(classifyC6HomologHttpOutcome({ httpStatus: 200, transport: 'ok' }), 'UNKNOWN');
  assert.equal(
    classifyC6HomologHttpOutcome({ httpStatus: 200, transport: 'ok', successStatuses: [200] }),
    'SUCCEEDED',
  );
  assert.equal(
    classifyC6HomologHttpOutcome({ httpStatus: 201, transport: 'ok', successStatuses: [200] }),
    'UNKNOWN',
  );
  assert.equal(classifyC6HomologHttpOutcome({ httpStatus: 400, transport: 'ok' }), 'FAILED');
  assert.equal(classifyC6HomologHttpOutcome({ httpStatus: 422, transport: 'ok' }), 'FAILED');
  assert.equal(classifyC6HomologHttpOutcome({ httpStatus: 500, transport: 'ok' }), 'UNKNOWN');
  assert.equal(classifyC6HomologHttpOutcome({ httpStatus: 409, transport: 'ok' }), 'UNKNOWN');
  assert.equal(classifyC6HomologHttpOutcome({ httpStatus: null, transport: 'TIMEOUT' }), 'UNKNOWN');
  assert.equal(classifyC6HomologHttpOutcome({ httpStatus: null, transport: 'NETWORK' }), 'UNKNOWN');
  console.log('OK testClassifyOutcome');
}

function testFingerprintHasNoPii() {
  const hash = buildC6HomologRequestFingerprint({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000001',
    amount: 123.45,
    dueDate: '2026-11-15',
    billingScheme: '21',
  });
  assert.equal(hash.length, 64);
  assert.equal(hash.includes('11144477735'), false);
  assert.equal(hash.includes('José'), false);
  const redacted = sanitizeC6HomologErrorMessage(
    `timeout access_token=${TOKEN} Bearer ${TOKEN} cpf=11144477735 BEGIN PRIVATE KEY`,
  );
  assert.ok(redacted);
  assert.equal(redacted.includes(TOKEN), false);
  assert.equal(redacted.includes('11144477735'), false);
  assert.equal(redacted.includes('BEGIN PRIVATE KEY'), false);
  console.log('OK testFingerprintHasNoPii');
}

async function testConcurrencyAndDuplicate() {
  const store = storeForCompanies();
  const input = {
    role: 'SUPER_ADMIN',
    confirmation: C6_B01_CONFIRMATION_PHRASE,
    credentials: credsFor(companyA, integrationA),
    payload: payloadFor(companyA, 'B01A000010'),
    integrationId: integrationA,
    store,
    now,
  };
  const [first, second] = await Promise.allSettled([
    executeC6HomologB01WithIdempotency(input, {
      persistReservation: true,
      accessToken: TOKEN,
      now,
      fetchFn: async () => successFetch(),
    }),
    executeC6HomologB01WithIdempotency(input, {
      persistReservation: true,
      accessToken: TOKEN,
      now,
      fetchFn: async () => successFetch(),
    }),
  ]);
  const ok = [first, second].filter((row) => row.status === 'fulfilled');
  const denied = [first, second].filter((row) => row.status === 'rejected');
  assert.equal(ok.length, 1);
  assert.equal(denied.length, 1);
  if (denied[0].status === 'rejected') {
    assert.ok(denied[0].reason instanceof C6HomologIdempotencyError);
    assert.ok(
      ['in_flight', 'already_succeeded'].includes(
        (denied[0].reason as C6HomologIdempotencyError).reason,
      ),
    );
  }
  if (ok[0].status === 'fulfilled') {
    assert.equal(ok[0].value.idempotency?.status, 'SUCCEEDED');
    assert.equal(ok[0].value.evidence.billingScheme, '21');
    assert.equal(JSON.stringify(ok[0].value.evidence).includes(TOKEN), false);
    assertC6BoletoEvidencePublicSafe(ok[0].value.evidence);
  }

  await assert.rejects(
    () =>
      executeC6HomologB01WithIdempotency(
        { ...input, payload: payloadFor(companyA, 'B01A000010') },
        { persistReservation: true, accessToken: TOKEN, now, fetchFn: async () => successFetch() },
      ),
    (err: unknown) =>
      err instanceof C6HomologIdempotencyError && err.reason === 'already_succeeded',
  );
  console.log('OK testConcurrencyAndDuplicate');
}

async function testTimeoutUnknownNotRetryable() {
  const store = storeForCompanies();
  const input = {
    role: 'SUPER_ADMIN',
    confirmation: C6_B01_CONFIRMATION_PHRASE,
    credentials: credsFor(companyA, integrationA),
    payload: payloadFor(companyA, 'B01A000011'),
    integrationId: integrationA,
    store,
    now,
  };
  const timedOut = await executeC6HomologB01WithIdempotency(input, {
    persistReservation: true,
    accessToken: TOKEN,
    now,
    fetchFn: async () => {
      throw new C6BoletoTransportError('TIMEOUT', 'Timeout ao contatar o C6 Bank (boleto).');
    },
  });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.idempotency?.status, 'UNKNOWN');

  await assert.rejects(
    () =>
      executeC6HomologB01WithIdempotency(input, {
        persistReservation: true,
        accessToken: TOKEN,
        now,
        fetchFn: async () => successFetch(),
      }),
    (err: unknown) =>
      err instanceof C6HomologIdempotencyError && err.reason === 'needs_reconciliation',
  );

  const phraseOnly = await store.reconcile({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000011',
    confirmation: 'nao',
    operatorNote: '{"http_status":404,"source":"GET_BANK_SLIP"}',
    now,
  });
  assert.equal(phraseOnly.reason, 'invalid_confirmation');
  assert.equal(phraseOnly.acquired, false);

  const recorded = await store.reconcile({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000011',
    confirmation: C6_B01_RECONCILE_PHRASE,
    operatorNote: 'operador informou HTTP 404 isolado; nao e prova de ausencia',
    now,
  });
  assert.equal(recorded.acquired, false);
  assert.equal(recorded.reason, 'needs_bank_confirmation');
  assert.equal(recorded.row?.status, 'UNKNOWN');

  await assert.rejects(
    () =>
      executeC6HomologB01WithIdempotency(input, {
        persistReservation: true,
        accessToken: TOKEN,
        now,
        fetchFn: async () => successFetch(),
      }),
    (err: unknown) =>
      err instanceof C6HomologIdempotencyError && err.reason === 'needs_reconciliation',
  );
  console.log('OK testTimeoutUnknownNotRetryable');
}

async function testHttpFailureAndStaleInFlight() {
  const store = storeForCompanies();
  const failed = await executeC6HomologB01WithIdempotency(
    {
      role: 'SUPER_ADMIN',
      confirmation: C6_B01_CONFIRMATION_PHRASE,
      credentials: credsFor(companyA, integrationA),
      payload: payloadFor(companyA, 'B01A000013'),
      integrationId: integrationA,
      store,
      now,
    },
    {
      persistReservation: true,
      accessToken: TOKEN,
      now,
      fetchFn: async () => ({ status: 400, bodyText: JSON.stringify({ message: 'invalid payer' }) }),
    },
  );
  assert.equal(failed.idempotency?.status, 'FAILED');

  const staleNow = new Date(now.getTime() - C6_HOMOLOG_STALE_IN_FLIGHT_MS - 1);
  const reserved = await store.reserve({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000014',
    environment: 'SANDBOX',
    requestFingerprint: fpFor('B01A000014'),
    now: staleNow,
  });
  assert.equal(reserved.acquired, true);
  const stale = await store.reserve({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000014',
    environment: 'SANDBOX',
    requestFingerprint: fpFor('B01A000014'),
    now,
  });
  assert.equal(stale.reason, 'needs_reconciliation');
  assert.equal(stale.row?.status, 'UNKNOWN');
  console.log('OK testHttpFailureAndStaleInFlight');
}

async function testIsolationAuthProductionSanitize() {
  const store = storeForCompanies();
  const otherCompany = await store.reserve({
    companyId: companyB,
    integrationId: integrationB,
    externalReferenceId: 'B01A000010',
    environment: 'SANDBOX',
    requestFingerprint: fpFor('B01A000010', companyB, integrationB),
    now,
  });
  assert.equal(otherCompany.acquired, true);

  assert.throws(
    () =>
      authorizeC6HomologB01({
        role: 'ADMIN',
        confirmation: C6_B01_CONFIRMATION_PHRASE,
        credentials: credsFor(companyA, integrationA),
        payload: payloadFor(companyA, 'B01A000020'),
        now,
      }),
    C6HomologAuthorizationError,
  );
  assert.throws(
    () =>
      authorizeC6HomologB01({
        role: 'SUPER_ADMIN',
        confirmation: C6_B01_CONFIRMATION_PHRASE,
        credentials: { ...credsFor(companyA, integrationA), environment: 'PRODUCTION' },
        payload: { ...payloadFor(companyA, 'B01A000021'), environment: 'PRODUCTION', billing_scheme: '15' },
        now,
      }),
    (err: unknown) => err instanceof Error && /Sandbox|homologada/i.test(err.message),
  );
  const prod = await store.reserve({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000022',
    environment: 'PRODUCTION',
    requestFingerprint: fpFor('B01A000022'),
    now,
  });
  assert.equal(prod.reason, 'production_blocked');
  assert.equal(prod.acquired, false);

  const mismatch = await store.reserve({
    companyId: companyA,
    integrationId: integrationB,
    externalReferenceId: 'B01A000023',
    environment: 'SANDBOX',
    requestFingerprint: fpFor('B01A000023', companyA, integrationB),
    now,
  });
  assert.equal(mismatch.reason, 'integration_mismatch');

  const { evidence } = captureC6HomologB01Blocked({
    role: 'SUPER_ADMIN',
    confirmation: C6_B01_CONFIRMATION_PHRASE,
    credentials: credsFor(companyA, integrationA),
    payload: payloadFor(companyA, 'B01A000024'),
    now,
  });
  assert.equal(evidence.blocked, true);
  assert.equal(evidence.executed, false);
  assert.equal(evidence.billingScheme, '21');
  assert.match(evidence.message, new RegExp(C6_EMIT_NOT_HOMOLOGATED_MESSAGE));
  assert.equal(JSON.stringify(evidence).includes('11144477735'), false);
  assertC6BoletoEvidencePublicSafe(evidence);
  console.log('OK testIsolationAuthProductionSanitize');
}

async function testBlockedPathDoesNotEmit() {
  const store = storeForCompanies();
  await assert.rejects(
    () =>
      executeC6HomologB01WithIdempotency(
        {
          role: 'SUPER_ADMIN',
          confirmation: C6_B01_CONFIRMATION_PHRASE,
          credentials: credsFor(companyA, integrationA),
          payload: payloadFor(companyA, 'B01A000030'),
          integrationId: integrationA,
          store,
          now,
        },
        { persistReservation: true, now },
      ),
    C6EmissionNotHomologatedError,
  );
  const row = await store.get({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000030',
  });
  assert.equal(row?.status, 'FAILED');
  assert.equal(row?.lastErrorCode, 'EMIT_NOT_HOMOLOGATED');

  const route = read('app/api/banking/c6/homolog/b01/route.ts');
  assert.match(route, /status: 409/);
  assert.match(route, /loadC6HomologAtomicRow/);
  assert.match(route, /executeC6HomologB01WithIdempotency/);
  assert.match(route, /createSupabaseC6HomologIdempotencyAdapter/);
  assert.match(route, /persistReservation: true/);
  assert.match(route, /collectC6HomologWordEvidence/);
  assert.doesNotMatch(route, /fetchFn:/);
  assert.doesNotMatch(route, /accessToken:/);
  assert.doesNotMatch(route, /C6_BOLETO_SANDBOX_LIVE_ENABLED/);
  assert.doesNotMatch(route, /baas-api-sandbox\.c6bank\.info\/v1\/bank_slips/);
  assert.match(route, /export async function GET/);
  assert.match(route, /getBankingEncryptionKeyDiagnostics/);
  assert.match(route, /assertNotProductionRuntime/);
  assert.doesNotMatch(route, /BANKING_CREDENTIALS_ENCRYPTION_KEY/);
  const sale = read('components/sales/SaleChargesPanel.tsx');
  const central = read('components/charges/ChargesPageClient.tsx');
  assert.doesNotMatch(sale, /homolog\/b01/);
  assert.doesNotMatch(central, /homolog\/b01/);
  console.log('OK testBlockedPathDoesNotEmit');
}

async function testStaleAttemptDoesNotComplete() {
  const store = storeForCompanies();
  const reserved = await store.reserve({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000040',
    environment: 'SANDBOX',
    requestFingerprint: fpFor('B01A000040'),
    now,
  });
  assert.equal(reserved.acquired, true);
  const staleMark = await store.markProcessing({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000040',
    attemptCount: 99,
    now,
  });
  assert.equal(staleMark.acquired, false);
  assert.equal(staleMark.reason, 'invalid_transition');
  assert.equal(staleMark.row?.status, 'RESERVED');

  await store.markProcessing({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000040',
    attemptCount: reserved.row?.attemptCount || 1,
    now,
  });
  const late = await store.complete({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000040',
    status: 'SUCCEEDED',
    attemptCount: 99,
    c6BankSlipId: '01J3NCKY6Q99QC4D7T733D35QD',
    httpStatus: 201,
    now,
  });
  assert.equal(late.acquired, false);
  assert.equal(late.reason, 'invalid_transition');
  const current = await store.get({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000040',
  });
  assert.equal(current?.status, 'PROCESSING');
  console.log('OK testStaleAttemptDoesNotComplete');
}

async function testFingerprintRequiredAndImmutable() {
  const store = storeForCompanies();
  const missing = await store.reserve({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000050',
    environment: 'SANDBOX',
    now,
  });
  assert.equal(missing.reason, 'invalid_fingerprint');
  assert.equal(missing.acquired, false);

  const first = await store.reserve({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000050',
    environment: 'SANDBOX',
    requestFingerprint: fpFor('B01A000050'),
    now,
  });
  assert.equal(first.acquired, true);
  await store.markProcessing({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000050',
    attemptCount: 1,
    now,
  });
  await store.complete({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000050',
    status: 'FAILED',
    attemptCount: 1,
    httpStatus: 400,
    errorCode: 'HTTP_400',
    now,
  });

  const mismatch = await store.reserve({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000050',
    environment: 'SANDBOX',
    requestFingerprint: fpFor('B01A000050', companyA, integrationA, 999.99),
    now,
  });
  assert.equal(mismatch.acquired, false);
  assert.equal(mismatch.reason, 'payload_mismatch');
  assert.equal(mismatch.row?.status, 'FAILED');
  assert.equal(mismatch.row?.requestFingerprint, fpFor('B01A000050'));

  const retrySame = await store.reserve({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000050',
    environment: 'SANDBOX',
    requestFingerprint: fpFor('B01A000050'),
    now,
  });
  assert.equal(retrySame.acquired, true);
  assert.equal(retrySame.row?.attemptCount, 2);
  assert.equal(retrySame.row?.requestFingerprint, fpFor('B01A000050'));
  console.log('OK testFingerprintRequiredAndImmutable');
}

async function testOldAttemptCannotStartNewer() {
  const store = storeForCompanies();
  const reserved = await store.reserve({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000060',
    environment: 'SANDBOX',
    requestFingerprint: fpFor('B01A000060'),
    now,
  });
  assert.equal(reserved.row?.attemptCount, 1);
  await store.markProcessing({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000060',
    attemptCount: 1,
    now,
  });
  await store.complete({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000060',
    status: 'FAILED',
    attemptCount: 1,
    httpStatus: 400,
    now,
  });
  const retry = await store.reserve({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000060',
    environment: 'SANDBOX',
    requestFingerprint: fpFor('B01A000060'),
    now,
  });
  assert.equal(retry.row?.attemptCount, 2);
  const oldMark = await store.markProcessing({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000060',
    attemptCount: 1,
    now,
  });
  assert.equal(oldMark.acquired, false);
  assert.equal(oldMark.reason, 'invalid_transition');
  assert.equal(oldMark.row?.status, 'RESERVED');
  const newMark = await store.markProcessing({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000060',
    attemptCount: 2,
    now,
  });
  assert.equal(newMark.acquired, true);
  const oldComplete = await store.complete({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000060',
    status: 'SUCCEEDED',
    attemptCount: 1,
    c6BankSlipId: '01J3NCKY6Q99QC4D7T733D35QD',
    httpStatus: 201,
    now,
  });
  assert.equal(oldComplete.acquired, false);
  assert.equal(oldComplete.reason, 'invalid_transition');
  const current = await store.get({
    companyId: companyA,
    integrationId: integrationA,
    externalReferenceId: 'B01A000060',
  });
  assert.equal(current?.status, 'PROCESSING');
  assert.equal(current?.attemptCount, 2);
  console.log('OK testOldAttemptCannotStartNewer');
}

async function testSimulatedAgentAndHttpsUnusedByStore() {
  const store = storeForCompanies();
  const result = await executeC6HomologB01WithIdempotency(
    {
      role: 'SUPER_ADMIN',
      confirmation: C6_B01_CONFIRMATION_PHRASE,
      credentials: credsFor(companyA, integrationA),
      payload: payloadFor(companyA, 'B01A000031'),
      integrationId: integrationA,
      store,
      now,
    },
    {
      persistReservation: true,
      accessToken: TOKEN,
      now,
      fetchFn: async (url, init) => {
        assert.match(url, /\/v1\/bank_slips\/$/);
        assert.equal(init.agent instanceof https.Agent, true);
        const body = JSON.parse(String(init.body || '{}')) as Record<string, unknown>;
        assert.equal(body.billing_scheme, '21');
        return successFetch();
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.idempotency?.attemptCount, 1);
  console.log('OK testSimulatedAgentAndHttpsUnusedByStore');
}

async function testSandboxLiveIdempotencyWithMockHttp() {
  const prev = process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY];
  process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY] = 'true';
  const store = storeForCompanies();
  try {
    const result = await executeC6HomologB01WithIdempotency(
      {
        role: 'SUPER_ADMIN',
        confirmation: C6_B01_CONFIRMATION_PHRASE,
        credentials: credsFor(companyA, integrationA),
        payload: payloadFor(companyA, 'B01A000032'),
        integrationId: integrationA,
        store,
        now,
      },
      {
        persistReservation: true,
        allowSandboxLive: true,
        accessToken: TOKEN,
        now,
        fetchFn: async () => successFetch(),
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.httpStatus, 201);
    assert.equal(result.idempotency?.status, 'SUCCEEDED');
  } finally {
    if (prev == null) delete process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY];
    else process.env[C6_BOLETO_SANDBOX_LIVE_ENV_KEY] = prev;
  }
  console.log('OK testSandboxLiveIdempotencyWithMockHttp');
}

async function main() {
  testMigrationSql();
  testClassifyOutcome();
  testFingerprintHasNoPii();
  await testConcurrencyAndDuplicate();
  await testTimeoutUnknownNotRetryable();
  await testHttpFailureAndStaleInFlight();
  await testIsolationAuthProductionSanitize();
  await testBlockedPathDoesNotEmit();
  await testStaleAttemptDoesNotComplete();
  await testFingerprintRequiredAndImmutable();
  await testOldAttemptCannotStartNewer();
  await testSimulatedAgentAndHttpsUnusedByStore();
  await testSandboxLiveIdempotencyWithMockHttp();
  console.log('ALL mandatory-c6-fase3b3-idempotency-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

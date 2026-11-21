/**
 * Homologação C6-H1: autorização exclusiva, idempotência e ação desabilitada.
 * npx tsx scripts/mandatory-c6-h1-homolog-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { TOPOGRAFIA_COMPANY_ID } from '../lib/companySettingsLayout';
import {
  C6_H1_AUTHORIZED_COMPANY_ID,
  C6_H1_EXTERNAL_REFERENCE,
  C6_H1_OPERATION_AUTHORIZATION_ENV,
  C6_H1_PRODUCTION_COMPANY_ID,
  assessC6H1OAuthScopes,
  evaluateC6H1Authorization,
  isC6H1HomologActionArmed,
} from '../lib/banking/c6/c6H1Authorization';
import {
  planC6H1HomologAction,
  rehearseC6H1IdempotencyInMemory,
} from '../lib/banking/c6/c6H1HomologAction';
import {
  C6_H1_COMPLETE_ARG_ORDER,
  C6_H1_INTEGRATION_ID,
  C6_H1_PROCESSING_ARG_ORDER,
  C6_H1_PROTECTED_REFERENCES,
  C6_H1_RECONCILE_ARG_ORDER,
  C6_H1_RESERVE_ARG_ORDER,
  buildC6H1CompleteRpcArgs,
  buildC6H1ProcessingRpcArgs,
  buildC6H1ReconcileRpcArgs,
  buildC6H1ReserveRpcArgs,
  c6H1StatusBlocksAnotherEmission,
  dispatchC6H1IdempotencyRpc,
} from '../lib/banking/c6/c6H1IdempotencyRpc';
import {
  C6_BOLETO_SANDBOX_LIVE_ENV_KEY,
  isC6BoletoSandboxLiveAuthorized,
  throwIfC6EmissionAttempt,
  C6EmissionNotHomologatedError,
} from '../lib/banking/c6/c6EmitGuard';
import {
  C6_B01_RECONCILE_PHRASE,
  buildC6HomologRequestFingerprint,
  createMemoryC6HomologIdempotencyStore,
} from '../lib/banking/c6/c6HomologIdempotency';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const DEVELOP = 'https://hoynysmynxncdlptuzub.supabase.co';
const PRODUCTION = 'https://aezktedncttwpqeunjej.supabase.co';
const OTHER_COMPANY = '11111111-1111-4111-8111-111111111111';
const INTEGRATION = C6_H1_INTEGRATION_ID;
const EMIT_SECRET = 'h1-emit-autorizacao-ficticia-01';
const TOKEN_SECRET = 'h1-token-autorizacao-ficticia-01';
const STATUS_SECRET = 'h1-status-autorizacao-ficticia-1';
const PDF_SECRET = 'h1-pdf-autorizacao-ficticia-0001';
const SECRET_LEAK = 'segredo-h1-nao-pode-sair';
const TOKEN_LEAK = 'token-h1-nao-pode-aparecer';
const CERT_LEAK = '-----BEGIN CERTIFICATE-----\nH1CERT\n-----END CERTIFICATE-----';

const serverEnv: Record<string, string | undefined> = {
  [C6_H1_OPERATION_AUTHORIZATION_ENV.token]: TOKEN_SECRET,
  [C6_H1_OPERATION_AUTHORIZATION_ENV.emit]: EMIT_SECRET,
  [C6_H1_OPERATION_AUTHORIZATION_ENV.status]: STATUS_SECRET,
  [C6_H1_OPERATION_AUTHORIZATION_ENV.pdf]: PDF_SECRET,
  [C6_BOLETO_SANDBOX_LIVE_ENV_KEY]: 'true',
};

function acceptedBody(operation: 'token' | 'emit' | 'status' | 'pdf', secret: string) {
  return {
    operation,
    environment: 'SANDBOX',
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    serverAuthorization: secret,
  };
}

function storeForTopografia() {
  return createMemoryC6HomologIdempotencyStore([
    {
      companyId: C6_H1_AUTHORIZED_COMPANY_ID,
      integrationId: INTEGRATION,
      provider: 'C6',
      environment: 'SANDBOX',
    },
  ]);
}

async function main() {
  assert(C6_H1_AUTHORIZED_COMPANY_ID === 'f26f2331-1885-4ac6-8d0e-4131cc8a8014', 'empresa exclusiva é a de teste do Develop');
  const productionCompanyId: string = TOPOGRAFIA_COMPANY_ID;
  assert(C6_H1_AUTHORIZED_COMPANY_ID !== productionCompanyId, 'o UUID real de Production não autoriza a H1');
  assert(C6_H1_PRODUCTION_COMPANY_ID === TOPOGRAFIA_COMPANY_ID, 'o UUID real permanece identificado e recusado');
  assert(!C6_H1_PROTECTED_REFERENCES.includes(C6_H1_EXTERNAL_REFERENCE as never), 'a referência H1 não reutiliza o histórico');
  assert(C6_H1_EXTERNAL_REFERENCE.length <= 10, 'referência dentro do limite do boleto');
  assert(isC6H1HomologActionArmed() === false, 'ação H1 permanece desarmada');
  assert(isC6BoletoSandboxLiveAuthorized('SANDBOX') === false, 'bloqueio global de emissão permanece');

  let emissionBlocked = false;
  try {
    throwIfC6EmissionAttempt('C6');
  } catch (error) {
    emissionBlocked = error instanceof C6EmissionNotHomologatedError;
  }
  assert(emissionBlocked, 'o fluxo normal de cobrança continua recusando C6');

  const other = evaluateC6H1Authorization({
    companyId: OTHER_COMPANY,
    supabaseUrl: DEVELOP,
    environment: 'SANDBOX',
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    operation: 'emit',
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
  });
  assert(other.company === false && other.denials.includes('company'), 'outra empresa é recusada');
  assert(other.bankCallAllowed === false, 'outra empresa não chama o banco');

  const productionBank = evaluateC6H1Authorization({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    supabaseUrl: DEVELOP,
    environment: 'PRODUCTION',
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    operation: 'emit',
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
  });
  assert(productionBank.sandbox === false && productionBank.productionBlocked, 'Production bancária é recusada');

  const productionHost = evaluateC6H1Authorization({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    supabaseUrl: PRODUCTION,
    environment: 'SANDBOX',
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    operation: 'emit',
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
  });
  assert(productionHost.develop === false && productionHost.productionBlocked, 'host Production é recusado');

  const otherReference = evaluateC6H1Authorization({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    supabaseUrl: DEVELOP,
    environment: 'SANDBOX',
    externalReferenceId: 'C6H1OUTRO',
    operation: 'emit',
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
  });
  assert(otherReference.reference === false && otherReference.denials.includes('reference'), 'outra referência é recusada');

  const wrongOperationSecret = evaluateC6H1Authorization({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    supabaseUrl: DEVELOP,
    environment: 'SANDBOX',
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    operation: 'pdf',
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
  });
  assert(
    wrongOperationSecret.serverAuthorization === false,
    'a autorização de emissão não libera a consulta do PDF',
  );

  const globalFlagOnly = evaluateC6H1Authorization({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    supabaseUrl: DEVELOP,
    environment: 'SANDBOX',
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    operation: 'emit',
    serverAuthorization: 'true',
    env: { ...serverEnv, [C6_H1_OPERATION_AUTHORIZATION_ENV.emit]: 'true' },
  });
  assert(globalFlagOnly.serverAuthorization === false, 'o flag global não autoriza a operação');
  assert(globalFlagOnly.globalEmissionAuthorized === false, 'o flag global continua sem efeito');

  const ready = planC6H1HomologAction({
    tenantId: C6_H1_AUTHORIZED_COMPANY_ID,
    supabaseUrl: DEVELOP,
    env: serverEnv,
    body: acceptedBody('emit', EMIT_SECRET),
  });
  assert(ready.status === 403, 'a ação pronta continua desabilitada');
  assert(ready.body.executed === false && ready.body.bankCallAllowed === false, 'nada é executado');
  assert(ready.body.conditions.company && ready.body.conditions.develop, 'empresa e Develop conferem');
  assert(ready.body.conditions.sandbox && ready.body.conditions.reference, 'Sandbox e referência conferem');
  assert(ready.body.conditions.serverAuthorization, 'a chave da operação confere');
  assert(ready.body.denials.length === 1 && ready.body.denials[0] === 'action_disarmed', 'só o desarme desta fase permanece');
  assert(ready.body.financialWriteAllowed === false && ready.body.webhookEnabled === false, 'financeiro e webhook permanecem fechados');
  assert(ready.body.idempotency.reuseExisting === true, 'a H1 reutiliza a idempotência já instalada');
  assert(ready.body.idempotency.conflictingMigrationShipped === false, 'a migration conflitante não é publicada');
  assert(ready.body.idempotency.unknownAndProcessingStayBlocked === true, 'UNKNOWN e PROCESSING permanecem bloqueados');
  assert(ready.body.idempotency.ambiguousReleasesReference === false, 'ambiguidade não libera a referência');
  assert(!JSON.stringify(ready.body).includes(EMIT_SECRET), 'a resposta não devolve a autorização');

  const confused = planC6H1HomologAction({
    tenantId: OTHER_COMPANY,
    supabaseUrl: DEVELOP,
    env: serverEnv,
    body: { ...acceptedBody('emit', EMIT_SECRET), companyId: C6_H1_AUTHORIZED_COMPANY_ID },
  });
  assert(confused.body.conditions.company === false, 'o UUID no corpo não troca a empresa da sessão');

  const leaked = planC6H1HomologAction({
    tenantId: C6_H1_AUTHORIZED_COMPANY_ID,
    supabaseUrl: DEVELOP,
    env: serverEnv,
    body: {
      ...acceptedBody('token', TOKEN_SECRET),
      clientSecret: SECRET_LEAK,
      certificatePem: CERT_LEAK,
      access_token: TOKEN_LEAK,
    },
  });
  const leakedJson = JSON.stringify(leaked.body);
  assert(leaked.status === 400, 'credencial no corpo é recusada');
  assert(!leakedJson.includes(SECRET_LEAK), 'o segredo não volta na resposta');
  assert(!leakedJson.includes(TOKEN_LEAK), 'o access token não volta na resposta');
  assert(!leakedJson.includes('BEGIN CERTIFICATE'), 'o certificado não volta na resposta');
  assert(leaked.body.executed === false, 'credencial recusada não executa');

  const scopes = assessC6H1OAuthScopes('bankslip.write bankslip.read', true);
  assert(scopes.writeConfirmed && scopes.readConfirmed && scopes.conclusive, 'os dois escopos confirmam a leitura');
  const writeOnly = assessC6H1OAuthScopes('bankslip.write', true);
  assert(writeOnly.writeConfirmed && writeOnly.readConfirmed === false, 'escrita sem leitura não libera consulta');
  const absent = assessC6H1OAuthScopes(null, false);
  assert(absent.conclusive === false && absent.writeConfirmed === false, 'scope ausente não é tratado como concedido');
  const dirty = assessC6H1OAuthScopes(`${TOKEN_LEAK} bankslip.read`, true);
  assert(!dirty.scopes.includes(TOKEN_LEAK), 'um token no campo scope não é publicado');

  const duplicate = storeForTopografia();
  const fingerprint = buildC6HomologRequestFingerprint({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    amount: 10,
    dueDate: '2026-12-20',
    billingScheme: '21',
  });
  const firstReserve = await duplicate.reserve({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    scenario: 'H1',
    requestFingerprint: fingerprint,
  });
  const secondReserve = await duplicate.reserve({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    scenario: 'H1',
    requestFingerprint: fingerprint,
  });
  assert(firstReserve.acquired && secondReserve.acquired === false && secondReserve.reason === 'in_flight', 'a mesma referência não reserva duas vezes');

  const succeeded = await rehearseC6H1IdempotencyInMemory({
    store: storeForTopografia(),
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    supabaseUrl: DEVELOP,
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
    amount: 10,
    dueDate: '2026-12-20',
    transport: 'ok',
    httpStatus: 201,
    bankSlipId: 'H1SLIPMOCK',
  });
  assert(succeeded.settled === 'SUCCEEDED' && succeeded.repeatReason === 'already_succeeded', 'sucesso não emite de novo');
  assert(succeeded.bankCallAllowed === false && succeeded.mayRepeat === false, 'o ensaio não libera chamada bancária');

  const timeout = await rehearseC6H1IdempotencyInMemory({
    store: storeForTopografia(),
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    supabaseUrl: DEVELOP,
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
    amount: 10,
    dueDate: '2026-12-20',
    transport: 'TIMEOUT',
    httpStatus: null,
  });
  assert(timeout.settled === 'UNKNOWN' && timeout.repeatReason === 'needs_reconciliation', 'timeout exige reconciliação');

  const ambiguousStore = storeForTopografia();
  const ambiguous = await rehearseC6H1IdempotencyInMemory({
    store: ambiguousStore,
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    supabaseUrl: DEVELOP,
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
    amount: 10,
    dueDate: '2026-12-20',
    transport: 'ok',
    httpStatus: 500,
  });
  assert(ambiguous.settled === 'UNKNOWN' && ambiguous.repeatReason === 'needs_reconciliation', 'HTTP 500 não libera a referência');
  const reconciled = await ambiguousStore.reconcile({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    confirmation: C6_B01_RECONCILE_PHRASE,
  });
  const afterReconcile = await ambiguousStore.reserve({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    scenario: 'H1',
    requestFingerprint: fingerprint,
  });
  assert(reconciled.acquired === false && reconciled.reason === 'needs_bank_confirmation', 'a frase não reabre a emissão');
  assert(afterReconcile.reason === 'needs_reconciliation', 'depois da reconciliação a referência continua ocupada');

  const http200 = await rehearseC6H1IdempotencyInMemory({
    store: storeForTopografia(),
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    supabaseUrl: DEVELOP,
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
    amount: 10,
    dueDate: '2026-12-20',
    transport: 'ok',
    httpStatus: 200,
    bankSlipId: 'H1SLIPMOCK',
  });
  assert(http200.settled === 'UNKNOWN', 'HTTP 200 na emissão é resposta ambígua');

  const rejected = await rehearseC6H1IdempotencyInMemory({
    store: storeForTopografia(),
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    supabaseUrl: DEVELOP,
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
    amount: 10,
    dueDate: '2026-12-20',
    transport: 'ok',
    httpStatus: 422,
  });
  assert(rejected.settled === 'FAILED' && rejected.mayRepeat === false, 'rejeição conhecida não emite nesta fase');

  const blockedCompany = storeForTopografia();
  const outsider = await rehearseC6H1IdempotencyInMemory({
    store: blockedCompany,
    companyId: OTHER_COMPANY,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    supabaseUrl: DEVELOP,
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
    amount: 10,
    dueDate: '2026-12-20',
    transport: 'ok',
    httpStatus: 201,
    bankSlipId: 'H1SLIPMOCK',
  });
  assert(outsider.authorizationPassed === false && blockedCompany.snapshot().length === 0, 'empresa estranha não reserva');

  const stale = storeForTopografia();
  const started = new Date('2026-11-21T15:00:00.000Z');
  await stale.reserve({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    scenario: 'H1',
    requestFingerprint: fingerprint,
    now: started,
  });
  const expired = await stale.reserve({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    scenario: 'H1',
    requestFingerprint: fingerprint,
    now: new Date(started.getTime() + 21_000),
  });
  assert(expired.reason === 'needs_reconciliation' && expired.row?.status === 'UNKNOWN', 'reserva sem resposta vira UNKNOWN e não reemite');

  const root = path.resolve(__dirname, '..');
  assert(
    !fs.existsSync(path.join(root, 'supabase', 'migrations', '20261121160000_c6_h1_homolog_idempotency.sql')),
    'a migration conflitante não faz parte do Preview',
  );
  const productionCompany = evaluateC6H1Authorization({
    companyId: C6_H1_PRODUCTION_COMPANY_ID,
    supabaseUrl: DEVELOP,
    environment: 'SANDBOX',
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    operation: 'emit',
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
  });
  assert(productionCompany.company === false, 'a empresa real de Production é recusada');
  const fingerprintForRpc = buildC6HomologRequestFingerprint({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    amount: 10,
    dueDate: '2026-12-20',
    billingScheme: '21',
  });
  const reservedArgs = buildC6H1ReserveRpcArgs({
    companyId: C6_H1_AUTHORIZED_COMPANY_ID,
    integrationId: INTEGRATION,
    externalReferenceId: C6_H1_EXTERNAL_REFERENCE,
    environment: 'SANDBOX',
    supabaseUrl: DEVELOP,
    serverAuthorization: EMIT_SECRET,
    env: serverEnv,
    requestFingerprint: fingerprintForRpc,
  });
  assert(reservedArgs.ok && reservedArgs.dispatched === false && reservedArgs.mayEmit === false, 'a reserva compatível não é enviada');
  if (reservedArgs.ok) {
    assert(
      Object.keys(reservedArgs.args).join(',') === C6_H1_RESERVE_ARG_ORDER.join(','),
      'a assinatura de reserva acompanha a função já instalada',
    );
  }
  const processingArgs = buildC6H1ProcessingRpcArgs(1);
  const completeArgs = buildC6H1CompleteRpcArgs({
    status: 'UNKNOWN',
    attemptCount: 1,
    httpStatus: null,
    errorCode: 'TIMEOUT',
    errorMessage: null,
    bankSlipId: null,
  });
  const reconcileArgs = buildC6H1ReconcileRpcArgs();
  assert(Object.keys(processingArgs.args).join(',') === C6_H1_PROCESSING_ARG_ORDER.join(','), 'assinatura de processamento');
  assert(Object.keys(completeArgs.args).join(',') === C6_H1_COMPLETE_ARG_ORDER.join(','), 'assinatura de conclusão');
  assert(!('p_metadata' in completeArgs.args), 'a conclusão publicada não recebe metadata');
  assert(Object.keys(reconcileArgs.args).join(',') === C6_H1_RECONCILE_ARG_ORDER.join(','), 'assinatura de reconciliação');
  assert(reconcileArgs.mayEmit === false, 'reconciliação não reemite');
  assert(dispatchC6H1IdempotencyRpc().dispatched === false, 'não há envio de RPC');
  for (const historical of C6_H1_PROTECTED_REFERENCES) {
    const blocked = buildC6H1ReserveRpcArgs({
      companyId: C6_H1_AUTHORIZED_COMPANY_ID,
      integrationId: INTEGRATION,
      externalReferenceId: historical,
      environment: 'SANDBOX',
      supabaseUrl: DEVELOP,
      serverAuthorization: EMIT_SECRET,
      env: serverEnv,
      requestFingerprint: fingerprintForRpc,
    });
    assert(blocked.ok === false && blocked.reason === 'protected_reference', 'referência histórica permanece intocada');
  }
  assert(c6H1StatusBlocksAnotherEmission('UNKNOWN').reason === 'needs_reconciliation', 'UNKNOWN não libera nova emissão');
  assert(c6H1StatusBlocksAnotherEmission('PROCESSING').reason === 'in_flight', 'PROCESSING não libera nova emissão');
  assert(c6H1StatusBlocksAnotherEmission('SUCCEEDED').mayEmit === false, 'SUCCEEDED não emite de novo');

  const asaas = fs.readFileSync(path.join(root, 'lib', 'finance', 'asaasCompanyClient.ts'), 'utf8');
  const inter = fs.readFileSync(path.join(root, 'lib', 'banking', 'inter', 'interCobrancaClient.ts'), 'utf8');
  assert(!asaas.includes('c6H1') && !asaas.includes('lib/banking/c6'), 'Asaas permanece sem C6');
  assert(!inter.includes('c6H1') && !inter.includes('lib/banking/c6'), 'Inter permanece sem C6');
  const layout = fs.readFileSync(path.join(root, 'components', 'Layout.tsx'), 'utf8');
  const banks = fs.readFileSync(path.join(root, 'components', 'finance', 'BanksDevelopmentPanel.tsx'), 'utf8');
  assert(!layout.includes('homolog/h1') && !banks.includes('homolog/h1'), 'a ação H1 fica fora do menu');
  const route = fs.readFileSync(path.join(root, 'app', 'api', 'banking', 'c6', 'homolog', 'h1', 'route.ts'), 'utf8');
  const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8');
  assert(middleware.includes("'/api/banking/c6/homolog/h1'"), 'o middleware entrega a rota H1 ao handler desarmado');
  assert(!route.includes('requestC6AccessToken') && !route.includes('executeC6BankSlip'), 'a rota não importa a chamada bancária');
  assert(!route.includes('.rpc(') && !route.includes('authorizeTenantBilling'), 'a rota desarmada não grava nem autentica');

  console.log('C6_H1_HOMOLOG_OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

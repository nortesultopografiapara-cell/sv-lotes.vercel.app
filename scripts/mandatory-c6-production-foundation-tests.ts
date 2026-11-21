/**
 * Fundação C6: Production fechado, sem baixa e sem vazamento.
 * npx tsx scripts/mandatory-c6-production-foundation-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { EMPTY_C6_BANK_CONFIG } from '../lib/banking/c6/c6ConfigTypes';
import { assertC6ConfigResponseSafe } from '../lib/banking/c6/c6ConfigRepository';
import { isC6RemoteOperationBlocked } from '../lib/banking/c6/c6EmitGuard';
import { requestC6AccessToken } from '../lib/banking/c6/c6AuthClient';
import { executeC6BankSlipCreate } from '../lib/banking/c6/c6BoletoClient';
import { assertC6CompanyIsolation, C6BoletoCompanyIsolationError } from '../lib/banking/c6/c6BoletoValidation';
import { buildC6HomologRequestFingerprint, createMemoryC6HomologIdempotencyStore } from '../lib/banking/c6/c6HomologIdempotency';
import { C6EmissionNotHomologatedError } from '../lib/banking/c6/c6EmitGuard';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const creds = {
  companyId: 'empresa-a',
  environment: 'PRODUCTION' as const,
  clientId: 'client-publico',
  clientSecret: 'segredo-que-nao-pode-sair',
  certificatePem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----',
};

async function main() {
let bankCalls = 0;
const blocked = await requestC6AccessToken(creds, {
  allowProduction: true,
  fetchFn: async () => {
    bankCalls += 1;
    return { status: 200, bodyText: '{"access_token":"nao-pode"}' };
  },
});
assert(blocked.ok === false && blocked.code === 'PRODUCTION_AUTH_BLOCKED', 'Production recusa o token');
assert(bankCalls === 0, 'Production não chama o banco');
assert(!JSON.stringify(blocked).includes('segredo-que-nao-pode'), 'a falha não devolve o segredo');
assert(!JSON.stringify(blocked).includes('BEGIN CERTIFICATE'), 'a falha não devolve o certificado');

assert(isC6RemoteOperationBlocked('SANDBOX', 'https://aezktedncttwpqeunjej.supabase.co'), 'host Production bloqueia mesmo com ambiente Sandbox');
assert(isC6RemoteOperationBlocked('SANDBOX', 'https://hoynysmynxncdlptuzub.supabase.co') === false, 'Develop não é o host Production');
assert(isC6RemoteOperationBlocked('PRODUCTION', 'https://hoynysmynxncdlptuzub.supabase.co'), 'ambiente Production permanece fechado');

let emitCalls = 0;
let threw = false;
try {
  await executeC6BankSlipCreate(
    { ...creds, environment: 'SANDBOX' },
    {
      companyId: 'empresa-a',
      environment: 'SANDBOX',
      external_reference_id: 'REF1',
      amount: 10,
      due_date: '2026-12-20',
      payer: {
        name: 'Pagador Teste',
        tax_id: '52998224725',
        address: {
          street: 'Rua A',
          number: 10,
          city: 'Sao Paulo',
          state: 'SP',
          zip_code: '01313000',
        },
      },
    },
    {
      allowSandboxLive: true,
      fetchFn: async () => {
        emitCalls += 1;
        return { status: 201, bodyText: '{}' };
      },
    },
  );
} catch (error) {
  threw = error instanceof C6EmissionNotHomologatedError;
}
assert(threw && emitCalls === 0, 'emissão real continua fechada mesmo com o mock e a flag');

let productionEmit = false;
try {
  await executeC6BankSlipCreate(creds, {
    companyId: 'empresa-a',
    environment: 'PRODUCTION',
    external_reference_id: 'REF1',
    amount: 10,
    due_date: '2026-12-20',
    payer: {
      name: 'Pagador Teste',
      tax_id: '52998224725',
      address: { street: 'Rua A', number: 10, city: 'Sao Paulo', state: 'SP', zip_code: '01313000' },
    },
  });
} catch (error) {
  productionEmit = error instanceof C6EmissionNotHomologatedError;
}
assert(productionEmit, 'emissão em Production é recusada');

assertC6CompanyIsolation('empresa-a', 'empresa-a');
let isolated = false;
try {
  assertC6CompanyIsolation('empresa-a', 'empresa-b');
} catch (error) {
  isolated = error instanceof C6BoletoCompanyIsolationError;
}
assert(isolated, 'uma empresa não usa o contexto de outra');

const store = createMemoryC6HomologIdempotencyStore([
  { companyId: 'empresa-a', integrationId: 'int-a', provider: 'C6', environment: 'SANDBOX' },
]);
const fingerprint = buildC6HomologRequestFingerprint({
  companyId: 'empresa-a',
  integrationId: 'int-a',
  externalReferenceId: 'REF1',
  amount: 10,
  dueDate: '2026-12-20',
  billingScheme: '21',
});
const first = await store.reserve({
  companyId: 'empresa-a',
  integrationId: 'int-a',
  externalReferenceId: 'REF1',
  environment: 'SANDBOX',
  requestFingerprint: fingerprint,
});
const second = await store.reserve({
  companyId: 'empresa-a',
  integrationId: 'int-a',
  externalReferenceId: 'REF1',
  environment: 'SANDBOX',
  requestFingerprint: fingerprint,
});
assert(first.acquired === true && second.acquired === false && second.reason === 'in_flight', 'a segunda reserva não duplica');
const productionReserve = await store.reserve({
  companyId: 'empresa-a',
  integrationId: 'int-a',
  externalReferenceId: 'REF2',
  environment: 'PRODUCTION',
});
assert(productionReserve.acquired === false && productionReserve.reason === 'production_blocked', 'reserva de Production não grava');

const publicConfig = EMPTY_C6_BANK_CONFIG('empresa-a');
assertC6ConfigResponseSafe(publicConfig);
assert(!JSON.stringify(publicConfig).includes('clientSecret'), 'a resposta pública não tem segredo');

const root = path.resolve(__dirname, '..');
const c6Dir = path.join(root, 'lib', 'banking', 'c6');
const sources = fs.readdirSync(c6Dir).filter((name) => name.endsWith('.ts')).map((name) => fs.readFileSync(path.join(c6Dir, name), 'utf8')).join('\n');
assert(!/INSERT\s+INTO\s+public\.finance_receipts/i.test(sources), 'C6 não cria parcela');
assert(!/INSERT\s+INTO\s+public\.cash_movements/i.test(sources), 'C6 não cria caixa');
assert(!sources.includes('execute_authorized_manual_receipt_payment'), 'C6 não quita pelo fluxo de baixa');
const asaas = fs.readFileSync(path.join(root, 'lib', 'finance', 'asaasCompanyClient.ts'), 'utf8');
const inter = fs.readFileSync(path.join(root, 'lib', 'banking', 'inter', 'interCobrancaClient.ts'), 'utf8');
assert(asaas.includes('assertHomologOutboundAllowed') && !asaas.includes('lib/banking/c6'), 'Asaas permanece no fluxo atual');
assert(inter.includes('assertHomologOutboundAllowed') && !inter.includes('lib/banking/c6'), 'Inter permanece no fluxo atual');
assert(!fs.existsSync(path.join(root, 'app', 'api', 'banking', 'c6')), 'nenhuma rota C6 foi publicada nesta fase');

console.log('C6_PRODUCTION_FOUNDATION_OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

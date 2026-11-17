/**
 * npx tsx scripts/mandatory-develop-homolog-guards-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  DEVELOP_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  RETIRED_DEVELOP_PROJECT_REF,
  isDevelopHomologRuntime,
  isProductionSupabaseRuntime,
  resolveSupabaseProjectRef,
  HOMOLOG_OUTBOUND_BLOCKED_MESSAGE,
} from '../lib/homolog/env';

let pass = 0;
let total = 0;
function assert(name: string, ok: boolean) {
  total++;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}`);
  if (ok) pass++;
}

function read(rel: string) {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

const DEVELOP_HOST = `https://${DEVELOP_PROJECT_REF}.supabase.co`;
const PRODUCTION_HOST = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const RETIRED_HOST = `https://${RETIRED_DEVELOP_PROJECT_REF}.supabase.co`;

assert('ref develop constante', DEVELOP_PROJECT_REF === 'hoynysmynxncdlptuzub');
assert('ref production constante', PRODUCTION_PROJECT_REF === 'aezktedncttwpqeunjej');
assert('clone anterior não é o DEVELOP atual', RETIRED_DEVELOP_PROJECT_REF === 'zumwvcxgrpxggyxomzic');
assert('clone anterior ≠ develop atual', RETIRED_DEVELOP_PROJECT_REF !== DEVELOP_PROJECT_REF);
assert(
  'resolve develop host',
  resolveSupabaseProjectRef(DEVELOP_HOST) === DEVELOP_PROJECT_REF,
);
assert(
  'resolve production host',
  resolveSupabaseProjectRef(PRODUCTION_HOST) === PRODUCTION_PROJECT_REF,
);
assert(
  'homolog runtime só develop atual',
  isDevelopHomologRuntime(DEVELOP_HOST) &&
    !isDevelopHomologRuntime(PRODUCTION_HOST) &&
    !isDevelopHomologRuntime(RETIRED_HOST),
);
assert(
  'production runtime só prod',
  isProductionSupabaseRuntime(PRODUCTION_HOST) &&
    !isProductionSupabaseRuntime(DEVELOP_HOST) &&
    !isProductionSupabaseRuntime(RETIRED_HOST),
);

const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_HOST;
assert('env production não é homolog', isDevelopHomologRuntime() === false);
process.env.NEXT_PUBLIC_SUPABASE_URL = DEVELOP_HOST;
assert('env develop atual é homolog', isDevelopHomologRuntime() === true);
process.env.NEXT_PUBLIC_SUPABASE_URL = RETIRED_HOST;
assert('env clone anterior não é homolog', isDevelopHomologRuntime() === false);
if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
else process.env.NEXT_PUBLIC_SUPABASE_URL = prev;

const resend = read('lib/email/resendSend.ts');
if (resend.includes("from '@/lib/homolog/env'")) {
  assert('resend importa homolog', true);
  assert('resend bloqueia homolog', resend.includes('isDevelopHomologRuntime'));
}

const zapi = read('lib/whatsapp/zapiProvider.ts');
if (zapi.includes("from '@/lib/homolog/env'")) {
  assert('zapi importa homolog', true);
  assert('zapi bloqueia homolog', zapi.includes('isDevelopHomologRuntime'));
}

const asaasCompany = read('lib/finance/asaasCompanyClient.ts');
if (asaasCompany.includes('assertHomologOutboundAllowed')) {
  assert('asaas company bloqueia homolog', true);
}

const asaasSaas = read('lib/payments/providers/asaas.ts');
if (asaasSaas.includes('assertHomologOutboundAllowed')) {
  assert('asaas saas bloqueia homolog', true);
}

const inter = read('lib/banking/inter/interOAuthClient.ts');
if (inter.includes('isDevelopHomologRuntime')) {
  assert('inter oauth bloqueia homolog', true);
}

const cobranca = read('lib/banking/inter/interCobrancaClient.ts');
if (cobranca.includes('assertHomologOutboundAllowed')) {
  assert('inter cobranca bloqueia homolog', true);
}

const seed = read('scripts/develop/seed-homolog.ts');
assert(
  'seed exige develop ref',
  seed.includes('DEVELOP_PROJECT_REF') && seed.includes('ABORT: seed somente'),
);
assert('seed não aplica migration nova', !seed.includes('20261008120000_sale_contract_operations'));
assert('mensagem bloqueio definida', HOMOLOG_OUTBOUND_BLOCKED_MESSAGE.includes('homologação'));

const guard = read('scripts/develop/guard.ts');
assert('guard aborta main', guard.includes("branch === 'main'"));
assert('guard aborta production ref', guard.includes('PRODUCTION_PROJECT_REF'));
assert('guard aborta clone anterior', guard.includes('RETIRED_DEVELOP_PROJECT_REF'));
assert('guard bloqueia migration nova', guard.includes('20261008120000_sale_contract_operations.sql'));
assert(
  'host autorizado de escrita é o clone atual',
  guard.includes('DEVELOP_SUPABASE_URL') &&
    read('lib/homolog/env.ts').includes("DEVELOP_PROJECT_REF = 'hoynysmynxncdlptuzub'"),
);

const envSrc = read('lib/homolog/env.ts');
assert(
  'env.ts não autoriza o clone antigo como DEVELOP',
  envSrc.includes("export const DEVELOP_PROJECT_REF = 'hoynysmynxncdlptuzub'") &&
    !envSrc.includes("export const DEVELOP_PROJECT_REF = 'zumwvcxgrpxggyxomzic'"),
);
assert(
  'env.ts mantém Production bloqueada pelo ref conhecido',
  envSrc.includes("PRODUCTION_PROJECT_REF = 'aezktedncttwpqeunjej'"),
);

assert('asaas company bloqueia homolog', asaasCompany.includes('assertHomologOutboundAllowed'));
assert('asaas saas bloqueia homolog', asaasSaas.includes('assertHomologOutboundAllowed'));
assert('inter oauth bloqueia homolog', inter.includes('assertHomologOutboundAllowed'));
assert('inter cobranca bloqueia homolog', cobranca.includes('assertHomologOutboundAllowed'));
assert('zapi bloqueia homolog', zapi.includes('isDevelopHomologRuntime'));
assert('resend bloqueia homolog', resend.includes('isDevelopHomologRuntime'));

async function testDevelopBlocksOutbound(): Promise<void> {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevServer = process.env.SUPABASE_URL;
  const prevFlag = process.env.BANKING_MODULE_ENABLED;
  const prevFetch = globalThis.fetch;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = DEVELOP_HOST;
    delete process.env.SUPABASE_URL;
    process.env.BANKING_MODULE_ENABLED = 'true';
    const { isBankingModuleEnabled } = await import('../lib/banking/config');
    const { asaasCompanyFetch } = await import('../lib/finance/asaasCompanyClient');
    const { sendText } = await import('../lib/whatsapp/zapiProvider');
    assert('flag develop ignora true', isBankingModuleEnabled() === false);
    let called: boolean = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    let blocked = false;
    try {
      await asaasCompanyFetch('test-key', 'SANDBOX', '/payments', { method: 'POST', body: '{}' });
    } catch (err) {
      blocked = err instanceof Error && err.message.includes('homologação');
    }
    assert('asaas company não chama a rede no develop', blocked && called === false);
    const zapiResult = await sendText({ phone: '5599999999999', message: 'teste ficticio' });
    assert('z-api não envia no develop', zapiResult.ok === false && called === false);

    process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_HOST;
    process.env.BANKING_MODULE_ENABLED = 'true';
    assert('flag production continua ligada', isBankingModuleEnabled() === true);
    called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    await asaasCompanyFetch('test-key', 'SANDBOX', '/myAccount');
    assert('asaas company segue liberado fora do develop', called === true);
  } finally {
    globalThis.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevServer === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevServer;
    if (prevFlag === undefined) delete process.env.BANKING_MODULE_ENABLED;
    else process.env.BANKING_MODULE_ENABLED = prevFlag;
  }
}

void testDevelopBlocksOutbound().then(() => {
  console.log(`${pass}/${total} passed`);
  if (pass !== total) process.exit(1);
});

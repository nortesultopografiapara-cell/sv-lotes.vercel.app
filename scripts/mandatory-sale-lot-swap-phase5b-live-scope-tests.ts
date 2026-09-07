/**
 * LIVE scoped da Fase 5B — fail closed, sem HTTP real.
 * npx tsx scripts/mandatory-sale-lot-swap-phase5b-live-scope-tests.ts
 */
import {
  isLotSwapExternalChargesLiveAuthorized,
  resolveLotSwapExternalChargesLiveScope,
  setLotSwapChargesLiveScopeEnvForTests,
} from '../lib/finance/saleLotSwapChargesLiveScope';
import { isLotSwapExternalChargeLiveEnabled } from '../lib/finance/saleLotSwapChargesPhase';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../lib/homolog/env';
import fs from 'node:fs';
import path from 'node:path';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const DEVELOP_URL = `https://${DEVELOP_PROJECT_REF}.supabase.co`;
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

const COMPLETE: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: DEVELOP_URL,
  LOT_SWAP_EXTERNAL_CHARGES_LIVE: 'scoped',
  LOT_SWAP_CHARGES_LIVE_PROVIDERS: 'ASAAS',
  LOT_SWAP_CHARGES_LIVE_COMPANY_IDS: 'co-1',
  LOT_SWAP_CHARGES_LIVE_SALE_IDS: 'sale-1',
  LOT_SWAP_CHARGES_LIVE_SWAP_IDS: 'swap-1',
};

const MATCH = {
  companyId: 'co-1',
  saleId: 'sale-1',
  swapId: 'swap-1',
  provider: 'ASAAS',
};

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  setLotSwapChargesLiveScopeEnvForTests(env);
  try {
    return fn();
  } finally {
    setLotSwapChargesLiveScopeEnvForTests(null);
  }
}

function testProductionAlwaysOff() {
  const result = withEnv(
    { ...COMPLETE, NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL },
    () => resolveLotSwapExternalChargesLiveScope(MATCH),
  );
  assert(result.live === false, 'Production + scoped completo = OFF');
  assert(result.liveScoped === false, 'Production não marca liveScoped');
  assert(result.reason === 'PRODUCTION', 'reason PRODUCTION');
  assert(result.matches.productionRuntime === true, 'productionRuntime');
  console.log('OK testProductionAlwaysOff');
}

function testDevelopGlobalTrueOff() {
  const result = withEnv(
    { ...COMPLETE, LOT_SWAP_EXTERNAL_CHARGES_LIVE: 'true' },
    () => resolveLotSwapExternalChargesLiveScope(MATCH),
  );
  assert(result.live === false, 'DEVELOP + true = OFF');
  assert(result.reason === 'MODE_GLOBAL_TRUE', 'reason MODE_GLOBAL_TRUE');
  assert(isLotSwapExternalChargeLiveEnabled(true) === false, 'override true também OFF');
  console.log('OK testDevelopGlobalTrueOff');
}

function testMissingProviderListOff() {
  const result = withEnv(
    { ...COMPLETE, LOT_SWAP_CHARGES_LIVE_PROVIDERS: '' },
    () => resolveLotSwapExternalChargesLiveScope(MATCH),
  );
  assert(result.live === false, 'provider ausente = OFF');
  assert(result.reason === 'PROVIDERS_EMPTY', 'PROVIDERS_EMPTY');
  console.log('OK testMissingProviderListOff');
}

function testWrongCompanySaleSwapOff() {
  withEnv(COMPLETE, () => {
    assert(
      resolveLotSwapExternalChargesLiveScope({ ...MATCH, companyId: 'co-2' }).live === false,
      'company errada',
    );
    assert(
      resolveLotSwapExternalChargesLiveScope({ ...MATCH, saleId: 'sale-2' }).live === false,
      'sale errada',
    );
    assert(
      resolveLotSwapExternalChargesLiveScope({ ...MATCH, swapId: 'swap-2' }).live === false,
      'swap errado',
    );
  });
  console.log('OK testWrongCompanySaleSwapOff');
}

function testAllMatchLiveTrue() {
  const result = withEnv(COMPLETE, () => resolveLotSwapExternalChargesLiveScope(MATCH));
  assert(result.live === true, 'tudo correto = LIVE');
  assert(result.liveScoped === true, 'liveScoped');
  assert(result.provider === 'ASAAS', 'provider ASAAS');
  assert(result.matches.company && result.matches.sale && result.matches.swap, 'matches');
  console.log('OK testAllMatchLiveTrue');
}

function testAsaasDoesNotEnableInter() {
  const result = withEnv(COMPLETE, () =>
    resolveLotSwapExternalChargesLiveScope({ ...MATCH, provider: 'INTER' }),
  );
  assert(result.live === false, 'ASAAS na allowlist não libera INTER');
  assert(result.reason === 'PROVIDER_NOT_ALLOWED', 'PROVIDER_NOT_ALLOWED');
  const mixed = withEnv(COMPLETE, () =>
    isLotSwapExternalChargesLiveAuthorized({
      ...MATCH,
      providers: ['ASAAS', 'INTER'],
    }),
  );
  assert(mixed.live === false, 'lote misto ASAAS+INTER = OFF');
  console.log('OK testAsaasDoesNotEnableInter');
}

function testTwoTenantsNoCrossover() {
  withEnv(
    { ...COMPLETE, LOT_SWAP_CHARGES_LIVE_COMPANY_IDS: 'co-1' },
    () => {
      assert(resolveLotSwapExternalChargesLiveScope(MATCH).live === true, 'tenant A on');
      assert(
        resolveLotSwapExternalChargesLiveScope({ ...MATCH, companyId: 'co-b' }).live === false,
        'tenant B off',
      );
    },
  );
  console.log('OK testTwoTenantsNoCrossover');
}

function testInvalidAndOptionalSwap() {
  withEnv({ ...COMPLETE, LOT_SWAP_CHARGES_LIVE_COMPANY_IDS: 'true' }, () => {
    assert(resolveLotSwapExternalChargesLiveScope(MATCH).live === false, 'company token inválido');
  });
  withEnv({ ...COMPLETE, LOT_SWAP_CHARGES_LIVE_SWAP_IDS: '' }, () => {
    const result = resolveLotSwapExternalChargesLiveScope(MATCH);
    assert(result.live === true, 'swap lista vazia = opcional, resto bate');
    assert(result.matches.swap === true, 'swap match implícito');
  });
  withEnv(COMPLETE, () => {
    assert(
      resolveLotSwapExternalChargesLiveScope({ ...MATCH, provider: null }).live === false,
      'provider da operação ausente',
    );
  });
  withEnv({ ...COMPLETE, NEXT_PUBLIC_SUPABASE_URL: 'https://unknown.supabase.co' }, () => {
    assert(resolveLotSwapExternalChargesLiveScope(MATCH).live === false, 'ref desconhecido = OFF');
  });
  console.log('OK testInvalidAndOptionalSwap');
}

function testNoHomologIdsInHelper() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'lib/finance/saleLotSwapChargesLiveScope.ts'),
    'utf8',
  );
  assert(!src.includes('14e1b66b'), 'sem swap homolog');
  assert(!src.includes('1ce13cf0'), 'sem sale homolog');
  assert(!src.includes('59d38b25'), 'sem company homolog');
  console.log('OK testNoHomologIdsInHelper');
}

function main() {
  testProductionAlwaysOff();
  testDevelopGlobalTrueOff();
  testMissingProviderListOff();
  testWrongCompanySaleSwapOff();
  testAllMatchLiveTrue();
  testAsaasDoesNotEnableInter();
  testTwoTenantsNoCrossover();
  testInvalidAndOptionalSwap();
  testNoHomologIdsInHelper();
  console.log('OK mandatory-sale-lot-swap-phase5b-live-scope-tests');
}

main();

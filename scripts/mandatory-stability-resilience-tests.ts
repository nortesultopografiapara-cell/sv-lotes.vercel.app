/**
 * Testes obrigatórios — resiliência a falhas de rede/API (contratos, vendas, fetch).
 * npx tsx scripts/mandatory-stability-resilience-tests.ts
 */

import { formatClientFetchError } from '../lib/clientFetchError';
import { fetchJsonWithTimeout } from '../lib/fetchJsonWithTimeout';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testFailedFetchMessage() {
  const msg = formatClientFetchError({ networkMessage: 'TypeError: Failed to fetch' });
  assert(
    msg.includes('Não foi possível conectar ao servidor'),
    'Failed to fetch → mensagem amigável',
  );
  console.log('OK testFailedFetchMessage');
}

function testTimeoutMessage() {
  const msg = formatClientFetchError({ timeout: true });
  assert(msg.includes('demorou para responder'), 'timeout amigável');
  console.log('OK testTimeoutMessage');
}

function testSupabase500Message() {
  const msg = formatClientFetchError({ status: 503 });
  assert(msg.includes('Falha temporária no banco de dados'), '503 amigável');
  console.log('OK testSupabase500Message');
}

async function testFetchJsonTimeoutReleases() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    })) as typeof fetch;

  try {
    const result = await fetchJsonWithTimeout('http://localhost/hang', {}, 50);
    assert(!result.ok, 'fetch timeout falha');
    assert(result.error != null, 'retorna erro');
    assert(!result.error.includes('Failed to fetch'), 'não expõe Failed to fetch');
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log('OK testFetchJsonTimeoutReleases');
}

function testContractsPageUsesTimeoutHelper() {
  const fs = require('node:fs') as typeof import('node:fs');
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  const signature = fs.readFileSync('components/contracts/SaleContractSignatureSection.tsx', 'utf8');
  assert(page.includes('fetchJsonWithTimeout'), 'contratos usa fetchJsonWithTimeout');
  assert(page.includes('CONTRACT_LIST_SELECT'), 'lista enxuta');
  assert(!page.includes('selectedContract, tenantData, receipts'), 'sem loop receipts no preview');
  assert(!page.includes('buildContractViewHtml'), 'preview sem regeneração client-side');
  assert(signature.includes('finally'), 'assinatura libera loading no finally');
  assert(signature.includes('fetchJsonWithTimeout'), 'assinatura com timeout');
  console.log('OK testContractsPageUsesTimeoutHelper');
}

function testGisSaleDoesNotReturnBeforeBlockUpdate() {
  const fs = require('node:fs') as typeof import('node:fs');
  const gis = fs.readFileSync('components/map/GISMap.tsx', 'utf8');
  assert(gis.includes('/api/sales/create'), 'venda GIS via API com timeout');
  assert(gis.includes('formatClientFetchError'), 'venda formata erro de rede');
  console.log('OK testGisSaleDoesNotReturnBeforeBlockUpdate');
}

function testHtmlRouteReturnsJsonOnError() {
  const fs = require('node:fs') as typeof import('node:fs');
  const route = fs.readFileSync('app/api/contracts/[id]/html/route.ts', 'utf8');
  assert(route.includes('success: false') && route.includes('error:'), 'html retorna JSON em erro');
  assert(route.includes('[contracts/html]'), 'logs de timing');
  console.log('OK testHtmlRouteReturnsJsonOnError');
}

async function run() {
  testFailedFetchMessage();
  testTimeoutMessage();
  testSupabase500Message();
  testContractsPageUsesTimeoutHelper();
  testGisSaleDoesNotReturnBeforeBlockUpdate();
  testHtmlRouteReturnsJsonOnError();
  await testFetchJsonTimeoutReleases();
  console.log('OK — mandatory-stability-resilience-tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

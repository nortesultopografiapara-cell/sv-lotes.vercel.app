/**
 * Testes obrigatórios — preview/visualização de contrato (aba Visualização).
 * npx tsx scripts/mandatory-contract-preview-tests.ts
 */

import fs from 'node:fs';
import {
  readStoredContractHtml,
} from '../lib/contractRegeneration';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testReadStoredContractHtml() {
  assert(
    readStoredContractHtml({ generated_html: '<html>ok</html>' }) === '<html>ok</html>',
    'lê generated_html',
  );
  assert(readStoredContractHtml({}) === null, 'sem html retorna null');
  console.log('OK testReadStoredContractHtml');
}

function testHtmlRouteReturnsSavedWithoutRegenerate() {
  const route = fs.readFileSync('app/api/contracts/[id]/html/route.ts', 'utf8');
  assert(route.includes('loadContractHtmlPreviewRow'), 'rota usa load enxuto');
  assert(route.includes('CONTRACT_HTML_PREVIEW_SELECT') || route.includes('generated_html, updated_at'), 'select enxuto');
  assert(route.includes('success: true'), 'rota retorna success');
  assert(route.includes("source: 'saved'"), 'rota retorna html salvo');
  assert(route.includes('forceRefresh'), 'refresh explícito na rota');
  assert(route.includes("mark('load_contract')"), 'log load_contract');
  assert(route.includes("mark('load_data')"), 'log load_data');
  assert(route.includes("mark('generate_html')"), 'log generate_html');
  assert(route.includes("mark('response'"), 'log response');
  assert(
    route.indexOf("source: 'saved'") < route.indexOf('buildContractViewHtmlForContractId'),
    'fast-path salvo antes da regeneração',
  );
  console.log('OK testHtmlRouteReturnsSavedWithoutRegenerate');
}

function testHtmlRouteJsonErrorAndLogging() {
  const route = fs.readFileSync('app/api/contracts/[id]/html/route.ts', 'utf8');
  assert(route.includes('success: false') && route.includes('error:'), 'erro JSON claro');
  assert(route.includes('[contracts/html]'), 'logs com prefixo [contracts/html]');
  console.log('OK testHtmlRouteJsonErrorAndLogging');
}

function testContractsPagePreviewNoLoop() {
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  assert(!page.includes('buildContractViewHtml'), 'sem regeneração client-side no preview');
  assert(!page.includes('tenantData?.id, contractHtmlRetryKey'), 'preview não depende de tenantData');
  assert(!page.includes('selectedContract, tenantData, receipts'), 'sem loop receipts no preview');
  assert(
    page.includes('[selectedContract?.id, contractHtmlRetryKey'),
    'deps estáveis no preview',
  );
  assert(
    !page.includes('Atualizando contrato com dados da empresa'),
    'mensagem antiga de loading removida',
  );
  assert(page.includes('Carregando visualização do contrato'), 'loading claro');
  assert(page.includes('Não foi possível carregar a visualização do contrato'), 'erro amigável');
  assert(page.includes('Baixar PDF'), 'fallback baixar PDF');
  assert(page.includes('Regenerar contrato'), 'fallback regenerar');
  assert(page.includes('setContractViewLoading(false)'), 'loading sempre limpo');
  assert(page.includes('contractViewNeedsRegenerar'), 'banner via resposta da API');
  assert(
    page.includes('Este contrato precisa ser regenerado para atualizar a visualização'),
    'aviso discreto needs_regenerar',
  );
  assert(
    page.includes('contractViewLoading && !resolvedContractHtml'),
    'spinner só sem html',
  );
  console.log('OK testContractsPagePreviewNoLoop');
}

function testRetryRefetchesHtml() {
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  assert(
    page.includes('setContractHtmlRetryKey((k) => k + 1)'),
    'Tentar novamente incrementa retry key',
  );
  assert(page.includes('contractHtmlRetryKey'), 'retry key na deps do fetch');
  console.log('OK testRetryRefetchesHtml');
}

function run() {
  testReadStoredContractHtml();
  testHtmlRouteReturnsSavedWithoutRegenerate();
  testHtmlRouteJsonErrorAndLogging();
  testContractsPagePreviewNoLoop();
  testRetryRefetchesHtml();
  console.log('OK — mandatory-contract-preview-tests passed');
}

run();

/**
 * Testes obrigatórios — preview/visualização de contrato (aba Visualização).
 * npx tsx scripts/mandatory-contract-preview-tests.ts
 */

import fs from 'node:fs';
import {
  readStoredContractHtml,
  CONTRACT_HTML_PREVIEW_SELECT,
} from '../lib/contractRegeneration';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testReadStoredContractHtml() {
  assert(
    readStoredContractHtml({ generated_html: '<html>ok</html>' }) === '<html>ok</html>',
    'lê generated_html',
  );
  assert(
    readStoredContractHtml({ html_content: '<html>legado</html>' }) === '<html>legado</html>',
    'lê html_content legado',
  );
  assert(readStoredContractHtml({}) === null, 'sem html retorna null');
  console.log('OK testReadStoredContractHtml');
}

function testHtmlPreviewSelectFallback() {
  const regen = fs.readFileSync('lib/contractRegeneration.ts', 'utf8');
  assert(
    CONTRACT_HTML_PREVIEW_SELECT.includes('generated_html'),
    'preview select inclui generated_html',
  );
  assert(
    CONTRACT_HTML_PREVIEW_SELECT.includes('html_content'),
    'preview select inclui html_content legado',
  );
  assert(!CONTRACT_HTML_PREVIEW_SELECT.includes('updated_at'), 'preview sem updated_at opcional');
  assert(regen.includes('preview_select_fallback'), 'fallback de colunas no preview');
  assert(regen.includes('persistGeneratedContractHtml'), 'persistência de html exportada');
  console.log('OK testHtmlPreviewSelectFallback');
}

function testHtmlRouteReturnsSavedWithoutRegenerate() {
  const route = fs.readFileSync('app/api/contracts/[id]/html/route.ts', 'utf8');
  assert(route.includes('loadContractHtmlPreviewRow'), 'rota usa load enxuto');
  assert(route.includes('persistGeneratedContractHtml'), 'persiste html após gerar');
  assert(route.includes('success: true'), 'rota retorna success');
  assert(route.includes("source: 'saved'"), 'rota retorna html salvo');
  assert(route.includes('forceRefresh'), 'refresh explícito na rota');
  assert(route.includes("mark('load_contract')"), 'log load_contract');
  assert(route.includes('load_data'), 'log load_data');
  assert(route.includes('generate_html'), 'log generate_html');
  assert(route.includes('save_html'), 'log save_html');
  assert(route.includes("mark('response'"), 'log response');
  assert(
    route.indexOf('if (savedHtml && !forceRefresh)') <
      route.indexOf('await buildContractViewHtmlForContractId'),
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

function testSignatureModalAndEligibility() {
  const saleService = fs.readFileSync('lib/saleContractSignatureService.ts', 'utf8');
  assert(saleService.includes('readStoredContractHtml'), 'assinatura usa readStoredContractHtml');
  assert(saleService.includes('[contracts/signature]'), 'logs de assinatura');

  const section = fs.readFileSync('components/contracts/SaleContractSignatureSection.tsx', 'utf8');
  assert(section.includes('setShareOpen(true)'), 'abre modal após envio');
  assert(section.includes('latest?.signature_url'), 'share modal usa url da assinatura');
  assert(section.includes('finally') && section.includes('setSending(false)'), 'loading de envio liberado');

  const regenRoute = fs.readFileSync('app/api/contracts/[id]/regenerate/route.ts', 'utf8');
  assert(regenRoute.includes('[contracts/regenerate]'), 'logs de regeneração');

  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  assert(page.includes('setRegeneratingContract(false)'), 'loading regenerar liberado');
  assert(page.includes('void reloadContractsList()'), 'reload não bloqueia UI após regenerar');
  console.log('OK testSignatureModalAndEligibility');
}

function run() {
  testReadStoredContractHtml();
  testHtmlPreviewSelectFallback();
  testHtmlRouteReturnsSavedWithoutRegenerate();
  testHtmlRouteJsonErrorAndLogging();
  testContractsPagePreviewNoLoop();
  testRetryRefetchesHtml();
  testSignatureModalAndEligibility();
  console.log('OK — mandatory-contract-preview-tests passed');
}

run();

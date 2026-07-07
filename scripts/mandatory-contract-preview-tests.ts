/**
 * Testes obrigatórios — preview/visualização de contrato (aba Visualização).
 * npx tsx scripts/mandatory-contract-preview-tests.ts
 */

import fs from 'node:fs';
import {
  readStoredContractHtml,
  resolveStoredContractHtmlMeta,
} from '../lib/contractHtmlGlobal';

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
  assert(
    readStoredContractHtml({ contract_html: '<html>legacy</html>' }) === '<html>legacy</html>',
    'lê contract_html legado',
  );
  assert(readStoredContractHtml({}) === null, 'sem html retorna null');
  const meta = resolveStoredContractHtmlMeta({ content: '<p>corpo cláusula promitente</p>' });
  assert(meta.column === 'content', 'meta identifica coluna');
  console.log('OK testReadStoredContractHtml');
}

function testHtmlPreviewSelectFallback() {
  const regen = fs.readFileSync('lib/contractRegeneration.ts', 'utf8');
  const globalLib = fs.readFileSync('lib/contractHtmlGlobal.ts', 'utf8');
  assert(globalLib.includes('loadContractRowForHtmlAccess'), 'load com select(*) global');
  assert(globalLib.includes('CONTRACT_HTML_READ_COLUMNS'), 'colunas de leitura centralizadas');
  assert(regen.includes('loadContractRowForHtmlAccess'), 'preview usa load global');
  assert(regen.includes('persistGeneratedContractHtml'), 'persistência exportada');
  assert(globalLib.includes('shouldLoadProjectBlocksForContract'), 'skip blocks por modelo');
  console.log('OK testHtmlPreviewSelectFallback');
}

function testHtmlRouteReturnsSavedWithoutRegenerate() {
  const route = fs.readFileSync('app/api/contracts/[id]/html/route.ts', 'utf8');
  assert(route.includes('loadContractHtmlPreviewRow'), 'rota usa load enxuto');
  assert(route.includes('persistGeneratedContractHtml'), 'persiste html após gerar');
  assert(route.includes('maxDuration'), 'rota html com maxDuration');
  assert(route.includes('global-preview'), 'logs global-preview');
  assert(route.includes('success: true'), 'rota retorna success');
  assert(route.includes("source: 'saved'"), 'rota retorna html salvo');
  assert(route.includes('forceRefresh'), 'refresh explícito na rota');
  assert(route.includes("'load_contract'"), 'log load_contract');
  assert(route.includes('generate_html_start'), 'log generate_html');
  assert(route.includes("'save_html'"), 'log save_html');
  assert(route.includes("'response'"), 'log response');
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
  assert(route.includes('global-preview'), 'logs com prefixo global-preview');
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
  assert(page.includes('fetchContractHtmlFromApi'), 'PDF busca HTML no backend');
  assert(page.includes('global-pdf'), 'log global-pdf');
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
  assert(saleService.includes('logSignatureFinal'), 'assinatura usa logSignatureFinal');
  assert(saleService.includes('scheduleSignaturePostInsertWork'), 'pós-insert assíncrono');
  assert(saleService.includes('insertSaleSignatureRowWithFallback'), 'insert com fallback');
  assert(saleService.includes('[contracts/signature-final]'), 'logs signature-final');

  const sigRoute = fs.readFileSync('app/api/contracts/[id]/signature/route.ts', 'utf8');
  assert(sigRoute.includes('maxDuration'), 'rota signature com maxDuration');
  assert(sigRoute.includes('loadContractRowForHtmlAccess'), 'rota signature load único');
  assert(sigRoute.includes('logSignatureFinal'), 'logs signature-final na rota');

  const section = fs.readFileSync('components/contracts/SaleContractSignatureSection.tsx', 'utf8');
  assert(section.includes('setShareOpen(true)'), 'abre modal após envio');
  assert(section.includes('buildSignatureApiUrl'), 'tenant query na assinatura');
  assert(section.includes('signature-final'), 'log client signature-final');
  assert(section.includes('latest?.signature_url'), 'share modal usa url da assinatura');
  assert(section.includes('finally') && section.includes('setSending(false)'), 'loading de envio liberado');

  const regenRoute = fs.readFileSync('app/api/contracts/[id]/regenerate/route.ts', 'utf8');
  assert(regenRoute.includes("'global-regenerate'"), 'logs global-regenerate');

  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  assert(page.includes('setRegeneratingContract(false)'), 'loading regenerar liberado');
  assert(page.includes('void reloadContractsList()'), 'reload não bloqueia UI após regenerar');
  console.log('OK testSignatureModalAndEligibility');
}

function testRecantoSignatureEmbedHook() {
  const viewHtml = fs.readFileSync('lib/buildContractViewHtml.ts', 'utf8');
  const regen = fs.readFileSync('lib/contractRegeneration.ts', 'utf8');
  const page = fs.readFileSync('app/contracts/page.tsx', 'utf8');
  const assets = fs.readFileSync('lib/recantoPrimaveraContractAssets.ts', 'utf8');
  assert(assets.includes('embedRecantoContractSignatureInHtml'), 'helper de assinatura');
  assert(viewHtml.includes('embedRecantoContractSignatureInHtml'), 'preview embute assinatura');
  assert(regen.includes('embedRecantoContractSignatureInHtml'), 'regeneração embute assinatura');
  assert(page.includes('embedRecantoContractSignatureInHtml'), 'PDF client embute assinatura');
  assert(page.includes('resolveContractHtml2pdfOptions'), 'PDF Recanto usa pagebreak avoid');
  console.log('OK testRecantoSignatureEmbedHook');
}

function testContractCompanySelectAlignedWithSettings() {
  const viewHtml = fs.readFileSync('lib/buildContractViewHtml.ts', 'utf8');
  const gis = fs.readFileSync('lib/gisSaleCreateService.ts', 'utf8');
  const fields = fs.readFileSync('lib/companyContractFields.ts', 'utf8');
  const settings = fs.readFileSync('lib/companySettingsFields.ts', 'utf8');
  assert(fields.includes('COMPANY_CONTRACT_LOAD_SELECT'), 'select centralizado');
  assert(viewHtml.includes('COMPANY_CONTRACT_LOAD_SELECT'), 'preview usa select centralizado');
  assert(gis.includes('COMPANY_CONTRACT_LOAD_SELECT'), 'GIS usa select centralizado');
  assert(
    !viewHtml.includes('legal_representative_name'),
    'preview não usa coluna legada legal_representative_name',
  );
  assert(settings.includes('legal_representative'), 'settings persiste legal_representative');
  assert(settings.includes('contract_legal_address'), 'settings persiste endereço jurídico');
  assert(settings.includes('signature_url'), 'settings persiste assinatura');
  console.log('OK testContractCompanySelectAlignedWithSettings');
}

function run() {
  testReadStoredContractHtml();
  testHtmlPreviewSelectFallback();
  testRecantoSignatureEmbedHook();
  testContractCompanySelectAlignedWithSettings();
  testHtmlRouteReturnsSavedWithoutRegenerate();
  testHtmlRouteJsonErrorAndLogging();
  testContractsPagePreviewNoLoop();
  testRetryRefetchesHtml();
  testSignatureModalAndEligibility();
  console.log('OK — mandatory-contract-preview-tests passed');
}

run();

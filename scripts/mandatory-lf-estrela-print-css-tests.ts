/**
 * Print GIS do LF ESTRELA: tinta preta, logo central, 10 páginas do gabarito.
 * npx tsx scripts/mandatory-lf-estrela-print-css-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildLfEstrelaCustomHtml } from '../lib/lfEstrelaCustomTemplate';
import { composeLfEstrelaContractHtml } from '../lib/lfEstrelaEmission';
import {
  collectLfEstrelaPrintCssViolations,
  isLfEstrelaCustomHtml,
  LF_ESTRELA_GIS_FINAL_ATTR,
  LF_ESTRELA_GIS_FINAL_PRINT_CSS,
  LF_ESTRELA_GIS_PRINT_STYLE_ID,
  prepareLfEstrelaGisFinalHtml,
  stripLfEstrelaInternalLogos,
} from '../lib/lfEstrelaPrintCss';
import { wrapSaleContractHtmlDocument } from '../lib/saleContractPdf';
import { CUSTOM_CONTRACT_PRINT_EXTRA_CSS } from '../lib/customContractPrint';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function testPrintCssRequiredInk() {
  const violations = collectLfEstrelaPrintCssViolations(LF_ESTRELA_GIS_FINAL_PRINT_CSS);
  assert(violations.length === 0, `CSS GIS inválido: ${violations.join('; ')}`);
  console.log('OK CSS GIS preto / opacity 1 / logo visível / quebras');
}

function testLightCssFails() {
  const bad = `
.sv-lf-estrela[data-sv-lf-estrela-gis-final],
.sv-lf-estrela[data-sv-lf-estrela-gis-final] * {
  color: #f8fafc !important;
  opacity: 0.15 !important;
  -webkit-text-fill-color: transparent !important;
}
`;
  const violations = collectLfEstrelaPrintCssViolations(bad);
  assert(violations.length > 0, 'CSS claro deve falhar');
  console.log('OK detector rejeita tinta clara');
}

function testTemplateKeepsLogoToken() {
  const html = buildLfEstrelaCustomHtml();
  assert(html.includes('{{COMPANY_LOGO_URL}}'), 'template oficial preserva token');
  assert((html.match(/\{\{COMPANY_LOGO_URL\}\}/g) || []).length === 8, 'logo em cada seção estrutural');
  console.log('OK template CUSTOM preserva COMPANY_LOGO_URL');
}

function testGisFinalKeepsLogos() {
  const template = buildLfEstrelaCustomHtml();
  const values: Record<string, string | null> = {
    COMPANY_LOGO_URL: 'https://cdn.example/logo-lf.png',
    CLIENT_NAME: 'SEVERINO',
    CLIENT_CPF: '000.000.000-00',
    CLIENT_RG: '111',
    CLIENT_NATIONALITY: 'Brasileira',
    CLIENT_CIVIL_STATE: 'Solteiro(a)',
    CLIENT_PROFESSION: 'Técnico',
    CLIENT_ADDRESS: 'Rua 1',
    COMPANY_LEGAL_NAME: 'L.F. IMÓVEIS LTDA',
    COMPANY_CNPJ: '00.000.000/0001-00',
    SELLER_2_NAME: 'ANTONIO FERREIRA SILVA',
    SELLER_2_CPF_CNPJ: '000.000.000-00',
    SELLER_2_NATIONALITY: 'Brasileiro',
    SELLER_2_CIVIL_STATE: 'Casado(a)',
    SELLER_2_PROFESSION: 'Empresário',
    SELLER_2_RG: '9988776',
    SELLER_2_ADDRESS: 'Parauapebas/PA',
    PROJECT_NAME: 'CHACREAMENTO ESTRELA DO SUL',
    BLOCK_NAME: '01',
    LOT_NUMBER: '60',
    LOT_AREA: '628,26 m²',
    SALE_VALUE: 'R$ 64,38',
    PAYMENT_TYPE: 'Parcelado',
    CONTRACT_DATE_EXTENSO: 'DOIS DE OUTUBRO DE DOIS MIL E VINTE E SEIS',
  };
  const editor = composeLfEstrelaContractHtml(template, values, {
    mode: 'final',
    sale: { has_spouse: false },
    requireComplete: false,
  });
  assert(editor.html.includes('sv-company-logo'), 'editor/final sem gisChrome mantém logo');
  assert(editor.html.includes('cdn.example/logo-lf.png'), 'preview isolado renderiza logo');

  const gis = composeLfEstrelaContractHtml(template, values, {
    mode: 'final',
    sale: { has_spouse: false },
    requireComplete: false,
    gisChrome: true,
  });
  assert(gis.html.includes(LF_ESTRELA_GIS_FINAL_ATTR), 'emissão GIS marca contexto final');
  assert(gis.html.includes(LF_ESTRELA_GIS_PRINT_STYLE_ID), 'emissão GIS embute CSS de tinta');
  const gisBody = gis.html.replace(/<style[\s\S]*?<\/style>/gi, '');
  assert(gisBody.includes('sv-company-logo'), 'GIS mantém bloco de logo central');
  assert(gis.html.includes('cdn.example/logo-lf.png'), 'GIS renderiza img do template');
  assert(!/visibility:\s*hidden/.test(LF_ESTRELA_GIS_FINAL_PRINT_CSS), 'não usa visibility:hidden');
  assert(!/display:\s*none\s*!important/.test(LF_ESTRELA_GIS_FINAL_PRINT_CSS) || !/sv-company-logo[\s\S]{0,80}display:\s*none/.test(LF_ESTRELA_GIS_FINAL_PRINT_CSS), 'não oculta logo');
  console.log('OK GIS mantém logo central; editor isolado preserva');
}

function testPrepareExistingStoredHtml() {
  const stored = `<div class="sv-lf-estrela">
    <div data-sv-placeholder="COMPANY_LOGO_URL" class="sv-company-logo"><img class="sv-company-logo-img" src="https://x/logo.png" alt="Logo" /></div>
    <p class="sv-lf-body">Cláusula primeira</p>
    <p class="sv-lf-note">nota 7pt</p>
  </div>`;
  assert(isLfEstrelaCustomHtml(stored), 'detecta HTML LF ESTRELA');
  const prepared = prepareLfEstrelaGisFinalHtml(stored);
  const preparedBody = prepared.replace(/<style[\s\S]*?<\/style>/gi, '');
  assert(preparedBody.includes('sv-company-logo'), 'print mantém logo de HTML já persistido');
  assert(prepared.includes('Cláusula primeira'), 'conteúdo jurídico permanece');
  assert(prepared.includes('color: #000 !important'), 'CSS de tinta no HTML preparado');
  const stripped = stripLfEstrelaInternalLogos(stored);
  assert(stripped.includes('logo.png'), 'strip não remove mais o logo do gabarito');
  console.log('OK prepare no contrato já gerado');
}

function testNoSpouseUnchanged() {
  const html = buildLfEstrelaCustomHtml();
  const composed = composeLfEstrelaContractHtml(
    html,
    { SPOUSE_NAME: '', SPOUSE_CPF: '', CLIENT_NATIONALITY: 'Brasileira' },
    { mode: 'final', sale: { has_spouse: false }, requireComplete: false, gisChrome: true },
  );
  assert(!/COMPRADOR 2/i.test(composed.html), 'sem cônjuge não renderiza COMPRADOR 2');
  console.log('OK G sem cônjuge');
}

function testStarSelectorDoesNotSetDisplay() {
  const star = LF_ESTRELA_GIS_FINAL_PRINT_CSS.match(
    /\.sv-lf-estrela\[[^\]]+\]\s*\*\s*\{([^}]+)\}/,
  );
  assert(Boolean(star), 'existe regra *');
  assert(!/\bdisplay\s*:/.test(star![1]), '* não define display');
  console.log('OK condicionais display:none preservados');
}

function testWiring() {
  const sale = read('lib/lfEstrelaSaleContract.ts');
  const emission = read('lib/lfEstrelaEmission.ts');
  const page = read('app/contracts/page.tsx');
  const pagination = read('lib/contractPaginationEngine.ts');
  const pdf = read('lib/contractPdfPostProcess.ts');
  const wrap = read('lib/saleContractPdf.ts');
  const client = read('lib/lfEstrelaPhysicalPdfClient.ts');
  assert(sale.includes('gisChrome: true'), 'venda GIS passa gisChrome');
  assert(emission.includes('prepareLfEstrelaGisFinalHtml'), 'compose GIS prepara print');
  assert(page.includes('prepareLfEstrelaGisFinalHtml'), 'imprimir/PDF Contratos prepara LF');
  assert(pagination.includes('applyLfEstrelaGisPrintToCaptureElement'), 'html2pdf aplica print GIS');
  assert(pdf.includes('backgroundColor: "#ffffff"'), 'html2canvas fundo branco');
  assert(pdf.includes('applyLfEstrelaGisPrintToCaptureElement'), 'onclone aplica tinta/logo');
  assert(wrap.includes('prepareLfEstrelaGisFinalHtml'), 'PDF Chromium também prepara');
  assert(CUSTOM_CONTRACT_PRINT_EXTRA_CSS.includes('color: #000 !important'), 'editor print também preto');
  assert(!CUSTOM_CONTRACT_PRINT_EXTRA_CSS.includes('sv-company-logo'), 'editor print NÃO oculta logo');
  const wrapped = wrapSaleContractHtmlDocument(
    '<div class="sv-lf-estrela"><div class="sv-company-logo">x</div><p>Texto</p></div>',
    'Contrato',
  );
  assert(wrapped.includes('color: #000'), 'documento Chromium preto');
  const wrappedBody = wrapped.replace(/<style[\s\S]*?<\/style>/gi, '');
  assert(wrappedBody.includes('sv-company-logo'), 'wrap GIS mantém logo central');
  assert(page.includes('generateLfEstrelaPhysicalPdfBlob') || page.includes('isLfEstrelaCustomHtml'), 'PDF Contratos detecta LF ESTRELA');
  assert(client.includes('applyLfEstrelaPhysicalChrome'), 'PDF físico LF aplica chrome mínimo');
  assert(!client.includes('applyContractPdfChrome'), 'PDF Contratos não aplica chrome GIS no LF');
  assert(pdf.includes('getLfEstrelaCustomHtml2pdfOptions'), 'opções html2pdf LF 15mm');
  assert(
    wrap.includes('displayHeaderFooter: showChrome') && wrap.includes('skipMeasure'),
    'Chromium LF sem header/footer GIS e sem measure/repaginação',
  );
  console.log('OK wiring GIS/print');
}

function main() {
  testPrintCssRequiredInk();
  testLightCssFails();
  testTemplateKeepsLogoToken();
  testGisFinalKeepsLogos();
  testPrepareExistingStoredHtml();
  testNoSpouseUnchanged();
  testStarSelectorDoesNotSetDisplay();
  testWiring();
  console.log('OK — mandatory-lf-estrela-print-css-tests passed');
}

main();

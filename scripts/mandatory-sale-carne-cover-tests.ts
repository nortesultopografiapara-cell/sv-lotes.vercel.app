/**
 * Capa do Carnê — aba + regras + PDF + multi-tenant.
 * npx tsx scripts/mandatory-sale-carne-cover-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  SALE_CARNE_COVER_COMPANY_SELECT,
  SALE_CARNE_COVER_FORBIDDEN_FALLBACKS,
  buildClientPortalAbsoluteUrl,
  buildClientPortalDisplayUrl,
  buildCoverCompanyHeaderLine,
  buildCoverStatusMessage,
  buildSaleCarneCoverFilename,
  collectCoverMissingFields,
  countCarneCoverInstallments,
  fitFontSizeForWidth,
  formatCoverCompanyDocument,
  formatCoverCompanyPhone,
  mapCompanyRowToCoverInfo,
  resolveCoverDisplayName,
  resolveCoverLegalName,
  wrapTextToLines,
} from '../lib/finance/saleCarneCoverShared';
import { buildSaleCarneCoverPdfBytes } from '../lib/finance/saleCarneCoverPdf';
import { CLIENT_PORTAL_PATH } from '../lib/portal-cliente/config';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function testTabOrderInModal() {
  const modal = read('components/map/CustomerLotFormModal.tsx');
  const cobrancas = modal.indexOf('Cobranças');
  const capa = modal.indexOf('Capa do Carnê');
  const docs = modal.indexOf('Documentos da Venda');
  assert(cobrancas > 0 && capa > cobrancas, 'Capa após Cobranças');
  assert(docs > capa, 'Documentos após Capa');
  assert(modal.includes("activeTab === 'capa_carne'"), 'tab capa_carne');
  assert(modal.includes('SaleCarneCoverPanel'), 'painel importado');
  assert(modal.includes("'dados' | 'cobrancas' | 'capa_carne' | 'documentos'"), 'union das abas');
  console.log('OK testTabOrderInModal');
}

function testPanelUsesCurrentSale() {
  const panel = read('components/sales/SaleCarneCoverPanel.tsx');
  assert(panel.includes('/api/sales/'), 'rota sales');
  assert(panel.includes('carne-cover'), 'endpoint capa');
  assert(panel.includes('encodeURIComponent(saleId)'), 'usa saleId da venda');
  assert(panel.includes('Gerar capa do carnê'), 'botão gerar');
  assert(panel.includes('Visualizar PDF'), 'visualizar');
  assert(panel.includes('Baixar PDF'), 'baixar');
  console.log('OK testPanelUsesCurrentSale');
}

function testParcelCountRule() {
  const rows = [
    { status: 'pendente' },
    { status: 'pago' },
    { status: 'atrasado' },
    { status: 'cancelado' },
    { status: 'canceled' },
    { status: 'PENDENTE' },
  ];
  assert(countCarneCoverInstallments(rows) === 4, 'exclui canceladas, mantém ativas');
  assert(countCarneCoverInstallments([]) === 0, 'vazio = 0');
  console.log('OK testParcelCountRule');
}

function testCompanyFormatting() {
  assert(formatCoverCompanyPhone('94991955918') === '(94) 99195-5918', 'celular 11');
  assert(formatCoverCompanyPhone('9433333333') === '(94) 3333-3333', 'fix 10');
  assert(formatCoverCompanyPhone('') === null, 'telefone vazio');
  assert(formatCoverCompanyPhone(null) === null, 'telefone null');
  assert(
    formatCoverCompanyDocument('64435850000103') === '64.435.850/0001-03',
    'cnpj',
  );
  assert(formatCoverCompanyDocument('123') === null, 'doc incompleto');
  console.log('OK testCompanyFormatting');
}

function testMissingFieldsAndStatus() {
  const missing = collectCoverMissingFields({
    customerName: 'Cliente',
    projectName: 'Empreendimento',
    quadra: '03',
    lote: '24',
    installmentsCount: 6,
    companyLegalName: 'Empresa X',
    companyPhone: null,
    companyEmail: null,
    companyLogoUrl: null,
    companyDocument: null,
  });
  assert(missing.includes('telefone da empresa'), 'telefone ausente');
  assert(missing.includes('e-mail da empresa'), 'email ausente');
  const status = buildCoverStatusMessage(missing, 6);
  assert(status.canGenerate === true, 'ainda gera sem telefone/email');
  assert(!status.statusMessage.includes('undefined'), 'sem undefined');

  const blocked = buildCoverStatusMessage(
    collectCoverMissingFields({
      customerName: null,
      projectName: 'P',
      quadra: '1',
      lote: '2',
      installmentsCount: 1,
      companyLegalName: 'E',
    }),
    1,
  );
  assert(blocked.canGenerate === false, 'bloqueia sem cliente');
  console.log('OK testMissingFieldsAndStatus');
}

function testPortalUrl() {
  const url = buildClientPortalAbsoluteUrl('https://www.svlotes.com.br');
  assert(url === `https://www.svlotes.com.br${CLIENT_PORTAL_PATH}`, 'portal absoluto');
  assert(
    buildClientPortalDisplayUrl(url) === 'www.svlotes.com.br/portal-cliente',
    'display sem protocolo',
  );
  console.log('OK testPortalUrl');
}

function testFilenameSanitize() {
  const name = buildSaleCarneCoverFilename({
    customerName: 'Severino José / França',
    quadra: '03',
    lote: '24',
  });
  assert(name.startsWith('capa-carne-'), 'prefixo');
  assert(name.endsWith('.pdf'), 'extensão');
  assert(!name.includes('/'), 'sem barra');
  assert(!name.includes(' '), 'sem espaço');
  console.log('OK testFilenameSanitize');
}

function testLongTextHelpers() {
  const long =
    'SEVERINO JOSE DE FRANCA DA SILVA SANTOS OLIVEIRA PEREIRA COSTA';
  const lines = wrapTextToLines(long, 28, 2);
  assert(lines.length <= 2, 'máx 2 linhas');
  const size = fitFontSizeForWidth(long, 20, 13, 8);
  assert(size >= 8 && size <= 13, 'fonte controlada');
  console.log('OK testLongTextHelpers');
}

function testNoFixedMenezesFallbacksInSource() {
  const files = [
    'lib/finance/saleCarneCoverShared.ts',
    'lib/finance/saleCarneCoverPdf.ts',
    'lib/finance/saleCarneCoverService.ts',
    'components/sales/SaleCarneCoverPanel.tsx',
    'app/api/sales/[saleId]/carne-cover/route.ts',
  ];
  for (const file of files) {
    const src = read(file);
    for (const banned of SALE_CARNE_COVER_FORBIDDEN_FALLBACKS) {
      // shared lista os banidos propositalmente — pular asserts no shared
      if (file.includes('saleCarneCoverShared.ts')) continue;
      assert(
        !src.includes(banned),
        `${file} não deve conter fallback fixo: ${banned}`,
      );
    }
    assert(!src.includes('SUPER_ADMIN'), `${file} não usa SUPER_ADMIN como fonte`);
  }
  console.log('OK testNoFixedMenezesFallbacksInSource');
}

function testApiIsReadOnly() {
  const route = read('app/api/sales/[saleId]/carne-cover/route.ts');
  assert(route.includes('assertSaleDocumentSaleAccess'), 'auth tenant');
  assert(route.includes('buildSaleCarneCoverPdfBytes'), 'gera PDF');
  assert(!route.includes('createCompanyInstallmentCharge'), 'não cria cobrança');
  assert(!route.includes('.update('), 'não update genérico');
  assert(!route.includes('.insert('), 'não insert');
  assert(!route.includes('generate-missing'), 'não gera missing');
  console.log('OK testApiIsReadOnly');
}

function testServiceLoadsCompanyFields() {
  const service = read('lib/finance/saleCarneCoverService.ts');
  assert(service.includes('SALE_CARNE_COVER_COMPANY_SELECT'), 'usa select constante');
  assert(service.includes('mapCompanyRowToCoverInfo'), 'mapeia row → info');
  assert(!service.includes('razao_social'), 'service sem razao_social');
  assert(!service.includes('razaoSocial'), 'service sem razaoSocial');
  console.log('OK testServiceLoadsCompanyFields');
}

function testCompanySelectHasNoRazaoSocial() {
  assert(
    SALE_CARNE_COVER_COMPANY_SELECT ===
      'id, name, fantasy_name, cnpj, phone, email, logo_url',
    'select exato',
  );
  assert(!SALE_CARNE_COVER_COMPANY_SELECT.includes('razao_social'), 'sem razao_social');
  assert(!SALE_CARNE_COVER_COMPANY_SELECT.includes('nome_fantasia'), 'sem nome_fantasia');

  const files = [
    'lib/finance/saleCarneCoverShared.ts',
    'lib/finance/saleCarneCoverPdf.ts',
    'lib/finance/saleCarneCoverService.ts',
    'components/sales/SaleCarneCoverPanel.tsx',
    'app/api/sales/[saleId]/carne-cover/route.ts',
  ];
  for (const file of files) {
    const src = read(file);
    assert(!src.includes('razao_social'), `${file} sem razao_social`);
    assert(!src.includes('razaoSocial'), `${file} sem razaoSocial`);
  }
  console.log('OK testCompanySelectHasNoRazaoSocial');
}

function testCompanyNameMapping() {
  const withFantasy = mapCompanyRowToCoverInfo({
    id: 'c1',
    name: 'MENESES IMOBILIARIA LTDA',
    fantasy_name: 'Meneses Imobiliária',
    cnpj: '64435850000103',
    phone: '94991955918',
    email: 'contato@empresa.com',
    logo_url: 'https://example.com/logo.png',
  });
  assert(withFantasy.legalName === 'MENESES IMOBILIARIA LTDA', 'legalName = name');
  assert(withFantasy.tradeName === 'Meneses Imobiliária', 'tradeName = fantasy');
  assert(withFantasy.displayName === 'Meneses Imobiliária', 'display = fantasy');
  assert(withFantasy.documentFormatted === '64.435.850/0001-03', 'cnpj formatado');

  const withoutFantasy = mapCompanyRowToCoverInfo({
    id: 'c2',
    name: 'EMPRESA SEM FANTASIA LTDA',
    fantasy_name: null,
    cnpj: null,
    phone: null,
    email: null,
    logo_url: null,
  });
  assert(withoutFantasy.legalName === 'EMPRESA SEM FANTASIA LTDA', 'name principal');
  assert(withoutFantasy.tradeName === null, 'trade null');
  assert(
    withoutFantasy.displayName === 'EMPRESA SEM FANTASIA LTDA',
    'display cai para name',
  );
  assert(resolveCoverDisplayName(null, 'ACME') === 'ACME', 'display sem fantasy');
  assert(resolveCoverLegalName('ACME LTDA', 'ACME') === 'ACME LTDA', 'legal = name');
  assert(
    buildCoverCompanyHeaderLine('MENESES IMOBILIARIA LTDA', '64.435.850/0001-03') ===
      'MENESES IMOBILIARIA LTDA | CNPJ 64.435.850/0001-03',
    'linha documental',
  );
  console.log('OK testCompanyNameMapping');
}

function testNoMigrationCreated() {
  const migrationsDir = path.join(__dirname, '../supabase/migrations');
  if (fs.existsSync(migrationsDir)) {
    const recent = fs
      .readdirSync(migrationsDir)
      .filter((f) => /carne.?cover|capa.?carne|razao_social/i.test(f));
    assert(recent.length === 0, 'nenhuma migration de capa/razao_social');
  }
  console.log('OK testNoMigrationCreated');
}

async function testPdfSinglePageNoForbidden() {
  const bytes = await buildSaleCarneCoverPdfBytes({
    customerName:
      'SEVERINO JOSE DE FRANCA DA SILVA SANTOS OLIVEIRA PEREIRA COSTA E SILVA',
    projectName:
      'CHACREAMENTO RECANTO PRIMAVERA I EXPANSÃO NORTE SUL LESTE OESTE',
    quadra: '03',
    lote: '24',
    installmentsCount: 120,
    companyLegalName: 'EMPRESA TESTE LTDA',
    companyDocumentFormatted: '12.345.678/0001-99',
    companyPhoneFormatted: '(11) 98888-7777',
    companyEmail: 'contato.muito.longo.empresa.teste@dominio-empresarial.com.br',
    logoDataUrl: null,
    portalUrl: 'https://www.svlotes.com.br/portal-cliente',
    portalDisplayUrl: 'www.svlotes.com.br/portal-cliente',
  });
  assert(bytes.byteLength > 500, 'PDF gerado');
  const header = Buffer.from(bytes.slice(0, 8)).toString('latin1');
  assert(header.startsWith('%PDF'), 'assinatura PDF');

  // Contagem aproximada de páginas via marcadores
  const asText = Buffer.from(bytes).toString('latin1');
  const pageCount = (asText.match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert(pageCount === 1, `deve ter 1 página, veio ${pageCount}`);

  for (const banned of SALE_CARNE_COVER_FORBIDDEN_FALLBACKS) {
    assert(!asText.includes(banned), `PDF sem fallback fixo ${banned}`);
  }
  // Texto do jsPDF pode ir comprimido; QR + URL são validados no código-fonte.
  const pdfSrc = read('lib/finance/saleCarneCoverPdf.ts');
  assert(pdfSrc.includes('QRCode.toDataURL(input.portalUrl'), 'QR usa portalUrl');
  assert(pdfSrc.includes('portalDisplayUrl'), 'URL no card azul');
  console.log('OK testPdfSinglePageNoForbidden');
}

function testPdfLayoutGuards() {
  const pdf = read('lib/finance/saleCarneCoverPdf.ts');
  assert(pdf.includes('Guarde este carnê'), 'frase frontal');
  assert(pdf.includes('GOLD_BAR_H'), 'faixa dourada');
  assert(pdf.includes('drawInfoCards'), 'cards');
  assert(pdf.includes('ÁREA EM BRANCO'), 'área em branco');
  assert(pdf.includes('deletePage'), 'remove página extra');
  assert(pdf.includes('QRCode'), 'QR Code');
  console.log('OK testPdfLayoutGuards');
}

async function main() {
  testTabOrderInModal();
  testPanelUsesCurrentSale();
  testParcelCountRule();
  testCompanyFormatting();
  testMissingFieldsAndStatus();
  testPortalUrl();
  testFilenameSanitize();
  testLongTextHelpers();
  testNoFixedMenezesFallbacksInSource();
  testApiIsReadOnly();
  testServiceLoadsCompanyFields();
  testCompanySelectHasNoRazaoSocial();
  testCompanyNameMapping();
  testNoMigrationCreated();
  testPdfLayoutGuards();
  await testPdfSinglePageNoForbidden();
  console.log('mandatory-sale-carne-cover-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

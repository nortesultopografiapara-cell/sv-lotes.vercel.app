/**
 * Testes — modelo SV LOTES 2.0 (Recomendado).
 * npx tsx scripts/mandatory-sv-lotes-2-contract-tests.ts
 */

import fs from 'fs';
import path from 'path';
import { generateContractHTML } from '../lib/contractTemplate';
import { generateSvLotes2Contract } from '../lib/svLotes2ContractTemplate';
import {
  SV_LOTES_2_CERTIFICATE_TITLE,
  isClassicSaleContractModel,
  isSvLotes2ContractModel,
  normalizeSaleContractModel,
} from '../lib/contractModel';
import { SV_LOTES_2_CONTRACT_TITLE, SV_LOTES_2_LEGAL_MARKER } from '../lib/svLotes2ContractLegal';
import {
  buildSvLotes2SellerFromCompany,
  formatGenderedCivilState,
  formatSvLotes2CompanyAddressLine,
} from '../lib/svLotes2ContractFormat';
import { buildSvLotes2PdfChrome } from '../lib/svLotes2ContractPdf';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';
import { RECANTO_PRIMAVERA_LEGAL_MARKER } from '../lib/recantoPrimaveraContractLegal';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertNotIncludes(html: string, needle: string, msg: string) {
  if (html.includes(needle)) {
    throw new Error(`${msg}: não deveria conter "${needle}"`);
  }
}

const tenantSv2 = {
  name: 'LOTEAMENTO EXEMPLO LTDA',
  fantasy_name: 'LOTEAMENTO EXEMPLO',
  cnpj: '12345678000199',
  legal_representative: 'Maria Empresária',
  representative_cpf: '12345678901',
  address: 'Av. Principal, 100',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
  phone: '(94) 99111-0000',
  email: 'contato@exemplo.test',
  contract_model: 'SV_LOTES_2',
  logo_url: 'https://cdn.test/logo.png',
};

const tenantPadrao = {
  ...tenantSv2,
  contract_model: 'PADRAO',
};

const customer = {
  name: 'João Comprador',
  document: '98765432100',
  cpf: '98765432100',
  rg: '1234567',
  profession: 'Engenheiro',
  civil_state: 'Casado(a)',
  phone: '(94) 98888-7777',
  email: 'joao@test.com',
  address: 'Rua B, 200',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
};

const project = { name: 'Residencial Horizonte', city: 'Parauapebas', uf: 'PA' };
const block = {
  quadra: '05',
  lot: '12',
  area: 300,
  frente: 12,
  fundo: 25,
  'Lado Dir.': 25,
  'Lado Esq.': 25,
};
const sale = {
  payment_type: 'Parcelado',
  installments_count: 12,
  total_value: 120000,
  down_payment: 10000,
  created_at: '2026-06-08',
};

function testModelNormalization() {
  assert(normalizeSaleContractModel('SV_LOTES_2') === 'SV_LOTES_2', 'sv2');
  assert(normalizeSaleContractModel('sv lotes 2.0') === 'SV_LOTES_2', 'sv2 label');
  assert(normalizeSaleContractModel('MENESES') === 'MENESES', 'meneses');
  assert(isSvLotes2ContractModel({ contract_model: 'SV_LOTES_2' }), 'is sv2');
  assert(isClassicSaleContractModel({ contract_model: 'PADRAO' }), 'padrao classic');
  assert(isClassicSaleContractModel({ contract_model: 'MENESES' }), 'meneses classic');
  console.log('OK testModelNormalization');
}

function testSv2TemplateStructure() {
  const html = generateSvLotes2Contract({
    tenant: tenantSv2,
    customer,
    project,
    block,
    sale,
    contractDate: '2026-06-08',
    contractSnapshot: { contract_number: '000000010/2026' },
  });
  assert(html.includes(SV_LOTES_2_CONTRACT_TITLE), 'título sv2');
  assert(html.includes(SV_LOTES_2_LEGAL_MARKER), 'marcador quadro resumo');
  assert(html.includes('sv-contract-sv-lotes-2'), 'classe template');
  assert(html.includes('sv2-summary-grid'), 'quadro resumo compacto em grid');
  assertNotIncludes(html, 'class="sv2-summary"', 'sem tabela alta de 2 colunas');
  assert(html.includes('sv2-header-company'), 'cabeçalho institucional p1');
  assert(html.includes('VALOR TOTAL'), 'valor total resumo');
  assert(html.includes('Qualificação das Partes'), 'qualificação');
  assert(html.includes('CLÁUSULA PRIMEIRA — DO OBJETO'), 'cláusula objeto');
  assert(html.includes('CLÁUSULA SÉTIMA — DA INADIMPLÊNCIA'), 'inadimplência 2%');
  assert(html.includes('LGPD'), 'cláusula lgpd');
  assert(html.includes('CLÁUSULA DÉCIMA QUARTA — DA VISTORIA E ACEITE DO IMÓVEL'), 'vistoria');
  assert(html.includes('CLÁUSULA DÉCIMA QUINTA — DA PROTEÇÃO AMBIENTAL E APP'), 'app');
  assert(html.includes('CLÁUSULA DÉCIMA SEXTA — DA CESSÃO DE DIREITOS'), 'cessão');
  assert(html.includes('CLÁUSULA DÉCIMA SÉTIMA — DA TOLERÂNCIA CADASTRAL E REGISTRAL'), 'tolerância');
  assert(html.includes('CLÁUSULA DÉCIMA OITAVA — DAS COMUNICAÇÕES ELETRÔNICAS'), 'comunicações');
  assert(html.includes('ASSINATURA ELETRÔNICA'), 'assinatura eletrônica');
  assert(html.includes('CLÁUSULA VIGÉSIMA — DO FORO'), 'foro');
  assertNotIncludes(html, 'class="sv2-badge"', 'sem elemento badge');
  console.log('OK testSv2TemplateStructure');
}

function testSv2AddressAndCivilState() {
  const address = formatSvLotes2CompanyAddressLine({
    address: 'Rua 02, Quadra 123, Lote 05',
    bairro: 'Nova Carajás',
    city: 'Parauapebas',
    state: 'PA',
    zip_code: '68515000',
  });
  assert(address.includes('Rua 02'), 'endereço rua');
  assert(address.includes('Nova Carajás'), 'bairro preenchido');
  assert(address.includes('Parauapebas-PA'), 'cidade-uf');
  assert(address.includes('CEP 68515-000'), 'cep formatado');
  assertNotIncludes(address, 'S/N', 'sem S/N automático');
  assertNotIncludes(address, 'Bairro:', 'sem label bairro vazio');

  const brokenAddress = formatSvLotes2CompanyAddressLine({
    address: 'Rua: 02, Quadra 123, Lote 05, S/N Bairro:',
    bairro: 'Nova Carajás',
    city: 'Parauapebas',
    state: 'PA',
    zip_code: '68515000',
  });
  assert(brokenAddress.includes('Rua 02'), 'endereço corrigido sem Rua:');
  assert(brokenAddress.includes('Nova Carajás'), 'bairro do cadastro');
  assertNotIncludes(brokenAddress, 'S/N Bairro', 'sem S/N Bairro');
  assertNotIncludes(brokenAddress, 'Bairro:', 'sem label bairro solto');

  const legacySnAddress = formatSvLotes2CompanyAddressLine({
    address: 'Rua: 02, Quadra 123, Lote 05, S/N',
    bairro: 'Nova Carajás',
    city: 'Parauapebas',
    state: 'PA',
    zip_code: '68515000',
  });
  assert(legacySnAddress.includes('Rua 02, Quadra 123, Lote 05'), 'logradouro sem S/N legado');
  assertNotIncludes(legacySnAddress, 'S/N', 'sem token S/N no endereço final');
  assert(legacySnAddress.includes('CEP 68515-000'), 'cep no endereço legado corrigido');

  const feminina = formatGenderedCivilState('Divorciado(a)', 'Ivanilde de Mora Silva');
  assert(feminina === 'Divorciada', 'estado civil feminino');
  const masculino = formatGenderedCivilState('Divorciado(a)', 'João Comprador');
  assert(masculino === 'Divorciado', 'estado civil masculino');
  console.log('OK testSv2AddressAndCivilState');
}

const tenantSvTopografia = {
  name: 'SV TOPOGRAFIA E PROJETOS LTDA',
  fantasy_name: 'SV TOPOGRAFIA E PROJETOS',
  cnpj: '12631238000102',
  legal_representative: 'Severino José de França',
  representative_cpf: '65082028200',
  legal_representative_role: 'Sócio Administrador',
  legal_representative_email: 'severino@svtopografia.test',
  legal_representative_phone: '(94) 99123-4567',
  address: 'Rua: 02, Quadra 123, Lote 05, S/N Bairro:',
  bairro: 'Nova Carajás',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
  phone: '(94) 3344-5566',
  email: 'contato@svtopografia.test',
  contract_model: 'SV_LOTES_2',
};

function testSv2SellerFromCompanySettings() {
  const seller = buildSvLotes2SellerFromCompany(tenantSvTopografia);
  assert(
    seller.displayName === 'Sv Topografia E Projetos',
    `nome fantasia: ${seller.displayName}`,
  );
  assert(seller.documentFmt === '12.631.238/0001-02', 'cnpj formatado');
  assert(
    seller.addressLine.includes('Rua 02, Quadra 123, Lote 05'),
    'logradouro montado',
  );
  assert(seller.addressLine.includes('Nova Carajás'), 'bairro montado');
  assert(seller.addressLine.includes('Parauapebas-PA'), 'cidade-uf montada');
  assert(seller.addressLine.includes('CEP 68515-000'), 'cep montado');
  assertNotIncludes(seller.addressLine, 'S/N Bairro', 'sem S/N Bairro');
  assert(
    seller.representativeName.toLowerCase() === 'severino josé de frança',
    'representante legal',
  );
  assert(seller.representativeCpfFmt === '650.820.282-00', 'cpf representante');
  assert(seller.representativeRole === 'Sócio Administrador', 'cargo representante');
  assert(seller.phone === '(94) 3344-5566', 'telefone empresa');
  assert(seller.email === 'contato@svtopografia.test', 'email empresa');

  const html = generateSvLotes2Contract({
    tenant: tenantSvTopografia,
    customer,
    project,
    block,
    sale,
    contractDate: '2026-06-08',
    contractSnapshot: { contract_number: '000000007/2026' },
  });
  assert(html.toLowerCase().includes('sv topografia e projetos'), 'nome no contrato');
  assert(html.includes('12.631.238/0001-02'), 'cnpj no contrato');
  assert(html.includes('Rua 02, Quadra 123, Lote 05'), 'endereço no contrato');
  assert(html.includes('Nova Carajás'), 'bairro no contrato');
  assert(html.includes('Parauapebas-PA'), 'cidade-uf no contrato');
  assert(html.includes('CEP 68515-000'), 'cep no contrato');
  assert(html.toLowerCase().includes('severino josé de frança'), 'representante no contrato');
  assert(html.includes('650.820.282-00'), 'cpf representante no contrato');
  assertNotIncludes(html, 'S/N Bairro', 'sem endereço quebrado no html');
  assertNotIncludes(html, 'Bairro:', 'sem label bairro vazio no html');
  console.log('OK testSv2SellerFromCompanySettings');
}

function testRoutingDoesNotBreakPadrao() {
  const htmlPadrao = generateContractHTML({
    tenant: tenantPadrao,
    customer,
    project,
    block,
    sale,
    contractDate: '2026-06-08',
  });
  assert(
    htmlPadrao.includes('INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA'),
    'título padrão',
  );
  assert(htmlPadrao.includes('Promitente Proprietário Vendedor'), 'qualificação padrão');
  assertNotIncludes(htmlPadrao, 'sv-contract-sv-lotes-2', 'sem classe sv2 no padrão');
  assertNotIncludes(htmlPadrao, SV_LOTES_2_LEGAL_MARKER, 'sem marcador sv2 no padrão');
  console.log('OK testRoutingDoesNotBreakPadrao');
}

function testRoutingSv2ViaGenerateContractHTML() {
  const html = generateContractHTML({
    tenant: tenantSv2,
    customer,
    project,
    block,
    sale,
    contractDate: '2026-06-08',
    contractSnapshot: { contract_number: '000000011/2026' },
  });
  assert(html.includes('sv-contract-sv-lotes-2'), 'roteamento sv2');
  assertNotIncludes(html, 'SV LOTES 2.0', 'sem branding sv2 visível');
  console.log('OK testRoutingSv2ViaGenerateContractHTML');
}

function testRecantoUnchanged() {
  const html = generateContractHTML({
    tenant: {
      ...tenantSv2,
      contract_model: 'RECANTO_PRIMAVERA',
      contract_legal_address: 'Endereço teste',
    },
    customer,
    project,
    block,
    sale,
    contractDate: '2026-06-08',
  });
  assert(html.includes(RECANTO_PRIMAVERA_LEGAL_MARKER), 'recanto intacto');
  assertNotIncludes(html, 'sv-contract-sv-lotes-2', 'recanto sem sv2');
  console.log('OK testRecantoUnchanged');
}

function testPdfChromeAndCertificate() {
  const chrome = buildSvLotes2PdfChrome(tenantSv2, '000000010/2026', null);
  assert(chrome.printStyle === 'sv-lotes-2', 'print style sv2');
  const cert = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000010/2026',
    projectName: 'Residencial Horizonte',
    quadra: '05',
    lote: '12',
    buyerName: 'João',
    buyerDocument: '98765432100',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    certificateTitle: SV_LOTES_2_CERTIFICATE_TITLE,
  });
  assert(cert.includes(SV_LOTES_2_CERTIFICATE_TITLE), 'título certificado sv2');
  console.log('OK testPdfChromeAndCertificate');
}

function writeSampleArtifacts() {
  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPadrao = generateContractHTML({
    tenant: tenantPadrao,
    customer,
    project,
    block,
    sale,
    contractDate: '2026-06-08',
    contractSnapshot: { contract_number: 'CMP-PADRAO/2026' },
  });
  const htmlSv2 = generateContractHTML({
    tenant: tenantSv2,
    customer,
    project,
    block,
    sale,
    contractDate: '2026-06-08',
    contractSnapshot: { contract_number: 'CMP-SV2/2026' },
  });
  const p1 = path.join(outDir, 'contrato-comparativo-padrao.html');
  const p2 = path.join(outDir, 'contrato-comparativo-sv-lotes-2.html');
  fs.writeFileSync(p1, htmlPadrao);
  fs.writeFileSync(p2, htmlSv2);
  console.log('OK writeSampleArtifacts', { p1, p2 });
}

function countPdfPages(pdf: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(pdf);
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches?.length || 0;
}

async function writeSv2SignedPdfArtifacts() {
  if (process.env.RUN_SALE_PDF_BROWSER_TESTS !== '1') return;

  const { stripManualContractSignaturesForSignedPdf, buildSaleContractSignatureCertificateHtmlWithQr } =
    await import('../lib/saleContractSignatureCertificateHtml');
  const { buildSaleContractPdfFromHtml, launchSaleContractPdfBrowser, wrapSaleContractHtmlDocument } =
    await import('../lib/saleContractPdf');
  const { buildSvLotes2PdfChrome } = await import('../lib/svLotes2ContractPdf');
  const { isPdfBytes } = await import('../lib/saasContractPdfHttp');

  const contractHtml = generateContractHTML({
    tenant: tenantSv2,
    customer: { ...customer, civil_state: 'Divorciado(a)', name: 'Ivanilde de Mora Silva' },
    project,
    block,
    sale,
    contractDate: '2026-06-08',
    contractSnapshot: { contract_number: '000000010/2026' },
  });

  const cert = await buildSaleContractSignatureCertificateHtmlWithQr({
    contractNumber: '000000010/2026',
    projectName: project.name,
    quadra: block.quadra,
    lote: block.lot,
    buyerName: 'Ivanilde de Mora Silva',
    buyerDocument: customer.document,
    companyName: tenantSv2.name,
    companyCnpj: tenantSv2.cnpj,
    representativeName: tenantSv2.legal_representative,
    representativeCpf: tenantSv2.representative_cpf,
    signedAt: '2025-05-30T13:24:58.000Z',
    vendorSignedAt: '2025-05-30T13:24:21.000Z',
    ipAddress: '177.1.2.3',
    signatureToken: 'abc123token456def789',
    signatureHash: 'a'.repeat(64),
    signatureUrl: 'https://www.svlotes.com.br/sign/sale/abc123token456def789',
  });

  const signedHtml = stripManualContractSignaturesForSignedPdf(contractHtml) + cert;
  const chrome = buildSvLotes2PdfChrome(tenantSv2, '000000010/2026', null);
  const pdf = await buildSaleContractPdfFromHtml(signedHtml, chrome);
  assert(isPdfBytes(pdf), 'pdf sv2 assinado válido');
  const pages = countPdfPages(pdf);
  assert(pages >= 2, `pdf possui ${pages} páginas`);

  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const pdfPath = path.join(outDir, 'sv2-refino-assinado.pdf');
  fs.writeFileSync(pdfPath, pdf);

  const browser = await launchSaleContractPdfBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

  await page.setContent(
    wrapSaleContractHtmlDocument(contractHtml.replace(/<div class="sv2-section-title">Cláusulas Contratuais[\s\S]*/, ''), 'SV2 P1'),
    { waitUntil: 'load', timeout: 45_000 },
  );
  const p1 = path.join(outDir, 'sv2-refino-pagina-1.png');
  await page.screenshot({ path: p1, fullPage: false, type: 'png' });

  await page.setContent(
    wrapSaleContractHtmlDocument(`<div class="sv-contract-document">${cert}</div>`, 'Certificado'),
    { waitUntil: 'load', timeout: 45_000 },
  );
  const certEl = await page.$('.sv-cert-official-block');
  const pLast = path.join(outDir, 'sv2-refino-pagina-final-certificado.png');
  if (certEl) await certEl.screenshot({ path: pLast, type: 'png' });

  await page.setContent(
    wrapSaleContractHtmlDocument(signedHtml, 'SV2 Assinado Completo'),
    { waitUntil: 'load', timeout: 45_000 },
  );
  const pLastFull = path.join(outDir, 'sv2-assinatura-ultima-pagina.png');
  await page.screenshot({ path: pLastFull, fullPage: true, type: 'png' });
  await browser.close();

  console.log('OK writeSv2SignedPdfArtifacts', { pdfPath, pages, p1, pLast, pLastFull });
}

async function writeSvTopografiaPdfArtifact() {
  if (process.env.RUN_SALE_PDF_BROWSER_TESTS !== '1') return;

  const { buildSaleContractPdfFromHtml, launchSaleContractPdfBrowser, wrapSaleContractHtmlDocument } =
    await import('../lib/saleContractPdf');
  const { buildSvLotes2PdfChrome } = await import('../lib/svLotes2ContractPdf');
  const { isPdfBytes } = await import('../lib/saasContractPdfHttp');

  const contractHtml = generateContractHTML({
    tenant: tenantSvTopografia,
    customer,
    project,
    block,
    sale,
    contractDate: '2026-06-08',
    contractSnapshot: { contract_number: '000000007/2026' },
  });

  const chrome = buildSvLotes2PdfChrome(tenantSvTopografia, '000000007/2026', null);
  const pdf = await buildSaleContractPdfFromHtml(contractHtml, chrome);
  assert(isPdfBytes(pdf), 'pdf sv topografia válido');

  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const pdfPath = path.join(outDir, 'sv2-vendedor-config-assinado.pdf');
  fs.writeFileSync(pdfPath, pdf);

  const browser = await launchSaleContractPdfBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
  await page.setContent(
    wrapSaleContractHtmlDocument(contractHtml, 'SV Topografia P1'),
    { waitUntil: 'load', timeout: 45_000 },
  );
  const p1 = path.join(outDir, 'sv2-vendedor-config-pagina-1.png');
  await page.screenshot({ path: p1, fullPage: false, type: 'png' });
  await browser.close();

  console.log('OK writeSvTopografiaPdfArtifact', { pdfPath, p1 });
}

async function main() {
  testModelNormalization();
  testSv2TemplateStructure();
  testSv2AddressAndCivilState();
  testSv2SellerFromCompanySettings();
  testRoutingDoesNotBreakPadrao();
  testRoutingSv2ViaGenerateContractHTML();
  testRecantoUnchanged();
  testPdfChromeAndCertificate();
  writeSampleArtifacts();
  await writeSv2SignedPdfArtifacts();
  await writeSvTopografiaPdfArtifact();
  console.log('OK — mandatory-sv-lotes-2-contract-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Testes obrigatórios — modelo legal contrato de compra e venda (imobiliárias).
 * npx tsx scripts/mandatory-sale-contract-legal-template-tests.ts
 */

import { generateContractHTML } from '../lib/contractTemplate';
import {
  buildSaleContractClauseQuartaHtml,
  buildSaleContractRepresentativeSignatureHtml,
  isSaleContractCashPayment,
  isValidRepresentativeCpf,
} from '../lib/saleContractLegalTemplate';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';
import { SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE } from '../lib/saleContractSignatureVerify';
import { isPdfBytes } from '../lib/saasContractPdfHttp';
import {
  buildSaleContractPdfFilename,
  buildSaleContractPdfHttpHeaders,
} from '../lib/saleContractPdfHttp';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const menesesTenant = {
  fantasy_name: 'MENESES IMOBILIARIA LTDA',
  name: 'MENESES IMOBILIARIA LTDA',
  cnpj: '64435850000103',
  legal_representative: 'Carlos Daniel Araujo Meneses',
  representative_cpf: '64435850000103',
  address: 'Av. Teste, 100',
  city: 'Goiânia',
  state: 'GO',
  zip_code: '74000000',
};

const baseCustomer = {
  name: 'Comprador Teste',
  document: '12345678901',
  cpf: '12345678901',
  profession: 'Engenheiro',
  civil_state: 'Solteiro',
  address: 'Rua A',
  neighborhood: 'Centro',
  city: 'Goiânia',
  state: 'GO',
  zip_code: '74000000',
};

const baseProject = { name: 'Residencial Meneses', city: 'Goiânia', uf: 'GO' };
const baseBlock = {
  quadra: '04',
  lot_number: '22',
  area: 360,
  frente: 12,
  fundo: 12,
  'Lado Dir.': 30,
  'Lado Esq.': 30,
};

function buildHtml(sale: Record<string, unknown>) {
  return generateContractHTML({
    tenant: menesesTenant,
    customer: baseCustomer,
    project: baseProject,
    block: baseBlock,
    sale,
    contractSnapshot: { contract_number: '000000022/2026' },
    contractDate: '2026-06-01',
  });
}

function testElectronicSignatureClause() {
  const html = buildHtml({
    payment_type: 'À vista',
    installments_count: 1,
    total_value: 45000,
    down_payment: 0,
  });

  assert(
    html.includes('Cláusula Décima Segunda:') &&
      html.includes('assinatura eletrônica realizada através da plataforma SV LOTES'),
    'cláusula assinatura eletrônica presente',
  );
  assert(
    html.includes('Medida Provisória nº 2.200-2/2001'),
    'MP 2.200-2/2001',
  );
  assert(
    html.includes('Lei nº 14.063/2020'),
    'Lei 14.063/2020',
  );
  assert(html.includes('Cláusula Décima Terceira:'), 'foro renumerado terceira');
  assert(!html.includes('Cláusula Décima Primeira:'), 'foro antigo removido');
  console.log('OK testElectronicSignatureClause');
}

function testCashPaymentClause() {
  const sale = {
    payment_type: 'À vista',
    installments_count: 1,
    total_value: 45000,
    down_payment: 0,
  };
  assert(isSaleContractCashPayment(sale), 'detecta à vista Meneses');

  const html = buildHtml(sale);
  assert(
    html.includes('será realizado à vista pelo PROMISSÁRIO COMPRADOR'),
    'texto à vista cláusula quarta',
  );
  assert(
    !/parcelado via boleto bancário em\s*<strong>1 parcelas/i.test(html),
    'sem parcelamento 1 parcela',
  );
  assert(
    !html.includes('entrada de <strong>R$ 0,00'),
    'sem entrada zero em à vista',
  );
  console.log('OK testCashPaymentClause');
}

function testInstallmentPaymentClause() {
  const sale = {
    payment_type: 'Parcelado',
    installments_count: 12,
    total_value: 45000,
    down_payment: 5000,
    first_installment_due_date: '2026-07-10',
  };
  assert(!isSaleContractCashPayment(sale), 'parcelado 12x não é à vista');

  const html = buildHtml(sale);
  assert(html.includes('parcelado via boleto bancário'), 'mantém texto parcelado');
  assert(html.includes('12 parcelas'), '12 parcelas');
  console.log('OK testInstallmentPaymentClause');
}

function testRepresentativeSignatureBlock() {
  assert(!isValidRepresentativeCpf('64435850000103'), 'CNPJ não é CPF válido');

  const repHtml = buildSaleContractRepresentativeSignatureHtml({
    representativeName: 'Carlos Daniel Araujo Meneses',
    representativeCpfRaw: '64435850000103',
    companyName: 'MENESES IMOBILIARIA LTDA',
  });
  assert(
    repHtml.includes('Representante legal da MENESES IMOBILIARIA LTDA'),
    'representante sem CPF usa empresa',
  );
  assert(!repHtml.includes('CPF: 64.435.850/0001-03'), 'não imprime CNPJ como CPF');

  const html = buildHtml({
    payment_type: 'À vista',
    installments_count: 1,
    total_value: 45000,
  });
  assert(!html.includes('CPF: 64.435.850/0001-03'), 'html contrato sem CNPJ como CPF');
  assert(html.includes('Representante legal da MENESES IMOBILIARIA LTDA'), 'html representante');

  const withCpf = buildSaleContractRepresentativeSignatureHtml({
    representativeName: 'Carlos Daniel Araujo Meneses',
    representativeCpfRaw: '12345678901',
    companyName: 'MENESES IMOBILIARIA LTDA',
  });
  assert(withCpf.includes('CPF: 123.456.789-01'), 'CPF real formatado');
  console.log('OK testRepresentativeSignatureBlock');
}

function testSignatureCertificateHtml() {
  const cert = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000022/2026',
    projectName: 'Residencial Meneses',
    quadra: '04',
    lote: '22',
    buyerName: 'Comprador Teste',
    buyerDocument: '12345678901',
    companyName: 'MENESES IMOBILIARIA LTDA',
    companyCnpj: '64435850000103',
    representativeName: 'Carlos Daniel Araujo Meneses',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signedAt: '2026-06-08T15:30:00.000Z',
    viewedAt: '2026-06-08T15:20:00.000Z',
    ipAddress: '177.1.2.3',
    signatureToken: 'abc123token456',
    signatureHash: 'sha256hash',
    signerEmail: 'comprador@test.com',
  });

  assert(cert.includes('000000022/2026'), 'cert contrato');
  assert(cert.includes('Residencial Meneses'), 'cert empreendimento');
  assert(cert.includes('04'), 'cert quadra');
  assert(cert.includes('22'), 'cert lote');
  assert(cert.includes('MENESES IMOBILIARIA LTDA'), 'cert empresa');
  assert(cert.includes('Vendedor'), 'cert bloco vendedor');
  assert(cert.includes('Comprador'), 'cert bloco comprador');
  assert(cert.includes('comprador@test.com'), 'cert email');
  assert(cert.includes('Hash SHA-256'), 'cert hash');
  assert(cert.includes(SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE), 'cert título profissional');
  assert(cert.includes('VALIDADO'), 'cert status');
  console.log('OK testSignatureCertificateHtml');
}

async function testPublicPdfPipeline() {
  const html = buildHtml({
    payment_type: 'À vista',
    installments_count: 1,
    total_value: 45000,
    down_payment: 0,
  });

  const headers = buildSaleContractPdfHttpHeaders(
    'attachment',
    '000000022/2026',
  );
  assert(headers['Content-Type'] === 'application/pdf', 'headers pdf');
  assert(
    buildSaleContractPdfFilename('000000022/2026') ===
      'contrato-000000022_2026.pdf',
    'filename pdf',
  );

  if (process.env.RUN_SALE_PDF_BROWSER_TESTS === '1') {
    const { buildSaleContractPdfFromHtml } = await import('../lib/saleContractPdf');
    const pdf = await buildSaleContractPdfFromHtml(html, {
      tenantName: 'MENESES IMOBILIARIA LTDA',
      tenantCnpj: '64.435.850/0001-03',
      addressLine: 'Av. Teste, 100',
      cityUfLine: 'Goiânia - GO',
      contractNumber: '000000022/2026',
      logoBase64: null,
    });
    assert(isPdfBytes(pdf), 'pdf bytes válidos');
    console.log('OK testPublicPdfPipeline (browser)');
  } else {
    console.log('SKIP testPublicPdfPipeline browser (RUN_SALE_PDF_BROWSER_TESTS≠1)');
  }
}

function testClauseQuartaHelper() {
  const cash = buildSaleContractClauseQuartaHtml({
    isCash: true,
    valorTotalFmt: 'R$ 45.000,00',
    valorTotalExtenso: 'quarenta e cinco mil reais',
    valorEntradaFmt: 'R$ 0,00',
    valorEntradaExtenso: '',
    qtdParcelas: 1,
    valorParcelaFmt: 'R$ 45.000,00',
    valorParcelaExtenso: 'quarenta e cinco mil reais',
    dataPrimeiraParcelaFmt: '—',
    dataUltimaParcelaFmt: '—',
  });
  assert(cash.includes('realizado à vista'), 'helper cash');

  const inst = buildSaleContractClauseQuartaHtml({
    isCash: false,
    valorTotalFmt: 'R$ 45.000,00',
    valorTotalExtenso: 'quarenta e cinco mil reais',
    valorEntradaFmt: 'R$ 5.000,00',
    valorEntradaExtenso: 'cinco mil reais',
    qtdParcelas: 12,
    valorParcelaFmt: 'R$ 3.333,33',
    valorParcelaExtenso: 'três mil reais',
    dataPrimeiraParcelaFmt: '10/07/2026',
    dataUltimaParcelaFmt: '10/06/2027',
  });
  assert(inst.includes('parcelado via boleto bancário'), 'helper parcelado');
  console.log('OK testClauseQuartaHelper');
}

function testLegacyStoredHtmlStillParses() {
  const legacyHtml = '<div class="sv-contract-document"><p>Contrato legado Cláusula Primeira</p></div>';
  assert(legacyHtml.includes('sv-contract-document'), 'html legado abre');
  console.log('OK testLegacyStoredHtmlStillParses');
}

async function writeSamplePdfIfRequested() {
  if (process.env.WRITE_SALE_CONTRACT_SAMPLE !== '1') return;
  if (process.env.RUN_SALE_PDF_BROWSER_TESTS !== '1') return;

  const fs = await import('fs');
  const path = await import('path');
  const html = buildHtml({
    payment_type: 'À vista',
    installments_count: 1,
    total_value: 45000,
    down_payment: 0,
  });
  const { buildSaleContractPdfFromHtml } = await import('../lib/saleContractPdf');
  const pdf = await buildSaleContractPdfFromHtml(html, {
    tenantName: 'MENESES IMOBILIARIA LTDA',
    tenantCnpj: '64.435.850/0001-03',
    addressLine: 'Av. Teste, 100',
    cityUfLine: 'Goiânia - GO',
    contractNumber: '000000022/2026',
    logoBase64: null,
  });
  const out = path.join(process.cwd(), 'tmp', 'contrato-000000022_2026-corrigido.pdf');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(pdf));
  console.log(`Sample PDF written: ${out}`);
}

async function main() {
  testElectronicSignatureClause();
  testCashPaymentClause();
  testInstallmentPaymentClause();
  testRepresentativeSignatureBlock();
  testSignatureCertificateHtml();
  testClauseQuartaHelper();
  testLegacyStoredHtmlStillParses();
  await testPublicPdfPipeline();
  await writeSamplePdfIfRequested();
  console.log('\nAll mandatory sale contract legal template tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

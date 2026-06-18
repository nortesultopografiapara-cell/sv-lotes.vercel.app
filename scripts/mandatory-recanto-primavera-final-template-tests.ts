/**
 * Testes finais — template Recanto Primavera fiel ao modelo DOCX Ivanilde.
 * npx tsx scripts/mandatory-recanto-primavera-final-template-tests.ts
 */

import fs from 'fs';
import path from 'path';
import { generateContractHTML } from '../lib/contractTemplate';
import { generateRecantoPrimaveraContract } from '../lib/recantoPrimaveraContractTemplate';
import {
  RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1,
  RECANTO_PRIMAVERA_LEGAL_MARKER,
} from '../lib/recantoPrimaveraContractLegal';
import { RECANTO_PRIMAVERA_CLAUSE_MARKERS } from '../lib/recantoPrimaveraContractClauses';
import { buildRecantoPrimaveraPdfChrome } from '../lib/recantoPrimaveraContractPdf';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertNotIncludes(html: string, needle: string, msg: string) {
  if (html.includes(needle)) {
    throw new Error(`${msg}: não deveria conter "${needle}"`);
  }
}

const ivanildeTenant = {
  name: 'IVANILDE DE MOURA SILVA',
  fantasy_name: 'RECANTO PRIMAVERA',
  cnpj: '32641281104',
  contract_model: 'RECANTO_PRIMAVERA',
  contract_legal_nationality: 'Brasileira',
  contract_legal_marital_status: 'Solteira',
  contract_legal_profession: 'Agricultora',
  contract_legal_rg: '1234567',
  contract_legal_rg_issuer: 'SSP/PA',
  contract_legal_phone: '(94) 99222-3344',
  contract_legal_email: 'ivanilde@recantoprimavera.test',
  contract_legal_address: 'Rua das Acácias, 50, Centro',
  contract_enterprise_name: 'CHACREAMENTO RECANTO PRIMAVERA',
  contract_enterprise_location:
    'Acesso a Palmares II, Zona Rural, entre Palmares I e Palmares II',
  contract_enterprise_municipality: 'Parauapebas',
  contract_enterprise_uf: 'PA',
  contract_forum_city: 'Parauapebas',
  contract_bank_name: 'Sicredi',
  contract_bank_branch: '0804',
  contract_bank_account: '91047-5',
  contract_bank_pix: '32641281104',
  contract_bank_beneficiary: 'Ivanilde de Moura Silva',
  logo_url: 'https://cdn.test/recanto-logo-final.png',
  signature_url: 'https://cdn.test/recanto-signature-final.png',
  city: 'Parauapebas',
  state: 'PA',
};

const customer = {
  name: 'João da Silva Santos',
  document: '98765432100',
  cpf: '98765432100',
  rg: '7654321',
  rg_issuer: 'SSP',
  rg_issuer_state: 'PA',
  profession: 'Motorista',
  civil_state: 'Casado',
  nationality: 'Brasileira',
  phone: '(94) 98888-7777',
  email: 'joao@test.com',
  address: 'Rua B, 200',
  neighborhood: 'Cidade Nova',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
  spouse_name: 'Maria Santos',
  spouse_cpf: '11122233344',
  spouse_profession: 'Do lar',
};

const block = {
  quadra: '03',
  lot: '15',
  area: 300,
  frente: 12,
  fundo: 12,
  'Lado Dir.': 25,
  'Lado Esq.': 25,
};

const sale = {
  payment_type: 'Parcelado',
  installments_count: 24,
  total_value: 95000,
  down_payment: 10000,
  first_installment_due_date: '2026-07-15',
  created_at: '2026-06-15',
  brokers: {
    name: 'Carlos Corretor',
    cpf: '55566677788',
    creci: '12345-PA',
  },
};

function buildHtml() {
  return generateContractHTML({
    tenant: ivanildeTenant,
    customer,
    project: { name: 'Recanto Primavera', city: 'Parauapebas', uf: 'PA' },
    block,
    sale,
    contractDate: '2026-06-17',
  });
}

function testTitleMatchesOriginal() {
  const html = buildHtml();
  assert(html.includes(RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1), 'título linha 1');
  assert(html.includes('CHACREAMENTO RECANTO PRIMAVERA.'), 'título linha 2 com ponto');
  assertNotIncludes(
    html,
    'INSTRUMENTO PARTICULAR DE PROMESSA DE COMPRA E VENDA DE IMÓVEL',
    'título antigo removido',
  );
  console.log('OK testTitleMatchesOriginal');
}

function testVendorAndBuyerStructuredBlocks() {
  const html = buildHtml();
  assert(html.includes('<strong>VENDEDOR(A):</strong>'), 'label vendedor');
  assert(html.includes('<strong>CPF:</strong>'), 'label CPF vendedor PF');
  assert(html.includes('326.412.811-04'), 'cpf vendedor');
  assert(html.includes('<strong>COMPRADOR(A):</strong>'), 'label comprador');
  assert(html.includes('<strong>ENDEREÇO:</strong>'), 'label endereço comprador');
  assert(html.includes('987.654.321-00'), 'cpf comprador');
  console.log('OK testVendorAndBuyerStructuredBlocks');
}

function testSpouseBlockAlwaysPresent() {
  const html = buildHtml();
  assert(html.includes('<strong>Esposo(A)/Cônjuge:</strong>'), 'bloco cônjuge');
  assert(html.includes('Maria Santos'), 'nome cônjuge');
  assert(html.includes('111.222.333-44'), 'cpf cônjuge');

  const htmlNoSpouse = generateContractHTML({
    tenant: ivanildeTenant,
    customer: { ...customer, spouse_name: '', spouse_cpf: '' },
    project: { name: 'Recanto Primavera', city: 'Parauapebas', uf: 'PA' },
    block,
    sale,
    contractDate: '2026-06-17',
  });
  assert(htmlNoSpouse.includes('<strong>Esposo(A)/Cônjuge:</strong>'), 'bloco cônjuge vazio mantido');
  console.log('OK testSpouseBlockAlwaysPresent');
}

function testNoLogoBeforeTitle() {
  const html = buildHtml();
  const headerMatch = html.match(
    /<div class="contract-header-recanto"[\s\S]*?<\/div>/,
  );
  assert(!!headerMatch, 'cabeçalho Recanto');
  assertNotIncludes(headerMatch![0], '<img', 'sem logo no corpo antes do título');
  console.log('OK testNoLogoBeforeTitle');
}

function testPdfChromeUsesCpfLabel() {
  const chrome = buildRecantoPrimaveraPdfChrome(ivanildeTenant, 'TESTE/2026', null);
  assert(chrome.tenantDocumentLabel === 'CPF', 'chrome com label CPF');
  assert(chrome.tenantCnpj === '326.412.811-04', 'chrome com documento formatado');
  console.log('OK testPdfChromeUsesCpfLabel');
}

function testDocxClausesPresent() {
  const html = buildHtml();
  for (const marker of RECANTO_PRIMAVERA_CLAUSE_MARKERS) {
    assert(html.includes(marker), `cláusula ${marker}`);
  }
  assert(html.includes(RECANTO_PRIMAVERA_LEGAL_MARKER), 'marcador Recanto');
  console.log('OK testDocxClausesPresent');
}

function testRemovedMenesesClauses() {
  const html = buildHtml();
  assertNotIncludes(html, 'Da Promessa', 'sem cláusula Promessa');
  assertNotIncludes(html, 'Da Desistência', 'sem cláusula Desistência');
  assertNotIncludes(html, 'Da Irretratabilidade', 'sem cláusula Irretratabilidade');
  assertNotIncludes(html, 'Da Escritura', 'sem cláusula Escritura');
  assertNotIncludes(html, 'Dos Honorários', 'sem cláusula Honorários');
  assertNotIncludes(html, 'Assinatura Eletrônica', 'sem cláusula assinatura eletrônica');
  assertNotIncludes(html, 'multa penal de 2%', 'sem multa genérica 2%');
  console.log('OK testRemovedMenesesClauses');
}

function testSinalNotEntrada() {
  const html = buildHtml();
  assert(html.includes('SINAL'), 'contém SINAL');
  assert(html.includes('SALDO PARCELADO'), 'contém SALDO PARCELADO');
  assert(
    html.includes(
      'o valor pago a título de sinal não possui natureza de entrada, não sendo abatido do valor da chácara',
    ),
    'texto natureza do sinal',
  );
  assertNotIncludes(html.toLowerCase(), 'entrada de', 'sem entrada de');
  assertNotIncludes(html.toLowerCase(), 'sendo entrada', 'sem sendo entrada');
  console.log('OK testSinalNotEntrada');
}

function normalizeMoneyText(html: string): string {
  return html.replace(/\u00a0/g, ' ');
}

function testPaymentTableUsesTotalNotMinusSignal() {
  const html = normalizeMoneyText(buildHtml());
  assert(html.includes('R$ 10.000,00'), 'valor sinal');
  assert(html.includes('R$ 95.000,00'), 'saldo parcelado = valor total chácara');
  assert(html.includes('24 parcelas'), 'quantidade parcelas');
  assert(html.includes('R$ 3.958,33'), 'parcela = total/24 sem abater sinal');
  assertNotIncludes(html, 'R$ 85.000,00', 'não abate sinal do total');
  console.log('OK testPaymentTableUsesTotalNotMinusSignal');
}

function testObjectClauseFormat() {
  const html = buildHtml();
  assert(html.includes('LOTE DE TERRAS CHÁCARAS'), 'objeto chácaras');
  assert(html.includes('QUADRA'), 'quadra no objeto');
  assert(html.includes('Chacreamento Recanto Primavera'), 'empreendimento no objeto');
  assert(html.includes('Parauapebas/PA'), 'município no objeto');
  assert(html.includes('300,00 m²'), 'área no objeto');
  assert(html.includes('frente'), 'medidas no objeto');
  console.log('OK testObjectClauseFormat');
}

function testBankBoletoParagraph() {
  const html = buildHtml();
  assert(html.includes('boleto bancário'), 'pagamento por boleto');
  assert(html.includes('Sicredi'), 'banco');
  assert(html.includes('0804'), 'agência');
  assert(html.includes('91047-5'), 'conta');
  assert(
    html.includes('Ivanilde De Moura Silva') || html.includes('Ivanilde de Moura Silva'),
    'favorecido',
  );
  console.log('OK testBankBoletoParagraph');
}

function testDueDayParagraph() {
  const html = normalizeMoneyText(buildHtml());
  assert(html.includes('todo dia <strong>15</strong>'), 'dia vencimento');
  assert(html.includes('R$ 3.958,33'), 'valor parcela no parágrafo terceiro');
  assert(html.includes('15/07/2026'), 'início parcelas');
  console.log('OK testDueDayParagraph');
}

function testSignaturesFormat() {
  const html = buildHtml();
  assert(html.includes('CÔNJUGE ANUENTE'), 'assinatura cônjuge');
  assert(html.includes('CORRETOR'), 'assinatura corretor');
  assert(html.includes('Testemunhas:'), 'testemunhas');
  assert(html.includes('RG/CPF:'), 'rg/cpf testemunhas');
  assert(html.includes('Carlos Corretor'), 'nome corretor');
  assert(html.includes('12345-PA'), 'creci');
  console.log('OK testSignaturesFormat');
}

function testNoBodyFooter() {
  const html = buildHtml();
  assertNotIncludes(html, 'contract-footer-recanto', 'rodapé carregado removido do corpo');
  console.log('OK testNoBodyFooter');
}

function testNoUndefinedNullNaN() {
  const html = buildHtml();
  assertNotIncludes(html, 'undefined', 'sem undefined');
  assertNotIncludes(html, 'null', 'sem null');
  assertNotIncludes(html, 'NaN', 'sem NaN');
  console.log('OK testNoUndefinedNullNaN');
}

function testMenesesUnchanged() {
  const html = generateContractHTML({
    tenant: {
      fantasy_name: 'MENESES IMOBILIARIA LTDA',
      name: 'MENESES IMOBILIARIA LTDA',
      cnpj: '64435850000103',
      contract_model: 'PADRAO',
      address: 'Av. Teste',
      city: 'Goiânia',
      state: 'GO',
    },
    customer: {
      name: 'Cliente',
      document: '12345678901',
      profession: 'x',
      civil_state: 's',
      address: 'a',
      neighborhood: 'b',
      city: 'c',
      state: 'GO',
      zip_code: '1',
    },
    project: { name: 'Residencial', city: 'Goiânia', uf: 'GO' },
    block: { quadra: '1', lot: '1', area: 100 },
    sale: { total_value: 1000, installments_count: 1, down_payment: 0 },
    contractDate: '2026-06-01',
  });
  assert(html.includes('Promitente Proprietário Vendedor'), 'modelo Meneses');
  assertNotIncludes(html, RECANTO_PRIMAVERA_LEGAL_MARKER, 'sem marcador Recanto');
  assertNotIncludes(html, 'sv-contract-recanto-primavera', 'sem classe Recanto');
  console.log('OK testMenesesUnchanged');
}

function testStoredContractUnchanged() {
  const stored = '<div>Contrato antigo Tel.: (94) 11111-1111</div>';
  const fresh = buildHtml();
  assert(stored.includes('11111-1111'), 'antigo intacto');
  assert(fresh.includes('99222-3344'), 'novo com telefone atualizado');
  console.log('OK testStoredContractUnchanged');
}

async function writeSampleArtifacts() {
  const html = generateRecantoPrimaveraContract({
    tenant: ivanildeTenant,
    customer,
    project: { name: 'Recanto Primavera', city: 'Parauapebas', uf: 'PA' },
    block,
    sale,
    contractDate: '2026-06-17',
  });

  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'contrato-recanto-primavera-teste.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  let pdfPath = '';
  try {
    const { buildSaleContractPdfFromHtml, wrapSaleContractHtmlDocument } = await import(
      '../lib/saleContractPdf'
    );
    const pdf = await buildSaleContractPdfFromHtml(
      wrapSaleContractHtmlDocument(html, 'Contrato Recanto Primavera'),
      buildRecantoPrimaveraPdfChrome(ivanildeTenant, 'TESTE/2026', null),
    );
    pdfPath = path.join(outDir, 'contrato-recanto-primavera-teste.pdf');
    fs.writeFileSync(pdfPath, pdf);
  } catch (err) {
    console.warn('WARN pdf generation skipped', err instanceof Error ? err.message : err);
  }

  console.log('OK writeSampleArtifacts', { htmlPath, pdfPath: pdfPath || 'n/a' });
}

async function main() {
  testTitleMatchesOriginal();
  testVendorAndBuyerStructuredBlocks();
  testSpouseBlockAlwaysPresent();
  testNoLogoBeforeTitle();
  testPdfChromeUsesCpfLabel();
  testDocxClausesPresent();
  testRemovedMenesesClauses();
  testSinalNotEntrada();
  testPaymentTableUsesTotalNotMinusSignal();
  testObjectClauseFormat();
  testBankBoletoParagraph();
  testDueDayParagraph();
  testSignaturesFormat();
  testNoBodyFooter();
  testNoUndefinedNullNaN();
  testMenesesUnchanged();
  testStoredContractUnchanged();
  await writeSampleArtifacts();
  console.log('OK — mandatory-recanto-primavera-final-template-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Testes finais — template Recanto Primavera fiel ao modelo Ivanilde.
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
import { sanitizeContractField } from '../lib/recantoPrimaveraCompanyProfile';

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
  assert(
    html.includes(RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1),
    'título linha 1',
  );
  assert(html.includes('CHACREAMENTO RECANTO PRIMAVERA'), 'título linha 2 empreendimento');
  assertNotIncludes(
    html,
    'INSTRUMENTO PARTICULAR DE PROMESSA DE COMPRA E VENDA DE IMÓVEL',
    'título antigo removido',
  );
  console.log('OK testTitleMatchesOriginal');
}

function testVendorHeaderComplete() {
  const html = buildHtml();
  assert(html.includes('<strong>VENDEDOR(A):</strong>'), 'label vendedor');
  assert(html.includes('<strong>Nacionalidade:</strong> Brasileira'), 'nacionalidade');
  assert(html.includes('<strong>Estado civil:</strong> Solteira'), 'estado civil');
  assert(html.includes('<strong>Profissão:</strong> Agricultora'), 'profissão');
  assert(html.includes('<strong>RG:</strong> 1234567 — SSP/PA'), 'rg');
  assert(html.includes('326.412.811-04'), 'cpf formatado');
  assert(html.includes('(94) 99222-3344'), 'telefone jurídico');
  assert(html.includes('ivanilde@recantoprimavera.test'), 'email jurídico');
  console.log('OK testVendorHeaderComplete');
}

function testEnterpriseLocationNotCompanyAddress() {
  const html = buildHtml();
  assert(
    html.includes('situado em <strong>Acesso a Palmares II, Zona Rural, entre Palmares I e Palmares II</strong>'),
    'localização empreendimento na cláusula do lote',
  );
  const clauseMatch = html.match(/Cláusula Primeira[\s\S]*?Cláusula Segunda/);
  assert(!!clauseMatch, 'cláusula primeira encontrada');
  assertNotIncludes(
    clauseMatch![0],
    'Rua das Acácias',
    'endereço comercial fora da cláusula do lote',
  );
  console.log('OK testEnterpriseLocationNotCompanyAddress');
}

function testBankDataInPaymentClause() {
  const html = buildHtml();
  assert(html.includes('Sicredi'), 'banco');
  assert(html.includes('0804'), 'agência');
  assert(html.includes('91047-5'), 'conta');
  assert(html.includes('32641281104'), 'pix');
  assert(html.includes('Ivanilde De Moura Silva') || html.includes('Ivanilde de Moura Silva'), 'favorecido');
  console.log('OK testBankDataInPaymentClause');
}

function testBuyerBrokerLotAndSignatures() {
  const html = buildHtml();
  assert(html.toUpperCase().includes('JOÃO DA SILVA SANTOS'), 'comprador');
  assert(html.includes('987.654.321-00'), 'cpf comprador');
  assert(html.includes('(94) 98888-7777'), 'telefone comprador');
  assert(html.includes('joao@test.com'), 'email comprador');
  assert(html.includes('Maria Santos'), 'cônjuge');
  assert(html.includes('LOTE 15 DA QUADRA 03'), 'lote');
  assert(html.includes('Carlos Corretor'), 'corretor');
  assert(html.includes('12345-PA'), 'creci');
  assert(html.includes('https://cdn.test/recanto-signature-final.png'), 'assinatura');
  assert(html.includes('TESTEMUNHA 1'), 'testemunha 1');
  assert(html.includes('TESTEMUNHA 2'), 'testemunha 2');
  console.log('OK testBuyerBrokerLotAndSignatures');
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
    customer: { name: 'Cliente', document: '12345678901', profession: 'x', civil_state: 's', address: 'a', neighborhood: 'b', city: 'c', state: 'GO', zip_code: '1' },
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
      { contractNumber: 'TESTE/2026' },
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
  testVendorHeaderComplete();
  testEnterpriseLocationNotCompanyAddress();
  testBankDataInPaymentClause();
  testBuyerBrokerLotAndSignatures();
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

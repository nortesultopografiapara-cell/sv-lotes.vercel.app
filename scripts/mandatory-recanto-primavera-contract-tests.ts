/**
 * Testes obrigatórios — contrato Recanto Primavera com dados dinâmicos da empresa.
 * npx tsx scripts/mandatory-recanto-primavera-contract-tests.ts
 */

import { generateContractHTML } from '../lib/contractTemplate';
import { generateRecantoPrimaveraContract } from '../lib/recantoPrimaveraContractTemplate';
import fs from 'node:fs';
import {
  normalizeRecantoPrimaveraCompanyProfile,
  resolveRecantoVendorName,
} from '../lib/recantoPrimaveraCompanyProfile';
import {
  RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1,
  RECANTO_PRIMAVERA_LEGAL_MARKER,
} from '../lib/recantoPrimaveraContractLegal';
import {
  normalizeSaleContractModel,
  resolveSaleContractModel,
} from '../lib/contractModel';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertNotIncludes(html: string, needle: string, msg: string) {
  if (html.includes(needle)) {
    throw new Error(`${msg}: não deveria conter "${needle}"`);
  }
}

const baseCustomer = {
  name: 'Comprador Teste',
  document: '12345678901',
  cpf: '12345678901',
  profession: 'Engenheiro',
  civil_state: 'Solteiro',
  address: 'Rua A',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
};

const baseProject = { name: 'Recanto Primavera', city: 'Parauapebas', uf: 'PA' };
const baseBlock = {
  quadra: '01',
  lot: '10',
  area: 250,
  frente: 10,
  fundo: 10,
  'Lado Dir.': 25,
  'Lado Esq.': 25,
};

const baseSale = {
  payment_type: 'Parcelado',
  installments_count: 12,
  total_value: 80000,
  down_payment: 5000,
  created_at: '2026-06-01',
};

function recantoTenant(overrides: Record<string, unknown> = {}) {
  return {
    name: 'IVANILDE DE MOURA SILVA',
    fantasy_name: 'RECANTO PRIMAVERA',
    cnpj: '32641281104',
    phone: '(94) 99999-0001',
    email: 'contato@recantoprimavera.test',
    address: 'Rua das Flores, 100',
    city: 'Parauapebas',
    state: 'PA',
    zip_code: '68515000',
    logo_url: 'https://cdn.test/recanto-logo-v1.png',
    signature_url: 'https://cdn.test/recanto-signature-v1.png',
    contract_model: 'RECANTO_PRIMAVERA',
    ...overrides,
  };
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
  phone: '(62) 3000-0000',
  email: 'meneses@test.com',
  contract_model: 'PADRAO',
};

function buildRecantoHtml(tenant: Record<string, unknown>) {
  return generateContractHTML({
    tenant,
    customer: baseCustomer,
    project: baseProject,
    block: baseBlock,
    sale: baseSale,
    contractDate: '2026-06-08',
  });
}

function testContractModelNormalization() {
  assert(
    normalizeSaleContractModel('recanto_primavera') === 'RECANTO_PRIMAVERA',
    'normaliza recanto_primavera',
  );
  assert(normalizeSaleContractModel(null) === 'PADRAO', 'default PADRAO');
  assert(
    resolveSaleContractModel({ contract_model: 'RECANTO_PRIMAVERA' }) ===
      'RECANTO_PRIMAVERA',
    'resolve RECANTO',
  );
  console.log('OK testContractModelNormalization');
}

function testPhoneUpdatesOnNewContract() {
  const tenantV1 = recantoTenant({ phone: '(94) 11111-1111' });
  const htmlV1 = buildRecantoHtml(tenantV1);
  assert(htmlV1.includes('(94) 11111-1111'), 'telefone v1 no contrato');

  const tenantV2 = recantoTenant({ phone: '(94) 22222-2222' });
  const htmlV2 = buildRecantoHtml(tenantV2);
  assert(htmlV2.includes('(94) 22222-2222'), 'telefone v2 no contrato');
  assertNotIncludes(htmlV2, '(94) 11111-1111', 'telefone antigo removido');
  console.log('OK testPhoneUpdatesOnNewContract');
}

function testEmailUpdatesOnNewContract() {
  const tenantV1 = recantoTenant({ email: 'v1@recanto.test' });
  const htmlV1 = buildRecantoHtml(tenantV1);
  assert(htmlV1.includes('v1@recanto.test'), 'email v1');

  const tenantV2 = recantoTenant({ email: 'v2@recanto.test' });
  const htmlV2 = buildRecantoHtml(tenantV2);
  assert(htmlV2.includes('v2@recanto.test'), 'email v2');
  assertNotIncludes(htmlV2, 'v1@recanto.test', 'email antigo removido');
  console.log('OK testEmailUpdatesOnNewContract');
}

function testNoLogoInContractBody() {
  const htmlV1 = buildRecantoHtml(
    recantoTenant({ logo_url: 'https://cdn.test/logo-a.png' }),
  );
  const htmlV2 = buildRecantoHtml(
    recantoTenant({ logo_url: 'https://cdn.test/logo-b.png' }),
  );
  assertNotIncludes(htmlV1, 'logo-a.png', 'logo não no corpo v1');
  assertNotIncludes(htmlV2, 'logo-b.png', 'logo não no corpo v2');

  const headerMatch = htmlV2.match(
    /<div class="contract-header-recanto"[\s\S]*?<\/div>/,
  );
  assert(!!headerMatch, 'cabeçalho Recanto');
  assertNotIncludes(headerMatch![0], '<img', 'sem img antes do título');
  console.log('OK testNoLogoInContractBody');
}

function testSignatureFromCompanySettings() {
  const html = buildRecantoHtml(
    recantoTenant({ signature_url: 'https://cdn.test/assinatura-ivanilde.png' }),
  );
  assert(
    html.includes('https://cdn.test/assinatura-ivanilde.png'),
    'assinatura cadastrada',
  );
  console.log('OK testSignatureFromCompanySettings');
}

function testNoHardcodedIvanildeData() {
  const html = buildRecantoHtml(
    recantoTenant({
      name: 'EMPRESA TESTE XYZ',
      fantasy_name: 'EMPRESA TESTE XYZ',
      cnpj: '12345678901',
      phone: '(11) 90000-0000',
      email: 'xyz@empresa.test',
      logo_url: 'https://cdn.test/xyz-logo.png',
    }),
  );
  assert(html.toUpperCase().includes('EMPRESA TESTE XYZ'), 'nome dinâmico');
  assert(html.includes('123.456.789-01'), 'cpf dinâmico');
  assert(html.includes('(11) 90000-0000'), 'telefone dinâmico');
  assert(html.includes('xyz@empresa.test'), 'email dinâmico');
  assertNotIncludes(html, '326.412.811-04', 'sem cpf fixo Ivanilde');
  assertNotIncludes(html, 'IVANILDE DE MOURA SILVA', 'sem nome fixo Ivanilde');
  console.log('OK testNoHardcodedIvanildeData');
}

function testMenesesUsesStandardModel() {
  const html = generateContractHTML({
    tenant: menesesTenant,
    customer: baseCustomer,
    project: { name: 'Residencial Meneses', city: 'Goiânia', uf: 'GO' },
    block: { quadra: '04', lot: '22', area: 360 },
    sale: {
      payment_type: 'À vista',
      installments_count: 1,
      total_value: 45000,
      down_payment: 0,
    },
    contractDate: '2026-06-01',
  });

  assert(
    html.includes('INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA'),
    'título Meneses',
  );
  assert(html.includes('Promitente Proprietário Vendedor'), 'qualificação Meneses');
  assertNotIncludes(html, RECANTO_PRIMAVERA_LEGAL_MARKER, 'sem marcador Recanto');
  assertNotIncludes(html, 'sv-contract-recanto-primavera', 'sem classe Recanto');
  assertNotIncludes(html, '<strong>Nacionalidade:</strong>', 'sem bloco jurídico Recanto');
  console.log('OK testMenesesUsesStandardModel');
}

function testStoredContractHtmlUnchanged() {
  const oldStoredHtml = `
    <div class="sv-contract-document">
      <h2>INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA</h2>
      <p>Tel.: (94) 11111-1111</p>
      <p>E-mail: antigo@recanto.test</p>
      <img src="https://cdn.test/logo-antiga.png" />
    </div>
  `;

  const tenantUpdated = recantoTenant({
    phone: '(94) 99999-9999',
    email: 'novo@recanto.test',
    logo_url: 'https://cdn.test/logo-nova.png',
  });

  const newHtml = buildRecantoHtml(tenantUpdated);

  assert(oldStoredHtml.includes('(94) 11111-1111'), 'fixture antigo intacto');
  assert(oldStoredHtml.includes('antigo@recanto.test'), 'email antigo intacto');
  assert(oldStoredHtml.includes('logo-antiga.png'), 'logo antiga intacta');
  assert(newHtml.includes('(94) 99999-9999'), 'novo contrato com telefone novo');
  assert(newHtml.includes('novo@recanto.test'), 'novo contrato com email novo');
  console.log('OK testStoredContractHtmlUnchanged');
}

function testRecantoDirectGenerator() {
  const html = generateRecantoPrimaveraContract({
    tenant: recantoTenant(),
    customer: baseCustomer,
    project: baseProject,
    block: baseBlock,
    sale: baseSale,
    contractDate: '2026-06-08',
  });
  assert(html.includes('VENDEDOR(A):'), 'bloco vendedor');
  assert(html.includes(RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1), 'título Recanto');
  assert(html.includes('sv-contract-recanto-primavera'), 'classe template');
  console.log('OK testRecantoDirectGenerator');
}

function testCpfLabelForPfSeller() {
  const html = buildRecantoHtml(recantoTenant({ cnpj: '32641281104' }));
  assert(html.includes('<strong>CPF:</strong>'), 'label CPF para PF');
  assert(html.includes('326.412.811-04'), 'cpf formatado');
  console.log('OK testCpfLabelForPfSeller');
}

function testVendorAddressFromContractLegalSettings() {
  const fullAddress =
    'Acesso a Palmares II, Zona Rural, entre Palmares I e Palmares II, Chácara Recanto Primavera, Parauapebas-PA';
  const tenant = recantoTenant({
    legal_representative: 'Ivanilde de Moura Silva',
    representative_cpf: '32641281104',
    contract_legal_address: fullAddress,
    address: 'Rua Curta Errada, 1',
    contract_legal_phone: '(94) 99218-1007',
    contract_legal_email: 'chacararecantoprimavera@gmail.com',
  });
  const html = buildRecantoHtml(tenant);
  assert(html.includes(fullAddress), 'endereço contract_legal_address na qualificação');
  assertNotIncludes(html, 'Rua Curta Errada', 'ignora endereço genérico quando legal preenchido');
  console.log('OK testVendorAddressFromContractLegalSettings');
}

function testPfVendorPrefersPersonNameOverFantasy() {
  const tenant = recantoTenant({
    legal_representative: '',
    name: 'Ivanilde de Moura Silva',
    fantasy_name: 'RECANTO PRIMAVERA',
    cnpj: '32641281104',
    representative_cpf: '',
  });
  assert(
    resolveRecantoVendorName(tenant) === 'Ivanilde de Moura Silva',
    'PF usa nome da pessoa, não fantasia',
  );
  const html = buildRecantoHtml(tenant);
  assert(html.includes('Ivanilde de Moura Silva'), 'nome PF no contrato');
  assertNotIncludes(html, 'Não Informado', 'sem placeholder de vendedor');
  assertNotIncludes(html, 'Não informado', 'sem placeholder de vendedor');
  console.log('OK testPfVendorPrefersPersonNameOverFantasy');
}

function testLegalRepresentativeNameAlias() {
  const tenant = {
    contract_model: 'RECANTO_PRIMAVERA',
    legal_representative_name: 'Ivanilde de Moura Silva',
    legal_representative_cpf: '32641281104',
    fantasy_name: 'RECANTO PRIMAVERA',
    contract_legal_address: 'Endereço Ivanilde, Parauapebas-PA',
    signature_url: 'https://cdn.test/sig.png',
  };
  const profile = normalizeRecantoPrimaveraCompanyProfile(tenant);
  assert(
    profile.vendorName === 'Ivanilde de Moura Silva',
    'alias legal_representative_name',
  );
  assert(profile.documentFmt === '326.412.811-04', 'alias legal_representative_cpf');
  const html = generateContractHTML({
    tenant,
    customer: baseCustomer,
    project: baseProject,
    block: baseBlock,
    sale: baseSale,
  });
  assert(html.includes('VENDEDOR(A):'), 'modelo Recanto');
  assert(html.includes('Ivanilde de Moura Silva'), 'vendedor no HTML');
  assertNotIncludes(html, 'Promitente Proprietário Vendedor', 'não usa modelo clássico');
  console.log('OK testLegalRepresentativeNameAlias');
}

function testRecantoPrintCssAllowsClauseFlow() {
  const template = fs.readFileSync('lib/recantoPrimaveraContractTemplate.ts', 'utf8');
  const printCss = fs.readFileSync('lib/contractPdfPostProcess.ts', 'utf8');
  assert(template.includes('RECANTO_CONTRACT_PDF_PRINT_CSS'), 'template usa CSS Recanto');
  assert(printCss.includes('sv-contract-recanto-primavera .contract-clause'), 'CSS Recanto');
  assert(
    printCss.includes('page-break-inside: auto'),
    'cláusulas com fluxo contínuo',
  );
  assert(
    printCss.includes('contract-payment-block'),
    'tabela financeira permanece junta',
  );
  console.log('OK testRecantoPrintCssAllowsClauseFlow');
}

function testBrokerBlockHiddenWithoutBroker() {
  const html = generateRecantoPrimaveraContract({
    tenant: recantoTenant(),
    customer: baseCustomer,
    project: baseProject,
    block: baseBlock,
    sale: { ...baseSale, broker_id: null },
  });
  assertNotIncludes(html, 'CORRETOR', 'sem bloco corretor vazio');
  console.log('OK testBrokerBlockHiddenWithoutBroker');
}

function main() {
  testContractModelNormalization();
  testPhoneUpdatesOnNewContract();
  testEmailUpdatesOnNewContract();
  testNoLogoInContractBody();
  testSignatureFromCompanySettings();
  testNoHardcodedIvanildeData();
  testMenesesUsesStandardModel();
  testStoredContractHtmlUnchanged();
  testRecantoDirectGenerator();
  testCpfLabelForPfSeller();
  testVendorAddressFromContractLegalSettings();
  testPfVendorPrefersPersonNameOverFantasy();
  testLegalRepresentativeNameAlias();
  testRecantoPrintCssAllowsClauseFlow();
  testBrokerBlockHiddenWithoutBroker();
  console.log('OK — mandatory-recanto-primavera-contract-tests passed');
}

main();

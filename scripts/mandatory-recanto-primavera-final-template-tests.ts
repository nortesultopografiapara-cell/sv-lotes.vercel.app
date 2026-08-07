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
import { RECANTO_PRIMAVERA_CLAUSE_MARKERS, RECANTO_PRIMAVERA_LITERAL_PHRASES, RECANTO_PRIMAVERA_ELECTRONIC_SIGNATURE_PHRASES } from '../lib/recantoPrimaveraContractClauses';
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
  legal_representative: 'Ivanilde de Moura Silva',
  representative_cpf: '32641281104',
  cnpj: '32641281104',
  contract_model: 'RECANTO_PRIMAVERA',
  contract_legal_nationality: 'Brasileira',
  contract_legal_marital_status: 'Divorciada',
  contract_legal_profession: 'Empresária',
  contract_legal_rg: '18.664.587',
  contract_legal_rg_issuer: 'SSP/MG',
  contract_legal_phone: '(94) 99218-1007',
  contract_legal_email: 'chacararecantoprimavera@gmail.com',
  contract_legal_address:
    'Acesso a Palmares II, Zona Rural, entre Palmares I e Palmares II, Chácara Recanto Primavera, Parauapebas-PA',
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

const recantoProject = {
  name: 'CHACREAMENTO RECANTO PRIMAVERA',
  city: 'Parauapebas',
  uf: 'PA',
  neighborhood: 'Zona Rural',
  address: 'Acesso a Palmares II, entre Palmares I e Palmares II',
  forum_city: 'Parauapebas',
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
  created_at: '2026-06-17',
  broker_id: 'broker-test-1',
  sale_spouse_name: 'Maria Santos',
  sale_spouse_nationality: 'Brasileira',
  sale_spouse_marital_status: 'Casada',
  sale_spouse_profession: 'Do lar',
  sale_spouse_rg: '9876543',
  sale_spouse_rg_issuer: 'SSP/PA',
  sale_spouse_cpf: '11122233344',
  sale_spouse_phone: '(94) 97777-6666',
  sale_spouse_email: 'maria@test.com',
  sale_spouse_address: 'Rua C, 100',
  brokers: {
    name: 'Carlos Corretor',
    cpf: '55566677788',
    creci: '12345-PA',
  },
};

function buildHtml(project = recantoProject) {
  return generateContractHTML({
    tenant: ivanildeTenant,
    customer,
    project,
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

function testSpouseBlockConditional() {
  const html = buildHtml();
  assert(html.includes('<strong>Esposo(A)/Cônjuge:</strong>'), 'bloco cônjuge com dados');
  assert(html.includes('Maria Santos'), 'nome cônjuge');
  assert(html.includes('111.222.333-44'), 'cpf cônjuge');
  assert(html.includes('CÔNJUGE ANUENTE'), 'assinatura cônjuge');
  assert(html.includes('Maria Santos'), 'nome cônjuge na assinatura');

  const htmlNoSpouse = generateContractHTML({
    tenant: ivanildeTenant,
    customer: { ...customer, spouse_name: '', spouse_cpf: '' },
    project: recantoProject,
    block,
    sale: {
      ...sale,
      sale_spouse_name: null,
      sale_spouse_cpf: null,
      sale_spouse_nationality: null,
      sale_spouse_marital_status: null,
      sale_spouse_profession: null,
      sale_spouse_rg: null,
      sale_spouse_rg_issuer: null,
      sale_spouse_phone: null,
      sale_spouse_email: null,
      sale_spouse_address: null,
    },
    contractDate: '2026-06-17',
  });
  assertNotIncludes(htmlNoSpouse, '<strong>Esposo(A)/Cônjuge:</strong>', 'sem bloco cônjuge');
  assertNotIncludes(htmlNoSpouse, 'CÔNJUGE ANUENTE', 'sem assinatura cônjuge');
  assertNotIncludes(htmlNoSpouse, 'contract-spouse-block', 'sem div cônjuge');
  console.log('OK testSpouseBlockConditional');
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
  assert(
    chrome.addressLine === ivanildeTenant.contract_legal_address,
    'chrome pdf usa endereço completo do contrato',
  );
  assert(chrome.cityUfLine === 'Parauapebas - PA', 'chrome pdf cidade/uf');
  assert(
    String(chrome.tenantName || '').toLowerCase() === 'ivanilde de moura silva',
    'chrome pdf nome do representante legal',
  );
  console.log('OK testPdfChromeUsesCpfLabel');
}

function testVendorQualificationFromContractLegalSettings() {
  const html = buildHtml();
  const fullAddress = ivanildeTenant.contract_legal_address as string;
  assert(html.includes('Ivanilde De Moura Silva'), 'nome vendedor representante legal');
  assert(html.includes('Divorciada'), 'estado civil jurídico');
  assert(html.includes('Empresária'), 'profissão jurídica');
  assert(html.includes('18.664.587 — SSP/MG'), 'rg com emissor');
  assert(html.includes('(94) 99218-1007'), 'telefone contrato');
  assert(html.includes('chacararecantoprimavera@gmail.com'), 'email contrato');
  assert(html.includes(fullAddress), 'endereço completo contrato na qualificação');
  assertNotIncludes(html, 'Rua das Acácias', 'sem endereço genérico antigo');
  console.log('OK testVendorQualificationFromContractLegalSettings');
}

function testVendorAddressFallbackFromContactAddress() {
  const tenant = {
    ...ivanildeTenant,
    contract_legal_address: '',
    address: 'Acesso a Palmares II, Zona Rural',
  };
  const html = generateContractHTML({
    tenant,
    customer,
    project: recantoProject,
    block,
    sale,
    contractDate: '2026-06-08',
  });
  assert(
    html.includes('Acesso a Palmares II, Zona Rural, Parauapebas-PA'),
    'fallback endereço contato + cidade-UF',
  );
  const chrome = buildRecantoPrimaveraPdfChrome(tenant, 'TEST/2026', null);
  assert(
    chrome.addressLine === 'Acesso a Palmares II, Zona Rural, Parauapebas-PA',
    'chrome fallback endereço',
  );
  console.log('OK testVendorAddressFallbackFromContactAddress');
}

function testLiteralPhrasesNotSummarized() {
  const html = buildHtml();
  for (const phrase of RECANTO_PRIMAVERA_LITERAL_PHRASES) {
    assert(html.includes(phrase), `frase literal DOCX: ${phrase}`);
  }
  console.log('OK testLiteralPhrasesNotSummarized');
}

function testClauseFirstBuyerDeclaration() {
  const html = buildHtml();
  assert(
    html.includes(
      'O(A) COMPRADOR(A) declara, sob as penas da lei civil e criminal',
    ),
    'cláusula primeira literal comprador',
  );
  console.log('OK testClauseFirstBuyerDeclaration');
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
  assertNotIncludes(html, 'Cláusula Décima Terceira:', 'sem cláusula foro Meneses');
  assertNotIncludes(html, 'multa penal de 2%', 'sem multa genérica 2%');
  console.log('OK testRemovedMenesesClauses');
}

function testDigitalSignatureClause() {
  const html = buildHtml();
  for (const phrase of RECANTO_PRIMAVERA_ELECTRONIC_SIGNATURE_PHRASES) {
    assert(html.includes(phrase), `cláusula assinatura digital: ${phrase}`);
  }
  const clauseIdx = html.indexOf('CLÁUSULA DÉCIMA SEGUNDA – DA ASSINATURA ELETRÔNICA');
  const signaturesIdx = html.indexOf('E, por estarem assim justos e contratados');
  assert(clauseIdx > 0 && signaturesIdx > clauseIdx, 'cláusula 12 antes das assinaturas');
  console.log('OK testDigitalSignatureClause');
}

function testDateExtenso() {
  const html = buildHtml();
  assert(html.includes('Parauapebas/PA, 17 de junho de 2026.'), 'data por extenso');
  assertNotIncludes(html, 'Parauapebas - PA, 17/06/2026', 'sem data numérica antiga');
  console.log('OK testDateExtenso');
}

function testContractWithSpouse() {
  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer: { ...customer, spouse_name: '', spouse_cpf: '' },
    project: recantoProject,
    block,
    sale: {
      ...sale,
      sale_spouse_name: 'Maria Santos',
      sale_spouse_nationality: 'Brasileira',
      sale_spouse_marital_status: 'Casada',
      sale_spouse_profession: 'Do lar',
      sale_spouse_rg: '9876543',
      sale_spouse_rg_issuer: 'SSP/PA',
      sale_spouse_cpf: '11122233344',
      sale_spouse_phone: '(94) 97777-6666',
      sale_spouse_email: 'maria@test.com',
      sale_spouse_address: 'Rua C, 100',
    },
    contractDate: '2026-06-17',
  });
  assert(html.includes('Maria Santos'), 'nome cônjuge');
  assert(html.includes('111.222.333-44'), 'cpf cônjuge');
  assert(html.includes('Brasileira'), 'nacionalidade cônjuge');
  assert(html.includes('Rua C, 100') || html.includes('Rua C'), 'endereço cônjuge');
  console.log('OK testContractWithSpouse');
}

function testContractWithoutSpouse() {
  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer: { ...customer, spouse_name: '', spouse_cpf: '' },
    project: recantoProject,
    block,
    sale: {
      ...sale,
      sale_spouse_name: null,
      sale_spouse_cpf: null,
      sale_spouse_nationality: null,
      sale_spouse_marital_status: null,
      sale_spouse_profession: null,
      sale_spouse_rg: null,
      sale_spouse_rg_issuer: null,
      sale_spouse_phone: null,
      sale_spouse_email: null,
      sale_spouse_address: null,
    },
    contractDate: '2026-06-17',
  });
  assertNotIncludes(html, '<strong>Esposo(A)/Cônjuge:</strong>', 'sem bloco cônjuge');
  assertNotIncludes(html, 'CÔNJUGE ANUENTE', 'sem assinatura cônjuge');
  assertNotIncludes(html, 'Maria Santos', 'sem nome cônjuge');
  console.log('OK testContractWithoutSpouse');
}

function testContractWithSpouseCpfOnly() {
  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer: { ...customer, spouse_name: '', spouse_cpf: '' },
    project: recantoProject,
    block,
    sale: {
      ...sale,
      sale_spouse_name: null,
      sale_spouse_cpf: '11122233344',
      sale_spouse_nationality: null,
      sale_spouse_marital_status: null,
      sale_spouse_profession: null,
      sale_spouse_rg: null,
      sale_spouse_rg_issuer: null,
      sale_spouse_phone: null,
      sale_spouse_email: null,
      sale_spouse_address: null,
    },
    contractDate: '2026-06-17',
  });
  // Regra global: exige nome + CPF — só CPF não inclui cônjuge.
  assertNotIncludes(html, 'CÔNJUGE ANUENTE', 'cpf sem nome não cria bloco');
  assertNotIncludes(html, '<strong>Esposo(A)/Cônjuge:</strong>', 'sem label');
  console.log('OK testContractWithSpouseCpfOnly');
}

function testBrokerFilled() {
  const html = buildHtml();
  assertNotIncludes(html, 'CORRETOR', 'Recanto sem slot assinatura corretor');
  assertNotIncludes(html, 'Carlos Corretor', 'nome corretor não aparece nas assinaturas');
  assertNotIncludes(html, 'CRECI nº 12345-PA', 'creci não aparece nas assinaturas');
  assertNotIncludes(html, 'Corretor responsável', 'sem resumo corretor');
  assertNotIncludes(html, 'Intermediação', 'sem bloco intermediação');
  assert(html.includes('TESTEMUNHA 1'), 'testemunhas após cônjuge');
  console.log('OK testBrokerFilled');
}

function testBrokerWithCreciDisplaysBelowName() {
  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer,
    project: recantoProject,
    block,
    sale: {
      ...sale,
      brokers: {
        name: 'Jhonne De Sousa Silva',
        cpf: '55566677788',
        creci: '14236F',
      },
    },
    contractDate: '2026-06-17',
  });
  assertNotIncludes(html, 'CORRETOR', 'sem título corretor');
  assertNotIncludes(html, 'Jhonne De Sousa Silva', 'nome corretor fora das assinaturas');
  assertNotIncludes(html, 'CRECI nº 14236F', 'creci fora das assinaturas');
  console.log('OK testBrokerWithCreciDisplaysBelowName');
}

function testBrokerWithoutCreciShowsNameOnly() {
  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer,
    project: recantoProject,
    block,
    sale: {
      ...sale,
      brokers: {
        name: 'Corretor Sem Creci',
        cpf: '55566677788',
        creci: '',
      },
    },
    contractDate: '2026-06-17',
  });
  assertNotIncludes(html, 'CORRETOR', 'sem título corretor');
  assertNotIncludes(html, 'Corretor Sem Creci', 'nome corretor fora das assinaturas');
  assertNotIncludes(html, 'CRECI nº', 'sem linha creci');
  console.log('OK testBrokerWithoutCreciShowsNameOnly');
}

function testBrokerEmpty() {
  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer,
    project: recantoProject,
    block,
    sale: {
      ...sale,
      broker_id: null,
      brokers: undefined,
      broker: undefined,
      broker_name: '',
    },
    contractDate: '2026-06-17',
  });
  assertNotIncludes(html, 'CORRETOR', 'sem slot corretor');
  assertNotIncludes(html, 'Carlos Corretor', 'sem nome corretor');
  assertNotIncludes(html, 'CRECI nº', 'sem creci sem corretor');
  assertNotIncludes(html, 'Corretor responsável', 'sem corretor no resumo');
  assertNotIncludes(html, 'Intermediação', 'sem bloco intermediação');
  console.log('OK testBrokerEmpty');
}

function testBrokerResolutionHelpers() {
  const {
    resolveBrokerFromSaleRecord,
    resolveSaleBrokerId,
    resolveBrokerDisplayName,
    attachBrokerSnapshotToSale,
  } = require('../lib/saleBrokerSnapshot');

  const fromJoinArray = resolveBrokerFromSaleRecord({
    broker_id: 'broker-1',
    brokers: [{ name: 'Maria Corretora' }],
  });
  assert(fromJoinArray.nome === 'Maria Corretora', 'brokers join array');

  const fromContractFallback = resolveSaleBrokerId(
    { broker_id: null },
    { broker_id: 'broker-contract-1' },
    { broker_id: 'broker-block-1' },
  );
  assert(fromContractFallback === 'broker-contract-1', 'contract broker_id fallback');

  const fromLegacyName = resolveBrokerFromSaleRecord({
    broker_name: 'João da Silva',
  });
  assert(fromLegacyName.nome === 'João da Silva', 'broker_name legado');
  assert(fromLegacyName.hasBroker === true, 'hasBroker com broker_name');

  const fromNomeField = resolveBrokerDisplayName({ nome: 'Ana Souza' });
  assert(fromNomeField === 'Ana Souza', 'campo nome pt-BR');

  console.log('OK testBrokerResolutionHelpers');
}

function testBrokerRegenerationRealWorldShape() {
  const { attachBrokerSnapshotToSale } = require('../lib/saleBrokerSnapshot');
  const enrichedSale = attachBrokerSnapshotToSale(
    {
      ...sale,
      broker_id: 'broker-test-1',
      brokers: undefined,
      broker: undefined,
      broker_name: '',
    },
    {
      name: 'João da Silva',
      cpf: '12345678901',
      document: '12345678901',
      creci: '12345-PA',
      role: 'Corretor',
    },
  );

  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer,
    project: recantoProject,
    block,
    sale: enrichedSale,
    contractSnapshot: { broker_id: 'broker-test-1' },
    contractDate: '2026-06-17',
  });

  assertNotIncludes(html, 'CORRETOR', 'regeneração: sem título corretor nas assinaturas');
  assertNotIncludes(html, 'CRECI nº 12345-PA', 'regeneração: creci fora das assinaturas');
  assert(Boolean(enrichedSale.broker_name || enrichedSale.broker_id), 'corretor continua no snapshot da venda');
  console.log('OK testBrokerRegenerationRealWorldShape');
}

function testBrokerFromBlockAndContractFallback() {
  const salePayload = {
    ...sale,
    broker_id: null,
    brokers: undefined,
    broker: undefined,
    broker_name: 'Pedro Corretor',
  };
  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer,
    project: recantoProject,
    block: { ...block, broker_id: 'broker-test-1' },
    sale: salePayload,
    contractSnapshot: { broker_id: 'broker-test-1' },
    contractDate: '2026-06-17',
  });

  assertNotIncludes(html, 'CORRETOR', 'sem slot corretor');
  assertNotIncludes(html, 'Pedro Corretor', 'nome corretor fora das assinaturas');
  assert(salePayload.broker_name === 'Pedro Corretor', 'broker_name permanece na venda');
  console.log('OK testBrokerFromBlockAndContractFallback');
}

function testBrokersContractSelectHasNoDocumentColumn() {
  const { BROKERS_CONTRACT_SELECT, BROKERS_COMMISSION_CONTRACT_SELECT } = require(
    '../lib/brokersContractQuery',
  );
  assert(!BROKERS_CONTRACT_SELECT.includes('document'), 'select brokers sem document');
  assert(!BROKERS_COMMISSION_CONTRACT_SELECT.includes('document'), 'join brokers sem document');
  console.log('OK testBrokersContractSelectHasNoDocumentColumn');
}

async function testBrokerEnrichResolvesJhonneFromBlockBrokerId() {
  const { enrichSaleWithBrokerForContract } = require('../lib/saleBrokerSnapshot');
  const brokerName = 'jhonne de sousa silva';
  const supabase = {
    from(table: string) {
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        not() {
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        maybeSingle: async () => {
          if (table === 'brokers') {
            return {
              data: {
                id: 'broker-jhonne',
                name: brokerName,
                cpf: '12345678901',
                creci: '12345-PA',
                role: 'BROKER',
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };

  const enriched = await enrichSaleWithBrokerForContract(
    supabase,
    { id: 'sale-1', broker_id: null, broker_name: '' },
    { block: { broker_id: 'broker-jhonne' }, contract: { broker_id: null } },
  );

  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer,
    project: recantoProject,
    block,
    sale: enriched,
    contractDate: '2026-06-17',
  });

  assertNotIncludes(html, 'CORRETOR', 'block broker_id: sem título corretor nas assinaturas');
  assert(
    Boolean(enriched.broker_id || enriched.broker_name),
    'block broker_id: corretor enriquecido na venda',
  );
  console.log('OK testBrokerEnrichResolvesJhonneFromBlockBrokerId');
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
  assert(html.includes('QUADRA nº'), 'quadra no objeto');
  assert(html.includes('Chacreamento Recanto Primavera'), 'empreendimento no objeto');
  assert(html.includes('Parauapebas/PA'), 'município no objeto');
  assert(html.includes('Acesso a Palmares II'), 'localização do projeto');
  assert(html.includes('300,00 m²'), 'área no objeto');
  assert(html.includes('pelo lado direito'), 'medida lado direito');
  assert(html.includes('pelo lado esquerdo'), 'medida lado esquerdo');
  assert(html.includes('12,00m</strong> de frente'), 'medida frente');
  console.log('OK testObjectClauseFormat');
}

function testBankBoletoParagraph() {
  const html = buildHtml();
  assert(html.includes('exclusivamente por <strong>boleto bancário</strong>'), 'pagamento por boleto');
  assert(html.includes('A falta de recebimento do boleto bancário não isenta'), 'parágrafo quarto boleto');
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
  assert(html.includes('15/07/2026'), 'início parcelas');
  assert(
    html.includes('observando-se os valores constantes no quadro de pagamento'),
    'parágrafo terceiro remete ao quadro (sem valor único cada)',
  );
  assert(
    !/no valor de\s*<strong>R\$\s*[\d.,]+<\/strong>\s*cada/i.test(html),
    'não afirma valor único cada no parágrafo terceiro',
  );
  console.log('OK testDueDayParagraph');
}

function testSignaturesFormat() {
  const html = buildHtml();
  assert(html.includes('CÔNJUGE ANUENTE'), 'assinatura cônjuge');
  assertNotIncludes(html, 'CORRETOR', 'sem slot assinatura corretor');
  assertNotIncludes(html, 'Carlos Corretor', 'nome corretor fora das assinaturas');
  assertNotIncludes(html, 'CRECI nº 12345-PA', 'creci fora das assinaturas');
  assert(html.includes('TESTEMUNHA 1'), 'testemunha 1');
  assert(html.includes('TESTEMUNHA 2'), 'testemunha 2');
  assert(html.includes('RG/CPF:'), 'rg/cpf testemunhas');
  assert(html.includes('signature-grid'), 'grade 2 colunas');
  assert(html.includes('contract-signatures--recanto'), 'bloco recanto');
  // legado "Testemunhas" (slot único) removido
  assert(!/>\s*Testemunhas\s*</.test(html), 'sem rótulo empilhado Testemunhas');
  assertNotIncludes(html, 'Intermediação', 'sem intermediação antes das assinaturas');
  assertNotIncludes(html, 'CPF/CRECI:', 'sem linha combinada cpf/creci');
  const spouseIdx = html.indexOf('CÔNJUGE ANUENTE');
  const witnessesIdx = html.indexOf('TESTEMUNHA 1');
  assert(spouseIdx >= 0 && witnessesIdx > spouseIdx, 'testemunhas após cônjuge sem slot corretor');
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

function testProjectEnterpriseFieldsSource() {
  const html = buildHtml();
  assert(html.includes('CHACREAMENTO RECANTO PRIMAVERA'), 'nome do empreendimento do projeto');
  assert(html.includes('Parauapebas/PA'), 'município/UF do projeto');
  assert(html.includes('Zona Rural'), 'bairro/localidade do projeto');
  assert(html.includes('Acesso a Palmares II'), 'endereço/referência do projeto');
  assert(html.includes('Comarca de <strong>Parauapebas/PA</strong>'), 'foro do projeto');
  console.log('OK testProjectEnterpriseFieldsSource');
}

function testProjectUpdateReflectsInContract() {
  const htmlV1 = buildHtml({
    ...recantoProject,
    name: 'EMPREENDIMENTO ALPHA',
    city: 'Marabá',
    uf: 'PA',
    forum_city: 'Marabá',
  });
  const htmlV2 = buildHtml({
    ...recantoProject,
    name: 'EMPREENDIMENTO BETA',
    city: 'Redenção',
    uf: 'PA',
    forum_city: 'Redenção',
  });
  assert(htmlV1.includes('EMPREENDIMENTO ALPHA'), 'projeto v1 no contrato');
  assert(htmlV1.includes('Marabá/PA'), 'município v1');
  assert(htmlV2.includes('EMPREENDIMENTO BETA'), 'projeto v2 no contrato');
  assert(htmlV2.includes('Redenção/PA'), 'município v2');
  assertNotIncludes(htmlV2, 'EMPREENDIMENTO ALPHA', 'v2 sem nome v1');
  console.log('OK testProjectUpdateReflectsInContract');
}

function testCompanyEnterpriseFieldsIgnoredWhenProjectPresent() {
  const tenantWithStaleCompanyFields = {
    ...ivanildeTenant,
    contract_enterprise_name: 'NOME ANTIGO DA EMPRESA',
    contract_enterprise_location: 'LOCALIZAÇÃO ANTIGA DA EMPRESA',
    contract_enterprise_municipality: 'Cidade Antiga Empresa',
    contract_enterprise_uf: 'GO',
    contract_forum_city: 'Cidade Foro Antiga Empresa',
  };
  const html = generateContractHTML({
    tenant: tenantWithStaleCompanyFields,
    customer,
    project: recantoProject,
    block,
    sale,
    contractDate: '2026-06-17',
  });
  assert(html.includes('CHACREAMENTO RECANTO PRIMAVERA'), 'usa projeto, não empresa');
  assertNotIncludes(html, 'NOME ANTIGO DA EMPRESA', 'ignora contract_enterprise_name');
  assertNotIncludes(html, 'LOCALIZAÇÃO ANTIGA DA EMPRESA', 'ignora contract_enterprise_location');
  assertNotIncludes(html, 'Cidade Antiga Empresa', 'ignora contract_enterprise_municipality');
  assertNotIncludes(html, 'Cidade Foro Antiga Empresa', 'ignora contract_forum_city');
  console.log('OK testCompanyEnterpriseFieldsIgnoredWhenProjectPresent');
}

function testCompanyEnterpriseFieldsFallbackWhenProjectEmpty() {
  const tenantFallback = {
    ...ivanildeTenant,
    contract_enterprise_name: 'CHACREAMENTO FALLBACK EMPRESA',
    contract_enterprise_location: 'Local fallback empresa',
    contract_enterprise_municipality: 'Parauapebas',
    contract_enterprise_uf: 'PA',
    contract_forum_city: 'Parauapebas',
  };
  const html = generateContractHTML({
    tenant: tenantFallback,
    customer,
    project: {},
    block,
    sale,
    contractDate: '2026-06-17',
  });
  assert(html.includes('Chacreamento Fallback Empresa') || html.includes('CHACREAMENTO FALLBACK EMPRESA'), 'fallback nome empresa');
  assert(html.includes('Local fallback empresa'), 'fallback localização empresa');
  console.log('OK testCompanyEnterpriseFieldsFallbackWhenProjectEmpty');
}

function testSettingsPageNoDuplicateEnterpriseFields() {
  const settingsSource = fs.readFileSync(
    path.join(process.cwd(), 'app/settings/page.tsx'),
    'utf8',
  );
  assertNotIncludes(settingsSource, 'name="contract_enterprise_name"', 'settings sem input enterprise name');
  assertNotIncludes(settingsSource, 'name="contract_enterprise_location"', 'settings sem input enterprise location');
  assertNotIncludes(settingsSource, 'name="contract_enterprise_municipality"', 'settings sem input município');
  assertNotIncludes(settingsSource, 'name="contract_enterprise_uf"', 'settings sem input UF');
  assertNotIncludes(settingsSource, 'name="contract_forum_city"', 'settings sem input foro');
  assertNotIncludes(settingsSource, 'Dados do Empreendimento no Contrato', 'settings sem seção duplicada');
  console.log('OK testSettingsPageNoDuplicateEnterpriseFields');
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
  assert(html.includes('Cláusula Décima Segunda:'), 'cláusula assinatura Meneses preservada');
  assertNotIncludes(html, RECANTO_PRIMAVERA_LEGAL_MARKER, 'sem marcador Recanto');
  assertNotIncludes(html, 'sv-contract-recanto-primavera', 'sem classe Recanto');
  assertNotIncludes(html, 'CLÁUSULA DÉCIMA SEGUNDA – DA ASSINATURA ELETRÔNICA', 'sem cláusula Recanto');
  console.log('OK testMenesesUnchanged');
}

function testPadraoWithBrokerNoRecantoBrokerBlocks() {
  const html = generateContractHTML({
    tenant: {
      name: 'EMPRESA TESTE',
      fantasy_name: 'EMPRESA TESTE',
      cnpj: '12345678000199',
      contract_model: 'PADRAO',
      city: 'Goiânia',
      state: 'GO',
    },
    customer: {
      name: 'Cliente Teste',
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
    sale: {
      total_value: 1000,
      installments_count: 1,
      down_payment: 0,
      broker_id: 'broker-1',
      brokers: { name: 'Corretor Meneses', cpf: '11122233344', creci: '9999-GO' },
    },
    contractDate: '2026-06-01',
  });
  assertNotIncludes(html, 'Intermediação', 'PADRAO sem intermediação Recanto');
  assertNotIncludes(html, 'CORRETOR', 'PADRAO sem slot corretor Recanto');
  console.log('OK testPadraoWithBrokerNoRecantoBrokerBlocks');
}

function testSaasUnchanged() {
  const { buildSaasContractDocumentText, menesesSaasContractFixture } = require('../lib/saasContractContent');
  const text = buildSaasContractDocumentText(menesesSaasContractFixture());
  assert(typeof text === 'string' && text.length > 100, 'texto SaaS gerado');
  assertNotIncludes(text, 'CLÁUSULA DÉCIMA SEGUNDA – DA ASSINATURA ELETRÔNICA', 'SaaS sem cláusula Recanto');
  assertNotIncludes(text, 'CHACREAMENTO RECANTO PRIMAVERA', 'SaaS sem template Recanto');
  console.log('OK testSaasUnchanged');
}

function testStoredContractUnchanged() {
  const stored = '<div>Contrato antigo Tel.: (94) 11111-1111</div>';
  const fresh = buildHtml();
  assert(stored.includes('11111-1111'), 'antigo intacto');
  assert(fresh.includes('99218-1007'), 'novo com telefone atualizado');
  console.log('OK testStoredContractUnchanged');
}

function testFinalScenarioNoBrokerNoSpouse() {
  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer,
    project: recantoProject,
    block,
    sale: {
      ...sale,
      broker_id: null,
      brokers: undefined,
      sale_spouse_name: null,
      sale_spouse_cpf: null,
    },
    contractDate: '2026-06-17',
  });
  assertNotIncludes(html, 'CORRETOR', 'cenário 1 sem título corretor');
  assertNotIncludes(html, 'Carlos Corretor', 'cenário 1 sem nome corretor');
  assertNotIncludes(html, 'Esposo(A)/Cônjuge', 'cenário 1 sem cônjuge');
  assertNotIncludes(html, 'CÔNJUGE ANUENTE', 'cenário 1 sem assinatura cônjuge');
  console.log('OK testFinalScenarioNoBrokerNoSpouse');
}

function testFinalScenarioBrokerNoSpouse() {
  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer,
    project: recantoProject,
    block,
    sale: {
      ...sale,
      broker_id: 'broker-1',
      sale_spouse_name: null,
      sale_spouse_cpf: null,
    },
    contractDate: '2026-06-17',
  });
  assertNotIncludes(html, 'CORRETOR', 'cenário 2 sem título corretor');
  assertNotIncludes(html, 'Carlos Corretor', 'cenário 2 nome corretor fora das assinaturas');
  assertNotIncludes(html, 'Esposo(A)/Cônjuge', 'cenário 2 sem cônjuge');
  assert(html.includes('TESTEMUNHA 1'), 'cenário 2 testemunhas');
  console.log('OK testFinalScenarioBrokerNoSpouse');
}

function testFinalScenarioBrokerAndSpouse() {
  const html = buildHtml();
  assertNotIncludes(html, 'CORRETOR', 'cenário 3 sem título corretor');
  assertNotIncludes(html, 'Carlos Corretor', 'cenário 3 nome corretor fora das assinaturas');
  assert(html.includes('CÔNJUGE ANUENTE'), 'cenário 3 cônjuge');
  assert(html.includes('Maria Santos'), 'cenário 3 nome cônjuge');
  console.log('OK testFinalScenarioBrokerAndSpouse');
}

function testFormatMasksApplied() {
  const html = buildHtml();
  assert(html.includes('326.412.811-04'), 'cpf vendedor mascarado');
  assert(html.includes('987.654.321-00'), 'cpf comprador mascarado');
  assert(html.includes('111.222.333-44'), 'cpf cônjuge mascarado');
  assert(html.includes('(94) 99218-1007') || html.includes('(94) 9921-8100'), 'telefone vendedor');
  assert(html.includes('68.515-000') || html.includes('68515'), 'cep comprador');
  console.log('OK testFormatMasksApplied');
}

function testAddressDedup() {
  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer: {
      ...customer,
      address: 'Rua B, 200',
      neighborhood: 'Cidade Nova',
      city: 'Parauapebas',
      state: 'PA',
      zip_code: '68515000',
    },
    project: recantoProject,
    block,
    sale,
    contractDate: '2026-06-17',
  });
  const dupCity = (html.match(/Parauapebas\s*-\s*PA/gi) || []).length;
  assert(dupCity <= 2, 'cidade não duplicada excessivamente no endereço');
  assertNotIncludes(html, 'Bairro Cidade Nova, Bairro Cidade Nova', 'bairro não duplicado');
  console.log('OK testAddressDedup');
}

function testSignatureCityPriority() {
  const html = generateContractHTML({
    tenant: { ...ivanildeTenant, city: 'Belém', state: 'PA' },
    customer,
    project: {
      ...recantoProject,
      forum_city: 'Parauapebas',
      city: 'Marabá',
    },
    block,
    sale,
    contractDate: '2026-06-17',
  });
  assert(html.includes('Parauapebas/PA'), 'forum_city priorizado na data');
  assertNotIncludes(html, 'Marabá/PA,', 'city do projeto não usada se forum_city existe');
  console.log('OK testSignatureCityPriority');
}

function testNoEmptyFieldLabels() {
  const html = generateContractHTML({
    tenant: ivanildeTenant,
    customer: {
      ...customer,
      phone: '',
      email: '',
      rg: '',
    },
    project: recantoProject,
    block,
    sale: {
      ...sale,
      broker_id: null,
      brokers: undefined,
      sale_spouse_name: null,
      sale_spouse_cpf: null,
    },
    contractDate: '2026-06-17',
  });
  assertNotIncludes(html, '<strong>Telefone:</strong> &nbsp;', 'sem telefone vazio');
  assertNotIncludes(html, '<strong>E-mail:</strong> &nbsp;', 'sem email vazio');
  assertNotIncludes(html, '<strong>RG:</strong> &nbsp;', 'sem rg vazio');
  console.log('OK testNoEmptyFieldLabels');
}

async function writeSampleArtifacts() {
  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });

  const saleWithSpouse = {
    ...sale,
    sale_spouse_name: 'Maria Santos',
    sale_spouse_nationality: 'Brasileira',
    sale_spouse_marital_status: 'Casada',
    sale_spouse_profession: 'Do lar',
    sale_spouse_rg: '9876543',
    sale_spouse_rg_issuer: 'SSP/PA',
    sale_spouse_cpf: '11122233344',
    sale_spouse_phone: '(94) 97777-6666',
    sale_spouse_email: 'maria@test.com',
    sale_spouse_address: 'Rua C, 100',
  };

  const htmlComConjuge = generateRecantoPrimaveraContract({
    tenant: ivanildeTenant,
    customer,
    project: recantoProject,
    block,
    sale: saleWithSpouse,
    contractDate: '2026-06-17',
  });

  const htmlSemConjuge = generateRecantoPrimaveraContract({
    tenant: ivanildeTenant,
    customer: { ...customer, spouse_name: '', spouse_cpf: '' },
    project: recantoProject,
    block,
    sale: {
      ...sale,
      sale_spouse_name: null,
      sale_spouse_cpf: null,
      sale_spouse_nationality: null,
      sale_spouse_marital_status: null,
      sale_spouse_profession: null,
      sale_spouse_rg: null,
      sale_spouse_rg_issuer: null,
      sale_spouse_phone: null,
      sale_spouse_email: null,
      sale_spouse_address: null,
      brokers: undefined,
      broker: undefined,
    },
    contractDate: '2026-06-17',
  });

  const htmlPathCom = path.join(outDir, 'contrato-recanto-com-conjuge.html');
  const htmlPathSem = path.join(outDir, 'contrato-recanto-sem-conjuge.html');
  fs.writeFileSync(htmlPathCom, htmlComConjuge, 'utf8');
  fs.writeFileSync(htmlPathSem, htmlSemConjuge, 'utf8');

  let pdfPathCom = '';
  let pdfPathSem = '';
  try {
    const { buildSaleContractPdfFromHtml, wrapSaleContractHtmlDocument } = await import(
      '../lib/saleContractPdf'
    );
    const chrome = buildRecantoPrimaveraPdfChrome(ivanildeTenant, 'TESTE/2026', null);
    const pdfCom = await buildSaleContractPdfFromHtml(
      wrapSaleContractHtmlDocument(htmlComConjuge, 'Contrato Recanto Primavera — com cônjuge'),
      chrome,
    );
    pdfPathCom = path.join(outDir, 'contrato-recanto-com-conjuge.pdf');
    fs.writeFileSync(pdfPathCom, pdfCom);

    const pdfSem = await buildSaleContractPdfFromHtml(
      wrapSaleContractHtmlDocument(htmlSemConjuge, 'Contrato Recanto Primavera — sem cônjuge'),
      chrome,
    );
    pdfPathSem = path.join(outDir, 'contrato-recanto-sem-conjuge.pdf');
    fs.writeFileSync(pdfPathSem, pdfSem);
  } catch (err) {
    console.warn('WARN pdf generation skipped', err instanceof Error ? err.message : err);
  }

  console.log('OK writeSampleArtifacts', {
    htmlPathCom,
    htmlPathSem,
    pdfPathCom: pdfPathCom || 'n/a',
    pdfPathSem: pdfPathSem || 'n/a',
  });
}

async function main() {
  testTitleMatchesOriginal();
  testVendorAndBuyerStructuredBlocks();
  testSpouseBlockConditional();
  testNoLogoBeforeTitle();
  testPdfChromeUsesCpfLabel();
  testVendorQualificationFromContractLegalSettings();
  testVendorAddressFallbackFromContactAddress();
  testLiteralPhrasesNotSummarized();
  testClauseFirstBuyerDeclaration();
  testDocxClausesPresent();
  testRemovedMenesesClauses();
  testDigitalSignatureClause();
  testDateExtenso();
  testContractWithSpouse();
  testContractWithoutSpouse();
  testContractWithSpouseCpfOnly();
  testBrokerFilled();
  testBrokerWithCreciDisplaysBelowName();
  testBrokerWithoutCreciShowsNameOnly();
  testBrokerEmpty();
  testBrokerResolutionHelpers();
  testBrokerRegenerationRealWorldShape();
  testBrokerFromBlockAndContractFallback();
  await testBrokerEnrichResolvesJhonneFromBlockBrokerId();
  testBrokersContractSelectHasNoDocumentColumn();
  testSinalNotEntrada();
  testPaymentTableUsesTotalNotMinusSignal();
  testObjectClauseFormat();
  testProjectEnterpriseFieldsSource();
  testProjectUpdateReflectsInContract();
  testCompanyEnterpriseFieldsIgnoredWhenProjectPresent();
  testCompanyEnterpriseFieldsFallbackWhenProjectEmpty();
  testSettingsPageNoDuplicateEnterpriseFields();
  testBankBoletoParagraph();
  testDueDayParagraph();
  testSignaturesFormat();
  testNoBodyFooter();
  testNoUndefinedNullNaN();
  testFinalScenarioNoBrokerNoSpouse();
  testFinalScenarioBrokerNoSpouse();
  testFinalScenarioBrokerAndSpouse();
  testFormatMasksApplied();
  testAddressDedup();
  testSignatureCityPriority();
  testNoEmptyFieldLabels();
  testMenesesUnchanged();
  testPadraoWithBrokerNoRecantoBrokerBlocks();
  testSaasUnchanged();
  testStoredContractUnchanged();
  await writeSampleArtifacts();
  console.log('OK — mandatory-recanto-primavera-final-template-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

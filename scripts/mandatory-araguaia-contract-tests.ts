/**
 * Testes obrigatórios — modelo ARAGUAIA (Chacreamento Araguaia).
 * npx tsx scripts/mandatory-araguaia-contract-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { generateContractHTML } from '../lib/contractTemplate';
import {
  isAraguaiaContractModel,
  isClassicSaleContractModel,
  isRecantoPrimaveraContractModel,
  normalizeSaleContractModel,
  resolveSaleContractModelFromContext,
  SALE_CONTRACT_MODEL_OPTIONS,
} from '../lib/contractModel';
import {
  ARAGUAIA_DEFAULT_SELLERS,
  resolveProjectContractSellers,
} from '../lib/projectContractSellers';
import { formatAraguaiaAreaExtenso } from '../lib/araguaiaContractContext';
import { formatAraguaiaMetersExtenso } from '../lib/araguaiaContractLot';
import {
  ARAGUAIA_CONTRACT_TITLE,
  ARAGUAIA_LEGAL_MARKER,
} from '../lib/araguaiaContractClauses';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK ${msg}`);
}

const TENANT = {
  contract_model: 'ARAGUAIA',
  razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
  cnpj: '57590706000178',
  address: 'Rua Teste, 100',
  city: 'Parauapebas',
  state: 'PA',
};

const PROJECT = {
  name: 'Chacreamento Araguaia',
  city: 'Parauapebas',
  uf: 'PA',
  contract_model: 'ARAGUAIA',
};

const CUSTOMER = {
  name: 'Cliente Teste Araguaia',
  cpf_cnpj: '11144477735',
  rg: '1234567',
  rg_issuer: 'PC',
  rg_issuer_state: 'PA',
  nationality: 'Brasileira',
  civil_state: 'Solteiro',
  profession: 'Comerciante',
  email: 'cliente@teste.com',
  phone: '(94) 99999-1234',
  address: 'Rua A, 10',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
};

const BLOCK = {
  id: 'block-araguaia-1',
  number: '12',
  block_name: '01',
  area: 1250.5,
  frente: 25,
  fundo: 25,
  'Lado Dir.': 50,
  'Lado Esq.': 50,
  segments_json: [
    {
      segment_index: 0,
      official_side: 'frente',
      distance: 25,
      confrontant: 'Rua Principal',
    },
    {
      segment_index: 1,
      official_side: 'lado_direito',
      distance: 50,
      confrontant: 'Chácara 13',
    },
    {
      segment_index: 2,
      official_side: 'fundo',
      distance: 25,
      confrontant: 'Área verde',
    },
    {
      segment_index: 3,
      official_side: 'lado_esquerdo',
      distance: 50,
      confrontant: 'Chácara 11',
    },
  ],
};

const SALE = {
  total_value: 80000,
  down_payment: 10000,
  installments_count: 24,
  installment_value: 2916.67,
  payment_type: 'Parcelado',
  installment_correction_type: 'IGPM',
  sale_date: '2026-08-20',
  brokers: { name: 'Corretor Exemplo', cpf: '12345678909' },
};

const RECEIPTS = [
  { installment_number: 0, amount: 10000, due_date: '2026-08-20' },
  { installment_number: 1, amount: 2916.67, due_date: '2026-09-20' },
  { installment_number: 2, amount: 2916.67, due_date: '2026-10-20' },
];

function testModelRegistration() {
  assert(normalizeSaleContractModel('ARAGUAIA') === 'ARAGUAIA', 'normalize ARAGUAIA');
  assert(
    normalizeSaleContractModel('chacreamento_araguaia') === 'ARAGUAIA',
    'normalize alias',
  );
  assert(SALE_CONTRACT_MODEL_OPTIONS.includes('ARAGUAIA'), 'opção UI');
  assert(isAraguaiaContractModel(TENANT), 'isAraguaia');
  assert(!isRecantoPrimaveraContractModel(TENANT), 'não é Recanto');
  assert(!isClassicSaleContractModel(TENANT), 'não é clássico');
  const resolved = resolveSaleContractModelFromContext({
    projectModel: 'ARAGUAIA',
    companyModel: 'PADRAO',
  });
  assert(resolved.model === 'ARAGUAIA' && resolved.source === 'project', 'prioridade projeto');

  const prevVercel = process.env.VERCEL_ENV;
  const prevNode = process.env.NODE_ENV;
  process.env.VERCEL_ENV = 'preview';
  const coerced = resolveSaleContractModelFromContext({
    projectModel: null,
    projectName: 'Chacreamento Araguaia',
    companyModel: 'PADRAO',
  });
  assert(
    coerced.model === 'ARAGUAIA' && coerced.source === 'project',
    'Preview coerce Chacreamento Araguaia',
  );
  const otherProj = resolveSaleContractModelFromContext({
    projectModel: null,
    projectName: 'Outro Empreendimento',
    companyModel: 'MENESES',
  });
  assert(otherProj.model === 'MENESES' && otherProj.source === 'company', 'Preview sem coerce outros');
  process.env.VERCEL_ENV = 'production';
  const prodNoCoerce = resolveSaleContractModelFromContext({
    projectModel: null,
    projectName: 'Chacreamento Araguaia',
    companyModel: 'PADRAO',
  });
  assert(
    prodNoCoerce.model === 'PADRAO' && prodNoCoerce.source === 'company',
    'Production sem coerce Araguaia',
  );
  if (prevVercel === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = prevVercel;
  if (prevNode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevNode;
}

function testSellersResolution() {
  const defaults = resolveProjectContractSellers({
    project: PROJECT,
    contractModel: 'ARAGUAIA',
  });
  assert(defaults.length === 2, '2 vendedores default');
  assert(defaults[0].name.includes('Daniel'), 'Daniel');
  assert(defaults[1].name.includes('Aldenise'), 'Aldenise');
  assert(Boolean(defaults[0].cpf?.includes('820')), 'CPF Daniel');
  assert(Boolean(defaults[1].cpf?.includes('856')), 'CPF Aldenise');

  const override = resolveProjectContractSellers({
    project: {
      ...PROJECT,
      seller_parties_json: [
        {
          order: 1,
          name: 'Vendedor Mundo Novo 1',
          cpf: '111.111.111-11',
          rg: '1',
        },
      ],
    },
    contractModel: 'ARAGUAIA',
  });
  assert(override[0].name.includes('Mundo Novo'), 'override por projeto');

  const otherModel = resolveProjectContractSellers({
    project: { name: 'Outro' },
    contractModel: 'MENESES',
  });
  assert(otherModel.length === 0, 'sem fallback fora do Araguaia');
  assert(ARAGUAIA_DEFAULT_SELLERS.length === 2, 'constante default');
}

function testHtmlGeneration() {
  const html = generateContractHTML({
    tenant: TENANT,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
  });

  assert(html.includes('sv-contract-araguaia'), 'root class');
  assert(html.includes(ARAGUAIA_CONTRACT_TITLE), 'título');
  assert(html.includes(ARAGUAIA_LEGAL_MARKER), 'cláusula primeira');
  assert(
    html.includes('Daniel Roberto Rivelino de Sousa') ||
      html.includes('DANIEL ROBERTO RIVELINO DE SOUSA'),
    'vendedor 1',
  );
  assert(
    html.includes('Aldenise Alves Sousa') || html.includes('ALDENISE ALVES SOUSA'),
    'vendedor 2',
  );
  assert(html.includes('820.912.262-20') || html.includes('82091226220'), 'CPF Daniel');
  assert(html.includes('INTERVENIENTE'), 'papel interveniente');
  assert(html.includes('R R NEGÓCIOS'), 'razão interveniente');
  assert(html.includes('Cliente Teste Araguaia'), 'comprador');
  assert(/chácara nº/i.test(html), 'chácara');
  assert(html.includes('IGP-M'), 'correção IGP-M');
  assert(html.includes('Corretor Exemplo'), 'corretor');
  assert(html.includes('PROMITENTE VENDEDOR'), 'assinatura vendedor');
  assert(html.includes('TESTEMUNHA 1'), 'testemunha 1');
  assert(html.includes('TESTEMUNHA 2'), 'testemunha 2');
  assert(html.includes('contract-closing-and-signatures--araguaia'), 'pack assinaturas');
  assert(!html.includes('Quadro Financeiro') && !html.includes('payment-summary'), 'sem quadro financeiro');
  assert(!html.includes('araguaia-dev-pending'), 'sem quadro amarelo');
  assert(!html.includes('Preview de desenvolvimento'), 'sem banner preview');
  assert(!html.includes('[nacionalidade pendente]'), 'sem placeholder nacionalidade');
  assert(!html.includes('[estado civil pendente]'), 'sem placeholder estado civil');
  assert(!html.includes('[profissão pendente]'), 'sem placeholder profissão');
  assert(!html.includes('[endereço pendente]'), 'sem placeholder endereço');
  assert(!html.includes('confrontando com'), 'sem confrontações');
  assert(!html.includes('confrontando-se da seguinte forma'), 'sem intro confrontações');
  assert(!html.includes('confrontando pela'), 'sem confrontando pela');
  assert(!html.includes('confrontante'), 'sem palavra confrontante');
  assert(html.includes('medindo:'), 'intro medidas texto corrido');
  assert(html.includes('frente'), 'medida frente');
  assert(html.includes('fundo'), 'medida fundo');
  assert(html.includes('lateral direita'), 'medida lateral direita');
  assert(html.includes('lateral esquerda'), 'medida lateral esquerda');
  assert(html.includes('metros'), 'medida por extenso');
  assert(!html.includes('<strong>Frente:</strong>'), 'sem lista Frente:');
  assert(!html.includes('possuindo:'), 'sem intro lista antiga');
  assert(html.includes('araguaia-closing-statement'), 'fecho no pack');
  assert(html.includes('03'), 'três vias');
  assert(html.includes('araguaia-clause-keep'), 'keep título+lead');
  assert(html.includes('metros quadrados') || html.includes('m²'), 'área');
  assert(html.includes('4606073-PC/PA') || html.includes('4606073'), 'RG Daniel');
  assert(html.includes('5279360-PC/PA') || html.includes('5279360'), 'RG Aldenise');
  assert(html.includes('produtor rural'), 'qualificação Daniel');
  assert(html.includes('funcionária pública municipal'), 'qualificação Aldenise');
  assert(html.includes('Índice Geral de Preços de Mercado – IGP-M'), 'item1 IGP-M completo');
  assert(html.includes('Índice Geral de Preços do Mercado – IGP-M'), 'item2 IGP-M completo');
  assert(html.includes('araguaia-financial-item-1-3'), 'wrapper item 1.3');
  assert(html.includes('araguaia-financial-item-8'), 'wrapper item 8');
  assert(html.includes('araguaia-general-conditions-item-3'), 'wrapper CG item 3');
  assert(html.includes('araguaia-general-conditions-item-4'), 'wrapper CG item 4');
  assert(html.includes('araguaia-sixth-letter-b'), 'wrapper sexta alínea B');
  assert(html.includes('araguaia-sixth-letter-c'), 'wrapper sexta alínea C');
  assert(html.includes('araguaia-ninth-letter-c'), 'wrapper nona alínea C');
  assert(html.includes('araguaia-keep-together'), 'classe keep-together');
  assert(html.includes('Avenida dos Ipês'), 'endereço vendedores');

  const sigMarker = '<div class="contract-closing-and-signatures--araguaia">';
  const sigIdx = html.indexOf(sigMarker);
  assert(sigIdx >= 0, 'bloco assinaturas presente');
  const sigBlock = html.slice(sigIdx);
  assert(sigBlock.includes('Daniel Roberto Rivelino de Sousa'), 'sig Daniel');
  assert(sigBlock.includes('Aldenise Alves Sousa'), 'sig Aldenise');
  assert(sigBlock.includes('Cliente Teste Araguaia'), 'sig comprador');
  assert(sigBlock.includes('TESTEMUNHA 1'), 'sig testemunha 1');
  assert(sigBlock.includes('TESTEMUNHA 2'), 'sig testemunha 2');
  assert(!/<p[^>]*>INTERVENIENTE<\/p>/i.test(sigBlock), 'sig sem INTERVENIENTE');
  assert(!sigBlock.includes('R R NEGÓCIOS'), 'sig sem R R Negócios');
  assert(!sigBlock.includes('signature-slot-intervenient'), 'sig sem slot interveniente');
  assert(!sigBlock.includes('CÔNJUGE DO PROMITENTE'), 'sig sem cônjuge (venda sem spouse)');
}

function testSignatureBlockWithSpouse() {
  const html = generateContractHTML({
    tenant: TENANT,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: {
      ...SALE,
      has_spouse: true,
      sale_spouse_name: 'João Cônjuge Araguaia',
      sale_spouse_cpf: '39053344705',
      sale_spouse_nationality: 'Brasileiro',
      sale_spouse_marital_status: 'Casado',
      sale_spouse_profession: 'Comerciante',
    },
    financeReceipts: RECEIPTS,
  });
  const sigMarker = '<div class="contract-closing-and-signatures--araguaia">';
  const sigIdx = html.indexOf(sigMarker);
  assert(sigIdx >= 0, 'bloco com cônjuge presente');
  const sigBlock = html.slice(sigIdx);
  assert(sigBlock.includes('CÔNJUGE DO PROMITENTE COMPRADOR'), 'slot cônjuge');
  assert(sigBlock.includes('João Cônjuge Araguaia') || sigBlock.includes('Joao Cônjuge'), 'nome cônjuge');
  assert(sigBlock.includes('390.533.447-05') || sigBlock.includes('39053344705'), 'CPF cônjuge');
  assert(sigBlock.includes('signature-slot-spouse'), 'classe spouse');
  assert(!/<p[^>]*>INTERVENIENTE<\/p>/i.test(sigBlock), 'com cônjuge sem INTERVENIENTE');
  assert(!sigBlock.includes('R R NEGÓCIOS'), 'com cônjuge sem R R no bloco');
  assert(html.includes('INTERVENIENTE'), 'R R permanece no corpo/preâmbulo');
}

function testOriginalFidelityMarkers() {
  const html = generateContractHTML({
    tenant: TENANT,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
  });

  const must = [
    ['55.278', 'matrícula nº 55.278'],
    ['MB034600000389', 'título INCRA'],
    ['54600003311/2010-71', 'processo administrativo'],
    ['99 chácaras', '99 chácaras'],
    ['nota promissória', 'nota promissória'],
    ['pro solvendo', 'pro solvendo'],
    ['2%', 'multa 2%'],
    ['0,0333%', 'juros dia 0,0333%'],
    ['20%', 'honorários 20%'],
    ['30', 'inadimplência 30 dias'],
    ['03', 'inadimplência 03 parcelas'],
    ['25%', 'retenção 25%'],
    ['carta de quitação', 'carta de quitação'],
    ['georreferenciamento', 'georreferenciamento'],
    ['10%', 'multa 10%'],
    ['escritura', 'escritura'],
    ['CESSÃO E TRANSFERÊNCIA', 'cessão e transferência'],
    ['anuência do cônjuge', 'anuência do cônjuge'],
    ['última parcela paga', 'taxa última parcela'],
    ['arruamento', 'arruamento'],
    ['limpo', 'limpeza'],
    ['cercamento', 'cercamento'],
    ['05%', 'diferença 05%'],
    ['Corretor Exemplo', 'corretor dinâmico'],
    ['Comarca de Parauapebas', 'foro Parauapebas'],
    ['Índice Geral de Preços de Mercado – IGP-M', 'IGP-M item 1 completo'],
    ['Índice Geral de Preços do Mercado – IGP-M', 'IGP-M item 2 completo'],
    ['DESCRIÇÃO DO IMÓVEL', 'título cláusula primeira'],
    ['CONDIÇÕES GERAIS', 'condições gerais'],
    ['CIÊNCIA DO CONTRATO', 'ciência'],
    ['IRREVOGABILIDADE DA TRANSAÇÃO', 'irrevogabilidade'],
    ['RESCISÃO', 'rescisão'],
    ['SUCESSÃO CONTRATUAL', 'sucessão'],
    ['DISPOSIÇÕES GERAIS', 'disposições gerais'],
  ];
  for (const [needle, label] of must) {
    assert(html.includes(needle), `fidelidade: ${label}`);
  }
  assert(!html.includes('confrontando pela direita'), 'fidelidade: sem confrontante direita');
  assert(!html.includes('confrontando pela esquerda'), 'fidelidade: sem confrontante esquerda');
  assert(
    !html.includes('foro da comarca do imóvel ou da sede'),
    'fidelidade: sem foro antigo genérico',
  );
}

function testIsolationOtherModels() {
  const meneses = generateContractHTML({
    tenant: { ...TENANT, contract_model: 'MENESES', name: 'Meneses' },
    customer: CUSTOMER,
    project: { name: 'X', city: 'Y', uf: 'PA' },
    block: { number: '1', block_name: '01', area: 300 },
    sale: { ...SALE, installment_correction_type: 'FIXED' },
    financeReceipts: RECEIPTS,
  });
  assert(!meneses.includes('sv-contract-araguaia'), 'Meneses sem Araguaia');
  assert(!meneses.includes('Daniel Roberto Rivelino'), 'Meneses sem Daniel');

  const recanto = generateContractHTML({
    tenant: { contract_model: 'RECANTO_PRIMAVERA', name: 'Recanto Co' },
    customer: CUSTOMER,
    project: { name: 'Recanto Primavera', city: 'X', uf: 'PA' },
    block: { number: '1', block_name: '01', area: 300 },
    sale: SALE,
    financeReceipts: RECEIPTS,
  });
  assert(!recanto.includes('sv-contract-araguaia'), 'Recanto sem Araguaia');
  assert(!recanto.includes('Daniel Roberto Rivelino'), 'Recanto sem Daniel');
}

function testAreaExtenso() {
  const text = formatAraguaiaAreaExtenso(1250.5);
  assert(Boolean(text) && text.includes('metros quadrados'), 'área por extenso');
  assert(formatAraguaiaMetersExtenso(20) === 'vinte metros', '20 m extenso');
  assert(
    formatAraguaiaMetersExtenso(20.5) === 'vinte metros e cinquenta centímetros',
    '20,50 m extenso',
  );
  assert(
    formatAraguaiaMetersExtenso(60) === 'sessenta metros',
    '60 m extenso',
  );
}

function testSourceFilesExist() {
  const root = process.cwd();
  for (const rel of [
    'lib/araguaiaContractTemplate.ts',
    'lib/araguaiaContractContext.ts',
    'lib/araguaiaContractClauses.ts',
    'lib/araguaiaContractParties.ts',
    'lib/araguaiaContractLot.ts',
    'lib/projectContractSellers.ts',
    'supabase/migrations/20260820120000_projects_seller_parties_json.sql',
  ]) {
    assert(fs.existsSync(path.join(root, rel)), `arquivo ${rel}`);
  }
}

/** Pack Araguaia: não forçar página por y%PAGE_H (página vazia antes do fecho). */
function testAraguaiaPackNoContinuousForceBreak() {
  const engine = fs.readFileSync(
    path.join(process.cwd(), 'lib/contractPaginationEngine.ts'),
    'utf8',
  );
  assert(
    engine.includes("contract-closing-and-signatures--araguaia'),") ||
      engine.includes('araguaiaClosingPack'),
    'engine conhece pack Araguaia',
  );
  assert(
    !engine.includes(
      "pack.classList.contains('contract-closing-and-signatures--araguaia')\n    ) {\n      signature = 'new-page';",
    ),
    'measure script sem force new-page contínuo Araguaia',
  );
  assert(
    !engine.includes(
      "// Araguaia: fecho+data+assinaturas juntos na página seguinte se não cabem.",
    ),
    'applyBreaks sem force contínuo Araguaia',
  );
}

function main() {
  testModelRegistration();
  testSellersResolution();
  testAreaExtenso();
  testHtmlGeneration();
  testSignatureBlockWithSpouse();
  testOriginalFidelityMarkers();
  testIsolationOtherModels();
  testSourceFilesExist();
  testAraguaiaPackNoContinuousForceBreak();
  console.log('mandatory-araguaia-contract-tests: all passed');
}

main();

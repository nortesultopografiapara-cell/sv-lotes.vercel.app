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
import { generateAraguaiaContract } from '../lib/araguaiaContractTemplate';
import { buildAraguaiaContractContext } from '../lib/araguaiaContractContext';
import { buildContractPdfChromeFromTenant } from '../lib/contractPdfPostProcess';
import {
  formatAraguaiaNeutralNationality,
  formatAraguaiaRgAfterNumeroLabel,
  formatAraguaiaSeatAddressParts,
  stripAraguaiaPresentedSnToken,
  stripAraguaiaRgLabelPrefix,
} from '../lib/araguaiaContractQualification';
import { resolveAraguaiaPromitenteVendors } from '../lib/araguaiaCompanyLegalRepresentative';

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
  assert(html.includes('confrontando com'), 'com confrontações dinâmicas');
  assert(html.includes('Rua Principal'), 'confrontante frente GIS');
  assert(html.includes('Área verde'), 'confrontante fundo GIS');
  assert(html.includes('Chácara 13'), 'confrontante lateral direita GIS');
  assert(html.includes('Chácara 11'), 'confrontante lateral esquerda GIS');
  assert(!html.includes('confrontando-se da seguinte forma'), 'sem intro lista antiga');
  assert(!html.includes('confrontando pela'), 'sem confrontando pela (legado)');
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
  assert(/Avenida dos Ip[eê]s/i.test(html), 'endereço vendedores');
  assert(/Cidade Jardim/i.test(html), 'bairro Cidade Jardim');
  assert(!/ambos residentes e domiciliados/i.test(html), 'sem residência conjunta dos vendedores');
  assert(/residente e domiciliado\(a\) no/i.test(html), 'residência individual no preâmbulo');
  assert(html.includes('Brasileiro(a)'), 'nacionalidade neutra Brasileiro(a)');
  assert(html.includes('Solteiro(a)'), 'estado civil neutro Solteiro(a)');
  assert(html.includes('Casado(a)'), 'estado civil neutro Casado(a)');
  assert(html.includes('inscrito(a) no CPF'), 'inscrito(a) no CPF');
  assert(!html.includes('inscrita no CPF'), 'sem inscrita exclusivo por índice');
  assert(!html.includes('RG nº RG nº'), 'sem RG duplicado no HTML padrão');
  assert(
    html.includes(
      'CLÁUSULA TERCEIRA – DA PROMESSA E COMPRA E VENDA DO VALOR DO IMÓVEL E DAS CONDIÇÕES DE PAGAMENTO',
    ),
    'título cláusula terceira sem ponto',
  );
  assert(!html.includes('VENDA. DO VALOR'), 'sem ponto indevido após VENDA');
  const preamblePage1 = html.slice(0, html.indexOf('CLÁUSULA PRIMEIRA'));
  assert(!/S\s*\/\s*N/i.test(preamblePage1), 'preâmbulo sem S/N');
  assert(!/,\s*,/.test(preamblePage1), 'preâmbulo sem vírgula duplicada');

  const sigMarker = 'contract-closing-and-signatures--araguaia';
  const sigIdx = html.indexOf(sigMarker);
  assert(sigIdx >= 0, 'bloco assinaturas presente');
  const sigBlock = html.slice(Math.max(0, sigIdx - 40));
  assert(sigBlock.includes('Daniel Roberto Rivelino de Sousa'), 'sig Daniel');
  assert(sigBlock.includes('Aldenise Alves Sousa'), 'sig Aldenise');
  assert(sigBlock.includes('Cliente Teste Araguaia'), 'sig comprador');
  assert(sigBlock.includes('PROMITENTE COMPRADOR'), 'sig papel comprador');
  assert(/<p[^>]*>INTERVENIENTE<\/p>/i.test(sigBlock), 'sig INTERVENIENTE no lugar do cônjuge');
  assert(sigBlock.includes('R R NEGÓCIOS'), 'sig R R no bloco');
  assert(
    sigBlock.includes('57.590.706/0001-78') || sigBlock.includes('57590706000178'),
    'sig CNPJ R R',
  );
  assert(sigBlock.includes('Representada por:'), 'sig representada por');
  assert(sigBlock.includes('signature-slot-intervenient'), 'classe interveniente');
  assert(sigBlock.includes('TESTEMUNHA 1'), 'sig testemunha 1');
  assert(sigBlock.includes('TESTEMUNHA 2'), 'sig testemunha 2');
  assert(!sigBlock.includes('CÔNJUGE DO PROMITENTE'), 'sig sem cônjuge (venda sem spouse)');
  assert(!sigBlock.includes('signature-slot-spouse'), 'sig sem slot spouse');
  assert(!html.includes('CÔNJUGE ANUENTE'), 'preâmbulo sem qualificação de cônjuge anuente');
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
  const sigMarker = 'contract-closing-and-signatures--araguaia';
  const sigIdx = html.indexOf(sigMarker);
  assert(sigIdx >= 0, 'bloco com cônjuge presente');
  const sigBlock = html.slice(Math.max(0, sigIdx - 40));
  assert(sigBlock.includes('Daniel Roberto Rivelino de Sousa'), 'com spouse: Daniel');
  assert(sigBlock.includes('Aldenise Alves Sousa'), 'com spouse: Aldenise');
  assert(sigBlock.includes('Cliente Teste Araguaia'), 'com spouse: comprador');
  assert(/<p[^>]*>INTERVENIENTE<\/p>/i.test(sigBlock), 'com spouse: INTERVENIENTE no bloco');
  assert(sigBlock.includes('R R NEGÓCIOS'), 'com spouse: R R no bloco');
  assert(sigBlock.includes('Representada por:'), 'com spouse: representada por');
  assert(sigBlock.includes('TESTEMUNHA 1') && sigBlock.includes('TESTEMUNHA 2'), 'com spouse: testemunhas');
  assert(!sigBlock.includes('CÔNJUGE DO PROMITENTE COMPRADOR'), 'sem slot cônjuge');
  assert(!sigBlock.includes('João Cônjuge Araguaia'), 'nome cônjuge fora do bloco de assinatura');
  assert(!sigBlock.includes('signature-slot-spouse'), 'sem classe spouse');
  assert(!html.includes('CÔNJUGE ANUENTE'), 'preâmbulo sem cônjuge anuente');
  assert(html.includes('INTERVENIENTE'), 'R R permanece no preâmbulo');
  assert(html.includes('anuência do cônjuge'), 'cláusula cessão intacta');
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

function testPreambleQualificationHotfix() {
  assert(stripAraguaiaRgLabelPrefix('RG nº 1389803') === '1389803', 'strip RG nº');
  assert(stripAraguaiaRgLabelPrefix('RG n° 1389803') === '1389803', 'strip RG n°');
  assert(stripAraguaiaRgLabelPrefix('RG nº RG nº 1389803') === '1389803', 'strip duplicado');
  assert(formatAraguaiaRgAfterNumeroLabel('1389803') === '1389803', 'RG só número');
  assert(formatAraguaiaNeutralNationality('Brasileira') === 'Brasileiro(a)', 'Brasileira → Brasileiro(a)');
  assert(formatAraguaiaNeutralNationality('brasileiro') === 'Brasileiro(a)', 'brasileiro → Brasileiro(a)');
  assert(formatAraguaiaNeutralNationality('') === '', 'nacionalidade vazia não inventa');
  assert(formatAraguaiaNeutralNationality('Italiana') === 'Italiana', 'outra nacionalidade preservada');
  assert(
    stripAraguaiaPresentedSnToken('Avenida Dos Ipês, S/N, Quadra 31, Lote 13, Cidade Jardim, Parauapebas, PA') ===
      'Avenida Dos Ipês, Quadra 31, Lote 13, Cidade Jardim, Parauapebas, PA',
    'strip S/N vendedores',
  );
  assert(
    stripAraguaiaPresentedSnToken('Avenida Dos Ipes, Quadra 31, Lote 13, S/N, Cidade Jardim, Parauapebas - PA') ===
      'Avenida Dos Ipes, Quadra 31, Lote 13, Cidade Jardim, Parauapebas - PA',
    'strip S/N empresa',
  );

  const htmlDup = generateContractHTML({
    tenant: {
      ...TENANT,
      address: 'Avenida Dos Ipes, Quadra 31, Lote 13, S/N',
      neighborhood: 'Cidade Jardim',
      city: 'Parauapebas',
      state: 'PA',
    },
    customer: { ...CUSTOMER, rg: 'RG nº 1389803' },
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
  });
  assert(!htmlDup.includes('RG nº RG nº'), 'RG armazenado com prefixo não duplica');
  assert(/RG nº 1389803/.test(htmlDup), 'RG nº + documento uma vez');
  assert(/Cidade Jardim/i.test(htmlDup), 'Cidade Jardim no preâmbulo');
  assert(!htmlDup.includes('—, S/N'), 'sem —, S/N');
  assert(!/S\s*\/\s*N/i.test(htmlDup.slice(0, htmlDup.indexOf('CLÁUSULA PRIMEIRA'))), 'preâmbulo hotfix sem S/N');
  assert(
    htmlDup.includes(
      'CLÁUSULA TERCEIRA – DA PROMESSA E COMPRA E VENDA DO VALOR DO IMÓVEL E DAS CONDIÇÕES DE PAGAMENTO',
    ),
    'cláusula terceira exata no HTML com RG prefixado',
  );
  const preamble = htmlDup.slice(0, htmlDup.indexOf('CLÁUSULA PRIMEIRA'));
  assert(preamble.includes('Brasileiro(a)'), 'comprador Brasileiro(a)');
  assert(preamble.includes('inscrito(a)'), 'comprador inscrito(a)');
  assert(!/ambos residentes e domiciliados/i.test(preamble), 'hotfix sem residência conjunta');
  assert(
    /DANIEL ROBERTO RIVELINO DE SOUSA<\/strong>, Brasileiro\(a\), Casado\(a\), produtor rural, inscrito\(a\) no CPF/i.test(
      preamble,
    ),
    'Daniel com qualificação completa dos defaults',
  );

  const chrome = buildContractPdfChromeFromTenant(
    {
      contract_model: 'ARAGUAIA',
      razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
      cnpj: '57590706000178',
      address: 'Avenida Dos Ipes, Quadra 31, Lote 13, S/N',
      neighborhood: 'Cidade Jardim',
      city: 'Parauapebas',
      state: 'PA',
    },
    '000000008/2026',
  );
  assert(/Cidade Jardim/i.test(chrome.addressLine), 'header ARAGUAIA com bairro');
  assert(/Quadra 31/i.test(chrome.addressLine), 'header preserva Quadra');
  assert(!/S\s*\/\s*N/i.test(chrome.addressLine), 'header ARAGUAIA sem S/N');
  assert(!/,\s*,/.test(chrome.addressLine), 'header sem vírgula duplicada');
  assert(
    (chrome.addressLine.match(/Cidade Jardim/gi) || []).length === 1,
    'header sem bairro duplicado',
  );

  const padraoChrome = buildContractPdfChromeFromTenant(
    {
      contract_model: 'PADRAO',
      razao_social: 'Empresa Padrão',
      address: 'Avenida Dos Ipes, Quadra 31, Lote 13, S/N',
      neighborhood: 'Cidade Jardim',
      city: 'Parauapebas',
      state: 'PA',
    },
    '1',
  );
  assert(
    !/Cidade Jardim/i.test(padraoChrome.addressLine),
    'PADRAO não recebe bairro do helper ARAGUAIA',
  );
  assert(/S\/N/i.test(padraoChrome.addressLine), 'PADRAO preserva S/N do helper compartilhado');

  const seat = formatAraguaiaSeatAddressParts({
    address: 'Avenida Dos Ipes, Quadra 31, Lote 13, S/N',
    neighborhood: 'Cidade Jardim',
    city: 'Parauapebas',
    state: 'PA',
  });
  assert(/Cidade Jardim/i.test(seat.fullInline), 'fullInline com bairro');
  assert(!/S\s*\/\s*N/i.test(seat.fullInline), 'fullInline sem S/N');
  assert(!/,\s*,/.test(seat.fullInline), 'fullInline sem vírgula duplicada');
  assert(/Lote 13, Cidade Jardim/i.test(seat.fullInline), 'Lote seguido de bairro sem S/N');

  const incompleteCompany = {
    contract_model: 'ARAGUAIA',
    razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
    cnpj: '57590706000178',
    legal_representative: 'Daniel Roberto Rivelino de Sousa',
    representative_cpf: '820.912.262-20',
    legal_representative_role: 'produtor rural',
    address: 'Avenida Dos Ipes, Quadra 31, Lote 13, S/N',
    neighborhood: 'Cidade Jardim',
    city: 'Parauapebas',
    state: 'PA',
  };
  const incompleteCtx = buildAraguaiaContractContext({
    tenant: incompleteCompany,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
    esignV2: true,
  });
  assert(incompleteCtx.sellers.length === 1, 'V2: só o representante');
  assert(!incompleteCtx.sellers[0].nationality, 'V2 sem nacionalidade cadastrada');
  assert(!incompleteCtx.sellers[0].maritalStatus, 'V2 sem estado civil cadastrado');
  assert(!incompleteCtx.sellers[0].profession, 'V2 sem profissão cadastrada');
  assert(!incompleteCtx.sellers[0].rg, 'V2 sem RG cadastrado');
  assert(!incompleteCtx.sellers[0].address, 'V2 sem residência pessoal cadastrada');
  assert(
    incompleteCtx.pendingFields.some((f) => /nacionalidade de Daniel/i.test(f)),
    'pending nacionalidade Daniel',
  );
  assert(
    incompleteCtx.pendingFields.some((f) => /estado civil de Daniel/i.test(f)),
    'pending estado civil Daniel',
  );
  assert(
    incompleteCtx.pendingFields.some((f) => /RG de Daniel/i.test(f)),
    'pending RG Daniel',
  );
  const incompleteHtml = generateAraguaiaContract({
    tenant: incompleteCompany,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
    esignV2: true,
  });
  const incompletePreamble = incompleteHtml.slice(
    0,
    incompleteHtml.indexOf('CLÁUSULA PRIMEIRA'),
  );
  assert(
    /DANIEL ROBERTO RIVELINO DE SOUSA<\/strong>, inscrito\(a\) no CPF/i.test(
      incompletePreamble,
    ),
    'Daniel incompleto usa só campos existentes',
  );
  assert(
    !/DANIEL ROBERTO RIVELINO DE SOUSA<\/strong>, produtor rural/i.test(incompletePreamble),
    'cargo não vira profissão no ARAGUAIA',
  );
  assert(!/produtor rural/i.test(incompletePreamble), 'profissão vazia omitida');
  assert(
    !/DANIEL ROBERTO RIVELINO DE SOUSA<\/strong>, Brasileiro\(a\)/i.test(incompletePreamble),
    'não inventa Brasileiro(a) para Daniel',
  );
  assert(!/inscrita no CPF/.test(incompletePreamble), 'V2 usa inscrito(a)');

  const completeCompany = {
    ...incompleteCompany,
    contract_legal_nationality: 'brasileiro',
    contract_legal_marital_status: 'casado',
    contract_legal_profession: 'produtor rural',
    contract_legal_rg: '4606073',
    contract_legal_rg_issuer: 'PC/PA',
  };
  const completeHtml = generateAraguaiaContract({
    tenant: completeCompany,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
    esignV2: true,
  });
  const completePreamble = completeHtml.slice(0, completeHtml.indexOf('CLÁUSULA PRIMEIRA'));
  assert(
    /DANIEL ROBERTO RIVELINO DE SOUSA<\/strong>, Brasileiro\(a\), Casado\(a\), produtor rural, inscrito\(a\) no CPF/i.test(
      completePreamble,
    ),
    'Daniel completo quando cadastro legal tem os campos',
  );
  assert(/RG nº <strong>4606073/.test(completePreamble), 'RG Daniel do cadastro legal');

  const otherModelVendors = resolveAraguaiaPromitenteVendors({
    company: {},
    project: { name: 'Outro' },
    contractModel: 'MENESES',
    mode: 'legacy',
  });
  assert(otherModelVendors.length === 0, 'MENESES sem fallback Daniel');
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
    'lib/araguaiaContractQualification.ts',
    'lib/projectContractSellers.ts',
    'supabase/migrations/20260820120000_projects_seller_parties_json.sql',
    'supabase/migrations/20261012120000_companies_legal_representative_qualification.sql',
  ]) {
    assert(fs.existsSync(path.join(root, rel)), `arquivo ${rel}`);
  }
}

/** Etapa 13 — numeração única PRIMEIRA…DÉCIMA TERCEIRA + refs cruzadas. */
function testAraguaiaClauseNumbering() {
  const html = generateContractHTML({
    tenant: TENANT,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
  });

  const expectedOrdinals = [
    'PRIMEIRA',
    'SEGUNDA',
    'TERCEIRA',
    'QUARTA',
    'QUINTA',
    'SEXTA',
    'SÉTIMA',
    'OITAVA',
    'NONA',
    'DÉCIMA',
    'DÉCIMA PRIMEIRA',
    'DÉCIMA SEGUNDA',
    'DÉCIMA TERCEIRA',
  ] as const;

  const titleRe =
    /CLÁUSULA\s+(PRIMEIRA|SEGUNDA|TERCEIRA|QUARTA|QUINTA|SEXTA|SÉTIMA|OITAVA|NONA|DÉCIMA(?:\s+PRIMEIRA|\s+SEGUNDA|\s+TERCEIRA)?)\s*[–-]/gi;
  const titles: { ordinal: string; full: string }[] = [];
  for (const m of html.matchAll(titleRe)) {
    titles.push({ ordinal: m[1].replace(/\s+/g, ' ').trim().toUpperCase(), full: m[0] });
  }

  assert(titles.length === 13, `exatamente 13 títulos (obtido ${titles.length})`);

  const ordinals = titles.map((t) => t.ordinal);
  for (let i = 0; i < expectedOrdinals.length; i++) {
    assert(
      ordinals[i] === expectedOrdinals[i],
      `ordinal #${i + 1} = ${expectedOrdinals[i]} (obtido ${ordinals[i]})`,
    );
  }

  const uniq = new Set(ordinals);
  assert(uniq.size === 13, 'nenhum ordinal duplicado');
  assert(
    /CLÁUSULA\s+DÉCIMA TERCEIRA\s*[–-]\s*FORO/i.test(html),
    'FORO = DÉCIMA TERCEIRA',
  );

  assert(
    /CLÁUSULA\s+QUARTA\s*[–-]\s*CONDIÇÕES GERAIS/i.test(html),
    'CONDIÇÕES GERAIS = QUARTA',
  );
  assert(
    html.includes(
      'CLÁUSULA TERCEIRA – DA PROMESSA E COMPRA E VENDA DO VALOR DO IMÓVEL E DAS CONDIÇÕES DE PAGAMENTO',
    ),
    'título cláusula terceira exato na numeração',
  );
  assert(!html.includes('VENDA. DO VALOR'), 'numeração sem VENDA. DO VALOR');

  // Refs cruzadas semânticas
  assert(
    /infraestrutura descrita na cláusula nona deste contrato/i.test(html),
    'ref infraestrutura → cláusula nona',
  );
  assert(
    !/infraestrutura descrita na cláusula oitava deste contrato/i.test(html),
    'sem ref infraestrutura → cláusula oitava',
  );
  assert(
    /descrito na cláusula segunda deste (instrumento|contrato)/i.test(html),
    'ref imóvel → cláusula segunda preservada',
  );
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
  testPreambleQualificationHotfix();
  testSignatureBlockWithSpouse();
  testOriginalFidelityMarkers();
  testIsolationOtherModels();
  testSourceFilesExist();
  testAraguaiaClauseNumbering();
  testAraguaiaPackNoContinuousForceBreak();
  console.log('mandatory-araguaia-contract-tests: all passed');
}

main();

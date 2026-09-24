/**
 * Testes obrigatórios — modelo ESTRELA_DO_SUL.
 * npx tsx scripts/mandatory-estrela-do-sul-contract-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateContractHTML } from '../lib/contractTemplate';
import {
  SALE_CONTRACT_MODEL_LABELS,
  SALE_CONTRACT_MODEL_OPTIONS,
  isEstrelaDoSulContractModel,
  normalizeSaleContractModel,
  resolveSaleContractModelFromContext,
} from '../lib/contractModel';
import { downPaymentReducesInstallmentBase } from '../lib/saleInstallmentCalc';
import { getCatalogPolicy, canonicalizeCatalogKey } from '../lib/contract-termination/policyCatalog';
import {
  ESTRELA_DO_SUL_DOCUMENT_DIVERGENCES,
} from '../lib/estrelaDoSulContractConstants';
import { buildEstrelaDoSulEsignVendorPartyInputs } from '../lib/estrelaDoSulContractEsign';
import {
  shouldCreateSpouseSignatureParty,
  supportsSpouseElectronicSignature,
  contractHtmlLooksLikeRecanto,
} from '../lib/saleContractSignaturePartyRules';
import { isAraguaiaSaleContractModel } from '../lib/araguaiaContractEsign';
import { isMundoNovoSaleContractModel } from '../lib/mundoNovoContractEsign';
import {
  formatEstrelaMetersExtenso,
  formatEstrelaMetersPhrase,
} from '../lib/estrelaDoSulContractFormat';
import { collapseEstrelaDuplicateEditorialNumbers } from '../lib/estrelaDoSulContractClauses';
import { resolveEstrelaDoSulSaleCommissionAmount } from '../lib/estrelaDoSulContractContext';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function assertNotIncludes(html: string, needle: string, msg: string) {
  if (html.includes(needle)) {
    throw new Error(`${msg}: não deveria conter "${needle}"`);
  }
}

const SECOND_VENDOR = {
  name: 'Antonio Ferreira Silva',
  cpf: '71877312215',
  rg: '1234567',
  rgIssuer: 'SSP',
  rgUf: 'PA',
  nationality: 'Brasileiro',
  maritalStatus: 'Casado',
  profession: 'Empresário',
  email: 'antonio@estrela.test',
  phone: '94991001122',
  address: 'Rua B, 10',
};

const COMPANY = {
  name: 'L.F. IMOVEIS LTDA',
  razao_social: 'L.F. IMOVEIS LTDA',
  fantasy_name: 'LF IMOVEIS',
  cnpj: '47052349000130',
  address: 'Rua 24 de Marco, 99, Bairro Da Paz',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
  email: 'contato@lfimoveis.test',
  phone: '94988887777',
  legal_representative: 'Luzia Felipe',
  representative_cpf: '11144477735',
  legal_representative_email: 'luzia@lfimoveis.test',
  legal_representative_phone: '94988887777',
  contract_model: 'ESTRELA_DO_SUL',
};

const CUSTOMER = {
  name: 'Joao Comprador da Silva',
  document: '52998224725',
  cpf: '52998224725',
  profession: 'Agricultor',
  civil_state: 'Casado',
  nationality: 'brasileiro',
  address: 'Rua A, 100',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
  email: 'joao@comprador.test',
  phone: '94991112233',
  rg: '8741233',
  rg_issuer: 'SSP',
  rg_issuer_state: 'PA',
};

const PROJECT = {
  name: 'Chacreamento Estrela do Sul',
  city: 'Parauapebas',
  uf: 'PA',
  neighborhood: 'Palmares 2',
  forum_city: 'Parauapebas',
  contract_model: 'ESTRELA_DO_SUL',
};

const BLOCK = {
  quadra: '02',
  lot: '15',
  area: 1100,
  frente: 20,
  fundo: 20,
  'Lado Dir.': 55,
  'Lado Esq.': 55,
};

const SALE = {
  payment_type: 'Parcelado',
  installments_count: 10,
  total_value: 50000,
  down_payment: 5000,
  installment_value: 4500,
  first_installment_due_date: '2026-03-20',
  sale_date: '2026-02-20',
  installment_correction_type: 'IGPM',
  brokers: { name: 'Corretor Estrela', cpf: '39053344705', creci: '12345-PA' },
  broker_commissions: [{ amount: 1500 }],
};

const RECEIPTS = Array.from({ length: 10 }, (_, i) => ({
  installment_number: i + 1,
  amount: 4500,
  due_date: `2026-${String((i % 12) + 3).padStart(2, '0')}-20`,
  status: 'pendente',
}));

function html(overrides: {
  tenant?: Record<string, unknown>;
  sale?: Record<string, unknown>;
  customer?: Record<string, unknown>;
  block?: Record<string, unknown>;
} = {}) {
  return generateContractHTML({
    tenant: { ...COMPANY, ...(overrides.tenant || {}) },
    customer: { ...CUSTOMER, ...(overrides.customer || {}) },
    project: PROJECT,
    block: { ...BLOCK, ...(overrides.block || {}) },
    sale: { ...SALE, ...(overrides.sale || {}) },
    financeReceipts: RECEIPTS,
  });
}

assert(normalizeSaleContractModel('CHACREAMENTO_ESTRELA_DO_SUL') === 'ESTRELA_DO_SUL', 'alias CHACREAMENTO_');
assert(SALE_CONTRACT_MODEL_OPTIONS.includes('ESTRELA_DO_SUL'), 'opção no seletor de projeto');
assert(
  SALE_CONTRACT_MODEL_LABELS.ESTRELA_DO_SUL === 'Chacreamento Estrela do Sul',
  'label UI',
);
assert(isEstrelaDoSulContractModel(COMPANY), 'isEstrelaDoSulContractModel');
assert(
  resolveSaleContractModelFromContext({
    projectModel: 'ESTRELA_DO_SUL',
    companyModel: 'PADRAO',
  }).model === 'ESTRELA_DO_SUL',
  'projeto prevalece sobre empresa',
);

assert(downPaymentReducesInstallmentBase('ESTRELA_DO_SUL') === true, 'arras abatem o saldo');
assert(downPaymentReducesInstallmentBase('RECANTO_PRIMAVERA') === false, 'Recanto inalterado');
assert(downPaymentReducesInstallmentBase('PADRAO') === true, 'PADRAO inalterado');

const policy = getCatalogPolicy(canonicalizeCatalogKey('ESTRELA_DO_SUL'));
assert(policy?.catalogKey === 'ESTRELA_DO_SUL', 'catálogo próprio');
assert(policy?.status === 'INCOMPLETE', 'distrato INCOMPLETE');
assert(policy?.contractualRetentionPercent == null, 'não herda 25% Araguaia');

assert(supportsSpouseElectronicSignature('ESTRELA_DO_SUL'), 'e-sign cônjuge permitido');
assert(!isAraguaiaSaleContractModel('ESTRELA_DO_SUL'), 'não é Araguaia');
assert(!isMundoNovoSaleContractModel('ESTRELA_DO_SUL'), 'não é Mundo Novo');

const onlyCompany = html();
assert(onlyCompany.includes('data-contract-model="ESTRELA_DO_SUL"'), 'marcador de modelo');
assert(onlyCompany.includes('CLÁUSULA PRIMEIRA'), 'cláusula primeira');
assert(onlyCompany.includes('DO OBJETO, DA CAPA RESUMO'), 'objeto da capa');
assert(onlyCompany.includes('CAPA RESUMO DO CONTRATO'), 'capa resumo');
assert(onlyCompany.includes('L.F. IMOVEIS LTDA'), 'empresa PJ');
assert(onlyCompany.includes('47.052.349/0001-30'), 'CNPJ dinâmico');
assert(onlyCompany.includes('Joao Comprador'), 'comprador');
assert(onlyCompany.includes('Chacreamento Estrela'), 'empreendimento dinâmico');
assert(onlyCompany.includes('Palmares'), 'localidade GIS/projeto');
assert(onlyCompany.includes('Quadra 02') || onlyCompany.includes('quadra 02') || onlyCompany.includes('02'), 'quadra');
assert(onlyCompany.includes('15'), 'lote');
assert(onlyCompany.includes('1.100,00m²') || onlyCompany.includes('1100'), 'área GIS');
assert(onlyCompany.includes('20,00m'), 'frente GIS');
assert(onlyCompany.includes('55,00m'), 'laterais GIS');
assert(onlyCompany.includes('50.000,00'), 'preço da venda');
assert(onlyCompany.includes('5.000,00'), 'sinal da venda');
assert(onlyCompany.includes('1.500,00'), 'corretagem da venda');
assert(onlyCompany.includes('MEDIDAS E CONFRONTAÇÕES'), 'rótulo medidas e confrontações');
assert(!onlyCompany.includes('ARRAS<sup>2</sup>'), 'sem sobrescrito ARRAS²');
assert(!onlyCompany.includes('PARCELAS E VALORES<sup>3</sup>'), 'sem sobrescrito PARCELAS³');
assert(!onlyCompany.includes('CONFLITOS<sup>4</sup>'), 'sem sobrescrito CONFLITOS⁴');
assert(onlyCompany.includes('width:33%'), 'coluna Informação ~33%');
assert(onlyCompany.includes('width:67%'), 'coluna Detalhamento ~67%');
assert(onlyCompany.includes('10 (dez) parcela') || onlyCompany.includes('10 (dez)'), 'parcelas dinâmicas');
assert(onlyCompany.includes('TESTEMUNHA 1'), 'testemunha 1 visual');
assert(onlyCompany.includes('TESTEMUNHA 2'), 'testemunha 2 visual');
assertNotIncludes(onlyCompany, 'Rio Parauapebas', 'não copia empreendimento alheio');
assertNotIncludes(onlyCompany, '38.500,00', 'não copia preço do exemplo');
assertNotIncludes(onlyCompany, 'INTERVENIENT', 'sem interveniente');
assertNotIncludes(onlyCompany, 'Daniel Roberto', 'sem vendedor Araguaia');
assertNotIncludes(onlyCompany, 'CLÁUSULA PRIMEIRA – DAS DECLARAÇÕES INICIAIS', 'não é Recanto');
assert(!contractHtmlLooksLikeRecanto(onlyCompany), 'HTML Estrela não parece Recanto');
assert(
  !shouldCreateSpouseSignatureParty({
    contractModel: 'ESTRELA_DO_SUL',
    sale: SALE,
    contractHtml: onlyCompany,
  }),
  'sem cônjuge na venda → sem party SPOUSE',
);

const withSecond = html({
  tenant: { contract_second_vendor_json: SECOND_VENDOR },
});
assert(withSecond.includes('Antonio Ferreira Silva'), 'segundo vendedor');
assert(withSecond.includes('718.773.122-15'), 'CPF segundo vendedor');
assert(withSecond.includes('40%'), 'narrativa parceria (não split financeiro)');
assert(
  (withSecond.match(/data-party-role="VENDOR"/g) || []).length === 2,
  'e-sign: dois VENDOR no instrumento (capa visual não duplica party)',
);
assert(
  (withSecond.match(/data-estrela-sign-block="capa"/g) || []).length === 1,
  'bloco de assinatura da capa',
);
assert(
  (withSecond.match(/data-estrela-sign-block="instrumento"/g) || []).length === 1,
  'bloco de assinatura do instrumento',
);

const vendors = buildEstrelaDoSulEsignVendorPartyInputs({
  company: { ...COMPANY, contract_second_vendor_json: SECOND_VENDOR },
});
assert(vendors.length === 2, 'e-sign 2 VENDOR');
assert(vendors[0].name === 'Luzia Felipe', 'VENDOR 1 = representante legal');
assert(vendors[1].name === 'Antonio Ferreira Silva', 'VENDOR 2 = JSON');
assert(
  buildEstrelaDoSulEsignVendorPartyInputs({ company: COMPANY }).length === 1,
  'sem JSON completo → só empresa',
);

const withSpouse = html({
  sale: {
    has_spouse: true,
    sale_spouse_name: 'Maria Souza Anuente',
    sale_spouse_cpf: '39053344705',
    sale_spouse_phone: '64999998888',
    sale_spouse_email: 'maria@test.com',
  },
});
assert(withSpouse.includes('Maria Souza Anuente'), 'cônjuge no contrato');
assert(
  (withSpouse.match(/data-party-role="SPOUSE"/g) || []).length === 1,
  'e-sign: um SPOUSE (capa visual não duplica party)',
);
assert(withSpouse.includes('CÔNJUGE ANUENTE'), 'cônjuge visual na capa e no instrumento');
assert(
  shouldCreateSpouseSignatureParty({
    contractModel: 'ESTRELA_DO_SUL',
    sale: {
      has_spouse: true,
      sale_spouse_name: 'Maria Souza Anuente',
      sale_spouse_cpf: '39053344705',
    },
    contractHtml: withSpouse,
  }),
  'e-sign cria SPOUSE',
);

assert(ESTRELA_DO_SUL_DOCUMENT_DIVERGENCES.length >= 5, 'divergências documentadas');
assert(
  ESTRELA_DO_SUL_DOCUMENT_DIVERGENCES.some((d) => d.id === 'INFRA_DEADLINE'),
  'prazo de infraestrutura listado',
);
assert(
  ESTRELA_DO_SUL_DOCUMENT_DIVERGENCES.some((d) => d.id === 'CLAUSE_8_4_CROSSREF'),
  '8.4→8.2 listada para decisão humana',
);
assert(
  ESTRELA_DO_SUL_DOCUMENT_DIVERGENCES.some((d) => d.id === 'CLAUSE_2_14_15'),
  '2.14/2.15 listados para decisão humana',
);

function assertBefore(htmlSrc: string, first: string, second: string, msg: string) {
  const a = htmlSrc.indexOf(first);
  const b = htmlSrc.indexOf(second);
  assert(a >= 0 && b >= 0 && a < b, msg);
}

assertBefore(
  onlyCompany,
  '4. DOS ASPECTOS DE SEGURANÇA E CONFLITOS',
  'DOCUMENTO DE REFERÊNCIA DA OBRA',
  'tabela do item 4 logo após o título',
);
assertBefore(
  onlyCompany,
  'DOCUMENTO DE REFERÊNCIA DA OBRA',
  'data-estrela-sign-block="capa"',
  'primeiro bloco de assinaturas fecha a Capa Resumo',
);
assertBefore(
  onlyCompany,
  'data-estrela-sign-block="capa"',
  'class="estrela-instrument"',
  'instrumento só depois da Capa Resumo completa',
);
assertBefore(
  onlyCompany,
  'class="estrela-instrument"',
  'Instrumento particular de compra e venda de imóvel',
  'título do contrato dentro do instrumento',
);
assertBefore(
  onlyCompany,
  'class="estrela-instrument"',
  'data-estrela-sign-block="instrumento"',
  'segundo bloco de assinaturas no encerramento',
);
assert(!onlyCompany.includes('estrela-annex'), 'anexo antigo não permanece após as cláusulas');
assert(
  (onlyCompany.match(/estrela-closing-statement/g) || []).length === 1,
  'fecho "justas e contratadas" só no instrumento',
);
assert(
  (onlyCompany.match(/data-party-role="BUYER"/g) || []).length === 1,
  'e-sign: um BUYER',
);
assert(
  (onlyCompany.match(/TESTEMUNHA 1/g) || []).length === 2,
  'testemunha 1 na capa e no instrumento',
);

const fullHomolog = html({
  tenant: { contract_second_vendor_json: SECOND_VENDOR },
  block: {
    quadra: '02',
    lot: '15',
    area: 1100,
    frente: 10.05,
    fundo: 10.0,
    'Lado Dir.': 66.8,
    'Lado Esq.': 65.82,
  },
  sale: {
    has_spouse: true,
    sale_spouse_name: 'Maria Souza Anuente',
    sale_spouse_cpf: '39053344705',
    sale_spouse_phone: '64999998888',
    sale_spouse_email: 'maria@test.com',
    broker_commissions: [{ amount: 3.5 }],
  },
});
assert(fullHomolog.includes('Antonio Ferreira Silva'), 'homologação: segundo vendedor');
assert(fullHomolog.includes('Maria Souza Anuente'), 'homologação: cônjuge');
assert(
  (fullHomolog.match(/data-party-role="VENDOR"/g) || []).length === 2,
  'homologação: e-sign 2 VENDOR',
);
assert(
  (fullHomolog.match(/data-party-role="SPOUSE"/g) || []).length === 1,
  'homologação: e-sign 1 SPOUSE',
);
assertBefore(
  fullHomolog,
  'DOCUMENTO DE REFERÊNCIA DA OBRA',
  'class="estrela-instrument"',
  'homologação: tabela da capa antes do contrato',
);

const METER_CASES: Array<[number, string]> = [
  [10.05, 'dez metros e cinco centímetros'],
  [10.0, 'dez metros'],
  [66.8, 'sessenta e seis metros e oitenta centímetros'],
  [65.82, 'sessenta e cinco metros e oitenta e dois centímetros'],
  [10.01, 'dez metros e um centímetro'],
  [10.99, 'dez metros e noventa e nove centímetros'],
];
for (const [meters, words] of METER_CASES) {
  assert(
    formatEstrelaMetersExtenso(meters) === words,
    `extenso exato ${meters} → ${words}`,
  );
  assert(
    formatEstrelaMetersPhrase(meters).includes(`(${words})`),
    `frase ${meters} preserva centímetros`,
  );
  assert(
    !formatEstrelaMetersExtenso(meters).includes('onze metros'),
    `${meters} não arredonda o metro inteiro`,
  );
}

const gisMeasures = html({
  block: {
    quadra: '02',
    lot: '15',
    area: 1100,
    frente: 10.05,
    fundo: 10.0,
    'Lado Dir.': 66.8,
    'Lado Esq.': 65.82,
  },
  sale: {
    broker_commissions: [{ amount: 3.5 }],
    brokers: {
      name: 'Corretor Estrela',
      cpf: '39053344705',
      creci: '12345-PA',
      commission_percent: 10,
      commission_fixed_amount: 999,
    },
  },
});
assert(gisMeasures.includes('10,05m (dez metros e cinco centímetros)'), 'GIS 10,05');
assert(gisMeasures.includes('10,00m (dez metros)'), 'GIS 10,00 sem centímetros');
assert(
  gisMeasures.includes('66,80m (sessenta e seis metros e oitenta centímetros)'),
  'GIS 66,80',
);
assert(
  gisMeasures.includes('65,82m (sessenta e cinco metros e oitenta e dois centímetros)'),
  'GIS 65,82',
);
const corretagemSlice = gisMeasures.slice(
  gisMeasures.indexOf('VALOR DE CORRETAGEM'),
  gisMeasures.indexOf('VALOR DE CORRETAGEM') + 420,
);
assert(corretagemSlice.includes('3,50'), 'capa corretagem R$ 3,50');
assert(
  corretagemSlice.includes('três reais e cinquenta centavos'),
  'capa corretagem por extenso',
);
assert(
  !/R\$\s*0,00/.test(corretagemSlice.replace(/\u00a0/g, ' ')),
  'capa não zera comissão da venda',
);
assert(!corretagemSlice.includes('999'), 'não recalcula pela config atual do corretor');
assert(gisMeasures.includes('2.8.1.'), 'cláusula 2.8.1 presente');
assert(gisMeasures.includes('9.2.'), 'cláusula 9.2 presente');
assert(
  gisMeasures.includes('três reais e cinquenta centavos'),
  '2.8.1 usa o mesmo snapshot de corretagem',
);

function countToken(src: string, token: string): number {
  return src.split(token).length - 1;
}

const SALE_COMMISSION = 3.5;
assert(
  resolveEstrelaDoSulSaleCommissionAmount({
    broker_commissions: [{ amount: SALE_COMMISSION }],
    brokers: { commission_fixed_amount: 999 },
  }) === SALE_COMMISSION,
  'resolver lê broker_commissions.amount',
);
assert(
  resolveEstrelaDoSulSaleCommissionAmount({
    broker_commissions: [{ amount: 0, commission_fixed_amount: SALE_COMMISSION }],
    brokers: { commission_fixed_amount: 999 },
  }) === SALE_COMMISSION,
  'resolver lê commission_fixed_amount do snapshot FIXED',
);
assert(
  resolveEstrelaDoSulSaleCommissionAmount({
    broker_commissions: [],
    sale_commission_fixed_amount: SALE_COMMISSION,
    brokers: { commission_fixed_amount: 999 },
  }) === SALE_COMMISSION,
  'array vazio não descarta sale_commission_fixed_amount',
);
assert(
  resolveEstrelaDoSulSaleCommissionAmount({
    broker_commissions: [],
    brokers: { commission_percent: 10, commission_fixed_amount: 999 },
  }) === 0,
  'sem snapshot não herda config futura do corretor',
);

const oneSourceHtml = html({
  sale: {
    broker_commissions: [{ amount: SALE_COMMISSION }],
    brokers: { commission_percent: 10, commission_fixed_amount: 999 },
  },
});
const oneSourceNorm = oneSourceHtml.replace(/\u00a0/g, ' ');
assert(countToken(oneSourceNorm, '3,50') >= 6, 'um snapshot alimenta todas as corretagens (R$ 3,50)');
assert(
  countToken(oneSourceNorm, 'três reais e cinquenta centavos') >= 4,
  'um snapshot alimenta todos os extensos de corretagem',
);
assert(!oneSourceNorm.includes('999'), 'não vaza config futura do corretor');
const clause281 = oneSourceNorm.slice(
  oneSourceNorm.indexOf('2.8.1.'),
  oneSourceNorm.indexOf('2.8.1.') + 280,
);
const clause92 = oneSourceNorm.slice(
  oneSourceNorm.indexOf('Da Comissão de Corretagem: As Partes'),
  oneSourceNorm.indexOf('Da Comissão de Corretagem: As Partes') + 280,
);
assert(clause281.includes('3,50'), '2.8.1 = R$ 3,50');
assert(clause92.includes('3,50'), '9.2 = R$ 3,50');
assert(clause281.includes('três reais e cinquenta centavos'), '2.8.1 extenso');
assert(clause92.includes('três reais e cinquenta centavos'), '9.2 extenso');

const fromSaleField = html({
  sale: {
    broker_commissions: [],
    sale_commission_fixed_amount: SALE_COMMISSION,
    brokers: { commission_fixed_amount: 999 },
  },
});
assert(
  fromSaleField.includes('3,50') && fromSaleField.includes('três reais e cinquenta centavos'),
  'campo da venda também alimenta capa/cláusulas',
);

assert(
  collapseEstrelaDuplicateEditorialNumbers('1.1. 1.1. O objeto') === '1.1. O objeto',
  'colapsa 1.1. 1.1. editorial',
);
assert(
  collapseEstrelaDuplicateEditorialNumbers('<strong>2.1.</strong> 2.1. O preço') ===
    '<strong>2.1.</strong> O preço',
  'colapsa 2.1. duplicado após strong',
);
assert(
  collapseEstrelaDuplicateEditorialNumbers(
    'a obrigatoriedade de intermediação exclusiva prevista no item 8.2 somente existirá',
  ).includes('item 8.2'),
  'não altera remissão cruzada 8.2',
);

const editorialPlain = gisMeasures.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
assert(
  !/(\d+\.\d+\.)\s+\1/.test(editorialPlain),
  'HTML gerado sem numeração editorial duplicada consecutiva',
);
assert(!editorialPlain.includes(' 2.14 '), '2.14 não inventado');
assert(!editorialPlain.includes(' 2.15 '), '2.15 não inventado');

const noSnapshot = html({
  sale: {
    broker_commissions: [],
    brokers: {
      name: 'Corretor Estrela',
      commission_percent: 10,
      commission_fixed_amount: 999,
    },
  },
});
const zeroSlice = noSnapshot.slice(
  noSnapshot.indexOf('VALOR DE CORRETAGEM'),
  noSnapshot.indexOf('VALOR DE CORRETAGEM') + 280,
);
assert(/R\$\s*0,00/.test(zeroSlice.replace(/\u00a0/g, ' ')), 'sem snapshot da venda → R$ 0,00');
assert(!zeroSlice.includes('999'), 'sem snapshot não herda config atual do corretor');

const outDir = path.join(process.cwd(), 'scripts', '_fixtures', 'estrela-do-sul');
fs.mkdirSync(outDir, { recursive: true });
function wrapPrintable(fragment: string, title: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${title}</title>
<style>@page { size: A4; margin: 18mm 16mm; } body { margin: 0; }</style>
</head><body>${fragment}</body></html>`;
}
fs.writeFileSync(
  path.join(outDir, 'empresa-somente.html'),
  wrapPrintable(onlyCompany, 'Estrela do Sul — somente empresa'),
  'utf8',
);
fs.writeFileSync(
  path.join(outDir, 'empresa-segundo-vendedor.html'),
  wrapPrintable(withSecond, 'Estrela do Sul — empresa + segundo vendedor'),
  'utf8',
);
fs.writeFileSync(
  path.join(outDir, 'comprador-com-conjuge.html'),
  wrapPrintable(withSpouse, 'Estrela do Sul — comprador com cônjuge'),
  'utf8',
);
fs.writeFileSync(
  path.join(outDir, 'capa-e-assinaturas-completas.html'),
  wrapPrintable(
    fullHomolog,
    'Estrela do Sul — capa completa + segundo vendedor + cônjuge',
  ),
  'utf8',
);
fs.writeFileSync(
  path.join(outDir, 'dados-tecnicos-corretagem.html'),
  wrapPrintable(
    gisMeasures,
    'Estrela do Sul — medidas GIS exatas + corretagem R$ 3,50',
  ),
  'utf8',
);
console.log(`HTML de homologação em ${outDir}`);

console.log('\nOK mandatory-estrela-do-sul-contract-tests');

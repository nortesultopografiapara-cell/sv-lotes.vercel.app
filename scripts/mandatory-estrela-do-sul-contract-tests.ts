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
} = {}) {
  return generateContractHTML({
    tenant: { ...COMPANY, ...(overrides.tenant || {}) },
    customer: { ...CUSTOMER, ...(overrides.customer || {}) },
    project: PROJECT,
    block: BLOCK,
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
  (withSecond.match(/data-party-role="VENDOR"/g) || []).length >= 2,
  'dois slots VENDOR',
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
assert(withSpouse.includes('data-party-role="SPOUSE"'), 'slot SPOUSE');
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
console.log(`HTML de homologação em ${outDir}`);

console.log('\nOK mandatory-estrela-do-sul-contract-tests');

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
import { buildEstrelaDoSulEsignVendorPartyInputs, sortEstrelaDoSulVendorParties } from '../lib/estrelaDoSulContractEsign';
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
  formatEstrelaEnterpriseLocation,
  formatEstrelaMedidasConfrontacoes,
} from '../lib/estrelaDoSulContractFormat';
import { collapseEstrelaDuplicateEditorialNumbers } from '../lib/estrelaDoSulContractClauses';
import { resolveEstrelaDoSulSaleCommissionAmount } from '../lib/estrelaDoSulContractContext';
import { shouldLoadProjectBlocksForContract } from '../lib/contractHtmlGlobal';
import { formatCompanyAddressForHeader } from '../lib/contractCompanyDisplay';
import {
  buildEstrelaDoSulPdfChrome,
  buildEstrelaDoSulSaleContractPrintTemplates,
  normalizeLfCompanyAddressLine,
} from '../lib/estrelaDoSulContractPdf';
import { applyElectronicSignatureStampsToContractHtml } from '../lib/saleContractSignaturePartySlots';

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
  project?: Record<string, unknown>;
  block?: Record<string, unknown>;
} = {}) {
  return generateContractHTML({
    tenant: { ...COMPANY, ...(overrides.tenant || {}) },
    customer: { ...CUSTOMER, ...(overrides.customer || {}) },
    project: { ...PROJECT, ...(overrides.project || {}) },
    block: { ...BLOCK, ...(overrides.block || {}) },
    sale: { ...SALE, ...(overrides.sale || {}) },
    financeReceipts: RECEIPTS,
  });
}

assert(normalizeSaleContractModel('CHACREAMENTO_ESTRELA_DO_SUL') === 'ESTRELA_DO_SUL', 'alias CHACREAMENTO_');
assert(SALE_CONTRACT_MODEL_OPTIONS.includes('ESTRELA_DO_SUL'), 'opção no seletor de projeto');
assert(
  SALE_CONTRACT_MODEL_LABELS.ESTRELA_DO_SUL === 'LF Imóveis',
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

{
  const cadastro = 'RUA 24 DE MARCO, N 99';
  const lfLine = normalizeLfCompanyAddressLine(cadastro);
  assert(!/S\s*\/\s*N/i.test(lfLine), 'LF com N 99 não acrescenta S/N');
  assert(/N\s*99/i.test(lfLine), 'LF preserva N 99 do cadastro');
  assert(
    normalizeLfCompanyAddressLine('RUA 24 DE MARCO') === 'RUA 24 DE MARCO, S/N',
    'LF sem número usa S/N da regra existente',
  );
  const chrome = buildEstrelaDoSulPdfChrome(
    { ...COMPANY, address: cadastro },
    '000000005/2026',
  );
  assert(!/N\s*99\s*,\s*S\s*\/\s*N/i.test(chrome.addressLine), 'chrome LF sem N 99, S/N');
  assert(/N\s*99/i.test(chrome.addressLine), 'chrome LF mostra N 99');
  assert(/\bde\b/.test(chrome.addressLine), 'chrome LF title-case com de minúsculo');
  assert(chrome.headerVariant === 'estrela-do-sul', 'chrome LF usa header homologado');
  assert(chrome.logoWidthMm === 26 && chrome.logoHeightMm === 18, 'chrome LF logo 26x18mm');
  const headerTpl = buildEstrelaDoSulSaleContractPrintTemplates({
    ...chrome,
    logoBase64: 'data:image/png;base64,AAA',
  }).headerTemplate;
  assert(headerTpl.includes('object-fit:contain'), 'header Chromium object-fit contain');
  assert(headerTpl.includes('display:flex'), 'header flex logo + textos (jsPDF)');
  assert(headerTpl.includes('LF IMOVEIS') || headerTpl.includes(String(chrome.tenantName || '').toUpperCase()), 'header usa razão social');
  assert(!headerTpl.includes('height:11px'), 'header Estrela não usa logo 11px');
  assert(!headerTpl.includes('width:18%'), 'header não usa coluna 18% do hotfix anterior');
  const padrao = formatCompanyAddressForHeader({
    address: 'Avenida Dos Ipes, Quadra 31, Lote 13',
    city: 'Parauapebas',
    state: 'PA',
  });
  assert(/S\/N/i.test(padrao.addressLine), 'PADRAO permanece com S/N automático');
}

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
assert(onlyCompany.includes('Palmares 2, Parauapebas/PA'), 'localização fallback sem endereço: bairro + cidade/UF');
assert(
  (onlyCompany.match(/Palmares 2, Parauapebas\/PA/g) || []).length >= 2,
  'mesma localização na Capa e na cláusula 1.3',
);

const LOCATION_FULL = {
  address: 'ESTRADA VS 81 KM 5,5',
  neighborhood: 'PALMARES II',
  city: 'PARAUAPEBAS',
  uf: 'PA',
  forum_city: 'CIDADE DO FORO',
};
assert(
  formatEstrelaEnterpriseLocation(LOCATION_FULL) ===
    'ESTRADA VS 81 KM 5,5, PALMARES II, PARAUAPEBAS/PA',
  'localização: endereço + bairro + cidade/UF',
);
assert(
  formatEstrelaEnterpriseLocation({
    neighborhood: 'PALMARES II',
    city: 'PARAUAPEBAS',
    uf: 'PA',
    forum_city: 'CIDADE DO FORO',
  }) === 'PALMARES II, PARAUAPEBAS/PA',
  'localização sem endereço/referência',
);
assert(
  formatEstrelaEnterpriseLocation({
    address: 'ESTRADA VS 81 KM 5,5',
    city: 'PARAUAPEBAS',
    uf: 'PA',
    forum_city: 'CIDADE DO FORO',
  }) === 'ESTRADA VS 81 KM 5,5, PARAUAPEBAS/PA',
  'localização sem bairro/localidade',
);
assert(
  !formatEstrelaEnterpriseLocation({
    ...LOCATION_FULL,
    address: null,
    neighborhood: '  ',
    city: 'undefined',
  }).includes('undefined'),
  'localização sem undefined',
);
assert(
  !formatEstrelaEnterpriseLocation(LOCATION_FULL).includes('CIDADE DO FORO'),
  'foro não entra na localização física',
);

const locatedHtml = html({
  project: {
    ...PROJECT,
    ...LOCATION_FULL,
  },
});
const expectedLocation = 'ESTRADA VS 81 KM 5,5, PALMARES II, PARAUAPEBAS/PA';
assert(locatedHtml.includes(expectedLocation), 'HTML usa localização completa do projeto');
assert(
  (locatedHtml.match(/ESTRADA VS 81 KM 5,5, PALMARES II, PARAUAPEBAS\/PA/g) || []).length >= 2,
  'Capa e 1.3 imprimem a mesma localização',
);
{
  const locSlices: string[] = [];
  let from = 0;
  while (from < locatedHtml.length) {
    const i = locatedHtml.indexOf('Localização do Imóvel', from);
    if (i < 0) break;
    locSlices.push(locatedHtml.slice(i, i + 320));
    from = i + 1;
  }
  assert(locSlices.length >= 2, 'duas linhas Localização do Imóvel');
  assert(
    locSlices.every((slice) => slice.includes(expectedLocation)),
    'Capa e 1.3 com o mesmo endereço do projeto',
  );
  assert(
    locSlices.every((slice) => !slice.includes('CIDADE DO FORO')),
    'Localização do Imóvel não usa Município/Foro',
  );
}

function utmSeg(opts: {
  i: number;
  d: number;
  side?: string;
  c?: string;
  curve?: boolean;
}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    segment_index: opts.i,
    distance: opts.d,
    north: 9347282 + opts.i,
    east: 629036 + opts.i * 12,
    end_north: 9347283 + opts.i,
    end_east: 629048 + opts.i * 12,
    vertex_order: opts.i,
    segment_type: opts.curve ? 'CURVE' : 'LINE',
  };
  if (opts.side) row.official_side = opts.side;
  if (opts.c) {
    row.confrontant = opts.c;
    row.confrontante = opts.c;
    row.manual_confrontant = opts.c;
    row.confrontant_source = 'manual';
  }
  if (opts.curve) {
    row.radius = 434.93;
    row.chord = opts.d;
  }
  return row;
}

const LOT13_BLOCK = {
  id: 'lote-13-estrela-test',
  number: '13',
  block_name: '01',
  area: 667.18,
  segments_json: [
    utmSeg({ i: 0, d: 38.2, side: 'right', c: 'Lote 14' }),
    utmSeg({ i: 1, d: 32.99, side: 'back', c: 'RUA 02', curve: true }),
    utmSeg({ i: 2, d: 5.47, side: 'left', c: 'RUA 02 E ESTRADA VS 81 PALMARES II' }),
    utmSeg({ i: 3, d: 23.65, side: 'front', c: 'ESTRADA VS 81 PALMARES II' }),
    utmSeg({ i: 4, d: 17.5, side: 'front', c: 'ESTRADA VS 81 PALMARES II' }),
  ],
};

const p38 = formatEstrelaMetersPhrase(38.2);
const p32 = formatEstrelaMetersPhrase(32.99);
const p547 = formatEstrelaMetersPhrase(5.47);
const p2365 = formatEstrelaMetersPhrase(23.65);
const p1750 = formatEstrelaMetersPhrase(17.5);
const LOT13_TEXT = [
  `${p38} pelo lado direito, confrontando com Lote 14`,
  `${p32} pelos fundos, em curva, confrontando com RUA 02`,
  `${p547} pelo lado esquerdo, confrontando com RUA 02 E ESTRADA VS 81 PALMARES II`,
  `frente composta pelos segmentos de ${p2365} e ${p1750}, ambos confrontando com ESTRADA VS 81 PALMARES II`,
].join('; ');

assert(
  shouldLoadProjectBlocksForContract({ contract_model: 'ESTRELA_DO_SUL' }),
  'Estrela carrega lotes vizinhos para confrontação',
);
const LOT13_OUT = formatEstrelaMedidasConfrontacoes(LOT13_BLOCK);
assert(
  LOT13_OUT === LOT13_TEXT,
  'Lote 13: 5 segmentos, frente em dois, curva no fundo',
);
assert(
  !LOT13_OUT.includes('41,15m'),
  'não soma as duas frentes em 41,15 m',
);
assert(
  LOT13_OUT.includes('Lote 14') &&
    LOT13_OUT.includes('RUA 02') &&
    LOT13_OUT.includes('RUA 02 E ESTRADA VS 81 PALMARES II'),
  'confrontantes diferentes preservados',
);

const noConfrontantText = formatEstrelaMedidasConfrontacoes({
  number: '99',
  segments_json: [
    utmSeg({ i: 0, d: 38.2, side: 'right' }),
    utmSeg({ i: 1, d: 20, side: 'front', c: 'Rua A' }),
  ],
});
assert(
  noConfrontantText.includes(`${p38} pelo lado direito`) &&
    !noConfrontantText.includes('pelo lado direito, confrontando') &&
    noConfrontantText.includes('confrontando com Rua A'),
  'ausência de confrontante: não inventa vizinho',
);

const unclassifiedText = formatEstrelaMedidasConfrontacoes({
  number: '98',
  segments_json: [
    utmSeg({ i: 0, d: 5.47, c: 'Área verde' }),
    utmSeg({ i: 1, d: 20, side: 'front', c: 'Rua A' }),
  ],
});
assert(
  unclassifiedText.includes(`${p547} sem classificação de lado, confrontando com Área verde`),
  'segmento sem official_side não omite e não inventa lado',
);

const lot13Html = html({
  block: { ...BLOCK, ...LOT13_BLOCK },
});
assert(lot13Html.includes(LOT13_TEXT), 'HTML usa o texto GIS do Lote 13');
assert(
  (lot13Html.match(
    /pelo lado direito, confrontando com Lote 14/g,
  ) || []).length >= 2,
  'Capa e 1.3 com o mesmo texto de medidas e confrontações',
);
{
  const slices: string[] = [];
  let from = 0;
  while (from < lot13Html.length) {
    const i = lot13Html.indexOf('MEDIDAS E CONFRONTAÇÕES', from);
    if (i < 0) break;
    slices.push(lot13Html.slice(i, i + 900));
    from = i + 1;
  }
  assert(slices.length >= 2, 'duas linhas MEDIDAS E CONFRONTAÇÕES');
  assert(
    slices.every((slice) => slice.includes(LOT13_TEXT)),
    'Capa Resumo e cláusula 1.3 com a mesma descrição',
  );
}

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
  (withSecond.match(/data-party-role="VENDOR"/g) || []).length === 4,
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
  (withSpouse.match(/data-party-role="SPOUSE"/g) || []).length === 2,
  'e-sign: SPOUSE na Capa e no instrumento',
);
assert(withSpouse.includes('CÔNJUGE ANUENTE'), 'cônjuge visual na capa e no instrumento');
assert(
  withSpouse.includes('neste ato com a anuência de seu cônjuge'),
  'qualificação do cônjuge no preâmbulo',
);
{
  const partesIdx = withSpouse.indexOf('DAS PARTES CONTRATANTES');
  const capaSignIdx = withSpouse.indexOf('data-estrela-sign-block="capa"');
  const capaPartes =
    partesIdx >= 0 && capaSignIdx > partesIdx
      ? withSpouse.slice(partesIdx, capaSignIdx)
      : '';
  assert(
    capaPartes.includes('Maria Souza Anuente'),
    'cônjuge na Capa Resumo (DAS PARTES)',
  );
}
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
  (onlyCompany.match(/data-party-role="BUYER"/g) || []).length === 2,
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
  (fullHomolog.match(/data-party-role="VENDOR"/g) || []).length === 4,
  'homologação: e-sign 2 VENDOR x 2 blocos',
);
assert(
  (fullHomolog.match(/data-party-role="SPOUSE"/g) || []).length === 2,
  'homologação: e-sign SPOUSE x 2 blocos',
);

{
  const stamps = [
    {
      role: 'SELLER' as const,
      roleMarker: 'VENDEDOR(A)',
      slotClass: 'signature-slot-vendor-1',
      signerName: 'LUZIA FELIPE',
      signedAt: '2026-04-01T12:00:00.000Z',
      signed: true,
    },
    {
      role: 'SELLER' as const,
      roleMarker: 'VENDEDOR(A)',
      slotClass: 'signature-slot-vendor-2',
      signerName: 'ANA VITORIA OLIVEIRA FRANCA',
      signedAt: null,
      signed: false,
    },
    {
      role: 'BUYER' as const,
      roleMarker: 'COMPRADOR(A)',
      signerName: 'JOAO COMPRADOR DA SILVA',
      signedAt: '2026-04-01T12:00:00.000Z',
      signed: true,
    },
  ];
  let stamped = applyElectronicSignatureStampsToContractHtml(fullHomolog, stamps);
  stamped = applyElectronicSignatureStampsToContractHtml(stamped, stamps);
  const instrument = stamped.slice(stamped.indexOf('data-estrela-sign-block="instrumento"'));
  const capaSign = stamped.slice(
    stamped.indexOf('data-estrela-sign-block="capa"'),
    stamped.indexOf('data-estrela-sign-block="instrumento"'),
  );
  assert(capaSign.includes('class="sv-esign-stamp"'), 'capa assinado recebe selos compactos Menezes');
  assert(capaSign.includes('LUZIA FELIPE'), 'selo VENDOR 1 na capa: representante da empresa');
  assert(capaSign.includes('JOAO COMPRADOR DA SILVA'), 'selo BUYER na capa');
  assert(!capaSign.includes('ANA VITORIA OLIVEIRA FRANCA'), 'segundo VENDOR sem signed_at não recebe selo na capa');
  assert(!/Assinatura ID|Hash SHA|Token de validação|QR Code/i.test(capaSign), 'capa sem certificado técnico');
  assert(instrument.includes('LUZIA FELIPE'), 'selo VENDOR 1 no instrumento: representante da empresa');
  assert(instrument.includes('JOAO COMPRADOR DA SILVA'), 'selo BUYER no instrumento');
  assert(!instrument.includes('ANA VITORIA OLIVEIRA FRANCA'), 'segundo VENDOR sem signed_at não recebe selo');
  const firstVendorIdx = instrument.indexOf('data-party-role="VENDOR"');
  const firstVendorChunk = instrument.slice(Math.max(0, firstVendorIdx - 200), firstVendorIdx + 700);
  assert(firstVendorChunk.includes('sv-esign-stamp'), 'primeiro slot VENDOR assinado');
  assert(firstVendorChunk.includes('LUZIA FELIPE'), 'primeiro slot VENDOR recebe a party da empresa');
  const anaFirst = sortEstrelaDoSulVendorParties(
    [
      { signer_name: 'ANA VITORIA OLIVEIRA FRANCA', signer_cpf: '11111111111' },
      { signer_name: 'LUZIA FELIPE', signer_cpf: '22222222222' },
    ],
    { legal_representative: 'LUZIA FELIPE', representative_cpf: '22222222222' },
  );
  assert(anaFirst[0].signer_name === 'LUZIA FELIPE', 'VENDOR[0] permanece o representante da empresa');
  assert(anaFirst[1].signer_name === 'ANA VITORIA OLIVEIRA FRANCA', 'VENDOR[1] permanece o segundo vendedor');
}
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
assert(countToken(oneSourceNorm, '3,50') >= 4, 'um snapshot alimenta todas as corretagens (R$ 3,50)');
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

assert(
  (onlyCompany.match(/data-party-role="SPOUSE"/g) || []).length === 0,
  'Casado sem sale_spouse_* não inventa SPOUSE',
);
assert(
  !onlyCompany.includes('neste ato com a anuência de seu cônjuge'),
  'sem snapshot de cônjuge o preâmbulo não inventa anuente',
);

function assertNoTechnicalLeak(src: string, label: string) {
  const body = src
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
  assert(!body.includes('${'), `${label}: sem placeholder \${`);
  assert(
    !body.replace(/ESTRELA_DO_SUL/g, '').includes('ESTRELA_'),
    `${label}: sem token ESTRELA_ residual (além do modelo)`,
  );
  assert(!/\bundefined\b/.test(body), `${label}: sem undefined`);
  assert(!/\bnull\b/.test(body), `${label}: sem null`);
  assert(!body.includes('[object Object]'), `${label}: sem [object Object]`);
}

assertNoTechnicalLeak(fullHomolog, 'homolog');
assertNoTechnicalLeak(gisMeasures, 'gis');
assertNoTechnicalLeak(withSpouse, 'cônjuge');
assert(gisMeasures.includes('inserção no loteamento'), '3.3 inserção');
assert(!gisMeasures.includes('inscrição no loteamento'), '3.3 sem inscrição');
assert(gisMeasures.includes('a planta do empreendimento'), '3.3 planta');
assert(!gisMeasures.includes('plantilha'), 'sem plantilha');
assert(gisMeasures.includes('faseamento'), '6.4 faseamento');
assert(!gisMeasures.includes('fescamento'), 'sem fescamento');
assert(gisMeasures.includes('Lei nº 13.709/2018 (LGPD)'), 'LGPD 13.709/2018');
assert(!gisMeasures.includes('13.700/2018'), 'sem 13.700/2018');
assert(!/\bCPE\b/.test(gisMeasures), 'testemunhas usam CPF, não CPE');
assert(
  (gisMeasures.match(/CPF nº:/g) || []).length === 4,
  'CPF nº: completo nas testemunhas dos dois blocos',
);
assert(gisMeasures.includes('white-space: nowrap'), 'documento da testemunha sem quebra/corte');
assert(gisMeasures.includes('padding-top: 5px !important'), 'células com padding-top');
assert(gisMeasures.includes('padding-bottom: 5px !important'), 'células com padding-bottom');
assert(gisMeasures.includes('vertical-align: middle !important'), 'células alinhadas ao meio');
assert(gisMeasures.includes('5% (cinco por cento)'), '8.1.V taxa de cessão interpolada');
assert(
  gisMeasures.includes('25% (vinte e cinco por cento)'),
  '9.3 retenção interpolada',
);
assert(!gisMeasures.includes('<sup>5</sup>'), 'sem nota 5 órfã');
assert(!gisMeasures.includes('<sup>6</sup>'), 'sem nota 6 órfã');
assert(!gisMeasures.includes('<sup>7</sup>'), 'sem nota 7 órfã');
assert(
  !gisMeasures.includes('Natureza jurídica: as ARRAS'),
  'sem bloco explicativo de ARRAS',
);
assert(
  !gisMeasures.includes('A comissão de corretagem possui natureza de remuneração'),
  'sem bloco explicativo de corretagem',
);
assert(
  !gisMeasures.includes('A composição referente à Dedutação de Taxa'),
  'sem bloco de taxa administrativa de distrato',
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

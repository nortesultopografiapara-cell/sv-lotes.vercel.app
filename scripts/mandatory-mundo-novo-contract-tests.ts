/**
 * Testes obrigatórios — modelo MUNDO_NOVO (Chacreamento Mundo Novo).
 * npx tsx scripts/mandatory-mundo-novo-contract-tests.ts
 */
import { generateContractHTML } from '../lib/contractTemplate';
import fs from 'node:fs';
import path from 'node:path';
import {
  isAraguaiaContractModel,
  isMundoNovoContractModel,
  normalizeSaleContractModel,
  resolveSaleContractModelFromContext,
  SALE_CONTRACT_MODEL_OPTIONS,
} from '../lib/contractModel';
import { MUNDO_NOVO_INCRA_TITLE, MUNDO_NOVO_MATRICULA, MUNDO_NOVO_MISSING_SELLERS_MESSAGE } from '../lib/mundoNovoContractConstants';
import { generateMundoNovoContract } from '../lib/mundoNovoContractTemplate';
import {
  MUNDO_NOVO_LOGO_PATH,
  MUNDO_NOVO_LOGO_PUBLIC_FILE,
  MUNDO_NOVO_ELECTRONIC_LOGO_PUBLIC_FILE,
  MUNDO_NOVO_LOGO_NATIVE_WIDTH,
  MUNDO_NOVO_LOGO_NATIVE_HEIGHT,
  mundoNovoPdfChromeLogoSizeMm,
  resolveMundoNovoPdfChromeLogo,
} from '../lib/mundoNovoContractPdf';
import {
  applyContractPdfChrome,
  buildContractPdfChromeFromTenant,
} from '../lib/contractPdfPostProcess';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK ${msg}`);
}

const SELLERS = [
  {
    role: 'PROMITENTE_VENDEDOR',
    order: 1,
    name: 'Maria Elvira de Sousa',
    nationality: 'brasileira',
    maritalStatus: 'casada',
    profession: 'agricultora',
    rg: '7059327-SSP/PA',
    cpf: '248.031.972-53',
    address: 'Loteamento Palmares Sul – Lotes 33, 34 e 36 – Parauapebas – PA',
  },
  {
    role: 'PROMITENTE_VENDEDOR',
    order: 2,
    name: 'Adenil Antonio de Sousa',
    nationality: 'brasileiro',
    maritalStatus: 'casado',
    profession: 'agricultor',
    rg: '7010624-SSP-PA',
    cpf: '175.200.962-20',
    address: 'Loteamento Palmares Sul – Lotes 33, 34 e 36 – Parauapebas – PA',
  },
];

const TENANT = {
  contract_model: 'MUNDO_NOVO',
  razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
  cnpj: '57590706000178',
  address: 'Avenida dos Ipês SN – Quadra 31 – Lote 13',
  neighborhood: 'Cidade Jardim',
  city: 'Parauapebas',
  state: 'PA',
  legal_representative: 'Daniel Roberto Rivelino de Sousa',
  representative_cpf: '820.912.262-20',
  contract_second_vendor_json: {
    name: 'Aldenise Alves Sousa',
    cpf: '856.560.112-91',
  },
};

const PROJECT = {
  name: 'Chacreamento Mundo Novo',
  city: 'Parauapebas',
  uf: 'PA',
  contract_model: 'MUNDO_NOVO',
  seller_parties_json: SELLERS,
};

const CUSTOMER = {
  name: 'Andre de Souza Lima',
  cpf_cnpj: '04639725388',
  rg: '8118531',
  rg_issuer: 'PC',
  rg_issuer_state: 'PA',
  nationality: 'Brasileiro',
  civil_state: 'Solteiro',
  profession: 'Pedreiro',
  email: 'andre@teste.com',
  phone: '(94) 98409-8463',
  address: 'Rua N3, 44',
  neighborhood: 'Cidade Jardim',
  city: 'Parauapebas',
  state: 'PA',
};

const BLOCK = {
  id: 'block-mn-21',
  lote: '21',
  number: '21',
  quadra: '01',
  block_name: '01',
  area: 1200.5,
  frente: 22.1,
  fundo: 21.4,
  'Lado Dir.': 48.2,
  'Lado Esq.': 47.8,
  segments_json: [
    {
      segment_index: 0,
      official_side: 'frente',
      distance: 22.1,
      confrontant: 'Rua A',
    },
    {
      segment_index: 1,
      official_side: 'lado_direito',
      distance: 48.2,
      confrontant: 'Chácara 20',
    },
    {
      segment_index: 2,
      official_side: 'fundo',
      distance: 21.4,
      confrontant: 'Chácara 8',
    },
    {
      segment_index: 3,
      official_side: 'lado_esquerdo',
      distance: 47.8,
      confrontant: 'Chácara 22',
    },
  ],
};

const SALE = {
  total_value: 45000,
  down_payment: 5000,
  installments_count: 40,
  installment_value: 1000,
  payment_type: 'Parcelado',
  installment_correction_type: 'IPCA',
  sale_date: '2026-09-15',
  broker_name: 'Corretor Mundo Novo',
  brokers: { name: 'Corretor Mundo Novo', cpf: '11144477735', creci: '12345-PA' },
};

const RECEIPTS = [
  { installment_number: 0, amount: 5000, due_date: '2026-09-15' },
  { installment_number: 1, amount: 1000, due_date: '2026-10-15' },
  { installment_number: 2, amount: 1000, due_date: '2026-11-15' },
];

function generate(extra: Record<string, unknown> = {}) {
  return generateContractHTML({
    tenant: TENANT,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
    ...extra,
  });
}

function clauseSegunda(html: string): string {
  const start = html.indexOf('CLÁUSULA SEGUNDA');
  const end = html.indexOf('CLÁUSULA TERCEIRA');
  return html.slice(start, end < 0 ? undefined : end);
}

assert(SALE_CONTRACT_MODEL_OPTIONS.includes('MUNDO_NOVO'), '1. MUNDO_NOVO é opção válida');
assert(normalizeSaleContractModel('MUNDO_NOVO') === 'MUNDO_NOVO', '1. normalize reconhece MUNDO_NOVO');
assert(isMundoNovoContractModel(TENANT), '1. isMundoNovoContractModel');

{
  const r = resolveSaleContractModelFromContext({
    projectName: 'Chacreamento Mundo Novo',
    projectModel: null,
    companyModel: 'ARAGUAIA',
  });
  assert(
    r.model === 'ARAGUAIA' && r.source === 'company',
    '1. sem coerce por nome do empreendimento',
  );
}

const html = generate();
assert(html.includes('data-contract-model="MUNDO_NOVO"'), '2. dispatcher usa gerador Mundo Novo');
assert(!html.includes('data-contract-model="ARAGUAIA"'), '3. ARAGUAIA não entra no path Mundo Novo');
assert(html.includes('Maria Elvira de Sousa'), '4. Maria Elvira do JSON');
assert(html.includes('Adenil Antonio de Sousa'), '4. Adenil do JSON');
assert(html.includes('248.031.972-53'), '4. CPF Maria Elvira');
assert(html.includes('175.200.962-20'), '4. CPF Adenil');
assert(
  html.includes('brasileira, casada, agricultora'),
  '4. Maria Elvira: qualificação estruturada do JSON',
);
assert(
  html.includes('brasileiro, casado, agricultor'),
  '4. Adenil: qualificação estruturada do JSON',
);
assert(
  !/MARIA ELVIRA DE SOUSA[\s\S]{0,160}Brasileiro\(a\)/.test(html),
  '4. Maria Elvira não usa Brasileiro(a)',
);
assert(
  !/ADENIL ANTONIO DE SOUSA[\s\S]{0,160}Casado\(a\)/.test(html),
  '4. Adenil não usa Casado(a)',
);

{
  const htmlAlt = generate({
    project: {
      ...PROJECT,
      seller_parties_json: [
        { ...SELLERS[0], profession: 'comerciante', maritalStatus: 'viúva' },
        { ...SELLERS[1], nationality: 'brasileiro', profession: 'pecuarista' },
      ],
    },
  });
  assert(
    htmlAlt.includes('brasileira, viúva, comerciante'),
    '4. qualificação segue o JSON, sem hardcode',
  );
  assert(htmlAlt.includes('pecuarista'), '4. profissão do segundo vendedor vem do JSON');
  assert(!htmlAlt.includes('agricultora'), '4. agricultora do fixture original não vaza');
}
assert(!html.includes('820.912.262-20'), '5. CPF do Representante Legal não vira vendedor');
assert(!html.includes('Daniel Roberto Rivelino de Sousa'), '5. Daniel não é vendedor');
assert(!html.includes('Aldenise Alves Sousa'), '5. segundo vendedor da empresa não entra');
assert(!/<img\b/i.test(html), 'logo: HTML Mundo Novo não embute imagem');

assert(
  resolveMundoNovoPdfChromeLogo({
    projectLogoUrl: null,
  }) === MUNDO_NOVO_LOGO_PATH,
  'logo: helper sempre aponta para o asset oficial',
);
assert(
  resolveMundoNovoPdfChromeLogo({}) === MUNDO_NOVO_LOGO_PATH,
  'logo: companies.logo_url não é lida pelo helper Mundo Novo',
);
assert(
  resolveMundoNovoPdfChromeLogo({
    projectLogoUrl: 'https://cdn.test/chacreamento-araguaia.png',
  }) === MUNDO_NOVO_LOGO_PATH,
  'logo: ignora URL de projeto/Araguaia e usa o asset próprio',
);

{
  const logoFile = path.join(process.cwd(), 'public', MUNDO_NOVO_LOGO_PUBLIC_FILE);
  assert(fs.existsSync(logoFile), 'logo: PNG oficial existe em public/');
  assert(fs.statSync(logoFile).size > 10_000, 'logo: PNG oficial não está vazio');
  const png = fs.readFileSync(logoFile);
  assert(png.readUInt32BE(16) === 1024, 'logo: largura nativa 1024');
  assert(png.readUInt32BE(20) === 682, 'logo: altura nativa 682');
}

{
  const electronicFile = path.join(
    process.cwd(),
    'public',
    MUNDO_NOVO_ELECTRONIC_LOGO_PUBLIC_FILE,
  );
  assert(fs.existsSync(electronicFile), 'logo eletrônica exclusiva existe em public/');
  const epng = fs.readFileSync(electronicFile);
  assert(epng.readUInt32BE(16) === 1024, 'logo eletrônica: largura 1024');
  assert(epng.readUInt32BE(20) === 682, 'logo eletrônica: altura 682');
}

{
  const size = mundoNovoPdfChromeLogoSizeMm();
  const nativeRatio = MUNDO_NOVO_LOGO_NATIVE_WIDTH / MUNDO_NOVO_LOGO_NATIVE_HEIGHT;
  assert(size.widthMm <= 24, 'logo: largura do chrome cabe no cabeçalho');
  assert(size.heightMm <= 16, 'logo: altura do chrome não ocupa excesso');
  assert(
    Math.abs(size.widthMm / size.heightMm - nativeRatio) < 0.02,
    'logo: chrome preserva proporção nativa 1024x682',
  );
}

{
  const logoFile = path.join(process.cwd(), 'public', MUNDO_NOVO_LOGO_PUBLIC_FILE);
  const officialLogo =
    'data:image/png;base64,' + fs.readFileSync(logoFile).toString('base64');
  const chrome = buildContractPdfChromeFromTenant(
    {
      contract_model: 'MUNDO_NOVO',
      razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
      cnpj: '57590706000178',
      logo_url: 'https://cdn.test/chacreamento-araguaia.png',
      address: 'Avenida dos Ipês, Quadra 31, Lote 13',
      city: 'Parauapebas',
      state: 'PA',
    },
    '000000007/2026',
    officialLogo,
  );
  assert(
    chrome.logoBase64 === officialLogo,
    'logo: chrome Mundo Novo usa o asset oficial carregado pelo caller',
  );
  assert(
    !String(chrome.logoBase64 || '').includes('chacreamento-araguaia'),
    'logo: chrome Mundo Novo não embute URL/logo do Araguaia',
  );
  assert(!('logo_url' in chrome), 'logo: chrome não copia companies.logo_url');
  assert(typeof chrome.logoWidthMm === 'number', 'logo: chrome Mundo Novo define largura');
  assert(typeof chrome.logoHeightMm === 'number', 'logo: chrome Mundo Novo define altura');
}

{
  const chromeEmpty = buildContractPdfChromeFromTenant(
    {
      contract_model: 'MUNDO_NOVO',
      razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
      cnpj: '57590706000178',
      logo_url: 'https://cdn.test/chacreamento-araguaia.png',
    },
    '000000007/2026',
    null,
  );
  assert(
    chromeEmpty.logoBase64 === null,
    'logo: chrome Mundo Novo não puxa companies.logo_url quando o caller não carrega asset',
  );
}

{
  const araguaiaChrome = buildContractPdfChromeFromTenant(
    {
      contract_model: 'ARAGUAIA',
      razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
      cnpj: '57590706000178',
      logo_url: 'https://cdn.test/chacreamento-araguaia.png',
      address: 'Avenida Dos Ipes, Quadra 31, Lote 13, S/N',
      neighborhood: 'Cidade Jardim',
      city: 'Parauapebas',
      state: 'PA',
    },
    '000000008/2026',
    'data:image/png;base64,ARAGUAIA_LOGO',
  );
  assert(
    araguaiaChrome.logoBase64 === 'data:image/png;base64,ARAGUAIA_LOGO',
    'logo: chrome ARAGUAIA preserva a logo da empresa',
  );
  assert(
    araguaiaChrome.logoWidthMm === undefined &&
      araguaiaChrome.logoHeightMm === undefined,
    'logo: chrome ARAGUAIA não recebe dimensões do Mundo Novo',
  );
}

{
  const size = mundoNovoPdfChromeLogoSizeMm();
  const logoFile = path.join(process.cwd(), 'public', MUNDO_NOVO_LOGO_PUBLIC_FILE);
  const officialLogo =
    'data:image/png;base64,' + fs.readFileSync(logoFile).toString('base64');
  const addImageCalls: unknown[][] = [];
  const fakePdf = {
    internal: {
      getNumberOfPages: () => 1,
      pageSize: { width: 210, height: 297 },
    },
    setPage() {},
    setFontSize() {},
    setTextColor() {},
    setFont() {},
    text() {},
    splitTextToSize: (text: string) => [text],
    addImage: (...args: unknown[]) => {
      addImageCalls.push(args);
    },
    setDrawColor() {},
    setLineWidth() {},
    line() {},
    deletePage() {},
  };
  const mundoChrome = buildContractPdfChromeFromTenant(
    { contract_model: 'MUNDO_NOVO', razao_social: 'R R NEGÓCIOS' },
    '000000007/2026',
    officialLogo,
  );
  applyContractPdfChrome(fakePdf as never, mundoChrome);
  assert(addImageCalls.length === 1, 'logo: chrome Mundo Novo desenha a imagem');
  assert(addImageCalls[0][4] === size.widthMm, 'logo: jsPDF usa largura proporcional');
  assert(addImageCalls[0][5] === size.heightMm, 'logo: jsPDF usa altura proporcional');
  assert(
    String(addImageCalls[0][0]).startsWith('data:image/png;base64,'),
    'logo: jsPDF recebe o PNG oficial',
  );

  addImageCalls.length = 0;
  applyContractPdfChrome(fakePdf as never, {
    tenantName: 'R R NEGÓCIOS',
    tenantCnpj: '',
    addressLine: '',
    cityUfLine: '',
    contractNumber: '000000008/2026',
    logoBase64: 'data:image/png;base64,ARAGUAIA_LOGO',
  });
  assert(addImageCalls[0][4] === 22 && addImageCalls[0][5] === 12, 'logo: ARAGUAIA permanece 22x12 mm');
}

{
  const chrome = buildContractPdfChromeFromTenant(
    {
      contract_model: 'MUNDO_NOVO',
      razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
      cnpj: '57590706000178',
      address: 'Avenida Dos Ipes, Sn - Quadra 31, Lote 13, S/N',
      neighborhood: 'Cidade Jardim',
      city: 'Parauapebas',
      state: 'PA',
    },
    '000000007/2026',
    null,
  );
  const headerNorm = chrome.addressLine
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  assert(
    headerNorm === 'Avenida Dos Ipes, Quadra 31, Lote 13, Cidade Jardim',
    'header Mundo Novo: rua, quadra, lote e bairro sem S/N',
  );
  assert(!/S\s*\/\s*N|\bSn\b/i.test(chrome.addressLine), 'header Mundo Novo sem token S/N');
  assert(
    (chrome.addressLine.match(/Cidade Jardim/gi) || []).length === 1,
    'header Mundo Novo sem bairro duplicado',
  );
}

{
  const araguaiaHeader = buildContractPdfChromeFromTenant(
    {
      contract_model: 'ARAGUAIA',
      razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
      cnpj: '57590706000178',
      address: 'Avenida Dos Ipes, Sn - Quadra 31, Lote 13',
      neighborhood: 'Cidade Jardim',
      city: 'Parauapebas',
      state: 'PA',
    },
    '000000008/2026',
    'data:image/png;base64,ARAGUAIA_LOGO',
  );
  assert(/Cidade Jardim/i.test(araguaiaHeader.addressLine), 'header ARAGUAIA inalterado (bairro)');
  assert(!/S\s*\/\s*N|\bSn\b/i.test(araguaiaHeader.addressLine), 'header ARAGUAIA inalterado (sem SN)');
}

try {
  generateContractHTML({
    tenant: TENANT,
    customer: CUSTOMER,
    project: { ...PROJECT, seller_parties_json: [] },
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
  });
  throw new Error('deveria falhar sem vendedores');
} catch (e) {
  assert(
    e instanceof Error && e.message === MUNDO_NOVO_MISSING_SELLERS_MESSAGE,
    '6. falta de vendedores → fail closed',
  );
}

assert(html.includes('R R NEGÓCIOS'), '7. INTERVENIENTE da company');
assert(html.includes('57.590.706/0001-78'), '7. CNPJ da INTERVENIENTE');
assert(html.includes(MUNDO_NOVO_INCRA_TITLE), '8. INCRA correto');
assert(!html.includes('MB0346000000389'), '8. sem zero extra no INCRA');
assert(html.includes(MUNDO_NOVO_MATRICULA), '9. matrícula 55.279');
assert(!html.includes('55.278'), '9. não usa matrícula do ARAGUAIA');
assert(html.includes('93 chácaras'), '9. 93 chácaras');
assert(html.includes('parte 02'), '9. parte 02');

const obj = clauseSegunda(html);
assert(obj.includes('chácara nº') && obj.includes('21'), '10. chácara dinâmica 21');
assert(obj.includes('1.200,50 m²') || obj.includes('1200,50'), '10. área dinâmica');
assert(obj.includes('48,20 metros') || obj.includes('48,2'), '10. medida direita dinâmica');
assert(obj.includes('Chácara 20'), '11. confrontação direita dinâmica');
assert(obj.includes('Chácara 22'), '11. confrontação esquerda dinâmica');
assert(obj.includes('Chácara 8'), '11. confrontação fundos dinâmica');
assert(!/confrontando pela frente/i.test(obj), '11. não acrescenta confrontante de frente');
assert(!obj.includes('Quadra 01') && !obj.includes('quadra 01'), '12. quadra da unidade não entra no objeto');

assert(html.includes('R$ 45.000,00') || html.includes('R$ 45.000,00'), '13. preço dinâmico');
assert(html.includes('R$ 5.000,00') || html.includes('R$ 5.000,00'), '13. entrada dinâmica');
assert(html.includes('40'), '13. quantidade de parcelas');
assert(html.includes('15/10/2026') || html.includes('15 de outubro'), '13. primeiro vencimento');
assert(html.includes('15 de setembro de 2026') || html.includes('15 de Setembro de 2026'), '13. data da venda');
assert(!html.includes('37.500'), '18. exemplar 37500 não vaza');
assert(!html.includes('71 parcelas') && !html.includes('>71<'), '18. exemplar 71 parcelas não vaza');

assert(html.includes('IGP-M'), '14. IGP-M fixo');
assert(!html.includes('IPCA'), '14. IPCA da venda não substitui IGP-M');
assert(html.includes('Cláusula Nona'), '15. cláusula 10-C aponta Cláusula Nona');
assert(
  html.includes('infraestrutura descrita na <strong>Cláusula Nona</strong> deste contrato'),
  '15. 10-C referencia Cláusula Nona',
);
assert(
  !/infraestrutura descrita na cláusula oitava/i.test(html),
  '15. 10-C não referencia cláusula oitava',
);

assert(html.includes('PROMITENTE COMPRADOR'), '16. comprador masculino correto');
assert(!html.includes('PROMITENTE COMPRADORA'), '16. não reproduz COMPRADORA do exemplar');
assert(html.includes('Corretor Mundo Novo'), '17. corretor dinâmico');
assert(!html.includes('CRECI'), '17. sem CRECI');
assert(!html.includes('12345-PA'), '17. sem número CRECI');

const htmlFemale = generate({
  customer: {
    ...CUSTOMER,
    name: 'Maria Compradora Teste',
    civil_state: 'Solteira',
    nationality: 'Brasileira',
  },
});
assert(htmlFemale.includes('PROMITENTE COMPRADORA'), '16. compradora feminina flexionada');

const htmlOtherLot = generate({
  block: {
    ...BLOCK,
    id: 'block-mn-99',
    lote: '99',
    number: '99',
    area: 500,
    frente: 10,
    fundo: 10,
    'Lado Dir.': 20,
    'Lado Esq.': 20,
    segments_json: [
      { official_side: 'lado_direito', confrontant: 'Chácara 98', distance: 20 },
      { official_side: 'lado_esquerdo', confrontant: 'Chácara 100', distance: 20 },
      { official_side: 'fundo', confrontant: 'Área institucional', distance: 10 },
    ],
  },
  sale: { ...SALE, total_value: 90000, down_payment: 10000, installments_count: 16 },
  financeReceipts: [
    { installment_number: 0, amount: 10000, due_date: '2026-09-15' },
    { installment_number: 1, amount: 5000, due_date: '2026-12-01' },
  ],
});
const obj2 = clauseSegunda(htmlOtherLot);
assert(obj2.includes('99') && !obj2.includes('chácara nº <strong>21</strong>'), '18. outra chácara');
assert(obj2.includes('Chácara 98'), '18. outras confrontações');
assert(htmlOtherLot.includes('R$ 90.000,00') || htmlOtherLot.includes('R$ 90.000,00'), '18. outro preço');
assert(!htmlOtherLot.includes('1.200,50'), '18. área da venda 21 não vaza');

const araguaiaHtml = generateContractHTML({
  tenant: { ...TENANT, contract_model: 'ARAGUAIA' },
  customer: CUSTOMER,
  project: { name: 'Chacreamento Araguaia', contract_model: 'ARAGUAIA' },
  block: BLOCK,
  sale: SALE,
  financeReceipts: RECEIPTS,
});
assert(araguaiaHtml.includes('data-contract-model="ARAGUAIA"'), '3. ARAGUAIA permanece no próprio path');
assert(!araguaiaHtml.includes('Maria Elvira de Sousa'), '3. ARAGUAIA não puxa vendedores Mundo Novo');
assert(isAraguaiaContractModel({ contract_model: 'ARAGUAIA' }), '3. isAraguaia intacto');

const direct = generateMundoNovoContract({
  tenant: TENANT,
  customer: CUSTOMER,
  project: PROJECT,
  block: BLOCK,
  sale: SALE,
  financeReceipts: RECEIPTS,
});
assert(direct.includes('data-contract-model="MUNDO_NOVO"'), '2. generateMundoNovoContract direto');

{
  const page = fs.readFileSync(
    path.join(process.cwd(), 'app/contracts/page.tsx'),
    'utf8',
  );
  assert(page.includes('sv-contract-mundo-novo'), 'PDF client detecta HTML Mundo Novo');
  assert(page.includes('htmlLooksMundoNovo'), 'PDF client isola chrome Mundo Novo');
  assert(page.includes('MUNDO_NOVO_LOGO_PATH'), 'PDF Mundo Novo carrega asset próprio');
  assert(
    !page.includes('!htmlLooksMundoNovo && getReportHeaderLogoUrl'),
    'PDF Mundo Novo não carrega logo da empresa',
  );
}

{
  const salePdf = fs.readFileSync(
    path.join(process.cwd(), 'lib/saleContractPdf.ts'),
    'utf8',
  );
  assert(
    /isMundoNovoContractModel\(tenant\)\) \{\s*return loadMundoNovoLogoDataUrl\(\);/.test(
      salePdf,
    ),
    'PDF server Mundo Novo lê o PNG em public/',
  );
}

{
  const chromeJs = fs.readFileSync(
    path.join(process.cwd(), 'lib/contractPdfChromeBrowser.js'),
    'utf8',
  );
  assert(chromeJs.includes('logoWidthMm'), 'chrome browser aceita largura da logo');
  assert(chromeJs.includes('logoHeightMm'), 'chrome browser aceita altura da logo');
}

console.log('\nOK mandatory-mundo-novo-contract-tests');

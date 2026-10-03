/**
 * Testes obrigatórios — modelo CUSTOM LF ESTRELA.
 * npx tsx scripts/mandatory-lf-estrela-custom-tests.ts
 *
 * Não altera o motor ESTRELA_DO_SUL, vendas nem Production.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  createNewModel,
  type OperationalStore,
} from '../lib/contractModelCentralOps';
import {
  CUSTOM_CONTRACT_EDITOR_PATH,
  canOpenCustomA4Editor,
} from '../lib/customContractModelEditor';
import {
  countVisualA4Pages,
  fillCustomPlaceholdersForFinal,
  fillCustomPlaceholdersForPreview,
  hydrateCustomPlaceholderHtml,
} from '../lib/customContractHtml';
import { CUSTOM_CONTRACT_PRINT_EXTRA_CSS } from '../lib/customContractPrint';
import {
  CUSTOM_A4_MARGIN_MM,
  customA4ContentWidthMm,
  formatA4PageDiagnostic,
  reportA4Pages,
  type A4LayoutUnit,
} from '../lib/customContractA4Layout';
import {
  applyLfEstrelaConditionals,
  assertNoSemDadoInFinalHtml,
  composeLfEstrelaContractHtml,
  formatLfEstrelaMissingMessage,
  LF_ESTRELA_REQUIRED_FIELDS,
} from '../lib/lfEstrelaEmission';
import { CUSTOM_PLACEHOLDER_KEYS } from '../lib/customContractPlaceholders';
import { resolveCustomPreviewValues } from '../lib/customContractPreviewResolver';
import { formatLfPartnershipNote } from '../lib/lfImoveisContractConfig';
import {
  LF_ESTRELA_CATALOG_CODE,
  LF_ESTRELA_ENGINE_KEY,
  LF_ESTRELA_MODEL_NAME,
  LF_ESTRELA_PAGE_MARKER_RE,
  LF_ESTRELA_REQUIRED_PHRASES,
  LF_ESTRELA_REQUIRED_TOKENS,
  assertNoLfEstrelaPageMarkers,
  buildLfEstrelaCustomHtml,
  findLfEstrelaPageMarkers,
  isLfEstrelaModelName,
} from '../lib/lfEstrelaCustomTemplate';
import {
  assertLfEstrelaSqlHtmlMatchesOfficial,
  extractLfEstrelaHtmlFromDevelopPublishSql,
  sha256Utf8,
} from './develop/lfEstrelaPublishSqlHtml';
import {
  buildProjectCustomContractOptions,
  engineContractModelForCustomOverlay,
  formatProjectCustomContractValue,
  resolveProjectCompanyUuid,
} from '../lib/projectCustomContractModels';
import {
  loadPublishedLfEstrelaForProject,
  tryBuildLfEstrelaCustomSaleHtml,
} from '../lib/lfEstrelaSaleContract';

const ROOT = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function emptyStore(): OperationalStore {
  return {
    models: [],
    versions: [],
    links: [],
    companiesContractModel: {},
    projectsContractModel: {},
    generatedHtmlByContractId: {},
  };
}

function markerScan(label: string, source: string): void {
  const hits = source.match(LF_ESTRELA_PAGE_MARKER_RE) || [];
  assert(hits.length === 0, `${label}: nenhuma expressão "pagina X acima" (${hits.join(', ') || 'ok'})`);
}

const html = buildLfEstrelaCustomHtml();
assert(isLfEstrelaModelName(LF_ESTRELA_MODEL_NAME), 'nome canônico LF ESTRELA');
assert(LF_ESTRELA_CATALOG_CODE === 'CUSTOM', 'tipo CUSTOM');
assert(LF_ESTRELA_ENGINE_KEY === 'custom', 'engine_key custom');
assert(canOpenCustomA4Editor('CUSTOM'), 'abre no editor A4 CUSTOM');
assert(
  CUSTOM_CONTRACT_EDITOR_PATH('abc-123') === '/contracts/models/abc-123/editor',
  'rota Editar contrato',
);

assertNoLfEstrelaPageMarkers(html);
markerScan('HTML do modelo', html);
assert(findLfEstrelaPageMarkers('pagina 1 acima pagina 2 acima').length === 2, 'regex detecta marcadores de desenvolvedor');
assert(LF_ESTRELA_PAGE_MARKER_RE.test('Página 10 acima'), 'regex acento/caixa');
LF_ESTRELA_PAGE_MARKER_RE.lastIndex = 0;

for (const phrase of LF_ESTRELA_REQUIRED_PHRASES) {
  assert(html.includes(phrase), `conteúdo jurídico: ${phrase}`);
}

for (let n = 1; n <= 12; n += 1) {
  const labels = [
    'CLÁUSULA PRIMEIRA',
    'CLÁUSULA SEGUNDA',
    'CLÁUSULA TERCEIRA',
    'CLÁUSULA QUARTA',
    'CLÁUSULA QUINTA',
    'CLÁUSULA SEXTA',
    'CLÁUSULA SÉTIMA',
    'CLÁUSULA OITAVA',
    'CLÁUSULA NONA',
    'CLÁUSULA DÉCIMA',
    'CLÁUSULA DÉCIMA PRIMEIRA',
    'CLÁUSULA DÉCIMA SEGUNDA',
  ];
  assert(html.includes(labels[n - 1]), `cláusula ${n}`);
}

assert(html.includes('CAPA RESUMO DO CONTRATO DE PROMESSA DE COMPRA E VENDA'), 'Capa Resumo');
assert(html.includes('INFRAESTRUTURA ESSENCIAL'), 'bloco de infraestrutura');
assert((html.match(/COMPRADOR 1/g) || []).length >= 2, 'dois blocos de assinatura (capa + instrumento)');
assert((html.match(/WITNESS_1_NAME/g) || []).length >= 2, 'testemunhas nos dois blocos');
assert((html.match(/data-sv-page-break/g) || []).length === 7, 'sete quebras estruturais (5.1–6.5 fluem juntos)');
assert((html.match(/data-sv-lf-page="/g) || []).length === 8, 'oito seções estruturais; 5.1 não fica órfão antes de quebra');
assert((html.match(/data-sv-company-logo/g) || []).length === 8, 'um logo por seção estrutural');
assert(html.includes('sv-lf-51-head'), '5.1 parte principal em bloco de fluxo próprio');
assert(html.includes('sv-lf-51-tail'), '5.1 trecho final em bloco protegido');
assert(html.includes('sv-lf-widow-pair'), 'últimas linhas do 5.1 ficam juntas na quebra');
assert(
  html.includes('sv-lf-51-head') &&
    html.includes('sv-lf-51-tail') &&
    html.includes('configurará infração contratual grave e posse de má-fé por parte do COMPRADOR.'),
  '5.1 jurídico permanece; só o trecho final é bloco separado',
);
assert(
  !html.includes('<span class="sv-lf-widow-pair">'),
  '5.1 não usa span inline-block (html2canvas serra o inline)',
);
assert(!/sv-lf-keep-para[\s\S]{0,80}5\.1\./.test(html), '5.1 não usa keepTogether do parágrafo inteiro');
assert(!/sv-lf-keepTogether[\s\S]{0,80}5\.1\./.test(html), '5.1 não usa keepTogether');
assert(
  /sv-lf-51-head[\s\S]{0,80}5\.1\./.test(html) &&
    /sv-lf-51-tail[\s\S]{0,40}bem como o desrespeito/.test(html),
  'corte do 5.1 só no trecho final, sem mover o item inteiro',
);
const keepBlocks = html.match(/<div class="sv-lf-keep-with-next">[\s\S]*?<\/div>/g) || [];
assert(keepBlocks.length >= 12, 'keep-with-next em cada abertura de cláusula');
assert(
  keepBlocks.every((block) => !block.includes('<p')),
  'keep-with-next só no título da cláusula, sem parágrafo jurídico longo',
);
assert(
  (html.match(/sv-lf-keep-para/g) || []).length === 1,
  'keep-para só no parágrafo individual 2.9.1',
);
assert(
  /class="sv-lf-body lf-estrela-body sv-lf-keep-para"><strong>2\.9\.1\.<\/strong>/.test(html),
  '2.9.1 inteiro no parágrafo com keep-para',
);
assert(
  !/sv-lf-keep-para[\s\S]{0,80}2\.9\.2/.test(html),
  '2.9.2 não entra no keep-para do 2.9.1',
);

const capaPages = html.split(/<div data-sv-page-break="true"[^>]*><\/div>/);
assert(capaPages.length === 8, 'Capa + infra + instrumento sem página órfã de 5.1/título');
assert(
  capaPages[0].includes('CAPA RESUMO') &&
    capaPages[0].includes('DAS PARTES CONTRATANTES') &&
    capaPages[0].includes('DAS CONDIÇÕES FINANCEIRAS') &&
    capaPages[0].includes('lf-estrela-footnote') &&
    capaPages[0].includes('<sup>1</sup>') &&
    capaPages[0].includes('<sup>4</sup>'),
  'página 1 da Capa: seções 1–4 + notas 1–4',
);
assert(
  capaPages[1].includes('INFRAESTRUTURA ESSENCIAL') &&
    capaPages[1].includes('COMPRADOR 1') &&
    capaPages[1].includes('WITNESS_1_NAME') &&
    capaPages[1].includes('lf-estrela-signatures') &&
    !capaPages[1].includes('CONTRATO DE PROMESSA<br>') &&
    !capaPages[1].includes('CLÁUSULA PRIMEIRA'),
  'página 2 da Capa: infraestrutura + data + assinaturas (sem o instrumento)',
);
assert(
  capaPages[2].includes('CONTRATO DE PROMESSA') &&
    capaPages[2].includes('CLÁUSULA PRIMEIRA') &&
    capaPages[2].includes('CLÁUSULA SEGUNDA') &&
    !capaPages[2].includes('INFRAESTRUTURA ESSENCIAL') &&
    !capaPages[2].includes('VALOR TOTAL DO IMÓVEL'),
  'página 3 começa o instrumento e termina antes da tabela financeira',
);
assert(
  capaPages[3].includes('VALOR TOTAL DO IMÓVEL') &&
    capaPages[3].includes('<sup>5</sup>') &&
    capaPages[3].includes('<sup>6</sup>') &&
    capaPages[3].includes('2.9.2') &&
    capaPages[3].includes('CLÁUSULA TERCEIRA') &&
    capaPages[3].includes('5.1.') &&
    capaPages[3].includes('5.2.') &&
    capaPages[3].includes('6.5.') &&
    !capaPages[3].includes('CLÁUSULA SÉTIMA'),
  'financeiro até 6.5 fluem juntos (5.1 não gera página vazia)',
);
assert(
  capaPages[4].includes('CLÁUSULA SÉTIMA') &&
    capaPages[4].includes('7.1.') &&
    capaPages[4].includes('CLÁUSULA NONA'),
  'Cláusula Sétima acompanha 7.1 na mesma página estrutural',
);
assert(capaPages[5].includes('9.2.') && capaPages[5].includes('CLÁUSULA DÉCIMA'), 'continuação da nona + décima');
assert(capaPages[6].includes('10.3.') && capaPages[6].includes('12.2.'), '10.3–12.2');
assert(
  capaPages[7].includes('12.3.') &&
    capaPages[7].includes('CLÁUSULA DÉCIMA SEGUNDA') === false &&
    capaPages[7].includes('lf-estrela-signatures'),
  'fechamento 12.3–12.7 + data + assinaturas',
);
assert(!html.includes('sv-lf-keepTogether'), 'assinatura da Capa sem keepTogether de página inteira');
assert((html.match(/lf-estrela-footnote/g) || []).length >= 7, 'sete notas tipográficas');
assert(html.includes('sv-lf-body lf-estrela-body'), 'parágrafos do corpo com classe distinta das notas');

for (const key of LF_ESTRELA_REQUIRED_TOKENS) {
  assert(CUSTOM_PLACEHOLDER_KEYS.has(key), `token oficial existe: ${key}`);
  assert(html.includes(`{{${key}}}`), `HTML usa {{${key}}}`);
}

assert(html.includes('{{PARTNERSHIP_NOTE}}'), 'PARTNERSHIP_NOTE no HTML');
assert(!/30%\s+do valor e\s+70%/i.test(html), 'participação 30/70 não está congelada');
assert(!/\[data de publica/i.test(html), '9.2 não usa Data de Publicação');
assert(!/30 DE SETEMBRO DE 2026/i.test(html), 'data de assinatura é token');
assert(html.includes('{{CLIENT_NAME}}'), 'comprador dinâmico');
assert(html.includes('{{BLOCK_NAME}}') && html.includes('{{LOT_NUMBER}}'), 'imóvel dinâmico');
assert(html.includes('{{SALE_VALUE}}') && html.includes('{{BROKER_COMMISSION}}'), 'financeiro dinâmico');
assert(html.includes('{{INSTALLMENTS_SCHEDULE}}'), 'descrição de parcelas dinâmica');
assert(!html.includes('parcelas de {{INSTALLMENT_VALUE}}'), 'não imprime só a 1ª parcela como se todas fossem iguais');
assert(html.includes('{{CONTRACT_DATE_EXTENSO}}'), 'data dinâmica por extenso');
assert(html.includes('2% (dois por cento) sobre a parcela vencida'), 'constante jurídica multa 2%');
assert(html.includes('1% (um por cento) ao mês'), 'constante jurídica juros 1%');

const css = read('components/contracts/editor/customContractEditor.css');
assert(css.includes('.sv-lf-estrela'), 'CSS LF ESTRELA no editor/prévia/PDF');
assert(css.includes('page-break-inside: auto'), 'tabelas podem atravessar páginas');
assert(/table\.sv-lf-table[\s\S]{0,400}page-break-inside:\s*auto/.test(css), 'tabela LF quebra por linha');
assert(/\.sv-lf-note[\s\S]{0,800}font-size:\s*7pt/.test(css), 'notas 1–4 da Capa em 7pt');
assert(/\.sv-lf-footnote[\s\S]{0,600}font-size:\s*7pt/.test(css), 'notas 5–7 do instrumento em 7pt');
assert(/\.lf-estrela-footnote[\s\S]{0,180}line-height:\s*1\.1/.test(css), 'notas com line-height compacto 1.1');
assert(css.includes('.lf-estrela-title'), 'classe de título');
assert(css.includes('.lf-estrela-clause-title'), 'classe de cláusula');
assert(css.includes('.lf-estrela-body'), 'classe de corpo');
assert(css.includes('.lf-estrela-table'), 'classe de tabela');
assert(css.includes('.lf-estrela-signatures'), 'classe de assinatura');
assert(!/table\.sv-lf-sign[\s\S]{0,220}page-break-inside:\s*avoid/.test(css), 'assinatura LF não é keepTogether gigante');
assert(CUSTOM_A4_MARGIN_MM === 15 && customA4ContentWidthMm() === 180, 'LF ESTRELA usa área útil 180mm');
assert(css.includes('--paper-pad: 15mm'), 'margem visual 15mm no editor/prévia');
assert(!css.includes('--paper-pad: 10mm') && !css.includes('--paper-pad: 12mm'), 'margens 15mm não foram reduzidas');
assert(!/<t[hd]\b[^>]*style="width:\d+px"/.test(html), 'colunas LF não usam px que estouram a folha');
assert(/<th[^>]*style="width:\d+%"/.test(html), 'colunas LF em % da área útil');

const printSrc = read('lib/customContractPrint.ts');
assert(printSrc.includes('printCustomContractPreview'), 'PDF usa a prévia paginada CUSTOM');
assert(!/generateEstrelaDoSulContract\s*\(/.test(printSrc), 'PDF não chama o motor ESTRELA');
assert(
  printSrc.includes('Não usa generateContractHTML') || !/generateContractHTML\s*\(/.test(printSrc),
  'PDF não usa generateContractHTML',
);
assert(/@page \{ size: A4; margin: 0; \}/.test(printSrc), 'PDF não duplica 15mm no @page');
assert(
  /<body class="sv-editor-preview-doc">\$\{html\}<\/body>/.test(printSrc),
  'PDF imprime a folha já diagramada, sem segundo padding',
);

const templateSrc = read('lib/lfEstrelaCustomTemplate.ts');
assert(!/from ['"]@\/lib\/estrelaDoSul/.test(templateSrc), 'template não importa o motor');
assert(!/buildEstrelaDoSul[A-Z]/.test(templateSrc), 'template não usa builders do motor');
markerScan('fonte do template', templateSrc);

const centralSrc = read('components/contracts/central/ContractModelsOperationalCentral.tsx');
assert(centralSrc.includes('buildLfEstrelaCustomHtml'), 'Central cria LF ESTRELA com o HTML oficial');
assert(centralSrc.includes('Usar texto oficial LF ESTRELA'), 'Central oferece o modelo LF ESTRELA');

const store = createNewModel(emptyStore(), {
  callerCompanyId: 'company-lf',
  name: LF_ESTRELA_MODEL_NAME,
  personalized: true,
});
assert(store.model.name === LF_ESTRELA_MODEL_NAME, 'createNewModel grava o nome LF ESTRELA');
assert(store.model.catalogCode === 'CUSTOM', 'modelo criado é CUSTOM');
assert(store.model.status === 'active', 'status Ativo');
assert(store.model.source === 'user', 'origem user/empresa');
assert(canOpenCustomA4Editor(store.model.catalogCode), 'modelo criado abre no editor');

const hydrated = hydrateCustomPlaceholderHtml(html);
markerScan('HTML hidratado (editor)', hydrated);

const previewValues = resolveCustomPreviewValues({
  tenantId: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
  company: {
    razao_social: 'L.F. IMÓVEIS LTDA',
    cnpj: '47.052.349/0001-30',
    city: 'Parauapebas',
    state: 'PA',
  },
  customer: {
    name: 'MARIA HOMOLOG LF',
    cpf_cnpj: '529.982.247-25',
    rg: '1234567',
    profession: 'Comerciante',
    civil_state: 'Solteiro(a)',
    address: 'Rua Homologacao, 100',
  },
  sale: {
    company_id: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
    total_value: 80000,
    down_payment: 10000,
    commission: 4000,
    installments_count: 12,
    installment_value: 5833.33,
    sale_date: '2026-09-30',
    sale_spouse_name: 'JOAO CONJUGE',
    sale_spouse_cpf: '390.533.447-05',
    lf_contract_snapshot_json: {
      version: 1,
      hasSecondVendor: true,
      secondVendor: {
        name: 'ANTONIO FERREIRA SILVA',
        cpf: '718.773.122-15',
        email: 'aferreirasilva199@gmail.com',
      },
      participation: { firstVendorPercent: 40, secondVendorPercent: 60 },
      project: {
        projectName: 'CHACREAMENTO ESTRELA DO SUL',
        city: 'Parauapebas',
        uf: 'PA',
        neighborhood: 'Palmares 2',
        address: 'PALMARES 2',
        contractForum: 'Parauapebas',
      },
      capturedAt: '2026-09-30T12:00:00.000Z',
    },
  },
  project: {
    name: 'CHACREAMENTO ESTRELA DO SUL',
    city: 'Parauapebas',
    uf: 'PA',
    address: 'PALMARES 2',
    forum_city: 'Parauapebas',
    lf_contract_config_json: {
      participation: { firstVendorPercent: 40, secondVendorPercent: 60 },
      secondVendor: { name: 'ANTONIO FERREIRA SILVA', cpf: '718.773.122-15' },
    },
  },
  lot: {
    quadra: '01',
    lote: '32',
    area: 667.15,
    front: 25,
    back: 25,
    right: 26.69,
    left: 26.69,
  },
  receipts: [
    { installment_number: 0, amount: 10000, due_date: '2026-09-30' },
    { installment_number: 1, amount: 5833.33, due_date: '2026-10-30' },
  ],
  commissions: [{ amount: 4000 }],
});

assert(previewValues.PARTNERSHIP_NOTE?.includes('40%'), 'resolver: PARTNERSHIP_NOTE 40/60 do snapshot');
assert(previewValues.PARTNERSHIP_NOTE?.includes('60%'), 'resolver: segundo percentual 60%');
assert(!previewValues.PARTNERSHIP_NOTE?.includes('30% do valor e 70%'), 'resolver não cai no 30/70 fixo');
assert(previewValues.CLIENT_NAME === 'MARIA HOMOLOG LF', 'resolver: comprador');
assert(previewValues.SALE_VALUE, 'resolver: valor da venda');
assert(previewValues.CONTRACT_DATE_EXTENSO?.includes('SETEMBRO'), 'resolver: data por extenso');

const previewHtml = fillCustomPlaceholdersForPreview(html, previewValues);
markerScan('Preview resolvido', previewHtml);
assert(previewHtml.includes('MARIA HOMOLOG LF'), 'Visualizar resolve comprador');
assert(previewHtml.includes('40%'), 'Visualizar resolve participação 40/60');
assert(!previewHtml.includes('{{CLIENT_NAME}}'), 'Visualizar não deixa token de comprador cru');
assert(!previewHtml.includes('{{PARTNERSHIP_NOTE}}'), 'Visualizar resolve PARTNERSHIP_NOTE');
assert(!previewHtml.includes('{{SALE_VALUE}}'), 'Visualizar resolve financeiro');

const note50 = formatLfPartnershipNote({
  companyName: 'L.F. IMÓVEIS LTDA',
  secondVendorName: 'ANTONIO FERREIRA SILVA',
  firstVendorPercent: 50,
  secondVendorPercent: 50,
});
const html50 = fillCustomPlaceholdersForPreview(html, {
  ...previewValues,
  PARTNERSHIP_NOTE: note50,
});
assert(html50.includes('50% do valor e 50%'), '40/60, 50/50 e 30/70 são dinâmicos (50/50)');

const note30 = formatLfPartnershipNote({
  companyName: 'L.F. IMÓVEIS LTDA',
  secondVendorName: 'ANTONIO FERREIRA SILVA',
  firstVendorPercent: 30,
  secondVendorPercent: 70,
});
const html30 = fillCustomPlaceholdersForPreview(html, {
  ...previewValues,
  PARTNERSHIP_NOTE: note30,
});
assert(html30.includes('30% do valor e 70%'), '30/70 só aparece quando a venda resolve esse percentual');

const pages = countVisualA4Pages(html);
assert(pages === 8, `quebras estruturais sem páginas órfãs (contado=${pages}; PDF visual ~10 pelo fluxo 5.1–6.5)`);

const printLike = `<div class="sv-a4-sheet sv-a4-prose">${previewHtml}</div>`;
markerScan('PDF/print HTML', printLike);
assert(printLike.includes('MARIA HOMOLOG LF'), 'PDF recebe o HTML da prévia resolvida');

const estrelaMotor = read('lib/estrelaDoSulContractTemplate.ts');
assert(estrelaMotor.includes('generateEstrelaDoSulContract') || estrelaMotor.length > 100, 'motor ESTRELA_DO_SUL permanece');

assert(html.includes('sv-lf-sign-row'), 'assinaturas em duas colunas por linha, sem grade');
assert(html.includes('data-sv-if="noSpouse"'), 'sem cônjuge: spacer vazio no lugar da linha COMPRADOR 2');
assert(html.includes('data-sv-if="spouse"'), 'linha COMPRADOR 2 é condicional');
assert(html.includes('data-sv-if="companyCreci"'), 'CRECI da empresa é condicional');

const homologValues: Record<string, string | null> = {
  CLIENT_NAME: 'SEVERINO JOSE DE FRANÇA',
  CLIENT_CPF: '012.345.678-90',
  CLIENT_RG: '1234567',
  CLIENT_RG_ISSUER: 'PC/PA',
  CLIENT_NATIONALITY: 'Brasileiro',
  CLIENT_CIVIL_STATE: 'Solteiro(a)',
  CLIENT_PROFESSION: 'Agricultor',
  CLIENT_ADDRESS: 'Rua Homologação, 100',
  COMPANY_LEGAL_NAME: 'L.F. IMÓVEIS LTDA',
  COMPANY_CNPJ: '47.052.349/0001-30',
  COMPANY_ADDRESS: 'Palmares 2',
  COMPANY_NEIGHBORHOOD: 'Palmares 2',
  COMPANY_CITY: 'Parauapebas',
  COMPANY_STATE: 'PA',
  COMPANY_ZIP: '68515-000',
  COMPANY_EMAIL: 'lf@example.com',
  COMPANY_PHONE: '94999990000',
  COMPANY_CRECI: '',
  SELLER_2_NAME: 'ANTONIO FERREIRA SILVA',
  SELLER_2_CPF_CNPJ: '718.773.122-15',
  SELLER_2_NATIONALITY: 'Brasileiro',
  SELLER_2_CIVIL_STATE: 'Casado(a)',
  SELLER_2_PROFESSION: 'Empresário',
  SELLER_2_RG: '9988776',
  SELLER_2_RG_ISSUER: 'PC/PA',
  SELLER_2_ADDRESS: 'Parauapebas/PA',
  SELLER_2_EMAIL: 'aferreirasilva199@gmail.com',
  PROJECT_NAME: 'CHACREAMENTO ESTRELA DO SUL',
  PROJECT_CITY: 'Parauapebas',
  PROJECT_STATE: 'PA',
  PROJECT_FORUM_CITY: 'Parauapebas',
  BLOCK_NAME: '02',
  LOT_NUMBER: '14',
  LOT_AREA: '628,26 m²',
  SALE_VALUE: 'R$ 62,83',
  SALE_VALUE_EXTENSO: 'sessenta e dois reais e oitenta e três centavos',
  PAYMENT_TYPE: 'Parcelado',
  DOWN_PAYMENT: 'R$ 10,00',
  INSTALLMENTS_COUNT: '5',
  INSTALLMENT_VALUE: 'R$ 15,21',
  INSTALLMENTS_SCHEDULE: '5 parcelas — 1ª à 3ª de R$ 15,21; 4ª à 5ª de R$ 12,88',
  FIRST_DUE_DATE: '05/10/2026',
  CONTRACT_DATE_EXTENSO: 'VINTE E CINCO DE SETEMBRO DE DOIS MIL E VINTE E SEIS',
  PARTNERSHIP_NOTE:
    'Será repassado ao primeiro vendedor, L.F. IMÓVEIS LTDA, 40% do valor e 60% ao segundo vendedor, ANTONIO FERREIRA SILVA, sócio citado no contrato de parceria através de boleto o qual fará a distribuição dos valores para ambas as contas, mensalmente seguindo assim até a quitação do objeto em questão.',
  LF_FIRST_VENDOR_PERCENT: '40%',
  LF_SECOND_VENDOR_PERCENT: '60%',
  SPOUSE_NAME: '',
  SPOUSE_CPF: '',
  WITNESS_1_NAME: '',
  WITNESS_1_CPF: '',
  WITNESS_2_NAME: '',
  WITNESS_2_CPF: '',
};

const saleWithoutSpouse = { has_spouse: false, sale_spouse_name: '', sale_spouse_cpf: '' };
const composedFinal = composeLfEstrelaContractHtml(html, homologValues, {
  mode: 'final',
  sale: saleWithoutSpouse,
  requireComplete: true,
});
assertNoSemDadoInFinalHtml(composedFinal.html);
assert(!composedFinal.html.includes('[SEM DADO:'), 'PDF final sem marcador [SEM DADO:');
assert(!/COMPRADOR 2/i.test(composedFinal.html), 'sem cônjuge: não imprime COMPRADOR 2');
assert(!composedFinal.html.includes('CRECI/(PA)'), 'sem CRECI cadastrado: trecho oculto');
assert(composedFinal.html.includes('TESTEMUNHA 1'), 'testemunha 1 mantém rótulo jurídico');
assert(composedFinal.html.includes('__________________'), 'CPF da testemunha vira linha em branco');
assert(composedFinal.html.includes('SEVERINO JOSE DE FRANÇA'), 'fixture homolog: comprador');
assert(composedFinal.html.includes('CHACREAMENTO ESTRELA DO SUL'), 'fixture homolog: empreendimento');
assert(composedFinal.html.includes('628,26 m²'), 'fixture homolog: área');
assert(composedFinal.html.includes('40%'), 'fixture homolog: 40/60');
assert(composedFinal.html.includes('R$ 62,83'), 'fixture homolog: valor');
assert(composedFinal.html.includes('R$ 10,00'), 'fixture homolog: sinal');
assert(
  composedFinal.html.includes('5 parcelas — 1ª à 3ª de R$ 15,21; 4ª à 5ª de R$ 12,88'),
  'fixture homolog: cronograma real das parcelas',
);
assert(!composedFinal.html.includes('5 parcelas de R$ 15,21'), 'não imprime 5 parcelas iguais à 1ª');
assert(composedFinal.html.includes('05/10/2026'), 'fixture homolog: 1º vencimento');
assert(!composedFinal.html.includes('generateEstrelaDoSulContract'), 'HTML CUSTOM não chama o motor');

const withSpouse = composeLfEstrelaContractHtml(
  html,
  { ...homologValues, SPOUSE_NAME: 'MARIA CONJUGE', SPOUSE_CPF: '529.982.247-25' },
  {
    mode: 'final',
    sale: { has_spouse: true, sale_spouse_name: 'MARIA CONJUGE', sale_spouse_cpf: '52998224725' },
    requireComplete: true,
  },
);
assert(/COMPRADOR 2/i.test(withSpouse.html), 'com cônjuge: imprime COMPRADOR 2');
assert(withSpouse.html.includes('MARIA CONJUGE'), 'com cônjuge: nome na capa');

const stripped = applyLfEstrelaConditionals(html, { spouse: false, companyCreci: false });
assert(!/data-sv-if="spouse"/i.test(stripped), 'condicional cônjuge remove o bloco');
assert(!/CRECI\/\(PA\)/i.test(stripped), 'condicional CRECI remove o trecho');

const incomplete = composeLfEstrelaContractHtml(
  html,
  { ...homologValues, CLIENT_NATIONALITY: '', SELLER_2_RG: '' },
  { mode: 'final', sale: saleWithoutSpouse, requireComplete: false },
);
assert(incomplete.missing.includes('Nacionalidade do comprador'), 'nacionalidade obrigatória se vazia');
assert(incomplete.missing.includes('RG do vendedor 2'), 'RG do vendedor 2 obrigatório se vendedor 2 existe');
const blocked = formatLfEstrelaMissingMessage(incomplete.missing);
assert(blocked.includes('Não foi possível gerar o LF ESTRELA.'), 'mensagem de bloqueio');
assert(blocked.includes('• Nacionalidade do comprador'), 'lista o que falta');
assert(LF_ESTRELA_REQUIRED_FIELDS.some((f) => f.key === 'CLIENT_NATIONALITY'), 'nacionalidade está na lista obrigatória');

let threw = false;
try {
  composeLfEstrelaContractHtml(html, { CLIENT_NAME: 'X' }, {
    mode: 'final',
    sale: saleWithoutSpouse,
    requireComplete: true,
  });
} catch (e) {
  threw = e instanceof Error && e.message.includes('Não foi possível gerar o LF ESTRELA.');
}
assert(threw, 'emissão final bloqueia se obrigatórios faltam');

const diagnostic = fillCustomPlaceholdersForPreview('<p>{{CLIENT_NATIONALITY}}</p>', {
  CLIENT_NATIONALITY: null,
});
assert(diagnostic.includes('[SEM DADO:'), 'modo edição ainda sinaliza token sem fonte');
const finalFill = fillCustomPlaceholdersForFinal('<p>{{CLIENT_NATIONALITY}}</p>', {
  CLIENT_NATIONALITY: null,
});
assert(!finalFill.includes('[SEM DADO:'), 'modo final não imprime [SEM DADO:');

assert(
  /page-break-after:\s*auto !important/.test(CUSTOM_CONTRACT_PRINT_EXTRA_CSS) &&
    CUSTOM_CONTRACT_PRINT_EXTRA_CSS.includes('.sv-page-break'),
  'print: .sv-page-break não gera segunda quebra',
);
assert(
  /sv-a4-flow-gap[\s\S]*page-break-after:\s*always !important/.test(CUSTOM_CONTRACT_PRINT_EXTRA_CSS),
  'print: só o spacer do A4Pagination quebra página',
);
assert(
  /font-size:\s*7pt !important/.test(CUSTOM_CONTRACT_PRINT_EXTRA_CSS) &&
    /line-height:\s*1\.1 !important/.test(CUSTOM_CONTRACT_PRINT_EXTRA_CSS),
  'print: notas com estilo computado 7pt / line-height 1.1',
);
assert(
  /sv-lf-sign[\s\S]*border:\s*none !important/.test(CUSTOM_CONTRACT_PRINT_EXTRA_CSS),
  'print: assinaturas sem grade visível',
);

const diagUnits: A4LayoutUnit[] = [
  { id: 'u0', height: 34, kind: 'paragraph', keepTogether: false, keepWithNext: false },
  { id: 'u1', height: 900, kind: 'table', keepTogether: true, keepWithNext: false },
];
const diagPages = [
  {
    start: 0,
    end: 0,
    leftover: 1000,
    footnoteIds: [],
    footnoteHeight: 0,
    pageIndex: 0,
    breakReason: 'keepWithNext' as const,
    nextKind: 'table',
    keepTogether: true,
  },
  {
    start: 1,
    end: 1,
    leftover: 80,
    footnoteIds: [],
    footnoteHeight: 0,
    pageIndex: 1,
    breakReason: 'end' as const,
  },
];
const diag = formatA4PageDiagnostic(reportA4Pages(diagUnits, diagPages, 1034));
assert(diag.includes('Page 1:'), 'diagnóstico registra número da página');
assert(diag.includes('usedHeight: 34px'), 'diagnóstico registra usedHeight');
assert(diag.includes('keepTogether: true'), 'diagnóstico registra keepTogether');
assert(diag.includes('→ ERRO'), 'página órfã por keepTogether é marcada');

const regen = read('lib/contractRegeneration.ts');
assert(regen.includes('tryBuildLfEstrelaCustomSaleHtml'), 'regeneração GIS tenta LF ESTRELA CUSTOM antes do motor');
assert(read('lib/lfEstrelaSaleContract.ts').includes('gisChrome: true'), 'emissão GIS aplica print GIS');
assert(read('lib/lfEstrelaSaleContract.ts').includes('buildLfEstrelaCustomHtml()'), 'GIS usa HTML oficial TypeScript (diagramação 10 páginas)');
assert(read('app/contracts/page.tsx').includes('isLfEstrelaCustomHtml'), 'PDF Contratos detecta LF ESTRELA');
assert(read('lib/contractPdfPostProcess.ts').includes('getLfEstrelaCustomHtml2pdfOptions'), 'html2pdf LF usa 15mm e quebra CSS');
assert(read('lib/contractPdfPostProcess.ts').includes('.sv-lf-keep-with-next'), 'html2pdf evita cortar título+primeiro parágrafo');
assert(read('lib/contractPdfPostProcess.ts').includes('.sv-lf-keep-para'), 'html2pdf evita cortar o parágrafo 2.9.1');
assert(read('lib/contractPdfPostProcess.ts').includes('.sv-lf-51-tail'), 'html2pdf evita o trecho final do 5.1');
assert(read('lib/contractPdfPostProcess.ts').includes('.sv-lf-widow-pair'), 'html2pdf evita órfã das últimas linhas do 5.1');
assert(/orphans:\s*2/.test(read('lib/lfEstrelaPrintCss.ts')), 'corpo jurídico com orphans 2');
assert(/widows:\s*2/.test(read('lib/lfEstrelaPrintCss.ts')), 'corpo jurídico com widows 2');
assert(
  /\.sv-lf-51-tail[\s\S]{0,180}display:\s*block/.test(read('lib/lfEstrelaPrintCss.ts')),
  'trecho final do 5.1 é bloco (não inline-block)',
);
assert(!/\.sv-lf-widow-pair\s*\{[^}]*display:\s*inline-block/.test(read('lib/lfEstrelaPrintCss.ts')), 'widow-pair não é mais inline-block');
assert(/\.sv-lf-section\s*\{[^}]*margin:\s*4px 0 2mm/.test(read('lib/lfEstrelaPrintCss.ts')), 'títulos da capa com 2mm acima da tabela');
assert(/\.sv-lf-section\s*\{[^}]*margin:\s*4px 0 2mm/.test(css), 'prévia/editor: títulos da capa com 2mm acima da tabela');
assert(css.includes('sv-lf-keep-para'), 'prévia/editor protege parágrafo 2.9.1');
assert(css.includes('sv-lf-51-tail'), 'prévia/editor protege o trecho final do 5.1');
assert(css.includes('sv-lf-widow-pair'), 'prévia/editor protege últimas linhas do 5.1');
assert(
  /\.sv-lf-51-tail\s*\{[^}]*margin-top:\s*5mm/.test(read('lib/lfEstrelaPrintCss.ts')),
  'print: folga de 5mm no trecho final do 5.1 (página 6)',
);
assert(
  /\.sv-lf-51-tail\s*\{[^}]*margin-top:\s*5mm/.test(css),
  'prévia/editor: folga de 5mm no trecho final do 5.1',
);
assert(
  !/\.sv-lf-51-head[^{]*\{[^}]*margin-top:\s*\d+mm/.test(read('lib/lfEstrelaPrintCss.ts')),
  '5.1 principal sem folga extra — só o trecho final',
);
assert(
  !/margin-top:\s*(1[1-9]|[2-9]\d)mm/.test(
    (read('lib/lfEstrelaPrintCss.ts').match(/\.sv-lf-51-tail\s*\{[^}]+\}/) || [''])[0],
  ),
  'folga do 5.1-tail no máximo 10mm',
);
assert((html.match(/data-sv-page-break/g) || []).length === 7, '10 páginas: sem nova quebra estrutural');
assert(!/\.sv-lf-51-tail[^{]*\{[^}]*transform:/.test(read('lib/lfEstrelaPrintCss.ts')), 'sem transform no trecho final');
assert(!/avoid:\s*\[[^\]]*['\"]h1['\"]/.test(read('lib/contractPdfPostProcess.ts').slice(
  read('lib/contractPdfPostProcess.ts').indexOf('getLfEstrelaCustomHtml2pdfOptions'),
  read('lib/contractPdfPostProcess.ts').indexOf('getLfEstrelaCustomHtml2pdfOptions') + 900,
)), 'html2pdf LF não usa avoid h1/h2 que gera página vazia');
assert(read('lib/lfEstrelaPrintCss.ts').includes('margin-top: 20mm'), 'assinaturas 20mm abaixo da data');
assert(/padding:\s*2px 5px 8px/.test(read('lib/lfEstrelaPrintCss.ts')), 'texto das células 2mm acima da borda inferior');
assert(!read('lib/lfEstrelaSaleContract.ts').includes('generateEstrelaDoSulContract'), 'loader CUSTOM não usa o motor ESTRELA');
assert(
  !read('lib/lfEstrelaSaleContract.ts').includes('isDevelopHomologRuntime'),
  'CUSTOM não é bloqueado por runtime DEVELOP/Production',
);
assert(
  !/if\s*\(\s*!isDevelopHomologRuntime\(\)\s*\)\s*return\s*null/.test(
    read('lib/lfEstrelaSaleContract.ts'),
  ),
  'tryBuildLfEstrelaCustomSaleHtml não retorna null só por estar em Production',
);
assert(
  read('lib/lfEstrelaSaleContract.ts').includes("eq('status', 'active')"),
  'loader exige modelo CUSTOM ativo',
);
assert(
  read('lib/lfEstrelaSaleContract.ts').includes('is_project_default'),
  'CUSTOM GIS só emite se LF ESTRELA for o padrão do empreendimento',
);
assert(read('lib/customContractPreviewResolver.ts').includes('resolveBuyerNationality'), 'resolver usa precedência de nacionalidade');
assert(read('lib/customerIdentity.ts').includes("pick('nationality', 'nacionalidade')"), 'merge clientes/customers traz nacionalidade');

const gisModal = read('components/projects/GisProjectFormModal.tsx');
assert(gisModal.includes('customContractModels'), 'dropdown do empreendimento aceita extras CUSTOM');
assert(gisModal.includes('formatProjectCustomContractValue'), 'extras usam prefixo ccm:');

const contractModelSrc = read('lib/contractModel.ts');
assert(
  contractModelSrc.includes("export const SALE_CONTRACT_MODEL_OPTIONS") &&
    !/SALE_CONTRACT_MODEL_OPTIONS: SaleContractModel\[\] = \[[^\]]*CUSTOM/s.test(contractModelSrc),
  'SALE_CONTRACT_MODEL_OPTIONS não inclui CUSTOM',
);

const mapPage = read('app/map/page.tsx');
assert(mapPage.includes('queryPublishedCustomModelsLinkedToProject'), 'GIS carrega CUSTOM vinculados');
assert(mapPage.includes('resolveProjectCompanyUuid'), 'GIS usa a empresa do empreendimento, não o tenant da sessão');
assert(mapPage.includes("console.info('[CUSTOM CONTRACT MODELS]'"), 'GIS loga diagnóstico CUSTOM no DEVELOP');
assert(mapPage.includes('persistProjectCustomContractDefault'), 'salvar empreendimento persiste padrão CUSTOM');
assert(mapPage.includes('parseProjectCustomContractModelId'), 'salvar não grava ccm: em projects.contract_model');
assert(mapPage.includes('engineContractModelForCustomOverlay'), 'overlay LF preserva motor ESTRELA_DO_SUL');
assert(
  !/listPublishedCustomModelsLinkedToProject\(\s*supabase,\s*saasTenantId/.test(mapPage),
  'GIS não filtra CUSTOM pelo saasTenantId da sessão',
);

const helpers = read('lib/projectCustomContractModels.ts');
assert(helpers.includes("catalog_code', 'CUSTOM'"), 'lista só CUSTOM');
assert(helpers.includes("engine_key', 'custom'"), 'lista só engine custom');
assert(helpers.includes("status', 'published'"), 'lista só versões publicadas');
assert(helpers.includes('is_project_default'), 'lista lê vínculo do empreendimento');
assert(helpers.includes('.eq(\'project_id\', id)'), 'query parte do project_id real');

assert(
  resolveProjectCompanyUuid({
    company_id: null,
    tenant_id: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
  }) === '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
  'legado company_id NULL usa tenant_id UUID',
);
assert(
  resolveProjectCompanyUuid({
    company_id: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
    tenant_id: 'MASTER-ADMIN',
  }) === '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
  'company_id UUID tem prioridade sobre tenant_id texto',
);
assert(
  resolveProjectCompanyUuid({ company_id: null, tenant_id: 'MASTER-ADMIN' }) === '',
  'tenant_id não-UUID não vira empresa',
);

const mapped = buildProjectCustomContractOptions({
  projectCompanyUuid: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
  links: [
    {
      company_contract_model_id: 'a76f71da-57e7-41b5-8abe-ca022b10de77',
      is_project_default: false,
      company_id: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
    },
  ],
  models: [
    {
      id: 'a76f71da-57e7-41b5-8abe-ca022b10de77',
      name: 'LF ESTRELA',
      catalog_code: 'CUSTOM',
      engine_key: 'custom',
      status: 'active',
      company_id: '3052a000-e8b9-43a4-b8ab-91a4392ffcbc',
    },
  ],
  versions: [
    {
      model_id: 'a76f71da-57e7-41b5-8abe-ca022b10de77',
      version: 1,
      status: 'published',
    },
  ],
});
assert(mapped.length === 1, 'is_project_default=false não esconde LF ESTRELA');
assert(mapped[0].id === 'a76f71da-57e7-41b5-8abe-ca022b10de77', 'mapeia o model_id publicado');
assert(mapped[0].name === 'LF ESTRELA', 'mapeia o nome LF ESTRELA');
assert(mapped[0].isProjectDefault === false, 'preserva is_project_default=false');
assert(
  formatProjectCustomContractValue(mapped[0].id) ===
    'ccm:a76f71da-57e7-41b5-8abe-ca022b10de77',
  'value interno ccm:<model_id>',
);

const publishSql = read('scripts/develop/sql/publish-lf-estrela-v1.develop.sql');
const generatorSrc = read('scripts/develop/generate-publish-lf-estrela-sql.ts');
assert(publishSql.includes('760c32d8-4c43-403b-986c-9872011f44cd'), 'SQL usa o project_id real do DEVELOP');
assert(publishSql.includes('project_company_uuid'), 'SQL resolve empresa pela origem GIS');
assert(!publishSql.includes('ABORT: motor do empreendimento não é ESTRELA_DO_SUL'), 'SQL legado não exige contract_model ESTRELA_DO_SUL');
assert(!/FROM public\\.projects p\\s+WHERE p\\.company_id = v_company_id/.test(publishSql), 'SQL não exige projects.company_id preenchido');
assert(!/DISABLE\s+TRIGGER/i.test(publishSql), 'SQL publicado não contém DISABLE TRIGGER');
assert(!/ENABLE\s+TRIGGER/i.test(publishSql), 'SQL publicado não contém ENABLE TRIGGER');
assert(!publishSql.includes('v_bypass_trigger'), 'SQL não contorna trg_project_contract_model_link_tenant');
assert(!/DISABLE\s+TRIGGER/i.test(generatorSrc), 'gerador não emite DISABLE TRIGGER');
assert(!/ENABLE\s+TRIGGER/i.test(generatorSrc), 'gerador não emite ENABLE TRIGGER');
assert(publishSql.includes('project_contract_model_links cannot cross tenant'), 'SQL documenta a rejeição oficial do trigger');
assert(publishSql.includes('NÃO altera projects.tenant_id'), 'SQL não atualiza tenant_id automaticamente');
assert(
  publishSql.includes('SELECT v_project_id, v_company_id, v_model_id, false'),
  'vínculo is_project_default=false',
);

const officialHtml = buildLfEstrelaCustomHtml();
const htmlFromSql = extractLfEstrelaHtmlFromDevelopPublishSql(publishSql);
assert(htmlFromSql === officialHtml, 'HTML do SQL DEVELOP é byte-a-byte igual a buildLfEstrelaCustomHtml()');
const htmlMatch = assertLfEstrelaSqlHtmlMatchesOfficial(publishSql, officialHtml);
assert(htmlMatch.sha256 === sha256Utf8(officialHtml), 'SHA-256 do HTML publicado = SHA-256 da fonte oficial');
assert(!htmlFromSql.includes('ramoção'), 'HTML oficial não contém typo ramoção');
assert(!htmlFromSql.includes('reamescente'), 'HTML oficial não contém typo reamescente');

type MockRow = Record<string, unknown>;

function createThenChain(rows: MockRow[]) {
  let current = [...rows];
  const chain: {
    select: (...args: unknown[]) => typeof chain;
    in: (col: string, ids: string[]) => typeof chain;
    eq: (col: string, val: unknown) => typeof chain;
    order: (col: string, opts?: { ascending?: boolean }) => typeof chain;
    limit: (n: number) => typeof chain;
    then: (
      resolve: (value: { data: MockRow[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise<unknown>;
  } = {
    select: () => chain,
    in: (col, ids) => {
      current = current.filter((row) => ids.includes(String(row[col] ?? '')));
      return chain;
    },
    eq: (col, val) => {
      current = current.filter((row) => String(row[col] ?? '') === String(val ?? ''));
      return chain;
    },
    order: (col, opts) => {
      const dir = opts?.ascending === false ? -1 : 1;
      current = [...current].sort(
        (a, b) => (Number(a[col]) - Number(b[col])) * dir,
      );
      return chain;
    },
    limit: (n) => {
      current = current.slice(0, n);
      return chain;
    },
    then: (resolve, reject) =>
      Promise.resolve({ data: current, error: null }).then(resolve, reject),
  };
  return chain;
}

function mockLfEstrelaSupabase(db: {
  links: MockRow[];
  models: MockRow[];
  versions: MockRow[];
}) {
  return {
    from(table: string) {
      if (table === 'project_contract_model_links') return createThenChain(db.links);
      if (table === 'company_contract_models') return createThenChain(db.models);
      if (table === 'company_contract_model_versions') return createThenChain(db.versions);
      return createThenChain([]);
    },
  };
}

const LF_TEST_COMPANY = '65433340-1f23-4824-bb72-58f72dc77c15';
const LF_TEST_PROJECT = '8f69070c-7ebe-4ff1-99bf-926cc5bbde28';
const LF_TEST_MODEL = '11111111-1111-4111-8111-111111111111';

function lfEstrelaPublishedDb(overrides?: {
  isProjectDefault?: boolean;
  catalogCode?: string;
  status?: string;
  versionStatus?: string;
  companyId?: string;
  html?: string;
}) {
  const companyId = overrides?.companyId ?? LF_TEST_COMPANY;
  return mockLfEstrelaSupabase({
    links: [
      {
        id: 'link-1',
        company_contract_model_id: LF_TEST_MODEL,
        is_project_default: overrides?.isProjectDefault ?? true,
        company_id: companyId,
        project_id: LF_TEST_PROJECT,
      },
    ],
    models: [
      {
        id: LF_TEST_MODEL,
        name: LF_ESTRELA_MODEL_NAME,
        catalog_code: overrides?.catalogCode ?? 'CUSTOM',
        status: overrides?.status ?? 'active',
        company_id: companyId,
      },
    ],
    versions: [
      {
        id: 'ver-1',
        model_id: LF_TEST_MODEL,
        version: 1,
        status: overrides?.versionStatus ?? 'published',
        content_html: overrides?.html ?? '<div class="sv-lf-estrela">publicado</div>',
      },
    ],
  });
}

void (async () => {
const publishedDefault = await loadPublishedLfEstrelaForProject(
  lfEstrelaPublishedDb() as never,
  LF_TEST_COMPANY,
  LF_TEST_PROJECT,
);
assert(publishedDefault?.modelId === LF_TEST_MODEL, 'DEVELOP/Production: vínculo default + CUSTOM published resolve o modelo');
assert(publishedDefault?.version === 1, 'loader usa a versão published');

const productionLike = await tryBuildLfEstrelaCustomSaleHtml(
  lfEstrelaPublishedDb() as never,
  {
    companyId: LF_TEST_COMPANY,
    projectId: LF_TEST_PROJECT,
    company: {
      razao_social: 'L.F. IMÓVEIS LTDA',
      cnpj: '47.052.349/0001-30',
      city: 'Parauapebas',
      state: 'PA',
    },
    customer: {
      name: 'MARIA HOMOLOG LF',
      cpf_cnpj: '529.982.247-25',
      rg: '1234567',
      nationality: 'brasileira',
      profession: 'Comerciante',
      civil_state: 'Solteiro(a)',
      address: 'Rua Homologacao, 100',
    },
    sale: {
      company_id: LF_TEST_COMPANY,
      total_value: 80000,
      down_payment: 10000,
      commission: 4000,
      installments_count: 12,
      installment_value: 5833.33,
      sale_date: '2026-09-30',
      payment_type: 'Parcelado',
      has_spouse: false,
      lf_contract_snapshot_json: {
        version: 1,
        hasSecondVendor: true,
        secondVendor: {
          name: 'ANTONIO FERREIRA SILVA',
          cpf: '718.773.122-15',
          nationality: 'brasileiro',
          civilState: 'Casado(a)',
          maritalStatus: 'Casado(a)',
          profession: 'Empresário',
          rg: '123456 SSP/PA',
          address: 'Parauapebas - PA',
        },
        participation: { firstVendorPercent: 40, secondVendorPercent: 60 },
      },
    },
    project: {
      name: 'CHACREAMENTO ESTRELA DO SUL',
      city: 'Parauapebas',
      uf: 'PA',
    },
    lot: {
      quadra: '01',
      lote: '32',
      area: 667.15,
    },
    contract: { contract_number: '000000001/2026' },
    receipts: [
      { installment_number: 0, amount: 10000, due_date: '2026-09-30' },
      { installment_number: 1, amount: 5833.33, due_date: '2026-10-30' },
    ],
  },
);
assert(Boolean(productionLike?.html), 'Production + vínculo LF ESTRELA default emite CUSTOM');
assert(
  /sv-lf-estrela/i.test(String(productionLike?.html || '')),
  'HTML CUSTOM contém sv-lf-estrela',
);
assert(
  !/sv-contract-estrela-do-sul/i.test(String(productionLike?.html || '')),
  'HTML CUSTOM não contém sv-contract-estrela-do-sul',
);

const noDefault = await loadPublishedLfEstrelaForProject(
  lfEstrelaPublishedDb({ isProjectDefault: false }) as never,
  LF_TEST_COMPANY,
  LF_TEST_PROJECT,
);
assert(noDefault === null, 'Production sem is_project_default não usa LF ESTRELA');

const noLink = await tryBuildLfEstrelaCustomSaleHtml(
  mockLfEstrelaSupabase({ links: [], models: [], versions: [] }) as never,
  {
    companyId: LF_TEST_COMPANY,
    projectId: LF_TEST_PROJECT,
    company: {},
    customer: {},
    sale: {},
    project: {},
    lot: {},
  },
);
assert(noLink === null, 'Production sem vínculo não usa LF ESTRELA (fail-safe)');

const inactive = await loadPublishedLfEstrelaForProject(
  lfEstrelaPublishedDb({ status: 'archived' }) as never,
  LF_TEST_COMPANY,
  LF_TEST_PROJECT,
);
assert(inactive === null, 'modelo inativo não emite CUSTOM');

const otherCatalog = await loadPublishedLfEstrelaForProject(
  lfEstrelaPublishedDb({ catalogCode: 'ESTRELA_DO_SUL' }) as never,
  LF_TEST_COMPANY,
  LF_TEST_PROJECT,
);
assert(otherCatalog === null, 'catalog_code diferente de CUSTOM não emite LF ESTRELA');

const draftVersion = await loadPublishedLfEstrelaForProject(
  lfEstrelaPublishedDb({ versionStatus: 'draft' }) as never,
  LF_TEST_COMPANY,
  LF_TEST_PROJECT,
);
assert(draftVersion === null, 'versão não published não emite CUSTOM');

const otherCompany = await loadPublishedLfEstrelaForProject(
  lfEstrelaPublishedDb() as never,
  '00000000-0000-4000-8000-000000000000',
  LF_TEST_PROJECT,
);
assert(otherCompany === null, 'tenant/company diferente do empreendimento não resolve o modelo');

assert(
  engineContractModelForCustomOverlay(null) === 'ESTRELA_DO_SUL',
  'overlay CUSTOM continua gravando motor ESTRELA_DO_SUL, não ccm:',
);
assert(
  engineContractModelForCustomOverlay('ESTRELA_DO_SUL') === 'ESTRELA_DO_SUL',
  'projects.contract_model legado ESTRELA_DO_SUL permanece',
);
assert(read('lib/estrelaDoSulContractTemplate.ts').includes('generateEstrelaDoSulContract'), 'motor ESTRELA_DO_SUL intacto');
assert(read('lib/recantoPrimaveraContractTemplate.ts').includes('generateRecantoPrimaveraContract') || read('lib/recantoPrimaveraContractTemplate.ts').length > 100, 'Recanto intacto');
assert(read('lib/mundoNovoContractSellers.ts').length > 0, 'Mundo Novo sellers intacto');

console.log('\nOK — testes obrigatórios LF ESTRELA.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

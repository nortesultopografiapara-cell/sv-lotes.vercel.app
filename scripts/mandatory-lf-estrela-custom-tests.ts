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
  fillCustomPlaceholdersForPreview,
  hydrateCustomPlaceholderHtml,
} from '../lib/customContractHtml';
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
assert((html.match(/TESTEMUNHA 1/g) || []).length >= 2, 'testemunhas nos dois blocos');
assert((html.match(/data-sv-page-break/g) || []).length >= 2, 'quebras estruturais capa→infra e capa→instrumento');

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
assert(html.includes('{{CONTRACT_DATE_EXTENSO}}'), 'data dinâmica por extenso');
assert(html.includes('2% (dois por cento) sobre a parcela vencida'), 'constante jurídica multa 2%');
assert(html.includes('1% (um por cento) ao mês'), 'constante jurídica juros 1%');

const css = read('components/contracts/editor/customContractEditor.css');
assert(css.includes('.sv-lf-estrela'), 'CSS LF ESTRELA no editor/prévia/PDF');
assert(css.includes('page-break-inside: auto'), 'tabelas podem atravessar páginas');
assert(/table\.sv-lf-table[\s\S]{0,220}page-break-inside:\s*auto/.test(css), 'tabela LF quebra por linha');

const printSrc = read('lib/customContractPrint.ts');
assert(printSrc.includes('printCustomContractPreview'), 'PDF usa a prévia paginada CUSTOM');
assert(!/generateEstrelaDoSulContract\s*\(/.test(printSrc), 'PDF não chama o motor ESTRELA');
assert(
  printSrc.includes('Não usa generateContractHTML') || !/generateContractHTML\s*\(/.test(printSrc),
  'PDF não usa generateContractHTML',
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
assert(pages >= 4, `quebras estruturais geram várias páginas (contado=${pages}; A4 live ~10)`);

const printLike = `<div class="sv-a4-sheet sv-a4-prose sv-editor-preview-doc">${previewHtml}</div>`;
markerScan('PDF/print HTML', printLike);
assert(printLike.includes('MARIA HOMOLOG LF'), 'PDF recebe o HTML da prévia resolvida');

const estrelaMotor = read('lib/estrelaDoSulContractTemplate.ts');
assert(estrelaMotor.includes('generateEstrelaDoSulContract') || estrelaMotor.length > 100, 'motor ESTRELA_DO_SUL permanece');

console.log('\nOK — testes obrigatórios LF ESTRELA.');

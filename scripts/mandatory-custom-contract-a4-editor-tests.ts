/**
 * Testes obrigatórios — Editor CUSTOM A4.
 * npx tsx scripts/mandatory-custom-contract-a4-editor-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  cloneStore,
  createNewModel,
  historyForModel,
  importCustomModel,
  snapshotGisFields,
  type OperationalStore,
} from '../lib/contractModelCentralOps';
import {
  configureOrEditTarget,
  resolveUserCreatedModelIdentity,
  visualizeTarget,
} from '../lib/customContractCreateIdentity';
import {
  canonicalizeCustomContractHtml,
  fillCustomPlaceholdersForPreview,
  hydrateCustomPlaceholderHtml,
  isRejectedImportMime,
  sanitizeImportedContractHtml,
} from '../lib/customContractHtml';
import {
  CUSTOM_CONTRACT_EDITOR_PATH,
  CUSTOM_DRAFT_VERSION,
  CUSTOM_EDITOR_ONLY,
  NO_CHANGE_SINCE_PUBLISHED,
  assertCustomEditorAllowed,
  canOpenCustomA4Editor,
  canPublishCustomDraft,
  shouldAutosavePublish,
  simulateEnsureCustomDraft,
  simulatePublishCustomDraft,
} from '../lib/customContractModelEditor';
import {
  CUSTOM_PLACEHOLDERS,
  CUSTOM_PLACEHOLDER_GROUPS,
  DEFAULT_CUSTOM_CONTRACT_HTML,
  PLACEHOLDERS_WITHOUT_AUTOMATIC_SOURCE,
} from '../lib/customContractPlaceholders';
import { convertDocxToCustomHtml, DOCX_IMPORT_LIBRARY } from '../lib/customContractDocxImport';
import { resolveCustomPreviewValues } from '../lib/customContractPreviewResolver';
import {
  COMPANY_LOGO_PREVIEW_EMPTY,
  COMPANY_LOGO_TOKEN,
  renderCompanyLogoBlock,
} from '../lib/customContractLogo';
import { planA4BlockSpacers, type A4LayoutUnit } from '../lib/customContractA4Layout';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const editorPage = read('app/contracts/models/[id]/editor/page.tsx');
const editorUi = read('components/contracts/editor/CustomContractA4Editor.tsx');
const tiptap = read('components/contracts/editor/CustomContractTiptap.tsx');
const central = read('components/contracts/central/ContractModelsOperationalCentral.tsx');
const migration = read('supabase/migrations/20261028121000_contract_model_version_draft_history.sql');
const generateHtml = read('lib/contractTemplate.ts');
const gisSale = read('lib/gisSaleCreateService.ts');
const mundoSellers = read('lib/mundoNovoContractSellers.ts');

assert(editorPage.includes('CustomContractA4Editor'), 'rota /contracts/models/[id]/editor existe');
assert(
  CUSTOM_CONTRACT_EDITOR_PATH('abc') === '/contracts/models/abc/editor',
  'path do editor CUSTOM',
);
assert(tiptap.includes('useEditor') && tiptap.includes('StarterKit'), 'TipTap/ProseMirror no documento');
assert(!editorUi.includes('<textarea') && !tiptap.includes('<textarea'), 'editor não é textarea de HTML');
assert(editorUi.includes('sv-a4-sheet') && editorUi.includes('Salvar rascunho'), 'folha A4 e salvar rascunho');
assert(editorUi.includes('Publicar versão'), 'publicar versão na barra');
assert(editorUi.includes('Salvar como novo'), 'salvar como novo na barra');
assert(editorUi.includes('Visualizar'), 'visualizar na barra');
assert(editorUi.includes('Histórico'), 'histórico na barra');
assert(editorUi.includes('Gerenciar empreendimentos'), 'gerenciar empreendimentos na barra');
assert(editorUi.includes('toggleBold') && editorUi.includes('toggleItalic'), 'negrito e itálico');
assert(editorUi.includes('toggleUnderline'), 'sublinhado');
assert(editorUi.includes('setTextAlign'), 'alinhamento');
assert(editorUi.includes('toggleBulletList') && editorUi.includes('toggleOrderedList'), 'listas');
assert(editorUi.includes('toggleHeading'), 'títulos');
assert(editorUi.includes('setFontSize'), 'tamanho de fonte');
assert(editorUi.includes('undo()') && editorUi.includes('redo()'), 'desfazer/refazer');
assert(editorUi.includes('insertPageBreak'), 'quebra de página');
assert(editorUi.includes('Campos automáticos'), 'painel de campos');

assert(editorUi.includes('CUSTOM_PLACEHOLDER_GROUPS'), 'painel usa os grupos aprovados');
assert(CUSTOM_PLACEHOLDER_GROUPS.length === 11, 'onze grupos de campos automáticos');
assert(
  CUSTOM_PLACEHOLDERS.some((p) => p.key === 'CLIENT_NAME') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'CLIENT_CPF') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'CLIENT_RG_STATE') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'SPOUSE_NAME') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'SELLER_1_NAME') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'SELLER_2_NAME') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'PROJECT_NAME') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'BLOCK_NAME') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'LOT_NUMBER') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'LOT_BOUNDARIES') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'LOT_PRICE') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'SALE_DISCOUNT') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'SALE_VALUE') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'SALE_DUE_DATE') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'BROKER_NAME') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'FINANCIAL_ACCOUNT_LABEL') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'WITNESS_1_NAME') &&
    !CUSTOM_PLACEHOLDERS.some((p) => p.key === 'SALE_NOTES') &&
    !CUSTOM_PLACEHOLDERS.some((p) => p.key === 'SPOUSE_CITY'),
  'placeholders compatíveis com o sistema atual',
);
assert(
  PLACEHOLDERS_WITHOUT_AUTOMATIC_SOURCE.includes('CLIENT_NATIONALITY'),
  'nacionalidade do comprador sem fonte automática',
);

assert(
  hydrateCustomPlaceholderHtml('Olá {{CLIENT_NAME}}').includes('data-sv-placeholder="CLIENT_NAME"'),
  'chip visual preserva chave do placeholder',
);
assert(
  canonicalizeCustomContractHtml(
    hydrateCustomPlaceholderHtml('<p>{{CLIENT_NAME}}</p>'),
  ) === canonicalizeCustomContractHtml('<p>{{CLIENT_NAME}}</p>'),
  'HTML canônico ignora chip vs token',
);

assert(canOpenCustomA4Editor('CUSTOM') && !canOpenCustomA4Editor('MUNDO_NOVO'), 'editor só CUSTOM');
let locked = false;
try {
  assertCustomEditorAllowed('PADRAO');
} catch (e) {
  locked = e instanceof Error && e.message === CUSTOM_EDITOR_ONLY;
}
assert(locked, 'motores TypeScript não abrem o editor A4');
assert(
  !canOpenCustomA4Editor('SV_LOTES_2') &&
    !canOpenCustomA4Editor('MENESES') &&
    !canOpenCustomA4Editor('RECANTO_PRIMAVERA') &&
    !canOpenCustomA4Editor('ARAGUAIA') &&
    !canOpenCustomA4Editor('ESTRELA_DO_SUL'),
  'todos os motores TS permanecem fora do editor',
);

assert(shouldAutosavePublish() === false, 'autosave nunca publica');
assert(editorUi.includes("eq('status', 'draft')") && editorUi.includes("eq('version', 0)"), 'autosave só no draft 0');
assert(editorUi.includes('publish_company_contract_model_version'), 'publicar chama RPC atômica');
assert(editorUi.includes('ensure_company_contract_model_draft'), 'abrir editor garante draft via RPC');
assert(editorUi.includes('Salvando') && editorUi.includes('Rascunho salvo'), 'indicação visual de autosave');
assert(editorUi.includes(NO_CHANGE_SINCE_PUBLISHED) || editorUi.includes('canPublishCustomDraft'), 'gate contra republicar igual');

{
  const emptyVsNull = canPublishCustomDraft('<p>{{CLIENT_NAME}}</p>', null);
  assert(emptyVsNull.ok, 'primeira publicação permitida');
  const same = canPublishCustomDraft(
    hydrateCustomPlaceholderHtml('<p>{{CLIENT_NAME}}</p>'),
    '<p>{{CLIENT_NAME}}</p>',
  );
  assert(!same.ok && same.reason === NO_CHANGE_SINCE_PUBLISHED, 'sem alteração não publica v2/v3');
  const changed = canPublishCustomDraft('<p>Novo {{CLIENT_NAME}}</p>', '<p>{{CLIENT_NAME}}</p>');
  assert(changed.ok, 'com alteração pode publicar');
}

function sample(): OperationalStore {
  return {
    models: [
      {
        id: 'm-custom',
        companyId: 'co-a',
        catalogCode: 'CUSTOM',
        engineKey: 'custom',
        name: 'Minuta',
        status: 'active',
        source: 'user',
        isCompanyDefault: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'm-mundo',
        companyId: 'co-a',
        catalogCode: 'MUNDO_NOVO',
        engineKey: 'mundo_novo',
        name: 'Mundo Novo',
        status: 'active',
        source: 'system_seed',
        isCompanyDefault: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    versions: [],
    links: [],
    companiesContractModel: { 'co-a': 'MUNDO_NOVO' },
    projectsContractModel: { 'proj-1': 'MUNDO_NOVO' },
    generatedHtmlByContractId: { 'ct-1': '<p>contrato</p>' },
  };
}

{
  const store = sample();
  const before = snapshotGisFields(store);
  const draft = simulateEnsureCustomDraft(store, 'm-custom', 'co-a');
  assert(draft.version === CUSTOM_DRAFT_VERSION && draft.status === 'draft', 'ensure cria draft 0');
  draft.contentHtml = DEFAULT_CUSTOM_CONTRACT_HTML;
  const v1 = simulatePublishCustomDraft(store, 'm-custom', 'co-a');
  assert(v1.status === 'published' && v1.version === 1, 'publicar cria v1 por INSERT');
  const stillDraft = store.versions.find((v) => v.status === 'draft');
  assert(
    stillDraft?.version === 0 && stillDraft.status === 'draft',
    'draft permanece draft após publicar',
  );
  let blocked = false;
  try {
    simulatePublishCustomDraft(store, 'm-custom', 'co-a');
  } catch (e) {
    blocked = e instanceof Error && e.message === NO_CHANGE_SINCE_PUBLISHED;
  }
  assert(blocked, 'segunda publicação idêntica é bloqueada');
  stillDraft!.contentHtml = `${DEFAULT_CUSTOM_CONTRACT_HTML}<p>Cláusula extra</p>`;
  const v2 = simulatePublishCustomDraft(store, 'm-custom', 'co-a');
  assert(v2.version === 2 && v1.contentHtml !== v2.contentHtml, 'v2 nasce de INSERT novo');
  assert(
    store.versions.filter((v) => v.status === 'published').length === 2,
    'v1 e v2 publicadas convivem',
  );
  assert(
    JSON.stringify(snapshotGisFields(store)) === JSON.stringify(before),
    'editor simulado não toca GIS/generated_html',
  );

  let tsBlocked = false;
  try {
    simulateEnsureCustomDraft(store, 'm-mundo', 'co-a');
  } catch (e) {
    tsBlocked = e instanceof Error && e.message === CUSTOM_EDITOR_ONLY;
  }
  assert(tsBlocked, 'ensure recusa motor TypeScript');
}

{
  const store = sample();
  const created = createNewModel(store, {
    callerCompanyId: 'co-a',
    name: 'Contrato da imobiliária',
    personalized: true,
  });
  const versions = historyForModel(store, created.model.id, 'co-a');
  assert(
    versions.some((v) => v.version === 0 && v.status === 'draft') &&
      !versions.some((v) => v.status === 'published'),
    'Novo Modelo Personalizado começa em rascunho',
  );
  const imported = importCustomModel(store, {
    callerCompanyId: 'co-a',
    name: 'Contrato colado',
    pastedHtml: '<p>Minuta {{CLIENT_NAME}}<script>alert(1)</script></p>',
  });
  const importedHtml = historyForModel(store, imported.model.id, 'co-a').find((v) => v.status === 'draft')
    ?.contentHtml || '';
  assert(!importedHtml.includes('<script'), 'importação remove script');
}

assert(isRejectedImportMime('application/pdf', 'minuta.pdf'), 'PDF rejeitado nesta etapa');
assert(!isRejectedImportMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx'), 'DOCX aceito');
assert(!isRejectedImportMime('text/html', 'minuta.html'), 'HTML aceito');
assert(!sanitizeImportedContractHtml('<p onclick="x()">ok</p>').includes('onclick'), 'HTML importado sem handlers');

assert(migration.includes('publish_company_contract_model_version'), 'SQL de publish no repositório');
assert(
  migration.includes('INSERT INTO public.company_contract_model_versions') &&
    migration.includes('v_draft.content_html'),
  'publicar copia o draft em INSERT',
);
assert(
  !migration.includes("SET status = 'published'"),
  'publish não faz UPDATE draft→published',
);
assert(migration.includes('uq_company_contract_model_versions_one_draft'), 'índice de um draft');
assert(migration.includes('protect_published_contract_model_version'), 'trigger de imutabilidade');

{
  const withAraguaiaSelected = resolveUserCreatedModelIdentity({
    mode: 'custom',
    baseCatalogCode: 'ARAGUAIA',
    baseEngineKey: 'araguaia',
  });
  assert(
    withAraguaiaSelected.catalogCode === 'CUSTOM' &&
      withAraguaiaSelected.engineKey === 'custom' &&
      withAraguaiaSelected.source === 'user' &&
      withAraguaiaSelected.status === 'active' &&
      withAraguaiaSelected.openA4Editor === true,
    '1. Novo Modelo → Personalizado sempre cria CUSTOM mesmo com Araguaia pré-selecionado',
  );

  const fromExisting = resolveUserCreatedModelIdentity({
    mode: 'existing',
    baseCatalogCode: 'ARAGUAIA',
    baseEngineKey: 'araguaia',
  });
  assert(
    fromExisting.catalogCode === 'ARAGUAIA' && fromExisting.openA4Editor === false,
    'Modelo existente ainda herda o motor TypeScript',
  );

  const store = sample();
  store.models.push({
    id: 'm-araguaia',
    companyId: 'co-a',
    catalogCode: 'ARAGUAIA',
    engineKey: 'araguaia',
    name: 'Chacreamento Araguaia',
    status: 'active',
    source: 'system_seed',
    isCompanyDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const personalizedDespiteBase = createNewModel(store, {
    callerCompanyId: 'co-a',
    name: 'TESTE EDITOR CUSTOM',
    personalized: true,
    basedOnModelId: 'm-araguaia',
  });
  assert(
    personalizedDespiteBase.model.catalogCode === 'CUSTOM' &&
      personalizedDespiteBase.model.engineKey === 'custom' &&
      personalizedDespiteBase.model.source === 'user' &&
      personalizedDespiteBase.model.status === 'active',
    '1. createNewModel Personalizado não herda ARAGUAIA',
  );
  const draftVersions = historyForModel(store, personalizedDespiteBase.model.id, 'co-a');
  assert(
    draftVersions.some((v) => v.version === 0 && v.status === 'draft') &&
      !draftVersions.some((v) => v.status === 'published'),
    '2. CUSTOM sempre cria/garante draft v0',
  );

  assert(configureOrEditTarget('CUSTOM') === 'a4-editor', '3. CUSTOM → Configurar/Editar abre /editor');
  assert(
    CUSTOM_CONTRACT_EDITOR_PATH('abc').endsWith('/contracts/models/abc/editor'),
    '3. rota do editor CUSTOM',
  );
  assert(central.includes('configureOrEditTarget') && central.includes('openEditor(model)'), '3. UI roteia CUSTOM para o editor');
  assert(visualizeTarget('CUSTOM') === 'custom-preview', '4. CUSTOM → Visualizar usa preview CUSTOM');
  assert(central.includes('visualizeTarget') && central.includes("openEditor(model, true)"), '4. UI não usa o visualizador legado para CUSTOM');
  assert(central.includes("setNewMode('custom')"), 'modal Novo Modelo inicia em Personalizado');
  assert(central.includes('name="sv-new-model-mode"'), 'radios de tipo formam um grupo');

  for (const code of [
    'PADRAO',
    'SV_LOTES_2',
    'MENESES',
    'RECANTO_PRIMAVERA',
    'ARAGUAIA',
    'MUNDO_NOVO',
    'ESTRELA_DO_SUL',
  ]) {
    assert(
      configureOrEditTarget(code) === 'locked-sheet' &&
        visualizeTarget(code) === 'typescript-preview' &&
        !canOpenCustomA4Editor(code),
      `5. ${code} nunca entra no editor CUSTOM`,
    );
  }
}
assert(central.includes('insertCustomDraftModel'), 'Novo Personalizado cria draft CUSTOM');
assert(central.includes("catalog_code: 'CUSTOM'"), 'Personalizado grava catalog_code CUSTOM');
assert(central.includes("engine_key: 'custom'"), 'Personalizado grava engine_key custom');
assert(central.includes('DELETE_COMPANY_CONTRACT_MODEL_RPC'), 'exclusão segura chama RPC');
assert(central.includes('CUSTOM_CONTRACT_EDITOR_PATH'), 'Central abre o editor A4');
assert(central.includes('IMPORT_TEXT_HTML_ONLY'), 'import recusa PDF');
assert(central.includes('convertDocxToCustomHtml') && central.includes('isDocxFile'), 'Central converte DOCX');
assert(tiptap.includes('extension-table') && tiptap.includes('extension-image'), 'editor aceita tabelas e imagens');
assert(editorUi.includes('Substituir seleção por campo'), 'substituir trecho por campo');
assert(editorUi.includes('listSalesForCustomPreview') && editorUi.includes('applyPreviewSale'), 'prévia escolhe venda real');
assert(editorUi.includes('fillCustomPlaceholdersForPreview'), 'prévia usa resolver separado');

const editorBundle = editorPage + editorUi + tiptap + read('lib/customContractModelEditor.ts');
assert(
  !editorBundle.includes("from '@/lib/contractTemplate'") &&
    !editorBundle.includes('from "@/lib/contractTemplate"'),
  'editor não importa generateContractHTML',
);
assert(
  !editorBundle.includes("from '@/lib/gisSaleCreateService'"),
  'editor não chama GIS',
);
assert(!editorBundle.includes("from('contracts')"), 'editor não grava generated_html');
assert(!editorBundle.includes('seller_parties_json'), 'editor não toca Mundo Novo sellers');
assert(!editorBundle.includes('lf_contract_snapshot_json'), 'editor não toca snapshot LF');
assert(
  generateHtml.includes('export function generateContractHTML') &&
    gisSale.includes('executeGisSaleCreate') &&
    mundoSellers.includes('resolveMundoNovoPromitenteVendors'),
  'motores e Mundo Novo permanecem nos arquivos originais',
);

assert(
  editorUi.includes('Não cria venda') && editorUi.includes('generated_html'),
  'prévia declara que não persiste venda/contrato',
);

void cloneStore;

{
  const saved = sample();
  const first = simulateEnsureCustomDraft(saved, 'm-custom', 'co-a');
  first.contentHtml = '<p>CONTEUDO SALVO DO DRAFT</p><table><tr><td>Q1</td></tr></table>';
  const reopened = simulateEnsureCustomDraft(saved, 'm-custom', 'co-a');
  assert(
    reopened.id === first.id &&
      String(reopened.contentHtml).includes('CONTEUDO SALVO DO DRAFT') &&
      String(reopened.contentHtml).includes('<table'),
    'fechar/reabrir recupera o draft salvo com tabela',
  );
}

void (async () => {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: 'MODELO CHACREAMENTO ESTRELA DO SUL', bold: true })] }),
          new Paragraph('Qualificação do comprador'),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Quadra')] }),
                  new TableCell({ children: [new Paragraph('01')] }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  const converted = await convertDocxToCustomHtml(buf);
  assert(DOCX_IMPORT_LIBRARY === 'mammoth', 'biblioteca DOCX = mammoth');
  assert(converted.html.toLowerCase().includes('estrela'), 'DOCX vira HTML com o texto');
  assert(converted.tableCount >= 1 || /<table/i.test(converted.html), 'tabelas do DOCX preservadas');
  assert(!converted.html.includes('<script'), 'HTML importado sem script');

  assert(isRejectedImportMime('application/pdf', 'x.pdf') === true, 'PDF continua recusado');
  assert(isRejectedImportMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'modelo.docx') === false, 'DOCX passa na importação');
  const filled = fillCustomPlaceholdersForPreview('<p>{{CLIENT_NAME}} {{SPOUSE_CPF}}</p>', {
    CLIENT_NAME: 'Maria Silva',
    SPOUSE_CPF: null,
  });
  assert(filled.includes('Maria Silva'), 'prévia preenche dado real');
  assert(filled.includes('[SEM DADO: CPF DO CÔNJUGE]'), 'prévia não esconde campo vazio');

  const values = resolveCustomPreviewValues({
    tenantId: 'co-a',
    company: { name: 'SV Topografia', cnpj: '00.000.000/0001-00', city: 'Marabá' },
    customer: {
      name: 'João',
      cpf_cnpj: '12345678901',
      rg: '3658956',
      rg_issuer: 'PC',
      rg_issuer_state: 'PA',
      nationality: 'Brasileira',
    },
    sale: {
      company_id: 'co-a',
      lot_price: 40000,
      discount: 1500,
      total_value: 38500,
      agreed_price: 38500,
      payment_type: 'parcelado',
      installments_count: 10,
      sale_date: '2026-03-01',
      has_spouse: true,
      sale_spouse_name: 'Ana',
      sale_spouse_cpf: '52998224725',
      sale_spouse_nationality: 'Brasileira',
      notes: 'não persistir no contrato',
    },
    project: { name: 'Estrela do Sul', city: 'Marabá', seller_parties_json: [{ name: 'Vendedor Um', cpf: '111' }] },
    lot: { quadra: 'QD 01', lote: '12', frente: 20, fundo: 20, 'Lado Dir.': 40, 'Lado Esq.': 40 },
    receipts: [
      { installment_number: 0, amount: 5000, due_date: '2026-03-10', status: 'pendente' },
      { installment_number: 1, amount: 3350, due_date: '2026-04-10', status: 'pendente' },
    ],
    broker: { name: 'Carlos Corretor', cpf: '11144477735', creci: '12345-F', phone: '94999990000', email: 'c@ex.com' },
    financialAccount: {
      name: 'Conta Imobiliária',
      account_type: 'IMOBILIARIA',
      beneficiary_name: 'SV Lotes',
      document: '00.000.000/0001-00',
    },
  });
  assert(values.CLIENT_NAME === 'João', 'fonte real do comprador');
  assert(values.CLIENT_RG_ISSUER === 'PC', 'órgão emissor sem concatenar UF');
  assert(values.CLIENT_RG_STATE === 'PA', 'UF emissor do RG da Nova Venda');
  assert(values.CLIENT_NATIONALITY == null, 'nacionalidade do comprador sem fonte automática');
  assert(values.SPOUSE_NATIONALITY === 'Brasileira', 'nacionalidade do cônjuge da venda');
  assert(values.PROJECT_NAME === 'Estrela do Sul', 'fonte real do empreendimento');
  assert(String(values.LOT_PRICE || '').includes('40.000'), 'LOT_PRICE = valor original do lote');
  assert(String(values.SALE_DISCOUNT || '').includes('1.500'), 'SALE_DISCOUNT = desconto persistido');
  assert(String(values.SALE_VALUE || '').includes('38.500'), 'SALE_VALUE = valor final contratado sem recálculo');
  assert(values.PAYMENT_TYPE === 'Parcelado', 'forma de pagamento da Nova Venda');
  assert(values.SALE_DUE_DATE === '10/04/2026', 'vencimento parcelado = 1ª parcela dos receipts');
  assert(values.FIRST_DUE_DATE === '10/04/2026', 'primeiro vencimento das parcelas');
  assert(values.BROKER_NAME === 'Carlos Corretor', 'nome do corretor');
  assert(values.BROKER_CRECI === '12345-F', 'CRECI do corretor');
  assert(String(values.FINANCIAL_ACCOUNT_LABEL || '').includes('Conta Imobiliária'), 'conta recebedora pública');
  assert(values.FINANCIAL_ACCOUNT_BENEFICIARY === 'SV Lotes', 'beneficiário da conta recebedora');
  assert(values.SELLER_1_NAME === 'Vendedor Um', 'vendedor 1 a partir de seller_parties_json (leitura)');
  assert(values.WITNESS_1_NAME == null, 'testemunha sem fonte automática');
  let cross = false;
  try {
    resolveCustomPreviewValues({
      tenantId: 'co-a',
      sale: { company_id: 'co-b', total_value: 1 },
    });
  } catch {
    cross = true;
  }
  assert(cross, 'prévia isola tenant');

  const previewLoad = read('lib/customContractPreviewLoad.ts');
  const previewResolver = read('lib/customContractPreviewResolver.ts');
  const docxLib = read('lib/customContractDocxImport.ts');
  assert(!previewLoad.includes('.insert(') && !previewLoad.includes('.update(') && !previewLoad.includes('.delete('), 'loader de prévia é somente leitura');
  assert(!previewLoad.includes('generated_html'), 'prévia não lê generated_html');
  assert(previewLoad.includes("from('brokers')"), 'prévia carrega corretor da venda');
  assert(previewLoad.includes('company_financial_accounts'), 'prévia carrega conta recebedora');
  assert(
    previewLoad.includes('name, account_type, beneficiary_name, document') &&
      !previewLoad.includes('encrypted_payload') &&
      !previewLoad.includes('account_number') &&
      !previewLoad.includes('sandboxApiKey'),
    'conta recebedora só com campos públicos',
  );
  assert(!previewResolver.includes('generateContractHTML'), 'resolver não usa o motor oficial');
  assert(!previewResolver.includes('gisSaleCreateService'), 'resolver não cria venda GIS');
  assert(docxLib.includes("from 'mammoth'") || docxLib.includes('from "mammoth"'), 'importação usa mammoth');
  assert(PLACEHOLDERS_WITHOUT_AUTOMATIC_SOURCE.includes('WITNESS_1_NAME'), 'testemunhas marcadas sem fonte');
  assert(PLACEHOLDERS_WITHOUT_AUTOMATIC_SOURCE.includes('CLIENT_NATIONALITY'), 'nacionalidade comprador sem fonte');

  const css = read('components/contracts/editor/customContractEditor.css');
  const logoNode = read('components/contracts/editor/CompanyLogoNode.ts');
  const layoutLib = read('lib/customContractA4Layout.ts');
  const htmlLib = read('lib/customContractHtml.ts');
  assert(!css.includes('repeating-linear-gradient'), 'paginação não usa faixa sobreposta no conteúdo');
  assert(css.includes('page-break-inside: avoid') && css.includes('break-inside: avoid'), 'CSS evita cortar tr/título');
  assert(layoutLib.includes('planA4BlockSpacers') && layoutLib.includes('keepWithNext'), 'paginação orientada a blocos');
  assert(tiptap.includes('A4Pagination') && tiptap.includes('CompanyLogo'), 'TipTap usa paginação e node de logo');
  assert(editorUi.includes("select('logo_url')"), 'editor lê companies.logo_url da Aparência');
  assert(
    !editorUi.includes('getReportHeaderLogoUrl') &&
      !tiptap.includes('getReportHeaderLogoUrl') &&
      !htmlLib.includes('getReportHeaderLogoUrl'),
    'CUSTOM não usa fallback do logo da plataforma',
  );
  assert(logoNode.includes('COMPANY_LOGO_TOKEN') && !/src:\s*`/.test(logoNode), 'modelo persiste token, não src da imagem');
  assert(editorUi.includes('insertPageBreak') && editorUi.includes("'Página'"), 'botão Página permanece');
  assert(docxLib.includes('Notas de rodapé do Word são preservadas no final'), 'notas do Word documentadas no final');
  assert(docxLib.includes('logotipo do cabeçalho do Word não é importado'), 'logo do cabeçalho DOCX não bloqueia importação');

  {
    const headingThenPara: A4LayoutUnit[] = [
      { id: 'h', kind: 'heading', height: 40, keepTogether: true, keepWithNext: true },
      { id: 'p', kind: 'paragraph', height: 80, keepTogether: false, keepWithNext: false },
    ];
    const together = planA4BlockSpacers(headingThenPara, 200, 18);
    assert(together.length === 0, 'título + primeiro parágrafo cabem na mesma folha');
    const split = planA4BlockSpacers(headingThenPara, 100, 18);
    assert(
      split.some((row) => row.beforeUnitId === 'p') &&
        !split.some((row) => row.beforeUnitId === 'h'),
      'título não fica isolado no rodapé quando o parágrafo não cabe',
    );

    const orphan: A4LayoutUnit[] = [
      { id: 'a', kind: 'paragraph', height: 460, keepTogether: false, keepWithNext: false },
      { id: 'h2', kind: 'heading', height: 40, keepTogether: true, keepWithNext: true },
      { id: 'p2', kind: 'paragraph', height: 80, keepTogether: false, keepWithNext: false },
    ];
    const orphanPlan = planA4BlockSpacers(orphan, 500, 18);
    assert(
      orphanPlan.some((row) => row.beforeUnitId === 'h2'),
      'título + primeiro parágrafo sobem juntos em vez de deixar o título no rodapé',
    );

    const rows: A4LayoutUnit[] = [
      { id: 'r1', kind: 'tableRow', height: 70, keepTogether: true, keepWithNext: false },
      { id: 'r2', kind: 'tableRow', height: 70, keepTogether: true, keepWithNext: false },
      { id: 'r3', kind: 'tableRow', height: 70, keepTogether: true, keepWithNext: false },
    ];
    const tablePlan = planA4BlockSpacers(rows, 130, 18);
    assert(
      tablePlan.some((row) => row.beforeUnitId === 'r3' || row.beforeUnitId === 'r2'),
      'tabela grande quebra ENTRE linhas, nunca no meio da tr',
    );

    const signatures: A4LayoutUnit[] = [
      { id: 's1', kind: 'signature', height: 50, keepTogether: true, keepWithNext: true },
      { id: 's2', kind: 'signature', height: 50, keepTogether: true, keepWithNext: true },
    ];
    const signPlan = planA4BlockSpacers(signatures, 80, 18);
    assert(
      signPlan.some((row) => row.beforeUnitId === 's1' || row.beforeUnitId === 's2'),
      'bloco de assinatura evita quebra interna quando não cabe no restante',
    );
  }

  const logoHtml = renderCompanyLogoBlock({ align: 'center', width: 220, marginBefore: 8, marginAfter: 16 });
  assert(logoHtml.includes(COMPANY_LOGO_TOKEN), 'bloco de logo persiste {{COMPANY_LOGO_URL}}');
  assert(!logoHtml.includes('<img'), 'bloco persistido não grava cópia da imagem');
  assert(
    canonicalizeCustomContractHtml(logoHtml) === canonicalizeCustomContractHtml('<p>{{COMPANY_LOGO_URL}}</p>'),
    'canônico trata bloco de logo como token',
  );
  const filledLogo = fillCustomPlaceholdersForPreview(logoHtml, {
    COMPANY_LOGO_URL: 'https://cdn.example/empresa.png',
  });
  assert(filledLogo.includes('https://cdn.example/empresa.png'), 'prévia resolve logo dinâmico');
  assert(filledLogo.includes('object-fit:contain'), 'prévia do logo não distorce');
  const emptyLogo = fillCustomPlaceholdersForPreview('{{COMPANY_LOGO_URL}}', { COMPANY_LOGO_URL: null });
  assert(emptyLogo.includes(COMPANY_LOGO_PREVIEW_EMPTY), 'empresa sem logo mostra [SEM LOGO CADASTRADO]');
  assert(!emptyLogo.includes('<img'), 'empresa sem logo nunca mostra imagem quebrada');

  console.log('\nOK — Editor CUSTOM A4');
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

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
} from '../lib/customContractPlaceholders';

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
assert(editorUi.includes('Associar empreendimento'), 'associar empreendimento na barra');
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
assert(CUSTOM_PLACEHOLDER_GROUPS.length === 8, 'oito grupos de campos automáticos');
assert(
  CUSTOM_PLACEHOLDERS.some((p) => p.key === 'CLIENT_NAME') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'CLIENT_CPF') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'PROJECT_NAME') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'BLOCK_NAME') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'LOT_NUMBER') &&
    CUSTOM_PLACEHOLDERS.some((p) => p.key === 'SALE_VALUE'),
  'placeholders compatíveis com o sistema atual',
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
assert(isRejectedImportMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx'), 'DOCX rejeitado');
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
assert(central.includes('IMPORT_TEXT_HTML_ONLY'), 'import recusa PDF/DOCX');

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
  editorUi.includes('Sem venda, lote, contrato, financeiro') ||
    editorUi.includes('sem venda'),
  'prévia declara que não preenche venda real',
);

void cloneStore;

console.log('\nOK — Editor CUSTOM A4');

/**
 * Testes obrigatórios — Central de Modelos de Contrato (Etapas 0 + 1).
 * npx tsx scripts/mandatory-contract-models-central-etapa1-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  SALE_CONTRACT_MODELS,
  resolveSaleContractModelFromContext,
} from '../lib/contractModel';
import {
  CONTRACT_MODEL_CATALOG_SEED,
  CONTRACT_MODELS_CENTRAL_PATH,
  SYSTEM_CONTRACT_MODEL_CODES,
  assertTenantOwnsContractModel,
  canUseContractModelInTenant,
  catalogEngineKey,
  resolveCompatibleSaleContractModel,
  simulateContractModelCentralSeed,
} from '../lib/contractModelCentral';
import {
  ARCHIVE_DEFAULT_BLOCKED,
  CUSTOM_NOT_IN_AUTO_EMISSION,
  LEGAL_TEXT_LOCKED,
  archiveModel,
  associateProject,
  companyDefaultUpdatePayload,
  countActiveCompanyDefaults,
  countProjectDefaults,
  createNewModel,
  duplicateModel,
  historyForModel,
  importCustomModel,
  legalContentIsLocked,
  payloadForCentralTable,
  physicalDeleteAllowed,
  renameModel,
  saveAsNewModel,
  setCompanyDefaultAtomic,
  setProjectDefaultAtomic,
  snapshotGisFields,
  unarchiveModel,
  type OperationalStore,
} from '../lib/contractModelCentralOps';
import { resolveMundoNovoPromitenteVendors } from '../lib/mundoNovoContractSellers';
import { LF_CONTRACT_SNAPSHOT_COLUMN } from '../lib/lfImoveisContractSnapshot';
import { buildAraguaiaEsignVendorPartyInputs } from '../lib/araguaiaContractEsign';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const MIGRATION =
  'supabase/migrations/20261028120000_contract_model_central_foundation.sql';
const sql = read(MIGRATION);
const contractsPage = read('app/contracts/page.tsx');
const layout = read('components/Layout.tsx');
const gisSale = read('lib/gisSaleCreateService.ts');
const generateHtml = read('lib/contractTemplate.ts');
const mundoSellers = read('lib/mundoNovoContractSellers.ts');
const centralPage = read('app/contracts/models/page.tsx');
const centralUi =
  centralPage +
  read('components/contracts/central/ContractModelsOperationalCentral.tsx') +
  read('lib/contractModelCentralOps.ts');

assert(
  layout.includes('CONTRACT_MODELS_CENTRAL_PATH') &&
    layout.includes("startsWith('/contracts')") &&
    layout.includes('isPartnerPanelAdmin'),
  'botão permanente no cabeçalho global do Layout',
);
assert(
  layout.includes('{contractModelsHeaderLink(false)}') &&
    layout.includes('{contractModelsHeaderLink(true)}'),
  'botão no cabeçalho global desktop e mobile',
);
{
  const desktopLink = layout.indexOf('{contractModelsHeaderLink(false)}');
  const afterDesktop = layout.slice(desktopLink, desktopLink + 180);
  assert(
    afterDesktop.includes('<OfflineStatusBar />'),
    'botão no cabeçalho desktop imediatamente antes de Online',
  );
}
assert(
  !layout.includes('selectedContract'),
  'cabeçalho global não depende de selectedContract',
);
assert(
  !contractsPage.includes('canAccessContractModelsCentral') &&
    !contractsPage.includes('hidden xl:inline">Modelos de Contrato'),
  'botão antigo da faixa dos indicadores foi removido',
);

assert(
  CONTRACT_MODELS_CENTRAL_PATH === '/contracts/models',
  'rota da Central é /contracts/models',
);

assert(
  contractsPage.includes('CONTRACT_MODELS_CENTRAL_PATH'),
  'página de contratos importa a rota da Central',
);
assert(
  !contractsPage.includes('setActiveTab("Templates")'),
  'botão não chama mais a aba Templates inexistente',
);
assert(
  contractsPage.includes('Modelos de Contrato'),
  'rótulo Modelos de Contrato na barra de ações',
);
assert(
  (contractsPage.match(/href=\{CONTRACT_MODELS_CENTRAL_PATH\}/g) || []).length >= 2,
  'atalhos Modelos apontam para a Central',
);

assert(
  centralUi.includes('Central de Modelos de Contrato'),
  'página da Central existe',
);
assert(
  /Nome do modelo/.test(centralUi) &&
    /Empreendimento/.test(centralUi) &&
    />Padrão</.test(centralUi) &&
    /Status/.test(centralUi) &&
    /Versão/.test(centralUi) &&
    /Ações/.test(centralUi),
  'Central lista nome, empreendimento, padrão, status, versão e ações',
);
assert(
  centralUi.includes('Motor / código') &&
    centralUi.includes('Origem') &&
    centralUi.includes('Modelo padrão da empresa') &&
    centralUi.includes('Empreendimentos associados'),
  'ficha do modelo mostra motor, origem, padrão e empreendimentos',
);
assert(
  centralUi.includes('Novo Modelo') && centralUi.includes('Importar Contrato'),
  'topo tem Novo Modelo e Importar Contrato',
);
assert(
  centralUi.includes('Visualizar') &&
    centralUi.includes('Configurar/Editar') &&
    centralUi.includes('Duplicar') &&
    centralUi.includes('Salvar como novo') &&
    centralUi.includes('Associar a empreendimento') &&
    centralUi.includes('Histórico') &&
    centralUi.includes('Arquivar'),
  'ações operacionais por modelo',
);
{
  const centralComponent = read(
    'components/contracts/central/ContractModelsOperationalCentral.tsx',
  );
  assert(
    !/Excluir modelo/i.test(centralComponent) &&
      !/from\('company_contract_models'\)[\s\S]{0,120}\.delete\(/.test(centralComponent),
    'sem exclusão física de modelo',
  );
}
assert(
  !centralUi.includes('contenteditable') &&
    !centralUi.includes('editor jurídico') &&
    centralUi.includes(LEGAL_TEXT_LOCKED),
  'Central da Etapa 1 não tem editor jurídico livre',
);

const catalogCodes = CONTRACT_MODEL_CATALOG_SEED.map((row) => row.code);
assert(
  JSON.stringify(catalogCodes) ===
    JSON.stringify([
      'PADRAO',
      'MENESES',
      'SV_LOTES_2',
      'RECANTO_PRIMAVERA',
      'ARAGUAIA',
      'MUNDO_NOVO',
      'ESTRELA_DO_SUL',
      'CUSTOM',
    ]),
  'catálogo homologado na ordem esperada',
);
assert(
  CONTRACT_MODEL_CATALOG_SEED.find((row) => row.code === 'PADRAO')?.isSystemDefault ===
    true,
  'PADRAO é o fallback do sistema',
);
assert(
  CONTRACT_MODEL_CATALOG_SEED.filter((row) => row.isSystemDefault).length === 1,
  'apenas um fallback de sistema',
);
assert(
  SYSTEM_CONTRACT_MODEL_CODES.includes('PADRAO') &&
    !SYSTEM_CONTRACT_MODEL_CODES.includes('CUSTOM'),
  'CUSTOM não entra no seed de motores GIS',
);

for (const code of SALE_CONTRACT_MODELS) {
  assert(
    catalogCodes.includes(code),
    `código antigo ${code} permanece no catálogo`,
  );
}

assert(catalogEngineKey('PADRAO') === 'classic', 'motor PADRAO = classic');
assert(catalogEngineKey('MUNDO_NOVO') === 'mundo_novo', 'motor Mundo Novo');
assert(catalogEngineKey('ESTRELA_DO_SUL') === 'estrela_do_sul', 'motor LF');
assert(catalogEngineKey('ARAGUAIA') === 'araguaia', 'motor Araguaia');

{
  let threw = false;
  try {
    assertTenantOwnsContractModel({
      modelCompanyId: 'empresa-a',
      callerCompanyId: 'empresa-b',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'isolamento: modelo de outra empresa é recusado');
  assert(
    canUseContractModelInTenant({
      modelCompanyId: 'empresa-a',
      callerCompanyId: 'empresa-a',
    }),
    'isolamento: mesma empresa pode usar o próprio modelo',
  );
  assert(
    !canUseContractModelInTenant({
      modelCompanyId: 'empresa-a',
      callerCompanyId: 'empresa-b',
    }),
    'isolamento: consulta cruzada recusada no app',
  );
}

{
  const old = resolveSaleContractModelFromContext({
    companyModel: 'SV_LOTES_2',
  });
  const neu = resolveCompatibleSaleContractModel({
    companyModel: 'SV_LOTES_2',
  });
  assert(
    old.model === neu.model && old.source === neu.source,
    'empresa sem configuração nova: resolver idêntico ao atual',
  );
}

{
  const old = resolveSaleContractModelFromContext({
    projectModel: '',
    companyModel: 'MENESES',
  });
  const neu = resolveCompatibleSaleContractModel({
    projectModel: '',
    companyModel: 'MENESES',
  });
  assert(
    old.model === 'MENESES' &&
      neu.model === 'MENESES' &&
      old.source === 'company' &&
      neu.source === 'company',
    'empreendimento sem modelo próprio herda a empresa',
  );
}

{
  const old = resolveSaleContractModelFromContext({});
  const neu = resolveCompatibleSaleContractModel({});
  assert(
    old.model === 'PADRAO' &&
      neu.model === 'PADRAO' &&
      old.source === 'fallback' &&
      neu.source === 'fallback',
    'fallback PADRAO quando não há configuração',
  );
}

{
  const r = resolveCompatibleSaleContractModel({
    projectDefaultCatalogCode: 'ARAGUAIA',
    companyDefaultCatalogCode: 'PADRAO',
    companyModel: 'PADRAO',
  });
  assert(
    r.model === 'ARAGUAIA' && r.source === 'central_project',
    'nova cadeia: padrão do empreendimento (Central) antes da empresa',
  );
}

{
  const r = resolveCompatibleSaleContractModel({
    companyDefaultCatalogCode: 'MENESES',
    companyModel: 'PADRAO',
  });
  assert(
    r.model === 'MENESES' && r.source === 'central_company',
    'nova cadeia: padrão da empresa (Central) quando o empreendimento não tem vínculo',
  );
}

{
  const old = resolveSaleContractModelFromContext({
    saleModel: 'MUNDO_NOVO',
    projectModel: 'MENESES',
    companyModel: 'PADRAO',
  });
  const neu = resolveCompatibleSaleContractModel({
    saleModel: 'MUNDO_NOVO',
    projectModel: 'MENESES',
    companyModel: 'PADRAO',
    projectDefaultCatalogCode: 'ARAGUAIA',
    companyDefaultCatalogCode: 'MENESES',
  });
  assert(
    old.model === 'MUNDO_NOVO' &&
      neu.model === 'MUNDO_NOVO' &&
      neu.source === 'sale',
    'snapshot texto da venda continua vencendo a Central',
  );
}

{
  let threw = false;
  try {
    resolveCompatibleSaleContractModel({
      companyDefaultCatalogCode: 'PADRAO',
      modelCompanyId: 'empresa-a',
      callerCompanyId: 'empresa-b',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'resolver recusa modelo de outro tenant mesmo com código válido');
}

const seed = simulateContractModelCentralSeed({
  companies: [
    { id: 'co-a', contract_model: 'PADRAO' },
    { id: 'co-b', contract_model: 'MUNDO_NOVO' },
    { id: 'co-c', contract_model: 'CUSTOM' },
  ],
  projects: [
    {
      id: 'proj-araguaia',
      company_id: 'co-a',
      contract_model: 'ARAGUAIA',
      name: 'Chacreamento Araguaia',
    },
    {
      id: 'proj-inherit',
      company_id: 'co-a',
      contract_model: null,
      name: 'Sem override',
    },
    {
      id: 'proj-mn',
      company_id: 'co-b',
      contract_model: 'MUNDO_NOVO',
      name: 'Mundo Novo',
    },
  ],
  templates: [
    {
      id: 'tpl-1',
      tenant_id: 'co-c',
      name: 'HTML legado',
      content: '<p>CUSTOM legado</p>',
    },
  ],
});

assert(seed.historicalContractHtmlTouched === false, 'seed não toca HTML histórico');

{
  const defaultsA = seed.models.filter(
    (m) => m.companyId === 'co-a' && m.isCompanyDefault,
  );
  const defaultsB = seed.models.filter(
    (m) => m.companyId === 'co-b' && m.isCompanyDefault,
  );
  assert(defaultsA.length === 1 && defaultsA[0].catalogCode === 'PADRAO', 'um padrão por empresa A');
  assert(
    defaultsB.length === 1 && defaultsB[0].catalogCode === 'MUNDO_NOVO',
    'um padrão por empresa B (preserva companies.contract_model)',
  );
}

assert(
  seed.models.filter((m) => m.companyId === 'co-a').length > 0 &&
    seed.models.filter((m) => m.companyId === 'co-b').length > 0 &&
    !seed.models.some((m) => m.companyId !== 'co-a' && m.companyId !== 'co-b' && m.companyId !== 'co-c'),
  'modelos ficam isolados por empresa',
);
assert(
  !seed.models.some((m) => m.companyId === 'co-a' && m.catalogCode === 'MUNDO_NOVO' && m.isCompanyDefault),
  'empresa A não herda padrão Mundo Novo de B',
);

{
  const custom = seed.models.filter((m) => m.companyId === 'co-c');
  const customDefault = custom.filter((m) => m.isCompanyDefault);
  assert(
    custom.some((m) => m.catalogCode === 'CUSTOM' && m.source === 'legacy_template'),
    'contract_templates legado vira CUSTOM',
  );
  assert(customDefault.length === 1, 'CUSTOM legado: um padrão na empresa CUSTOM');
}

{
  const linksA = seed.links.filter((l) => l.projectId === 'proj-araguaia');
  assert(
    linksA.length === 1 &&
      linksA[0].isProjectDefault &&
      linksA[0].catalogCode === 'ARAGUAIA' &&
      linksA[0].companyId === 'co-a',
    'projeto com contract_model vira vínculo padrão do empreendimento',
  );
  assert(
    seed.links.every((l) => l.projectId !== 'proj-inherit'),
    'projeto sem contract_model não cria vínculo — herda empresa',
  );
  const defaultsByProject = new Map<string, number>();
  for (const link of seed.links) {
    if (!link.isProjectDefault) continue;
    defaultsByProject.set(
      link.projectId,
      (defaultsByProject.get(link.projectId) || 0) + 1,
    );
  }
  assert(
    [...defaultsByProject.values()].every((n) => n === 1),
    'apenas um modelo padrão por empreendimento',
  );
}

assert(
  /CREATE TABLE IF NOT EXISTS public\.contract_model_catalog/.test(sql),
  'migration cria contract_model_catalog',
);
assert(
  /CREATE TABLE IF NOT EXISTS public\.company_contract_models/.test(sql),
  'migration cria company_contract_models',
);
assert(
  /CREATE TABLE IF NOT EXISTS public\.company_contract_model_versions/.test(sql),
  'migration cria company_contract_model_versions',
);
assert(
  /CREATE TABLE IF NOT EXISTS public\.project_contract_model_links/.test(sql),
  'migration cria project_contract_model_links',
);
assert(
  sql.includes('ADD COLUMN IF NOT EXISTS company_contract_model_id') &&
    sql.includes('ADD COLUMN IF NOT EXISTS company_contract_model_version_id'),
  'FKs nullable em sales/contracts',
);
assert(
  /uq_company_contract_models_one_company_default/.test(sql),
  'índice: um padrão por empresa',
);
assert(
  /uq_project_contract_model_links_one_default/.test(sql),
  'índice: um padrão por empreendimento',
);
assert(
  sql.includes('company_id = public.current_tenant_id()'),
  'RLS por tenant nas tabelas da Central',
);
assert(
  sql.includes('cannot cross tenant'),
  'triggers recusam associação cruzada de tenant',
);
assert(
  !/UPDATE\s+public\.contracts/i.test(sql) &&
    !/UPDATE\s+public\.sales/i.test(sql) &&
    !/UPDATE\s+public\.companies/i.test(sql) &&
    !/UPDATE\s+public\.projects/i.test(sql),
  'migration não atualiza companies/projects/sales/contracts existentes',
);
assert(
  !/\bSET\s+generated_html\b/i.test(sql) &&
    !/UPDATE\s+public\.contracts/i.test(sql) &&
    !/UPDATE\s+public\.sales/i.test(sql),
  'nenhum UPDATE em generated_html nem em contratos/vendas históricas',
);
assert(
  sql.includes('NÃO altera contracts.generated_html'),
  'migration declara preservação de generated_html',
);
assert(
  sql.includes('seller_parties_json') &&
    sql.includes('lf_contract_snapshot_json') &&
    sql.includes('contract_second_vendor_json'),
  'migration declara não alterar snapshots jurídicos',
);
assert(
  sql.includes("WHERE cat.code <> 'CUSTOM'"),
  'seed de motores não instancia CUSTOM como system_seed',
);
assert(
  sql.includes('legacy_template') && sql.includes("NÃO liga à geração GIS"),
  'legado CUSTOM importado sem ligar GIS',
);
assert(
  sql.includes("to_regclass('public.contract_templates')") &&
    sql.includes('$import_legacy_templates$') &&
    sql.includes('$legacy_models$') &&
    sql.includes('$legacy_versions$'),
  'importação legado só roda se contract_templates existir (bloco dinâmico)',
);
assert(
  !/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+public\.contract_templates/i.test(sql),
  'migration não cria public.contract_templates',
);
{
  const staticFrom = sql.replace(
    /EXECUTE \$legacy_(?:models|versions)\$[\s\S]*?\$legacy_(?:models|versions)\$;/g,
    '',
  );
  assert(
    !/FROM public\.contract_templates/i.test(staticFrom) &&
      !/JOIN public\.contract_templates/i.test(staticFrom),
    'sem referência estática a contract_templates fora do EXECUTE',
  );
}

assert(
  !gisSale.includes('resolveCompatibleSaleContractModel') &&
    !gisSale.includes('company_contract_model_id') &&
    gisSale.includes('assertSaleContractModelConfigured'),
  'geração GIS continua no resolver texto atual',
);
assert(
  !generateHtml.includes('company_contract_models') &&
    !generateHtml.includes('contract_model_catalog'),
  'generateContractHTML não lê as tabelas novas',
);

{
  const sellers = resolveMundoNovoPromitenteVendors({
    project: {
      seller_parties_json: [
        {
          name: 'Maria Elvira de Sousa',
          cpf: '24803197253',
          order: 1,
        },
        {
          name: 'José da Silva',
          cpf: '11144477735',
          order: 2,
        },
      ],
    },
  });
  assert(
    sellers.length === 2 && sellers[0].name.includes('Maria'),
    'Mundo Novo continua resolvendo seller_parties_json',
  );
}
assert(
  mundoSellers.includes('seller_parties_json') &&
    mundoSellers.includes('somente projects.seller_parties_json'),
  'fonte jurídica Mundo Novo permanece seller_parties_json',
);
assert(
  !mundoSellers.includes('contract_second_vendor_json'),
  'Mundo Novo não cai em contract_second_vendor_json',
);

assert(
  LF_CONTRACT_SNAPSHOT_COLUMN === 'lf_contract_snapshot_json',
  'LF preserva coluna lf_contract_snapshot_json',
);
assert(
  read('lib/lfImoveisContractSnapshot.ts').includes('Não sobrescrever após gravado'),
  'snapshot LF permanece imutável após gravado',
);

{
  const vendors = buildAraguaiaEsignVendorPartyInputs();
  assert(vendors.length === 2, 'Araguaia permanece com 2 vendedores e-sign');
}
assert(
  read('lib/araguaiaContractEsign.ts').includes('ARAGUAIA_ESIGN_VENDORS'),
  'Araguaia e-sign não foi redirecionado para a Central',
);

assert(
  sql.includes('ALTER TABLE public.sales') &&
    sql.includes('contract_model') === false
    ? true
    : !sql.includes('DROP COLUMN') &&
        !sql.includes('RENAME COLUMN') &&
        sql.includes('companies.contract_model'),
  'campos texto contract_model não são removidos nem renomeados',
);
assert(!sql.includes('DROP COLUMN'), 'migration aditiva sem DROP COLUMN');
assert(!sql.includes('RENAME COLUMN'), 'migration aditiva sem RENAME COLUMN');

function sampleStore(): OperationalStore {
  return {
    models: [
      {
        id: 'm-padrao',
        companyId: 'co-a',
        catalogCode: 'PADRAO',
        engineKey: 'classic',
        name: 'Padrão SV LOTES',
        status: 'active',
        source: 'system_seed',
        isCompanyDefault: true,
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
        isCompanyDefault: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'm-b',
        companyId: 'co-b',
        catalogCode: 'PADRAO',
        engineKey: 'classic',
        name: 'Padrão B',
        status: 'active',
        source: 'system_seed',
        isCompanyDefault: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    versions: [
      {
        id: 'v1',
        modelId: 'm-padrao',
        companyId: 'co-a',
        version: 1,
        status: 'published',
        contentHtml: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'v2',
        modelId: 'm-mundo',
        companyId: 'co-a',
        version: 1,
        status: 'published',
        contentHtml: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    links: [],
    companiesContractModel: { 'co-a': 'MUNDO_NOVO', 'co-b': 'PADRAO' },
    projectsContractModel: { 'proj-1': 'MUNDO_NOVO', 'proj-2': null },
    generatedHtmlByContractId: { 'ct-1': '<p>contrato</p>' },
  };
}

{
  const store = sampleStore();
  const before = snapshotGisFields(store);
  renameModel(store, 'm-mundo', 'Chacreamento Mundo Novo', 'co-a');
  assert(
    store.models.find((m) => m.id === 'm-mundo')?.name === 'Chacreamento Mundo Novo',
    'renomear modelo',
  );
  assertStoreGis(store, before);

  const { copy } = duplicateModel(store, 'm-mundo', 'co-a');
  assert(copy.source === 'user' && copy.catalogCode === 'MUNDO_NOVO', 'duplicar reutiliza motor');
  assert(copy.name.startsWith('Cópia de '), 'duplicar gera nome de cópia');
  assert(copy.isCompanyDefault === false, 'cópia não herda padrão da empresa');
  assert(
    historyForModel(store, copy.id, 'co-a').some((v) => v.version === 1 && v.status === 'published'),
    'duplicar cria versão inicial publicada',
  );
  assertStoreGis(store, before);

  const saved = saveAsNewModel(store, 'm-padrao', 'Padrão da equipe comercial', 'co-a');
  assert(
    saved.copy.name === 'Padrão da equipe comercial' && saved.copy.source === 'user',
    'salvar como novo',
  );
  assert(
    store.models.find((m) => m.id === 'm-padrao')?.name === 'Padrão SV LOTES',
    'salvar como novo preserva o original',
  );
  assert(
    historyForModel(store, saved.copy.id, 'co-a').some(
      (v) => v.version === 1 && v.status === 'published',
    ),
    'salvar como novo cria versão inicial publicada',
  );
  assertStoreGis(store, before);

  setCompanyDefaultAtomic(store, 'm-mundo', 'co-a');
  assert(countActiveCompanyDefaults(store, 'co-a') === 1, 'troca atômica: um padrão');
  assert(
    store.models.find((m) => m.id === 'm-mundo')?.isCompanyDefault === true &&
      store.models.find((m) => m.id === 'm-padrao')?.isCompanyDefault === false,
    'troca atômica de padrão da empresa',
  );
  assert(store.companiesContractModel['co-a'] === 'MUNDO_NOVO', 'cadastro GIS da empresa intacto');
  assertStoreGis(store, before);

  associateProject(store, {
    modelId: 'm-padrao',
    projectId: 'proj-1',
    projectName: 'Chacreamento Mundo Novo',
    projectCompanyId: 'co-a',
    callerCompanyId: 'co-a',
    asProjectDefault: false,
  });
  setProjectDefaultAtomic(store, {
    modelId: 'm-mundo',
    projectId: 'proj-1',
    projectName: 'Chacreamento Mundo Novo',
    projectCompanyId: 'co-a',
    callerCompanyId: 'co-a',
  });
  assert(countProjectDefaults(store, 'proj-1') === 1, 'um padrão por empreendimento');
  assert(
    store.links.find((l) => l.modelId === 'm-mundo' && l.projectId === 'proj-1')?.isProjectDefault ===
      true,
    'troca atômica de padrão do empreendimento',
  );
  assert(store.projectsContractModel['proj-1'] === 'MUNDO_NOVO', 'cadastro GIS do empreendimento intacto');
  assertStoreGis(store, before);

  let archiveBlocked = false;
  try {
    archiveModel(store, 'm-mundo', 'co-a');
  } catch (e) {
    archiveBlocked = e instanceof Error && e.message === ARCHIVE_DEFAULT_BLOCKED;
  }
  assert(archiveBlocked, 'não arquiva o padrão ativo sem outro padrão');

  setCompanyDefaultAtomic(store, 'm-padrao', 'co-a');
  archiveModel(store, 'm-mundo', 'co-a');
  assert(store.models.find((m) => m.id === 'm-mundo')?.status === 'archived', 'arquivar');
  unarchiveModel(store, 'm-mundo', 'co-a');
  assert(store.models.find((m) => m.id === 'm-mundo')?.status === 'active', 'desarquivar');
  assertStoreGis(store, before);

  const created = createNewModel(store, {
    callerCompanyId: 'co-a',
    name: 'Contrato da equipe',
    basedOnModelId: 'm-padrao',
  });
  assert(
    created.model.source === 'user' && created.model.catalogCode === 'PADRAO',
    'criar baseado em modelo existente',
  );
  const custom = createNewModel(store, {
    callerCompanyId: 'co-a',
    name: 'Contrato da imobiliária',
    personalized: true,
  });
  assert(custom.model.catalogCode === 'CUSTOM', 'criar personalizado CUSTOM');
  assert(
    historyForModel(store, custom.model.id, 'co-a').some(
      (v) => v.version === 0 && v.status === 'draft',
    ),
    'personalizado cria rascunho version 0',
  );
  assert(
    !historyForModel(store, custom.model.id, 'co-a').some((v) => v.status === 'published'),
    'personalizado não publica automaticamente',
  );
  const imported = importCustomModel(store, {
    callerCompanyId: 'co-a',
    name: 'Contrato recebido',
    fileName: 'minuta.pdf',
    mime: 'application/pdf',
  });
  assert(
    imported.model.catalogCode === 'CUSTOM' &&
      historyForModel(store, imported.model.id, 'co-a')[0]?.engineParamsJson?.import,
    'importar como CUSTOM sem ligar GIS',
  );
  assert(historyForModel(store, 'm-padrao', 'co-a').length >= 1, 'consultar histórico');
  assertStoreGis(store, before);

  let cross = false;
  try {
    duplicateModel(store, 'm-padrao', 'co-b');
  } catch {
    cross = true;
  }
  assert(cross, 'isolamento entre empresas no clone');
  assert(physicalDeleteAllowed() === false, 'exclusão física indisponível');
  assert(
    store.models.find((m) => m.id === 'm-padrao')?.source === 'system_seed',
    'proteção: system_seed permanece no catálogo da empresa',
  );
  assert(legalContentIsLocked('MUNDO_NOVO') && !legalContentIsLocked('CUSTOM'), 'texto jurídico TS protegido');

  const orphan = sampleStore();
  orphan.versions = orphan.versions.filter((v) => v.modelId !== 'm-mundo');
  const orphanCopy = duplicateModel(orphan, 'm-mundo', 'co-a').copy;
  assert(
    historyForModel(orphan, orphanCopy.id, 'co-a').some(
      (v) => v.version === 1 && v.status === 'published',
    ),
    'duplicar cria versão mesmo se o original não tiver histórico',
  );
}

function assertStoreGis(
  store: OperationalStore,
  before: ReturnType<typeof snapshotGisFields>,
) {
  assert(
    JSON.stringify(snapshotGisFields(store)) === JSON.stringify(before),
    'operações da Central não alteram GIS nem generated_html',
  );
}

{
  const versionPayload = payloadForCentralTable('company_contract_model_versions', {
    tenant_id: 'nao-deve-ir',
    company_id: 'co-a',
    model_id: 'm1',
    version: 1,
    status: 'published',
    content_html: null,
  });
  assert(
    !('tenant_id' in versionPayload) && versionPayload.company_id === 'co-a',
    'versões usam company_id e não tenant_id',
  );
  const linkPayload = payloadForCentralTable('project_contract_model_links', {
    tenant_id: 'nao-deve-ir',
    company_id: 'co-a',
    project_id: 'p1',
    company_contract_model_id: 'm1',
    is_project_default: false,
  });
  assert(
    !('tenant_id' in linkPayload) && linkPayload.company_id === 'co-a',
    'vínculos usam company_id e não tenant_id',
  );
  const modelPayload = payloadForCentralTable('company_contract_models', {
    tenant_id: 'co-a',
    company_id: 'co-a',
    catalog_code: 'PADRAO',
    engine_key: 'classic',
    name: 'Padrão',
    status: 'active',
    source: 'user',
    is_company_default: false,
  });
  assert(
    modelPayload.tenant_id === 'co-a' && modelPayload.company_id === 'co-a',
    'instância do modelo mantém tenant_id = company_id',
  );
  const defaultPayload = companyDefaultUpdatePayload('2026-01-01T00:00:00.000Z', true);
  assert(
    Object.keys(defaultPayload).sort().join(',') === 'is_company_default,status,updated_at' &&
      !('contract_model' in defaultPayload),
    'padrão da empresa só grava is_company_default na Central',
  );
}

{
  const versionsSql = sql.slice(
    sql.indexOf('CREATE TABLE IF NOT EXISTS public.company_contract_model_versions'),
    sql.indexOf('CREATE TABLE IF NOT EXISTS public.project_contract_model_links'),
  );
  const linksSql = sql.slice(
    sql.indexOf('CREATE TABLE IF NOT EXISTS public.project_contract_model_links'),
    sql.indexOf('Snapshot FKs nullable'),
  );
  assert(!/\btenant_id\b/.test(versionsSql), 'schema real: versions sem tenant_id');
  assert(!/\btenant_id\b/.test(linksSql), 'schema real: links sem tenant_id');
}

{
  const centralComponent = read(
    'components/contracts/central/ContractModelsOperationalCentral.tsx',
  );
  assert(!centralComponent.includes('withTenantFields'), 'UI não injeta tenant_id genérico');
  assert(
    centralComponent.includes("payloadForCentralTable('company_contract_model_versions'") &&
      centralComponent.includes("payloadForCentralTable('project_contract_model_links'"),
    'inserts de versão e vínculo passam pelo payload do schema real',
  );
  assert(
    centralComponent.includes("catalog_code !== 'CUSTOM'") &&
      centralComponent.includes('ensure_company_contract_model_draft'),
    'Central não inventa published v1 para CUSTOM; usa RPC de rascunho',
  );
  assert(
    !centralComponent.includes("from('companies')") &&
      !centralComponent.includes("from('sales')") &&
      !centralComponent.includes("from('contracts')"),
    'Central não escreve companies/sales/contracts',
  );
}

assert(
  !centralUi.includes('generateContractHTML') &&
    !centralUi.includes('gisSaleCreateService'),
  'Central operacional não chama motores de geração',
);
assert(
  !centralPage.includes('companies.contract_model') &&
    !read('components/contracts/central/ContractModelsOperationalCentral.tsx').includes(
      'companies.contract_model',
    ) &&
    !read('components/contracts/central/ContractModelsOperationalCentral.tsx').includes(
      'projects.contract_model',
    ),
  'UI não fala de campos técnicos GIS',
);
assert(centralUi.includes(CUSTOM_NOT_IN_AUTO_EMISSION), 'CUSTOM avisa que não entra na emissão');
assert(
  centralUi.includes('Venda / lote para prévia') &&
    centralUi.includes('disabled'),
  'visualizar tem seletor futuro desabilitado',
);
assert(
  layout.includes('{contractModelsHeaderLink(false)}') &&
    layout.includes('{contractModelsHeaderLink(true)}'),
  'botão homologado permanece no cabeçalho',
);

console.log('\nOK — Central de Modelos Etapa 0+1');

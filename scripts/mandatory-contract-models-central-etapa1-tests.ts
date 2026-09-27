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
  centralPage.includes('Central de Modelos de Contrato'),
  'página da Central existe',
);
assert(
  /Nome do modelo/.test(centralPage) &&
    /Motor \/ código/.test(centralPage) &&
    /Padrão da empresa/.test(centralPage) &&
    /Empreendimentos associados/.test(centralPage) &&
    /Status/.test(centralPage) &&
    /Versão publicada/.test(centralPage),
  'Central lista nome, motor, padrão, empreendimentos, status e versão',
);
assert(
  !centralPage.includes('contenteditable') &&
    !centralPage.includes('editor jurídico'),
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

console.log('\nOK — Central de Modelos Etapa 0+1');

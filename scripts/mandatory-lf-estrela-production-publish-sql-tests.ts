/**
 * SQL Production-safe de publicação LF ESTRELA — testes estáticos.
 * npx tsx scripts/mandatory-lf-estrela-production-publish-sql-tests.ts
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildLfEstrelaCustomHtml,
  LF_ESTRELA_CATALOG_CODE,
  LF_ESTRELA_ENGINE_KEY,
  LF_ESTRELA_MODEL_NAME,
} from '../lib/lfEstrelaCustomTemplate';
import {
  LF_ESTRELA_SQL_HTML_TAG_PRODUCTION,
  assertLfEstrelaSqlHtmlMatchesOfficial,
  extractLfEstrelaHtmlFromProductionPublishSql,
  sha256Utf8,
} from './develop/lfEstrelaPublishSqlHtml';
import {
  FORBIDDEN_DEVELOP_COMPANY_ID,
  FORBIDDEN_DEVELOP_PROJECT_ID,
  PRODUCTION_PROJECT_NAME,
  assertNoDevelopUuids,
  assertProductionSqlSafety,
  buildProductionSqlBundle,
  md5Utf8,
  resolveSourceCommit,
} from './production/lfEstrelaProductionPublish';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();
const migrations = [
  'supabase/migrations/20261028120000_contract_model_central_foundation.sql',
  'supabase/migrations/20261028121000_contract_model_version_draft_history.sql',
  'supabase/migrations/20261028122000_delete_company_contract_model.sql',
  'supabase/migrations/20261029120000_customers_nationality_companies_creci.sql',
];

const officialHtml = buildLfEstrelaCustomHtml();
const sha = sha256Utf8(officialHtml);
const bundle = buildProductionSqlBundle({
  html: officialHtml,
  htmlSha256: sha,
  sourceCommit: resolveSourceCommit(),
});

const publishedPath = join(
  root,
  'scripts/production/sql/publish-lf-estrela.production.sql',
);
assert(existsSync(publishedPath), 'SQL publish Production gerado');
const committedPublish = readFileSync(publishedPath, 'utf8');

console.log('=== migrations pressupostas ===');
for (const rel of migrations) {
  assert(existsSync(join(root, rel)), `migration presente: ${rel}`);
  assert(
    bundle.publish.includes(rel.replace('supabase/migrations/', '')),
    `SQL documenta ${rel}`,
  );
}
assert(
  bundle.publish.includes('ABORT: migration 20261028120000'),
  'publicação aborta sem fundação da Central',
);
assert(
  bundle.publish.includes('ABORT: migration 20261028121000'),
  'publicação aborta sem draft/history',
);
assert(
  bundle.publish.includes('ABORT: migration 20261028122000'),
  'publicação aborta sem delete_company_contract_model',
);
assert(
  bundle.publish.includes('ABORT: migration 20261029120000'),
  'publicação aborta sem nationality/creci',
);

console.log('=== UUIDs DEVELOP ausentes ===');
for (const sql of [bundle.diagnose, bundle.publish, bundle.verify, bundle.rollback, committedPublish]) {
  assertNoDevelopUuids(sql, 'bundle');
  assert(!sql.includes(FORBIDDEN_DEVELOP_PROJECT_ID), 'sem project_id DEVELOP');
  assert(!sql.includes(FORBIDDEN_DEVELOP_COMPANY_ID), 'sem company_id DEVELOP');
}

console.log('=== segurança estrutural ===');
for (const [label, sql] of [
  ['diagnose', bundle.diagnose],
  ['publish', bundle.publish],
  ['verify', bundle.verify],
  ['rollback', bundle.rollback],
  ['committed', committedPublish],
] as const) {
  assertProductionSqlSafety(sql, label);
  assert(!/DISABLE\s+TRIGGER/i.test(sql), `${label} sem DISABLE TRIGGER`);
  assert(!/UPDATE\s+public\.projects\b/i.test(sql), `${label} sem UPDATE projects`);
  assert(!/SET\s+contract_model\s*=/i.test(sql), `${label} sem SET contract_model`);
  assert(
    !/UPDATE\s+public\.projects[\s\S]{0,200}company_id/i.test(sql),
    `${label} sem UPDATE company_id em projects`,
  );
  assert(
    !/UPDATE\s+public\.projects[\s\S]{0,200}tenant_id/i.test(sql),
    `${label} sem UPDATE tenant_id em projects`,
  );
}

console.log('=== resolução por nome ===');
assert(
  bundle.publish.includes(PRODUCTION_PROJECT_NAME),
  'resolve CHACREAMENTO ESTRELA DO SUL',
);
assert(
  bundle.publish.includes("ABORT: 0 empreendimentos com nome"),
  'aborta em 0 projeto',
);
assert(
  bundle.publish.includes('ABORT: mais de 1 empreendimento com nome'),
  'aborta em >1 projeto',
);
assert(
  bundle.publish.includes('ABORT: project_company_uuid IS NULL'),
  'aborta project_company_uuid NULL',
);
assert(
  bundle.publish.includes('ABORT: divergência tenant/company'),
  'aborta divergência tenant/company',
);
assert(
  bundle.publish.includes('ABORT: empresa não existe'),
  'aborta empresa ausente',
);
assert(!/\$[0-9a-fA-F]{8}-[0-9a-fA-F]{4}/.test(bundle.publish), 'sem UUID interpolado no publish');
assert(
  bundle.publish.includes('WHERE NOT EXISTS'),
  'link idempotente WHERE NOT EXISTS',
);
assert(
  bundle.publish.includes('SELECT v_project_id, v_company_id, v_model_id, false'),
  'INSERT do link com is_project_default=false',
);
assert(
  !/UPDATE\s+public\.project_contract_model_links[\s\S]{0,120}is_project_default/i.test(
    bundle.publish,
  ),
  'não reseta is_project_default em link existente',
);
assert(
  bundle.publish.includes('is_company_default') &&
    bundle.publish.includes("'user'") &&
    bundle.publish.includes(LF_ESTRELA_MODEL_NAME) &&
    bundle.publish.includes(LF_ESTRELA_CATALOG_CODE) &&
    bundle.publish.includes(LF_ESTRELA_ENGINE_KEY),
  'modelo CUSTOM user LF ESTRELA',
);
assert(
  bundle.publish.includes("AND l.project_id IS DISTINCT FROM v_project_id"),
  'recusa associação a outro empreendimento',
);
assert(
  bundle.publish.includes('v_published_html IS DISTINCT FROM v_html'),
  'só publica versão se HTML mudou',
);
assert(
  bundle.publish.includes('trg_project_contract_model_link_tenant'),
  'documenta trigger ativo',
);

console.log('=== diagnóstico read-only ===');
assert(!/\bINSERT\s+INTO\b/i.test(bundle.diagnose), 'diagnose sem INSERT');
assert(!/\bUPDATE\s+public\./i.test(bundle.diagnose), 'diagnose sem UPDATE');
assert(!/\bDELETE\s+FROM\b/i.test(bundle.diagnose), 'diagnose sem DELETE');
assert(bundle.diagnose.includes('project_id'), 'diagnose lista project_id');
assert(bundle.diagnose.includes('project_name'), 'diagnose lista project_name');
assert(bundle.diagnose.includes('project_company_uuid'), 'diagnose lista project_company_uuid');
assert(bundle.diagnose.includes('company_found_name'), 'diagnose lista empresa');
assert(bundle.diagnose.includes('diagnostic_status'), 'diagnose tem status');

console.log('=== HTML oficial ===');
const fromSql = extractLfEstrelaHtmlFromProductionPublishSql(committedPublish);
assert(fromSql === officialHtml, 'HTML SQL Production === buildLfEstrelaCustomHtml()');
const match = assertLfEstrelaSqlHtmlMatchesOfficial(
  committedPublish,
  officialHtml,
  LF_ESTRELA_SQL_HTML_TAG_PRODUCTION,
);
assert(match.sha256 === sha, 'SHA-256 SQL = SHA-256 oficial');
assert(bundle.htmlMd5 === md5Utf8(officialHtml), 'MD5 do bundle = MD5 oficial');
assert(committedPublish.includes(sha), 'SHA-256 oficial interpolado na verificação');
assert(fromSql.includes('data-sv-if="spouse"'), 'HTML tem spouse conditional');
assert(fromSql.includes('{{PARTNERSHIP_NOTE}}'), 'HTML tem PARTNERSHIP_NOTE');

console.log('=== arquivo commitado sincronizado ===');
assert(
  extractLfEstrelaHtmlFromProductionPublishSql(bundle.publish) === fromSql,
  'gerador = arquivo commitado (HTML)',
);
assert(
  committedPublish.includes('SELECT v_project_id, v_company_id, v_model_id, false'),
  'arquivo commitado is_project_default=false',
);

console.log('=== rollback ===');
assert(
  bundle.rollback.includes('ABORT rollback: já existem vendas/contratos'),
  'rollback recusa se houver FKs',
);
assert(
  bundle.rollback.includes('DELETE FROM public.project_contract_model_links'),
  'rollback remove só o vínculo',
);
assert(
  bundle.rollback.includes("SET status = 'archived'"),
  'rollback arquiva modelo se não usado',
);
assert(
  !/DELETE\s+FROM\s+public\.company_contract_models/i.test(bundle.rollback),
  'rollback não apaga a linha do modelo',
);
assert(
  !/DELETE\s+FROM\s+public\.company_contract_models/i.test(bundle.rollback) &&
    bundle.rollback.includes("m.source = 'system_seed'") &&
    bundle.rollback.includes('ESTRELA_DO_SUL'),
  'rollback protege system_seed ESTRELA_DO_SUL',
);
assert(!/UPDATE\s+public\.sales\b/i.test(bundle.rollback), 'rollback não altera sales');
assert(!/UPDATE\s+public\.contracts\b/i.test(bundle.rollback), 'rollback não altera contracts');
assert(!/DELETE\s+FROM\s+public\.sales\b/i.test(bundle.rollback), 'rollback não apaga sales');
assert(
  !/DELETE\s+FROM\s+public\.contracts\b/i.test(bundle.rollback),
  'rollback não apaga contracts',
);

console.log('=== gerador recusa UUID DEVELOP ===');
let threw = false;
try {
  assertNoDevelopUuids(
    `project ${FORBIDDEN_DEVELOP_PROJECT_ID}`,
    'fixture',
  );
} catch {
  threw = true;
}
assert(threw, 'assertNoDevelopUuids recusa project_id DEVELOP');

const genSrc = readFileSync(
  join(root, 'scripts/production/generate-publish-lf-estrela-sql.ts'),
  'utf8',
);
assert(!genSrc.includes(FORBIDDEN_DEVELOP_PROJECT_ID), 'gerador entrypoint não interpola project_id DEVELOP');
assert(!genSrc.includes(FORBIDDEN_DEVELOP_COMPANY_ID), 'gerador entrypoint não interpola company_id DEVELOP');

const gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
assert(bundle.sourceCommit === gitSha, 'source_commit = HEAD');

console.log('\nOK — SQL Production-safe LF ESTRELA.');
console.log(
  JSON.stringify(
    {
      htmlChars: match.chars,
      sha256: match.sha256,
      md5: bundle.htmlMd5,
      sourceCommit: bundle.sourceCommit,
    },
    null,
    2,
  ),
);

/**
 * Constantes e SQL Production-safe para publicar LF ESTRELA.
 * Não executa no banco. Não usa service role. Não interpola UUID de dados.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  LF_ESTRELA_CATALOG_CODE,
  LF_ESTRELA_ENGINE_KEY,
  LF_ESTRELA_MODEL_NAME,
} from '../../lib/lfEstrelaCustomTemplate';
import {
  LF_ESTRELA_SQL_HTML_TAG_PRODUCTION,
} from '../develop/lfEstrelaPublishSqlHtml';

/** UUIDs do DEVELOP — o gerador recusa qualquer ocorrência no SQL emitido. */
export const FORBIDDEN_DEVELOP_PROJECT_ID =
  '760c32d8-4c43-403b-986c-9872011f44cd';
export const FORBIDDEN_DEVELOP_COMPANY_ID =
  '3052a000-e8b9-43a4-b8ab-91a4392ffcbc';
export const FORBIDDEN_DEVELOP_UUIDS = [
  FORBIDDEN_DEVELOP_PROJECT_ID,
  FORBIDDEN_DEVELOP_COMPANY_ID,
] as const;

export const PRODUCTION_PROJECT_NAME = 'CHACREAMENTO ESTRELA DO SUL';
export const PRODUCTION_HTML_TAG = LF_ESTRELA_SQL_HTML_TAG_PRODUCTION;
export const PRODUCTION_BODY_TAG = 'publish_lf_estrela_prod';
export const PRODUCTION_ROLLBACK_TAG = 'rollback_lf_estrela_prod';

const UUID_RE =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const NAME_NORM = `upper(btrim(regexp_replace(coalesce(p.name, ''), '\\s+', ' ', 'g')))`;

export function md5Utf8(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex');
}

export function resolveSourceCommit(): string {
  return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
}

export function assertNoDevelopUuids(sql: string, label: string): void {
  const lower = sql.toLowerCase();
  for (const id of FORBIDDEN_DEVELOP_UUIDS) {
    if (lower.includes(id.toLowerCase())) {
      throw new Error(`${label} contém UUID DEVELOP ${id}`);
    }
  }
}

export function assertProductionSqlSafety(sql: string, label: string): void {
  assertNoDevelopUuids(sql, label);
  if (/DISABLE\s+TRIGGER/i.test(sql) || /ENABLE\s+TRIGGER/i.test(sql)) {
    throw new Error(`${label} não pode alterar estado de trigger`);
  }
  if (/ALTER\s+TABLE\s+public\.projects/i.test(sql)) {
    throw new Error(`${label} não pode ALTER TABLE projects`);
  }
  if (/UPDATE\s+public\.projects\b/i.test(sql)) {
    throw new Error(`${label} não pode UPDATE public.projects`);
  }
  if (/SET\s+contract_model\s*=/i.test(sql)) {
    throw new Error(`${label} não pode atribuir contract_model`);
  }
}

function diagnosticSelect(): string {
  return `-- =============================================================================
-- PASSO 1 — SOMENTE LEITURA
-- Rode este SELECT sozinho em Production ANTES de qualquer publicação.
-- Não INSERT / UPDATE / DELETE. Não desabilita trigger. Não muda o motor TS.
-- Nome resolvido (normalizado): ${PRODUCTION_PROJECT_NAME}
-- Pressupõe as 4 migrations da Central já aplicadas.
-- =============================================================================

WITH normalized AS (
  SELECT
    p.id,
    p.name,
    nullif(btrim(to_jsonb(p)->>'company_id'), '') AS project_company_col,
    nullif(btrim(to_jsonb(p)->>'tenant_id'), '') AS project_tenant_col,
    public.project_company_uuid(p.*) AS project_company_uuid,
    p.contract_model::text AS project_engine
  FROM public.projects p
  WHERE ${NAME_NORM} = '${PRODUCTION_PROJECT_NAME}'
),
counted AS (
  SELECT count(*)::int AS candidate_count FROM normalized
),
one AS (
  SELECT n.*
  FROM normalized n
  WHERE (SELECT candidate_count FROM counted) = 1
)
SELECT
  c.candidate_count,
  o.id AS project_id,
  o.name AS project_name,
  o.project_company_col AS company_id,
  o.project_tenant_col AS tenant_id,
  o.project_company_uuid,
  o.project_engine AS contract_model,
  co.id AS company_found_id,
  co.name AS company_found_name,
  (
    SELECT string_agg(n.id::text || ' | ' || n.name, ' ; ' ORDER BY n.name, n.id)
    FROM normalized n
  ) AS candidates_dump,
  CASE
    WHEN to_regclass('public.company_contract_models') IS NULL
      THEN 'ABORT: migration 20261028120000 não aplicada (company_contract_models)'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
      WHERE nsp.nspname = 'public' AND p.proname = 'project_company_uuid'
    )
      THEN 'ABORT: migration 20261028120000 não aplicada (project_company_uuid)'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
      WHERE nsp.nspname = 'public' AND p.proname = 'publish_company_contract_model_version'
    )
      THEN 'ABORT: migration 20261028121000 não aplicada'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
      WHERE nsp.nspname = 'public' AND p.proname = 'delete_company_contract_model'
    )
      THEN 'ABORT: migration 20261028122000 não aplicada'
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'nationality'
    ) OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'creci'
    )
      THEN 'ABORT: migration 20261029120000 não aplicada'
    WHEN c.candidate_count = 0
      THEN 'ABORT: 0 empreendimentos com nome ${PRODUCTION_PROJECT_NAME}'
    WHEN c.candidate_count > 1
      THEN 'ABORT: mais de 1 empreendimento com nome ${PRODUCTION_PROJECT_NAME}'
    WHEN o.project_company_uuid IS NULL
      THEN 'ABORT: project_company_uuid IS NULL (company_id e tenant_id sem UUID)'
    WHEN co.id IS NULL
      THEN 'ABORT: empresa não existe para project_company_uuid'
    WHEN o.project_company_col ~* '${UUID_RE}'
     AND o.project_tenant_col ~* '${UUID_RE}'
     AND o.project_company_col IS DISTINCT FROM o.project_tenant_col
      THEN 'ABORT: divergência tenant/company (company_id UUID ≠ tenant_id UUID)'
    ELSE 'OK — somente leitura; ainda não publica. Conferir 1 linha e project_engine.'
  END AS diagnostic_status
FROM counted c
LEFT JOIN one o ON TRUE
LEFT JOIN public.companies co ON co.id = o.project_company_uuid;`;
}

function verifySelect(params: {
  htmlSha256: string;
  htmlMd5: string;
  htmlChars: number;
}): string {
  return `-- =============================================================================
-- PASSO 3 — VERIFICAÇÃO PÓS-PUBLICAÇÃO
-- Esperado ANTES da seleção no GIS:
--   is_project_default = false
--   project_engine = ESTRELA_DO_SUL (ou NULL legado; o SQL NÃO altera essa coluna)
-- html_md5_matches_official = true
-- expected_html_sha256 = ${params.htmlSha256}
-- =============================================================================

SELECT
  m.id AS model_id,
  m.name,
  m.catalog_code,
  m.engine_key,
  m.source,
  m.status,
  v.version AS published_version,
  v.status AS version_status,
  m.company_id,
  m.is_company_default,
  l.project_id,
  p.name AS project_name,
  p.contract_model AS project_engine,
  l.is_project_default,
  (v.content_html LIKE '%data-sv-if="spouse"%') AS has_spouse_if,
  (v.content_html LIKE '%{{PARTNERSHIP_NOTE}}%') AS has_partnership_note,
  length(v.content_html) AS html_chars,
  (length(v.content_html) = ${params.htmlChars}) AS html_length_match,
  md5(v.content_html) AS html_md5,
  (md5(v.content_html) = '${params.htmlMd5}') AS html_md5_matches_official,
  '${params.htmlSha256}' AS expected_html_sha256,
  v.engine_params_json->>'html_sha256' AS stored_html_sha256,
  (
    SELECT count(*)::int
    FROM public.project_contract_model_links x
    WHERE x.company_contract_model_id = m.id
  ) AS link_count
FROM public.company_contract_models m
JOIN public.company_contract_model_versions v
  ON v.model_id = m.id
 AND v.status = 'published'
LEFT JOIN public.project_contract_model_links l
  ON l.company_contract_model_id = m.id
LEFT JOIN public.projects p
  ON p.id = l.project_id
WHERE m.name = '${LF_ESTRELA_MODEL_NAME}'
  AND m.source = 'user'
  AND m.catalog_code = '${LF_ESTRELA_CATALOG_CODE}'
ORDER BY v.version DESC, m.created_at;`;
}

function publishBody(params: {
  html: string;
  htmlSha256: string;
  sourceCommit: string;
}): string {
  return `-- =============================================================================
-- PASSO 2 — PUBLICAÇÃO (só depois de conferir o PASSO 1 com status OK)
-- NÃO altera projects.contract_model / company_id / tenant_id
-- NÃO desabilita trg_project_contract_model_link_tenant
-- NÃO marca is_project_default nem is_company_default
-- HTML = buildLfEstrelaCustomHtml() @ ${params.sourceCommit}
-- html_sha256 = ${params.htmlSha256}
-- =============================================================================

BEGIN;

DO $${PRODUCTION_BODY_TAG}$
DECLARE
  v_candidate_count int;
  v_project_id uuid;
  v_project_name text;
  v_project_model text;
  v_project_company_col text;
  v_project_tenant_col text;
  v_project_company_uuid uuid;
  v_company_id uuid;
  v_company_name text;
  v_model_id uuid;
  v_draft_id uuid;
  v_published_html text;
  v_next integer;
  v_html text := $${PRODUCTION_HTML_TAG}$
${params.html}
$${PRODUCTION_HTML_TAG}$;
BEGIN
  IF to_regclass('public.company_contract_models') IS NULL
     OR to_regclass('public.company_contract_model_versions') IS NULL
     OR to_regclass('public.project_contract_model_links') IS NULL THEN
    RAISE EXCEPTION 'ABORT: migration 20261028120000 não aplicada (tabelas da Central)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public' AND p.proname = 'project_company_uuid'
  ) THEN
    RAISE EXCEPTION 'ABORT: migration 20261028120000 não aplicada (project_company_uuid)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public' AND p.proname = 'publish_company_contract_model_version'
  ) THEN
    RAISE EXCEPTION 'ABORT: migration 20261028121000 não aplicada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public' AND p.proname = 'delete_company_contract_model'
  ) THEN
    RAISE EXCEPTION 'ABORT: migration 20261028122000 não aplicada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'nationality'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'creci'
  ) THEN
    RAISE EXCEPTION 'ABORT: migration 20261029120000 não aplicada (nationality/creci)';
  END IF;

  SELECT count(*)::int
    INTO v_candidate_count
  FROM public.projects p
  WHERE ${NAME_NORM} = '${PRODUCTION_PROJECT_NAME}';

  IF COALESCE(v_candidate_count, 0) = 0 THEN
    RAISE EXCEPTION 'ABORT: 0 empreendimentos com nome ${PRODUCTION_PROJECT_NAME}';
  END IF;

  IF v_candidate_count > 1 THEN
    RAISE EXCEPTION 'ABORT: mais de 1 empreendimento com nome ${PRODUCTION_PROJECT_NAME} (count=%)',
      v_candidate_count;
  END IF;

  SELECT
    p.id,
    p.name,
    p.contract_model::text,
    nullif(btrim(to_jsonb(p)->>'company_id'), ''),
    nullif(btrim(to_jsonb(p)->>'tenant_id'), ''),
    public.project_company_uuid(p.*)
  INTO
    v_project_id,
    v_project_name,
    v_project_model,
    v_project_company_col,
    v_project_tenant_col,
    v_project_company_uuid
  FROM public.projects p
  WHERE ${NAME_NORM} = '${PRODUCTION_PROJECT_NAME}';

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'ABORT: 0 empreendimentos com nome ${PRODUCTION_PROJECT_NAME}';
  END IF;

  IF v_project_company_col ~* '${UUID_RE}'
     AND v_project_tenant_col ~* '${UUID_RE}'
     AND v_project_company_col IS DISTINCT FROM v_project_tenant_col THEN
    RAISE EXCEPTION
      'ABORT: divergência tenant/company. projects.company_id=% projects.tenant_id=%',
      v_project_company_col, v_project_tenant_col;
  END IF;

  IF v_project_company_uuid IS NULL THEN
    RAISE EXCEPTION
      'ABORT: project_company_uuid IS NULL (projects.company_id=% / projects.tenant_id=%). NÃO atualizar o projeto neste SQL. NÃO desabilitar trg_project_contract_model_link_tenant.',
      v_project_company_col, v_project_tenant_col;
  END IF;

  v_company_id := v_project_company_uuid;

  SELECT c.name INTO v_company_name
  FROM public.companies c
  WHERE c.id = v_company_id;

  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'ABORT: empresa não existe para project_company_uuid=%', v_company_id;
  END IF;

  RAISE NOTICE 'VALIDAÇÃO LF ESTRELA PRODUCTION — project_id=% project_name=% company_id=% tenant_id=% project_company_uuid=% company_name=% contract_model=%',
    v_project_id,
    v_project_name,
    v_project_company_col,
    v_project_tenant_col,
    v_project_company_uuid,
    v_company_name,
    v_project_model;

  SELECT m.id
    INTO v_model_id
  FROM public.company_contract_models m
  WHERE m.company_id = v_company_id
    AND upper(btrim(regexp_replace(m.name, '\\s+', ' ', 'g'))) = '${LF_ESTRELA_MODEL_NAME}'
  ORDER BY m.created_at
  LIMIT 1;

  IF v_model_id IS NULL THEN
    INSERT INTO public.company_contract_models (
      company_id,
      tenant_id,
      catalog_code,
      engine_key,
      name,
      status,
      source,
      is_company_default
    ) VALUES (
      v_company_id,
      v_company_id,
      '${LF_ESTRELA_CATALOG_CODE}',
      '${LF_ESTRELA_ENGINE_KEY}',
      '${LF_ESTRELA_MODEL_NAME}',
      'active',
      'user',
      false
    )
    RETURNING id INTO v_model_id;
  ELSE
    UPDATE public.company_contract_models
       SET catalog_code = '${LF_ESTRELA_CATALOG_CODE}',
           engine_key = '${LF_ESTRELA_ENGINE_KEY}',
           name = '${LF_ESTRELA_MODEL_NAME}',
           status = 'active',
           source = 'user',
           is_company_default = false,
           updated_at = timezone('utc'::text, now())
     WHERE id = v_model_id
       AND company_id = v_company_id
       AND source IS DISTINCT FROM 'system_seed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.company_contract_models m
    WHERE m.id = v_model_id
      AND m.company_id = v_company_id
      AND m.catalog_code = '${LF_ESTRELA_CATALOG_CODE}'
      AND m.engine_key = '${LF_ESTRELA_ENGINE_KEY}'
      AND m.status = 'active'
      AND m.source = 'user'
      AND m.is_company_default = false
  ) THEN
    RAISE EXCEPTION 'ABORT: modelo LF ESTRELA não ficou CUSTOM/user/active (possível system_seed)';
  END IF;

  SELECT v.id
    INTO v_draft_id
  FROM public.company_contract_model_versions v
  WHERE v.model_id = v_model_id
    AND v.status = 'draft'
    AND v.version = 0
  LIMIT 1;

  IF v_draft_id IS NULL THEN
    INSERT INTO public.company_contract_model_versions (
      model_id,
      company_id,
      version,
      status,
      content_html,
      engine_params_json,
      updated_at
    ) VALUES (
      v_model_id,
      v_company_id,
      0,
      'draft',
      v_html,
      jsonb_build_object(
        'origin', 'LF_ESTRELA_OFFICIAL',
        'published_channel', 'production',
        'source_commit', '${params.sourceCommit}',
        'html_sha256', '${params.htmlSha256}'
      ),
      timezone('utc'::text, now())
    );
  ELSE
    UPDATE public.company_contract_model_versions
       SET content_html = v_html,
           engine_params_json = jsonb_build_object(
             'origin', 'LF_ESTRELA_OFFICIAL',
             'published_channel', 'production',
             'source_commit', '${params.sourceCommit}',
             'html_sha256', '${params.htmlSha256}'
           ),
           updated_at = timezone('utc'::text, now())
     WHERE id = v_draft_id
       AND model_id = v_model_id
       AND status = 'draft'
       AND version = 0;
  END IF;

  SELECT v.content_html
    INTO v_published_html
  FROM public.company_contract_model_versions v
  WHERE v.model_id = v_model_id
    AND v.status = 'published'
  ORDER BY v.version DESC
  LIMIT 1;

  IF v_published_html IS NULL
     OR v_published_html IS DISTINCT FROM v_html THEN
    SELECT COALESCE(MAX(v.version), 0) + 1
      INTO v_next
    FROM public.company_contract_model_versions v
    WHERE v.model_id = v_model_id
      AND v.status = 'published';

    INSERT INTO public.company_contract_model_versions (
      model_id,
      company_id,
      version,
      status,
      content_html,
      engine_params_json,
      published_at,
      updated_at
    ) VALUES (
      v_model_id,
      v_company_id,
      v_next,
      'published',
      v_html,
      jsonb_build_object(
        'origin', 'LF_ESTRELA_OFFICIAL',
        'published_channel', 'production',
        'source_commit', '${params.sourceCommit}',
        'html_sha256', '${params.htmlSha256}'
      ),
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    );
  END IF;

  INSERT INTO public.project_contract_model_links (
    project_id,
    company_id,
    company_contract_model_id,
    is_project_default
  )
  SELECT v_project_id, v_company_id, v_model_id, false
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.project_contract_model_links l
    WHERE l.project_id = v_project_id
      AND l.company_contract_model_id = v_model_id
  );

  IF EXISTS (
    SELECT 1
    FROM public.project_contract_model_links l
    WHERE l.company_contract_model_id = v_model_id
      AND l.project_id IS DISTINCT FROM v_project_id
  ) THEN
    RAISE EXCEPTION 'ABORT: modelo LF ESTRELA já está associado a outro empreendimento';
  END IF;

  RAISE NOTICE 'LF ESTRELA PRODUCTION publicado. company=% (%) project=% (%) model=% is_project_default permanece o valor já gravado no link (INSERT só com false se o link era novo)',
    v_company_id, v_company_name, v_project_id, v_project_name, v_model_id;
END
$${PRODUCTION_BODY_TAG}$;

COMMIT;`;
}

function rollbackSql(): string {
  return `-- =============================================================================
-- ROLLBACK SEGURO — só se AINDA NÃO existirem vendas/contratos usando o CUSTOM
-- Remove somente o vínculo LF ESTRELA ↔ CHACREAMENTO ESTRELA DO SUL.
-- Arquiva o modelo user se não houver mais links nem FKs.
-- NUNCA apaga ESTRELA_DO_SUL system_seed.
-- NUNCA altera sales/contracts/projects.contract_model.
-- NÃO desabilita trigger.
-- =============================================================================

BEGIN;

DO $${PRODUCTION_ROLLBACK_TAG}$
DECLARE
  v_candidate_count int;
  v_project_id uuid;
  v_company_id uuid;
  v_model_id uuid;
  v_sale_count int;
  v_contract_count int;
  v_sale_version_count int;
  v_contract_version_count int;
  v_other_links int;
BEGIN
  SELECT count(*)::int
    INTO v_candidate_count
  FROM public.projects p
  WHERE ${NAME_NORM} = '${PRODUCTION_PROJECT_NAME}';

  IF COALESCE(v_candidate_count, 0) <> 1 THEN
    RAISE EXCEPTION 'ABORT rollback: esperava 1 empreendimento % (count=%)',
      '${PRODUCTION_PROJECT_NAME}', COALESCE(v_candidate_count, 0);
  END IF;

  SELECT p.id, public.project_company_uuid(p.*)
    INTO v_project_id, v_company_id
  FROM public.projects p
  WHERE ${NAME_NORM} = '${PRODUCTION_PROJECT_NAME}';

  IF v_project_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'ABORT rollback: project_company_uuid NULL';
  END IF;

  SELECT m.id
    INTO v_model_id
  FROM public.company_contract_models m
  WHERE m.company_id = v_company_id
    AND m.source = 'user'
    AND m.catalog_code = '${LF_ESTRELA_CATALOG_CODE}'
    AND upper(btrim(regexp_replace(m.name, '\\s+', ' ', 'g'))) = '${LF_ESTRELA_MODEL_NAME}'
  ORDER BY m.created_at
  LIMIT 1;

  IF v_model_id IS NULL THEN
    RAISE NOTICE 'Rollback: modelo LF ESTRELA user não encontrado — nada a fazer';
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_sale_count
  FROM public.sales
  WHERE company_contract_model_id = v_model_id;

  SELECT count(*)::int INTO v_contract_count
  FROM public.contracts
  WHERE company_contract_model_id = v_model_id;

  SELECT count(*)::int INTO v_sale_version_count
  FROM public.sales
  WHERE company_contract_model_version_id IN (
    SELECT id FROM public.company_contract_model_versions WHERE model_id = v_model_id
  );

  SELECT count(*)::int INTO v_contract_version_count
  FROM public.contracts
  WHERE company_contract_model_version_id IN (
    SELECT id FROM public.company_contract_model_versions WHERE model_id = v_model_id
  );

  IF v_sale_count > 0
     OR v_contract_count > 0
     OR v_sale_version_count > 0
     OR v_contract_version_count > 0 THEN
    RAISE EXCEPTION
      'ABORT rollback: já existem vendas/contratos usando LF ESTRELA (sales=% contracts=% sale_versions=% contract_versions=%). Não remover.',
      v_sale_count, v_contract_count, v_sale_version_count, v_contract_version_count;
  END IF;

  DELETE FROM public.project_contract_model_links
  WHERE project_id = v_project_id
    AND company_contract_model_id = v_model_id
    AND company_id = v_company_id;

  SELECT count(*)::int INTO v_other_links
  FROM public.project_contract_model_links
  WHERE company_contract_model_id = v_model_id;

  IF v_other_links = 0 THEN
    UPDATE public.company_contract_models
       SET status = 'archived',
           is_company_default = false,
           updated_at = timezone('utc'::text, now())
     WHERE id = v_model_id
       AND company_id = v_company_id
       AND source = 'user'
       AND catalog_code = '${LF_ESTRELA_CATALOG_CODE}';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_contract_models m
    WHERE m.source = 'system_seed'
      AND m.catalog_code = 'ESTRELA_DO_SUL'
      AND m.company_id = v_company_id
      AND m.status IS DISTINCT FROM 'active'
  ) THEN
    RAISE EXCEPTION 'ABORT rollback: system_seed ESTRELA_DO_SUL não pode ter sido alterado';
  END IF;

  RAISE NOTICE 'Rollback LF ESTRELA: link removido project=% model=% archived_if_unused=%',
    v_project_id, v_model_id, (v_other_links = 0);
END
$${PRODUCTION_ROLLBACK_TAG}$;

COMMIT;`;
}

export type ProductionSqlBundle = {
  diagnose: string;
  publish: string;
  verify: string;
  rollback: string;
  htmlSha256: string;
  htmlMd5: string;
  htmlChars: number;
  sourceCommit: string;
};

export function buildProductionSqlBundle(input: {
  html: string;
  htmlSha256: string;
  sourceCommit: string;
}): ProductionSqlBundle {
  const htmlMd5 = md5Utf8(input.html);
  const diagnose = `${header('diagnose')}

${diagnosticSelect()}
`;
  const verify = `${header('verify')}

${verifySelect({
    htmlSha256: input.htmlSha256,
    htmlMd5,
    htmlChars: input.html.length,
  })}
`;
  const publish = `${header('publish')}

-- Rode ANTES, sozinho: scripts/production/sql/diagnose-lf-estrela.production.sql

${diagnosticSelect()}

${publishBody({
    html: input.html,
    htmlSha256: input.htmlSha256,
    sourceCommit: input.sourceCommit,
  })}

${verifySelect({
    htmlSha256: input.htmlSha256,
    htmlMd5,
    htmlChars: input.html.length,
  })}
`;
  const rollback = `${header('rollback')}

${rollbackSql()}
`;

  for (const [label, sql] of [
    ['diagnose', diagnose],
    ['publish', publish],
    ['verify', verify],
    ['rollback', rollback],
  ] as const) {
    assertProductionSqlSafety(sql, label);
  }

  return {
    diagnose,
    publish,
    verify,
    rollback,
    htmlSha256: input.htmlSha256,
    htmlMd5,
    htmlChars: input.html.length,
    sourceCommit: input.sourceCommit,
  };
}

function header(kind: 'diagnose' | 'publish' | 'verify' | 'rollback'): string {
  const titles = {
    diagnose: 'DIAGNÓSTICO SOMENTE LEITURA',
    publish: 'PUBLICAÇÃO LF ESTRELA',
    verify: 'VERIFICAÇÃO PÓS-PUBLICAÇÃO',
    rollback: 'ROLLBACK SEGURO',
  };
  return `-- =============================================================================
-- PRODUCTION — ${titles[kind]}
-- Destino: aezktedncttwpqeunjej
-- NÃO executar no DEVELOP hoynysmynxncdlptuzub
-- NÃO reutiliza UUID de empreendimento/empresa de outro ambiente
-- Resolve CHACREAMENTO ESTRELA DO SUL pelo nome normalizado no banco onde rodar
-- NÃO altera projects.company_id / tenant_id / contract_model
-- NÃO desabilita trigger (incluindo trg_project_contract_model_link_tenant)
-- NÃO desabilita RLS
-- NÃO apaga ESTRELA_DO_SUL system_seed
-- Pressupõe migrations:
--   20261028120000_contract_model_central_foundation.sql
--   20261028121000_contract_model_version_draft_history.sql
--   20261028122000_delete_company_contract_model.sql
--   20261029120000_customers_nationality_companies_creci.sql
-- =============================================================================`;
}

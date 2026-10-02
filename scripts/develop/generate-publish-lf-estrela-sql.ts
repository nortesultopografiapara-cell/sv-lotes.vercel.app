/**
 * Gera o SQL DEVELOP para criar/publicar LF ESTRELA v1 (SQL Editor).
 * Não executa no banco. Não usa service role.
 *
 * npx tsx scripts/develop/generate-publish-lf-estrela-sql.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  LF_ESTRELA_CATALOG_CODE,
  LF_ESTRELA_ENGINE_KEY,
  LF_ESTRELA_MODEL_NAME,
  assertNoLfEstrelaPageMarkers,
  buildLfEstrelaCustomHtml,
} from '../../lib/lfEstrelaCustomTemplate';

const PROJECT_ID = '760c32d8-4c43-403b-986c-9872011f44cd';
const HTML_TAG = 'lf_estrela_html_v1';
const BODY_TAG = 'publish_lf_estrela';
const OUT = join(__dirname, 'sql', 'publish-lf-estrela-v1.develop.sql');
const UUID_RE = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

function main() {
  const html = buildLfEstrelaCustomHtml();
  assertNoLfEstrelaPageMarkers(html, 'SQL LF ESTRELA v1');
  if (html.includes(`$${HTML_TAG}$`) || html.includes(`$${BODY_TAG}$`)) {
    throw new Error('HTML contém o delimitador dollar-quote — recusar geração.');
  }
  if (!html.includes('data-sv-if="spouse"') || !html.includes('{{PARTNERSHIP_NOTE}}')) {
    throw new Error('HTML oficial incompleto (cônjuge / PARTNERSHIP_NOTE).');
  }

  const sql = `-- =============================================================================
-- DEVELOP ONLY — projeto hoynysmynxncdlptuzub
-- SQL Editor: https://supabase.com/dashboard/project/hoynysmynxncdlptuzub/sql
-- NÃO executar em Production aezktedncttwpqeunjej
-- NÃO altera projects.company_id
-- NÃO altera projects.contract_model (legado NULL / herda empresa)
-- NÃO apaga Estrela do Sul / system_seed
-- NÃO marca LF ESTRELA como padrão (o usuário seleciona no dropdown e salva)
-- Empresa: mesma origem do GIS (company_id || tenant_id) + relações reais do project_id
-- HTML oficial do commit b346e09 (buildLfEstrelaCustomHtml)
-- =============================================================================

BEGIN;

DO $${BODY_TAG}$
DECLARE
  v_company_id uuid;
  v_company_name text;
  v_origin text;
  v_project_id uuid := '${PROJECT_ID}'::uuid;
  v_project_name text;
  v_project_model text;
  v_project_company_col text;
  v_project_tenant_col text;
  v_project_company_uuid uuid;
  v_candidate_count int;
  v_candidate_dump text;
  v_bypass_trigger boolean := false;
  v_model_id uuid;
  v_draft_id uuid;
  v_published_html text;
  v_next integer;
  v_html text := $${HTML_TAG}$
${html}
$${HTML_TAG}$;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = v_project_id
  ) THEN
    RAISE EXCEPTION 'DEVELOP: project_id % não encontrado', v_project_id;
  END IF;

  SELECT
    p.name,
    p.contract_model::text,
    nullif(btrim(to_jsonb(p)->>'company_id'), ''),
    nullif(btrim(to_jsonb(p)->>'tenant_id'), '')
  INTO v_project_name, v_project_model, v_project_company_col, v_project_tenant_col
  FROM public.projects p
  WHERE p.id = v_project_id;

  IF v_project_name IS NULL OR v_project_name !~* 'estrela' THEN
    RAISE EXCEPTION
      'ABORT: project_id % não é CHACREAMENTO ESTRELA DO SUL (nome=%)',
      v_project_id, v_project_name;
  END IF;

  BEGIN
    SELECT public.project_company_uuid(p.*)
      INTO v_project_company_uuid
    FROM public.projects p
    WHERE p.id = v_project_id;
  EXCEPTION WHEN undefined_function THEN
    v_project_company_uuid := NULL;
  END;

  CREATE TEMP TABLE IF NOT EXISTS lf_estrela_company_hits (
    company_id uuid NOT NULL,
    origin text NOT NULL
  ) ON COMMIT DROP;
  DELETE FROM lf_estrela_company_hits;

  IF v_project_company_uuid IS NOT NULL THEN
    INSERT INTO lf_estrela_company_hits(company_id, origin)
    VALUES (
      v_project_company_uuid,
      'project_company_uuid (GIS oficial: projects.company_id || projects.tenant_id)'
    );
  END IF;

  IF v_project_company_col ~* '${UUID_RE}' THEN
    INSERT INTO lf_estrela_company_hits(company_id, origin)
    VALUES (v_project_company_col::uuid, 'projects.company_id');
  END IF;

  IF v_project_tenant_col ~* '${UUID_RE}' THEN
    INSERT INTO lf_estrela_company_hits(company_id, origin)
    VALUES (
      v_project_tenant_col::uuid,
      'projects.tenant_id (filtro GIS: tenant_id OR company_id)'
    );
  END IF;

  BEGIN
    INSERT INTO lf_estrela_company_hits(company_id, origin)
    SELECT DISTINCT x.id, 'sales.company_id/tenant_id do project_id'
    FROM (
      SELECT NULLIF(btrim(to_jsonb(s)->>'company_id'), '') AS raw
      FROM public.sales s
      WHERE s.project_id = v_project_id
      UNION ALL
      SELECT NULLIF(btrim(to_jsonb(s)->>'tenant_id'), '')
      FROM public.sales s
      WHERE s.project_id = v_project_id
    ) t
    CROSS JOIN LATERAL (
      SELECT t.raw::uuid AS id
      WHERE t.raw ~* '${UUID_RE}'
    ) x;
  EXCEPTION WHEN undefined_table OR undefined_column OR invalid_text_representation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO lf_estrela_company_hits(company_id, origin)
    SELECT DISTINCT x.id, 'blocks.tenant_id/company_id do project_id'
    FROM (
      SELECT NULLIF(btrim(to_jsonb(b)->>'tenant_id'), '') AS raw
      FROM public.blocks b
      WHERE b.project_id = v_project_id
      UNION ALL
      SELECT NULLIF(btrim(to_jsonb(b)->>'company_id'), '')
      FROM public.blocks b
      WHERE b.project_id = v_project_id
    ) t
    CROSS JOIN LATERAL (
      SELECT t.raw::uuid AS id
      WHERE t.raw ~* '${UUID_RE}'
    ) x;
  EXCEPTION WHEN undefined_table OR undefined_column OR invalid_text_representation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO lf_estrela_company_hits(company_id, origin)
    SELECT DISTINCT opa.tenant_id, 'owner_project_access.tenant_id'
    FROM public.owner_project_access opa
    WHERE opa.project_id = v_project_id
      AND opa.tenant_id IS NOT NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    INSERT INTO lf_estrela_company_hits(company_id, origin)
    SELECT DISTINCT cfg.company_id, 'project_revenue_split_configs.company_id'
    FROM public.project_revenue_split_configs cfg
    WHERE cfg.project_id = v_project_id
      AND cfg.company_id IS NOT NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    INSERT INTO lf_estrela_company_hits(company_id, origin)
    SELECT DISTINCT fa.company_id, 'company_financial_accounts via projects.financial_account_id'
    FROM public.projects p
    JOIN public.company_financial_accounts fa
      ON fa.id::text = NULLIF(btrim(to_jsonb(p)->>'financial_account_id'), '')
    WHERE p.id = v_project_id
      AND fa.company_id IS NOT NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  DELETE FROM lf_estrela_company_hits h
  WHERE NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.id = h.company_id
  );

  IF v_project_company_uuid IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_project_company_uuid) THEN
    v_company_id := v_project_company_uuid;
    v_origin := 'project_company_uuid (GIS oficial: projects.company_id || projects.tenant_id)';
  ELSE
    SELECT COUNT(DISTINCT h.company_id), string_agg(DISTINCT h.company_id::text || ' ← ' || h.origin, ' | ')
      INTO v_candidate_count, v_candidate_dump
    FROM lf_estrela_company_hits h;

    IF COALESCE(v_candidate_count, 0) = 1 THEN
      SELECT h.company_id, string_agg(DISTINCT h.origin, ' + ')
        INTO v_company_id, v_origin
      FROM lf_estrela_company_hits h
      GROUP BY h.company_id;
      v_bypass_trigger := (v_project_company_uuid IS NULL);
    ELSIF COALESCE(v_candidate_count, 0) = 0 THEN
      RAISE EXCEPTION
        'ABORT: não foi possível determinar a empresa do project_id %. projects.company_id=% projects.tenant_id=% contract_model=%. Nenhuma relação sales/blocks/owner/split/conta financeira apontou para uma companies.id.',
        v_project_id, v_project_company_col, v_project_tenant_col, v_project_model;
    ELSE
      RAISE EXCEPTION
        'ABORT: empresa ambígua para project_id %. candidatos=%',
        v_project_id, v_candidate_dump;
    END IF;
  END IF;

  SELECT c.name INTO v_company_name
  FROM public.companies c
  WHERE c.id = v_company_id;

  IF v_company_id IS NULL OR v_company_name IS NULL THEN
    RAISE EXCEPTION 'ABORT: company_id resolvido não existe em companies';
  END IF;

  RAISE NOTICE 'VALIDAÇÃO LF ESTRELA — project_id=% project_name=% projects.company_id=% projects.tenant_id=% projects.contract_model=% company_id=% company_name=% origem=% bypass_trigger=%',
    v_project_id,
    v_project_name,
    v_project_company_col,
    v_project_tenant_col,
    v_project_model,
    v_company_id,
    v_company_name,
    v_origin,
    v_bypass_trigger;

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
        'published_channel', 'develop',
        'source_commit', 'b346e09'
      ),
      timezone('utc'::text, now())
    );
  ELSE
    UPDATE public.company_contract_model_versions
       SET content_html = v_html,
           engine_params_json = jsonb_build_object(
             'origin', 'LF_ESTRELA_OFFICIAL',
             'published_channel', 'develop',
             'source_commit', 'b346e09'
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
        'published_channel', 'develop',
        'source_commit', 'b346e09'
      ),
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    );
  END IF;

  BEGIN
    IF v_bypass_trigger THEN
      EXECUTE 'ALTER TABLE public.project_contract_model_links DISABLE TRIGGER trg_project_contract_model_link_tenant';
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

    IF v_bypass_trigger THEN
      EXECUTE 'ALTER TABLE public.project_contract_model_links ENABLE TRIGGER trg_project_contract_model_link_tenant';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF v_bypass_trigger THEN
      EXECUTE 'ALTER TABLE public.project_contract_model_links ENABLE TRIGGER trg_project_contract_model_link_tenant';
    END IF;
    RAISE;
  END;

  RAISE NOTICE 'LF ESTRELA publicado. company=% (%) project=% origem=% model=%',
    v_company_id, v_company_name, v_project_id, v_origin, v_model_id;
END
$${BODY_TAG}$;

COMMIT;

-- Verificação (rodar após o bloco acima)
SELECT
  m.id AS model_id,
  m.name,
  m.catalog_code,
  m.engine_key,
  m.source,
  m.status,
  v.version AS published_version,
  v.status AS version_status,
  (v.content_html LIKE '%data-sv-if="spouse"%') AS has_spouse_if,
  (v.content_html LIKE '%class="sv-lf-sign %' OR v.content_html LIKE '%class="sv-lf-sign"%') AS has_flex_sign,
  (v.content_html LIKE '%sv-lf-note%') AS has_note_7pt_class,
  (v.content_html LIKE '%sv-a4-flow-gap%' OR v.content_html LIKE '%sv-page-break%') AS has_pagination_markers,
  (v.content_html LIKE '%{{PARTNERSHIP_NOTE}}%') AS has_partnership_note,
  (v.content_html NOT LIKE '%[SEM DADO%') AS template_sem_dado_ausente,
  p.id AS project_id,
  p.name AS project_name,
  p.contract_model AS project_engine,
  l.company_id AS link_company_id,
  l.is_project_default
FROM public.company_contract_models m
JOIN public.company_contract_model_versions v
  ON v.model_id = m.id
 AND v.status = 'published'
LEFT JOIN public.project_contract_model_links l
  ON l.company_contract_model_id = m.id
 AND l.project_id = '${PROJECT_ID}'::uuid
LEFT JOIN public.projects p
  ON p.id = l.project_id
WHERE m.name = '${LF_ESTRELA_MODEL_NAME}'
ORDER BY v.version DESC;
`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, sql, 'utf8');
  console.log(JSON.stringify({ out: OUT, htmlChars: html.length }, null, 2));
}

main();

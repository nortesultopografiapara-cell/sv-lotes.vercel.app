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

const COMPANY_HINT = '3052a000-e8b9-43a4-b8ab-91a4392ffcbc';
const PROJECT_HINT = '760c32d8-4c43-403b-986c-9872011f44cd';
const HTML_TAG = 'lf_estrela_html_v1';
const BODY_TAG = 'publish_lf_estrela';
const OUT = join(__dirname, 'sql', 'publish-lf-estrela-v1.develop.sql');

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
-- NÃO altera projects.contract_model (motor ESTRELA_DO_SUL permanece)
-- NÃO apaga Estrela do Sul / system_seed
-- NÃO marca LF ESTRELA como padrão (o usuário seleciona no dropdown e salva)
-- HTML oficial do commit b346e09 (buildLfEstrelaCustomHtml)
-- =============================================================================

BEGIN;

DO $${BODY_TAG}$
DECLARE
  v_company_id uuid;
  v_project_id uuid;
  v_project_name text;
  v_project_model text;
  v_model_id uuid;
  v_draft_id uuid;
  v_published_html text;
  v_next integer;
  v_html text := $${HTML_TAG}$
${html}
$${HTML_TAG}$;
BEGIN
  SELECT c.id
    INTO v_company_id
  FROM public.companies c
  WHERE c.id = '${COMPANY_HINT}'::uuid
  LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT c.id
      INTO v_company_id
    FROM public.companies c
    WHERE c.name ILIKE '%L.F.%'
       OR c.fantasy_name ILIKE '%L.F.%'
       OR c.name ILIKE '%ESTRELA DO SUL%'
       OR c.fantasy_name ILIKE '%ESTRELA DO SUL%'
    ORDER BY c.created_at
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'DEVELOP: company_id da L.F. / Estrela do Sul não encontrado';
  END IF;

  SELECT p.id, p.name, p.contract_model
    INTO v_project_id, v_project_name, v_project_model
  FROM public.projects p
  WHERE p.company_id = v_company_id
    AND p.id = '${PROJECT_HINT}'::uuid
  LIMIT 1;

  IF v_project_id IS NULL THEN
    SELECT p.id, p.name, p.contract_model
      INTO v_project_id, v_project_name, v_project_model
    FROM public.projects p
    WHERE p.company_id = v_company_id
      AND (
        p.name ILIKE 'CHACREAMENTO ESTRELA DO SUL'
        OR p.name ILIKE '%ESTRELA DO SUL%'
      )
    ORDER BY p.created_at
    LIMIT 1;
  END IF;

  IF v_project_id IS NULL OR v_project_name IS NULL OR v_project_name !~* 'estrela' THEN
    RAISE EXCEPTION 'DEVELOP: empreendimento CHACREAMENTO ESTRELA DO SUL não encontrado';
  END IF;

  IF upper(trim(coalesce(v_project_model, ''))) IS DISTINCT FROM 'ESTRELA_DO_SUL' THEN
    RAISE EXCEPTION
      'ABORT: motor do empreendimento não é ESTRELA_DO_SUL (atual=%)',
      v_project_model;
  END IF;

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

  RAISE NOTICE 'LF ESTRELA publicado. company=% project=% model=%',
    v_company_id, v_project_id, v_model_id;
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
  l.is_project_default
FROM public.company_contract_models m
JOIN public.company_contract_model_versions v
  ON v.model_id = m.id
 AND v.status = 'published'
LEFT JOIN public.project_contract_model_links l
  ON l.company_contract_model_id = m.id
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

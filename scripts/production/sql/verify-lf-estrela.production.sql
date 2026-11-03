-- =============================================================================
-- PRODUCTION — VERIFICAÇÃO PÓS-PUBLICAÇÃO
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
-- =============================================================================

-- =============================================================================
-- PASSO 3 — VERIFICAÇÃO PÓS-PUBLICAÇÃO
-- Esperado ANTES da seleção no GIS:
--   is_project_default = false
--   project_engine = ESTRELA_DO_SUL (ou NULL legado; o SQL NÃO altera essa coluna)
-- html_md5_matches_official = true
-- expected_html_sha256 = 5200b78d4b544d55b4b09e27210e85a0dbc60958e82090a7820acae9c8db7441
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
  (length(v.content_html) = 53703) AS html_length_match,
  md5(v.content_html) AS html_md5,
  (md5(v.content_html) = 'cd9044da8081a2a5a42788f074d7e06e') AS html_md5_matches_official,
  '5200b78d4b544d55b4b09e27210e85a0dbc60958e82090a7820acae9c8db7441' AS expected_html_sha256,
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
WHERE m.name = 'LF ESTRELA'
  AND m.source = 'user'
  AND m.catalog_code = 'CUSTOM'
ORDER BY v.version DESC, m.created_at;

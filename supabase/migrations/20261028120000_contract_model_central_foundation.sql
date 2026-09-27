-- Central de Modelos de Contrato — Etapa 1 (fundação aditiva)
-- Idempotente: pode ser reexecutada após falha parcial (CREATE IF NOT EXISTS,
--     ADD COLUMN IF NOT EXISTS, ON CONFLICT DO NOTHING, DROP POLICY IF EXISTS).
-- NÃO altera contracts.generated_html, html_content, contract_html, content, html.
-- NÃO altera projects.seller_parties_json, sales.lf_contract_snapshot_json,
--     companies.contract_second_vendor_json.
-- NÃO remove/renomeia companies.contract_model, projects.contract_model,
--     sales.contract_model, contracts.contract_model.
-- Sem backfill de HTML. Sem UPDATE em contratos históricos.
-- public.contract_templates é opcional: se não existir, a importação legado
--     é ignorada e a Central é criada mesmo assim. NÃO criar essa tabela.

-- ---------------------------------------------------------------------------
-- Catálogo do sistema (motores TypeScript existentes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_model_catalog (
  code text PRIMARY KEY,
  label text NOT NULL,
  engine_key text NOT NULL,
  is_system_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.contract_model_catalog IS
  'Catálogo de motores de contrato homologados. O texto jurídico permanece nos módulos TypeScript; esta tabela só referencia o código/engine.';

INSERT INTO public.contract_model_catalog (code, label, engine_key, is_system_default, sort_order)
VALUES
  ('PADRAO', 'Padrão SV LOTES', 'classic', true, 10),
  ('MENESES', 'Meneses', 'classic_meneses', false, 20),
  ('SV_LOTES_2', 'SV LOTES 2.0 (RECOMENDADO)', 'sv_lotes_2', false, 30),
  ('RECANTO_PRIMAVERA', 'Recanto Primavera', 'recanto_primavera', false, 40),
  ('ARAGUAIA', 'Chacreamento Araguaia', 'araguaia', false, 50),
  ('MUNDO_NOVO', 'Chacreamento Mundo Novo', 'mundo_novo', false, 60),
  ('ESTRELA_DO_SUL', 'LF Imóveis', 'estrela_do_sul', false, 70),
  ('CUSTOM', 'Personalizado (futuro)', 'custom', false, 90)
ON CONFLICT (code) DO UPDATE
SET
  label = EXCLUDED.label,
  engine_key = EXCLUDED.engine_key,
  is_system_default = EXCLUDED.is_system_default,
  sort_order = EXCLUDED.sort_order;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_model_catalog_one_system_default
  ON public.contract_model_catalog ((true))
  WHERE is_system_default = true;

-- ---------------------------------------------------------------------------
-- Instâncias por empresa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_contract_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  catalog_code text NOT NULL REFERENCES public.contract_model_catalog(code),
  engine_key text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  source text NOT NULL DEFAULT 'system_seed'
    CHECK (source IN ('system_seed', 'legacy_template', 'user')),
  is_company_default boolean NOT NULL DEFAULT false,
  source_template_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT company_contract_models_name_chk CHECK (length(trim(name)) > 0),
  CONSTRAINT company_contract_models_tenant_match_chk CHECK (tenant_id = company_id)
);

COMMENT ON TABLE public.company_contract_models IS
  'Instâncias de modelo de contrato por empresa. CUSTOM legado não gera contrato GIS nesta etapa.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_contract_models_system_seed_code
  ON public.company_contract_models (company_id, catalog_code)
  WHERE source = 'system_seed';

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_contract_models_source_template
  ON public.company_contract_models (source_template_id)
  WHERE source_template_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_contract_models_one_company_default
  ON public.company_contract_models (company_id)
  WHERE is_company_default = true AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_company_contract_models_company_status
  ON public.company_contract_models (company_id, status);

-- ---------------------------------------------------------------------------
-- Versões publicadas (histórico do modelo da empresa)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_contract_model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES public.company_contract_models(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  content_html text NULL,
  engine_params_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT company_contract_model_versions_unique UNIQUE (model_id, version)
);

COMMENT ON TABLE public.company_contract_model_versions IS
  'Versionamento do modelo da empresa. content_html só para CUSTOM/legado; motores TS não copiam cláusulas jurídicas para o banco nesta etapa.';

CREATE INDEX IF NOT EXISTS idx_company_contract_model_versions_model
  ON public.company_contract_model_versions (model_id, version DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_contract_model_versions_one_published
  ON public.company_contract_model_versions (model_id)
  WHERE status = 'published';

-- ---------------------------------------------------------------------------
-- Vínculos opcionais modelo × empreendimento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_contract_model_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_contract_model_id uuid NOT NULL REFERENCES public.company_contract_models(id) ON DELETE CASCADE,
  is_project_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT project_contract_model_links_unique UNIQUE (project_id, company_contract_model_id)
);

COMMENT ON TABLE public.project_contract_model_links IS
  'Associação opcional de um modelo da empresa a um ou mais empreendimentos. Apenas um padrão por empreendimento.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_contract_model_links_one_default
  ON public.project_contract_model_links (project_id)
  WHERE is_project_default = true;

CREATE INDEX IF NOT EXISTS idx_project_contract_model_links_company
  ON public.project_contract_model_links (company_id, project_id);

CREATE INDEX IF NOT EXISTS idx_project_contract_model_links_model
  ON public.project_contract_model_links (company_contract_model_id);

-- ---------------------------------------------------------------------------
-- Snapshot FKs nullable em sales/contracts (sem preencher históricos)
-- ---------------------------------------------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS company_contract_model_id uuid NULL
    REFERENCES public.company_contract_models(id) ON DELETE SET NULL;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS company_contract_model_version_id uuid NULL
    REFERENCES public.company_contract_model_versions(id) ON DELETE SET NULL;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS company_contract_model_id uuid NULL
    REFERENCES public.company_contract_models(id) ON DELETE SET NULL;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS company_contract_model_version_id uuid NULL
    REFERENCES public.company_contract_model_versions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sales.company_contract_model_id IS
  'FK opcional para a instância da Central usada na venda. NULL = venda anterior à Central; usar sales.contract_model texto.';
COMMENT ON COLUMN public.sales.company_contract_model_version_id IS
  'FK opcional da versão publicada usada na venda. NULL = venda anterior à Central.';
COMMENT ON COLUMN public.contracts.company_contract_model_id IS
  'FK opcional da instância da Central nesta versão do contrato. NULL = contrato histórico; usar contracts.contract_model texto. Não altera generated_html.';
COMMENT ON COLUMN public.contracts.company_contract_model_version_id IS
  'FK opcional da versão do modelo nesta versão do contrato. NULL = contrato histórico.';

CREATE INDEX IF NOT EXISTS idx_sales_company_contract_model_id
  ON public.sales (company_contract_model_id)
  WHERE company_contract_model_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_company_contract_model_id
  ON public.contracts (company_contract_model_id)
  WHERE company_contract_model_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Normalização alinhada a lib/contractModel.ts (seed apenas)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_sale_contract_model(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  value text;
BEGIN
  value := upper(trim(replace(replace(coalesce(raw, ''), '-', '_'), ' ', '_')));
  IF value IS NULL OR value = '' THEN
    RETURN 'PADRAO';
  END IF;
  IF value IN ('SV_LOTES_2', 'SV_LOTES_20')
     OR position('SV_LOTES_2' in value) > 0
     OR position('2_0' in value) > 0 THEN
    RETURN 'SV_LOTES_2';
  END IF;
  IF value = 'RECANTO_PRIMAVERA' OR position('RECANTO' in value) > 0 THEN
    RETURN 'RECANTO_PRIMAVERA';
  END IF;
  IF value = 'MENESES' THEN
    RETURN 'MENESES';
  END IF;
  IF value IN ('MUNDO_NOVO', 'CHACREAMENTO_MUNDO_NOVO')
     OR position('MUNDO_NOVO' in value) > 0 THEN
    RETURN 'MUNDO_NOVO';
  END IF;
  IF value IN ('ARAGUAIA', 'CHACREAMENTO_ARAGUAIA')
     OR position('ARAGUAIA' in value) > 0 THEN
    RETURN 'ARAGUAIA';
  END IF;
  IF value IN ('ESTRELA_DO_SUL', 'CHACREAMENTO_ESTRELA_DO_SUL')
     OR position('ESTRELA_DO_SUL' in value) > 0 THEN
    RETURN 'ESTRELA_DO_SUL';
  END IF;
  IF value IN ('CUSTOM', 'PERSONALIZADO') THEN
    RETURN 'CUSTOM';
  END IF;
  RETURN 'PADRAO';
END;
$$;

CREATE OR REPLACE FUNCTION public.project_company_uuid(p public.projects)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p.company_id IS NOT NULL
     AND p.company_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN p.company_id::uuid;
  END IF;
  IF p.tenant_id IS NOT NULL
     AND p.tenant_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN p.tenant_id::uuid;
  END IF;
  RETURN NULL;
END;
$$;

-- Isolamento: vínculo só no mesmo tenant
CREATE OR REPLACE FUNCTION public.enforce_project_contract_model_link_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  model_company uuid;
  project_company uuid;
BEGIN
  SELECT m.company_id INTO model_company
  FROM public.company_contract_models m
  WHERE m.id = NEW.company_contract_model_id;

  SELECT public.project_company_uuid(p.*) INTO project_company
  FROM public.projects p
  WHERE p.id = NEW.project_id;

  IF model_company IS NULL OR project_company IS NULL OR model_company IS DISTINCT FROM project_company THEN
    RAISE EXCEPTION 'project_contract_model_links cannot cross tenant';
  END IF;

  IF NEW.company_id IS DISTINCT FROM model_company THEN
    RAISE EXCEPTION 'project_contract_model_links.company_id must match the model company';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_contract_model_link_tenant ON public.project_contract_model_links;
CREATE TRIGGER trg_project_contract_model_link_tenant
  BEFORE INSERT OR UPDATE ON public.project_contract_model_links
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_project_contract_model_link_tenant();

CREATE OR REPLACE FUNCTION public.enforce_sale_contract_model_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  model_company uuid;
  sale_company uuid;
BEGIN
  IF NEW.company_contract_model_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.company_id INTO model_company
  FROM public.company_contract_models m
  WHERE m.id = NEW.company_contract_model_id;

  sale_company := COALESCE(
    NEW.company_id,
    CASE
      WHEN NEW.tenant_id IS NOT NULL
        AND NEW.tenant_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN NEW.tenant_id::uuid
      ELSE NULL
    END
  );

  IF model_company IS NULL OR sale_company IS NULL OR model_company IS DISTINCT FROM sale_company THEN
    RAISE EXCEPTION 'sales.company_contract_model_id cannot cross tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_contract_model_tenant ON public.sales;
CREATE TRIGGER trg_sales_contract_model_tenant
  BEFORE INSERT OR UPDATE OF company_contract_model_id ON public.sales
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_sale_contract_model_tenant();

CREATE OR REPLACE FUNCTION public.enforce_contract_row_model_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  model_company uuid;
  contract_company uuid;
BEGIN
  IF NEW.company_contract_model_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.company_id INTO model_company
  FROM public.company_contract_models m
  WHERE m.id = NEW.company_contract_model_id;

  contract_company := COALESCE(
    NEW.company_id,
    CASE
      WHEN NEW.tenant_id IS NOT NULL
        AND NEW.tenant_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN NEW.tenant_id::uuid
      ELSE NULL
    END
  );

  IF model_company IS NULL OR contract_company IS NULL OR model_company IS DISTINCT FROM contract_company THEN
    RAISE EXCEPTION 'contracts.company_contract_model_id cannot cross tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contracts_contract_model_tenant ON public.contracts;
CREATE TRIGGER trg_contracts_contract_model_tenant
  BEFORE INSERT OR UPDATE OF company_contract_model_id ON public.contracts
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_contract_row_model_tenant();

-- Versão precisa pertencer ao mesmo modelo/empresa
CREATE OR REPLACE FUNCTION public.enforce_contract_model_version_company()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  model_company uuid;
BEGIN
  SELECT m.company_id INTO model_company
  FROM public.company_contract_models m
  WHERE m.id = NEW.model_id;

  IF model_company IS NULL OR model_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'company_contract_model_versions cannot cross tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_contract_model_versions_tenant ON public.company_contract_model_versions;
CREATE TRIGGER trg_company_contract_model_versions_tenant
  BEFORE INSERT OR UPDATE ON public.company_contract_model_versions
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_contract_model_version_company();

-- ---------------------------------------------------------------------------
-- Seed: instâncias do catálogo por empresa (preserva companies.contract_model)
-- ---------------------------------------------------------------------------
INSERT INTO public.company_contract_models (
  company_id,
  tenant_id,
  catalog_code,
  engine_key,
  name,
  status,
  source,
  is_company_default
)
SELECT
  c.id,
  c.id,
  cat.code,
  cat.engine_key,
  cat.label,
  'active',
  'system_seed',
  public.normalize_sale_contract_model(c.contract_model) = cat.code
FROM public.companies c
CROSS JOIN public.contract_model_catalog cat
WHERE cat.code <> 'CUSTOM'
ON CONFLICT (company_id, catalog_code) WHERE source = 'system_seed' DO NOTHING;

-- Se a empresa está em CUSTOM, o padrão fica na instância legado abaixo.

INSERT INTO public.company_contract_model_versions (
  model_id,
  company_id,
  version,
  status,
  content_html,
  engine_params_json
)
SELECT
  m.id,
  m.company_id,
  1,
  'published',
  NULL,
  NULL
FROM public.company_contract_models m
WHERE m.source = 'system_seed'
ON CONFLICT (model_id, version) DO NOTHING;

-- Vínculo padrão do empreendimento somente quando projects.contract_model está preenchido
INSERT INTO public.project_contract_model_links (
  project_id,
  company_id,
  company_contract_model_id,
  is_project_default
)
SELECT
  p.id,
  m.company_id,
  m.id,
  true
FROM public.projects p
JOIN public.company_contract_models m
  ON m.company_id = public.project_company_uuid(p.*)
 AND m.catalog_code = public.normalize_sale_contract_model(p.contract_model)
 AND m.source = 'system_seed'
 AND m.status = 'active'
WHERE nullif(trim(p.contract_model), '') IS NOT NULL
  AND public.project_company_uuid(p.*) IS NOT NULL
ON CONFLICT (project_id, company_contract_model_id) DO NOTHING;

-- Importar contract_templates legado como CUSTOM (NÃO liga à geração GIS).
-- Proteção estrutural: referência estática a uma tabela inexistente falha no
-- parse. Só executa o SQL dependente se to_regclass achar a relação.
-- NÃO criar public.contract_templates se ela não existir.
DO $import_legacy_templates$
BEGIN
  IF to_regclass('public.contract_templates') IS NULL THEN
    RAISE NOTICE 'public.contract_templates ausente — importação legado ignorada';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_templates' AND column_name = 'id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_templates' AND column_name = 'tenant_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_templates' AND column_name = 'name'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contract_templates' AND column_name = 'content'
  ) THEN
    RAISE NOTICE 'public.contract_templates sem colunas esperadas — importação legado ignorada';
    RETURN;
  END IF;

  EXECUTE $legacy_models$
INSERT INTO public.company_contract_models (
  company_id,
  tenant_id,
  catalog_code,
  engine_key,
  name,
  status,
  source,
  is_company_default,
  source_template_id
)
SELECT
  t.tenant_id,
  t.tenant_id,
  'CUSTOM',
  'custom',
  COALESCE(nullif(trim(t.name), ''), 'Modelo personalizado'),
  'active',
  'legacy_template',
  false,
  t.id
FROM public.contract_templates t
JOIN public.companies c ON c.id = t.tenant_id
WHERE t.tenant_id IS NOT NULL
ON CONFLICT (source_template_id) WHERE source_template_id IS NOT NULL DO NOTHING
$legacy_models$;

  EXECUTE $legacy_versions$
INSERT INTO public.company_contract_model_versions (
  model_id,
  company_id,
  version,
  status,
  content_html,
  engine_params_json
)
SELECT
  m.id,
  m.company_id,
  1,
  'published',
  t.content,
  NULL
FROM public.company_contract_models m
JOIN public.contract_templates t ON t.id = m.source_template_id
WHERE m.source = 'legacy_template'
ON CONFLICT (model_id, version) DO NOTHING
$legacy_versions$;
END;
$import_legacy_templates$;

-- Empresa com contract_model CUSTOM: um legado vira padrão da empresa (não mexe em contratos emitidos)
UPDATE public.company_contract_models m
SET is_company_default = true
WHERE m.source = 'legacy_template'
  AND m.status = 'active'
  AND m.id IN (
    SELECT DISTINCT ON (c.id) m2.id
    FROM public.companies c
    JOIN public.company_contract_models m2
      ON m2.company_id = c.id
     AND m2.source = 'legacy_template'
     AND m2.status = 'active'
    WHERE public.normalize_sale_contract_model(c.contract_model) = 'CUSTOM'
      AND NOT EXISTS (
        SELECT 1
        FROM public.company_contract_models x
        WHERE x.company_id = c.id
          AND x.is_company_default = true
          AND x.status = 'active'
      )
    ORDER BY c.id, m2.created_at ASC
  );

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.contract_model_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_contract_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_contract_model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_contract_model_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_model_catalog_read ON public.contract_model_catalog;
CREATE POLICY contract_model_catalog_read
  ON public.contract_model_catalog
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS company_contract_models_tenant ON public.company_contract_models;
CREATE POLICY company_contract_models_tenant
  ON public.company_contract_models
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS company_contract_model_versions_tenant ON public.company_contract_model_versions;
CREATE POLICY company_contract_model_versions_tenant
  ON public.company_contract_model_versions
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

DROP POLICY IF EXISTS project_contract_model_links_tenant ON public.project_contract_model_links;
CREATE POLICY project_contract_model_links_tenant
  ON public.project_contract_model_links
  FOR ALL
  USING (public.is_super_admin() OR company_id = public.current_tenant_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_tenant_id());

GRANT SELECT ON TABLE public.contract_model_catalog TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_contract_models TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_contract_model_versions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_contract_model_links TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

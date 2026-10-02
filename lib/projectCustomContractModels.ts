/**
 * Modelos CUSTOM publicados vinculados a um empreendimento.
 * Usados no seletor "Modelo de contrato padrão" do GIS.
 * Não altera SALE_CONTRACT_MODEL_OPTIONS (motores TypeScript).
 *
 * A empresa do vínculo é a do empreendimento (company_id || tenant_id UUID),
 * não o tenant da sessão GIS/SUPER_ADMIN.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isLfEstrelaModelName } from '@/lib/lfEstrelaCustomTemplate';

export const PROJECT_CUSTOM_CONTRACT_VALUE_PREFIX = 'ccm:';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProjectCustomContractOption = {
  id: string;
  name: string;
  isProjectDefault: boolean;
  publishedVersion: number;
};

export type CustomContractModelsQueryError = {
  message: string;
  source: 'input' | 'links' | 'models' | 'versions';
};

export type CustomContractModelsQueryResult = {
  rows: ProjectCustomContractOption[];
  error: CustomContractModelsQueryError | null;
};

export function isUuid(value: string | null | undefined): boolean {
  return UUID_RE.test(String(value || '').trim());
}

/** Espelha public.project_company_uuid: company_id UUID, senão tenant_id UUID. */
export function resolveProjectCompanyUuid(project: {
  company_id?: unknown;
  tenant_id?: unknown;
} | null | undefined): string {
  const company = String(project?.company_id ?? '').trim();
  if (UUID_RE.test(company)) return company;
  const tenant = String(project?.tenant_id ?? '').trim();
  if (UUID_RE.test(tenant)) return tenant;
  return '';
}

export function isProjectCustomContractValue(value: string | null | undefined): boolean {
  return String(value || '').startsWith(PROJECT_CUSTOM_CONTRACT_VALUE_PREFIX);
}

export function formatProjectCustomContractValue(modelId: string): string {
  return `${PROJECT_CUSTOM_CONTRACT_VALUE_PREFIX}${String(modelId || '').trim()}`;
}

export function parseProjectCustomContractModelId(
  value: string | null | undefined,
): string | null {
  const raw = String(value || '').trim();
  if (!raw.startsWith(PROJECT_CUSTOM_CONTRACT_VALUE_PREFIX)) return null;
  const id = raw.slice(PROJECT_CUSTOM_CONTRACT_VALUE_PREFIX.length).trim();
  return id || null;
}

/** Overlay CUSTOM não grava `ccm:` em projects.contract_model — preserva o motor TS. */
export function engineContractModelForCustomOverlay(
  existingProjectModel: string | null | undefined,
): string {
  const existing = String(existingProjectModel || '').trim();
  if (!existing || isProjectCustomContractValue(existing)) return 'ESTRELA_DO_SUL';
  return existing;
}

export function customOptionShowsLfConfig(
  contractModel: string | null | undefined,
  options: ProjectCustomContractOption[],
): boolean {
  const id = parseProjectCustomContractModelId(contractModel);
  if (!id) return false;
  const selected = options.find((row) => row.id === id);
  return Boolean(selected && isLfEstrelaModelName(selected.name));
}

export function buildProjectCustomContractOptions(input: {
  projectCompanyUuid: string;
  links: Array<{
    company_contract_model_id?: unknown;
    is_project_default?: unknown;
    company_id?: unknown;
  }>;
  models: Array<{
    id?: unknown;
    name?: unknown;
    catalog_code?: unknown;
    engine_key?: unknown;
    status?: unknown;
    company_id?: unknown;
  }>;
  versions: Array<{
    model_id?: unknown;
    version?: unknown;
    status?: unknown;
  }>;
}): ProjectCustomContractOption[] {
  const projectCompany = String(input.projectCompanyUuid || '').trim();
  const latestByModel = new Map<string, number>();
  for (const row of input.versions) {
    if (String(row.status || '') !== 'published') continue;
    const id = String(row.model_id || '');
    if (!id || latestByModel.has(id)) continue;
    latestByModel.set(id, Number(row.version) || 0);
  }

  return input.models
    .map((model) => {
      const id = String(model.id || '');
      if (!id) return null;
      if (String(model.catalog_code || '') !== 'CUSTOM') return null;
      if (String(model.engine_key || '') !== 'custom') return null;
      if (String(model.status || '') !== 'active') return null;
      if (projectCompany && String(model.company_id || '') !== projectCompany) return null;
      const publishedVersion = latestByModel.get(id) || 0;
      if (publishedVersion < 1) return null;
      const link = input.links.find((row) => String(row.company_contract_model_id) === id);
      if (!link) return null;
      if (projectCompany && String(link.company_id || '') !== projectCompany) return null;
      return {
        id,
        name: String(model.name || '').trim() || 'Personalizado',
        isProjectDefault: Boolean(link.is_project_default),
        publishedVersion,
      };
    })
    .filter((row): row is ProjectCustomContractOption => Boolean(row));
}

export async function queryPublishedCustomModelsLinkedToProject(
  supabase: SupabaseClient,
  companyId: string,
  projectId: string,
): Promise<CustomContractModelsQueryResult> {
  const projectCompanyUuid = String(companyId || '').trim();
  const id = String(projectId || '').trim();
  if (!id) {
    return { rows: [], error: { message: 'projectId vazio', source: 'input' } };
  }

  let linksQuery = supabase
    .from('project_contract_model_links')
    .select('company_contract_model_id, is_project_default, company_id')
    .eq('project_id', id);
  if (isUuid(projectCompanyUuid)) {
    linksQuery = linksQuery.eq('company_id', projectCompanyUuid);
  }

  const { data: links, error: linkError } = await linksQuery;
  if (linkError) {
    return { rows: [], error: { message: linkError.message, source: 'links' } };
  }
  if (!links?.length) return { rows: [], error: null };

  const modelIds = [
    ...new Set(links.map((row) => String(row.company_contract_model_id || '')).filter(Boolean)),
  ];
  if (!modelIds.length) return { rows: [], error: null };

  let modelsQuery = supabase
    .from('company_contract_models')
    .select('id, name, catalog_code, engine_key, status, company_id')
    .in('id', modelIds)
    .eq('catalog_code', 'CUSTOM')
    .eq('engine_key', 'custom')
    .eq('status', 'active');
  if (isUuid(projectCompanyUuid)) {
    modelsQuery = modelsQuery.eq('company_id', projectCompanyUuid);
  }

  const { data: models, error: modelError } = await modelsQuery;
  if (modelError) {
    return { rows: [], error: { message: modelError.message, source: 'models' } };
  }
  if (!models?.length) return { rows: [], error: null };

  const { data: versions, error: versionError } = await supabase
    .from('company_contract_model_versions')
    .select('model_id, version, status')
    .in(
      'model_id',
      models.map((row) => String(row.id)),
    )
    .eq('status', 'published')
    .order('version', { ascending: false });
  if (versionError) {
    return { rows: [], error: { message: versionError.message, source: 'versions' } };
  }

  return {
    rows: buildProjectCustomContractOptions({
      projectCompanyUuid,
      links,
      models,
      versions: versions || [],
    }),
    error: null,
  };
}

export async function listPublishedCustomModelsLinkedToProject(
  supabase: SupabaseClient,
  companyId: string,
  projectId: string,
): Promise<ProjectCustomContractOption[]> {
  const result = await queryPublishedCustomModelsLinkedToProject(
    supabase,
    companyId,
    projectId,
  );
  return result.rows;
}

export async function persistProjectCustomContractDefault(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    projectId: string;
    customModelId: string | null;
  },
): Promise<void> {
  const { companyId, projectId, customModelId } = input;
  if (!isUuid(companyId) || !projectId) return;

  const { error: clearError } = await supabase
    .from('project_contract_model_links')
    .update({ is_project_default: false })
    .eq('project_id', projectId)
    .eq('company_id', companyId);
  if (clearError) throw new Error(clearError.message);

  if (!customModelId) return;

  const { data: existing, error: findError } = await supabase
    .from('project_contract_model_links')
    .select('id')
    .eq('project_id', projectId)
    .eq('company_contract_model_id', customModelId)
    .maybeSingle();
  if (findError) throw new Error(findError.message);

  if (existing?.id) {
    const { error } = await supabase
      .from('project_contract_model_links')
      .update({ is_project_default: true })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error: insertError } = await supabase.from('project_contract_model_links').insert({
    project_id: projectId,
    company_id: companyId,
    company_contract_model_id: customModelId,
    is_project_default: true,
  });
  if (insertError) throw new Error(insertError.message);
}

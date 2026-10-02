/**
 * Modelos CUSTOM publicados vinculados a um empreendimento.
 * Usados no seletor "Modelo de contrato padrão" do GIS.
 * Não altera SALE_CONTRACT_MODEL_OPTIONS (motores TypeScript).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isLfEstrelaModelName } from '@/lib/lfEstrelaCustomTemplate';

export const PROJECT_CUSTOM_CONTRACT_VALUE_PREFIX = 'ccm:';

export type ProjectCustomContractOption = {
  id: string;
  name: string;
  isProjectDefault: boolean;
  publishedVersion: number;
};

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

export async function listPublishedCustomModelsLinkedToProject(
  supabase: SupabaseClient,
  companyId: string,
  projectId: string,
): Promise<ProjectCustomContractOption[]> {
  if (!companyId || !projectId) return [];
  const { data: links, error: linkError } = await supabase
    .from('project_contract_model_links')
    .select('company_contract_model_id, is_project_default')
    .eq('project_id', projectId)
    .eq('company_id', companyId);
  if (linkError || !links?.length) return [];

  const modelIds = [
    ...new Set(links.map((row) => String(row.company_contract_model_id || '')).filter(Boolean)),
  ];
  if (!modelIds.length) return [];

  const { data: models, error: modelError } = await supabase
    .from('company_contract_models')
    .select('id, name, catalog_code, status')
    .in('id', modelIds)
    .eq('company_id', companyId)
    .eq('catalog_code', 'CUSTOM')
    .eq('status', 'active');
  if (modelError || !models?.length) return [];

  const { data: versions, error: versionError } = await supabase
    .from('company_contract_model_versions')
    .select('model_id, version, status')
    .in('model_id', models.map((row) => String(row.id)))
    .eq('status', 'published')
    .order('version', { ascending: false });
  if (versionError) return [];

  const latestByModel = new Map<string, number>();
  for (const row of versions || []) {
    const id = String(row.model_id || '');
    if (!id || latestByModel.has(id)) continue;
    latestByModel.set(id, Number(row.version) || 0);
  }

  return models
    .map((model) => {
      const id = String(model.id);
      const publishedVersion = latestByModel.get(id) || 0;
      if (publishedVersion < 1) return null;
      const link = links.find((row) => String(row.company_contract_model_id) === id);
      return {
        id,
        name: String(model.name || '').trim() || 'Personalizado',
        isProjectDefault: Boolean(link?.is_project_default),
        publishedVersion,
      };
    })
    .filter((row): row is ProjectCustomContractOption => Boolean(row));
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
  if (!companyId || !projectId) return;

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

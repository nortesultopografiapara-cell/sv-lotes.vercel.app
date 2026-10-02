/**
 * Emissão GIS/regeneração do LF ESTRELA CUSTOM no DEVELOP.
 * Production continua no motor ESTRELA_DO_SUL.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  composeLfEstrelaContractHtml,
  assertNoSemDadoInFinalHtml,
} from '@/lib/lfEstrelaEmission';
import { isLfEstrelaModelName } from '@/lib/lfEstrelaCustomTemplate';
import { resolveCustomPreviewValues } from '@/lib/customContractPreviewResolver';
import { isDevelopHomologRuntime } from '@/lib/homolog/env';

export type LfEstrelaPublishedModel = {
  modelId: string;
  version: number;
  html: string;
};

export async function loadPublishedLfEstrelaForProject(
  supabase: SupabaseClient,
  companyId: string,
  projectId: string,
): Promise<LfEstrelaPublishedModel | null> {
  const { data: links, error: linkError } = await supabase
    .from('project_contract_model_links')
    .select('id, company_contract_model_id, is_project_default')
    .eq('project_id', projectId)
    .eq('company_id', companyId);
  if (linkError || !links?.length) return null;

  const modelIds = links.map((row) => String(row.company_contract_model_id || '')).filter(Boolean);
  if (!modelIds.length) return null;

  const { data: models, error: modelError } = await supabase
    .from('company_contract_models')
    .select('id, name, catalog_code, status')
    .in('id', modelIds)
    .eq('company_id', companyId);
  if (modelError || !models?.length) return null;

  const preferred = [...models]
    .filter((row) => String(row.catalog_code || '').toUpperCase() === 'CUSTOM')
    .filter((row) => isLfEstrelaModelName(String(row.name || '')))
    .filter((row) =>
      links.some(
        (link) =>
          String(link.company_contract_model_id) === String(row.id) && link.is_project_default,
      ),
    )[0];
  if (!preferred?.id) return null;

  const { data: versions, error: versionError } = await supabase
    .from('company_contract_model_versions')
    .select('id, version, status, content_html')
    .eq('model_id', preferred.id)
    .eq('status', 'published')
    .order('version', { ascending: false })
    .limit(1);
  if (versionError) return null;
  const published = versions?.[0];
  const html = String(published?.content_html || '').trim();
  if (!html) return null;
  return {
    modelId: String(preferred.id),
    version: Number(published?.version) || 1,
    html,
  };
}

export async function tryBuildLfEstrelaCustomSaleHtml(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    projectId: string;
    company: Record<string, unknown>;
    customer: Record<string, unknown>;
    sale: Record<string, unknown>;
    project: Record<string, unknown>;
    lot: Record<string, unknown>;
    contract?: Record<string, unknown> | null;
    receipts?: Array<Record<string, unknown>> | null;
    commissions?: Array<Record<string, unknown>> | null;
    broker?: Record<string, unknown> | null;
  },
): Promise<{ html: string; modelId: string; version: number } | null> {
  if (!isDevelopHomologRuntime()) return null;
  const published = await loadPublishedLfEstrelaForProject(
    supabase,
    input.companyId,
    input.projectId,
  );
  if (!published) return null;
  const values = resolveCustomPreviewValues({
    tenantId: input.companyId,
    company: input.company,
    customer: input.customer,
    sale: input.sale,
    project: input.project,
    lot: input.lot,
    contract: input.contract,
    receipts: input.receipts,
    commissions: input.commissions,
    broker: input.broker,
  });
  const composed = composeLfEstrelaContractHtml(published.html, values, {
    mode: 'final',
    sale: input.sale,
    requireComplete: true,
  });
  assertNoSemDadoInFinalHtml(composed.html);
  return { html: composed.html, modelId: published.modelId, version: published.version };
}

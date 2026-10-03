/**
 * Emissão GIS/regeneração do LF ESTRELA CUSTOM.
 * DEVELOP e Production usam o mesmo caminho quando o empreendimento tem
 * vínculo default + modelo CUSTOM ativo + versão published.
 * Sem vínculo/default: retorna null e o caller permanece no motor ESTRELA_DO_SUL.
 * Não grava ccm: em projects.contract_model.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  composeLfEstrelaContractHtml,
  assertNoSemDadoInFinalHtml,
} from '@/lib/lfEstrelaEmission';
import { buildLfEstrelaCustomHtml, isLfEstrelaModelName } from '@/lib/lfEstrelaCustomTemplate';
import { resolveCustomPreviewValues } from '@/lib/customContractPreviewResolver';
import { resolveBuyerNationality } from '@/lib/customerIdentity';

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
    .eq('company_id', companyId)
    .eq('status', 'active');
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
    formOverlay?: Record<string, unknown> | null;
  },
): Promise<{ html: string; modelId: string; version: number } | null> {
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
  const resolvedClientNationality = resolveBuyerNationality({
    form: input.formOverlay,
    sale: input.sale,
    customer: input.customer,
  });
  console.info('[LF ESTRELA NATIONALITY TRACE]', {
    formNationality: String(
      input.formOverlay?.nationality || input.formOverlay?.nacionalidade || '',
    ).trim() || null,
    customerNationality: String(
      input.customer?.nationality || input.customer?.nacionalidade || '',
    ).trim() || null,
    payloadNationality: String(
      input.formOverlay?.nationality || input.formOverlay?.nacionalidade || '',
    ).trim() || null,
    saleCustomerNationality: String(
      input.sale?.customer_nationality || input.sale?.buyer_nationality || '',
    ).trim() || null,
    snapshotNationality: null,
    resolvedClientNationality: resolvedClientNationality || null,
  });
  if (resolvedClientNationality) {
    values.CLIENT_NATIONALITY = resolvedClientNationality;
  }
  const composed = composeLfEstrelaContractHtml(buildLfEstrelaCustomHtml(), values, {
    mode: 'final',
    sale: input.sale,
    requireComplete: true,
    gisChrome: true,
  });
  assertNoSemDadoInFinalHtml(composed.html);
  console.info('[LF ESTRELA CUSTOM PATH]', {
    step: 'tryBuildLfEstrelaCustomSaleHtml → loadPublishedLfEstrelaForProject → CUSTOM published → sv-lf-estrela',
    modelId: published.modelId,
    version: published.version,
  });
  return { html: composed.html, modelId: published.modelId, version: published.version };
}

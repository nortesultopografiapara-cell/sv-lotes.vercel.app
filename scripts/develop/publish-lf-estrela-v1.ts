/**
 * DEVELOP — publica LF ESTRELA v1 e associa ao empreendimento Estrela do Sul.
 * Não altera Production. Não muda projects.contract_model (motor ESTRELA_DO_SUL).
 *
 * npx tsx scripts/develop/publish-lf-estrela-v1.ts
 */
import { createRequire } from 'node:module';
import { payloadForCentralTable } from '../../lib/contractModelCentralOps';
import {
  LF_ESTRELA_CATALOG_CODE,
  LF_ESTRELA_ENGINE_KEY,
  LF_ESTRELA_MODEL_NAME,
  assertNoLfEstrelaPageMarkers,
  buildLfEstrelaCustomHtml,
} from '../../lib/lfEstrelaCustomTemplate';
import { assertDevelopWriteAllowed, loadDevelopEnv } from './guard';
import { DEVELOP_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../../lib/homolog/env';

const TENANT_ID = '3052a000-e8b9-43a4-b8ab-91a4392ffcbc';
const ESTRELA_PROJECT_ID = '760c32d8-4c43-403b-986c-9872011f44cd';

async function main() {
  const target = assertDevelopWriteAllowed();
  const env = loadDevelopEnv();
  if (env.ref === PRODUCTION_PROJECT_REF) {
    throw new Error('ABORT: Production.');
  }
  if (env.ref !== DEVELOP_PROJECT_REF) {
    throw new Error(`ABORT: ref ${env.ref}`);
  }
  if (!env.service || env.service.length < 20) {
    throw new Error('ABORT: SUPABASE_SERVICE_ROLE_KEY ausente.');
  }

  const html = buildLfEstrelaCustomHtml();
  assertNoLfEstrelaPageMarkers(html, 'publish LF ESTRELA v1');

  const require = createRequire(__filename);
  const { createClient } = require('@supabase/supabase-js') as {
    createClient: (url: string, key: string) => any;
  };
  const sb = createClient(env.url, env.service);

  const { data: existing, error: existingError } = await sb
    .from('company_contract_models')
    .select('id, name, catalog_code, engine_key, status')
    .eq('company_id', TENANT_ID)
    .eq('name', LF_ESTRELA_MODEL_NAME);
  if (existingError) throw new Error(existingError.message);

  let modelId = String(existing?.[0]?.id || '');
  if (!modelId) {
    const payload = payloadForCentralTable('company_contract_models', {
      company_id: TENANT_ID,
      tenant_id: TENANT_ID,
      catalog_code: LF_ESTRELA_CATALOG_CODE,
      engine_key: LF_ESTRELA_ENGINE_KEY,
      name: LF_ESTRELA_MODEL_NAME,
      status: 'active',
      source: 'user',
      is_company_default: false,
    });
    const { data: inserted, error: insertError } = await sb
      .from('company_contract_models')
      .insert(payload)
      .select('id')
      .single();
    if (insertError || !inserted?.id) {
      throw new Error(insertError?.message || 'Falha ao criar company_contract_models.');
    }
    modelId = String(inserted.id);
  }

  const { data: draft, error: draftError } = await sb
    .from('company_contract_model_versions')
    .select('id, version, status')
    .eq('model_id', modelId)
    .eq('status', 'draft')
    .order('version', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (draftError) throw new Error(draftError.message);

  if (draft?.id) {
    const { error: htmlError } = await sb
      .from('company_contract_model_versions')
      .update({
        content_html: html,
        engine_params_json: { origin: 'LF_ESTRELA_OFFICIAL', published_channel: 'develop' },
        updated_at: new Date().toISOString(),
      })
      .eq('id', draft.id)
      .eq('model_id', modelId);
    if (htmlError) throw new Error(htmlError.message);
  } else {
    const versionPayload = payloadForCentralTable('company_contract_model_versions', {
      model_id: modelId,
      company_id: TENANT_ID,
      version: 0,
      status: 'draft',
      content_html: html,
      engine_params_json: { origin: 'LF_ESTRELA_OFFICIAL', published_channel: 'develop' },
      updated_at: new Date().toISOString(),
    });
    const { error: versionError } = await sb
      .from('company_contract_model_versions')
      .insert(versionPayload);
    if (versionError) throw new Error(versionError.message);
  }

  const { data: rpcPublished, error: rpcError } = await sb.rpc(
    'publish_company_contract_model_version',
    { p_model_id: modelId },
  );

  let publishedVersion = Number(rpcPublished?.[0]?.version || rpcPublished?.version || 0);
  if (rpcError || !publishedVersion) {
    const { data: latest } = await sb
      .from('company_contract_model_versions')
      .select('version')
      .eq('model_id', modelId)
      .eq('status', 'published')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = (Number(latest?.version) || 0) + 1;
    const pubPayload = payloadForCentralTable('company_contract_model_versions', {
      model_id: modelId,
      company_id: TENANT_ID,
      version: next,
      status: 'published',
      content_html: html,
      engine_params_json: { origin: 'LF_ESTRELA_OFFICIAL', published_channel: 'develop' },
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const { error: insertPubError } = await sb
      .from('company_contract_model_versions')
      .insert(pubPayload);
    if (insertPubError) {
      throw new Error(rpcError?.message || insertPubError.message);
    }
    publishedVersion = next;
  }

  const { data: project, error: projectError } = await sb
    .from('projects')
    .select('id, name, contract_model, company_id, tenant_id')
    .eq('id', ESTRELA_PROJECT_ID)
    .maybeSingle();
  if (projectError) throw new Error(projectError.message);
  if (!project?.id || !/estrela/i.test(String(project.name || ''))) {
    throw new Error('Empreendimento Estrela do Sul não encontrado no DEVELOP.');
  }

  const { data: link } = await sb
    .from('project_contract_model_links')
    .select('id')
    .eq('company_contract_model_id', modelId)
    .eq('project_id', project.id)
    .maybeSingle();

  if (!link?.id) {
    const linkPayload = payloadForCentralTable('project_contract_model_links', {
      project_id: project.id,
      company_id: TENANT_ID,
      company_contract_model_id: modelId,
      is_project_default: false,
    });
    const { error: linkError } = await sb
      .from('project_contract_model_links')
      .insert(linkPayload);
    if (linkError) throw new Error(linkError.message);
  }

  const { data: verify } = await sb
    .from('company_contract_model_versions')
    .select('id, version, status')
    .eq('model_id', modelId)
    .eq('status', 'published')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log(
    JSON.stringify(
      {
        branch: target.branch,
        ref: target.ref,
        modelId,
        publishedVersion: verify?.version || publishedVersion,
        linkedToEstrelaDoSul: true,
        isProjectDefault: false,
        projectContractModelUnchanged: project.contract_model,
        htmlChars: html.length,
        rpcError: rpcError?.message || null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

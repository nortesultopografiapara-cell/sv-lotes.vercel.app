/**
 * DEVELOP — cria o modelo CUSTOM "LF ESTRELA" na Central.
 * Não aplica em Production. Não vira padrão do empreendimento.
 * Não altera o motor ESTRELA_DO_SUL nem vendas existentes.
 *
 * npx tsx scripts/develop/seed-lf-estrela-custom.ts
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
  assertNoLfEstrelaPageMarkers(html, 'seed LF ESTRELA');

  const require = createRequire(__filename);
  const { createClient } = require('@supabase/supabase-js') as {
    createClient: (url: string, key: string) => any;
  };
  const sb = createClient(env.url, env.service);

  const { data: company, error: companyError } = await sb
    .from('companies')
    .select('id, name')
    .eq('id', TENANT_ID)
    .maybeSingle();
  if (companyError || !company) {
    throw new Error(companyError?.message || 'Empresa LF não encontrada no DEVELOP.');
  }

  const { data: existing, error: existingError } = await sb
    .from('company_contract_models')
    .select('id, name, catalog_code, engine_key, status, source, is_company_default')
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
  } else {
    const { error: updateError } = await sb
      .from('company_contract_models')
      .update({
        catalog_code: LF_ESTRELA_CATALOG_CODE,
        engine_key: LF_ESTRELA_ENGINE_KEY,
        status: 'active',
        source: 'user',
        is_company_default: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', modelId)
      .eq('company_id', TENANT_ID);
    if (updateError) throw new Error(updateError.message);
  }

  const { data: draft, error: draftError } = await sb
    .from('company_contract_model_versions')
    .select('id, version, status')
    .eq('model_id', modelId)
    .eq('company_id', TENANT_ID)
    .eq('status', 'draft')
    .eq('version', 0)
    .maybeSingle();
  if (draftError) throw new Error(draftError.message);

  if (draft?.id) {
    const { error: htmlError } = await sb
      .from('company_contract_model_versions')
      .update({
        content_html: html,
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
      engine_params_json: { origin: 'LF_ESTRELA_OFFICIAL' },
      updated_at: new Date().toISOString(),
    });
    const { error: versionError } = await sb
      .from('company_contract_model_versions')
      .insert(versionPayload);
    if (versionError) throw new Error(versionError.message);
  }

  const { data: ensured, error: rpcError } = await sb.rpc(
    'ensure_company_contract_model_draft',
    { p_model_id: modelId },
  );
  if (rpcError) throw new Error(rpcError.message);
  void ensured;

  const { data: project } = await sb
    .from('projects')
    .select('id, name, contract_model')
    .eq('id', ESTRELA_PROJECT_ID)
    .eq('company_id', TENANT_ID)
    .maybeSingle();

  let linked = false;
  if (project?.id && /estrela/i.test(String(project.name || ''))) {
    const { data: link } = await sb
      .from('project_contract_model_links')
      .select('id, is_project_default')
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
    linked = true;
    if (String(project.contract_model || '').toUpperCase() === 'ESTRELA_DO_SUL') {
      console.log('Motor ESTRELA_DO_SUL do empreendimento preservado (não virou padrão).');
    }
  }

  const { data: verify } = await sb
    .from('company_contract_models')
    .select('id, name, catalog_code, engine_key, status, source, is_company_default')
    .eq('id', modelId)
    .single();

  console.log(
    JSON.stringify(
      {
        branch: target.branch,
        ref: target.ref,
        model: verify,
        linkedToEstrelaDoSul: linked,
        isProjectDefault: false,
        htmlChars: html.length,
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

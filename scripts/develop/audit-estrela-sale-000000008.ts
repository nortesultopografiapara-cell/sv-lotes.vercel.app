/**
 * READ-ONLY — auditoria da venda/contrato 000000008/2026 no DEVELOP.
 * Não grava snapshot, não atualiza venda, não toca Production.
 *
 * npx tsx scripts/develop/audit-estrela-sale-000000008.ts
 * (exige NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY do DEVELOP hoynysmynxncdlptuzub)
 */
import { createClient } from '@supabase/supabase-js';
import {
  parseLfContractConfigJson,
  resolveLfContractConfig,
  isLfParticipationValid,
} from '../../lib/lfImoveisContractConfig';
import { parseLfContractSnapshotJson } from '../../lib/lfImoveisContractSnapshot';
import { generateContractHTML } from '../../lib/contractTemplate';
import { assertDevelopWriteAllowed, loadDevelopEnv } from './guard';

const CONTRACT_NUMBER = '000000008/2026';

function extractPercents(html: string): string[] {
  const out: string[] = [];
  const re = /(\d{1,3}(?:[.,]\d+)?)\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const nearby = html.slice(Math.max(0, m.index - 80), m.index + 80);
    if (/primeiro vendedor|segundo vendedor|participa/i.test(nearby)) {
      out.push(`${m[0]} :: ${nearby.replace(/\s+/g, ' ').trim()}`);
    }
  }
  return out;
}

function partnershipPhrase(html: string): string | null {
  const m = html.match(
    /(\d{1,3}(?:[.,]\d+)?%\s+do valor e\s+\d{1,3}(?:[.,]\d+)?%\s+ao segundo vendedor)/i,
  );
  return m?.[1] || null;
}

async function main() {
  const target = assertDevelopWriteAllowed();
  const env = loadDevelopEnv();
  if (!env.service || /SENSITIVE/i.test(env.service)) {
    throw new Error('ABORT: sem service role DEVELOP (não usar placeholder [SENSITIVE]).');
  }
  console.log('ALVO', { ref: target.ref, branch: target.branch, source: target.source });

  const admin = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const contractRes = await admin
    .from('contracts')
    .select(
      'id, contract_number, sale_id, project_id, company_id, tenant_id, created_at, status, version, is_current, contract_model, generated_html',
    )
    .eq('contract_number', CONTRACT_NUMBER)
    .order('created_at', { ascending: false });

  if (contractRes.error) throw new Error(contractRes.error.message);
  const contracts = contractRes.data || [];
  if (!contracts.length) throw new Error(`Contrato ${CONTRACT_NUMBER} não encontrado no DEVELOP.`);

  const estrelaContracts = contracts.filter(
    (c) => String(c.contract_model || '').toUpperCase() === 'ESTRELA_DO_SUL',
  );
  const current =
    estrelaContracts.find((c) => c.is_current === true) ||
    estrelaContracts[0] ||
    contracts.find((c) => c.is_current === true) ||
    contracts[0];

  console.log('CONTRATOS', {
    count: contracts.length,
    current_id: current.id,
    current_model: current.contract_model,
    versions: contracts.map((c) => ({
      id: c.id,
      version: c.version,
      is_current: c.is_current,
      status: c.status,
      contract_model: c.contract_model,
      sale_id: c.sale_id,
      created_at: c.created_at,
      html_len: String(c.generated_html || '').length,
      partnership: partnershipPhrase(String(c.generated_html || '')),
    })),
  });

  const saleId = String(current.sale_id || '');
  const saleRes = await admin.from('sales').select('*').eq('id', saleId).maybeSingle();
  if (saleRes.error) throw new Error(saleRes.error.message);
  const sale = saleRes.data;
  if (!sale) throw new Error(`Venda ${saleId} não encontrada.`);

  const projectId = String(sale.project_id || current.project_id || '');
  const projectRes = await admin.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (projectRes.error) throw new Error(projectRes.error.message);
  const project = projectRes.data;
  if (!project) throw new Error(`Empreendimento ${projectId} não encontrado.`);

  const companyId = String(current.company_id || current.tenant_id || '');
  const companyRes = await admin
    .from('companies')
    .select(
      'id, name, razao_social, cnpj, contract_model, contract_second_vendor_json, legal_representative, representative_cpf, city, state',
    )
    .eq('id', companyId)
    .maybeSingle();
  const company = companyRes.data || {};

  const parsedConfig = parseLfContractConfigJson(project.lf_contract_config_json);
  const parsedSnap = parseLfContractSnapshotJson(sale.lf_contract_snapshot_json);
  const resolved = resolveLfContractConfig({
    sale: sale as Record<string, unknown>,
    project: project as Record<string, unknown>,
    company: company as Record<string, unknown>,
  });

  const html = String(current.generated_html || '');
  const htmlPercents = extractPercents(html);

  console.log('\n=== AUDITORIA 000000008/2026 ===');
  console.log('VENDA', {
    id: sale.id,
    created_at: sale.created_at,
    sale_date: sale.sale_date,
    status: sale.status,
    contract_model: sale.contract_model,
    has_spouse: sale.has_spouse,
    spouse_name: sale.sale_spouse_name || null,
    snapshot_keys: Object.keys(sale).filter((k) => /lf_contract/i.test(k)),
  });
  console.log('EMPREENDIMENTO ATUAL', {
    id: project.id,
    name: project.name,
    updated_at: project.updated_at || null,
    contract_model: project.contract_model,
    config_raw: project.lf_contract_config_json,
    config_parsed: parsedConfig.participation,
    config_valid: parsedConfig.participation
      ? isLfParticipationValid(
          parsedConfig.participation.firstVendorPercent,
          parsedConfig.participation.secondVendorPercent,
        )
      : false,
  });
  console.log('SNAPSHOT DA VENDA (não alterado)', {
    raw: sale.lf_contract_snapshot_json,
    parsed_participation: parsedSnap?.participation ?? null,
    capturedAt: parsedSnap?.capturedAt || null,
    hasSecondVendor: parsedSnap?.hasSecondVendor ?? false,
    secondVendorName: parsedSnap?.secondVendor?.name || null,
  });
  console.log('MOTOR RESOLVEU', {
    firstVendorPercent: resolved.firstVendorPercent,
    secondVendorPercent: resolved.secondVendorPercent,
    participationSource: resolved.participationSource,
    usingPercentFallback: resolved.usingPercentFallback,
    secondVendorSource: resolved.secondVendorSource,
    hasSecondVendor: resolved.hasSecondVendor,
  });
  console.log('HTML PERSISTIDO — parceria:', partnershipPhrase(html));
  if (!htmlPercents.length) {
    console.log('(nenhum trecho de parceria encontrado)');
  } else {
    htmlPercents.forEach((line) => console.log(' -', line));
  }

  const liveHtml = generateContractHTML({
    tenant: { ...company, contract_model: 'ESTRELA_DO_SUL' },
    customer: { name: 'Auditoria', cpf: '52998224725', document: '52998224725' },
    project: project as Record<string, unknown>,
    block: { quadra: '01', lot: '01', area: 1000, frente: 20, fundo: 20 },
    sale: { ...(sale as Record<string, unknown>) },
  });
  const livePercents = extractPercents(liveHtml);
  console.log('\nHTML RE-RENDERIDO AGORA (snapshot da venda, sem gravar):');
  console.log('parceria:', partnershipPhrase(liveHtml));
  livePercents.forEach((line) => console.log(' -', line));
  console.log('\nLINHA DO TEMPO', {
    sale_created_at: sale.created_at,
    snapshot_capturedAt: parsedSnap?.capturedAt || null,
    project_updated_at: project.updated_at || null,
    current_contract_created_at: current.created_at,
    snapshot_before_project_update:
      parsedSnap?.capturedAt && project.updated_at
        ? new Date(parsedSnap.capturedAt).getTime() <
          new Date(project.updated_at).getTime()
        : null,
  });
  console.log(
    '\nVEREDITO',
    resolved.usingPercentFallback
      ? 'FALLBACK_30_70'
      : resolved.participationSource === 'sale'
        ? `SNAPSHOT_${resolved.firstVendorPercent}/${resolved.secondVendorPercent}`
        : `PROJECT_${resolved.firstVendorPercent}/${resolved.secondVendorPercent}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

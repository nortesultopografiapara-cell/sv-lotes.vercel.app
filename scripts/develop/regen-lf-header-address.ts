/**
 * Confere e, se possível, atualiza HTML de Estrela 000000005/2026 e Beira 000000006/2026.
 * Cabeçalho PDF é chrome ao vivo — não exige nova versão de contrato.
 * npx tsx scripts/develop/regen-lf-header-address.ts
 */
import { createClient } from '@supabase/supabase-js';
import { DEVELOP_PROJECT_REF } from '../../lib/homolog/env';
import { assertDevelopWriteAllowed, loadDevelopEnv } from './guard';
import {
  buildFreshSaleContractHtml,
  persistGeneratedContractHtml,
} from '../../lib/contractRegeneration';
import { buildEstrelaDoSulPdfChrome } from '../../lib/estrelaDoSulContractPdf';

const NUMBERS = ['000000005/2026', '000000006/2026'];

function hasBadSn(text: string): boolean {
  return /N\s*99\s*,\s*S\s*\/\s*N/i.test(text);
}

async function main() {
  const target = assertDevelopWriteAllowed();
  const env = loadDevelopEnv();
  if (!env.service) throw new Error('ABORT: sem service role.');
  const admin = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows: Record<string, unknown>[] = [];

  for (const number of NUMBERS) {
    const found = await admin
      .from('contracts')
      .select(
        'id, contract_number, status, is_current, project_id, tenant_id, company_id, sale_id, generated_html, contract_model',
      )
      .eq('contract_number', number)
      .limit(20);
    if (found.error) throw new Error(found.error.message);

    let current: Record<string, unknown> | null = null;
    let projectName = '';
    for (const row of found.data || []) {
      if (!row.project_id) continue;
      const project = await admin
        .from('projects')
        .select('id, name')
        .eq('id', row.project_id)
        .maybeSingle();
      const pname = String((project.data as { name?: string } | null)?.name || '');
      if (!/estrela/i.test(pname) && !/beira\s*rio/i.test(pname)) continue;
      current = row as Record<string, unknown>;
      projectName = pname;
      break;
    }
    if (!current) {
      throw new Error(`Contrato LF ${number} não encontrado.`);
    }

    const tenantId = String(current.tenant_id || current.company_id || '');
    const company = await admin
      .from('companies')
      .select('id, name, address, city, state, contract_model, cnpj')
      .eq('id', tenantId)
      .maybeSingle();
    if (company.error) throw new Error(company.error.message);
    const companyName = String((company.data as { name?: string } | null)?.name || '');
    if (!/imove/i.test(companyName)) {
      throw new Error(`ABORT: ${number} não é da LF Imóveis (${companyName}).`);
    }

    const chrome = buildEstrelaDoSulPdfChrome(
      { ...(company.data || {}), contract_model: 'ESTRELA_DO_SUL' },
      number,
    );
    const storedBefore = String(current.generated_html || '');

    let persistOk: boolean | null = null;
    let persistError: string | null = null;
    let htmlHasBad = hasBadSn(storedBefore);
    try {
      const built = await buildFreshSaleContractHtml(admin, current, {
        contractTenantId: tenantId,
        activeTenantId: tenantId,
        callerRole: 'ADMIN',
      });
      persistOk = await persistGeneratedContractHtml(
        admin,
        String(current.id),
        built.html,
        current,
      );
      htmlHasBad = hasBadSn(built.html);
    } catch (err) {
      persistError = err instanceof Error ? err.message.split('\n')[0] : String(err);
    }

    rows.push({
      number,
      project: projectName,
      status: current.status,
      company_address: (company.data as { address?: string } | null)?.address || null,
      chrome_address: chrome.addressLine,
      chrome_has_n99_sn: hasBadSn(chrome.addressLine),
      html_has_n99_sn: htmlHasBad,
      persist_ok: persistOk,
      persist_error: persistError,
    });
  }

  const ok = rows.every((r) => r.chrome_has_n99_sn === false && r.html_has_n99_sn === false);
  console.log(
    JSON.stringify(
      {
        ok,
        env: 'DEVELOP',
        ref: DEVELOP_PROJECT_REF,
        branch: target.branch,
        rows,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exit(2);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

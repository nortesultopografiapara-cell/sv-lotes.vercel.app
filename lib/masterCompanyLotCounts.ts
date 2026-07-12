/**
 * Contagem de lotes (blocks) por empresa no Master SaaS.
 * Lotes reais vinculam-se via project_id → projects.tenant_id/company_id.
 * Não depender de blocks.tenant_id/company_id (frequentemente nulos).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type MasterProjectRef = {
  id?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
};

export type MasterBlockRef = {
  id?: string | null;
  project_id?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
  deleted_at?: string | null;
};

function resolveCompanyId(row: {
  tenant_id?: string | null;
  company_id?: string | null;
}): string | null {
  const tenantId = row.tenant_id ? String(row.tenant_id).trim() : '';
  const companyId = row.company_id ? String(row.company_id).trim() : '';
  return tenantId || companyId || null;
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

/** Agrupa project_ids por empresa (tenant_id || company_id). */
export function groupProjectIdsByCompany(
  projects: MasterProjectRef[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const project of projects) {
    const companyId = resolveCompanyId(project);
    const projectId = String(project.id || '').trim();
    if (!companyId || !projectId) continue;
    if (!map[companyId]) map[companyId] = [];
    if (!map[companyId].includes(projectId)) {
      map[companyId].push(projectId);
    }
  }
  return map;
}

/**
 * Contagem em memória a partir de blocks (com project_id) + projects.
 * Usado em testes; produção preferir fetchCompanyLotCountsExact.
 */
export function buildCompanyLotCountsFromProjectsAndBlocks(
  projects: MasterProjectRef[],
  blocks: MasterBlockRef[],
): Record<string, number> {
  const projectCompany = new Map<string, string>();
  for (const project of projects) {
    const companyId = resolveCompanyId(project);
    const projectId = String(project.id || '').trim();
    if (!companyId || !projectId) continue;
    projectCompany.set(projectId, companyId);
  }

  const counts: Record<string, number> = {};
  for (const block of blocks) {
    if (block.deleted_at) continue;
    const projectId = String(block.project_id || '').trim();
    let companyId = projectId ? projectCompany.get(projectId) || null : null;
    if (!companyId) {
      companyId = resolveCompanyId(block);
    }
    if (!companyId) continue;
    counts[companyId] = (counts[companyId] || 0) + 1;
  }
  return counts;
}

/**
 * Contagem exact no banco por empresa, via project_id dos empreendimentos.
 * Não carrega linhas de lotes — só head count.
 */
export async function fetchCompanyLotCountsExact(
  client: SupabaseClient,
  projects: MasterProjectRef[],
): Promise<Record<string, number>> {
  const byCompany = groupProjectIdsByCompany(projects);
  const entries = Object.entries(byCompany);
  const counts: Record<string, number> = {};

  await Promise.all(
    entries.map(async ([companyId, projectIds]) => {
      let total = 0;
      for (const chunk of chunkIds(projectIds, 80)) {
        let query = client
          .from('blocks')
          .select('id', { count: 'exact', head: true })
          .in('project_id', chunk);

        let { count, error } = await query.is('deleted_at', null);

        if (error?.message?.match(/deleted_at|Could not find/i)) {
          const fallback = await client
            .from('blocks')
            .select('id', { count: 'exact', head: true })
            .in('project_id', chunk);
          count = fallback.count;
          error = fallback.error;
        }

        if (error) {
          console.warn('[masterCompanyLotCounts] count failed', {
            companyId,
            message: error.message,
          });
          continue;
        }
        total += count ?? 0;
      }
      counts[companyId] = total;
    }),
  );

  return counts;
}

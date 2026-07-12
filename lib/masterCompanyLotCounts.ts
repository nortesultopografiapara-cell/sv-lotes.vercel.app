/**
 * Contagem de lotes (blocks) por empresa no Master SaaS.
 *
 * Fonte de verdade no banco atual: blocks.tenant_id (e company_id legado).
 * project_id → projects também funciona como fallback para linhas sem tenant.
 *
 * NÃO filtrar por deleted_at no count do banco: a coluna existe, mas no dado
 * real os lotes ativos têm deleted_at preenchido e o GIS não aplica soft-delete.
 * Filtrar "deleted_at IS NULL" no PostgREST zera todas as contagens.
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
  /** Soft-delete opcional — só considerar em agregação em memória de testes. */
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
 * Contagem em memória a partir de blocks + projects (testes / fallback).
 * Soft-delete: exclui deleted_at truthy quando o campo está presente e usado.
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
 * Contagem exact no banco por empresa.
 * Preferência: tenant_id / company_id no próprio block (head count).
 * Fallback: project_id dos empreendimentos da empresa (quando tenant no block falha).
 */
export async function fetchCompanyLotCountsExact(
  client: SupabaseClient,
  companyIds: string[],
  projects: MasterProjectRef[] = [],
): Promise<Record<string, number>> {
  const ids = [...new Set(companyIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const counts: Record<string, number> = {};
  const byCompanyProjects = groupProjectIdsByCompany(projects);

  await Promise.all(
    ids.map(async (companyId) => {
      const { count, error } = await client
        .from('blocks')
        .select('id', { count: 'exact', head: true })
        .or(`tenant_id.eq.${companyId},company_id.eq.${companyId}`);

      if (!error && (count ?? 0) > 0) {
        counts[companyId] = count ?? 0;
        return;
      }

      if (error) {
        console.warn('[masterCompanyLotCounts] tenant count failed', {
          companyId,
          message: error.message,
        });
      }

      // Fallback via projetos da empresa (lotes só com project_id)
      const projectIds = byCompanyProjects[companyId] || [];
      if (projectIds.length === 0) {
        counts[companyId] = count ?? 0;
        return;
      }

      let total = 0;
      for (const chunk of chunkIds(projectIds, 80)) {
        const fallback = await client
          .from('blocks')
          .select('id', { count: 'exact', head: true })
          .in('project_id', chunk);
        if (fallback.error) {
          console.warn('[masterCompanyLotCounts] project count failed', {
            companyId,
            message: fallback.error.message,
          });
          continue;
        }
        total += fallback.count ?? 0;
      }
      counts[companyId] = total;
    }),
  );

  return counts;
}

/** Lookups de nomes para enriquecer exportações. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CorporateExportNameMaps } from './exportTypes';

async function loadIdNameMap(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
  nameColumn = 'name',
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return map;

  // Chunk para evitar URL muito longa
  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(table)
      .select(`id, ${nameColumn}`)
      .in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const id = String((row as { id: string }).id);
      const name = String((row as Record<string, unknown>)[nameColumn] || id);
      map.set(id, name);
    }
  }
  return map;
}

export async function loadCorporateExportNameMaps(
  supabase: SupabaseClient,
  ids: {
    accountIds?: string[];
    categoryIds?: string[];
    costCenterIds?: string[];
    projectIds?: string[];
    quoteIds?: string[];
  },
): Promise<CorporateExportNameMaps> {
  const [accounts, categories, costCenters, projects, quotes] = await Promise.all([
    loadIdNameMap(
      supabase,
      'master_corporate_financial_accounts',
      ids.accountIds || [],
    ),
    loadIdNameMap(
      supabase,
      'master_corporate_financial_categories',
      ids.categoryIds || [],
    ),
    loadIdNameMap(supabase, 'master_corporate_cost_centers', ids.costCenterIds || []),
    loadIdNameMap(supabase, 'master_topography_projects', ids.projectIds || [], 'name'),
    loadIdNameMap(supabase, 'master_topography_quotes', ids.quoteIds || [], 'code'),
  ]);

  return { accounts, categories, costCenters, projects, quotes };
}

export function mapName(
  map: Map<string, string>,
  id: string | null | undefined,
): string {
  if (!id) return '—';
  return map.get(id) || id.slice(0, 8);
}

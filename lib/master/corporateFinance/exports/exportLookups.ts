/** Lookups de nomes para enriquecer exportações. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CorporateExportNameMaps } from './exportTypes';

async function loadIdLabelMap(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
  labelColumn: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return map;

  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(table)
      .select(`id, ${labelColumn}`)
      .in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const id = String((row as { id: string }).id);
      const label = String((row as Record<string, unknown>)[labelColumn] || '').trim();
      map.set(id, label || id.slice(0, 8));
    }
  }
  return map;
}

/** Enrichment opcional: falha no lookup não deve derrubar a exportação. */
async function loadIdLabelMapSafe(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
  labelColumn: string,
): Promise<Map<string, string>> {
  try {
    return await loadIdLabelMap(supabase, table, ids, labelColumn);
  } catch {
    return new Map();
  }
}

/**
 * Colunas de label por tabela.
 * master_topography_projects usa `title` (NÃO `name`).
 */
export const CORPORATE_EXPORT_LABEL_COLUMNS = {
  accounts: 'name',
  categories: 'name',
  costCenters: 'name',
  /** Schema real: title text NOT NULL — ver migration 20260722120000 */
  projects: 'title',
  quotes: 'code',
} as const;

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
    loadIdLabelMapSafe(
      supabase,
      'master_corporate_financial_accounts',
      ids.accountIds || [],
      CORPORATE_EXPORT_LABEL_COLUMNS.accounts,
    ),
    loadIdLabelMapSafe(
      supabase,
      'master_corporate_financial_categories',
      ids.categoryIds || [],
      CORPORATE_EXPORT_LABEL_COLUMNS.categories,
    ),
    loadIdLabelMapSafe(
      supabase,
      'master_corporate_cost_centers',
      ids.costCenterIds || [],
      CORPORATE_EXPORT_LABEL_COLUMNS.costCenters,
    ),
    loadIdLabelMapSafe(
      supabase,
      'master_topography_projects',
      ids.projectIds || [],
      CORPORATE_EXPORT_LABEL_COLUMNS.projects,
    ),
    loadIdLabelMapSafe(
      supabase,
      'master_topography_quotes',
      ids.quoteIds || [],
      CORPORATE_EXPORT_LABEL_COLUMNS.quotes,
    ),
  ]);

  return { accounts, categories, costCenters, projects, quotes };
}

export function mapName(
  map: Map<string, string>,
  id: string | null | undefined,
): string {
  if (!id) return '—';
  return map.get(id) || '—';
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { clearProjectMapOfflineCache } from '@/lib/offline/store';
import { fetchAllPaginated } from '@/lib/supabaseFetchAll';

export function normalizeQuadraBlockName(name: string): string {
  return String(name ?? '').trim().toUpperCase();
}

export function formatQuadraLabel(blockName: string): string {
  const n = normalizeQuadraBlockName(blockName);
  if (!n) return '—';
  if (/^QUADRA\s/i.test(n)) return n;
  return `Quadra ${n}`;
}

function applyBlocksTenantFilter<T extends { or: (filter: string) => T }>(
  query: T,
  user: { role?: string; tenant_id?: string | null } | null | undefined,
): T {
  if (user?.role === 'SUPER_ADMIN' || !user?.tenant_id) return query;
  return query.or(
    `tenant_id.eq.${user.tenant_id},company_id.eq.${user.tenant_id}`,
  );
}

/** Lista distintas quadras (block_name) do projeto — paginado (sem teto 1000). */
export async function fetchProjectQuadraNames(
  supabase: SupabaseClient,
  projectId: string,
  user?: { role?: string; tenant_id?: string | null } | null,
): Promise<string[]> {
  const tenantId =
    user?.role !== 'SUPER_ADMIN' && user?.tenant_id ? user.tenant_id : null;

  const { rows } = await fetchAllPaginated<{ block_name?: string }>(
    (from, to) => {
      let query = supabase
        .from('blocks')
        .select('id, block_name')
        .eq('project_id', projectId)
        .not('block_name', 'is', null)
        .order('id', { ascending: true });
      if (tenantId) {
        query = query.or(`tenant_id.eq.${tenantId},company_id.eq.${tenantId}`);
      }
      return query.range(from, to);
    },
  );

  const names = new Set<string>();
  for (const row of rows) {
    const bn = normalizeQuadraBlockName(row.block_name ?? '');
    if (bn) names.add(bn);
  }

  return [...names].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }),
  );
}

/**
 * Exclui somente uma quadra do projeto (blocks + lot_segments + cache offline do projeto).
 */
export async function deleteProjectQuadra(
  supabase: SupabaseClient,
  projectId: string,
  blockName: string,
  user?: { role?: string; tenant_id?: string | null } | null,
): Promise<{ lotsRemoved: number }> {
  const quadraName = normalizeQuadraBlockName(blockName);
  if (!quadraName) throw new Error('Nome da quadra inválido.');

  const tenantId =
    user?.role !== 'SUPER_ADMIN' && user?.tenant_id ? user.tenant_id : null;
  const { rows: blockRows } = await fetchAllPaginated<{ id?: string }>(
    (from, to) => {
      let q = supabase
        .from('blocks')
        .select('id')
        .eq('project_id', projectId)
        .eq('block_name', quadraName)
        .order('id', { ascending: true });
      if (tenantId) {
        q = q.or(`tenant_id.eq.${tenantId},company_id.eq.${tenantId}`);
      }
      return q.range(from, to);
    },
  );

  const lotIds = blockRows
    .map((r) => r.id)
    .filter((id): id is string => Boolean(id));

  if (lotIds.length > 0) {
    const { error: segError } = await supabase
      .from('lot_segments')
      .delete()
      .in('lot_id', lotIds);
    if (segError) {
      console.warn('[QUADRA] lot_segments (ignorado se tabela ausente)', segError);
    }
  }

  let deleteQuery = supabase
    .from('blocks')
    .delete()
    .eq('project_id', projectId)
    .eq('block_name', quadraName);

  deleteQuery = applyBlocksTenantFilter(deleteQuery, user);

  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;

  try {
    await clearProjectMapOfflineCache(projectId);
  } catch (cacheErr) {
    console.warn('[QUADRA] falha ao limpar cache offline', cacheErr);
  }

  console.log('[QUADRA] excluída', { projectId, quadraName, lots: lotIds.length });

  return { lotsRemoved: lotIds.length };
}

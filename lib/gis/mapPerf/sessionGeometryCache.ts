/**
 * Cache em memória (sessão) de geometrias parseadas do mapa GIS.
 * Invalidar quando updated_at máximo ou refreshKey mudar.
 */

export type CachedMapGeometry = {
  projectId: string;
  signature: string;
  lots: Record<string, unknown>[];
  blocksData: Record<string, unknown>[];
  cachedAt: number;
};

const store = new Map<string, CachedMapGeometry>();

export function buildMapCacheSignature(
  projectId: string,
  rows: Array<{ id?: string; updated_at?: string | null }>,
): string {
  let maxUpdated = '';
  let count = 0;
  for (const r of rows) {
    count += 1;
    const u = String(r.updated_at || '');
    if (u > maxUpdated) maxUpdated = u;
  }
  return `${projectId}|n=${count}|u=${maxUpdated}`;
}

export function getSessionMapGeometry(
  projectId: string,
  signature: string,
): CachedMapGeometry | null {
  const hit = store.get(projectId);
  if (!hit) return null;
  if (hit.signature !== signature) return null;
  return hit;
}

export function setSessionMapGeometry(entry: CachedMapGeometry): void {
  store.set(entry.projectId, entry);
}

export function invalidateSessionMapGeometry(projectId: string): void {
  store.delete(projectId);
}

export function clearAllSessionMapGeometry(): void {
  store.clear();
}

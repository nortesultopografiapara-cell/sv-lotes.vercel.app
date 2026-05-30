import { getOfflineDb, isIndexedDbAvailable } from '@/lib/offline/db';

export type OfflineCacheCounts = {
  projects: number;
  map_projects: number;
  blocks: number;
  lots: number;
};

export async function getOfflineCacheCounts(): Promise<OfflineCacheCounts> {
  if (!isIndexedDbAvailable()) {
    return { projects: 0, map_projects: 0, blocks: 0, lots: 0 };
  }
  const db = await getOfflineDb();
  const [projects, map_projects, blocks, lots] = await Promise.all([
    db.getAll('projects'),
    db.getAll('map_projects'),
    db.getAll('blocks'),
    db.getAll('lots'),
  ]);
  return {
    projects: projects.length,
    map_projects: map_projects.length,
    blocks: blocks.length,
    lots: lots.length,
  };
}

export async function debugOfflineCache(): Promise<OfflineCacheCounts> {
  const counts = await getOfflineCacheCounts();
  console.log('[CACHE] diagnóstico IndexedDB', counts);
  return counts;
}

declare global {
  interface Window {
    debugOfflineCache?: () => Promise<OfflineCacheCounts>;
  }
}

export function registerOfflineCacheDebug(): void {
  if (typeof window === 'undefined') return;
  window.debugOfflineCache = debugOfflineCache;
}

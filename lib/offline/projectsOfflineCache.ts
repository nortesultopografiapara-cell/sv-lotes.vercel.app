/**
 * Cache local de projetos / mapa para modo offline.
 */

import { getOfflineDb } from '@/lib/offline/db';
import { isBrowserOnline } from '@/lib/offline/lotReservationOffline';
import {
  getAllEntities,
  getMapProjectCache,
  putEntities,
} from '@/lib/offline/store';
import type { MapProjectCacheRecord } from '@/lib/offline/types';

export type OfflineProjectRow = Record<string, unknown> & {
  id: string;
  name?: string;
  location?: string;
  blocks?: Array<Record<string, unknown>>;
};

export async function getAllMapProjectCaches(): Promise<MapProjectCacheRecord[]> {
  const db = await getOfflineDb();
  return db.getAll('map_projects');
}

export async function cacheProjectsForOffline(
  projects: OfflineProjectRow[],
): Promise<void> {
  if (!isBrowserOnline() || projects.length === 0) return;

  await putEntities(
    'projects',
    projects.map((p) => ({ ...p, id: String(p.id) })),
  );

  const blockRows: Array<Record<string, unknown> & { id: string }> = [];
  for (const p of projects) {
    const blocks = (p.blocks as Array<Record<string, unknown>>) || [];
    for (const b of blocks) {
      if (b?.id) {
        blockRows.push({
          ...b,
          id: String(b.id),
          project_id: p.id,
        });
      }
    }
  }
  if (blockRows.length > 0) {
    await putEntities('blocks', blockRows);
  }

  console.log('[OFFLINE] projetos gravados no cache', {
    projects: projects.length,
    blocks: blockRows.length,
  });
}

/**
 * Lista projetos para a tela GIS offline (projects → fallback map_projects).
 */
export async function loadOfflineProjectsList(): Promise<OfflineProjectRow[]> {
  console.log('[OFFLINE] carregando projetos do cache');

  const stored = await getAllEntities<OfflineProjectRow>('projects');
  const mapCaches = await getAllMapProjectCaches();
  const cacheByProject = new Map(
    mapCaches.map((m) => [m.projectId, m]),
  );

  if (stored.length > 0) {
    const list = stored.map((p) => {
      const mapCache = cacheByProject.get(String(p.id));
      const blocksFromProject = (p.blocks as Array<Record<string, unknown>>) || [];
      const blocksFromMap =
        mapCache?.lots?.map((l) => ({
          status: (l as Record<string, unknown>).status ?? 'Disponível',
          geometry:
            (l as Record<string, unknown>).bounds &&
            Array.isArray((l as Record<string, unknown>).bounds) &&
            ((l as Record<string, unknown>).bounds as unknown[]).length > 0
              ? { type: 'Polygon' }
              : null,
        })) ?? [];

      return {
        ...p,
        blocks:
          blocksFromProject.length > 0 ? blocksFromProject : blocksFromMap,
      };
    });

    console.log('[OFFLINE] projetos encontrados:', list.length);
    return list;
  }

  if (mapCaches.length > 0) {
    const list = mapCaches.map((m) => ({
      id: m.projectId,
      name:
        (m as MapProjectCacheRecord & { projectName?: string }).projectName ||
        `Projeto ${m.projectId.slice(0, 8)}`,
      location: '',
      blocks: (m.lots || []).map((l) => ({
        status: (l as Record<string, unknown>).status ?? 'Disponível',
        geometry:
          (l as Record<string, unknown>).bounds &&
          Array.isArray((l as Record<string, unknown>).bounds) &&
          ((l as Record<string, unknown>).bounds as unknown[]).length > 0
            ? { type: 'Polygon' }
            : null,
      })),
    }));
    console.log('[OFFLINE] projetos encontrados:', list.length);
    return list;
  }

  console.log('[OFFLINE] projetos encontrados:', 0);
  return [];
}

export async function loadOfflineMapGeometries(projectId: string): Promise<{
  lots: Record<string, unknown>[];
  blocksData: Record<string, unknown>[];
}> {
  const cached = await getMapProjectCache(projectId);
  if (cached) {
    console.log('[OFFLINE] mapa: cache map_projects', {
      projectId,
      lots: cached.lots?.length ?? 0,
    });
    return {
      lots: (cached.lots as Record<string, unknown>[]) || [],
      blocksData: (cached.blocksData as Record<string, unknown>[]) || [],
    };
  }

  const blocks = await getAllEntities<Record<string, unknown> & { id: string }>(
    'blocks',
  );
  const lotsStore = await getAllEntities<Record<string, unknown>>('lots');
  const projectBlocks = blocks.filter(
    (b) => String(b.project_id || '') === projectId,
  );
  const projectLots = lotsStore.filter(
    (l) => String(l.project_id || '') === projectId,
  );

  console.log('[OFFLINE] mapa: blocks/lots stores', {
    projectId,
    blocks: projectBlocks.length,
    lots: projectLots.length,
  });

  return { lots: projectLots, blocksData: projectBlocks };
}

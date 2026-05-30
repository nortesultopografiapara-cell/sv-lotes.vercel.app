/**
 * Cache local de projetos / mapa para modo offline.
 */

import { getOfflineDb } from '@/lib/offline/db';
import { isBrowserOnline } from '@/lib/offline/lotReservationOffline';
import { putEntity, putEntities, getAllEntities } from '@/lib/offline/store';
import type { MapProjectCacheRecord } from '@/lib/offline/types';

export type OfflineProjectRow = Record<string, unknown> & {
  id: string;
  name?: string;
  location?: string;
  blocks?: Array<Record<string, unknown>>;
};

function projectIdOf(p: Record<string, unknown>): string | null {
  const id = p.id ?? p.project_id;
  if (id == null || id === '') return null;
  return String(id);
}

function blockIdOf(b: Record<string, unknown>): string | null {
  const id = b.id ?? b.block_id;
  if (id == null || id === '') return null;
  return String(id);
}

function lotIdOf(lot: Record<string, unknown>): string | null {
  const id = lot.id ?? lot.lot_id;
  if (id == null || id === '') return null;
  return String(id);
}

/**
 * Grava lista de projetos (Supabase) + blocos aninhados com id.
 */
export async function cacheProjectsForOffline(
  projects: OfflineProjectRow[],
): Promise<void> {
  console.log('[CACHE] iniciando cache de projetos');
  console.log('[CACHE] projetos recebidos:', projects.length);

  if (!isIndexedDbAvailable()) {
    console.warn('[CACHE] IndexedDB indisponível');
    return;
  }

  if (!isBrowserOnline()) {
    console.log('[CACHE] pulado — navegador offline');
    return;
  }

  if (projects.length === 0) {
    console.log('[CACHE] nenhum projeto para gravar');
    return;
  }

  try {
    const blockRows: Array<Record<string, unknown> & { id: string }> = [];

    for (const raw of projects) {
      const pid = projectIdOf(raw);
      if (!pid) {
        console.warn('[CACHE] projeto sem id ignorado', raw);
        continue;
      }

      const name = String(raw.name || 'Sem nome');
      console.log('[CACHE] salvando projeto:', pid, name);

      const blocks = (raw.blocks as Array<Record<string, unknown>>) || [];
      const projectRow: Record<string, unknown> & { id: string } = {
        ...raw,
        id: pid,
        name,
        blocks_summary_count: blocks.length,
        cached_at: new Date().toISOString(),
      };

      await putEntity('projects', projectRow);

      for (const b of blocks) {
        const bid = blockIdOf(b);
        if (!bid) continue;
        blockRows.push({
          ...b,
          id: bid,
          project_id: pid,
        });
      }
    }

    if (blockRows.length > 0) {
      console.log('[CACHE] salvando blocos:', blockRows.length);
      await putEntities('blocks', blockRows);
    }

    console.log('[CACHE] cache concluído');
  } catch (err) {
    console.error('[CACHE] erro ao gravar projetos', err);
    throw err;
  }
}

/** Grava um projeto ao abrir na lista GIS. */
export async function cacheSingleProjectForOffline(
  project: Record<string, unknown>,
): Promise<void> {
  const pid = projectIdOf(project);
  if (!pid || !isBrowserOnline()) return;
  console.log('[CACHE] cache projeto aberto:', pid, project.name);
  await cacheProjectsForOffline([
    { ...project, id: pid } as OfflineProjectRow,
  ]);
}

/**
 * Persiste mapa completo: map_projects + projects + blocks + lots.
 */
export async function persistMapProjectOfflineCache(
  record: MapProjectCacheRecord & { projectName?: string },
): Promise<void> {
  if (!isIndexedDbAvailable() || !isBrowserOnline()) return;

  const projectId = String(record.projectId);
  const projectName =
    record.projectName ||
    String((record.lots[0] as Record<string, unknown>)?.projectName || '') ||
    `Projeto ${projectId.slice(0, 8)}`;

  console.log('[CACHE] persistindo mapa do projeto:', projectId, projectName);

  const db = await getOfflineDb();
  await db.put('map_projects', {
    ...record,
    projectName,
  });

  await putEntity('projects', {
    id: projectId,
    name: projectName,
    tenant_id: record.tenantId,
    cached_at: new Date().toISOString(),
    has_map_cache: true,
  });

  const blockRows: Array<Record<string, unknown> & { id: string }> = [];
  for (const b of record.blocksRaw || []) {
    const bid = blockIdOf(b as Record<string, unknown>);
    if (!bid) continue;
    blockRows.push({
      ...(b as Record<string, unknown>),
      id: bid,
      project_id: projectId,
    });
  }
  for (const b of record.blocksData || []) {
    const bid = blockIdOf(b as Record<string, unknown>);
    if (!bid) continue;
    blockRows.push({
      ...(b as Record<string, unknown>),
      id: bid,
      project_id: projectId,
    });
  }
  if (blockRows.length > 0) {
    console.log('[CACHE] salvando blocos do mapa:', blockRows.length);
    await putEntities('blocks', blockRows);
  }

  const lotRows: Array<Record<string, unknown> & { id: string }> = [];
  for (const lot of record.lots || []) {
    const lid = lotIdOf(lot as Record<string, unknown>);
    if (!lid) continue;
    lotRows.push({
      ...(lot as Record<string, unknown>),
      id: lid,
      project_id: projectId,
    });
  }
  if (lotRows.length > 0) {
    console.log('[CACHE] salvando lotes do mapa:', lotRows.length);
    await putEntities('lots', lotRows);
  }

  console.log('[CACHE] mapa persistido:', projectId);
}

export async function getAllMapProjectCaches(): Promise<
  (MapProjectCacheRecord & { projectName?: string })[]
> {
  const db = await getOfflineDb();
  return db.getAll('map_projects');
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
        name: p.name || mapCache?.projectName,
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
      name: m.projectName || `Projeto ${m.projectId.slice(0, 8)}`,
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
  const db = await getOfflineDb();
  const cached = await db.get('map_projects', projectId);
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

import { getOfflineDb, isIndexedDbAvailable } from '@/lib/offline/db';
import type { MapProjectCacheRecord } from '@/lib/offline/types';

type EntityStoreName =
  | 'projects'
  | 'blocks'
  | 'lots'
  | 'customers'
  | 'sales'
  | 'contracts'
  | 'finance_receipts';

export async function putEntity(
  store: EntityStoreName,
  record: Record<string, unknown> & { id: string },
): Promise<void> {
  const db = await getOfflineDb();
  await db.put(store, record);
}

export async function putEntities(
  store: EntityStoreName,
  records: Array<Record<string, unknown> & { id: string }>,
): Promise<void> {
  if (records.length === 0) return;
  const db = await getOfflineDb();
  const tx = db.transaction(store, 'readwrite');
  for (const raw of records) {
    const id = raw?.id != null ? String(raw.id) : '';
    if (!id) {
      console.warn('[CACHE] putEntities ignorado — sem id', store);
      continue;
    }
    await tx.store.put({ ...raw, id });
  }
  await tx.done;
}

export async function getEntity<T extends Record<string, unknown>>(
  store: EntityStoreName,
  id: string,
): Promise<T | undefined> {
  const db = await getOfflineDb();
  return (await db.get(store, id)) as T | undefined;
}

export async function getAllEntities<T extends Record<string, unknown>>(
  store: EntityStoreName,
): Promise<T[]> {
  const db = await getOfflineDb();
  return (await db.getAll(store)) as T[];
}

export async function saveMapProjectCache(
  record: MapProjectCacheRecord & { projectName?: string },
): Promise<void> {
  const { persistMapProjectOfflineCache } = await import(
    '@/lib/offline/projectsOfflineCache'
  );
  await persistMapProjectOfflineCache(record);
  console.log('OFFLINE_MAP_CACHE_SAVED', {
    projectId: record.projectId,
    lots: record.lots.length,
    updatedAt: record.updatedAt,
  });
}

/**
 * Remove cache local do mapa para um projeto (após reimportar TXT / atualizar GIS).
 */
export async function clearProjectMapOfflineCache(
  projectId: string,
): Promise<void> {
  if (!isIndexedDbAvailable()) return;

  const db = await getOfflineDb();
  const pid = String(projectId);

  try {
    await db.delete('map_projects', pid);
  } catch {
    /* ignore */
  }

  const deleteByProject = async (
    store: 'blocks' | 'lots' | 'projects',
  ): Promise<number> => {
    const all = await db.getAll(store);
    let removed = 0;
    const tx = db.transaction(store, 'readwrite');
    for (const row of all) {
      const rowPid = String(
        (row as Record<string, unknown>).project_id ??
          (row as Record<string, unknown>).id ??
          '',
      );
      const match =
        store === 'projects'
          ? String((row as Record<string, unknown>).id) === pid
          : rowPid === pid;
      if (!match) continue;
      const key = String((row as Record<string, unknown>).id ?? '');
      if (key) {
        await tx.store.delete(key);
        removed += 1;
      }
    }
    await tx.done;
    return removed;
  };

  const blocksRemoved = await deleteByProject('blocks');
  const lotsRemoved = await deleteByProject('lots');
  const projectsRemoved = await deleteByProject('projects');

  console.log('[CACHE] cache local do mapa limpo', {
    projectId: pid,
    blocks: blocksRemoved,
    lots: lotsRemoved,
    projects: projectsRemoved,
  });
}

export async function getMapProjectCache(
  projectId: string,
): Promise<MapProjectCacheRecord | undefined> {
  const db = await getOfflineDb();
  const row = await db.get('map_projects', projectId);
  if (row) {
    console.log('OFFLINE_MAP_CACHE_LOADED', {
      projectId,
      lots: row.lots.length,
      updatedAt: row.updatedAt,
    });
  }
  return row;
}

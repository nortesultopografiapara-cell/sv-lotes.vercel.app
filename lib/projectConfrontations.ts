/**
 * Confrontações automáticas por projeto — fonte reutilizável (prancha, contrato, memorial).
 * Persistência temporária em localStorage até colunas dedicadas no Supabase.
 */

import type { LotSheetSideConfrontants } from '@/lib/lotSheetEnrichment';

export type LotAutoConfrontationRecord = {
  blockId: string;
  lotNumber: string;
  confrontants: LotSheetSideConfrontants;
};

export type ProjectConfrontationSnapshot = {
  projectId: string;
  computedAt: string;
  version: 1;
  lots: LotAutoConfrontationRecord[];
};

const STORAGE_PREFIX = 'sv_lotes_project_auto_confrontants_';

export function projectConfrontationStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

export function saveProjectConfrontationSnapshot(
  snapshot: ProjectConfrontationSnapshot,
): void {
  if (typeof window === 'undefined' || !snapshot.projectId) return;
  localStorage.setItem(
    projectConfrontationStorageKey(snapshot.projectId),
    JSON.stringify(snapshot),
  );
}

export function loadProjectConfrontationSnapshot(
  projectId: string,
): ProjectConfrontationSnapshot | null {
  if (typeof window === 'undefined' || !projectId) return null;
  try {
    const raw = localStorage.getItem(projectConfrontationStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectConfrontationSnapshot;
    if (parsed?.projectId !== projectId || !Array.isArray(parsed.lots)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getProjectLotConfrontants(
  projectId: string,
  blockId: string,
): LotSheetSideConfrontants | null {
  const snap = loadProjectConfrontationSnapshot(projectId);
  if (!snap) return null;
  const row = snap.lots.find((l) => l.blockId === blockId);
  return row?.confrontants ?? null;
}

export function clearProjectConfrontationSnapshot(projectId: string): void {
  if (typeof window === 'undefined' || !projectId) return;
  localStorage.removeItem(projectConfrontationStorageKey(projectId));
}

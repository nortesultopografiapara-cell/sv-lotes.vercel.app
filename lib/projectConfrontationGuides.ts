/**
 * Guias de confrontante reutilizáveis por projeto (local até migration Supabase).
 */

import type { ConfrontantPresetType } from '@/lib/confrontantTypes';

export type ProjectConfrontationGuide = {
  id: string;
  project_id: string;
  name: string;
  type: ConfrontantPresetType | string | null;
  geometry?: { type: string; coordinates: unknown } | null;
  applies_to?: string | null;
  created_at: string;
  updated_at: string;
};

const STORAGE_PREFIX = 'sv_lotes_project_confrontation_guides_';

export function guidesStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

export function loadProjectConfrontationGuides(
  projectId: string,
): ProjectConfrontationGuide[] {
  if (typeof window === 'undefined' || !projectId) return [];
  try {
    const raw = localStorage.getItem(guidesStorageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProjectConfrontationGuide[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjectConfrontationGuides(
  projectId: string,
  guides: ProjectConfrontationGuide[],
): void {
  if (typeof window === 'undefined' || !projectId) return;
  localStorage.setItem(guidesStorageKey(projectId), JSON.stringify(guides));
}

export function upsertProjectConfrontationGuide(
  projectId: string,
  guide: Omit<ProjectConfrontationGuide, 'id' | 'created_at' | 'updated_at'> & {
    id?: string;
  },
): ProjectConfrontationGuide {
  const list = loadProjectConfrontationGuides(projectId);
  const now = new Date().toISOString();
  const id = guide.id || `pcg-${Date.now()}`;
  const row: ProjectConfrontationGuide = {
    id,
    project_id: projectId,
    name: guide.name,
    type: guide.type ?? null,
    geometry: guide.geometry ?? null,
    applies_to: guide.applies_to ?? null,
    created_at: now,
    updated_at: now,
  };
  const idx = list.findIndex((g) => g.id === id);
  if (idx >= 0) list[idx] = { ...list[idx], ...row, updated_at: now };
  else list.push(row);
  saveProjectConfrontationGuides(projectId, list);
  return row;
}

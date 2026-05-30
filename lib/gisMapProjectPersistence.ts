/** Persistência do projeto aberto na página /map (URL + localStorage). */

export const GIS_MAP_PROJECT_ID_KEY = 'sv_gis_selectedProjectId';
export const GIS_MAP_PROJECT_NAME_KEY = 'sv_gis_selectedProjectName';

export function persistGisMapProject(project: {
  id: string;
  name?: string | null;
}): void {
  if (typeof window === 'undefined' || !project.id) return;
  localStorage.setItem(GIS_MAP_PROJECT_ID_KEY, project.id);
  if (project.name) {
    localStorage.setItem(GIS_MAP_PROJECT_NAME_KEY, project.name);
  }
}

export function clearGisMapProjectPersistence(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GIS_MAP_PROJECT_ID_KEY);
  localStorage.removeItem(GIS_MAP_PROJECT_NAME_KEY);
}

export function readGisMapProjectIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const id = new URLSearchParams(window.location.search).get('projectId');
  return id?.trim() || null;
}

export function gisMapUrlWithProject(projectId: string): string {
  return `/map?projectId=${encodeURIComponent(projectId)}`;
}

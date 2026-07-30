/**
 * Logradouros (street_guides) — tipos, rótulos e payload de persistência.
 */

import { flattenLineStringCoordinates } from '@/lib/streetGuideConfrontation';

export const STREET_TYPES = [
  'Rua',
  'Avenida',
  'Travessa',
  'Alameda',
  'Estrada',
  'Rodovia',
  'Acesso',
  'Vicinal',
  'Outro',
] as const;

export type StreetType = (typeof STREET_TYPES)[number];

export type StreetGuideRecord = {
  id?: string;
  tenant_id?: string | null;
  project_id?: string;
  type?: string | null;
  name?: string | null;
  code?: string | null;
  width?: number | string | null;
  notes?: string | null;
  geometry_geojson?: { type: string; coordinates: number[][] } | null;
  geometry?: { type: string; coordinates: number[][] } | null;
  active?: boolean | null;
  visible?: boolean;
};

export type StreetGuideFormValues = {
  type: StreetType;
  name: string;
  code: string;
  width: string;
  notes: string;
  active: boolean;
};

export function emptyStreetGuideForm(): StreetGuideFormValues {
  return {
    type: 'Rua',
    name: '',
    code: '',
    width: '',
    notes: '',
    active: true,
  };
}

export function streetGuideFromRecord(g: StreetGuideRecord): StreetGuideFormValues {
  return {
    type: (STREET_TYPES.includes((g.type || 'Rua') as StreetType)
      ? g.type
      : 'Rua') as StreetType,
    name: String(g.name || '').replace(/^Rua\/Eixo\s*/i, '').trim(),
    code: String(g.code || ''),
    width:
      g.width !== null && g.width !== undefined && g.width !== ''
        ? String(g.width)
        : '',
    notes: String(g.notes || ''),
    active: g.active !== false,
  };
}

/** Nome legado para endereços de lote / memorial (compõe type+name). */
export function formatStreetDisplay(
  type?: string | null,
  name?: string | null,
): string {
  const raw = String(name || '').trim();
  if (!raw || /^rua\/eixo/i.test(raw) || /sem nome/i.test(raw)) {
    return 'Rua/Eixo sem nome';
  }
  const t = String(type || 'Rua').trim();
  const lower = raw.toLowerCase();
  if (
    lower.startsWith(t.toLowerCase() + ' ') ||
    lower === t.toLowerCase()
  ) {
    return raw;
  }
  return `${t} ${raw}`;
}

export type StreetOfficialNameSource =
  | 'name_with_prefix'
  | 'type_and_name'
  | 'name_only'
  | 'unnamed';

export type StreetOfficialNameDiagnosis = {
  id: string | null;
  type: string;
  name: string;
  code: string | null;
  notes: string | null;
  /** displayName de entrada (pode ser sintético/stale — NÃO é fonte oficial). */
  incomingDisplayName: string | null;
  prefixInName: string | null;
  label: string;
  source: StreetOfficialNameSource;
  divergence: boolean;
  divergenceDetail: string | null;
};

function isBlankOrUnnamedStreetName(name: string): boolean {
  const raw = name.trim();
  if (!raw) return true;
  return (
    /^rua\/eixo/i.test(raw) ||
    /sem nome/i.test(raw) ||
    /^via sem identifica/i.test(raw)
  );
}

/** Prefixo de tipo presente no próprio campo name (ex.: "Avenida 04"). */
export function detectStreetTypePrefixInName(name: string): string | null {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const sorted = [...STREET_TYPES].sort((a, b) => b.length - a.length);
  for (const t of sorted) {
    const tl = t.toLowerCase();
    if (lower === tl || lower.startsWith(`${tl} `)) return t;
  }
  return null;
}

/**
 * Nome oficial único para MapGIS, Prancha Geral, Quadro e Relatório de Vias.
 * Nunca usa displayName sintético. Nunca troca prefixo já presente em `name`.
 */
export function diagnoseOfficialStreetName(
  guide: Record<string, unknown>,
): StreetOfficialNameDiagnosis {
  const id = guide.id != null ? String(guide.id) : null;
  const type = String(guide.type || '').trim();
  const name = String(guide.name || '').trim();
  const code =
    guide.code != null && String(guide.code).trim()
      ? String(guide.code).trim()
      : null;
  const notes =
    guide.notes != null && String(guide.notes).trim()
      ? String(guide.notes).trim()
      : null;
  const incomingDisplayName =
    guide.displayName != null && String(guide.displayName).trim()
      ? String(guide.displayName).trim()
      : null;
  const prefixInName = detectStreetTypePrefixInName(name);

  if (isBlankOrUnnamedStreetName(name)) {
    return {
      id,
      type,
      name,
      code,
      notes,
      incomingDisplayName,
      prefixInName,
      label: 'Via sem identificação',
      source: 'unnamed',
      divergence: false,
      divergenceDetail: null,
    };
  }

  if (prefixInName) {
    const divergence = !!(
      type && type.toLowerCase() !== prefixInName.toLowerCase()
    );
    return {
      id,
      type,
      name,
      code,
      notes,
      incomingDisplayName,
      prefixInName,
      label: name,
      source: 'name_with_prefix',
      divergence,
      divergenceDetail: divergence
        ? `type="${type}" diverge do prefixo em name="${name}"; usando name cadastrado`
        : null,
    };
  }

  if (type) {
    const label = `${type} ${name}`;
    const staleRebuild =
      !!incomingDisplayName &&
      incomingDisplayName !== label &&
      !isBlankOrUnnamedStreetName(incomingDisplayName);
    return {
      id,
      type,
      name,
      code,
      notes,
      incomingDisplayName,
      prefixInName,
      label,
      source: 'type_and_name',
      divergence: staleRebuild,
      divergenceDetail: staleRebuild
        ? `displayName sintético/stale "${incomingDisplayName}" ignorado; oficial="${label}"`
        : null,
    };
  }

  return {
    id,
    type,
    name,
    code,
    notes,
    incomingDisplayName,
    prefixInName,
    label: name,
    source: 'name_only',
    divergence: false,
    divergenceDetail: null,
  };
}

export function resolveOfficialStreetLabel(
  guide: Record<string, unknown>,
): string {
  return diagnoseOfficialStreetName(guide).label;
}

export function normalizeStreetGuideRow(
  g: Record<string, unknown>,
): Record<string, unknown> {
  const geo =
    (g.geometry_geojson as StreetGuideRecord['geometry_geojson']) ||
    (g.geometry as StreetGuideRecord['geometry']) ||
    null;
  const name = String(g.name || '').trim() || 'Rua/Eixo sem nome';
  const type = String(g.type || 'Rua');
  const displayName = resolveOfficialStreetLabel({ ...g, name, type });
  return {
    ...g,
    geometry_geojson: geo,
    geometry: geo,
    name,
    type,
    displayName,
    visible: g.visible !== false,
    active: g.active !== false,
  };
}

/** Normaliza coordenadas [lng, lat] de uma polilinha (mín. 2 vértices). */
export function normalizeStreetGuideLineCoordinates(
  coords: number[][],
): number[][] | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const valid = coords.filter(
    (c) =>
      Array.isArray(c) &&
      c.length >= 2 &&
      Number.isFinite(c[0]) &&
      Number.isFinite(c[1]),
  );
  if (valid.length < 2) return null;
  return valid;
}

/** Primeiro e último vértice (compat. ruas antigas com 2 pontos). */
export function streetGuideLineEndpoints(coords: number[][]): {
  start: [number, number];
  end: [number, number];
} | null {
  const line = normalizeStreetGuideLineCoordinates(coords);
  if (!line) return null;
  return {
    start: [line[0][0], line[0][1]],
    end: [line[line.length - 1][0], line[line.length - 1][1]],
  };
}

/** Lê polilinha de geometry / geometry_geojson (2 ou N vértices). */
export function readStreetGuideLineCoordinates(
  g: StreetGuideRecord | Record<string, unknown>,
): number[][] | null {
  const geo =
    (g.geometry_geojson as StreetGuideRecord['geometry_geojson']) ||
    (g.geometry as StreetGuideRecord['geometry']) ||
    null;
  if (!geo?.coordinates) return null;
  return flattenLineStringCoordinates(geo.coordinates);
}

export function buildStreetGuideInsertPayload(params: {
  tenantId: string | null;
  projectId: string;
  form: StreetGuideFormValues;
  coordinates: number[][];
}): Record<string, unknown> {
  const normalized = normalizeStreetGuideLineCoordinates(params.coordinates);
  if (!normalized) {
    throw new Error('Geometria da linha inválida (mínimo 2 vértices).');
  }
  const geojson = {
    type: 'LineString',
    coordinates: normalized,
  };
  const widthNum = params.form.width
    ? Number(String(params.form.width).replace(',', '.'))
    : null;

  return {
    tenant_id: params.tenantId,
    project_id: params.projectId,
    type: params.form.type,
    name: params.form.name.trim() || 'Rua/Eixo sem nome',
    code: params.form.code.trim() || null,
    width: Number.isFinite(widthNum) ? widthNum : null,
    notes: params.form.notes.trim() || null,
    active: params.form.active,
    geometry_geojson: geojson,
    geometry: geojson,
    updated_at: new Date().toISOString(),
  };
}

export function buildLotAddressLine(block: Record<string, unknown>): string {
  const rawName = String(block.front_street_name || '').trim();
  const street =
    rawName && !/sem nome/i.test(rawName)
      ? rawName
      : formatStreetDisplay(
          block.front_street_type as string,
          block.front_street_name as string,
        );
  const quadra = String(
    block.block_name || block.block || block.quadra || '',
  ).trim();
  const lote = String(block.number || block.lot || '').trim();
  const parts: string[] = [];
  if (street && street !== 'Rua/Eixo sem nome') parts.push(street);
  if (quadra) parts.push(`Quadra ${quadra}`);
  if (lote) parts.push(`Lote ${lote}`);
  parts.push('S/N');
  return parts.join(', ') || 'S/N';
}

/** Texto para memorial: "confrontando pela frente com a Rua X" */
export function formatMemorialFrontClause(block: Record<string, unknown>): string {
  const rawName = String(block.front_street_name || '').trim();
  const street =
    rawName && !/sem nome/i.test(rawName)
      ? rawName
      : formatStreetDisplay(
          block.front_street_type as string,
          block.front_street_name as string,
        );
  if (!street || street === 'Rua/Eixo sem nome') {
    return 'confrontando pela frente com via de acesso';
  }
  return `confrontando pela frente com a ${street}`;
}

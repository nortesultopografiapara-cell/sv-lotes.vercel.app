/**
 * Logradouros (street_guides) — tipos, rótulos e payload de persistência.
 */

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

/** Nome exibido no mapa / prancha / contrato. */
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

export function normalizeStreetGuideRow(
  g: Record<string, unknown>,
): Record<string, unknown> {
  const geo =
    (g.geometry_geojson as StreetGuideRecord['geometry_geojson']) ||
    (g.geometry as StreetGuideRecord['geometry']) ||
    null;
  const name = String(g.name || '').trim() || 'Rua/Eixo sem nome';
  const type = String(g.type || 'Rua');
  return {
    ...g,
    geometry_geojson: geo,
    geometry: geo,
    name,
    type,
    displayName: formatStreetDisplay(type, name),
    visible: g.visible !== false,
    active: g.active !== false,
  };
}

export function buildStreetGuideInsertPayload(params: {
  tenantId: string | null;
  projectId: string;
  form: StreetGuideFormValues;
  coordinates: number[][];
}): Record<string, unknown> {
  const geojson = {
    type: 'LineString',
    coordinates: params.coordinates,
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

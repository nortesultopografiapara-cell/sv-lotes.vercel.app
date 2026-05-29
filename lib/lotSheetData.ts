/**
 * Coleta de dados para prancha técnica do lote (mapa GIS).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { polygon as turfPolygon, centroid, distance, booleanIntersects } from '@turf/turf';
import { resolveLotMeasuresFromBlock } from '@/lib/lotChanfre';

export type LotSheetGeometry = {
  /** [lat, lng] fechado ou aberto */
  ring: [number, number][];
  /** metros locais [x, y] centrados no lote */
  localRing: [number, number][];
  bboxMeters: { minX: number; maxX: number; minY: number; maxY: number };
};

export type LotSheetNeighbor = {
  label: string;
  side?: string;
};

export type LotSheetPayload = {
  project: Record<string, unknown>;
  lot: Record<string, unknown>;
  owner: string;
  company: Record<string, unknown> | null;
  technicalResponsible: Record<string, unknown> | null;
  neighbors: LotSheetNeighbor[];
  geometry: LotSheetGeometry;
  measures: {
    frente: string;
    fundo: string;
    ladoDireito: string;
    ladoEsquerdo: string;
    chanfre: string;
    area: string;
  };
  scaleLabel: string;
};

function formatMeasure(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (!Number.isFinite(n)) return String(val);
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

function latLngRingFromBlock(block: Record<string, unknown>): [number, number][] {
  const geom = block.geometry as { type?: string; coordinates?: number[][][] } | undefined;
  if (geom?.type === 'Polygon' && geom.coordinates?.[0]?.length) {
    const ring = geom.coordinates[0].map((c) => [c[1], c[0]] as [number, number]);
    if (ring.length > 1) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    }
    return ring;
  }
  const bounds = block.bounds as [number, number][] | undefined;
  if (bounds?.length) {
    const ring = [...bounds];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    return ring;
  }
  return [];
}

function toLocalMeters(
  ring: [number, number][],
): { localRing: [number, number][]; bbox: LotSheetGeometry['bboxMeters'] } {
  if (!ring.length) {
    return {
      localRing: [],
      bbox: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    };
  }
  const origin = ring[0];
  const mPerDegLat = 111320;
  const mPerDegLng =
    111320 * Math.cos((origin[0] * Math.PI) / 180);
  const localRing = ring.map(([lat, lng]) => [
    (lng - origin[1]) * mPerDegLng,
    (lat - origin[0]) * mPerDegLat,
  ] as [number, number]);

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of localRing) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    localRing,
    bbox: { minX, maxX, minY, maxY },
  };
}

function parseScaleDenominator(escala: string | null | undefined, maxDimM: number): number {
  if (escala) {
    const m = String(escala).match(/1\s*[/:]\s*(\d+)/i);
    if (m?.[1]) return Number(m[1]) || 600;
  }
  const targetPaperM = 0.18;
  const denom = Math.max(100, Math.round(maxDimM / targetPaperM));
  return Math.round(denom / 50) * 50 || 600;
}

function findNeighbors(
  targetId: string,
  targetRing: [number, number][],
  blocks: Record<string, unknown>[],
  streetGuides: { name?: string }[],
): LotSheetNeighbor[] {
  if (targetRing.length < 3) return [];

  const coords = targetRing.map(([lat, lng]) => [lng, lat]);
  const targetPoly = turfPolygon([coords]);
  const found: LotSheetNeighbor[] = [];
  const seen = new Set<string>();

  for (const b of blocks) {
    if (String(b.id) === targetId) continue;
    const ring = latLngRingFromBlock(b);
    if (ring.length < 3) continue;
    const otherCoords = ring.map(([lat, lng]) => [lng, lat]);
    try {
      const otherPoly = turfPolygon([otherCoords]);
      const touches =
        booleanIntersects(targetPoly, otherPoly) ||
        distance(centroid(targetPoly), centroid(otherPoly), { units: 'meters' }) <
          35;
      if (!touches) continue;
      const num = b.number || b.lot || '?';
      const blockName = b.block_name || b.block || b.quadra || '';
      const label = blockName
        ? `Lote ${num} (Q. ${blockName})`
        : `Lote ${num}`;
      if (!seen.has(label)) {
        seen.add(label);
        found.push({ label });
      }
    } catch {
      /* ignore invalid geom */
    }
  }

  if (streetGuides.length) {
    found.push({ label: 'Rua / via de acesso' });
  }

  if (found.length === 0) {
    found.push({ label: 'Confrontante não identificado' });
  }

  return found.slice(0, 12);
}

export async function loadLotSheetPayload(
  supabase: SupabaseClient,
  params: {
    projectId: string;
    blockId: string;
    tenantId: string;
  },
): Promise<LotSheetPayload> {
  console.log('LOT_SHEET_DATA_LOADED', { projectId: params.projectId, blockId: params.blockId });

  const { data: block, error: blockErr } = await supabase
    .from('blocks')
    .select('*, projects(*), customers(name, full_name)')
    .eq('id', params.blockId)
    .single();

  if (blockErr || !block) {
    throw new Error(blockErr?.message || 'Lote não encontrado.');
  }

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.projectId)
    .single();

  if (projErr || !project) {
    throw new Error(projErr?.message || 'Empreendimento não encontrado.');
  }

  const { data: allBlocks } = await supabase
    .from('blocks')
    .select('id, number, lot, block, block_name, quadra, geometry, status')
    .eq('project_id', params.projectId);

  const { data: guides } = await supabase
    .from('street_guides')
    .select('id, name')
    .eq('project_id', params.projectId)
    .limit(5);

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', params.tenantId)
    .maybeSingle();

  const { data: techRows } = await supabase
    .from('technical_responsibles')
    .select('*')
    .eq('company_id', params.tenantId)
    .eq('active', true)
    .limit(1);

  const ring = latLngRingFromBlock(block as Record<string, unknown>);
  if (ring.length < 3) {
    throw new Error('Lote sem geometria válida no mapa.');
  }

  const { localRing, bbox } = toLocalMeters(ring);
  const maxDim = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, 1);
  const scaleDenom = parseScaleDenominator(
    (project as Record<string, unknown>).escala_padrao as string,
    maxDim,
  );

  const lotMeasures = resolveLotMeasuresFromBlock(block as Record<string, unknown>);
  const chanfre = lotMeasures.chanfre;
  const chanfreStr = chanfre?.total
    ? `${chanfre.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m`
    : '—';

  const customer = (block as Record<string, unknown>).customers as Record<string, unknown> | null;
  const owner =
    (customer?.name as string) ||
    (customer?.full_name as string) ||
    (block as Record<string, unknown>).customer_name as string ||
    '—';

  const neighbors = findNeighbors(
    params.blockId,
    ring,
    (allBlocks || []) as Record<string, unknown>[],
    (guides || []) as { name?: string }[],
  );

  console.log('LOT_SHEET_GEOMETRY_PROCESSED', {
    points: ring.length,
    neighbors: neighbors.length,
    scale: scaleDenom,
  });

  return {
    project: project as Record<string, unknown>,
    lot: block as Record<string, unknown>,
    owner,
    company: (company as Record<string, unknown>) || null,
    technicalResponsible: (techRows?.[0] as Record<string, unknown>) || null,
    neighbors,
    geometry: {
      ring,
      localRing,
      bboxMeters: bbox,
    },
    measures: {
      frente: formatMeasure(lotMeasures.sides.frente ?? (block as Record<string, unknown>).frente),
      fundo: formatMeasure(lotMeasures.sides.fundo ?? (block as Record<string, unknown>).Fundo ?? (block as Record<string, unknown>).fundo),
      ladoDireito: formatMeasure(
        lotMeasures.sides.ladoDireito ?? (block as Record<string, unknown>)['Lado Dir.'],
      ),
      ladoEsquerdo: formatMeasure(
        lotMeasures.sides.ladoEsquerdo ?? (block as Record<string, unknown>)['Lado Esq.'],
      ),
      chanfre: chanfreStr,
      area: block.area
        ? `${Number(block.area).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²`
        : '—',
    },
    scaleLabel: `1 : ${scaleDenom}`,
  };
}

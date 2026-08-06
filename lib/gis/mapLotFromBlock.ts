/**
 * Converte um registro `blocks` em objeto de lote do GISMap (patch/realtime).
 * Não recalcula dimensões O(N) — usa medidas já persistidas no block.
 */

import { resolveLotMeasuresFromBlock, parseBlockSideLength } from '@/lib/lotChanfre';
import { resolveLotFrontStreetDisplay } from '@/lib/resolveFrontStreetGuide';
import { formatStreetDisplay } from '@/lib/streetGuide';
export type MapLotBoundsPair = [number, number];

function boundsFromGeometry(block: Record<string, unknown>): {
  bounds: MapLotBoundsPair[];
  geometryType: string;
  coordCount: number;
} {
  const geometry = block.geometry as
    | { type?: string; coordinates?: unknown }
    | null
    | undefined;
  if (!geometry?.type || !geometry.coordinates) {
    return { bounds: [], geometryType: 'Unknown', coordCount: 0 };
  }
  const gType = String(geometry.type);
  let ring: number[][] | null = null;
  if (gType === 'Polygon') {
    ring = (geometry.coordinates as number[][][])?.[0] ?? null;
  } else if (gType === 'MultiPolygon') {
    ring = (geometry.coordinates as number[][][][])?.[0]?.[0] ?? null;
  } else if (gType === 'LineString') {
    ring = geometry.coordinates as number[][];
  }
  if (!Array.isArray(ring) || ring.length === 0) {
    return { bounds: [], geometryType: gType, coordCount: 0 };
  }
  const bounds: MapLotBoundsPair[] = [];
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    bounds.push([lat, lng]);
  }
  return { bounds, geometryType: gType, coordCount: bounds.length };
}

/** Normaliza 1 block → lote do mapa (sem calculateLotDimensions global). */
export function mapLotFromBlockRow(
  b: Record<string, unknown>,
  streetGuides: unknown[] = [],
  opts?: { pendingPrice?: number | null },
): Record<string, unknown> | null {
  if (!b?.id) return null;
  const { bounds, geometryType, coordCount } = boundsFromGeometry(b);
  if (bounds.length === 0) return null;

  let lotMeasures: ReturnType<typeof resolveLotMeasuresFromBlock>;
  try {
    lotMeasures = resolveLotMeasuresFromBlock(b);
  } catch {
    lotMeasures = {
      sides: {
        frente: parseBlockSideLength(b.frente),
        fundo: parseBlockSideLength(b.Fundo ?? b.fundo),
        ladoDireito: parseBlockSideLength(b['Lado Dir.']),
        ladoEsquerdo: parseBlockSideLength(b['Lado Esq.']),
      },
      chanfre: null,
      curva: null,
    };
  }

  const pending = opts?.pendingPrice;
  const blockPrice =
    pending !== undefined
      ? pending ?? 0
      : b.price !== null && b.price !== undefined
        ? Number(b.price)
        : 0;

  const projects = b.projects as { name?: string } | null | undefined;
  const customers = b.customers as { name?: string } | null | undefined;

  const lot: Record<string, unknown> = {
    id: b.id,
    project_id: b.project_id,
    block: b.block_name || b.name || '?',
    projectName: projects?.name || '?',
    customerName: customers?.name || null,
    customerId: b.customer_id || null,
    saleId: b.sale_id || null,
    contractId: b.contract_id || null,
    broker_id: b.broker_id || null,
    tenant_id: b.tenant_id || b.company_id || null,
    company_id: b.company_id || b.tenant_id || null,
    reservation_date: b.reservation_date || null,
    reservation_expires_at: b.reservation_expires_at || null,
    reserved_by_user_id: b.reserved_by_user_id || null,
    reserved_by_name: b.reserved_by_name || null,
    signal_amount: b.signal_amount,
    signal_date: b.signal_date,
    signal_payment_method: b.signal_payment_method,
    signal_notes: b.signal_notes,
    number: b.number || '0',
    status: b.status || 'Disponível',
    area: b.area !== null && b.area !== undefined ? Number(b.area) : 0,
    price: blockPrice,
    geometryType,
    coordCount,
    bounds,
    segments_json: b.segments_json,
    front_segment_index: b.front_segment_index ?? null,
    source_import: b.source_import ?? null,
    perimeter: b.perimeter ?? null,
    frente: lotMeasures.sides.frente,
    Fundo: lotMeasures.sides.fundo,
    'Lado Dir.': lotMeasures.sides.ladoDireito,
    'Lado Esq.': lotMeasures.sides.ladoEsquerdo,
    chanfreInfo: lotMeasures.chanfre,
    frontStreetName: b.front_street_name || null,
    frontStreetType: b.front_street_type || null,
    frontStreetWidth: b.front_street_width ?? null,
    frontStreetId: b.front_street_id || null,
  };

  lot.frontStreetDisplay =
    resolveLotFrontStreetDisplay(lot, streetGuides as never) ||
    (b.front_street_name
      ? formatStreetDisplay(
          b.front_street_type as string | null | undefined,
          String(b.front_street_name),
        )
      : null);

  return lot;
}

export function normalizeBlockKeyForMap(name: unknown): string {
  return String(name || '')
    .trim()
    .toUpperCase()
    .replace(/^QUADRA\s+/i, '')
    .replace(/\s+/g, ' ');
}

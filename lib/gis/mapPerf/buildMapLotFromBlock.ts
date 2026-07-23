/**
 * Monta lotes do mapa a partir de rows blocks — SEM calculateLotDimensions O(n²).
 * Dimensões vêm das colunas persistidas; recálculo só sob demanda (popup/edição).
 */

import { formatStreetDisplay } from '@/lib/streetGuide';
import {
  parseBlockSideLength,
  resolveLotMeasuresFromBlock,
} from '@/lib/lotChanfre';

export type MapLotBuildHelpers = {
  boundsFromBlockGeometry: (
    b: Record<string, unknown>,
    number?: unknown,
  ) => {
    bounds: Array<[number, number]>;
    geometryType: string;
    coordCount: number;
  };
  resolveLotFrontStreetDisplay: (
    b: Record<string, unknown>,
    streetGuides?: unknown[],
  ) => string | null;
  pendingPrices?: Map<string, number | null>;
};

export function buildMapLotFromBlock(
  b: Record<string, unknown>,
  streetGuides: unknown[],
  helpers: MapLotBuildHelpers,
  precomputed?: {
    bounds: Array<[number, number]>;
    geometryType: string;
    coordCount: number;
  },
): Record<string, unknown> | null {
  const geo =
    precomputed ||
    helpers.boundsFromBlockGeometry(b, b.number);

  if (!geo.bounds.length) return null;

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

  const pendingManualPrice = helpers.pendingPrices?.get(String(b.id));
  const blockPrice =
    pendingManualPrice !== undefined
      ? pendingManualPrice ?? 0
      : b.price !== null && b.price !== undefined
        ? Number(b.price)
        : 0;

  const projects = b.projects as { name?: string } | null | undefined;
  const customers = b.customers as { name?: string } | null | undefined;

  return {
    id: b.id,
    project_id: b.project_id,
    block: b.block_name || b.name || '?',
    projectName: projects?.name || '?',
    customerName: customers?.name || null,
    customerId: b.customer_id || null,
    saleId: b.sale_id || null,
    contractId: b.contract_id || null,
    signal_amount: b.signal_amount,
    signal_date: b.signal_date,
    signal_payment_method: b.signal_payment_method,
    signal_notes: b.signal_notes,
    number: b.number || '0',
    status: b.status || 'Disponível',
    area: b.area !== null && b.area !== undefined ? Number(b.area) : 0,
    price: blockPrice,
    geometryType: geo.geometryType,
    coordCount: geo.coordCount,
    bounds: geo.bounds,
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
    frontStreetDisplay:
      helpers.resolveLotFrontStreetDisplay(b, streetGuides) ||
      (b.front_street_name
        ? formatStreetDisplay(
            b.front_street_type as string | null | undefined,
            String(b.front_street_name),
          )
        : null),
    updated_at: b.updated_at ?? null,
  };
}

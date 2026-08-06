/**
 * Atualização/reimportação de lote individual (TXT Civil 3D) sem apagar a quadra.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  civil3dLotToImportPayload,
  parseCivil3dTxtLots,
  type Civil3dImportLotPayload,
} from '@/lib/civil3dTxtParser';
import { persistBlockPatch } from '@/lib/blockFrontPersist';
import {
  getOfficialLotMeasurements,
  officialSegmentsToLotSegmentRows,
} from '@/lib/officialLotMeasurements';
import {
  buildBlockMatchKey,
  lotNumbersMatch,
  normalizeLotNumberForMatch,
} from '@/lib/shapefileImport';

export type IndividualLotUpdateMode =
  | 'geometry_technical'
  | 'geometry_confrontations'
  | 'full_replacement';

/** Campos comerciais/CRM — nunca incluir no patch de atualização de lote existente. */
export const COMMERCIAL_FIELDS_PRESERVED = [
  'id',
  'project_id',
  'block_name',
  'name',
  'number',
  'lot_number',
  'price',
  'status',
  'customer_id',
  'sale_id',
  'contract_id',
  'broker_id',
  'reservation_expires_at',
  'reservation_date',
  'reserved_by_user_id',
  'reserved_by_name',
  'signal_amount',
  'signal_date',
  'signal_payment_method',
  'signal_notes',
  'matricula',
  'created_at',
  'tenant_id',
  'company_id',
] as const;

const SEGMENT_METADATA_KEYS = [
  'confrontant',
  'confrontante',
  'confrontant_type',
  'confrontant_source',
  'manual_confrontant',
  'manual_confrontant_type',
  'manual_confrontant_source',
  'official_side',
  'officialSide',
] as const;

export type IndividualLotTxtParseResult = {
  lots: Civil3dImportLotPayload[];
  lotNames: string[];
  multipleLots: boolean;
  empty: boolean;
};

export function parseTxtLotsForIndividualUpdate(
  text: string,
  proj4String: string,
  projectCenter?: { lat: number; lng: number } | null,
): IndividualLotTxtParseResult {
  const parsed = parseCivil3dTxtLots(text);
  const lots = parsed.map((lot) =>
    civil3dLotToImportPayload(lot, proj4String, projectCenter ?? null),
  );
  const lotNames = lots.map((l) => String(l.name).trim());
  return {
    lots,
    lotNames,
    multipleLots: lots.length > 1,
    empty: lots.length === 0,
  };
}

export function txtLotMatchesRequested(
  txtLot: string,
  requestedLot: string,
): boolean {
  return lotNumbersMatch(txtLot, requestedLot);
}

export function findBlockInQuadra(
  blocks: Record<string, unknown>[],
  quadra: string,
  lotNumber: string,
): Record<string, unknown> | null {
  const key = buildBlockMatchKey(quadra, lotNumber);
  for (const block of blocks) {
    const bn = String(block.block_name || block.name || '').trim();
    const num = String(block.number || block.lot_number || '').trim();
    if (!bn || !num) continue;
    if (buildBlockMatchKey(bn, num) === key) return block;
  }
  return null;
}

export function countBlocksInQuadra(
  blocks: Record<string, unknown>[],
  quadra: string,
): number {
  const q = quadra.trim().toUpperCase();
  return blocks.filter(
    (b) =>
      String(b.block_name || b.name || '')
        .trim()
        .toUpperCase() === q,
  ).length;
}

function readExistingSegments(
  block: Record<string, unknown> | null,
): Record<string, unknown>[] | null {
  if (!block) return null;
  const raw = block.segments_json;
  if (!Array.isArray(raw)) return null;
  return raw.map((row) =>
    row != null && typeof row === 'object'
      ? { ...(row as Record<string, unknown>) }
      : {},
  );
}

function segmentIndexFromRow(
  row: Record<string, unknown>,
  fallback: number,
): number {
  return typeof row.segment_index === 'number' ? row.segment_index : fallback;
}

function copySegmentMetadata(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...target };
  for (const key of SEGMENT_METADATA_KEYS) {
    const val = source[key];
    if (val != null && val !== '') next[key] = val;
  }
  return next;
}

/** Mescla confrontações/official_side manuais do lote antigo nos novos segmentos. */
export function mergeSegmentMetadataFromExisting(
  newSegments: Record<string, unknown>[],
  existingBlock: Record<string, unknown> | null,
  mode: IndividualLotUpdateMode,
): Record<string, unknown>[] {
  if (mode !== 'geometry_technical') return newSegments;
  const existing = readExistingSegments(existingBlock);
  if (!existing?.length) return newSegments;

  const byIndex = new Map<number, Record<string, unknown>>();
  existing.forEach((row, i) => {
    byIndex.set(segmentIndexFromRow(row, i), row);
  });

  return newSegments.map((row, i) => {
    const idx = segmentIndexFromRow(row, i);
    const prev = byIndex.get(idx);
    return prev ? copySegmentMetadata(row, prev) : row;
  });
}

function resolveFrontSegmentIndex(
  existing: Record<string, unknown> | null,
  mode: IndividualLotUpdateMode,
): number {
  if (mode === 'full_replacement') return 0;
  const manual =
    existing?.front_source === 'manual' &&
    typeof existing.front_segment_index === 'number';
  if (manual) return existing!.front_segment_index as number;
  if (typeof existing?.front_segment_index === 'number') {
    return existing.front_segment_index as number;
  }
  return 0;
}

function buildGeometryFromPayload(
  payload: Civil3dImportLotPayload,
): Record<string, unknown> | null {
  if (!payload.geometrySaved || payload.coords.length < 4) return null;
  return {
    type: 'Polygon',
    coordinates: [payload.coords],
  };
}

/** Patch técnico para update de lote existente (sem campos comerciais). */
export function buildIndividualLotTechnicalPatch(
  payload: Civil3dImportLotPayload,
  existing: Record<string, unknown> | null,
  mode: IndividualLotUpdateMode,
): Record<string, unknown> {
  const segmentsJson = mergeSegmentMetadataFromExisting(
    payload.segmentsJson,
    existing,
    mode,
  );
  const frontIndex = resolveFrontSegmentIndex(existing, mode);
  const measures = getOfficialLotMeasurements({
    segments_json: segmentsJson,
    front_segment_index: frontIndex,
    area: payload.area,
    perimeter: payload.perimeter,
    source_import: 'TXT_CIVIL3D',
    number: payload.name,
    front_source: existing?.front_source,
    front_street_name: existing?.front_street_name,
    front_street_id: existing?.front_street_id,
    front_street_type: existing?.front_street_type,
    front_street_width: existing?.front_street_width,
  });

  const geom = buildGeometryFromPayload(payload);
  const patch: Record<string, unknown> = {
    area: payload.area,
    perimeter: measures.perimeter ?? payload.perimeter,
    segments_json: segmentsJson,
    coordinates_utm_json:
      payload.officialSegs.length > 0
        ? payload.officialSegs.map((s) => [s.east, s.north])
        : null,
    frente: measures.frente,
    Fundo:
      measures.fundo != null
        ? String(measures.fundo).replace(/[^0-9.]/g, '')
        : null,
    'Lado Dir.':
      measures.ladoDireito != null
        ? String(measures.ladoDireito).replace(/[^0-9.]/g, '')
        : null,
    'Lado Esq.':
      measures.ladoEsquerdo != null
        ? String(measures.ladoEsquerdo).replace(/[^0-9.]/g, '')
        : null,
    front_segment_index: frontIndex,
    source_import: 'TXT_CIVIL3D',
  };

  if (geom) patch.geometry = geom;

  if (mode === 'full_replacement' && existing?.front_source !== 'manual') {
    patch.front_source = 'auto';
    patch.front_street_id = null;
    patch.front_street_name = null;
    patch.front_street_type = null;
    patch.front_street_width = null;
  }

  return patch;
}

export function patchTouchesCommercialFields(
  patch: Record<string, unknown>,
): string[] {
  const touched: string[] = [];
  for (const key of COMMERCIAL_FIELDS_PRESERVED) {
    if (key in patch && key !== 'id' && key !== 'project_id') {
      touched.push(key);
    }
  }
  return touched;
}

export type IndividualLotInsertRow = Record<string, unknown> & {
  _officialSegs: import('@/lib/officialLotMeasurements').OfficialLotSegment[];
};

/** Linha para inserir novo lote na quadra (quando usuário confirma criação). */
export function buildIndividualLotInsertRow(
  payload: Civil3dImportLotPayload,
  projectId: string,
  quadra: string,
  lotNumber: string,
  tenantId: string | null,
  companyId: string | null,
  mode: IndividualLotUpdateMode,
): IndividualLotInsertRow {
  const patch = buildIndividualLotTechnicalPatch(payload, null, mode);
  const num = normalizeLotNumberForMatch(lotNumber) || String(lotNumber).trim();
  const q = quadra.toUpperCase().trim();
  const finalArea = payload.area;
  const finalPrice = parseFloat((finalArea * 120).toFixed(2));

  return {
    project_id: projectId,
    name: q,
    block_name: q,
    number: num,
    lot_number: num,
    status: 'Disponível',
    price: finalPrice,
    tenant_id: tenantId,
    company_id: companyId,
    ...patch,
    _officialSegs: payload.officialSegs,
  };
}

export type UpsertIndividualLotResult = {
  action: 'updated' | 'created';
  blockId: string;
  lotNumber: string;
  quadra: string;
  preservedCommercial: boolean;
};

export async function refreshLotSegmentsTable(
  supabase: SupabaseClient,
  lotId: string,
  officialSegs: import('@/lib/officialLotMeasurements').OfficialLotSegment[],
): Promise<void> {
  if (!officialSegs.length) return;
  try {
    await supabase.from('lot_segments').delete().eq('lot_id', lotId);
    await supabase
      .from('lot_segments')
      .insert(officialSegmentsToLotSegmentRows(lotId, officialSegs));
  } catch (err) {
    console.warn('[TXT] lot_segments não persistido (tabela ausente?)', err);
  }
}

export async function upsertIndividualLotFromTxt(
  supabase: SupabaseClient,
  options: {
    projectId: string;
    quadra: string;
    lotNumber: string;
    tenantId: string | null;
    companyId: string | null;
    payload: Civil3dImportLotPayload;
    existingBlock: Record<string, unknown> | null;
    mode: IndividualLotUpdateMode;
    allowCreate: boolean;
  },
): Promise<UpsertIndividualLotResult> {
  const quadra = options.quadra.toUpperCase().trim();
  const lotNumber = normalizeLotNumberForMatch(options.lotNumber) ||
    String(options.lotNumber).trim();

  if (options.existingBlock?.id) {
    const blockId = String(options.existingBlock.id);
    const patch = buildIndividualLotTechnicalPatch(
      options.payload,
      options.existingBlock,
      options.mode,
    );
    const commercialTouched = patchTouchesCommercialFields(patch);
    if (commercialTouched.length) {
      throw new Error(
        `Patch inválido: tocou campos comerciais (${commercialTouched.join(', ')})`,
      );
    }
    await persistBlockPatch(supabase, blockId, patch);
    await refreshLotSegmentsTable(
      supabase,
      blockId,
      options.payload.officialSegs,
    );
    return {
      action: 'updated',
      blockId,
      lotNumber,
      quadra,
      preservedCommercial: true,
    };
  }

  if (!options.allowCreate) {
    throw new Error('Lote não encontrado na quadra.');
  }

  const row = buildIndividualLotInsertRow(
    options.payload,
    options.projectId,
    quadra,
    lotNumber,
    options.tenantId,
    options.companyId,
    options.mode,
  );
  const { _officialSegs, ...insertPayload } = row;
  const { data: inserted, error } = await supabase
    .from('blocks')
    .insert(insertPayload)
    .select('id')
    .single();
  if (error) throw error;
  const blockId = String(inserted?.id ?? '');
  if (!blockId) throw new Error('Falha ao criar lote.');
  await refreshLotSegmentsTable(supabase, blockId, _officialSegs);
  return {
    action: 'created',
    blockId,
    lotNumber,
    quadra,
    preservedCommercial: false,
  };
}

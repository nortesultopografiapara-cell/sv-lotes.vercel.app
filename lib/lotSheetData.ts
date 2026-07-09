/**
 * Coleta de dados para prancha técnica do lote (mapa GIS).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildLotAddressLine,
  formatMemorialFrontClause,
  normalizeStreetGuideRow,
} from '@/lib/streetGuide';
import {
  buildBlockSketch,
  buildCardinalConfrontants,
  buildProjectMap,
  buildVertexTableFromOfficialSegments,
  createLotSheetValidation,
  segmentTableToMemorialRows,
  segmentTableToMetricRows,
  type LotSheetSideConfrontants,
  latLngRingFromBlock,
  LOT_SHEET_VERSION,
  type LotSheetBlockSketch,
  type LotSheetCardinalConfrontant,
  type LotSheetMetricRow,
  type LotSheetProjectMapLot,
  type LotSheetSegmentRow,
  type LotSheetVertexRow,
} from '@/lib/lotSheetEnrichment';
import { formatStreetDisplay } from '@/lib/streetGuide';
import {
  getOfficialLotMeasurements,
  getOfficialLotSegmentTable,
} from '@/lib/officialLotMeasurements';
import {
  buildGroupedOfficialEdgeLabels,
  buildLotSheetSketchSides,
  type LotSheetSketchSide,
} from '@/lib/lotSheetLayout';
import { buildOfficialSheetLocalGeometry } from '@/lib/lotSheetCoordinates';
import { buildOfficialLotDocumentBundle } from '@/lib/officialLotDocumentData';
import { buildMemorialDraftPlainText } from '@/lib/memorialDraft';
import {
  formatMemorialTechnicalBlock,
  normalizeTechnicalResponsibleFromCompany,
} from '@/lib/technicalResponsible';

export type LotSheetGeometry = {
  /** Anel UTM [E, N] dos vértices oficiais TXT */
  utmRing: [number, number][];
  /** Planta: x = east - minEast, y = north - minNorth */
  localRing: [number, number][];
  bboxMeters: { minX: number; maxX: number; minY: number; maxY: number };
};

export type LotSheetNeighbor = {
  label: string;
  side?: string;
};

export type LotSheetOwnerDetails = {
  name: string;
  cpf: string;
  fatherName: string;
  motherName: string;
  address: string;
  neighborhood: string;
  municipality: string;
  cadastralInscription: string;
};

export type LotSheetPayload = {
  project: Record<string, unknown>;
  lot: Record<string, unknown>;
  owner: string;
  ownerDocument: string;
  ownerDetails: LotSheetOwnerDetails;
  company: Record<string, unknown> | null;
  technicalResponsible: Record<string, unknown> | null;
  neighbors: LotSheetNeighbor[];
  cardinalConfrontants: LotSheetCardinalConfrontant[];
  blockSketch: LotSheetBlockSketch | null;
  projectMap: LotSheetProjectMapLot[];
  vertices: LotSheetVertexRow[];
  segments: LotSheetSegmentRow[];
  metricRows: LotSheetMetricRow[];
  coordinatesAvailable: boolean;
  frontEdgeIndex: number;
  quadraStreetNames: string[];
  validation: { code: string; url: string; emittedAt: string };
  version: string;
  geometry: LotSheetGeometry;
  measures: {
    frente: string;
    fundo: string;
    ladoDireito: string;
    ladoEsquerdo: string;
    chanfre: string;
    curva: string;
    raio: string;
    corda: string;
    area: string;
  };
  scaleLabel: string;
  sideConfrontants: LotSheetSideConfrontants;
  lotAddressLine: string;
  memorialFrontClause: string;
  /** HTML do responsável técnico para memorial descritivo (próxima etapa). */
  memorialTechnicalHtml: string;
  /** Texto base do memorial (botão "Gerar Memorial" — próxima etapa). */
  memorialDraftPlain: string;
  /** Distâncias oficiais por aresta (índice = segment_index) para o croqui PDF. */
  officialEdgeLengths: string[];
  /** Lados oficiais agrupados para posicionamento no croqui. */
  sketchSides: LotSheetSketchSide[];
  ignoredSegmentNote: string | null;
};

function formatMeasure(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (!Number.isFinite(n)) return String(val);
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
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

import {
  normalizeOwnerDocument,
  normalizeOwnerName,
  resolveLotOwnerFromBlock,
} from '@/lib/lotOwnerResolution';

export {
  normalizeOwnerDocument,
  normalizeOwnerName,
} from '@/lib/lotOwnerResolution';

function buildOwnerDetails(
  customer: Record<string, unknown> | null,
  block: Record<string, unknown>,
  project: Record<string, unknown>,
  owner: string,
  ownerDocument: string,
  lotAddressLine: string,
): LotSheetOwnerDetails {
  const city = String(
    project.municipio || project.city || customer?.city || '—',
  ).trim();
  const uf = String(project.uf || project.state || customer?.state_uf || '—').trim();
  const municipality =
    city !== '—' && uf !== '—' ? `${city}-${uf}` : city !== '—' ? city : 'Não informado';

  return {
    name: owner,
    cpf: ownerDocument,
    fatherName:
      String(customer?.father_name || customer?.nome_pai || '').trim() ||
      'Não informado',
    motherName:
      String(customer?.mother_name || customer?.nome_mae || '').trim() ||
      'Não informado',
    address:
      String(customer?.address || customer?.endereco || lotAddressLine || '').trim() ||
      'Não informado',
    neighborhood:
      String(customer?.neighborhood || customer?.bairro || '').trim() ||
      'Não informado',
    municipality,
    cadastralInscription:
      String(
        block.inscricao_cadastral ||
          block.cadastral_inscription ||
          block.cadastral_code ||
          '',
      ).trim() || '—',
  };
}

function quadraStreetNamesFromGuides(
  guides: Record<string, unknown>[],
): string[] {
  const names: string[] = [];
  for (const g of guides) {
    const label = formatStreetDisplay(
      g.type as string | undefined,
      g.name as string | undefined,
    );
    if (label && !names.includes(label)) names.push(label);
    if (names.length >= 4) break;
  }
  return names;
}

async function resolveLotSheetOwner(
  supabase: SupabaseClient,
  block: Record<string, unknown>,
): Promise<{
  owner: string;
  ownerDocument: string;
  customer: Record<string, unknown> | null;
}> {
  const normalized = await resolveLotOwnerFromBlock(supabase, block);
  console.log('LOT_SHEET_OWNER_NORMALIZED', {
    status: block.status,
    hasCustomer: Boolean(normalized.customer),
    owner: normalized.owner,
    ownerDocument: normalized.ownerDocument,
  });
  return normalized;
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
    .select('*')
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
    .select('*')
    .eq('project_id', params.projectId);

  const { data: guides } = await supabase
    .from('street_guides')
    .select('id, name, type, geometry_geojson')
    .eq('project_id', params.projectId)
    .limit(20);

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', params.tenantId)
    .maybeSingle();

  const blockRecord = block as Record<string, unknown>;
  const officialTable = getOfficialLotSegmentTable(
    blockRecord,
    project as Record<string, unknown>,
  );
  if (officialTable.validRows.length < 2) {
    throw new Error(
      'Prancha requer segmentos oficiais TXT Civil 3D (segments_json).',
    );
  }

  const sheetGeom = buildOfficialSheetLocalGeometry(blockRecord);
  if (!sheetGeom) {
    throw new Error(
      'Não foi possível montar o croqui UTM a partir dos segmentos oficiais do TXT.',
    );
  }

  const { localRing, bboxMeters: bbox, utmRing, segments: officialSegs } =
    sheetGeom;
  const maxDim = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, 1);
  const scaleDenom = parseScaleDenominator(
    (project as Record<string, unknown>).escala_padrao as string,
    maxDim,
  );

  const officialMeasures = getOfficialLotMeasurements(
    blockRecord,
    blockRecord.number,
  );
  const chanfre = officialMeasures.chanfre;
  const chanfreStr = chanfre?.total
    ? `${chanfre.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m`
    : '—';
  const curvaInfo = officialMeasures.curva;
  const curvaStr =
    curvaInfo && curvaInfo.totalLength > 0
      ? `${curvaInfo.totalLength.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m`
      : '—';
  const raioStr =
    curvaInfo?.radius != null && curvaInfo.radius > 0
      ? `${curvaInfo.radius.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m`
      : '—';
  const cordaStr =
    curvaInfo?.chord != null && curvaInfo.chord > 0
      ? `${curvaInfo.chord.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m`
      : '—';

  const ring = latLngRingFromBlock(blockRecord);

  const { owner, ownerDocument, customer } = await resolveLotSheetOwner(
    supabase,
    block as Record<string, unknown>,
  );

  const blocksList = (allBlocks || []) as Record<string, unknown>[];
  const guidesList = ((guides || []) as Record<string, unknown>[]).map(
    normalizeStreetGuideRow,
  );

  const cardinalConfrontants = buildCardinalConfrontants(
    params.blockId,
    ring,
    blocksList,
    guidesList,
  );

  const neighbors: LotSheetNeighbor[] = cardinalConfrontants
    .filter((c) => c.label && c.label !== '—')
    .map((c) => ({ label: `${c.direction}: ${c.label}`, side: c.direction }));

  const blockSketch = buildBlockSketch(
    params.blockId,
    block as Record<string, unknown>,
    blocksList,
  );

  const projectMap = buildProjectMap(params.blockId, blocksList);
  const vertices = buildVertexTableFromOfficialSegments(officialSegs);
  const segments: LotSheetSegmentRow[] = segmentTableToMemorialRows(officialTable);
  const metricRows: LotSheetMetricRow[] = segmentTableToMetricRows(officialTable);
  const coordinatesAvailable = officialTable.coordinatesAvailable;

  const officialBundle = buildOfficialLotDocumentBundle({
    block: blockRecord,
    blockId: params.blockId,
    project: project as Record<string, unknown>,
    allBlocks: blocksList,
    streetGuides: guidesList,
  });
  const confrontationAudit = officialBundle.audit;
  const officialEdgeLengths = buildGroupedOfficialEdgeLabels(
    blockRecord,
    officialSegs.length,
    project as Record<string, unknown>,
  );
  const sketchSides = buildLotSheetSketchSides(
    blockRecord,
    confrontationAudit,
    blocksList,
    project as Record<string, unknown>,
  );
  const ignoredSegmentNote =
    officialTable.ignoredInvalidCount > 0
      ? 'Segmento inválido ignorado'
      : null;

  const frontEdgeIndex = Math.min(
    officialMeasures.frontSegmentIndex ?? 0,
    localRing.length - 1,
  );
  const validation = createLotSheetValidation();
  const techProfile = normalizeTechnicalResponsibleFromCompany(
    (company as Record<string, unknown>) || null,
  );

  /** Quadro CONFRONTAÇÕES — mesma fonte do memorial/popup (bundle oficial). */
  const sideConfrontants = officialBundle.confrontations;
  const lotAddressLine = buildLotAddressLine(block as Record<string, unknown>);
  const memorialFrontClause = formatMemorialFrontClause(
    block as Record<string, unknown>,
  );
  const ownerDetails = buildOwnerDetails(
    customer,
    block as Record<string, unknown>,
    project as Record<string, unknown>,
    owner,
    ownerDocument,
    lotAddressLine,
  );
  const quadraStreetNames = quadraStreetNamesFromGuides(guidesList);

  console.log('LOT_SHEET_GEOMETRY_PROCESSED', {
    officialSegments: officialSegs.length,
    frontEdgeIndex,
    cardinal: cardinalConfrontants.length,
    sketchLots: blockSketch?.lots.length ?? 0,
    projectLots: projectMap.length,
    scale: scaleDenom,
    measures: {
      frente: officialMeasures.frente,
      fundo: officialMeasures.fundo,
      ladoDireito: officialMeasures.ladoDireito,
      ladoEsquerdo: officialMeasures.ladoEsquerdo,
      perimeter: officialMeasures.perimeter,
      area: officialMeasures.area,
    },
  });

  return {
    project: project as Record<string, unknown>,
    lot: block as Record<string, unknown>,
    owner,
    ownerDocument,
    ownerDetails,
    company: (company as Record<string, unknown>) || null,
    neighbors,
    cardinalConfrontants,
    blockSketch,
    projectMap,
    vertices,
    segments,
    metricRows,
    coordinatesAvailable,
    frontEdgeIndex,
    quadraStreetNames,
    validation,
    version: LOT_SHEET_VERSION,
    geometry: {
      utmRing,
      localRing,
      bboxMeters: bbox,
    },
    measures: {
      frente: formatMeasure(officialMeasures.frente),
      fundo: formatMeasure(officialMeasures.fundo),
      ladoDireito: formatMeasure(officialMeasures.ladoDireito),
      ladoEsquerdo: formatMeasure(officialMeasures.ladoEsquerdo),
      chanfre: chanfreStr,
      curva: curvaStr,
      raio: raioStr,
      corda: cordaStr,
      area:
        officialMeasures.area != null
          ? `${officialMeasures.area.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²`
          : block.area
            ? `${Number(block.area).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²`
            : '—',
    },
    scaleLabel: `1 : ${scaleDenom}`,
    sideConfrontants,
    lotAddressLine,
    memorialFrontClause,
    memorialTechnicalHtml: formatMemorialTechnicalBlock(techProfile),
    memorialDraftPlain: buildMemorialDraftPlainText({
      block: blockRecord,
      projectBlocks: blocksList,
      streetGuides: guidesList,
      technicalResponsible: techProfile as unknown as Record<string, unknown>,
    }),
    technicalResponsible: techProfile as unknown as Record<string, unknown>,
    officialEdgeLengths,
    sketchSides,
    ignoredSegmentNote,
  };
}

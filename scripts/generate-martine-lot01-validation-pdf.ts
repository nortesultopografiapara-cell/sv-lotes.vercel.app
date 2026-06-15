/**
 * Gera PDF de validação — Lote 1 / QD 02 — CHACARAS E LOTES MARTINE III
 * npx tsx scripts/generate-martine-lot01-validation-pdf.ts [projectId] [blockId]
 *
 * Sem IDs: resolve projeto/lote no Supabase quando SUPABASE_SERVICE_ROLE_KEY estiver configurada.
 * Sem credenciais: gera PDF sintético com confrontações validadas no GIS.
 */

import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  applyManualConfrontantToBlock,
  officialSegmentIndexesForSide,
} from '../lib/assistedConfrontation';
import { buildOfficialSheetLocalGeometry } from '../lib/lotSheetCoordinates';
import { buildSketchLayoutFromBlock } from '../lib/lotSheetLayout';
import { loadLotSheetPayload } from '../lib/lotSheetData';
import { generateLotSheetPdf } from '../lib/lotSheetPdf';
import type { LotSheetPayload } from '../lib/lotSheetData';

const MARTINE_PROJECT_NAME = 'CHACARAS E LOTES MARTINE III';
const TARGET_QUADRA = '02';
const TARGET_LOT = '1';

function loadEnvFiles() {
  for (const f of [
    '.env.vercel.pull.production',
    '.env.production.local',
    '.env.vercel.production',
    '.env.local',
    '.env',
  ]) {
    if (!fs.existsSync(f)) continue;
    const env = fs.readFileSync(f, 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    }
  }
}

function normalizeQuadra(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^QD\s*/i, '')
    .replace(/^0+/, '');
}

function normalizeLotNumber(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^LT\s*/i, '')
    .replace(/^0+/, '');
}

async function resolveMartineIds(
  supabase: SupabaseClient,
  projectIdArg?: string,
  blockIdArg?: string,
): Promise<{ projectId: string; blockId: string } | null> {
  let projectId = projectIdArg?.trim();
  if (!projectId) {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id,name')
      .ilike('name', '%MARTINE%III%');
    if (error) throw error;
    projectId = projects?.find((p) =>
      String(p.name ?? '')
        .toUpperCase()
        .includes('MARTINE III'),
    )?.id;
  }
  if (!projectId) return null;

  if (blockIdArg?.trim()) {
    return { projectId, blockId: blockIdArg.trim() };
  }

  const { data: blocks, error: blockError } = await supabase
    .from('blocks')
    .select('id,number,block_name')
    .eq('project_id', projectId)
    .limit(2000);
  if (blockError) throw blockError;

  const match = (blocks || []).find((b) => {
    const quadra = normalizeQuadra(b.block_name);
    const lot = normalizeLotNumber(b.number);
    return quadra === normalizeQuadra(TARGET_QUADRA) && lot === normalizeLotNumber(TARGET_LOT);
  });
  if (!match?.id) return null;
  return { projectId, blockId: String(match.id) };
}

function lineSeg(
  idx: number,
  north: number,
  east: number,
  endNorth: number,
  endEast: number,
  distance: number,
  official_side?: string,
) {
  const row: Record<string, unknown> = {
    segment_index: idx,
    north,
    east,
    end_north: endNorth,
    end_east: endEast,
    distance,
    segment_type: 'LINE',
  };
  if (official_side) row.official_side = official_side;
  return row;
}

function neighborLot(
  id: string,
  num: string,
  east: number,
  north: number,
  w: number,
  h: number,
): Record<string, unknown> {
  return {
    id,
    number: num,
    block_name: '02',
    segments_json: [
      lineSeg(0, north, east, north, east + w, w),
      lineSeg(1, north, east + w, north + h, east + w, h),
      lineSeg(2, north + h, east + w, north + h, east, w),
      lineSeg(3, north + h, east, north, east, h),
    ],
  };
}

function buildSyntheticMartinePayload(): LotSheetPayload {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500100.05, 100.05),
    lineSeg(1, 7500000, 500100.05, 7500014.86, 500100.05, 14.86),
    lineSeg(2, 7500014.86, 500100.05, 7500021.64, 500106.83, 9.58),
    lineSeg(3, 7500021.64, 500106.83, 7500021.64, 500000, 106.83, 'front'),
    lineSeg(4, 7500021.64, 500000, 7500197.84, 500000, 176.2),
    lineSeg(5, 7500197.84, 500000, 7500197.84, 500069.08, 69.08),
    lineSeg(6, 7500197.84, 500069.08, 7500000, 500069.08, 197.84, 'back'),
  ];
  const lot: Record<string, unknown> = {
    id: 'martine-lt01-synthetic',
    number: '1',
    block_name: '02',
    front_segment_index: 3,
    front_street_name: 'RUA 01',
    area: 6056.14,
    segments_json: segs,
  };
  const lot43 = neighborLot('lt43', '43', 500069.08, 7500197.84, 30, 80);
  const lot02 = neighborLot('lt02', '2', 500000, 7500021.64, 80, 30);
  const all = [lot, lot43, lot02];

  let block = applyManualConfrontantToBlock(
    lot,
    officialSegmentIndexesForSide(lot, all, 'frente'),
    'RUA 01',
    'street',
  );
  block = applyManualConfrontantToBlock(
    block,
    officialSegmentIndexesForSide(block, all, 'fundo'),
    'Lote 43',
    'lot',
  );
  block = applyManualConfrontantToBlock(
    block,
    officialSegmentIndexesForSide(block, all, 'ladoDireito'),
    'RUA 02',
    'street',
  );
  block = applyManualConfrontantToBlock(
    block,
    officialSegmentIndexesForSide(block, all, 'ladoEsquerdo'),
    'Lote 02 e 43',
    'lot',
  );

  const geom = buildOfficialSheetLocalGeometry(block);
  if (!geom) throw new Error('Geometria sintética inválida');
  const layout = buildSketchLayoutFromBlock(
    block,
    'martine-lt01-synthetic',
    all,
  );

  return {
    project: {
      name: 'CHACARAS E LOTES MARTINE III',
      escala_padrao: '1:800',
      municipio: 'PARAUAPEBAS-PA',
    },
    lot: block,
    owner: 'Não informado',
    ownerDocument: '—',
    ownerDetails: {
      name: 'Não informado',
      cpf: '—',
      fatherName: '—',
      motherName: '—',
      address: '—',
      neighborhood: '—',
      municipality: 'PARAUAPEBAS-PA',
      cadastralInscription: '—',
    },
    company: {
      name: 'MENESES',
      technical_responsible_name: 'SEVERINO JOSE DE FRANÇA',
      technical_responsible_registry: 'CFT 45380528300',
    },
    technicalResponsible: null,
    neighbors: [],
    cardinalConfrontants: [],
    blockSketch: null,
    projectMap: [],
    vertices: [],
    segments: [],
    metricRows: geom.segments.map((s, i) => ({
      from: `M-${String(i + 1).padStart(2, '0')}`,
      to: `M-${String(((i + 1) % geom.segments.length) + 1).padStart(2, '0')}`,
      azimute: s.bearing != null ? String(s.bearing) : '—',
      distancia: `${Number(s.distance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m`,
      coordE: Number(s.east).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      coordN: Number(s.north).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    })),
    coordinatesAvailable: true,
    frontEdgeIndex: 3,
    quadraStreetNames: ['RUA 01', 'RUA 02'],
    validation: {
      code: 'SYNTH',
      url: 'https://local',
      emittedAt: new Date().toISOString(),
    },
    version: 'validation',
    geometry: {
      utmRing: geom.utmRing,
      localRing: geom.localRing,
      bboxMeters: geom.bboxMeters,
    },
    measures: {
      frente: '106,83 m',
      fundo: '197,84 m',
      ladoDireito: '124,49 m',
      ladoEsquerdo: '176,20 m',
      chanfre: '—',
      curva: '—',
      raio: '—',
      corda: '—',
      area: '6.056,14 m²',
    },
    scaleLabel: '1 : 800',
    sideConfrontants: layout.confrontants,
    lotAddressLine: '—',
    memorialFrontClause: '—',
    memorialTechnicalHtml: '',
    memorialDraftPlain: '',
    officialEdgeLengths: layout.edgeLabels,
    sketchSides: layout.sketchSides,
    ignoredSegmentNote: null,
  } as LotSheetPayload;
}

async function main() {
  loadEnvFiles();
  const projectIdArg = process.argv[2];
  const blockIdArg = process.argv[3];
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://aezktedncttwpqeunjej.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  let payload: LotSheetPayload;
  let source = 'synthetic';

  if (serviceKey) {
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const resolved = await resolveMartineIds(supabase, projectIdArg, blockIdArg);
    if (resolved) {
      const tenantId =
        (
          await supabase
            .from('projects')
            .select('company_id')
            .eq('id', resolved.projectId)
            .maybeSingle()
        ).data?.company_id ?? '';
      payload = await loadLotSheetPayload(supabase, {
        projectId: resolved.projectId,
        blockId: resolved.blockId,
        tenantId: String(tenantId),
      });
      source = 'supabase';
      console.log('LOT_SHEET_VALIDATION_SUPABASE', resolved);
    } else {
      console.log('LOT_SHEET_VALIDATION_SYNTHETIC', {
        reason: 'martine_block_not_found',
        projectIdArg,
        blockIdArg,
      });
      payload = buildSyntheticMartinePayload();
    }
  } else {
    console.log('LOT_SHEET_VALIDATION_SYNTHETIC', {
      reason: 'SUPABASE_SERVICE_ROLE_KEY_missing',
      projectIdArg,
      blockIdArg,
    });
    payload = buildSyntheticMartinePayload();
  }

  const doc = await generateLotSheetPdf(payload);
  const outDir = path.join(process.cwd(), 'tmp', 'prancha-validation');
  fs.mkdirSync(outDir, { recursive: true });
  const quadra = String(
    payload.lot.block_name || payload.lot.block || '02',
  ).replace(/\s+/g, '');
  const lotNum = String(payload.lot.number || payload.lot.lot || '1');
  const suffix = source === 'supabase' ? 'real' : 'synthetic';
  const outPath = path.join(
    outDir,
    `martine-iii-lote-${lotNum}-qd-${quadra}-validation-${suffix}.pdf`,
  );
  const buf = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(outPath, buf);

  console.log('PDF_VALIDATION_GENERATED', {
    path: outPath,
    source,
    confrontants: payload.sideConfrontants,
    area: payload.measures.area,
  });
}

void main();

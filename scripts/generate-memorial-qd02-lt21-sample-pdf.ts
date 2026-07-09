/**
 * Gera PDF de exemplo — Memorial Descritivo — Quadra 02 / Lote 21
 * npx tsx scripts/generate-memorial-qd02-lt21-sample-pdf.ts [projectId] [blockId]
 */

import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  applyManualConfrontantToBlock,
  officialSegmentIndexesForSide,
} from '../lib/assistedConfrontation';
import {
  applyResolvedOwnerToBlock,
} from '../lib/lotOwnerResolution';
import {
  buildMemorialPayloadFromRecords,
  loadMemorialPayload,
} from '../lib/memorial/memorialData';
import { generateMemorialPdf } from '../lib/memorial/memorialPdf';
import type { MemorialPayload } from '../lib/memorial/memorialTypes';

const TARGET_QUADRA = '02';
const TARGET_LOT = '21';

async function loadProductionEnv(): Promise<void> {
  const authPath =
    process.env.VERCEL_AUTH_PATH ||
    'C:/Users/User/AppData/Roaming/xdg.data/com.vercel.cli/auth.json';
  if (!fs.existsSync(authPath)) return;

  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8')) as { token?: string };
  if (!auth.token) return;

  const projectId = 'prj_qpba9orEU4kJNRHqMLVM1Khp3GIP';
  const targets = ['production', 'preview', 'development'] as const;
  for (const target of targets) {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env?decrypt=true&target=${target}`,
      { headers: { Authorization: `Bearer ${auth.token}` } },
    );
    if (!res.ok) continue;
    const data = (await res.json()) as {
      envs?: Array<{ key: string; value?: string }>;
    };
    const serviceEnv = data.envs?.find(
      (item) => item.key === 'SUPABASE_SERVICE_ROLE_KEY',
    );
    if (!serviceEnv?.value?.length) continue;
    for (const item of data.envs || []) {
      if (item.key && item.value) process.env[item.key] = item.value;
    }
    return;
  }
}

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
      if (!m) continue;
      const val = m[2].trim().replace(/^"|"$/g, '');
      if (val) process.env[m[1].trim()] = val;
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

async function resolveLotIds(
  supabase: SupabaseClient,
  projectIdArg?: string,
  blockIdArg?: string,
): Promise<{
  projectId: string;
  blockId: string;
  tenantId: string;
  projectName: string;
  ownerName: string;
} | null> {
  if (blockIdArg?.trim() && projectIdArg?.trim()) {
    const { data: project } = await supabase
      .from('projects')
      .select('id,name,company_id')
      .eq('id', projectIdArg.trim())
      .maybeSingle();
    const { data: block } = await supabase
      .from('blocks')
      .select('id,owner_name,customer_name,status')
      .eq('id', blockIdArg.trim())
      .maybeSingle();
    if (!project?.id || !block?.id) return null;
    return {
      projectId: project.id,
      blockId: String(block.id),
      tenantId: String(project.company_id ?? ''),
      projectName: String(project.name ?? ''),
      ownerName: String(block.owner_name ?? block.customer_name ?? ''),
    };
  }

  const { data: blocks, error } = await supabase
    .from('blocks')
    .select('id,number,block_name,project_id,owner_name,customer_name,status')
    .limit(5000);
  if (error) throw error;

  const matches = (blocks || []).filter((b) => {
    const quadra = normalizeQuadra(b.block_name);
    const lot = normalizeLotNumber(b.number);
    return quadra === TARGET_QUADRA && lot === TARGET_LOT;
  });

  if (!matches.length) return null;

  const preferred =
    matches.find((b) => String(b.status ?? '').toLowerCase() === 'vendido') ??
    matches.find((b) =>
      /SEVERINO/i.test(String(b.owner_name ?? b.customer_name ?? '')),
    ) ??
    matches[0];

  const { data: project } = await supabase
    .from('projects')
    .select('id,name,company_id')
    .eq('id', preferred!.project_id)
    .maybeSingle();
  if (!project?.id) return null;

  return {
    projectId: project.id,
    blockId: String(preferred!.id),
    tenantId: String(project.company_id ?? ''),
    projectName: String(project.name ?? ''),
    ownerName: String(preferred!.owner_name ?? preferred!.customer_name ?? ''),
  };
}

const BASE_EAST = 628_200;
const BASE_NORTH = 9_319_300;

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
    block_name: TARGET_QUADRA,
    segments_json: [
      lineSeg(0, north, east, north, east + w, w),
      lineSeg(1, north, east + w, north + h, east + w, h),
      lineSeg(2, north + h, east + w, north + h, east, w),
      lineSeg(3, north + h, east, north, east, h),
    ],
  };
}

function buildSyntheticQd02Lt21Payload(): MemorialPayload {
  const w = 40.57;
  const h = 74.98;
  const e1 = BASE_EAST + w;
  const n1 = BASE_NORTH + h;
  const segs = [
    lineSeg(0, BASE_NORTH, BASE_EAST, BASE_NORTH, e1, w, 'front'),
    lineSeg(1, BASE_NORTH, e1, n1, e1, h),
    lineSeg(2, n1, e1, n1, BASE_EAST, w, 'back'),
    lineSeg(3, n1, BASE_EAST, BASE_NORTH, BASE_EAST, h),
  ];

  let lot: Record<string, unknown> = {
    id: 'sample-qd02-lt21',
    number: TARGET_LOT,
    block_name: TARGET_QUADRA,
    front_segment_index: 0,
    front_street_name: 'RUA 01',
    front_street_type: 'Rua',
    area: 3042.97,
    perimeter: 230.1,
    status: 'Vendido',
    matricula: 'Não informado',
    segments_json: segs,
  };

  const lot20 = neighborLot('lt20', '20', e1, BASE_NORTH, 30, 40);
  const lot22 = neighborLot('lt22', '22', BASE_EAST - 30, BASE_NORTH, 30, 40);
  const all = [lot, lot20, lot22];

  lot = applyManualConfrontantToBlock(
    lot,
    officialSegmentIndexesForSide(lot, all, 'frente'),
    'RUA 01',
    'street',
  );
  lot = applyManualConfrontantToBlock(
    lot,
    officialSegmentIndexesForSide(lot, all, 'fundo'),
    'Lote nº 20',
    'lot',
  );
  lot = applyManualConfrontantToBlock(
    lot,
    officialSegmentIndexesForSide(lot, all, 'ladoDireito'),
    'Lote nº 22',
    'lot',
  );
  lot = applyManualConfrontantToBlock(
    lot,
    officialSegmentIndexesForSide(lot, all, 'ladoEsquerdo'),
    'Área Institucional',
    'institutional_area',
  );

  lot = applyResolvedOwnerToBlock(lot, {
    owner: 'SEVERINO JOSE DE FRANÇA',
    ownerDocument: '—',
    source: 'customer_id',
  });

  const project = {
    name: 'AGRO_FLORESTAL',
    city: 'Parauapebas',
    uf: 'PA',
    utm_zone: '22S',
  };

  const company = {
    name: 'NORTE & SUL TOPOGRAFIA E SERVIÇOS LTDA-ME',
    fantasy_name: 'NST',
    phone: '(94) 99195-5918 / 99198-0607',
    email: 'nortesultopografia@yahoo.com.br',
    address: 'Rua 02 Quadra 123 Lote 05',
    bairro: 'Nova Carajás',
    city: 'Parauapebas',
    state: 'PA',
    zip_code: '68515-000',
    cnpj: '00.000.000/0001-00',
    logo_url: '',
    technical_responsible_name: 'SEVERINO JOSE DE FRANÇA',
    technical_responsible_role: 'TEC. EM AGRIMENSURA',
    technical_responsible_cft: '6508202820',
  };

  return buildMemorialPayloadFromRecords({
    block: lot,
    blockId: 'sample-qd02-lt21',
    project,
    allBlocks: all,
    streetGuides: [],
    company,
  });
}

async function writeSamplePdf(
  payload: MemorialPayload,
  source: 'supabase' | 'synthetic',
  projectName: string,
) {
  payload.generatedAt = new Date().toISOString();
  const doc = await generateMemorialPdf(payload);
  const pages = doc.getNumberOfPages();

  const outDir = path.join(process.cwd(), 'tmp', 'memorial-samples');
  fs.mkdirSync(outDir, { recursive: true });
  const safeProject = projectName
    .replace(/[^\w\-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  const outPath = path.join(
    outDir,
    `memorial-qd-${TARGET_QUADRA}-lt-${TARGET_LOT}-${safeProject || 'sample'}-${source}.pdf`,
  );

  fs.writeFileSync(outPath, Buffer.from(doc.output('arraybuffer')));

  console.log('MEMORIAL_SAMPLE_GENERATED', {
    path: outPath,
    source,
    pages,
    singlePage: pages === 1,
    project: projectName,
    quadra: TARGET_QUADRA,
    lote: TARGET_LOT,
    owner: payload.identification.owner,
    company: payload.company.fantasyName || payload.company.name,
    segments: payload.segments.length,
  });
}

async function main() {
  await loadProductionEnv();
  loadEnvFiles();
  const projectIdArg = process.argv[2];
  const blockIdArg = process.argv[3];
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://aezktedncttwpqeunjej.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (serviceKey) {
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const resolved = await resolveLotIds(supabase, projectIdArg, blockIdArg);
    if (resolved) {
      const payload = await loadMemorialPayload(supabase, {
        projectId: resolved.projectId,
        blockId: resolved.blockId,
        tenantId: resolved.tenantId,
      });
      await writeSamplePdf(payload, 'supabase', resolved.projectName);
      return;
    }
    console.warn(
      `Lote Quadra ${TARGET_QUADRA} / Lote ${TARGET_LOT} não encontrado no Supabase — usando payload sintético de layout.`,
    );
  } else {
    console.warn(
      'SUPABASE_SERVICE_ROLE_KEY ausente — gerando PDF sintético de layout (Quadra 02 / Lote 21 / SEVERINO JOSE DE FRANÇA).',
    );
  }

  const payload = buildSyntheticQd02Lt21Payload();
  await writeSamplePdf(payload, 'synthetic', String(payload.projectName || 'AGRO_FLORESTAL'));
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

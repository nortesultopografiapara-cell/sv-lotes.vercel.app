/**
 * Validação manual — agrupamento global de segmentos por lado (<= 30°).
 * npx tsx scripts/validate-segment-grouping-manual.ts
 */

import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import {
  getOfficialLotMeasurements,
  groupSegmentsByDeflection,
  parseOfficialSegmentsFromBlock,
  COLINEAR_DEFLECTION_MAX_DEG,
} from '../lib/officialLotMeasurements';

function loadEnvFiles() {
  for (const f of [
    '.env.vercel.pull.production',
    '.env.production.local',
    '.env.vercel.production',
    '.env.local',
    '.env',
  ]) {
    if (!existsSync(f)) continue;
    const env = readFileSync(f, 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    }
  }
}

function near(a: number | null | undefined, b: number, tol = 0.06): boolean {
  return a != null && Number.isFinite(a) && Math.abs(a - b) <= tol;
}

function lineSeg(
  idx: number,
  north: number,
  east: number,
  endNorth: number,
  endEast: number,
  distance: number,
) {
  return {
    segment_index: idx,
    north,
    east,
    end_north: endNorth,
    end_east: endEast,
    distance,
    segment_type: 'LINE' as const,
  };
}

function report(title: string, m: ReturnType<typeof getOfficialLotMeasurements>) {
  console.log(`\n=== ${title} ===`);
  console.log({
    frente: m.frente,
    fundo: m.fundo,
    ladoDireito: m.ladoDireito,
    ladoEsquerdo: m.ladoEsquerdo,
    frontSegmentIndex: m.frontSegmentIndex,
    sides: m.sides
      ? {
          front: m.sides.front,
          back: m.sides.back,
          right: m.sides.right,
          left: m.sides.left,
        }
      : null,
  });
}

function scenario1StraightFront() {
  const segs = [
    lineSeg(0, 0, 0, 0, 50, 50),
    lineSeg(1, 0, 50, 100, 50, 100),
    lineSeg(2, 100, 50, 100, 0, 50),
    lineSeg(3, 100, 0, 0, 0, 100),
  ];
  const block = {
    number: 'RECT',
    area: 5000,
    segments_json: segs,
    front_segment_index: 0,
    front_street_name: 'RUA A',
    frente: 50,
  };
  const m = getOfficialLotMeasurements(block, 'CEN-1-RETA');
  report('Cenário 1 — frente reta simples', m);

  const ok =
    near(m.frente, 50) &&
    near(m.fundo, 50) &&
    near(m.ladoDireito, 100) &&
    near(m.ladoEsquerdo, 100) &&
    (m.sides?.front.segmentIndexes.length ?? 0) === 1 &&
    (m.sides?.back.segmentIndexes.length ?? 0) === 1;

  console.log(ok ? 'PASS cenário 1' : 'FAIL cenário 1');
  if (!ok) process.exitCode = 1;
}

function scenario2SmallBreak() {
  const segs = [
    lineSeg(0, 0, 0, 0, 14.66, 14.66),
    lineSeg(1, 0, 14.66, 0.35, 24.32, 9.66),
    lineSeg(2, 0.35, 24.32, 36.03, 24.32, 35.68),
    lineSeg(3, 36.03, 24.32, 36.03, 60.03, 35.71),
    lineSeg(4, 36.03, 60.03, 0, 60.03, 36.03),
    lineSeg(5, 0, 60.03, 0, 0, 60.03),
  ];
  const block = {
    number: '04',
    block_name: '02',
    area: 1200,
    segments_json: segs,
    front_segment_index: 0,
    front_street_name: 'RUA PRINCIPAL',
    frente: 24.32,
  };
  const m = getOfficialLotMeasurements(block, 'CEN-2-QUEBRA-30');
  report('Cenário 2 — quebra <= 30° (Martine QD02 LT04-like)', m);

  const frontSegs = m.sides?.front.segmentIndexes ?? [];
  const ok =
    near(m.frente, 24.32) &&
    frontSegs.includes(0) &&
    frontSegs.includes(1) &&
    !frontSegs.includes(2);

  console.log(ok ? 'PASS cenário 2' : 'FAIL cenário 2');
  if (!ok) process.exitCode = 1;
}

function scenario3StrongBreak() {
  const segs = [
    lineSeg(0, 0, 0, 0, 20, 20),
    lineSeg(1, 0, 20, 3, 23, 3),
    lineSeg(2, 3, 23, 3, 63, 40),
    lineSeg(3, 3, 63, 0, 63, 20),
    lineSeg(4, 0, 63, 0, 0, 63),
  ];
  const block = {
    number: 'CHAN',
    area: 1000,
    segments_json: segs,
    front_segment_index: 0,
    front_street_name: 'RUA CHAN',
    frente: 20,
  };
  const parsed = parseOfficialSegmentsFromBlock(block, 'CEN-3-FORTE');
  const groups = groupSegmentsByDeflection(parsed, 'CEN-3-FORTE');
  const frontGroup = groups.find((g) => g.segmentIndexes.includes(0));
  const m = getOfficialLotMeasurements(block, 'CEN-3-FORTE');
  report('Cenário 3 — quebra > 30° (chanfre ~45°)', m);

  const frontOnlyOne =
    (frontGroup?.segmentIndexes.length ?? 0) === 1 &&
    frontGroup?.segmentIndexes.includes(0);
  const frenteNotGroupedWithChanfre = !(m.sides?.front.segmentIndexes ?? []).includes(1);
  const ok = frontOnlyOne && frenteNotGroupedWithChanfre && near(m.frente, 20);

  console.log({
    COLINEAR_DEFLECTION_MAX_DEG,
    frontGroup: frontGroup?.segmentIndexes,
    chanfreSeg1GroupedWithFront: frontGroup?.segmentIndexes.includes(1) ?? false,
  });
  console.log(ok ? 'PASS cenário 3' : 'FAIL cenário 3');
  if (!ok) process.exitCode = 1;
}

async function scenario2MartineRealFromDb() {
  loadEnvFiles();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log('\nSKIP cenário 2 (DB) — credenciais Supabase ausentes');
    return;
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: projects, error: pe } = await sb
    .from('projects')
    .select('id,name')
    .ilike('name', '%MARTINE%III%');
  if (pe) {
    console.warn('SKIP cenário 2 (DB) — erro projects', pe.message);
    return;
  }
  const projectId = projects?.[0]?.id;
  if (!projectId) {
    console.log('SKIP cenário 2 (DB) — projeto Martine III não encontrado');
    return;
  }

  const { data: blocks, error: be } = await sb
    .from('blocks')
    .select('*')
    .eq('project_id', projectId)
    .limit(800);
  if (be) {
    console.warn('SKIP cenário 2 (DB) — erro blocks', be.message);
    return;
  }

  const lot = (blocks ?? []).find((b) => {
    const q = String(b.block_name ?? b.quadra ?? '').trim();
    const n = String(b.number ?? '').trim();
    return (q === '02' || q === '2' || q === 'QD 02' || q === 'QD02') && n === '4';
  });

  if (!lot) {
    console.log('SKIP cenário 2 (DB) — QD 02 LT 04 não encontrado');
    return;
  }

  const m = getOfficialLotMeasurements(lot, 'MARTINE-QD02-LT04-REAL');
  report('Cenário 2 (DB) — QD 02 LT 04 Martine III real', m);

  const frontSegs = m.sides?.front.segmentIndexes ?? [];
  const seg2 = (lot.segments_json as { segment_index: number; distance: number }[] | undefined)?.find(
    (s) => s.segment_index === 2,
  );
  const seg3 = (lot.segments_json as { segment_index: number; distance: number }[] | undefined)?.find(
    (s) => s.segment_index === 3,
  );

  console.log({
    seg2Distance: seg2?.distance,
    seg3Distance: seg3?.distance,
    frontSegmentIndexes: frontSegs,
  });

  const ok = near(m.frente, 24.32);
  console.log(ok ? 'PASS cenário 2 (DB real)' : 'FAIL cenário 2 (DB real)');
  if (!ok) process.exitCode = 1;
}

async function main() {
  console.log('Validação manual — agrupamento segmentos por lado');
  console.log(`COLINEAR_DEFLECTION_MAX_DEG = ${COLINEAR_DEFLECTION_MAX_DEG}`);

  scenario1StraightFront();
  scenario2SmallBreak();
  scenario3StrongBreak();
  await scenario2MartineRealFromDb();

  if (process.exitCode) {
    console.error('\nValidação manual: FALHOU');
    process.exit(1);
  }
  console.log('\nValidação manual: TODOS OS CENÁRIOS OK');
}

void main();

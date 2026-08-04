/**
 * SELECT readonly — Martine III / QD06 / LT6
 * npx tsx scripts/identify-martine-qd06-lt6.ts
 *
 * Não grava official_side — só identifica e imprime classificação sugerida
 * via editor (draft), para o usuário confirmar no GIS.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  getOfficialLotMeasurements,
  parseOfficialSegmentsFromBlock,
  readManualOfficialSideMap,
} from '../lib/officialLotMeasurements';
import {
  draftMapFromBlock,
  previewOfficialSideDraft,
} from '../lib/officialSidePersist';

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

async function main() {
  loadEnvFiles();
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  if (!url || !key) {
    console.error('SKIP — sem SUPABASE_URL / key no env');
    process.exit(2);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: projects, error: pErr } = await sb
    .from('projects')
    .select('id, name, company_id')
    .ilike('name', '%MARTINE%');
  if (pErr) throw pErr;
  if (!projects?.length) {
    console.error('Nenhum projeto Martine encontrado');
    process.exit(1);
  }

  console.log(
    'Projetos:',
    projects.map((p) => `${p.name} (${p.id})`).join(', '),
  );

  const projectIds = projects.map((p) => p.id);
  const { data: blocks, error: bErr } = await sb
    .from('blocks')
    .select(
      'id, number, block_name, name, front_segment_index, front_street_name, area, updated_at, segments_json, project_id',
    )
    .in('project_id', projectIds);
  if (bErr) throw bErr;

  const lot = (blocks ?? []).find((b) => {
    const num = String(b.number ?? '').replace(/^0+/, '') || '0';
    if (num !== '6') return false;
    const qd = String(b.block_name ?? b.name ?? '');
    const digits = qd.replace(/[^0-9]/g, '');
    return digits === '6' || digits === '06' || /06/i.test(qd);
  });

  if (!lot) {
    console.error('Lote 6 / QD 06 não encontrado nos projetos Martine');
    console.log(
      'Candidatos lote 6:',
      (blocks ?? [])
        .filter(
          (b) =>
            (String(b.number ?? '').replace(/^0+/, '') || '0') === '6',
        )
        .map((b) => ({
          id: b.id,
          number: b.number,
          block_name: b.block_name,
          name: b.name,
        })),
    );
    process.exit(1);
  }

  const project = projects.find((p) => p.id === lot.project_id);
  const segs = parseOfficialSegmentsFromBlock(lot as Record<string, unknown>);
  const manual = readManualOfficialSideMap(lot as Record<string, unknown>);
  const measures = getOfficialLotMeasurements(lot as Record<string, unknown>);
  const draft = draftMapFromBlock(lot as Record<string, unknown>);
  const preview = previewOfficialSideDraft(
    lot as Record<string, unknown>,
    draft.size ? draft : new Map(),
  );

  const rows = segs
    .slice()
    .sort((a, b) => a.segment_index - b.segment_index)
    .map((s) => ({
      indice: s.segment_index,
      comprimento: Number(s.distance),
      official_side_atual: manual.get(s.segment_index) ?? null,
      confrontant:
        (s as { confrontant?: string }).confrontant ??
        null,
    }));

  const out = {
    project: project?.name ?? null,
    project_id: lot.project_id,
    lot_id: lot.id,
    number: lot.number,
    block_name: lot.block_name,
    front_segment_index: lot.front_segment_index,
    front_street_name: lot.front_street_name,
    segment_count: segs.length,
    updated_at: lot.updated_at,
    area: lot.area,
    segments: rows,
    heuristic_measures: {
      frente: measures.frente,
      fundo: measures.fundo,
      ladoDireito: measures.ladoDireito,
      ladoEsquerdo: measures.ladoEsquerdo,
      sides: measures.sides,
    },
    has_manual_official_side: manual.size > 0,
    draft_preview_if_empty: preview.validation.totals,
    note:
      'Classificar no GIS via Editar lados do lote (ADMIN). Não aplicar UPDATE automático.',
  };

  console.log(JSON.stringify(out, null, 2));

  const dir = path.join(
    'scripts',
    '_hotfix_artifacts',
    'martine-qd06-lt6',
  );
  mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, '02-IDENTIFY-RESULT.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

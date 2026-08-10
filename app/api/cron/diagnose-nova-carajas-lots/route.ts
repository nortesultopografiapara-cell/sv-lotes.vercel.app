/**
 * Preview-only diagnose — NOVA CARAJÁS 5º ETAPA lot counts (service role).
 * GET /api/cron/diagnose-nova-carajas-lots
 * Header: x-diag-token: sv-lotes-diag-nova-carajas-1000
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { fetchAllBlocksForProject } from '@/lib/blocksFetchAll';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAG_TOKEN = 'sv-lotes-diag-nova-carajas-1000';
const PROJECT_NAME_PATTERN = '%NOVA CARAJ%';

function ringCentroid(geom: unknown): { lng: number; lat: number } | null {
  try {
    const g = geom as {
      type?: string;
      coordinates?: number[][][] | number[][][][];
    };
    let ring: number[][] | undefined;
    if (g?.type === 'Polygon') ring = (g.coordinates as number[][][])?.[0];
    if (g?.type === 'MultiPolygon')
      ring = (g.coordinates as number[][][][])?.[0]?.[0];
    if (!ring?.length) return null;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const c of ring) {
      if (!Array.isArray(c) || c.length < 2) continue;
      sx += Number(c[0]);
      sy += Number(c[1]);
      n += 1;
    }
    if (!n) return null;
    return { lng: sx / n, lat: sy / n };
  } catch {
    return null;
  }
}

function isLikelyBrazil(lng: number, lat: number) {
  return lng >= -75 && lng <= -30 && lat >= -35 && lat <= 6;
}

export async function GET(request: NextRequest) {
  // Read-only: permitido em production com token (validação do empreendimento real).
  const token = request.headers.get('x-diag-token');
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { client: sb, error: configError } = createServiceSupabase();
  if (!sb || configError) {
    return NextResponse.json(
      { error: configError || 'supabase_unavailable' },
      { status: 503 },
    );
  }

  const { data: projects, error: pErr } = await sb
    .from('projects')
    .select('id, name, tenant_id, company_id')
    .ilike('name', PROJECT_NAME_PATTERN);
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const list = projects || [];
  const target =
    list.find((p) => /5[ºo°. ]?\s*ETAPA/i.test(String(p.name || ''))) ||
    list[0];
  if (!target) {
    return NextResponse.json({ error: 'project_not_found', list }, { status: 404 });
  }

  const projectId = String(target.id);

  const { count: exactCount, error: cErr } = await sb
    .from('blocks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const uncapped = await sb
    .from('blocks')
    .select('id')
    .eq('project_id', projectId);
  const uncappedLen = (uncapped.data || []).length;

  const embed = await sb
    .from('projects')
    .select('id, name, blocks(id)')
    .eq('id', projectId)
    .maybeSingle();
  const embedLen = Array.isArray(embed.data?.blocks)
    ? (embed.data!.blocks as unknown[]).length
    : null;

  const paged = await fetchAllBlocksForProject(sb, projectId, {
    select: 'id, number, block_name, project_id, status, geometry, area',
    applyTenant: false,
  });

  const byQuadra = new Map<string, number>();
  let nullGeom = 0;
  let invalidGeom = 0;
  let outsideRegion = 0;
  const lotKeySeen = new Map<string, number>();
  const invalidSample: Array<Record<string, unknown>> = [];
  const outliersSample: Array<Record<string, unknown>> = [];

  for (const row of paged.rows as Array<Record<string, unknown>>) {
    const q = String(row.block_name || '').trim() || '(sem quadra)';
    byQuadra.set(q, (byQuadra.get(q) || 0) + 1);
    const lotKey = `${q}::${String(row.number || '').trim()}`;
    lotKeySeen.set(lotKey, (lotKeySeen.get(lotKey) || 0) + 1);

    if (row.geometry == null) {
      nullGeom += 1;
      if (invalidSample.length < 40) {
        invalidSample.push({
          id: row.id,
          number: row.number,
          block_name: row.block_name,
          reason: 'geometry_null',
        });
      }
      continue;
    }
    const c = ringCentroid(row.geometry);
    if (!c) {
      invalidGeom += 1;
      if (invalidSample.length < 40) {
        invalidSample.push({
          id: row.id,
          number: row.number,
          block_name: row.block_name,
          reason: 'geometry_invalid',
        });
      }
      continue;
    }
    if (!isLikelyBrazil(c.lng, c.lat)) {
      outsideRegion += 1;
      if (outliersSample.length < 30) {
        outliersSample.push({
          id: row.id,
          number: row.number,
          block_name: row.block_name,
          lng: c.lng,
          lat: c.lat,
        });
      }
    }
  }

  const dupLotKeys = [...lotKeySeen.entries()]
    .filter(([, n]) => n > 1)
    .map(([k, n]) => `${k} x${n}`)
    .slice(0, 50);

  const byQuadraSorted = [...byQuadra.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([quadra, count]) => ({ quadra, count }));

  return NextResponse.json({
    ok: true,
    project: target,
    exactCount: exactCount ?? 0,
    uncappedSelectWithoutRange: uncappedLen,
    embedBlocksLength: embedLen,
    pagedTotal: paged.rowsFetched,
    pagesFetched: paged.pagesFetched,
    duplicatesSkipped: paged.duplicatesSkipped,
    postgrestCapHit:
      uncappedLen === 1000 ||
      embedLen === 1000 ||
      (exactCount ?? 0) > 1000,
    nullGeom,
    invalidGeom,
    outsideRegion,
    duplicateLotNumberInSameQuadra: dupLotKeys,
    byQuadraTop: byQuadraSorted.slice(0, 50),
    byQuadraTotalQuadras: byQuadraSorted.length,
    sumByQuadra: byQuadraSorted.reduce((s, x) => s + x.count, 0),
    invalidSample,
    outliersSample,
    numbersAlign:
      (exactCount ?? 0) === paged.rowsFetched &&
      paged.rowsFetched === byQuadraSorted.reduce((s, x) => s + x.count, 0),
  });
}

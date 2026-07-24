/**
 * Testes — diagnóstico GIS Preview (gating + wiring).
 * npx tsx scripts/mandatory-gis-perf-diagnostics-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  isGisPerfDiagnosticsEnabled,
  gisPerfMeasurePayloadBytes,
  gisPerfSummarizeBlocksPayload,
  readGisPerfTogglesFromSearch,
} from '../lib/gis/performance';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function withEnv(map: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(map)) {
    prev[k] = process.env[k];
    if (map[k] === undefined) delete process.env[k];
    else process.env[k] = map[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(map)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

function testProductionBlocked() {
  withEnv(
    {
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_VERCEL_ENV: 'production',
      NEXT_PUBLIC_GIS_PERF_DIAG: '1',
      NODE_ENV: 'production',
    },
    () => {
      assert(!isGisPerfDiagnosticsEnabled(), 'production sempre off');
      const toggles = readGisPerfTogglesFromSearch('?gisPerf=1&gisPoly=0');
      assert(toggles.panelActive === false, 'painel off em prod');
      assert(toggles.polygons === true, 'defaults em prod');
    },
  );
  console.log('OK testProductionBlocked');
}

function testPreviewEnabled() {
  withEnv(
    {
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_VERCEL_ENV: 'preview',
      NEXT_PUBLIC_GIS_PERF_DIAG: undefined,
      NODE_ENV: 'production',
    },
    () => {
      assert(isGisPerfDiagnosticsEnabled(), 'preview on');
      const on = readGisPerfTogglesFromSearch('?gisPerf=1&gisLabels=0');
      assert(on.panelActive, 'panel');
      assert(on.labels === false, 'labels off');
      assert(on.polygons === true, 'poly default');
    },
  );
  console.log('OK testPreviewEnabled');
}

function testPayloadSummaryNoPii() {
  withEnv(
    {
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_VERCEL_ENV: 'preview',
    },
    () => {
      const rows = [
        {
          source_import: 'TXT_CIVIL3D',
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
          },
          segments_json: [{ a: 1 }],
          customers: { name: 'SECRET_NAME' },
        },
      ];
      const summary = gisPerfSummarizeBlocksPayload(rows);
      assert(summary.lotCount === 1, 'lotCount');
      assert(Number(summary.p95CoordsPerLot) >= 3, 'p95');
      const payload = gisPerfMeasurePayloadBytes(rows);
      assert(payload.bytes > 0, 'bytes');
      assert(!JSON.stringify(summary).includes('SECRET_NAME'), 'sem PII');
    },
  );
  console.log('OK testPayloadSummaryNoPii');
}

function testWiring() {
  const root = process.cwd();
  const map = fs.readFileSync(
    path.join(root, 'components/map/GISMap.tsx'),
    'utf8',
  );
  assert(map.includes('gisPerfBeginSession'), 'GISMap instrumentado');
  assert(map.includes('gis_fetch_request'), 'mark fetch');
  assert(map.includes('readGisPerfTogglesFromSearch'), 'toggles');
  const page = fs.readFileSync(path.join(root, 'app/map/page.tsx'), 'utf8');
  assert(page.includes('GisPerfDiagPanel'), 'painel na page');
  console.log('OK testWiring');
}

function main() {
  testProductionBlocked();
  testPreviewEnabled();
  testPayloadSummaryNoPii();
  testWiring();
  console.log('\nTodos os testes de GIS perf diagnostics passaram.');
}

main();

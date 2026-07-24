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
  assert(map.includes('liveStreetAudits'), 'audits condicionais a ferramentas');
  assert(map.includes('streetGuidesAuditDep'), 'streetGuides não invalida audits no save');
  assert(map.includes('auditLotsKey'), 'audits estáveis em patch de frente');
  assert(map.includes('frontPatchBatch'), 'patch Identificar Frentes');
  assert(map.includes('lotsMutation'), 'Fase A lotsMutation');
  assert(map.includes('mapLotFromBlockRow'), 'mapLotFromBlockRow');
  assert(map.includes('gisPerfLotEditBegin'), 'lot edit telemetria');
  assert(map.includes('gisPerfRealtimePatchBegin'), 'realtime telemetria');
  assert(map.includes('markLocalPatchSuppress'), 'suppress realtime após patch');
  assert(map.includes('applyRealtimePayload'), 'realtime patch local');
  assert(
    !/channel\("realtime:blocks"\)[\s\S]{0,400}loadLots\(\)/.test(map),
    'realtime blocks não deve chamar loadLots() no handler padrão',
  );
  assert(map.includes('gisPerfManualFrontBegin'), 'frente manual telemetria');
  assert(map.includes('collectNearbyLotIds'), 'vizinhos escopados');
  assert(map.includes('buildAllPolysUtm'), 'polys UTM compartilhados');
  {
    const liveBlock = map.match(
      /const liveStreetAudits =\s*([\s\S]*?);/,
    )?.[1] || '';
    assert(
      !liveBlock.includes('frontCorrectLotId'),
      'frente manual não deve entrar em liveStreetAudits',
    );
    assert(
      !liveBlock.includes('confrontEdit'),
      'confrontEdit pontual não deve forçar audits globais',
    );
    assert(
      liveBlock.includes('assistedConfrontationMode'),
      'modo assistido global permanece em liveStreetAudits',
    );
  }
  assert(map.includes('LotBoundaryEdgePolylinesMemo'), 'arestas memoizadas');
  assert(map.includes('setFrontCorrectLotId(null)'), 'fecha modo frente no clique');
  assert(map.includes('effectiveLabelsMinZoom'), 'labels por zoom');
  assert(
    /const displayLots = lots/.test(map),
    'displayLots não remapeia em streetGuides',
  );
  const page = fs.readFileSync(path.join(root, 'app/map/page.tsx'), 'utf8');
  assert(page.includes('GisPerfDiagPanel'), 'painel na page');
  assert(page.includes('ssr: false'), 'painel/GISMap sem SSR');
  assert(page.includes('gisPerfStreetSaveBegin'), 'street save instrumentado');
  assert(page.includes('gisPerfIdentifyFrontsBegin'), 'identify fronts instrumentado');
  assert(page.includes('gisPerfConfrontationBegin'), 'confrontação instrumentada');
  assert(page.includes('lotsMutation={lotsMutation}'), 'lotsMutation passado ao GISMap');
  assert(
    !/handleRunAutomaticConfrontation[\s\S]{0,2500}setMapRefreshKey\(\(k\) => k \+ 1\)/.test(
      page,
    ),
    'confrontação automática não deve bump refreshKey',
  );
  assert(
    !/handleConfirmDeleteQuadra[\s\S]{0,1200}setMapRefreshKey\(\(k\) => k \+ 1\)/.test(
      page,
    ),
    'excluir quadra não deve bump refreshKey',
  );
  assert(
    !/setDeleteLotNumber\(''\);\s*\n\s*await loadProjectQuadras\(\);\s*\n\s*setMapRefreshKey/.test(
      page,
    ),
    'excluir lote não deve bump refreshKey',
  );
  assert(
    !/setMapRefreshKey\(prev => prev \+ 1\);\s*\n\s*\n\s*\} catch \(e: any\)/.test(
      page,
    ),
    'Identificar Frentes não deve bump refreshKey',
  );
  assert(page.includes('refreshKeyBumped: false'), 'sem refreshKey no identify');
  assert(page.includes('startTransition'), 'street save em transition');
  const mapLot = fs.readFileSync(
    path.join(root, 'lib/gis/mapLotFromBlock.ts'),
    'utf8',
  );
  assert(mapLot.includes('export function mapLotFromBlockRow'), 'helper mapLot');
  const nearby = fs.readFileSync(
    path.join(root, 'lib/gis/nearbyLots.ts'),
    'utf8',
  );
  assert(nearby.includes('collectNearbyLotIds'), 'nearbyLots helper');
  const panel = fs.readFileSync(
    path.join(root, 'components/map/GisPerfDiagPanel.tsx'),
    'utf8',
  );
  assert(panel.includes('setReady(true)'), 'painel só após mount');
  assert(panel.includes('lastLotEdit'), 'painel mostra lastLotEdit');
  assert(panel.includes('lastRealtimePatch'), 'painel mostra lastRealtimePatch');
  assert(panel.includes('lastManualFrontEdit'), 'painel mostra lastManualFrontEdit');
  assert(panel.includes('lastConfrontation'), 'painel mostra lastConfrontation');
  assert(
    !/useState\(\(\)\s*=>\s*readGisPerfTogglesFromSearch\(\)/.test(panel),
    'painel não lê URL no useState (hydration)',
  );
  console.log('OK testWiring');
}

function testMapLotFromBlock() {
  const { mapLotFromBlockRow, normalizeBlockKeyForMap } = require('../lib/gis/mapLotFromBlock') as typeof import('../lib/gis/mapLotFromBlock');
  assert(normalizeBlockKeyForMap('Quadra A') === 'A', 'normalize block key');
  const lot = mapLotFromBlockRow({
    id: 'abc',
    project_id: 'p1',
    block_name: 'Q1',
    number: '12',
    status: 'Disponível',
    area: 250,
    price: 1000,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-48.1, -1.4],
          [-48.11, -1.4],
          [-48.11, -1.41],
          [-48.1, -1.4],
        ],
      ],
    },
    frente: 10,
    Fundo: 12,
    'Lado Dir.': 20,
    'Lado Esq.': 20,
  });
  assert(!!lot, 'mapLot returns lot');
  assert(lot!.id === 'abc', 'id');
  assert(Array.isArray(lot!.bounds) && (lot!.bounds as unknown[]).length >= 3, 'bounds');
  assert(lot!.price === 1000, 'price');
  const nullLot = mapLotFromBlockRow({ id: 'x' });
  assert(nullLot === null, 'sem geometry → null');
  console.log('OK testMapLotFromBlock');
}

function testNearbyLots() {
  const { collectNearbyLotIds } = require('../lib/gis/nearbyLots') as typeof import('../lib/gis/nearbyLots');
  const lots = [
    {
      id: 'a',
      bounds: [
        [-1.4, -48.1],
        [-1.401, -48.1],
        [-1.401, -48.101],
        [-1.4, -48.1],
      ] as [number, number][],
    },
    {
      id: 'b',
      bounds: [
        [-1.4005, -48.1005],
        [-1.4015, -48.1005],
        [-1.4015, -48.1015],
        [-1.4005, -48.1005],
      ] as [number, number][],
    },
    {
      id: 'far',
      bounds: [
        [-2.0, -49.0],
        [-2.01, -49.0],
        [-2.01, -49.01],
        [-2.0, -49.0],
      ] as [number, number][],
    },
  ];
  const near = collectNearbyLotIds(lots, 'a', 40);
  assert(near.has('a'), 'inclui foco');
  assert(near.has('b'), 'inclui vizinho');
  assert(!near.has('far'), 'exclui longe');
  console.log('OK testNearbyLots');
}

function main() {
  testProductionBlocked();
  testPreviewEnabled();
  testPayloadSummaryNoPii();
  testWiring();
  testMapLotFromBlock();
  testNearbyLots();
  console.log('\nTodos os testes de GIS perf diagnostics passaram.');
}

main();

/**
 * Suíte obrigatória — performance do Mapa GIS.
 * npx tsx scripts/mandatory-gis-performance-tests.ts
 */
import fs from 'fs';
import path from 'path';
import {
  GIS_PROGRESSIVE_BATCH_SIZE,
  scheduleProgressiveMount,
} from '../lib/gis/mapPerf/progressiveMount';
import {
  buildMapCacheSignature,
  clearAllSessionMapGeometry,
  getSessionMapGeometry,
  invalidateSessionMapGeometry,
  setSessionMapGeometry,
} from '../lib/gis/mapPerf/sessionGeometryCache';
import {
  GIS_BOUNDARY_MIN_ZOOM,
  GIS_LABELS_MIN_ZOOM,
  shouldShowBoundaryEdges,
  shouldShowLotLabels,
  ringIntersectsBounds,
} from '../lib/gis/mapPerf/labelVisibility';
import {
  buildViewportItemFromRing,
  queryViewportIds,
} from '../lib/gis/mapPerf/viewportIndex';
import { parseGeometriesForDisplay } from '../lib/gis/mapPerf/geometryParseWorkerLogic';
import { GIS_WORKER_LOT_THRESHOLD } from '../lib/gis/mapPerf/parseLotGeometries';
import { GIS_MAP_BLOCKS_SLIM_SELECT } from '../lib/gis/mapPerf/slimSelect';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

async function testProgressiveMountAndAbort() {
  assert(GIS_PROGRESSIVE_BATCH_SIZE >= 20 && GIS_PROGRESSIVE_BATCH_SIZE <= 60, 'batch 20-60');
  const items = Array.from({ length: 120 }, (_, i) => ({ id: `id-${i}` }));
  const ac = new AbortController();
  let last = 0;
  await new Promise<void>((resolve, reject) => {
    scheduleProgressiveMount({
      items,
      batchSize: 50,
      signal: ac.signal,
      onBatch: (_b, done) => {
        last = done;
        if (done >= 50) {
          ac.abort();
        }
      },
      onComplete: () => reject(new Error('não deveria completar após abort')),
    });
    setTimeout(() => {
      assert(last >= 50 && last < 120, `abort parcial last=${last}`);
      resolve();
    }, 80);
  });
}

function testCache() {
  clearAllSessionMapGeometry();
  const rows = [
    { id: 'a', updated_at: '2026-01-01' },
    { id: 'b', updated_at: '2026-01-02' },
  ];
  const sig = buildMapCacheSignature('p1', rows);
  setSessionMapGeometry({
    projectId: 'p1',
    signature: sig,
    lots: [{ id: 'a' }],
    blocksData: [],
    cachedAt: Date.now(),
  });
  assert(getSessionMapGeometry('p1', sig)?.lots.length === 1, 'cache hit');
  assert(getSessionMapGeometry('p1', sig + 'x') == null, 'cache miss assinatura');
  invalidateSessionMapGeometry('p1');
  assert(getSessionMapGeometry('p1', sig) == null, 'invalidate');
}

function testLabelVisibility() {
  assert(!shouldShowLotLabels(15, GIS_LABELS_MIN_ZOOM), 'zoom 15 sem labels');
  assert(shouldShowLotLabels(16, GIS_LABELS_MIN_ZOOM), 'zoom 16 com labels');
  assert(!shouldShowBoundaryEdges(16, GIS_BOUNDARY_MIN_ZOOM), 'arestas off longe');
  assert(shouldShowBoundaryEdges(17, GIS_BOUNDARY_MIN_ZOOM), 'arestas on perto');

  const bounds = {
    getSouth: () => 0,
    getNorth: () => 10,
    getWest: () => 0,
    getEast: () => 10,
    pad: () => bounds,
  };
  assert(ringIntersectsBounds([[5, 5]], bounds as any), 'ponto dentro');
  assert(!ringIntersectsBounds([[50, 50]], bounds as any), 'ponto fora');
}

function testViewportIndex() {
  const a = buildViewportItemFromRing('1', [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 0],
  ]);
  const b = buildViewportItemFromRing('2', [
    [100, 100],
    [100, 101],
    [101, 101],
  ]);
  assert(a && b, 'items');
  const ids = queryViewportIds([a!, b!], -1, 2, -1, 2);
  assert(ids.has('1') && !ids.has('2'), 'viewport filter');
}

function testWorkerParse() {
  assert(GIS_WORKER_LOT_THRESHOLD === 200, 'threshold 200');
  const results = parseGeometriesForDisplay([
    {
      id: 'x',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-48.5, -1.4],
            [-48.4, -1.4],
            [-48.4, -1.3],
            [-48.5, -1.3],
            [-48.5, -1.4],
          ],
        ],
      },
    },
  ]);
  assert(results[0].bounds.length >= 3, 'parse ring');
  assert(Number.isFinite(results[0].centroid[0]), 'centroid');
}

function testStaticWiring() {
  assert(exists('lib/gis/mapPerf/progressiveMount.ts'), 'progressive');
  assert(exists('lib/gis/mapPerf/sessionGeometryCache.ts'), 'cache');
  assert(exists('lib/gis/mapPerf/labelVisibility.ts'), 'labels');
  assert(exists('lib/gis/mapPerf/viewportIndex.ts'), 'viewport');
  assert(exists('lib/gis/mapPerf/geometryParse.worker.ts'), 'worker');
  assert(exists('lib/gis/mapPerf/mapPerfMarks.ts'), 'marks');

  const map = read('components/map/GISMap.tsx');
  assert(map.includes('LotCanvasRendererProvider'), 'lot canvas provider');
  assert(map.includes('LotPolygonCanvas'), 'lot polygon canvas');
  assert(map.includes('L.canvas') || read('components/map/LotCanvasRenderer.tsx').includes('L.canvas'), 'L.canvas dedicado');
  assert(!map.includes('preferCanvas={true}'), 'sem preferCanvas global');
  assert(map.includes('background: transparent !important'), 'canvas transparente');
  assert(map.includes('scheduleProgressiveMount'), 'progressive wired');
  assert(map.includes('AbortController'), 'abort');
  assert(map.includes('GIS_MAP_BLOCKS_SLIM_SELECT'), 'slim select');
  assert(map.includes('getConfrontationAudit'), 'audit on demand');
  assert(!/confrontationAudits\s*=\s*useMemo/.test(map), 'sem audit × N');
  assert(map.includes('boundaryEdgesEnabled'), 'arestas por zoom');
  assert(map.includes('Carregando lotes'), 'progresso UX');
  assert(map.includes("key={`label-${item.id}`}"), 'label key estável');
  assert(!map.includes('calculateLotDimensions(\n                      ring'), 'sem dims O(n2) no load');

  assert(GIS_MAP_BLOCKS_SLIM_SELECT.includes('geometry'), 'slim geometry');
  assert(!GIS_MAP_BLOCKS_SLIM_SELECT.includes('*'), 'slim sem star');

  const page = read('app/map/page.tsx');
  assert(page.includes('labelsMinZoom={16}'), 'labelsMinZoom na page');

  // Memorial / prancha não alterados por estes módulos
  assert(!read('lib/gis/mapPerf/buildMapLotFromBlock.ts').includes('memorial'), 'build sem memorial');
}

function testPackageScript() {
  const pkg = JSON.parse(read('package.json'));
  assert(pkg.scripts['test:gis-performance'], 'script npm');
}

async function main() {
  console.log('=== GIS performance tests ===');
  await testProgressiveMountAndAbort();
  console.log('OK progressive/abort');
  testCache();
  console.log('OK cache');
  testLabelVisibility();
  console.log('OK labels');
  testViewportIndex();
  console.log('OK viewport');
  testWorkerParse();
  console.log('OK worker parse');
  testStaticWiring();
  console.log('OK static');
  testPackageScript();
  console.log('OK package');
  console.log('ALL PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

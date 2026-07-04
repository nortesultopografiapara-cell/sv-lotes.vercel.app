/**
 * Ferramenta global "Medir Distância" no mapa GIS.
 * npx tsx scripts/mandatory-gis-distance-measure-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildMeasureSegments,
  canFinalizeMeasure,
  computePreviewDistanceM,
  computeSegmentDistancesM,
  computeTotalDistanceM,
  computeTotalWithPreviewM,
  formatGisDistanceM,
  haversineDistanceM,
  MEASURE_CLICK_DELAY_MS,
  MEASURE_DOUBLE_TAP_MS,
  pointLetter,
  segmentEndpointLetters,
  segmentMidpoint,
  toGisLatLng,
} from '../lib/gis/distanceMeasure';

const ROOT = path.resolve(__dirname, '..');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function testHaversineSingleSegment() {
  const a = toGisLatLng(-1.4553, -48.4892);
  const b = toGisLatLng(-1.4554, -48.4892);
  const d = haversineDistanceM(a, b);
  assert(d > 10 && d < 15, `segmento único ~11 m, got ${d}`);
  assert(formatGisDistanceM(d).includes(' m'), 'formato metros');
  console.log('OK testHaversineSingleSegment');
}

function testMultiSegmentAccumulated() {
  const points = [
    toGisLatLng(0, 0),
    toGisLatLng(0, 0.001),
    toGisLatLng(0, 0.002),
    toGisLatLng(0, 0.003),
  ];
  const segments = computeSegmentDistancesM(points);
  assert(segments.length === 3, '3 trechos');
  const total = computeTotalDistanceM(segments);
  const sumParts = segments.reduce((s, x) => s + x, 0);
  assert(Math.abs(total - sumParts) < 0.01, 'total acumulado');
  const built = buildMeasureSegments(points);
  assert(built[0]?.panelLabel === 'Trecho 1', 'painel Trecho 1');
  assert(built[0]?.mapLabel === 'Trecho AB', 'mapa Trecho AB');
  assert(built[2]?.mapLabel === 'Trecho CD', 'mapa Trecho CD');
  console.log('OK testMultiSegmentAccumulated');
}

function testFormatKmThreshold() {
  assert(formatGisDistanceM(987.15) === '987,15 m', '987 m');
  assert(formatGisDistanceM(1000) === '1,00 km', '1000 m → km');
  assert(formatGisDistanceM(3420) === '3,42 km', '3,42 km');
  assert(formatGisDistanceM(1280) === '1,28 km', '1,28 km');
  console.log('OK testFormatKmThreshold');
}

function testPreviewAndTotalWithPreview() {
  const points = [toGisLatLng(0, 0), toGisLatLng(0, 0.001)];
  const segments = computeSegmentDistancesM(points);
  const cursor = toGisLatLng(0, 0.002);
  const preview = computePreviewDistanceM(points, cursor);
  assert(preview != null && preview > 0, 'preview distance');
  const totalPreview = computeTotalWithPreviewM(segments, preview);
  assert(totalPreview > segments[0], 'total com preview maior que fixo');
  console.log('OK testPreviewAndTotalWithPreview');
}

function testCanFinalize() {
  assert(!canFinalizeMeasure([toGisLatLng(0, 0)]), '1 ponto não finaliza');
  assert(
    canFinalizeMeasure([toGisLatLng(0, 0), toGisLatLng(0, 0.001)]),
    '2 pontos finaliza',
  );
  console.log('OK testCanFinalize');
}

function testPointLetters() {
  assert(pointLetter(0) === 'A', 'A');
  assert(pointLetter(1) === 'B', 'B');
  assert(segmentEndpointLetters(0) === 'AB', 'AB');
  assert(segmentEndpointLetters(1) === 'BC', 'BC');
  console.log('OK testPointLetters');
}

function testSegmentMidpoint() {
  const mid = segmentMidpoint(toGisLatLng(0, 0), toGisLatLng(2, 4));
  assert(mid.lat === 1 && mid.lng === 2, 'midpoint');
  console.log('OK testSegmentMidpoint');
}

function testGisMapIntegration() {
  const gisMap = read('components/map/GISMap.tsx');
  assert(
    gisMap.includes('DistanceMeasureMapContent'),
    'GISMap usa DistanceMeasureMapContent',
  );
  assert(
    gisMap.includes('DistanceMeasureOverlay'),
    'GISMap usa DistanceMeasureOverlay',
  );
  assert(
    !gisMap.includes('MeasureInteraction'),
    'MeasureInteraction legado removido',
  );
  assert(
    !gisMap.includes('SHOW_AUXILIARY_LINES && (\n          <MeasureInteraction'),
    'medição não depende de SHOW_AUXILIARY_LINES',
  );
  assert(
    gisMap.includes('interactive={mapLotPickActive || !(drawStreetActive || measureActive)}'),
    'lotes não interativos durante medição',
  );
  assert(
    gisMap.includes('onMeasureDeactivate'),
    'callback onMeasureDeactivate',
  );
  console.log('OK testGisMapIntegration');
}

function testDistanceMeasureToolUi() {
  const tool = read('components/map/DistanceMeasureTool.tsx');
  assert(tool.includes('Finalizar'), 'botão Finalizar');
  assert(tool.includes('Limpar Medição'), 'botão Limpar Medição');
  assert(tool.includes("e.key === 'Escape'"), 'ESC cancela');
  assert(tool.includes('dblclick'), 'duplo clique finaliza');
  assert(tool.includes('touchend'), 'mobile double tap');
  assert(tool.includes('gis-distance-measure-panel-anchor'), 'ancora CSS do painel');
  assert(tool.includes('data-testid="gis-distance-measure-panel"'), 'painel');
  const css = read('app/map/gis-map-mobile.css');
  assert(
    css.includes('--gis-measure-panel-right'),
    'CSS offset da toolbar no painel',
  );
  assert(
    css.includes('gis-distance-measure-panel-anchor'),
    'classe anchor no CSS',
  );
  assert(
    css.includes('5.5rem'),
    'desktop ~88px de folga da toolbar',
  );
  assert(
    tool.includes('MEASURE_CLICK_DELAY_MS'),
    'delay anti-duplo-clique',
  );
  assert(
    tool.includes('MEASURE_DOUBLE_TAP_MS'),
    'double tap mobile',
  );
  console.log('OK testDistanceMeasureToolUi');
}

function testMapPageWiring() {
  const page = read('app/map/page.tsx');
  assert(page.includes('onMeasureDeactivate'), 'page passa onMeasureDeactivate');
  assert(page.includes('setMeasureActive(false)'), 'desativa medição');
  assert(page.includes('Medir Distância'), 'botão régua');
  console.log('OK testMapPageWiring');
}

function testTimingConstants() {
  assert(MEASURE_CLICK_DELAY_MS >= 200, 'click delay razoável');
  assert(MEASURE_DOUBLE_TAP_MS >= 250, 'double tap window');
  console.log('OK testTimingConstants');
}

function testLotInteractionAfterExit() {
  const gisMap = read('components/map/GISMap.tsx');
  const page = read('app/map/page.tsx');
  assert(
    page.includes('onMeasureDeactivate={() => setMeasureActive(false)}'),
    'sair da medição restaura measureActive false',
  );
  assert(
    gisMap.includes('!(drawStreetActive || measureActive)'),
    'interatividade lotes condicionada a measureActive',
  );
  console.log('OK testLotInteractionAfterExit');
}

function main() {
  testHaversineSingleSegment();
  testMultiSegmentAccumulated();
  testFormatKmThreshold();
  testPreviewAndTotalWithPreview();
  testCanFinalize();
  testPointLetters();
  testSegmentMidpoint();
  testGisMapIntegration();
  testDistanceMeasureToolUi();
  testMapPageWiring();
  testTimingConstants();
  testLotInteractionAfterExit();
  console.log('mandatory-gis-distance-measure-tests: all passed');
}

main();

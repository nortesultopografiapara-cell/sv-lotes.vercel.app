/**
 * Ferramenta global "Medir Área" no mapa GIS.
 * npx tsx scripts/mandatory-gis-area-measure-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  AREA_M2_HA_THRESHOLD,
  buildAreaPolygonRing,
  buildAreaSides,
  canFinalizeAreaMeasure,
  computeGeodesicAreaM2,
  computePerimeterM,
  formatGisAreaM2,
} from '../lib/gis/areaMeasure';
import { formatGisDistanceM, toGisLatLng } from '../lib/gis/distanceMeasure';

const ROOT = path.resolve(__dirname, '..');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function testFormatAreaUnits() {
  assert(formatGisAreaM2(845.32) === '845,32 m²', 'm² abaixo do limite');
  assert(formatGisAreaM2(2354.88) === '2.354,88 m²', 'm² com milhar');
  assert(formatGisAreaM2(12700) === '1,27 ha', 'hectares');
  assert(formatGisAreaM2(158300) === '15,83 ha', 'ha grande');
  assert(AREA_M2_HA_THRESHOLD === 10_000, 'limite 10000');
  console.log('OK testFormatAreaUnits');
}

function testSimpleTriangleArea() {
  const p0 = toGisLatLng(0, 0);
  const p1 = toGisLatLng(0, 0.001);
  const p2 = toGisLatLng(0.001, 0.001);
  const area = computeGeodesicAreaM2([p0, p1, p2], true);
  assert(area != null && area > 1000 && area < 10_000_000, `área simples ${area}`);
  console.log('OK testSimpleTriangleArea');
}

function testComplexPolygonArea() {
  const points = [
    toGisLatLng(-1.455, -48.489),
    toGisLatLng(-1.455, -48.488),
    toGisLatLng(-1.454, -48.488),
    toGisLatLng(-1.454, -48.4895),
    toGisLatLng(-1.4545, -48.49),
  ];
  const area = computeGeodesicAreaM2(points, true);
  assert(area != null && area > 1000, 'área complexa positiva');
  const ring = buildAreaPolygonRing(points, { finalized: true });
  assert(ring != null && ring.length >= 4, 'anel fechado');
  console.log('OK testComplexPolygonArea');
}

function testPerimeterClosed() {
  const points = [
    toGisLatLng(0, 0),
    toGisLatLng(0, 0.001),
    toGisLatLng(0.001, 0.001),
  ];
  const p = computePerimeterM(points, true);
  assert(p > 200 && p < 500, `perímetro fechado ~${p}`);
  assert(formatGisDistanceM(p).includes(' m'), 'perímetro em metros');
  console.log('OK testPerimeterClosed');
}

function testAreaSides() {
  const points = [
    toGisLatLng(0, 0),
    toGisLatLng(0, 0.001),
    toGisLatLng(0.001, 0.001),
  ];
  const sides = buildAreaSides(points, true);
  assert(sides.length === 3, '3 lados');
  assert(sides[0]?.panelLabel === 'Lado 1', 'Lado 1');
  assert(sides[2]?.panelLabel === 'Lado 3', 'Lado 3');
  assert(sides.every((s) => s.distanceM > 0), 'distâncias positivas');
  console.log('OK testAreaSides');
}

function testCanFinalizeArea() {
  assert(!canFinalizeAreaMeasure([toGisLatLng(0, 0)]), '1 vértice');
  assert(!canFinalizeAreaMeasure([toGisLatLng(0, 0), toGisLatLng(0, 0.001)]), '2 vértices');
  assert(
    canFinalizeAreaMeasure([
      toGisLatLng(0, 0),
      toGisLatLng(0, 0.001),
      toGisLatLng(0.001, 0.001),
    ]),
    '3 vértices',
  );
  console.log('OK testCanFinalizeArea');
}

function testPreviewAreaWithCursor() {
  const points = [toGisLatLng(0, 0), toGisLatLng(0, 0.001)];
  const cursor = toGisLatLng(0.001, 0);
  const area = computeGeodesicAreaM2(points, false, cursor);
  assert(area != null && area > 0, 'área preview');
  const perimeter = computePerimeterM(points, false, cursor);
  assert(perimeter > 0, 'perímetro preview');
  console.log('OK testPreviewAreaWithCursor');
}

function testGisMapIntegration() {
  const gisMap = read('components/map/GISMap.tsx');
  assert(gisMap.includes('AreaMeasureMapContent'), 'AreaMeasureMapContent');
  assert(gisMap.includes('AreaMeasureOverlay'), 'AreaMeasureOverlay');
  assert(gisMap.includes('areaMeasureActive'), 'prop areaMeasureActive');
  assert(gisMap.includes('gisMeasureToolActive'), 'modo medição unificado');
  assert(
    gisMap.includes('!(drawStreetActive || gisMeasureToolActive)'),
    'lotes desabilitados em medição',
  );
  console.log('OK testGisMapIntegration');
}

function testAreaMeasureToolUi() {
  const tool = read('components/map/AreaMeasureTool.tsx');
  assert(tool.includes('Medição de Área'), 'título painel');
  assert(tool.includes('Finalizar'), 'botão Finalizar');
  assert(tool.includes('Limpar'), 'botão Limpar');
  assert(tool.includes("e.key === 'Escape'"), 'ESC');
  assert(tool.includes('dblclick'), 'duplo clique');
  assert(tool.includes('touchend'), 'mobile');
  assert(tool.includes('gis-area-measure-panel-anchor'), 'ancora painel');
  assert(tool.includes('fillOpacity: 0.25'), 'preenchimento semitransparente');
  assert(tool.includes('map.closePopup'), 'fecha popup');
  console.log('OK testAreaMeasureToolUi');
}

function testMapPageWiring() {
  const page = read('app/map/page.tsx');
  assert(page.includes('areaMeasureActive'), 'estado areaMeasureActive');
  assert(page.includes('onAreaMeasureDeactivate'), 'callback desativa');
  assert(page.includes('Medir Área'), 'botão toolbar');
  assert(page.includes('LandPlot'), 'ícone área');
  console.log('OK testMapPageWiring');
}

function testMutualExclusion() {
  const page = read('app/map/page.tsx');
  assert(page.includes('setAreaMeasureActive(false)'), 'desativa área');
  assert(page.includes('setMeasureActive(false)'), 'desativa distância');
  console.log('OK testMutualExclusion');
}

function testLotInteractionAfterExit() {
  const page = read('app/map/page.tsx');
  assert(
    page.includes('onAreaMeasureDeactivate={() => setAreaMeasureActive(false)}'),
    'sair restaura estado',
  );
  console.log('OK testLotInteractionAfterExit');
}

function main() {
  testFormatAreaUnits();
  testSimpleTriangleArea();
  testComplexPolygonArea();
  testPerimeterClosed();
  testAreaSides();
  testCanFinalizeArea();
  testPreviewAreaWithCursor();
  testGisMapIntegration();
  testAreaMeasureToolUi();
  testMapPageWiring();
  testMutualExclusion();
  testLotInteractionAfterExit();
  console.log('mandatory-gis-area-measure-tests: all passed');
}

main();

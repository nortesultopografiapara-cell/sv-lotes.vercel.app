/**
 * Medição de Área — unidades fixas, exportação PDF.
 * npx tsx scripts/mandatory-gis-area-measure-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildAreaPolygonRing,
  buildAreaSides,
  canFinalizeAreaMeasure,
  computeGeodesicAreaM2,
  computePerimeterM,
  formatGisAreaM2,
  formatGisLengthM,
} from '../lib/gis/areaMeasure';
import {
  buildAreaMeasureReportSections,
  canExportAreaMeasurePdf,
  validateAreaMeasureExportForm,
} from '../lib/gis/areaMeasurePdf';
import { toGisLatLng } from '../lib/gis/distanceMeasure';

const ROOT = path.resolve(__dirname, '..');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function testFormatAreaAlwaysM2() {
  assert(formatGisAreaM2(845.32) === '845,32 m²', '845 m²');
  assert(formatGisAreaM2(2354.88) === '2.354,88 m²', 'milhar m²');
  assert(formatGisAreaM2(153400.25) === '153.400,25 m²', 'grande m²');
  assert(formatGisAreaM2(12700) === '12.700,00 m²', 'nunca ha');
  assert(formatGisAreaM2(158300) === '158.300,00 m²', 'nunca ha grande');
  assert(!formatGisAreaM2(12700).includes('ha'), 'sem ha');
  console.log('OK testFormatAreaAlwaysM2');
}

function testFormatLengthAlwaysMeters() {
  assert(formatGisLengthM(18.52) === '18,52 m', 'lado');
  assert(formatGisLengthM(1764.83) === '1.764,83 m', 'perímetro grande em m');
  assert(formatGisLengthM(1500) === '1.500,00 m', 'nunca km');
  assert(!formatGisLengthM(1500).includes('km'), 'sem km');
  console.log('OK testFormatLengthAlwaysMeters');
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
  assert(formatGisLengthM(p).endsWith(' m'), 'perímetro em m');
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
  assert(formatGisLengthM(sides[0]!.distanceM).endsWith(' m'), 'lado em m');
  console.log('OK testAreaSides');
}

function testCanFinalizeArea() {
  assert(!canFinalizeAreaMeasure([toGisLatLng(0, 0)]), '1 vértice');
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

function testExportValidation() {
  assert(!validateAreaMeasureExportForm({ propertyName: '', ownerName: 'A', observations: '' }).ok, 'prop obrigatória');
  assert(!validateAreaMeasureExportForm({ propertyName: 'Fazenda', ownerName: '', observations: '' }).ok, 'owner obrigatório');
  assert(validateAreaMeasureExportForm({ propertyName: 'Fazenda', ownerName: 'João', observations: '' }).ok, 'ok');
  assert(validateAreaMeasureExportForm({ propertyName: 'Fazenda', ownerName: 'João', observations: 'Nota' }).ok, 'obs opcional');
  console.log('OK testExportValidation');
}

function testCanExportPdf() {
  assert(!canExportAreaMeasurePdf(null, 3), 'sem área');
  assert(!canExportAreaMeasurePdf(100, 2), 'poucos pontos');
  assert(canExportAreaMeasurePdf(153400.25, 4), 'área válida');
  console.log('OK testCanExportPdf');
}

function testPdfReportSections() {
  const sections = buildAreaMeasureReportSections({
    propertyName: 'Fazenda Teste',
    ownerName: 'Maria Souza',
    observations: 'Medição preliminar',
    projectName: 'CHÁCARAS RR',
    companyName: 'Meneses Imobiliária',
    userName: 'Admin GIS',
    measuredAt: new Date('2026-07-04T14:30:00'),
    areaM2: 153400.25,
    perimeterM: 1764.83,
    sides: [
      { panelLabel: 'Lado 1', distanceM: 476.75 },
      { panelLabel: 'Lado 2', distanceM: 283.13 },
    ],
  });
  assert(sections.title === 'RELATÓRIO DE MEDIÇÃO DE ÁREA', 'título');
  assert(sections.subtitle === 'SV LOTES GIS', 'subtítulo');
  assert(sections.areaValue === '153.400,25 m²', 'área pdf m²');
  assert(sections.perimeterValue === '1.764,83 m', 'perímetro pdf m');
  assert(sections.sidesRows[0]?.[1] === '476,75 m', 'lado pdf m');
  assert(sections.observations === 'Medição preliminar', 'observações');
  assert(
    sections.infoRows.some(([k, v]) => k === 'Nome da propriedade' && v === 'Fazenda Teste'),
    'propriedade',
  );
  assert(
    sections.infoRows.some(([k]) => k === 'Empreendimento'),
    'empreendimento',
  );
  assert(sections.footerLines[0]?.includes('SV LOTES GIS'), 'rodapé');
  console.log('OK testPdfReportSections');
}

function testGisMapIntegration() {
  const gisMap = read('components/map/GISMap.tsx');
  assert(gisMap.includes('areaMeasureExportMeta'), 'export meta GISMap');
  console.log('OK testGisMapIntegration');
}

function testAreaMeasureToolUi() {
  const tool = read('components/map/AreaMeasureTool.tsx');
  assert(tool.includes('Exportar PDF'), 'botão exportar');
  assert(tool.includes('AreaMeasureExportModal'), 'modal export');
  assert(tool.includes('formatGisLengthM'), 'metros fixos UI');
  assert(tool.includes('data-testid="gis-area-measure-export-pdf"'), 'testid export');
  assert(!tool.includes('formatGisDistanceM'), 'sem km na UI área');
  console.log('OK testAreaMeasureToolUi');
}

function testExportModalUi() {
  const modal = read('components/map/AreaMeasureExportModal.tsx');
  assert(modal.includes('Identificação da Área'), 'título modal');
  assert(modal.includes('Nome da propriedade'), 'campo propriedade');
  assert(modal.includes('Nome do proprietário'), 'campo proprietário');
  assert(modal.includes('Observações (opcional)'), 'obs opcional');
  assert(modal.includes('Gerar PDF'), 'gerar pdf');
  console.log('OK testExportModalUi');
}

function testMapPageWiring() {
  const page = read('app/map/page.tsx');
  assert(page.includes('areaMeasureExportMeta'), 'meta no page');
  console.log('OK testMapPageWiring');
}

function main() {
  testFormatAreaAlwaysM2();
  testFormatLengthAlwaysMeters();
  testSimpleTriangleArea();
  testComplexPolygonArea();
  testPerimeterClosed();
  testAreaSides();
  testCanFinalizeArea();
  testExportValidation();
  testCanExportPdf();
  testPdfReportSections();
  testGisMapIntegration();
  testAreaMeasureToolUi();
  testExportModalUi();
  testMapPageWiring();
  console.log('mandatory-gis-area-measure-tests: all passed');
}

main();

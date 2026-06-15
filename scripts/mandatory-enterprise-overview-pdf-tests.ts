/**
 * Prancha Geral do Empreendimento — testes obrigatórios.
 * npx tsx scripts/mandatory-enterprise-overview-pdf-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  allEnterpriseLotsFitLayout,
  buildEnterpriseOverviewLayout,
  calculateBestPrintRotation,
  computeEnterpriseMapContentRectMm,
  computeEnterpriseStatistics,
  computeGeographicBoundsFromRotatedBbox,
  DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  ENTERPRISE_LOT_FILL_OPACITY,
  ENTERPRISE_LOT_STROKE_RGB,
  ENTERPRISE_LOT_STROKE_WIDTH_MM,
  fitEnterpriseForPrint,
  latLngToLocalRotated,
  localRotatedToLatLng,
  projectEnterprisePointToPdf,
  projectGeographicPointToPdf,
  type EnterpriseBbox,
} from '../lib/enterpriseOverviewLayout';
import {
  blendFillColorForWhiteBackground,
  buildClosedPolygonPath,
  buildEnterpriseOverviewPayload,
  computeEnterpriseMapContentRectMm as pdfContentRect,
  countPdfPaintOperators,
  drawClosedPolygonLines,
  drawLotFillOnly,
  drawLotStrokeOnly,
  enterpriseOverviewPdfRawStream,
  ENTERPRISE_MAP_DRAW_ORDER,
  ENTERPRISE_SATELLITE_UNAVAILABLE_MSG,
  enterpriseOverviewPdfTextContent,
  ENTERPRISE_LOT_FILL_OPACITY as PDF_FILL_OPACITY,
  ENTERPRISE_LOT_STROKE_RGB as PDF_STROKE_RGB,
  generateEnterpriseOverviewPdf,
  getLastEnterpriseLotDrawStats,
  isPerimeterOnlyPolygonPath,
  isValidPdfRing,
  projectGeographicPointToPdf as pdfProjectGeo,
  ringToLineDeltas,
} from '../lib/enterpriseOverviewPdf';
import {
  fetchSatelliteBackgroundBase64,
  isSatelliteBackgroundAvailable,
} from '../lib/enterpriseOverviewSatellite';
import { jsPDF } from 'jspdf';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
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
    segment_type: 'LINE',
  };
}

function rectLot(
  id: string,
  number: string,
  quadra: string,
  status: string,
  east0: number,
  north0: number,
  width: number,
  height: number,
  area: number,
): Record<string, unknown> {
  const segs = [
    lineSeg(0, north0, east0, north0 + height, east0, height),
    lineSeg(1, north0 + height, east0, north0 + height, east0 + width, width),
    lineSeg(2, north0 + height, east0 + width, north0, east0 + width, height),
    lineSeg(3, north0, east0 + width, north0, east0, width),
  ];
  return {
    id,
    number,
    block_name: quadra,
    status,
    area,
    segments_json: segs,
  };
}

function buildMartineIiiBlocks(): Record<string, unknown>[] {
  // UTM 22S — região Parauapebas (~9.33M N, ~678K E)
  const baseE = 678_000;
  const baseN = 9_330_000;
  const w = 40;
  const h = 50;
  const gap = 8;
  return [
    rectLot('m-q02-l01', '01', '02', 'Vendido', baseE, baseN, w, h, 2000),
    rectLot('m-q02-l02', '02', '02', 'Reservado', baseE, baseN + h + gap, w, h, 2000),
    rectLot('m-q02-l03', '03', '02', 'Disponível', baseE, baseN + (h + gap) * 2, w, h, 2000),
    rectLot('m-q05-l01', '01', '05', 'Vendido', baseE, baseN + (h + gap) * 3, w, h, 2000),
    rectLot('m-q05-l02', '02', '05', 'Disponível', baseE, baseN + (h + gap) * 4, w, h, 2000),
    rectLot('m-q05-l03', '03', '05', 'Disponível', baseE, baseN + (h + gap) * 5, w, h, 2000),
  ];
}

const MARTINE_PROJECT = {
  name: 'CHACARAS E LOTES MARTINE III',
  city: 'Parauapebas',
  uf: 'PA',
  utm_zone: '22S',
};

const MARTINE_COMPANY = {
  name: 'MENESES IMOBILIARIA',
  fantasy_name: 'MENESES',
  phone: '(94) 99999-0000',
  email: 'contato@meneses.com',
  website: 'www.meneses.com.br',
  instagram: '@menesesimob',
  logo_url: '',
};

function testFitEnterpriseIncludesAllLots() {
  const blocks = buildMartineIiiBlocks();
  const fit = fitEnterpriseForPrint({
    blocks,
    project: MARTINE_PROJECT,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  assert(fit.lots.length === blocks.length, `lotes no fit ${fit.lots.length}`);
  assert(fit.bbox.maxY > fit.bbox.minY, 'bbox valido');
  console.log('OK testFitEnterpriseIncludesAllLots');
}

function testAutoRotationVerticalLayout() {
  const blocks = buildMartineIiiBlocks();
  const fit = fitEnterpriseForPrint({
    blocks,
    project: MARTINE_PROJECT,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  const bbox: EnterpriseBbox = fit.bbox;
  const h = bbox.maxY - bbox.minY;
  const w = bbox.maxX - bbox.minX;
  assert(h > w * 1.2, 'layout vertical para teste');
  const rot = calculateBestPrintRotation(bbox, 350, 240);
  assert(rot === 90, `rotacao esperada 90, obtido ${rot}`);
  console.log('OK testAutoRotationVerticalLayout');
}

function testLegendStatistics() {
  const blocks = buildMartineIiiBlocks();
  const stats = computeEnterpriseStatistics(blocks, MARTINE_PROJECT, '08/06/2026');
  assert(stats.lotCount === 6, `total lotes ${stats.lotCount}`);
  assert(stats.quadraCount === 2, `quadras ${stats.quadraCount}`);
  assert(stats.disponivel === 3, `disponivel ${stats.disponivel}`);
  assert(stats.reservado === 1, `reservado ${stats.reservado}`);
  assert(stats.vendido === 2, `vendido ${stats.vendido}`);
  assert(stats.projectName.includes('MARTINE III'), stats.projectName);
  console.log('OK testLegendStatistics');
}

function testAllLotsFitMapBox() {
  const layout = buildEnterpriseOverviewLayout({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  assert(allEnterpriseLotsFitLayout(layout), 'lotes fora do mapa');
  assert(layout.graphicScale.barMeters > 0, 'escala grafica');
  console.log('OK testAllLotsFitMapBox');
}

function testNoTriangulationInPolygonPath() {
  const pts: [number, number][] = [
    [0, 0],
    [40, 0],
    [40, 50],
    [0, 50],
  ];
  const path = buildClosedPolygonPath(pts);
  assert(isPerimeterOnlyPolygonPath(path, pts.length), 'path somente perimetro');
  console.log('OK testNoTriangulationInPolygonPath');
}

function testLotFillOpacityAndStrokeWidth() {
  assert(ENTERPRISE_LOT_FILL_OPACITY === 0.5, `opacity ${ENTERPRISE_LOT_FILL_OPACITY}`);
  assert(PDF_FILL_OPACITY === ENTERPRISE_LOT_FILL_OPACITY, 'pdf opacity sync');
  assert(
    ENTERPRISE_LOT_STROKE_WIDTH_MM >= 0.6 && ENTERPRISE_LOT_STROKE_WIDTH_MM <= 0.8,
    `stroke ${ENTERPRISE_LOT_STROKE_WIDTH_MM}`,
  );
  assert(
    ENTERPRISE_LOT_STROKE_RGB[0] === 0 &&
      ENTERPRISE_LOT_STROKE_RGB[1] === 229 &&
      ENTERPRISE_LOT_STROKE_RGB[2] === 255,
    `stroke rgb ${ENTERPRISE_LOT_STROKE_RGB.join(',')}`,
  );
  assert(
    PDF_STROKE_RGB[0] === ENTERPRISE_LOT_STROKE_RGB[0] &&
      PDF_STROKE_RGB[1] === ENTERPRISE_LOT_STROKE_RGB[1] &&
      PDF_STROKE_RGB[2] === ENTERPRISE_LOT_STROKE_RGB[2],
    'pdf stroke rgb sync',
  );
  const blended = blendFillColorForWhiteBackground([34, 197, 94]);
  assert(blended[1] > blended[0], 'verde mesclado');
  assert(blended[1] > 180, 'fill visivel em fundo branco');
  console.log('OK testLotFillOpacityAndStrokeWidth');
}

function testFillStrokeSeparatePasses() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pts: [number, number][] = [
    [20, 20],
    [60, 20],
    [60, 60],
    [20, 60],
  ];
  assert(drawClosedPolygonLines(doc, pts, 'F'), 'fill polygon');
  assert(drawLotFillOnly(doc, pts, [34, 197, 94]), 'lot fill');
  assert(drawLotStrokeOnly(doc, pts), 'lot stroke');
  const stream = enterpriseOverviewPdfRawStream(doc);
  const ops = countPdfPaintOperators(stream);
  assert(ops.fills >= 2, `pdf fills ${ops.fills}`);
  assert(ops.strokes >= 1, `pdf strokes ${ops.strokes}`);
  assert(ops.cyanStrokeRgb, 'ciano no stream');
  assert(ops.strokeWidth07, 'espessura 0.7 no stream');
  console.log('OK testFillStrokeSeparatePasses');
}

function testRingToLineDeltasPerimeterOnly() {
  const pts: [number, number][] = [
    [10, 10],
    [50, 10],
    [50, 40],
    [10, 40],
  ];
  const deltas = ringToLineDeltas(pts);
  assert(deltas.length === pts.length - 1, 'deltas perimetro');
  assert(isValidPdfRing(pts), 'anel valido');
  const path = buildClosedPolygonPath(pts);
  assert(isPerimeterOnlyPolygonPath(path, pts.length), 'path somente perimetro');
  console.log('OK testRingToLineDeltasPerimeterOnly');
}

async function testMapLotsDrawnEqualTotal() {
  const blocks = buildMartineIiiBlocks();
  const payload = buildEnterpriseOverviewPayload({
    blocks,
    project: MARTINE_PROJECT,
    company: MARTINE_COMPANY,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
    generatedAt: '15/06/2026',
  });
  const doc = await generateEnterpriseOverviewPdf({
    ...payload,
    logoBase64: null,
    options: { ...DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS, showSatelliteBackground: false },
  });
  const stats = getLastEnterpriseLotDrawStats();
  assert(stats != null, 'stats desenho');
  assert(stats!.lotsTotal === blocks.length, `total ${stats!.lotsTotal}`);
  assert(stats!.fillsDrawn === blocks.length, `fills ${stats!.fillsDrawn}`);
  assert(stats!.strokesDrawn === blocks.length, `strokes ${stats!.strokesDrawn}`);
  assert(stats!.skippedInvalidRing === 0, 'nenhum lote ignorado');

  const stream = enterpriseOverviewPdfRawStream(doc);
  const ops = countPdfPaintOperators(stream);
  assert(ops.fills >= blocks.length, `stream fills ${ops.fills}`);
  assert(ops.strokes >= blocks.length, `stream strokes ${ops.strokes}`);
  assert(ops.cyanStrokeRgb, 'ciano nos poligonos do mapa');
  assert(ops.strokeWidth07, '0.7mm nos strokes do mapa');
  console.log('OK testMapLotsDrawnEqualTotal');
}

async function testLegendAloneDoesNotSatisfyMapFill() {
  const doc = new jsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' });
  const legendOnly = blendFillColorForWhiteBackground([34, 197, 94]);
  doc.setFillColor(...legendOnly);
  doc.rect(10, 10, 4, 4, 'F');
  doc.setDrawColor(...ENTERPRISE_LOT_STROKE_RGB);
  doc.setLineWidth(0.35);
  doc.rect(10, 10, 4, 4, 'S');
  const opsLegend = countPdfPaintOperators(enterpriseOverviewPdfRawStream(doc));

  const blocks = buildMartineIiiBlocks();
  const payload = buildEnterpriseOverviewPayload({
    blocks,
    project: MARTINE_PROJECT,
    company: MARTINE_COMPANY,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  const mapDoc = await generateEnterpriseOverviewPdf({
    ...payload,
    logoBase64: null,
    options: { ...DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS, showSatelliteBackground: false },
  });
  const opsMap = countPdfPaintOperators(enterpriseOverviewPdfRawStream(mapDoc));
  const stats = getLastEnterpriseLotDrawStats();

  assert(
    opsMap.fills > opsLegend.fills + blocks.length - 1,
    `mapa fills ${opsMap.fills} vs legenda ${opsLegend.fills}`,
  );
  assert(
    opsMap.strokes >= blocks.length + opsLegend.strokes,
    `mapa strokes ${opsMap.strokes}`,
  );
  assert(stats!.fillsDrawn === blocks.length, 'fills reais no mapa');
  assert(opsMap.cyanStrokeRgb, 'ciano nos poligonos, nao so legenda');
  console.log('OK testLegendAloneDoesNotSatisfyMapFill');
}

function testDrawOrderDefinition() {
  const fillsIdx = ENTERPRISE_MAP_DRAW_ORDER.indexOf('lot_fills');
  const streetsIdx = ENTERPRISE_MAP_DRAW_ORDER.indexOf('streets');
  const strokesIdx = ENTERPRISE_MAP_DRAW_ORDER.indexOf('lot_strokes');
  const numbersIdx = ENTERPRISE_MAP_DRAW_ORDER.indexOf('lot_numbers');
  assert(fillsIdx < streetsIdx, 'fills antes ruas');
  assert(streetsIdx < strokesIdx, 'ruas antes divisas');
  assert(strokesIdx < numbersIdx, 'divisas antes numeros');
  console.log('OK testDrawOrderDefinition');
}

function testSatelliteUsesSameTransformAsLots() {
  const layout = buildEnterpriseOverviewLayout({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  const content = computeEnterpriseMapContentRectMm(layout);
  const pdfContent = pdfContentRect(layout);
  assert(content.w === pdfContent.w && content.h === pdfContent.h, 'content rect sync');
  assert(content.x === pdfContent.x && content.y === pdfContent.y, 'content origin sync');

  const rcx = (layout.rotatedBbox.minX + layout.rotatedBbox.maxX) / 2;
  const rcy = (layout.rotatedBbox.minY + layout.rotatedBbox.maxY) / 2;
  const [lotCx, lotCy] = projectEnterprisePointToPdf([rcx, rcy], layout);
  assert(
    Math.abs(lotCx - content.cx) < 0.01 && Math.abs(lotCy - content.cy) < 0.01,
    'satelite e lotes compartilham centro',
  );

  const b = layout.geographicBounds!;
  const centerLat = (b.south + b.north) / 2;
  const centerLng = (b.west + b.east) / 2;
  const geoCenter = projectGeographicPointToPdf(
    centerLat,
    centerLng,
    layout,
    MARTINE_PROJECT,
  );
  assert(geoCenter != null, 'projecao geografica');
  assert(pdfProjectGeo(centerLat, centerLng, layout, MARTINE_PROJECT) != null, 'pdf geo export');
  assert(
    Math.abs(geoCenter![0] - content.cx) < 1.5 &&
      Math.abs(geoCenter![1] - content.cy) < 1.5,
    'centro geografico alinha ao centro dos lotes',
  );

  const corner: [number, number] = [
    layout.rotatedBbox.minX,
    layout.rotatedBbox.minY,
  ];
  const latLng = localRotatedToLatLng(
    corner,
    layout.originE,
    layout.originN,
    layout.rotationCenter,
    layout.rotationDeg,
    MARTINE_PROJECT,
  );
  assert(latLng != null, 'local para lat/lng');
  const back = latLngToLocalRotated(
    latLng![0],
    latLng![1],
    layout.originE,
    layout.originN,
    layout.rotationCenter,
    layout.rotationDeg,
    MARTINE_PROJECT,
  );
  assert(back != null, 'lat/lng para local rotacionado');
  assert(
    Math.abs(back![0] - corner[0]) < 0.05 && Math.abs(back![1] - corner[1]) < 0.05,
    'round-trip geografico',
  );
  console.log('OK testSatelliteUsesSameTransformAsLots');
}

function testGeographicBoundsFromRotatedBbox() {
  const layout = buildEnterpriseOverviewLayout({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  const bounds = computeGeographicBoundsFromRotatedBbox(
    layout.originE,
    layout.originN,
    layout.rotatedBbox,
    layout.rotationCenter,
    layout.rotationDeg,
    MARTINE_PROJECT,
  );
  assert(bounds != null, 'bounds rotacionados');
  assert(bounds!.east > bounds!.west && bounds!.north > bounds!.south, 'bounds validos');
  assert(layout.rotationDeg === 90, 'martine usa rotacao 90');
  console.log('OK testGeographicBoundsFromRotatedBbox');
}

async function testEsriSatelliteFetch() {
  assert(isSatelliteBackgroundAvailable(), 'fetch disponivel');
  const result = await fetchSatelliteBackgroundBase64(
    { west: -49.92, south: -6.12, east: -49.88, north: -6.04 },
    640,
    480,
  );
  assert(result.ok, `satellite fetch ${result.error}`);
  assert(result.base64?.startsWith('data:image/png'), 'data url png');
  console.log('OK testEsriSatelliteFetch');
}

async function testSatelliteFailureNoticeInPdf() {
  const payload = buildEnterpriseOverviewPayload({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    company: MARTINE_COMPANY,
    options: {
      ...DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
      showSatelliteBackground: true,
    },
  });
  const doc = await generateEnterpriseOverviewPdf({
    ...payload,
    layout: { ...payload.layout, geographicBounds: null },
    logoBase64: null,
    satelliteBase64: null,
  });
  const text = enterpriseOverviewPdfTextContent(doc);
  assert(
    text.includes('satélite indisponível') ||
      text.includes('satelite indisponivel'),
    'aviso satelite',
  );
  console.log('OK testSatelliteFailureNoticeInPdf');
}

async function testPdfGeneratesForMartine() {
  const payload = buildEnterpriseOverviewPayload({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    company: MARTINE_COMPANY,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
    generatedAt: '15/06/2026',
  });
  const doc = await generateEnterpriseOverviewPdf({
    ...payload,
    logoBase64: null,
  });
  const text = enterpriseOverviewPdfTextContent(doc).toUpperCase();
  assert(text.includes('MAPA GERAL'), 'titulo');
  assert(text.includes('MARTINE'), 'empreendimento');
  assert(text.includes('PREENCHIMENTO 50%') || text.includes('50%'), 'legenda 50%');
  assert(text.includes('ESCALA') || text.includes('50'), 'escala');
  assert(text.includes('N'), 'norte');
  console.log('OK testPdfGeneratesForMartine');
}

async function testWriteValidationPdfs() {
  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });

  const basePayload = buildEnterpriseOverviewPayload({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    company: MARTINE_COMPANY,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
    generatedAt: '15/06/2026',
  });

  const noSatDoc = await generateEnterpriseOverviewPdf({
    ...basePayload,
    options: { ...DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS, showSatelliteBackground: false },
    logoBase64: null,
  });
  const noSatPath = path.join(outDir, 'enterprise-overview-martine-iii-no-satellite.pdf');
  fs.writeFileSync(noSatPath, Buffer.from(noSatDoc.output('arraybuffer')));

  const layout = basePayload.layout;
  const content = computeEnterpriseMapContentRectMm(layout);
  const satResult = await fetchSatelliteBackgroundBase64(
    layout.geographicBounds!,
    Math.round(content.w * (150 / 25.4)),
    Math.round(content.h * (150 / 25.4)),
  );
  const withSatDoc = await generateEnterpriseOverviewPdf({
    ...basePayload,
    options: { ...DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS, showSatelliteBackground: true },
    logoBase64: null,
    satelliteBase64: satResult.ok ? satResult.base64 : null,
  });
  const withSatPath = path.join(outDir, 'enterprise-overview-martine-iii-with-satellite.pdf');
  fs.writeFileSync(withSatPath, Buffer.from(withSatDoc.output('arraybuffer')));

  assert(fs.existsSync(noSatPath), 'pdf sem satelite');
  assert(fs.existsSync(withSatPath), 'pdf com satelite');
  if (!satResult.ok) {
    console.warn('WARN satellite validation fetch failed:', satResult.error);
  } else {
    console.log('satellite validation ok', satResult.base64?.length);
  }
  console.log('OK testWriteValidationPdfs', noSatPath, withSatPath);
}

function testLotLabelsShortNumbers() {
  const fit = fitEnterpriseForPrint({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  const labels = fit.lots.map((l) => l.number);
  assert(labels.includes('01'), labels.join(','));
  console.log('OK testLotLabelsShortNumbers');
}

async function main() {
  testFitEnterpriseIncludesAllLots();
  testAutoRotationVerticalLayout();
  testLegendStatistics();
  testAllLotsFitMapBox();
  testLotLabelsShortNumbers();
  testNoTriangulationInPolygonPath();
  testRingToLineDeltasPerimeterOnly();
  testLotFillOpacityAndStrokeWidth();
  testFillStrokeSeparatePasses();
  testDrawOrderDefinition();
  testGeographicBoundsFromRotatedBbox();
  testSatelliteUsesSameTransformAsLots();
  await testEsriSatelliteFetch();
  await testSatelliteFailureNoticeInPdf();
  await testPdfGeneratesForMartine();
  await testMapLotsDrawnEqualTotal();
  await testLegendAloneDoesNotSatisfyMapFill();
  await testWriteValidationPdfs();
  console.log('mandatory-enterprise-overview-pdf-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

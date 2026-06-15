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
  computeEnterpriseStatistics,
  computeGeographicBounds,
  DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  ENTERPRISE_LOT_FILL_OPACITY,
  ENTERPRISE_LOT_STROKE_WIDTH_MM,
  fitEnterpriseForPrint,
  type EnterpriseBbox,
} from '../lib/enterpriseOverviewLayout';
import {
  blendFillColorForWhiteBackground,
  buildClosedPolygonPath,
  buildEnterpriseOverviewPayload,
  drawLotFillOnly,
  drawLotStrokeOnly,
  ENTERPRISE_MAP_DRAW_ORDER,
  ENTERPRISE_SATELLITE_UNAVAILABLE_MSG,
  enterpriseOverviewPdfTextContent,
  ENTERPRISE_LOT_FILL_OPACITY as PDF_FILL_OPACITY,
  generateEnterpriseOverviewPdf,
  isPerimeterOnlyPolygonPath,
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
  assert(
    ENTERPRISE_LOT_FILL_OPACITY === 0.12 || ENTERPRISE_LOT_FILL_OPACITY === 0.15,
    `opacity ${ENTERPRISE_LOT_FILL_OPACITY}`,
  );
  assert(PDF_FILL_OPACITY === ENTERPRISE_LOT_FILL_OPACITY, 'pdf opacity sync');
  assert(
    ENTERPRISE_LOT_STROKE_WIDTH_MM >= 0.45 && ENTERPRISE_LOT_STROKE_WIDTH_MM <= 0.6,
    `stroke ${ENTERPRISE_LOT_STROKE_WIDTH_MM}`,
  );
  const blended = blendFillColorForWhiteBackground([34, 197, 94]);
  assert(blended[1] > blended[0], 'verde pastel');
  assert(blended.every((c) => c > 200), 'fill claro em fundo branco');
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
  drawLotFillOnly(doc, pts, [34, 197, 94], { onSatellite: false });
  drawLotStrokeOnly(doc, pts);
  const buf = Buffer.from(doc.output('arraybuffer'));
  assert(buf.length > 1000, 'pdf com fill+stroke');
  console.log('OK testFillStrokeSeparatePasses');
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

function testGeographicBoundsForSatellite() {
  const layout = buildEnterpriseOverviewLayout({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  assert(layout.geographicBounds != null, 'bounds');
  const b = layout.geographicBounds!;
  assert(b.east > b.west && b.north > b.south, 'bounds validos');
  console.log('OK testGeographicBoundsForSatellite');
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
  assert(text.includes('TRANSL') || text.includes('LEGENDA'), 'legenda');
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
  const satResult = await fetchSatelliteBackgroundBase64(
    layout.geographicBounds!,
    1200,
    900,
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
  testLotFillOpacityAndStrokeWidth();
  testFillStrokeSeparatePasses();
  testDrawOrderDefinition();
  testGeographicBoundsForSatellite();
  await testEsriSatelliteFetch();
  await testSatelliteFailureNoticeInPdf();
  await testPdfGeneratesForMartine();
  await testWriteValidationPdfs();
  console.log('mandatory-enterprise-overview-pdf-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

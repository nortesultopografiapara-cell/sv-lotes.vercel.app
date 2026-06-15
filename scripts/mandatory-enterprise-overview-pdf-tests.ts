/**
 * Prancha Geral do Empreendimento — testes obrigatórios.
 * npx tsx scripts/mandatory-enterprise-overview-pdf-tests.ts
 */

import {
  allEnterpriseLotsFitLayout,
  buildEnterpriseOverviewLayout,
  calculateBestPrintRotation,
  computeEnterpriseStatistics,
  computeGeographicBounds,
  DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  ENTERPRISE_LOT_FILL_OPACITY,
  fitEnterpriseForPrint,
  type EnterpriseBbox,
} from '../lib/enterpriseOverviewLayout';
import {
  buildClosedPolygonPath,
  buildEnterpriseOverviewPayload,
  enterpriseOverviewPdfTextContent,
  ENTERPRISE_LOT_FILL_OPACITY as PDF_FILL_OPACITY,
  generateEnterpriseOverviewPdf,
  isPerimeterOnlyPolygonPath,
} from '../lib/enterpriseOverviewPdf';
import { isSatelliteBackgroundAvailable } from '../lib/enterpriseOverviewSatellite';
import fs from 'fs';
import path from 'path';

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

/** Loteamento comprido verticalmente — QD 02 + QD 05 (estilo MARTINE III). */
function buildMartineIiiBlocks(): Record<string, unknown>[] {
  const baseE = 500_000;
  const baseN = 7_500_000;
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
  assert(
    stats.projectName.includes('MARTINE III'),
    stats.projectName,
  );
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

async function testPdfGeneratesForMartine() {
  const payload = buildEnterpriseOverviewPayload({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    company: MARTINE_COMPANY,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
    generatedAt: '08/06/2026',
  });
  const doc = await generateEnterpriseOverviewPdf({
    ...payload,
    logoBase64: null,
  });
  const buf = Buffer.from(doc.output('arraybuffer'));
  assert(buf.length > 2000, `pdf pequeno ${buf.length}`);
  const text = enterpriseOverviewPdfTextContent(doc).toUpperCase();
  assert(text.includes('MAPA GERAL'), 'titulo');
  assert(text.includes('MARTINE'), 'empreendimento');
  assert(text.includes('MENESES'), 'empresa');
  assert(text.includes('LEGENDA') || text.includes('DISPON'), 'legenda');
  assert(text.includes('25%') || text.includes('25'), 'legenda transparencia');
  assert(text.includes('ESCALA') || text.includes('50'), 'escala');
  assert(text.includes('N'), 'norte');
  assert(text.includes('TOTAL') || text.includes('LOTES'), 'total lotes');
  console.log('OK testPdfGeneratesForMartine');
}

async function testPdfOpensWithValidHeader() {
  const doc = await generateEnterpriseOverviewPdf(
    buildEnterpriseOverviewPayload({
      blocks: buildMartineIiiBlocks(),
      project: MARTINE_PROJECT,
      company: MARTINE_COMPANY,
      options: {
        ...DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
        showLogo: true,
      },
    }),
  );
  assert(doc.getNumberOfPages() === 1, 'paginas');
  const text = enterpriseOverviewPdfTextContent(doc);
  assert(/MAPA GERAL DO EMPREENDIMENTO/i.test(text), 'cabecalho');
  console.log('OK testPdfOpensWithValidHeader');
}

function testLotLabelsShortNumbers() {
  const fit = fitEnterpriseForPrint({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  const labels = fit.lots.map((l) => l.number);
  assert(labels.includes('01'), labels.join(','));
  assert(!labels.some((l) => l.includes('QD')), 'sem QD no numero');
  console.log('OK testLotLabelsShortNumbers');
}

function testGraphicScaleExists() {
  const layout = buildEnterpriseOverviewLayout({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  assert(layout.graphicScale.barMeters >= 10, 'barra metros');
  assert(layout.graphicScale.barMm > 20, 'barra mm');
  console.log('OK testGraphicScaleExists');
}

function testCompanyBrandingInPayload() {
  const payload = buildEnterpriseOverviewPayload({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    company: MARTINE_COMPANY,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  assert(payload.company.fantasyName === 'MENESES', 'fantasy');
  assert(payload.company.phone.includes('99999'), 'telefone');
  assert(payload.company.email.includes('meneses'), 'email');
  console.log('OK testCompanyBrandingInPayload');
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
  assert(path.filter((c) => c[0] === 'L').length === 3, '3 arestas');
  assert(path[path.length - 1][0] === 'Z', 'fecha poligono');
  console.log('OK testNoTriangulationInPolygonPath');
}

function testLotFillUsesTransparency() {
  assert(ENTERPRISE_LOT_FILL_OPACITY === 0.25, 'layout opacity');
  assert(PDF_FILL_OPACITY === 0.25, 'pdf opacity');
  console.log('OK testLotFillUsesTransparency');
}

function testGeographicBoundsForSatellite() {
  const layout = buildEnterpriseOverviewLayout({
    blocks: buildMartineIiiBlocks(),
    project: MARTINE_PROJECT,
    options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  });
  assert(layout.geographicBounds != null, 'bounds');
  const b = layout.geographicBounds!;
  assert(b.east > b.west, 'lng');
  assert(b.north > b.south, 'lat');
  const recomputed = computeGeographicBounds(
    layout.originE,
    layout.originN,
    layout.rotatedBbox,
    MARTINE_PROJECT,
  );
  assert(recomputed != null, 'recompute');
  console.log('OK testGeographicBoundsForSatellite');
}

function testSatelliteAvailabilityInNode() {
  assert(!isSatelliteBackgroundAvailable(), 'node sem browser');
  console.log('OK testSatelliteAvailabilityInNode');
}

async function testWriteValidationPdf() {
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
    satelliteBase64: null,
  });
  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'enterprise-overview-martine-iii-clean.pdf');
  fs.writeFileSync(outPath, Buffer.from(doc.output('arraybuffer')));
  assert(fs.existsSync(outPath), 'pdf validacao');
  console.log('OK testWriteValidationPdf', outPath);
}

async function main() {
  testFitEnterpriseIncludesAllLots();
  testAutoRotationVerticalLayout();
  testLegendStatistics();
  testAllLotsFitMapBox();
  testLotLabelsShortNumbers();
  testGraphicScaleExists();
  testCompanyBrandingInPayload();
  testNoTriangulationInPolygonPath();
  testLotFillUsesTransparency();
  testGeographicBoundsForSatellite();
  testSatelliteAvailabilityInNode();
  await testPdfGeneratesForMartine();
  await testPdfOpensWithValidHeader();
  await testWriteValidationPdf();
  console.log('mandatory-enterprise-overview-pdf-tests: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

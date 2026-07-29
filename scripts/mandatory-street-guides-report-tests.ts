/**
 * Relatório de Vias + refinamentos de ângulo/estilo na Prancha Geral.
 * npx tsx scripts/mandatory-street-guides-report-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildStreetGuidesReportData,
  formatLengthKmPtBr,
  generateStreetGuidesReportExcelBuffer,
  generateStreetGuidesReportPdf,
} from '../lib/streetGuidesReport';
import {
  sheetAngleFromPdfDelta,
  streetLabelAngleOnSheet,
  STREET_LABEL_FONT_MAX,
  STREET_LABEL_FONT_MIN,
  STREET_LABEL_RGB,
  STREET_TYPE_SORT_ORDER,
  sortStreetsForTable,
  type EnterpriseStreetGrouped,
} from '../lib/enterpriseOverviewStreets';

const ROOT = path.resolve(__dirname, '..');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function sampleGuides(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const lng0 = -48.5 - i * 0.00008;
    return {
      id: `g-${i + 1}`,
      type: i === 0 ? 'Rodovia' : i === 1 ? 'Avenida' : i === 2 ? 'Alameda' : 'Rua',
      name: String(i + 1).padStart(2, '0'),
      displayName:
        i === 0
          ? 'Rodovia PA-160'
          : i === 1
            ? 'Avenida 01'
            : i === 2
              ? 'Alameda 01'
              : `Rua ${String(i - 2).padStart(2, '0')}`,
      geometry_geojson: {
        type: 'LineString',
        coordinates: [
          [lng0, -1.4],
          [lng0 + 0.0012, -1.4 + (i % 3 === 0 ? 0 : i % 3 === 1 ? 0.0008 : -0.0005)],
        ],
      },
    };
  });
}

function testSheetAngleMatchesAxis() {
  // Horizontal na folha
  assert(Math.abs(sheetAngleFromPdfDelta(10, 0) - 0) < 1e-6, 'horizontal 0°');
  // Vertical “para cima” no PDF (Y diminui)
  const up = sheetAngleFromPdfDelta(0, -10);
  assert(Math.abs(up - 90) < 1e-6, `vertical up → 90, got ${up}`);
  // Diagonal
  const diag = sheetAngleFromPdfDelta(10, -10);
  assert(diag > 40 && diag < 50, `diag ~45, got ${diag}`);
  // Invertido → normaliza ±90
  const flipped = sheetAngleFromPdfDelta(-10, 0);
  assert(Math.abs(flipped) < 1e-6 || Math.abs(Math.abs(flipped) - 0) < 1e-6, 'flipped readable');
  assert(flipped > -90 && flipped <= 90, 'within ±90');
  console.log('OK testSheetAngleMatchesAxis', { up, diag, flipped });
}

function testAngleUsesProjectedSheetCoords() {
  // Simula Y invertido da prancha: local (dx,dy) → pdf (dx, -dy)
  const projectPoint = (p: [number, number]): [number, number] => [p[0], -p[1]];
  // Rua inclinada local: dx=1, dy=1 (NE)
  const angle = streetLabelAngleOnSheet([0, 0], 1, 1, projectPoint);
  // Em PDF: delta (1, -1) → atan2(1,1)=45°
  assert(Math.abs(angle - 45) < 1e-6, `sheet NE → 45°, got ${angle}`);

  // Rua vertical local N: dx=0, dy=1 → pdf (0,-1) → 90°
  const vert = streetLabelAngleOnSheet([0, 0], 0, 1, projectPoint);
  assert(Math.abs(vert - 90) < 1e-6, `sheet N → 90°, got ${vert}`);
  console.log('OK testAngleUsesProjectedSheetCoords', { angle, vert });
}

function testSortOrderAlamedaBeforeRua() {
  assert(STREET_TYPE_SORT_ORDER.Alameda < STREET_TYPE_SORT_ORDER.Rua, 'Alameda < Rua');
  const streets: EnterpriseStreetGrouped[] = [
    {
      id: '1',
      type: 'Rua',
      name: '01',
      displayName: 'Rua 01',
      unnamed: false,
      segments: [],
      lengthM: 10,
      lengthAvailable: true,
      issues: [],
    },
    {
      id: '2',
      type: 'Alameda',
      name: '01',
      displayName: 'Alameda 01',
      unnamed: false,
      segments: [],
      lengthM: 10,
      lengthAvailable: true,
      issues: [],
    },
    {
      id: '3',
      type: 'Avenida',
      name: '01',
      displayName: 'Avenida 01',
      unnamed: false,
      segments: [],
      lengthM: 10,
      lengthAvailable: true,
      issues: [],
    },
  ];
  const sorted = sortStreetsForTable(streets);
  assert(sorted[0].type === 'Avenida', 'avenida first');
  assert(sorted[1].type === 'Alameda', 'alameda second');
  assert(sorted[2].type === 'Rua', 'rua third');
  console.log('OK testSortOrderAlamedaBeforeRua');
}

function testReportReusesQuadroPipeline() {
  const project = { name: 'CHACARAS CORREDOR INDUSTRIAL', utm_zone: '22S' };
  const small = buildStreetGuidesReportData({
    guides: sampleGuides(3),
    project,
  });
  assert(small.streetCount === 3, 'small 3');
  assert(small.totalLengthM > 0, 'small length');
  assert(small.rows[0].type, 'row has type');

  const large = buildStreetGuidesReportData({
    guides: sampleGuides(18),
    project,
  });
  assert(large.streetCount === 18, 'large 18');
  assert(large.totalLengthM > small.totalLengthM, 'large > small');
  assert(large.totalLengthLabel.includes('m'), 'label m');
  assert(formatLengthKmPtBr(1000) === '1,000', '1 km');
  console.log('OK testReportReusesQuadroPipeline', {
    small: small.totalLengthM,
    large: Math.round(large.totalLengthM),
  });
}

async function testPdfAndExcelGeneration() {
  const project = { name: 'Teste Vias', utm_zone: '22S' };
  const data = buildStreetGuidesReportData({
    guides: sampleGuides(5),
    project,
  });
  const meta = {
    projectName: 'Teste Vias',
    companyName: 'Empresa Teste',
    userName: 'Operador',
    emittedAt: '29/07/2026',
  };
  const doc = await generateStreetGuidesReportPdf({ data, meta });
  assert(doc.getNumberOfPages() >= 1, 'pdf pages');
  const excel = await generateStreetGuidesReportExcelBuffer({ data, meta });
  assert(excel.byteLength > 500, 'xlsx size');
  // ZIP signature PK
  const u8 = new Uint8Array(excel);
  assert(u8[0] === 0x50 && u8[1] === 0x4b, 'xlsx zip');
  console.log('OK testPdfAndExcelGeneration', {
    pdfPages: doc.getNumberOfPages(),
    xlsxBytes: excel.byteLength,
  });
}

function testSourceWiring() {
  const page = read('app/map/page.tsx');
  assert(page.includes('Relatório de Vias'), 'toolbar label');
  assert(page.includes('StreetGuidesReportModal'), 'modal wired');
  assert(page.includes('downloadStreetGuidesReportPdf'), 'pdf export');
  assert(page.includes('downloadStreetGuidesReportExcel'), 'excel export');

  const pdf = read('lib/enterpriseOverviewPdf.ts');
  assert(pdf.includes('STREET_LABEL_RGB'), 'label color');
  const streets = read('lib/enterpriseOverviewStreets.ts');
  assert(streets.includes('streetLabelAngleOnSheet'), 'sheet angle');
  assert(streets.includes('sheetAngleFromPdfDelta'), 'pdf delta angle');
  assert(STREET_LABEL_FONT_MAX >= 7.5, 'font larger');
  assert(STREET_LABEL_FONT_MIN >= 4, 'font min larger');
  assert(
    STREET_LABEL_RGB[0] === 11 &&
      STREET_LABEL_RGB[1] === 58 &&
      STREET_LABEL_RGB[2] === 102,
    '#0B3A66',
  );
  assert(
    !fs.existsSync(path.join(ROOT, 'supabase/migrations/zzzz_street_report.sql')),
    'sem migration',
  );
  console.log('OK testSourceWiring');
}

async function main() {
  testSheetAngleMatchesAxis();
  testAngleUsesProjectedSheetCoords();
  testSortOrderAlamedaBeforeRua();
  testReportReusesQuadroPipeline();
  await testPdfAndExcelGeneration();
  testSourceWiring();
  console.log('\nALL mandatory-street-guides-report-tests PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

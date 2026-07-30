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
  streetGuidesReportFileSlug,
} from '../lib/streetGuidesReport';
import {
  buildLocalStreetLinesFromGuides,
  buildStreetTableRows,
  groupEnterpriseStreets,
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
          [
            lng0 + 0.0012,
            -1.4 + (i % 3 === 0 ? 0 : i % 3 === 1 ? 0.0008 : -0.0005),
          ],
        ],
      },
    };
  });
}

function testSheetAngleMatchesAxis() {
  assert(Math.abs(sheetAngleFromPdfDelta(10, 0) - 0) < 1e-6, 'horizontal 0°');
  const up = sheetAngleFromPdfDelta(0, -10);
  assert(Math.abs(up - 90) < 1e-6, `vertical up → 90, got ${up}`);
  const diag = sheetAngleFromPdfDelta(10, -10);
  assert(diag > 40 && diag < 50, `diag ~45, got ${diag}`);
  const flipped = sheetAngleFromPdfDelta(-10, 0);
  assert(flipped > -90 && flipped <= 90, 'within ±90');
  console.log('OK testSheetAngleMatchesAxis', { up, diag, flipped });
}

function testAngleUsesProjectedSheetCoords() {
  const projectPoint = (p: [number, number]): [number, number] => [p[0], -p[1]];
  const angle = streetLabelAngleOnSheet([0, 0], 1, 1, projectPoint);
  assert(Math.abs(angle - 45) < 1e-6, `sheet NE → 45°, got ${angle}`);
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
  const guides = sampleGuides(3);
  const report = buildStreetGuidesReportData({ guides, project });
  const built = buildLocalStreetLinesFromGuides({
    guides,
    project,
    originE: 0,
    originN: 0,
    logInvalid: false,
  });
  const grouped = groupEnterpriseStreets({
    guides,
    localLinesByGuideId: built.localLinesByGuideId,
    haversineLengthByGuideId: built.haversineLengthByGuideId,
  });
  const quadro = buildStreetTableRows(grouped.streets);
  assert(report.streetCount === quadro.rows.length, 'count ≡ quadro');
  assert(
    Math.abs(report.totalLengthM - quadro.totalLengthM) < 1e-9,
    'total ≡ quadro',
  );
  assert(
    report.rows.every(
      (r, i) =>
        r.name === quadro.rows[i].name &&
        r.number === quadro.rows[i].number &&
        r.lengthLabel === quadro.rows[i].lengthLabel,
    ),
    'rows ≡ quadro',
  );
  assert(formatLengthKmPtBr(1000) === '1,000', '1 km');
  console.log('OK testReportReusesQuadroPipeline', {
    count: report.streetCount,
    total: report.totalLengthM,
  });
}

function testReportZeroVias() {
  const data = buildStreetGuidesReportData({
    guides: [],
    project: { name: 'Vazio', utm_zone: '22S' },
  });
  assert(data.streetCount === 0, 'zero vias');
  assert(data.totalLengthM === 0, 'zero length');
  console.log('OK testReportZeroVias');
}

function testCorredorIndustrialScenario() {
  const names: Array<{ type: string; name: string; lengthM: number }> = [
    { type: 'Rodovia', name: 'Rodovia PA-160', lengthM: 1700 },
    { type: 'Avenida', name: '01', lengthM: 900 },
    { type: 'Avenida', name: '02', lengthM: 900 },
    { type: 'Avenida', name: '03', lengthM: 900 },
    { type: 'Avenida', name: '04', lengthM: 900 },
    { type: 'Avenida', name: '05', lengthM: 900 },
    { type: 'Avenida', name: '06', lengthM: 900 },
    { type: 'Avenida', name: '07', lengthM: 866.26 },
    { type: 'Rua', name: '01', lengthM: 800 },
    { type: 'Rua', name: '02', lengthM: 800 },
    { type: 'Rua', name: '03', lengthM: 800 },
    { type: 'Rua', name: '04', lengthM: 800 },
    { type: 'Rua', name: '05', lengthM: 800 },
    { type: 'Rua', name: '06', lengthM: 800 },
    { type: 'Rua', name: '07', lengthM: 800 },
    { type: 'Rua', name: '08', lengthM: 800 },
    { type: 'Rua', name: '09', lengthM: 800 },
  ];
  assert(names.length === 17, '17 vias');
  const total = names.reduce((s, n) => s + n.lengthM, 0);
  assert(Math.abs(total - 15166.26) < 0.001, `total ${total}`);

  const streets: EnterpriseStreetGrouped[] = names.map((n, i) => ({
    id: `c${i}`,
    type: n.type,
    name: n.name,
    displayName:
      n.name.startsWith(n.type) || n.type === 'Rodovia'
        ? n.name
        : `${n.type} ${n.name}`,
    unnamed: false,
    segments: [
      {
        lineIndex: 0,
        line: [
          [0, i * 10],
          [n.lengthM, i * 10],
        ],
        lengthM: n.lengthM,
      },
    ],
    lengthM: n.lengthM,
    lengthAvailable: true,
    issues: [],
  }));
  const quadro = buildStreetTableRows(streets);
  assert(quadro.rows.length === 17, 'quadro 17');
  assert(Math.abs(quadro.totalLengthM - 15166.26) < 0.01, 'quadro total');
  assert(
    quadro.rows.some((r) => r.name === 'Avenida 05'),
    'Avenida 05 na tabela',
  );
  assert(
    quadro.rows.every((r) => /^\d{2}$/.test(r.number)),
    'numeração 2 dígitos',
  );
  console.log('OK testCorredorIndustrialScenario', {
    count: quadro.rows.length,
    total: quadro.totalLengthM,
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
    emittedAt: '30/07/2026',
    emittedAtIso: '2026-07-30T12:00:00.000Z',
  };
  const doc = await generateStreetGuidesReportPdf({ data, meta });
  assert(doc.getNumberOfPages() >= 1, 'pdf pages');

  const emptyDoc = await generateStreetGuidesReportPdf({
    data: buildStreetGuidesReportData({ guides: [], project }),
    meta,
  });
  assert(emptyDoc.getNumberOfPages() >= 1, 'pdf zero vias');

  const multi = await generateStreetGuidesReportPdf({
    data: buildStreetGuidesReportData({
      guides: sampleGuides(60),
      project,
    }),
    meta,
  });
  assert(multi.getNumberOfPages() >= 2, 'pdf multipage');

  const slug = streetGuidesReportFileSlug(meta.projectName, meta.emittedAtIso);
  assert(slug.project.includes('Teste'), 'slug project');
  assert(slug.date === '2026-07-30', 'slug date');

  const excel = await generateStreetGuidesReportExcelBuffer({ data, meta });
  assert(excel.byteLength > 500, 'xlsx size');
  const u8 = new Uint8Array(excel);
  assert(u8[0] === 0x50 && u8[1] === 0x4b, 'xlsx zip');
  console.log('OK testPdfAndExcelGeneration', {
    pdfPages: doc.getNumberOfPages(),
    multiPages: multi.getNumberOfPages(),
    xlsxBytes: excel.byteLength,
  });
}

function testSourceWiring() {
  const page = read('app/map/page.tsx');
  assert(page.includes('Relatório de Vias'), 'toolbar label');
  assert(page.includes('gis-street-guides-report-btn'), 'testid botão');
  assert(page.includes('aria-label="Relatório de Vias"'), 'a11y');
  assert(page.includes('title="Relatório de Vias"'), 'title');
  assert(page.includes('ClipboardList'), 'ícone relatório');
  assert(page.includes('StreetGuidesReportModal'), 'modal wired');
  assert(page.includes('downloadStreetGuidesReportPdf'), 'pdf export');
  assert(page.includes('flex-row flex-wrap'), 'toolbar horizontal');
  assert(!page.includes('GIS TOOLS VERTICAL BAR'), 'sem barra vertical');
  assert(page.includes('GIS TOOLS HORIZONTAL BAR'), 'barra horizontal');

  const report = read('lib/streetGuidesReport.ts');
  assert(report.includes("head: [['Nº', 'Via', 'Comprimento']]"), 'cols quadro');
  assert(report.includes('RELATÓRIO DE VIAS'), 'título');
  assert(report.includes('groupEnterpriseStreets'), 'pipeline group');
  assert(report.includes('buildStreetTableRows'), 'pipeline rows');
  assert(report.includes('relatorio_de_vias_'), 'nome arquivo');
  assert(
    report.includes("showHead: 'everyPage'") ||
      report.includes('showHead: "everyPage"'),
    'head repeat',
  );
  assert(
    report.includes("rowPageBreak: 'avoid'") ||
      report.includes('rowPageBreak: "avoid"'),
    'row keep',
  );

  const css = read('app/map/gis-map-mobile.css');
  assert(css.includes('flex-direction: row'), 'css horizontal');

  assert(
    !fs.existsSync(path.join(ROOT, 'supabase/migrations/zzzz_street_report.sql')),
    'sem migration',
  );
  assert(STREET_LABEL_FONT_MAX >= 7.5, 'font larger');
  assert(STREET_LABEL_FONT_MIN >= 4, 'font min larger');
  assert(
    STREET_LABEL_RGB[0] === 11 &&
      STREET_LABEL_RGB[1] === 58 &&
      STREET_LABEL_RGB[2] === 102,
    '#0B3A66',
  );
  console.log('OK testSourceWiring');
}

function testToolbarKeepsTools() {
  const page = read('app/map/page.tsx');
  const quadras = read('components/map/ProjectQuadrasPanel.tsx');
  const tools = [
    'Prancha Geral',
    'Relatório de Vias',
    'Gerar Prancha do Lote',
    'Medir Distância',
    'Medir Área',
    'Centralizar GPS',
    'Camadas do Mapa',
    'Memorial Descritivo',
    'Linha de Rua',
    'Identificar Frentes',
    'Importar TXT',
    'Confrontação Automática',
    'Revisar Confrontações',
    'Editar Confrontação',
    'Definir Medida Oficial',
  ];
  for (const t of tools) {
    assert(page.includes(t), `tool kept: ${t}`);
  }
  assert(quadras.includes('Quadras do Projeto'), 'tool kept: Quadras do Projeto');
  assert(page.includes('ProjectQuadrasPanel'), 'quadras panel wired');
  assert(page.includes('flex-row'), 'orientação horizontal');
  assert(!page.includes('flex-col gap-1.5 w-10'), 'não vertical estreita');
  console.log('OK testToolbarKeepsTools', { count: tools.length + 1 });
}

async function main() {
  testSheetAngleMatchesAxis();
  testAngleUsesProjectedSheetCoords();
  testSortOrderAlamedaBeforeRua();
  testReportReusesQuadroPipeline();
  testReportZeroVias();
  testCorredorIndustrialScenario();
  await testPdfAndExcelGeneration();
  testSourceWiring();
  testToolbarKeepsTools();
  console.log('\nALL mandatory-street-guides-report-tests PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Prancha Geral — nomes / comprimentos / quadro de vias.
 * npx tsx scripts/mandatory-enterprise-overview-streets-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildEnterpriseOverviewLayout,
  DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
  fitEnterpriseForPrint,
} from '../lib/enterpriseOverviewLayout';
import {
  boxesOverlap,
  buildStreetTableRows,
  computePolylineLengthM,
  extractAllPolylineParts,
  formatLengthMetersPtBr,
  groupEnterpriseStreets,
  isUnnamedStreetName,
  maxStreetLabelCountForLength,
  pickStreetLabelPlacements,
  planStreetTableLayout,
  readableStreetLabelAngleDeg,
  resolveStreetLabelCollisions,
  rotatedTextOccupiedBox,
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

function testPolylineLength() {
  const line: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 50],
  ];
  assert(Math.abs(computePolylineLengthM(line) - 150) < 1e-9, 'LineString 150m');
  console.log('OK testPolylineLength');
}

function testMultiLineStringParts() {
  const multi = [
    [
      [0, 0],
      [10, 0],
    ],
    [
      [10, 0],
      [10, 20],
    ],
  ];
  const parts = extractAllPolylineParts(multi);
  assert(parts.length === 2, '2 partes MultiLineString');
  const localParts = parts.map(
    (p) => p.map((c) => [c[0], c[1]] as [number, number]),
  );
  const sum =
    computePolylineLengthM(localParts[0]) + computePolylineLengthM(localParts[1]);
  assert(Math.abs(sum - 30) < 1e-9, 'soma MultiLineString 30m');
  console.log('OK testMultiLineStringParts');
}

function testFormatLength() {
  assert(formatLengthMetersPtBr(412.384) === '412,38 m', '412,38 m');
  assert(formatLengthMetersPtBr(1245.67) === '1.245,67 m', '1.245,67 m');
  console.log('OK testFormatLength');
}

function testGroupById() {
  const guides = [
    {
      id: 'a',
      type: 'Rua',
      name: '01',
      displayName: 'Rua 01',
    },
    {
      id: 'b',
      type: 'Rua',
      name: '01',
      displayName: 'Rua 01',
    },
  ];
  const local = new Map<string, [number, number][][]>();
  local.set('a', [
    [
      [0, 0],
      [100, 0],
    ],
  ]);
  local.set('b', [
    [
      [0, 0],
      [50, 0],
    ],
  ]);
  const { streets } = groupEnterpriseStreets({
    guides,
    localLinesByGuideId: local,
  });
  assert(streets.length === 2, 'IDs distintos não fundem');
  assert(
    Math.abs(streets.find((s) => s.id === 'a')!.lengthM - 100) < 1e-9,
    'id a = 100',
  );
  console.log('OK testGroupById');
}

function testMultiSegmentSameId() {
  const guides = [{ id: 'r1', type: 'Avenida', name: '01', displayName: 'Avenida 01' }];
  const local = new Map<string, [number, number][][]>();
  local.set('r1', [
    [
      [0, 0],
      [200, 0],
    ],
    [
      [200, 0],
      [200, 100],
    ],
  ]);
  const { streets } = groupEnterpriseStreets({
    guides,
    localLinesByGuideId: local,
  });
  assert(streets.length === 1, '1 via');
  assert(streets[0].segments.length === 2, '2 trechos');
  assert(Math.abs(streets[0].lengthM - 300) < 1e-9, 'soma 300');
  console.log('OK testMultiSegmentSameId');
}

function testUnnamedAndNoGeometry() {
  assert(isUnnamedStreetName('Rua/Eixo sem nome'), 'unnamed');
  assert(isUnnamedStreetName(''), 'empty');
  assert(!isUnnamedStreetName('PA-160'), 'named');
  const guides = [
    { id: 'u1', type: 'Rua', name: 'Rua/Eixo sem nome', displayName: 'Rua/Eixo sem nome' },
    { id: 'g1', type: 'Rua', name: '02', displayName: 'Rua 02' },
  ];
  const local = new Map<string, [number, number][][]>();
  // g1 sem geometria
  const { streets, unnamedCount, noGeometryCount } = groupEnterpriseStreets({
    guides,
    localLinesByGuideId: local,
  });
  assert(unnamedCount === 1, 'unnamed count');
  assert(noGeometryCount >= 1, 'no geometry');
  assert(streets.every((s) => !s.lengthAvailable || s.unnamed), 'sem length ou unnamed');
  console.log('OK testUnnamedAndNoGeometry');
}

function testReadableAngle() {
  const a = readableStreetLabelAngleDeg(10, 0);
  assert(Math.abs(a) < 1, 'horizontal ~0');
  const b = readableStreetLabelAngleDeg(-10, 0);
  assert(Math.abs(Math.abs(b) - 0) < 1 || Math.abs(Math.abs(b) - 180) > 90, 'não invertido ilegal');
  // vetor para a esquerda deve normalizar para legível (±90)
  assert(Math.abs(b) <= 90, 'ângulo legível |b|<=90');
  const down = readableStreetLabelAngleDeg(0, -10);
  assert(Math.abs(down) <= 90, 'vertical legível');
  console.log('OK testReadableAngle');
}

function testLabelRepetition() {
  assert(maxStreetLabelCountForLength(100) === 1, '<=300 → 1');
  assert(maxStreetLabelCountForLength(500) === 2, '300-700 → 2');
  assert(maxStreetLabelCountForLength(900) === 3, '>700 → 3');
  const street: EnterpriseStreetGrouped = {
    id: 'long',
    type: 'Rodovia',
    name: 'PA-160',
    displayName: 'Rodovia PA-160',
    unnamed: false,
    segments: [
      {
        lineIndex: 0,
        line: [
          [0, 0],
          [800, 0],
        ],
        lengthM: 800,
      },
    ],
    lengthM: 800,
    lengthAvailable: true,
    issues: [],
  };
  const places = pickStreetLabelPlacements(street, { mapScaleMmPerM: 0.08 });
  assert(places.length >= 1 && places.length <= 3, `repetição ${places.length}`);
  for (const p of places) {
    assert(Math.abs(p.angleDeg) <= 90, 'ângulo legível');
  }
  console.log('OK testLabelRepetition');
}

function testCollision() {
  const a = { x: 0, y: 0, w: 10, h: 5 };
  const b = { x: 8, y: 0, w: 10, h: 5 };
  assert(boxesOverlap(a, b), 'overlap');
  assert(!boxesOverlap(a, { x: 20, y: 0, w: 5, h: 5 }), 'no overlap');
  const box = rotatedTextOccupiedBox(50, 50, 'Rua 01', 5, 0);
  assert(box.w > 0 && box.h > 0, 'bbox');
  console.log('OK testCollision');
}

function testTableSortAndPlan() {
  const streets: EnterpriseStreetGrouped[] = [
    {
      id: '1',
      type: 'Rua',
      name: '02',
      displayName: 'Rua 02',
      unnamed: false,
      segments: [{ lineIndex: 0, line: [[0, 0], [40, 0]], lengthM: 40 }],
      lengthM: 40,
      lengthAvailable: true,
      issues: [],
    },
    {
      id: '2',
      type: 'Rodovia',
      name: 'PA-160',
      displayName: 'Rodovia PA-160',
      unnamed: false,
      segments: [{ lineIndex: 0, line: [[0, 0], [800, 0]], lengthM: 800 }],
      lengthM: 800,
      lengthAvailable: true,
      issues: [],
    },
    {
      id: '3',
      type: 'Avenida',
      name: '01',
      displayName: 'Avenida 01',
      unnamed: false,
      segments: [{ lineIndex: 0, line: [[0, 0], [100, 0]], lengthM: 100 }],
      lengthM: 100,
      lengthAvailable: true,
      issues: [],
    },
  ];
  const sorted = sortStreetsForTable(streets);
  assert(sorted[0].type === 'Rodovia', 'rodovia primeiro');
  assert(sorted[1].type === 'Avenida', 'avenida segundo');
  const { rows, totalLengthM } = buildStreetTableRows(streets);
  assert(rows.length === 3, '3 linhas');
  assert(Math.abs(totalLengthM - 940) < 1e-6, 'total 940');
  const many = Array.from({ length: 80 }, (_, i) => ({
    ...streets[0],
    id: `x${i}`,
    displayName: `Rua ${i}`,
    name: String(i),
  }));
  const plan = planStreetTableLayout(many, { w: 58, h: 180 }, 72);
  assert(
    plan.mode === 'two_columns' || plan.mode === 'extra_page',
    `muitas vias → ${plan.mode}`,
  );
  console.log('OK testTableSortAndPlan');
}

function testFitIntegration() {
  const project = { name: 'Teste', utm_zone: '22S' };
  const blocks = [
    {
      id: 'b1',
      number: '1',
      block_name: 'A',
      status: 'Disponível',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-48.5, -1.4],
            [-48.499, -1.4],
            [-48.499, -1.399],
            [-48.5, -1.399],
            [-48.5, -1.4],
          ],
        ],
      },
    },
  ];
  const streetGuides = [
    {
      id: 's1',
      type: 'Rua',
      name: '01',
      displayName: 'Rua 01',
      geometry_geojson: {
        type: 'LineString',
        coordinates: [
          [-48.5, -1.4],
          [-48.4995, -1.4],
        ],
      },
    },
  ];
  const options = {
    ...DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
    showStreetNamesAndTable: true,
  };
  const fit = fitEnterpriseForPrint({
    blocks,
    streetGuides,
    project,
    options,
  });
  assert(fit.streets.length === 1, '1 street no fit');
  assert(fit.streets[0].lengthAvailable, 'length available');
  assert(fit.streets[0].lengthM > 0, 'length > 0');
  const layout = buildEnterpriseOverviewLayout(
    { blocks, streetGuides, project, options },
    '29/07/2026',
  );
  assert(layout.streetTable.rows.length === 1, '1 row tabela');
  assert(layout.streetTable.totalLengthLabel.includes('m'), 'label m');
  assert(
    layout.streets[0].labelPlacements.length >= 0,
    'placements array',
  );

  const legacy = buildEnterpriseOverviewLayout(
    {
      blocks,
      streetGuides,
      project,
      options: { ...options, showStreetNamesAndTable: false },
    },
    '29/07/2026',
  );
  assert(
    legacy.streets[0].labelPlacements.length === 0,
    'sem placements no modo legado',
  );
  console.log('OK testFitIntegration');
}

function testEmptyStreetsStillWorks() {
  const project = { name: 'Sem vias', utm_zone: '22S' };
  const blocks = [
    {
      id: 'b1',
      number: '1',
      block_name: 'A',
      status: 'Disponível',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-48.5, -1.4],
            [-48.499, -1.4],
            [-48.499, -1.399],
            [-48.5, -1.399],
            [-48.5, -1.4],
          ],
        ],
      },
    },
  ];
  const layout = buildEnterpriseOverviewLayout(
    {
      blocks,
      streetGuides: [],
      project,
      options: DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
    },
    '29/07/2026',
  );
  assert(layout.streets.length === 0, 'sem vias');
  assert(layout.streetTable.streetCount === 0, 'tabela vazia');
  assert(layout.lots.length >= 1, 'lotes ok');
  console.log('OK testEmptyStreetsStillWorks');
}

function testCollisionResolveOmits() {
  const street: EnterpriseStreetGrouped = {
    id: 'c1',
    type: 'Rua',
    name: '01',
    displayName: 'Rua 01',
    unnamed: false,
    segments: [
      {
        lineIndex: 0,
        line: [
          [0, 0],
          [100, 0],
        ],
        lengthM: 100,
      },
    ],
    lengthM: 100,
    lengthAvailable: true,
    issues: [],
  };
  const places = pickStreetLabelPlacements(street, { mapScaleMmPerM: 0.2 });
  const occupied = [{ x: -1000, y: -1000, w: 2000, h: 2000 }];
  const resolved = resolveStreetLabelCollisions(
    places,
    (p) => [p[0], p[1]],
    occupied,
    street,
    0.2,
  );
  assert(resolved.length === 0, 'omite quando tudo colide');
  console.log('OK testCollisionResolveOmits');
}

function testSourceWiring() {
  const modal = read('components/map/EnterpriseOverviewModal.tsx');
  assert(modal.includes('Incluir nomes e quadro de vias'), 'checkbox modal');
  assert(modal.includes('showStreetNamesAndTable'), 'option key');
  const layout = read('lib/enterpriseOverviewLayout.ts');
  assert(layout.includes('showStreetNamesAndTable: true'), 'default on');
  const pdf = read('lib/enterpriseOverviewPdf.ts');
  assert(pdf.includes('QUADRO DE VIAS'), 'tabela no PDF');
  assert(pdf.includes('drawStreetTableExtraPage'), 'página extra');
  assert(pdf.includes('resolveStreetLabelCollisions'), 'colisão');
  assert(!fs.existsSync(path.join(ROOT, 'supabase/migrations/zzzz_enterprise_streets.sql')), 'sem migration nova');
  console.log('OK testSourceWiring');
}

function main() {
  testPolylineLength();
  testMultiLineStringParts();
  testFormatLength();
  testGroupById();
  testMultiSegmentSameId();
  testUnnamedAndNoGeometry();
  testReadableAngle();
  testLabelRepetition();
  testCollision();
  testTableSortAndPlan();
  testFitIntegration();
  testEmptyStreetsStillWorks();
  testCollisionResolveOmits();
  testSourceWiring();
  console.log('\nALL mandatory-enterprise-overview-streets-tests PASSED');
}

main();

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
  buildLocalStreetLinesFromGuides,
  buildStreetTableRows,
  computePolylineLengthM,
  extractAllPolylineParts,
  formatLengthMetersPtBr,
  groupEnterpriseStreets,
  isUnnamedStreetName,
  maxStreetLabelCountForLength,
  normalizeStreetGeometry,
  pickStreetLabelPlacements,
  planStreetTableLayout,
  readableStreetLabelAngleDeg,
  resolveStreetLabelCollisions,
  rotatedTextOccupiedBox,
  sortStreetsForTable,
  streetCoordsToLocalMeters,
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

function testNormalizeStreetGeometryFormats() {
  const lineObj = {
    type: 'LineString',
    coordinates: [
      [-48.5, -1.4],
      [-48.499, -1.4],
    ],
  };
  const asObj = normalizeStreetGeometry(lineObj);
  assert(!!asObj && asObj.lines.length === 1, 'objeto LineString');
  assert(!asObj!.alreadyMetric, 'geo é lng/lat');

  const asString = normalizeStreetGeometry(JSON.stringify(lineObj));
  assert(!!asString && asString.lines[0].length === 2, 'string JSON');

  const asFeature = normalizeStreetGeometry({
    type: 'Feature',
    properties: { name: 'Rua 01' },
    geometry: lineObj,
  });
  assert(!!asFeature && asFeature.sourceFormat.startsWith('Feature'), 'Feature');

  const asMulti = normalizeStreetGeometry({
    type: 'MultiLineString',
    coordinates: [
      [
        [-48.5, -1.4],
        [-48.499, -1.4],
      ],
      [
        [-48.499, -1.4],
        [-48.499, -1.399],
      ],
    ],
  });
  assert(!!asMulti && asMulti.lines.length === 2, 'MultiLineString');

  const asArray = normalizeStreetGeometry([
    [-48.5, -1.4],
    [-48.499, -1.4],
  ]);
  assert(!!asArray && asArray.sourceFormat === 'coordinate_array', 'array direto');

  const invalid = normalizeStreetGeometry({ type: 'Point', coordinates: [1, 2] });
  assert(invalid == null, 'Point inválido');

  const envelope = normalizeStreetGeometry({
    geometry: lineObj,
  });
  assert(!!envelope && envelope.lines.length === 1, 'envelope.geometry');

  console.log('OK testNormalizeStreetGeometryFormats');
}

function testLngLatToUtmLength() {
  const project = { utm_zone: '22S' };
  const line: [number, number][] = [
    [-48.5, -1.4],
    [-48.499, -1.4],
  ];
  const originE = 500000;
  const originN = 9800000;
  const local = streetCoordsToLocalMeters(line, project, originE, originN, false);
  assert(!!local && local.length === 2, 'converte lng/lat');
  const len = computePolylineLengthM(local!);
  assert(len > 50 && len < 200, `comprimento ~111m, got ${len}`);

  const localInferred = streetCoordsToLocalMeters(
    line,
    { name: 'sem zona' },
    originE,
    originN,
    false,
  );
  assert(!!localInferred && localInferred.length === 2, 'infere zona UTM');
  console.log('OK testLngLatToUtmLength', { len: Math.round(len * 100) / 100 });
}

function testBuildLocalFromGuidesEighteen() {
  const project = { name: 'CHACARAS CORREDOR INDUSTRIAL', utm_zone: '22S' };
  const originE = 555000;
  const originN = 9845000;
  const guides = Array.from({ length: 18 }, (_, i) => {
    const lng0 = -48.5 - i * 0.00005;
    const lat0 = -1.4;
    const formats = [
      {
        type: 'LineString',
        coordinates: [
          [lng0, lat0],
          [lng0 + 0.001, lat0],
        ],
      },
      JSON.stringify({
        type: 'LineString',
        coordinates: [
          [lng0, lat0],
          [lng0 + 0.001, lat0],
        ],
      }),
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [lng0, lat0],
            [lng0 + 0.001, lat0],
          ],
        },
      },
    ];
    return {
      id: `street-${i + 1}`,
      type: i === 0 ? 'Rodovia' : i < 4 ? 'Avenida' : 'Rua',
      name: String(i + 1).padStart(2, '0'),
      displayName:
        i === 0
          ? 'Rodovia PA-160'
          : i < 4
            ? `Avenida ${String(i).padStart(2, '0')}`
            : `Rua ${String(i - 3).padStart(2, '0')}`,
      geometry_geojson: formats[i % 3],
      project_id: 'e96a0acc-d833-47c3-b179-c07d6bfa0b2b',
    };
  });

  const built = buildLocalStreetLinesFromGuides({
    guides,
    project,
    originE,
    originN,
    logInvalid: false,
  });
  assert(built.normalizedCount === 18, `normalized=${built.normalizedCount}`);
  assert(built.noGeometryCount === 0, `noGeometry=${built.noGeometryCount}`);

  const { streets, noGeometryCount } = groupEnterpriseStreets({
    guides,
    localLinesByGuideId: built.localLinesByGuideId,
  });
  assert(streets.length === 18, '18 vias');
  assert(noGeometryCount === 0, '0 sem geometria');
  const withLen = streets.filter((s) => s.lengthAvailable && s.lengthM > 0);
  assert(withLen.length === 18, '18 com comprimento');
  const { rows, totalLengthM } = buildStreetTableRows(streets);
  assert(rows.length === 18, 'tabela 18');
  assert(totalLengthM > 0, 'comprimento total > 0');
  console.log('OK testBuildLocalFromGuidesEighteen', {
    totalLengthM: Math.round(totalLengthM),
    sample: withLen[0].lengthM,
  });
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
      [100, 0],
    ],
    [
      [100, 0],
      [100, 50],
    ],
  ]);
  const { streets } = groupEnterpriseStreets({
    guides,
    localLinesByGuideId: local,
  });
  assert(streets[0].segments.length === 2, '2 segmentos');
  assert(Math.abs(streets[0].lengthM - 150) < 1e-9, '150m');
  console.log('OK testMultiSegmentSameId');
}

function testUnnamedAndNoGeometry() {
  const guides = [
    { id: 'u1', type: 'Rua', name: 'Rua/Eixo sem nome' },
    { id: 'n1', type: 'Rua', name: '02', displayName: 'Rua 02' },
  ];
  const local = new Map<string, [number, number][][]>();
  local.set('u1', [
    [
      [0, 0],
      [40, 0],
    ],
  ]);
  const { streets, unnamedCount, noGeometryCount } = groupEnterpriseStreets({
    guides,
    localLinesByGuideId: local,
  });
  assert(unnamedCount === 1, '1 unnamed');
  assert(noGeometryCount === 1, '1 no geometry');
  assert(isUnnamedStreetName(''), 'empty unnamed');
  assert(streets.find((s) => s.id === 'n1')!.issues.includes('no_geometry'), 'n1 issue');
  console.log('OK testUnnamedAndNoGeometry');
}

function testReadableAngle() {
  assert(Math.abs(readableStreetLabelAngleDeg(1, 0) - 0) < 1e-6, '0°');
  const a = readableStreetLabelAngleDeg(-1, 0);
  assert(a > -90 && a <= 90, 'normalizado ±90');
  console.log('OK testReadableAngle');
}

function testLabelRepetition() {
  assert(maxStreetLabelCountForLength(200) === 1, '<=300 → 1');
  assert(maxStreetLabelCountForLength(500) === 2, '<=700 → 2');
  assert(maxStreetLabelCountForLength(900) === 3, ' >700 → 3');
  const street: EnterpriseStreetGrouped = {
    id: 'l1',
    type: 'Rua',
    name: '01',
    displayName: 'Rua 01',
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
  const places = pickStreetLabelPlacements(street, { mapScaleMmPerM: 0.05 });
  assert(places.length >= 1, 'ao menos 1 placement');
  console.log('OK testLabelRepetition', { places: places.length });
}

function testCollision() {
  const a = { x: 0, y: 0, w: 10, h: 5 };
  const b = { x: 9, y: 0, w: 10, h: 5 };
  assert(boxesOverlap(a, b), 'overlap');
  const box = rotatedTextOccupiedBox(50, 50, 'Rua 01', 5, 0);
  assert(box.w > 0 && box.h > 0, 'box size');
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
      segments: [],
      lengthM: 120,
      lengthAvailable: true,
      issues: [],
    },
    {
      id: '2',
      type: 'Rodovia',
      name: 'PA-160',
      displayName: 'Rodovia PA-160',
      unnamed: false,
      segments: [],
      lengthM: 500,
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
      lengthM: 320,
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
    {
      id: 's2',
      type: 'Avenida',
      name: '02',
      displayName: 'Avenida 02',
      geometry_geojson: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [-48.5, -1.3995],
          [-48.499, -1.3995],
        ],
      }),
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
  assert(fit.streets.length === 2, '2 streets no fit');
  assert(fit.streets.every((s) => s.lengthAvailable), 'lengths available');
  assert(fit.streets.every((s) => s.lengthM > 0), 'length > 0');
  assert(fit.streetGeometryDiag.normalized === 2, 'diag normalized 2');
  assert(fit.streetWarnings.noGeometryCount === 0, '0 sem geometria');
  const layout = buildEnterpriseOverviewLayout(
    { blocks, streetGuides, project, options },
    '29/07/2026',
  );
  assert(layout.streetTable.rows.length === 2, '2 rows tabela');
  assert(layout.streetTable.totalLengthLabel.includes('m'), 'label m');
  assert(layout.streetGeometryDiag.candidates >= 1, 'candidates >= 1');
  assert(
    layout.streets.some((s) => s.labelPlacements.length > 0),
    'ao menos 1 placement',
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
  console.log('OK testFitIntegration', {
    length1: fit.streets[0].lengthM,
    length2: fit.streets[1].lengthM,
    candidates: layout.streetGeometryDiag.candidates,
  });
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

function testCollisionFallbackKeepsLabel() {
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
  const softOccupied = [{ x: -1000, y: -1000, w: 2000, h: 2000 }];
  const resolvedSoft = resolveStreetLabelCollisions(
    places,
    (p) => [p[0], p[1]],
    [],
    street,
    0.2,
    softOccupied,
  );
  assert(resolvedSoft.length >= 1, 'fallback soft não zera labels');

  const hardOccupied = [{ x: -1000, y: -1000, w: 2000, h: 2000 }];
  const resolvedHard = resolveStreetLabelCollisions(
    places,
    (p) => [p[0], p[1]],
    hardOccupied,
    street,
    0.2,
    [],
  );
  assert(resolvedHard.length >= 1, 'fallback hard não zera labels');
  console.log('OK testCollisionFallbackKeepsLabel');
}

function testSourceWiring() {
  const modal = read('components/map/EnterpriseOverviewModal.tsx');
  assert(modal.includes('Incluir nomes e quadro de vias'), 'checkbox modal');
  assert(modal.includes('showStreetNamesAndTable'), 'option key');
  const layout = read('lib/enterpriseOverviewLayout.ts');
  assert(layout.includes('showStreetNamesAndTable: true'), 'default on');
  assert(layout.includes('buildLocalStreetLinesFromGuides'), 'usa builder central');
  const streets = read('lib/enterpriseOverviewStreets.ts');
  assert(streets.includes('normalizeStreetGeometry'), 'normalizer');
  assert(streets.includes('streetCoordsToLocalMeters'), 'utm convert');
  const pdf = read('lib/enterpriseOverviewPdf.ts');
  assert(pdf.includes('QUADRO DE VIAS'), 'tabela no PDF');
  assert(pdf.includes('drawStreetTableExtraPage'), 'página extra');
  assert(pdf.includes('resolveStreetLabelCollisions'), 'colisão');
  assert(pdf.includes('softOccupied'), 'soft occupied');
  assert(
    !fs.existsSync(path.join(ROOT, 'supabase/migrations/zzzz_enterprise_streets.sql')),
    'sem migration nova',
  );
  console.log('OK testSourceWiring');
}

function main() {
  testPolylineLength();
  testMultiLineStringParts();
  testNormalizeStreetGeometryFormats();
  testLngLatToUtmLength();
  testBuildLocalFromGuidesEighteen();
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
  testCollisionFallbackKeepsLabel();
  testSourceWiring();
  console.log('\nALL mandatory-enterprise-overview-streets-tests PASSED');
}

main();

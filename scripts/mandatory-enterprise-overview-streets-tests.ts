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
  buildStreetLabelPlacementsOnSheet,
  getReadableSegmentAndUpperNormal,
  resolveOfficialStreetLabel,
  sameStreetLabelMinDistanceMm,
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
  const softOccupied = [{ x: 48, y: -1, w: 4, h: 2 }];
  const resolvedSoft = resolveStreetLabelCollisions(
    places,
    (p) => [p[0], -p[1]],
    [],
    street,
    0.2,
    softOccupied,
  );
  assert(resolvedSoft.length >= 1, 'com soft local ainda desenha');

  const hardAll = [{ x: -1000, y: -1000, w: 2000, h: 2000 }];
  const resolvedHard = resolveStreetLabelCollisions(
    places,
    (p) => [p[0], -p[1]],
    hardAll,
    street,
    0.2,
    [],
  );
  assert(resolvedHard.length === 0, 'hard total → omite');
  console.log('OK testCollisionFallbackKeepsLabel');
}

function testUniformFontAndDedupe() {
  const street: EnterpriseStreetGrouped = {
    id: 'av07',
    type: 'Avenida',
    name: '07',
    displayName: 'Avenida 07',
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
  assert(places.length >= 2, 'via longa → ≥2 candidatos');
  const fonts = new Set(places.map((p) => p.fontSize));
  assert(fonts.size === 1, 'fonte uniforme nos candidatos');

  const dMin = sameStreetLabelMinDistanceMm('Avenida 07', places[0].fontSize);
  assert(dMin >= 10 && dMin <= 20, `minDist proporcional ${dMin}`);

  const { placements } = buildStreetLabelPlacementsOnSheet({
    street,
    placements: places,
    projectPoint: (p) => [p[0] * 0.05, -p[1] * 0.05],
    hardOccupied: [],
    softOccupied: [],
    mapScaleMmPerM: 0.05,
  });
  assert(placements.length >= 2, `aceita ≥2 distantes, got ${placements.length}`);
  const sheetFonts = new Set(placements.map((p) => p.fontSize));
  assert(sheetFonts.size === 1, 'fonte uniforme na folha');
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const d = Math.hypot(
        placements[i].x - placements[j].x,
        placements[i].y - placements[j].y,
      );
      assert(d >= 8, `repetições distantes d=${d}`);
    }
  }
  assert(
    placements.every((p) => Math.abs(p.y) >= 0.2 && Math.abs(p.y) <= 0.7),
    'texto centrado no eixo com offset mínimo',
  );
  // Eixo horizontal: x sobre a centerline; y só nudge perpendicular (sem offset lateral).
  assert(
    placements.every((p) => p.x >= 0 && p.x <= 800 * 0.05),
    'âncora sobre o trecho da via',
  );
  console.log('OK testUniformFontAndDedupe', {
    requested: places.length,
    accepted: placements.length,
    font: placements[0]?.fontSize,
    minDist: dMin,
  });
}

function testManyStreetsGetLabels() {
  const streets: EnterpriseStreetGrouped[] = Array.from({ length: 17 }, (_, i) => {
    const y = i * 40;
    return {
      id: `s${i}`,
      type: i === 0 ? 'Rodovia' : i < 7 ? 'Avenida' : 'Rua',
      name: String(i + 1).padStart(2, '0'),
      displayName:
        i === 0
          ? 'Rodovia PA-160'
          : i < 7
            ? `Avenida ${String(i).padStart(2, '0')}`
            : `Rua ${String(i - 6).padStart(2, '0')}`,
      unnamed: false,
      segments: [
        {
          lineIndex: 0,
          line: [
            [0, y],
            [500, y],
          ],
          lengthM: 500,
        },
      ],
      lengthM: 500,
      lengthAvailable: true,
      issues: [],
    };
  });

  // Soft boxes densos simulando números de lote no corredor
  const soft: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < 17; i++) {
    for (let k = 0; k < 8; k++) {
      soft.push({
        x: 20 + k * 25,
        y: -(i * 40) * 0.05 - 1.5,
        w: 5,
        h: 3.5,
      });
    }
  }

  let accepted = 0;
  let without = 0;
  for (const street of streets) {
    const places = pickStreetLabelPlacements(street, { mapScaleMmPerM: 0.05 });
    const { placements } = buildStreetLabelPlacementsOnSheet({
      street,
      placements: places,
      projectPoint: (p) => [p[0] * 0.05, -p[1] * 0.05],
      hardOccupied: [],
      softOccupied: soft,
      mapScaleMmPerM: 0.05,
    });
    accepted += placements.length;
    if (placements.length === 0) without += 1;
  }
  assert(accepted >= 14, `≥14 labels em 17 vias, got ${accepted}`);
  assert(without <= 3, `poucas vias sem label, got ${without}`);
  assert(accepted > 2, 'não termina com só 2 labels');
  console.log('OK testManyStreetsGetLabels', { accepted, without });
}

function testSoftFallbackVsHardBlock() {
  const street: EnterpriseStreetGrouped = {
    id: 'r1',
    type: 'Rua',
    name: '01',
    displayName: 'Rua 01',
    unnamed: false,
    segments: [
      {
        lineIndex: 0,
        line: [
          [0, 0],
          [200, 0],
        ],
        lengthM: 200,
      },
    ],
    lengthM: 200,
    lengthAvailable: true,
    issues: [],
  };
  const places = pickStreetLabelPlacements(street, { mapScaleMmPerM: 0.1 });
  const softAll = [{ x: -500, y: -500, w: 1000, h: 1000 }];
  const softOk = buildStreetLabelPlacementsOnSheet({
    street,
    placements: places,
    projectPoint: (p) => [p[0] * 0.1, -p[1] * 0.1],
    hardOccupied: [],
    softOccupied: softAll,
    mapScaleMmPerM: 0.1,
  });
  assert(softOk.placements.length >= 1, 'fallback aceita colisão leve');
  assert(softOk.diag.usedFallback || softOk.placements.length >= 1, 'fallback/soft');

  const hardAll = [{ x: -500, y: -500, w: 1000, h: 1000 }];
  const hardBlocked = buildStreetLabelPlacementsOnSheet({
    street,
    placements: places,
    projectPoint: (p) => [p[0] * 0.1, -p[1] * 0.1],
    hardOccupied: hardAll,
    softOccupied: [],
    mapScaleMmPerM: 0.1,
  });
  assert(hardBlocked.placements.length === 0, 'colisão forte bloqueia');
  console.log('OK testSoftFallbackVsHardBlock');
}

function testOfficialStreetNameNoRebuild() {
  const guides = [
    {
      id: 'a',
      type: 'Avenida',
      name: 'Avenida 04',
      displayName: 'Avenida 04',
    },
    {
      id: 'b',
      type: 'Rodovia',
      name: 'Rodovia PA-160',
      displayName: 'Rodovia PA-160',
    },
    {
      id: 'c',
      type: 'Rua',
      name: 'Rua 08',
      // sem displayName — usa name cadastrado, sem prefixar tipo de novo
    },
  ];
  const local = new Map<string, [number, number][][]>();
  for (const g of guides) {
    local.set(g.id, [
      [
        [0, 0],
        [50, 0],
      ],
    ]);
  }
  const { streets } = groupEnterpriseStreets({
    guides,
    localLinesByGuideId: local,
  });
  assert(
    streets.find((s) => s.id === 'a')!.displayName === 'Avenida 04',
    'Avenida 04 intacta',
  );
  assert(
    streets.find((s) => s.id === 'b')!.displayName === 'Rodovia PA-160',
    'Rodovia PA-160 intacta',
  );
  assert(
    streets.find((s) => s.id === 'c')!.displayName === 'Rua 08',
    'Rua 08 do name cadastrado',
  );
  assert(
    resolveOfficialStreetLabel({ type: 'Avenida', name: '04', displayName: 'Avenida 04' }) ===
      'Avenida 04',
    'prefer displayName',
  );
  assert(
    resolveOfficialStreetLabel({ type: 'Rua', name: 'Rua 01' }) === 'Rua 01',
    'não reconstrói',
  );
  const src = read('lib/enterpriseOverviewStreets.ts');
  assert(!src.includes("from '@/lib/streetGuide'"), 'sem formatStreetDisplay na prancha');
  console.log('OK testOfficialStreetNameNoRebuild');
}

function testNormalPerpendicularAndReadable() {
  const a = getReadableSegmentAndUpperNormal([0, 0], [10, 0]);
  assert(Math.abs(a.angleDeg) < 1e-6, 'horizontal');
  assert(Math.abs(a.nx * a.ux + a.ny * a.uy) < 1e-9, 'normal ⊥ eixo');
  assert(a.ny < 0, 'upper aponta para topo (Y↓)');

  const flipped = getReadableSegmentAndUpperNormal([10, 0], [0, 0]);
  assert(Math.abs(flipped.angleDeg) < 1e-6, 'invertido ainda 0°');
  assert(flipped.ny < 0, 'mesmo lado visual após inversão');
  console.log('OK testNormalPerpendicularAndReadable');
}

function testSingleLabelPipelineSource() {
  const pdf = read('lib/enterpriseOverviewPdf.ts');
  assert(pdf.includes('drawStreetLabelPlacements'), 'pipeline draw');
  assert(pdf.includes('drawStreetLabelPlacement'), 'draw unitário');
  assert(pdf.includes('buildStreetLabelPlacementsOnSheet'), 'build sheet');
  const idxNew = pdf.indexOf('if (options.showStreetNamesAndTable)');
  const idxLegacy = pdf.indexOf('} else if (options.showStreets)');
  assert(idxNew > 0 && idxLegacy > idxNew, 'legado só no else');
  const newBlock = pdf.slice(idxNew, idxLegacy);
  assert(!newBlock.includes('drawLabelPlate'), 'sem placa legada no branch novo');
  console.log('OK testSingleLabelPipelineSource');
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
  assert(streets.includes('buildStreetLabelPlacementsOnSheet'), 'sheet pipeline');
  const pdf = read('lib/enterpriseOverviewPdf.ts');
  assert(pdf.includes('QUADRO DE VIAS'), 'tabela no PDF');
  assert(pdf.includes('drawStreetTableExtraPage'), 'página extra');
  assert(pdf.includes('buildStreetLabelPlacementsOnSheet'), 'colisão via sheet');
  assert(pdf.includes('softOccupied'), 'soft occupied');
  assert(pdf.includes('STREET_LABEL_RGB'), 'cor institucional');
  assert(streets.includes('streetLabelAngleOnSheet'), 'ângulo na folha');
  const page = read('app/map/page.tsx');
  assert(page.includes('Relatório de Vias'), 'botão relatório no GIS');
  assert(page.includes('StreetGuidesReportModal'), 'modal relatório');
  const report = read('lib/streetGuidesReport.ts');
  assert(report.includes('buildStreetTableRows'), 'relatório reusa quadro');
  assert(report.includes('groupEnterpriseStreets'), 'mesma agregação');
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
  testUniformFontAndDedupe();
  testManyStreetsGetLabels();
  testSoftFallbackVsHardBlock();
  testOfficialStreetNameNoRebuild();
  testNormalPerpendicularAndReadable();
  testSingleLabelPipelineSource();
  testSourceWiring();
  console.log('\nALL mandatory-enterprise-overview-streets-tests PASSED');
}

main();

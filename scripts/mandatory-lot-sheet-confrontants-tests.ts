/**
 * Confrontações oficiais — mesma fonte popup GIS, prancha PDF e memorial.
 * npx tsx scripts/mandatory-lot-sheet-confrontants-tests.ts
 */

import {
  applyManualConfrontantToBlock,
  buildLotConfrontationAudit,
  buildOfficialLotConfrontationSegmentRows,
  buildOfficialLotConfrontations,
  officialSegmentIndexesForSide,
} from '../lib/assistedConfrontation';
import { buildOfficialLotDocumentBundle } from '../lib/officialLotDocumentData';
import { buildOfficialSheetLocalGeometry } from '../lib/lotSheetCoordinates';
import { buildSketchLayoutFromBlock } from '../lib/lotSheetLayout';
import {
  generateLotSheetPdf,
  lotSheetPdfTextContent,
} from '../lib/lotSheetPdf';
import type { LotSheetPayload } from '../lib/lotSheetData';
import { segmentTableToMetricRows } from '../lib/lotSheetEnrichment';
import { getOfficialLotSegmentTable } from '../lib/officialLotMeasurements';
import { buildSideConfrontantsWithSources } from '../lib/lotSegmentConfrontation';

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
  official_side?: string,
) {
  const row: Record<string, unknown> = {
    segment_index: idx,
    north,
    east,
    end_north: endNorth,
    end_east: endEast,
    distance,
    segment_type: 'LINE',
  };
  if (official_side) row.official_side = official_side;
  return row;
}

function block(
  segments: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'test-block',
    number: '1',
    block_name: '02',
    area: 6056.14,
    segments_json: segments,
    front_segment_index: 0,
    ...extra,
  };
}

function neighborLot(
  id: string,
  num: string,
  east: number,
  north: number,
  w: number,
  h: number,
): Record<string, unknown> {
  return {
    id,
    number: num,
    block_name: '02',
    segments_json: [
      lineSeg(0, north, east, north, east + w, w),
      lineSeg(1, north, east + w, north + h, east + w, h),
      lineSeg(2, north + h, east + w, north + h, east, w),
      lineSeg(3, north + h, east, north, east, h),
    ],
  };
}

function assertPopupMatchesOfficial(
  blockRecord: Record<string, unknown>,
  audit: ReturnType<typeof buildLotConfrontationAudit>,
  allBlocks: Record<string, unknown>[],
  expected: {
    frente: string;
    fundo: string;
    ladoDireito: string;
    ladoEsquerdo: string;
  },
  label: string,
) {
  const official = buildOfficialLotConfrontations(audit, {
    block: blockRecord,
    allBlocks,
  });
  const rows = buildOfficialLotConfrontationSegmentRows(
    blockRecord,
    audit,
    allBlocks,
  );
  const layout = buildSketchLayoutFromBlock(
    blockRecord,
    String(blockRecord.id ?? 'test'),
    allBlocks,
  );

  assert(
    official.frente === expected.frente,
    `${label} frente: ${official.frente}`,
  );
  assert(official.fundo === expected.fundo, `${label} fundo: ${official.fundo}`);
  assert(
    official.ladoDireito === expected.ladoDireito,
    `${label} direito: ${official.ladoDireito}`,
  );
  assert(
    official.ladoEsquerdo === expected.ladoEsquerdo,
    `${label} esquerdo: ${official.ladoEsquerdo}`,
  );

  assert(
    layout.confrontants.frente === expected.frente,
    `${label} layout frente`,
  );
  assert(layout.confrontants.fundo === expected.fundo, `${label} layout fundo`);
  assert(
    layout.confrontants.ladoDireito === expected.ladoDireito,
    `${label} layout direito`,
  );
  assert(
    layout.confrontants.ladoEsquerdo === expected.ladoEsquerdo,
    `${label} layout esquerdo`,
  );

  const legacy = audit.confrontants;
  const legacyDiffers =
    legacy.fundo !== expected.fundo ||
    legacy.ladoEsquerdo !== expected.ladoEsquerdo;
  if (legacyDiffers) {
    assert(
      official.fundo === expected.fundo,
      `${label} deve ignorar audit.confrontants agregado (${legacy.fundo})`,
    );
  }

  const popupBySide = {
    frente: [] as string[],
    fundo: [] as string[],
    ladoDireito: [] as string[],
    ladoEsquerdo: [] as string[],
  };
  for (const row of rows) {
    popupBySide[row.key].push(row.text);
  }
  for (const role of [
    'frente',
    'fundo',
    'ladoDireito',
    'ladoEsquerdo',
  ] as const) {
    const consolidated = buildOfficialLotConfrontations(audit, {
      block: blockRecord,
      allBlocks,
    })[role];
    const fromRows = [...new Set(popupBySide[role].filter(Boolean))].join(' / ');
    if (popupBySide[role].length <= 1) {
      assert(
        consolidated === expected[role] || consolidated.includes(expected[role]),
        `${label} popup×official ${role}`,
      );
    } else {
      assert(
        consolidated === expected[role],
        `${label} popup consolidado ${role}: ${consolidated} rows=${popupBySide[role]}`,
      );
    }
  }
}

/** 1. Confrontação simples por lado. */
function testSimpleSides() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500050, 50, 'front'),
    lineSeg(1, 7500000, 500050, 7500100, 500050, 100, 'right'),
    lineSeg(2, 7500100, 500050, 7500100, 500000, 50, 'back'),
    lineSeg(3, 7500100, 500000, 7500000, 500000, 100, 'left'),
  ];
  const lot = block(segs, { id: 'simple-1', number: '7' });
  const n2 = neighborLot('n2', '8', 500050, 7500000, 12, 100);
  const n3 = neighborLot('n3', '9', 500000, 7500100, 50, 12);
  const all = [lot, n2, n3];

  let updated = applyManualConfrontantToBlock(lot, [0], 'RUA PRINCIPAL', 'street');
  const fundoIdx = officialSegmentIndexesForSide(updated, all, 'fundo');
  const dirIdx = officialSegmentIndexesForSide(updated, all, 'ladoDireito');
  const esqIdx = officialSegmentIndexesForSide(updated, all, 'ladoEsquerdo');
  updated = applyManualConfrontantToBlock(updated, fundoIdx, 'Lote 9', 'lot');
  updated = applyManualConfrontantToBlock(updated, dirIdx, 'Lote 8', 'lot');
  updated = applyManualConfrontantToBlock(updated, esqIdx, 'Lote 6', 'lot');

  const audit = buildLotConfrontationAudit(updated, 'simple-1', all, []);
  assertPopupMatchesOfficial(
    updated,
    audit,
    all,
    {
      frente: 'RUA PRINCIPAL',
      fundo: 'Lote 9',
      ladoDireito: 'Lote 8',
      ladoEsquerdo: 'Lote 6',
    },
    'simple',
  );
  console.log('OK testSimpleSides');
}

/** 2. Mesmo confrontante repetido no mesmo lado → deduplica. */
function testDuplicateSameSide() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500040, 40, 'front'),
    lineSeg(1, 7500000, 500040, 7500050, 500040, 50, 'right'),
    lineSeg(2, 7500050, 500040, 7500050, 500000, 50, 'back'),
    lineSeg(3, 7500050, 500000, 7500000, 500000, 40, 'left'),
  ];
  const lot = block(segs, { id: 'dup-1', number: '3' });
  const dirIdx = officialSegmentIndexesForSide(lot, [lot], 'ladoDireito');
  assert(dirIdx.length >= 1, 'lado direito com segmentos');
  const indexes =
    dirIdx.length >= 2 ? dirIdx.slice(0, 2) : [dirIdx[0], dirIdx[0]];
  let updated = applyManualConfrontantToBlock(lot, indexes, 'RUA 02', 'street');
  const audit = buildLotConfrontationAudit(updated, 'dup-1', [updated], []);
  const official = buildOfficialLotConfrontations(audit, {
    block: updated,
    allBlocks: [updated],
  });
  assert(official.ladoDireito === 'RUA 02', `dedupe: ${official.ladoDireito}`);
  console.log('OK testDuplicateSameSide');
}

/** 3. Dois confrontantes diferentes no mesmo lado → junta sem perder. */
function testTwoDifferentOnSameSide() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500060, 60, 'front'),
    lineSeg(1, 7500000, 500060, 7500030, 500060, 30, 'right'),
    lineSeg(2, 7500030, 500060, 7500030, 500030, 30, 'right'),
    lineSeg(3, 7500030, 500030, 7500000, 500030, 30, 'back'),
    lineSeg(4, 7500030, 500030, 7500000, 500000, 30, 'left'),
  ];
  const lot = block(segs, { id: 'two-1', number: '5' });
  const esqIdx = officialSegmentIndexesForSide(lot, [lot], 'ladoEsquerdo');
  assert(esqIdx.length >= 1, 'esquerdo');
  const a = esqIdx[0];
  const b = esqIdx[1] ?? esqIdx[0];
  let updated = applyManualConfrontantToBlock(lot, [a], 'Lote 02', 'lot');
  if (b !== a) {
    updated = applyManualConfrontantToBlock(updated, [b], 'Lote 43', 'lot');
  } else {
    updated = applyManualConfrontantToBlock(
      updated,
      [a],
      'Lote 02 e 43',
      'lot',
    );
  }
  const audit = buildLotConfrontationAudit(updated, 'two-1', [updated], []);
  const official = buildOfficialLotConfrontations(audit, {
    block: updated,
    allBlocks: [updated],
  });
  assert(
    /lote\s*02/i.test(official.ladoEsquerdo) &&
      /43/.test(official.ladoEsquerdo),
    `dois nomes: ${official.ladoEsquerdo}`,
  );
  console.log('OK testTwoDifferentOnSameSide');
}

/** 4. Martine III — Lote 1 / QD 02 (cenário validado no GIS). */
function testMartineLot01Qd02() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500100.05, 100.05),
    lineSeg(1, 7500000, 500100.05, 7500014.86, 500100.05, 14.86),
    lineSeg(2, 7500014.86, 500100.05, 7500021.64, 500106.83, 6.78),
    lineSeg(3, 7500021.64, 500106.83, 7500021.64, 500000, 106.83, 'front'),
    lineSeg(4, 7500021.64, 500000, 7500197.84, 500000, 176.2),
    lineSeg(5, 7500197.84, 500000, 7500197.84, 500069.08, 69.08),
    lineSeg(6, 7500197.84, 500069.08, 7500000, 500069.08, 197.84, 'back'),
  ];
  const lot = block(segs, {
    id: 'martine-lt01',
    number: '1',
    block_name: '02',
    front_segment_index: 3,
    front_street_name: 'RUA 01',
    area: 6056.14,
  });
  const lot43 = neighborLot('lt43', '43', 500069.08, 7500197.84, 30, 80);
  const lot02 = neighborLot('lt02', '2', 500000, 7500021.64, 80, 30);
  const all = [lot, lot43, lot02];

  const frenteIdx = officialSegmentIndexesForSide(lot, all, 'frente');
  const fundoIdx = officialSegmentIndexesForSide(lot, all, 'fundo');
  const dirIdx = officialSegmentIndexesForSide(lot, all, 'ladoDireito');
  const esqIdx = officialSegmentIndexesForSide(lot, all, 'ladoEsquerdo');

  let updated = applyManualConfrontantToBlock(lot, frenteIdx, 'RUA 01', 'street');
  updated = applyManualConfrontantToBlock(updated, fundoIdx, 'Lote 43', 'lot');
  updated = applyManualConfrontantToBlock(updated, dirIdx, 'RUA 02', 'street');
  updated = applyManualConfrontantToBlock(
    updated,
    esqIdx,
    'Lote 02 e 43',
    'lot',
  );

  const audit = buildLotConfrontationAudit(updated, 'martine-lt01', all, []);
  assertPopupMatchesOfficial(
    updated,
    audit,
    all,
    {
      frente: 'RUA 01',
      fundo: 'Lote 43',
      ladoDireito: 'RUA 02',
      ladoEsquerdo: 'Lote 02 e 43',
    },
    'martine-lt01',
  );

  const built = buildSideConfrontantsWithSources(updated, 'martine-lt01', [], all);
  if (built.fundo !== 'Lote 43') {
    assert(
      buildOfficialLotConfrontations(audit, { block: updated, allBlocks: all })
        .fundo === 'Lote 43',
      `oficial corrige agregado legado fundo=${built.fundo}`,
    );
  }
  console.log('OK testMartineLot01Qd02');
}

/** Prancha — quadro e croqui usam segmentRows oficiais (Martine QD 02 LT 01). */
function testMartinePranchaUsesOfficialSegmentRows() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500100.05, 100.05),
    lineSeg(1, 7500000, 500100.05, 7500014.86, 500100.05, 14.86),
    lineSeg(2, 7500014.86, 500100.05, 7500021.64, 500106.83, 6.78),
    lineSeg(3, 7500021.64, 500106.83, 7500021.64, 500000, 106.83, 'front'),
    lineSeg(4, 7500021.64, 500000, 7500197.84, 500000, 176.2),
    lineSeg(5, 7500197.84, 500000, 7500197.84, 500069.08, 69.08),
    lineSeg(6, 7500197.84, 500069.08, 7500000, 500069.08, 197.84, 'back'),
  ];
  const lot = block(segs, {
    id: 'martine-lt01',
    number: '1',
    block_name: '02',
    front_segment_index: 3,
    front_street_name: 'RUA 01',
    area: 6056.14,
  });
  const lot43 = neighborLot('lt43', '43', 500069.08, 7500197.84, 30, 80);
  const lot02 = neighborLot('lt02', '2', 500000, 7500021.64, 80, 30);
  const all = [lot, lot43, lot02];

  const frenteIdx = officialSegmentIndexesForSide(lot, all, 'frente');
  const fundoIdx = officialSegmentIndexesForSide(lot, all, 'fundo');
  const dirIdx = officialSegmentIndexesForSide(lot, all, 'ladoDireito');
  const esqIdx = officialSegmentIndexesForSide(lot, all, 'ladoEsquerdo');

  let updated = applyManualConfrontantToBlock(lot, frenteIdx, 'RUA 01', 'street');
  updated = applyManualConfrontantToBlock(updated, fundoIdx, 'Lote 43', 'lot');
  updated = applyManualConfrontantToBlock(updated, dirIdx, 'RUA 02', 'street');
  updated = applyManualConfrontantToBlock(
    updated,
    esqIdx,
    'Lote 02 e 43',
    'lot',
  );

  const project = {
    name: 'CHACARAS E LOTES MARTINE III',
    city: 'Parauapebas',
    uf: 'PA',
  };
  const layout = buildSketchLayoutFromBlock(
    updated,
    'martine-lt01',
    all,
    [],
    project,
  );
  const bundle = buildOfficialLotDocumentBundle({
    block: updated,
    blockId: 'martine-lt01',
    project,
    allBlocks: all,
  });

  assert(
    layout.confrontants.fundo === 'Lote 43',
    `prancha fundo ${layout.confrontants.fundo}`,
  );
  assert(
    !/FUNDO.*RUA\s*02/i.test(
      `FUNDO ${layout.confrontants.fundo}`.toUpperCase(),
    ) && layout.confrontants.fundo !== 'RUA 02',
    'prancha fundo nao pode ser RUA 02',
  );
  assert(
    bundle.confrontations.fundo === 'Lote 43',
    `bundle fundo ${bundle.confrontations.fundo}`,
  );
  assert(
    layout.confrontants.fundo === bundle.confrontations.fundo,
    'layout=bundle fundo',
  );

  const fundoSide = layout.sketchSides.find((s) => s.role === 'fundo');
  assert(
    fundoSide?.confrontantLabel === 'Lote 43',
    `sketch fundo ${fundoSide?.confrontantLabel}`,
  );

  const seg6 = bundle.segmentRows.find((r) => r.segmentIndex === 6);
  assert(seg6?.text === 'Lote 43', `seg7 row ${seg6?.text}`);

  const popupRows = buildOfficialLotConfrontationSegmentRows(
    updated,
    bundle.audit,
    all,
  );
  for (const role of [
    'frente',
    'fundo',
    'ladoDireito',
    'ladoEsquerdo',
  ] as const) {
    assert(
      layout.confrontants[role] === bundle.confrontations[role],
      `popup×prancha ${role}`,
    );
    const popupTexts = popupRows
      .filter((r) => r.key === role)
      .map((r) => r.text);
    if (popupTexts.length) {
      assert(
        layout.confrontants[role].includes(
          popupTexts[0].split(' / ')[0] ?? popupTexts[0],
        ) || popupTexts.every((t) => layout.confrontants[role].includes(t)),
        `rows×prancha ${role}`,
      );
    }
  }

  console.log('OK testMartinePranchaUsesOfficialSegmentRows');
}

function buildMartineLot01Qd02Block() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500100.05, 100.05),
    lineSeg(1, 7500000, 500100.05, 7500014.86, 500100.05, 14.86),
    lineSeg(2, 7500014.86, 500100.05, 7500021.64, 500106.83, 6.78),
    lineSeg(3, 7500021.64, 500106.83, 7500021.64, 500000, 106.83, 'front'),
    lineSeg(4, 7500021.64, 500000, 7500197.84, 500000, 176.2),
    lineSeg(5, 7500197.84, 500000, 7500197.84, 500069.08, 69.08),
    lineSeg(6, 7500197.84, 500069.08, 7500000, 500069.08, 197.84, 'back'),
  ];
  const lot = block(segs, {
    id: 'martine-lt01',
    number: '1',
    block_name: '02',
    front_segment_index: 3,
    front_street_name: 'RUA 01',
    area: 6056.14,
  });
  const lot43 = neighborLot('lt43', '43', 500069.08, 7500197.84, 30, 80);
  const lot02 = neighborLot('lt02', '2', 500000, 7500021.64, 80, 30);
  const all = [lot, lot43, lot02];

  const frenteIdx = officialSegmentIndexesForSide(lot, all, 'frente');
  const fundoIdx = officialSegmentIndexesForSide(lot, all, 'fundo');
  const dirIdx = officialSegmentIndexesForSide(lot, all, 'ladoDireito');
  const esqIdx = officialSegmentIndexesForSide(lot, all, 'ladoEsquerdo');

  let updated = applyManualConfrontantToBlock(lot, frenteIdx, 'RUA 01', 'street');
  updated = applyManualConfrontantToBlock(updated, fundoIdx, 'Lote 43', 'lot');
  updated = applyManualConfrontantToBlock(updated, dirIdx, 'RUA 02', 'street');
  updated = applyManualConfrontantToBlock(
    updated,
    esqIdx,
    'Lote 02 e 43',
    'lot',
  );
  return { lot: updated, all };
}

/** PDF — quadro CONFRONTAÇÕES usa bundle oficial (não audit.sides legado). */
async function testMartinePranchaPdfConfrontationsQuadro() {
  const { lot, all } = buildMartineLot01Qd02Block();
  const project = {
    name: 'CHACARAS E LOTES MARTINE III',
    city: 'Parauapebas',
    uf: 'PA',
    escala_padrao: '1:800',
  };
  const bundle = buildOfficialLotDocumentBundle({
    block: lot,
    blockId: 'martine-lt01',
    project,
    allBlocks: all,
  });
  const layout = buildSketchLayoutFromBlock(
    lot,
    'martine-lt01',
    all,
    [],
    project,
  );
  const geom = buildOfficialSheetLocalGeometry(lot);
  assert(geom != null, 'geometria martine');
  const officialTable = getOfficialLotSegmentTable(lot, project);
  const metricRows = segmentTableToMetricRows(officialTable);

  assert(
    layout.confrontants.fundo === bundle.confrontations.fundo,
    'layout=bundle fundo',
  );
  assert(bundle.confrontations.fundo === 'Lote 43', bundle.confrontations.fundo);

  const payload = {
    project,
    lot,
    owner: 'Teste',
    ownerDocument: '—',
    ownerDetails: {
      name: 'Teste',
      cpf: '—',
      fatherName: '—',
      motherName: '—',
      address: '—',
      neighborhood: '—',
      municipality: 'Parauapebas/PA',
      cadastralInscription: '—',
    },
    company: null,
    technicalResponsible: null,
    neighbors: [],
    cardinalConfrontants: [],
    blockSketch: null,
    projectMap: [],
    vertices: [],
    segments: [],
    metricRows,
    coordinatesAvailable: true,
    frontEdgeIndex: 3,
    quadraStreetNames: ['RUA 01', 'RUA 02'],
    validation: {
      code: 'TEST',
      url: 'https://local',
      emittedAt: new Date().toISOString(),
    },
    version: 'test',
    geometry: {
      utmRing: geom!.utmRing,
      localRing: geom!.localRing,
      bboxMeters: geom!.bboxMeters,
    },
    measures: {
      frente: '106,83 m',
      fundo: '197,84 m',
      ladoDireito: '124,49 m',
      ladoEsquerdo: '176,20 m',
      chanfre: '6,78 m',
      curva: '—',
      raio: '—',
      corda: '—',
      area: '6.056,14 m²',
    },
    scaleLabel: '1 : 800',
    sideConfrontants: bundle.confrontations,
    lotAddressLine: '—',
    memorialFrontClause: '—',
    memorialTechnicalHtml: '',
    memorialDraftPlain: '',
    officialEdgeLengths: layout.edgeLabels,
    sketchSides: layout.sketchSides,
    ignoredSegmentNote: null,
  } as LotSheetPayload;

  const doc = await generateLotSheetPdf(payload);
  const text = lotSheetPdfTextContent(doc).toUpperCase();

  assert(text.includes('CONFRONTAÇÕES') || text.includes('CONFRONTA'), 'secao confrontacoes');
  assert(/FUNDO/.test(text) && /LOTE 43/.test(text), 'pdf fundo lote 43');
  assert(!/FUNDO\s+RUA\s*0?2/.test(text), 'pdf nao pode ter FUNDO RUA 02');
  assert(/FRENTE/.test(text) && /RUA\s*0?1/.test(text), 'pdf frente rua 01');
  assert(/LADO\s+DIREITO/.test(text) && /RUA\s*0?2/.test(text), 'pdf dir rua 02');
  assert(
    /LADO\s+ESQUERDO/.test(text) && /LOTE\s+02/.test(text) && /43/.test(text),
    'pdf esq lote 02 e 43',
  );
  assert(/CHANFRE/.test(text) && /6,78/.test(text), 'pdf chanfre 6,78');

  console.log('OK testMartinePranchaPdfConfrontationsQuadro');
}

/** Sempre exibe os quatro lados, mesmo vazios. */
function testAllSidesAlwaysPresent() {
  const segs = [
    lineSeg(0, 7500000, 500000, 7500000, 500030, 30),
    lineSeg(1, 7500000, 500030, 7500030, 500030, 30),
    lineSeg(2, 7500030, 500030, 7500030, 500000, 30),
    lineSeg(3, 7500030, 500000, 7500000, 500000, 30),
  ];
  const lot = block(segs, { id: 'empty-sides' });
  const audit = buildLotConfrontationAudit(lot, 'empty-sides', [lot], []);
  const official = buildOfficialLotConfrontations(audit, {
    block: lot,
    allBlocks: [lot],
  });
  for (const key of [
    'frente',
    'fundo',
    'ladoDireito',
    'ladoEsquerdo',
  ] as const) {
    assert(
      typeof official[key] === 'string' && official[key].length > 0,
      `lado ${key} presente: ${official[key]}`,
    );
  }
  console.log('OK testAllSidesAlwaysPresent');
}

async function main() {
  testSimpleSides();
  testDuplicateSameSide();
  testTwoDifferentOnSameSide();
  testMartineLot01Qd02();
  testMartinePranchaUsesOfficialSegmentRows();
  await testMartinePranchaPdfConfrontationsQuadro();
  testAllSidesAlwaysPresent();
  console.log('mandatory-lot-sheet-confrontants-tests: all passed');
}

void main();

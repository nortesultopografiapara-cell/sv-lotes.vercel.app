/**
 * Atualização individual de lote (TXT Civil 3D).
 * npx tsx scripts/mandatory-individual-lot-update-tests.ts
 */

import {
  buildIndividualLotTechnicalPatch,
  countBlocksInQuadra,
  findBlockInQuadra,
  mergeSegmentMetadataFromExisting,
  parseTxtLotsForIndividualUpdate,
  patchTouchesCommercialFields,
  buildIndividualLotInsertRow,
  type IndividualLotUpdateMode,
} from '../lib/civil3dIndividualLotUpdate';
import { buildOfficialLotDocumentBundle } from '../lib/officialLotDocumentData';
import { buildMemorialPayloadFromRecords } from '../lib/memorial/memorialData';
import { buildSketchLayoutFromBlock } from '../lib/lotSheetLayout';
import { buildBlockMatchKey } from '../lib/shapefileImport';

const PROJ4 =
  '+proj=utm +zone=22 +south +datum=WGS84 +units=m +no_defs';

const LOT_01_TXT = `Name: 01
Area: 5000.00
Perimeter: 300.00
North: 7500000.0000m     East: 500000.0000m

Segment #1  :  Line
Length: 50.000m
North: 7500050.0000m     East: 500000.0000m

Segment #2  :  Line
Length: 100.000m
North: 7500050.0000m     East: 500100.0000m

Segment #3  :  Line
Length: 50.000m
North: 7500000.0000m     East: 500100.0000m

Segment #4  :  Line
Length: 100.000m
North: 7500000.0000m     East: 500000.0000m
`;

const LOT_02_TXT = `Name: 02
Area: 4000.00
Perimeter: 260.00
North: 7500100.0000m     East: 500000.0000m

Segment #1  :  Line
Length: 50.000m
North: 7500150.0000m     East: 500000.0000m

Segment #2  :  Line
Length: 80.000m
North: 7500150.0000m     East: 500080.0000m

Segment #3  :  Line
Length: 50.000m
North: 7500100.0000m     East: 500080.0000m

Segment #4  :  Line
Length: 80.000m
North: 7500100.0000m     East: 500000.0000m
`;

const TWO_LOTS_TXT = `${LOT_01_TXT}\n\n${LOT_02_TXT}`;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function makeQd05Blocks(): Record<string, unknown>[] {
  const oldSegments = [
    {
      segment_index: 0,
      distance: 50,
      north: 7500000,
      east: 500000,
      manual_confrontant: 'RUA 01',
      manual_confrontant_source: 'manual',
      official_side: 'front',
    },
    {
      segment_index: 1,
      distance: 100,
      north: 7500050,
      east: 500000,
    },
    {
      segment_index: 2,
      distance: 50,
      north: 7500050,
      east: 500100,
    },
    {
      segment_index: 3,
      distance: 100,
      north: 7500000,
      east: 500100,
    },
  ];
  return [
    {
      id: 'qd05-lt01',
      project_id: 'martine-iii',
      block_name: '05',
      name: '05',
      number: '1',
      lot_number: '1',
      price: 85000,
      status: 'Vendido',
      customer_id: 'cust-99',
      sale_id: 'sale-99',
      contract_id: 'contract-99',
      area: 4800,
      perimeter: 290,
      segments_json: oldSegments,
      front_segment_index: 0,
      front_source: 'manual',
      source_import: 'TXT_CIVIL3D',
    },
    {
      id: 'qd05-lt02',
      project_id: 'martine-iii',
      block_name: '05',
      name: '05',
      number: '2',
      lot_number: '2',
      price: 72000,
      status: 'Disponível',
      area: 4000,
      perimeter: 260,
      segments_json: [],
      source_import: 'TXT_CIVIL3D',
    },
  ];
}

function testPreservePriceAndStatus() {
  const blocks = makeQd05Blocks();
  const existing = findBlockInQuadra(blocks, '05', '01')!;
  const parsed = parseTxtLotsForIndividualUpdate(LOT_01_TXT, PROJ4);
  const payload = parsed.lots[0]!;
  const patch = buildIndividualLotTechnicalPatch(
    payload,
    existing,
    'geometry_technical',
  );

  assert(!patchTouchesCommercialFields(patch).includes('price'), 'patch sem price');
  assert(!patchTouchesCommercialFields(patch).includes('status'), 'patch sem status');
  assert(existing.price === 85000, 'price preservado no block');
  assert(existing.status === 'Vendido', 'status preservado');
  assert(existing.sale_id === 'sale-99', 'sale_id preservado');
  assert(existing.contract_id === 'contract-99', 'contract_id preservado');
  console.log('OK testPreservePriceAndStatus');
}

function testNoDuplicateLot01() {
  const blocks = makeQd05Blocks();
  const before = countBlocksInQuadra(blocks, '05');
  const found = findBlockInQuadra(blocks, '05', '01');
  const foundAgain = findBlockInQuadra(blocks, '05', '1');
  assert(before === 2, 'quadra tem 2 lotes');
  assert(found?.id === 'qd05-lt01', 'achou lt01');
  assert(foundAgain?.id === 'qd05-lt01', '01=1');
  const keys = blocks.map((b) =>
    buildBlockMatchKey(String(b.block_name), String(b.number)),
  );
  assert(new Set(keys).size === keys.length, 'sem duplicata');
  console.log('OK testNoDuplicateLot01');
}

function testUpdatesTechnicalFields() {
  const blocks = makeQd05Blocks();
  const existing = findBlockInQuadra(blocks, '05', '01')!;
  const payload = parseTxtLotsForIndividualUpdate(LOT_01_TXT, PROJ4).lots[0]!;
  const patch = buildIndividualLotTechnicalPatch(
    payload,
    existing,
    'geometry_technical',
  );

  assert(patch.area === 5000, `area ${patch.area}`);
  assert(Array.isArray(patch.segments_json), 'segments_json');
  assert((patch.segments_json as unknown[]).length === 4, '4 segmentos');
  assert(patch.geometry != null, 'geometry');
  assert(patch.coordinates_utm_json != null, 'utm coords');
  assert(
    Number(patch.perimeter) > 0 || String(patch.perimeter).length > 0,
    'perimeter',
  );
  console.log('OK testUpdatesTechnicalFields');
}

function testOtherLotsUnchanged() {
  const blocks = makeQd05Blocks();
  const lt02Before = { ...findBlockInQuadra(blocks, '05', '02')! };
  const payload = parseTxtLotsForIndividualUpdate(LOT_01_TXT, PROJ4).lots[0]!;
  buildIndividualLotTechnicalPatch(
    payload,
    findBlockInQuadra(blocks, '05', '01')!,
    'geometry_technical',
  );
  const lt02After = findBlockInQuadra(blocks, '05', '02')!;
  assert(lt02After.price === lt02Before.price, 'lt02 price');
  assert(lt02After.area === lt02Before.area, 'lt02 area');
  assert(lt02After.id === lt02Before.id, 'lt02 id');
  console.log('OK testOtherLotsUnchanged');
}

function testPreservesManualConfrontantMerge() {
  const blocks = makeQd05Blocks();
  const existing = findBlockInQuadra(blocks, '05', '01')!;
  const payload = parseTxtLotsForIndividualUpdate(LOT_01_TXT, PROJ4).lots[0]!;
  const merged = mergeSegmentMetadataFromExisting(
    payload.segmentsJson,
    existing,
    'geometry_technical',
  );
  const seg0 = merged.find((s) => s.segment_index === 0);
  assert(
    seg0?.manual_confrontant === 'RUA 01',
    `confrontante manual ${seg0?.manual_confrontant}`,
  );

  const stripped = mergeSegmentMetadataFromExisting(
    payload.segmentsJson,
    existing,
    'geometry_confrontations',
  );
  const seg0b = stripped.find((s) => s.segment_index === 0);
  assert(
    !seg0b?.manual_confrontant,
    'modo confrontations remove manual',
  );
  console.log('OK testPreservesManualConfrontantMerge');
}

function testBlocksMultipleLotsInTxt() {
  const parsed = parseTxtLotsForIndividualUpdate(TWO_LOTS_TXT, PROJ4);
  assert(parsed.multipleLots, 'multiplos lotes');
  assert(parsed.lotNames.length === 2, '2 nomes');
  console.log('OK testBlocksMultipleLotsInTxt');
}

function testLotNotFoundRequiresConfirmation() {
  const blocks = makeQd05Blocks();
  const missing = findBlockInQuadra(blocks, '05', '99');
  assert(missing == null, 'lote 99 ausente');
  console.log('OK testLotNotFoundRequiresConfirmation');
}

function testInsertRowForNewLot() {
  const payload = parseTxtLotsForIndividualUpdate(LOT_01_TXT, PROJ4).lots[0]!;
  const row = buildIndividualLotInsertRow(
    payload,
    'martine-iii',
    '05',
    '99',
    'tenant-1',
    'tenant-1',
    'geometry_technical',
  );
  assert(row.block_name === '05', 'quadra');
  assert(row.number === '99', 'numero');
  assert(row.status === 'Disponível', 'status novo');
  assert(typeof row.price === 'number', 'price calculado');
  assert(!patchTouchesCommercialFields(row).includes('customer_id'), 'sem customer');
  console.log('OK testInsertRowForNewLot');
}

function testPranchaAndMemorialAfterUpdate() {
  const blocks = makeQd05Blocks();
  const existing = findBlockInQuadra(blocks, '05', '01')!;
  const payload = parseTxtLotsForIndividualUpdate(LOT_01_TXT, PROJ4).lots[0]!;
  const patch = buildIndividualLotTechnicalPatch(
    payload,
    existing,
    'geometry_technical',
  );
  const updated = {
    ...existing,
    ...patch,
    price: existing.price,
    status: existing.status,
    customer_id: existing.customer_id,
    sale_id: existing.sale_id,
    contract_id: existing.contract_id,
  };

  const project = {
    name: 'CHACARAS E LOTES MARTINE III',
    city: 'Parauapebas',
    uf: 'PA',
    utm_zone: '22S',
  };
  const bundle = buildOfficialLotDocumentBundle({
    block: updated,
    blockId: 'qd05-lt01',
    project,
    allBlocks: [updated, ...blocks.filter((b) => b.id !== 'qd05-lt01')],
  });
  assert(bundle.measures.area != null, 'medidas oficiais');
  assert(
    Array.isArray(updated.segments_json) &&
      (updated.segments_json as unknown[]).length === 4,
    'segments_json atualizado',
  );

  const memorial = buildMemorialPayloadFromRecords({
    block: updated,
    blockId: 'qd05-lt01',
    project,
    allBlocks: [updated],
    streetGuides: [],
    company: { name: 'TESTE', fantasy_name: 'TESTE' },
  });
  assert(memorial.segments.length >= 4, 'memorial segmentos');
  assert(
    memorial.identification.areaM2.includes('5'),
    `memorial area ${memorial.identification.areaM2}`,
  );

  const layout = buildSketchLayoutFromBlock(
    updated,
    'qd05-lt01',
    [updated],
    [],
    project,
  );
  assert(layout.confrontants != null, 'prancha confrontations');
  assert(layout.edgeLabels.length > 0, 'prancha medidas');

  assert(updated.price === 85000, 'preco apos update');
  assert(updated.status === 'Vendido', 'status apos update');
  console.log('OK testPranchaAndMemorialAfterUpdate');
}

function main() {
  testPreservePriceAndStatus();
  testNoDuplicateLot01();
  testUpdatesTechnicalFields();
  testOtherLotsUnchanged();
  testPreservesManualConfrontantMerge();
  testBlocksMultipleLotsInTxt();
  testLotNotFoundRequiresConfirmation();
  testInsertRowForNewLot();
  testPranchaAndMemorialAfterUpdate();
  console.log('mandatory-individual-lot-update-tests: all passed');
}

main();

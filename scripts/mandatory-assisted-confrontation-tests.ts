/**
 * GIS-005 — confrontação assistida
 * npx tsx scripts/mandatory-assisted-confrontation-tests.ts
 */

import {
  PENDING_CONFRONTANT_LABEL,
  normalizeConfrontantLabel,
} from '../lib/confrontantTypes';
import {
  applyManualConfrontantToBlock,
  buildLotConfrontationAudit,
} from '../lib/assistedConfrontation';
import {
  getSegmentConfrontantRecord,
} from '../lib/segmentConfrontantPersist';
import { buildSideConfrontantsWithSources } from '../lib/lotSegmentConfrontation';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function utmRectSegments(
  east0: number,
  north0: number,
  w: number,
  h: number,
): Record<string, unknown>[] {
  const e1 = east0 + w;
  const n1 = north0 + h;
  return [
    {
      segment_index: 0,
      north: north0,
      east: east0,
      end_north: north0,
      end_east: e1,
      distance: w,
      segment_type: 'LINE',
    },
    {
      segment_index: 1,
      north: north0,
      east: e1,
      end_north: n1,
      end_east: e1,
      distance: h,
      segment_type: 'LINE',
    },
    {
      segment_index: 2,
      north: n1,
      east: e1,
      end_north: n1,
      end_east: east0,
      distance: w,
      segment_type: 'LINE',
    },
    {
      segment_index: 3,
      north: n1,
      east: east0,
      end_north: north0,
      end_east: east0,
      distance: h,
      segment_type: 'LINE',
    },
  ];
}

function block(id: string, num: string, east: number, north: number) {
  return {
    id,
    number: num,
    block_name: '02',
    front_segment_index: 0,
    front_street_name: 'RUA CENTRAL 01',
    segments_json: utmRectSegments(east, north, 12, 25),
  };
}

function testPendingLabel() {
  assert(
    normalizeConfrontantLabel('—') === PENDING_CONFRONTANT_LABEL,
    'traço vira A DEFINIR',
  );
  console.log('OK testPendingLabel');
}

function testManualOverridesAuto() {
  const b = block('a', '01', 50000, 7500000);
  const updated = applyManualConfrontantToBlock(
    b,
    [2],
    'Área Remanescente',
    'remnant_area',
  );
  const rec = getSegmentConfrontantRecord(updated, 2);
  assert(rec?.confrontant === 'Área Remanescente', 'manual no segmento 2');
  const built = buildSideConfrontantsWithSources(
    updated,
    'a',
    [],
    [updated],
    [],
  );
  assert(
    built.fundo === 'Área Remanescente' || built.ladoDireito === 'Área Remanescente',
    'lado com segmento 2 usa manual',
  );
  console.log('OK testManualOverridesAuto');
}

function testAuditPendingFundo() {
  const b1 = block('b1', '01', 50000, 7500000);
  const audit = buildLotConfrontationAudit(b1, 'b1', [b1], []);
  assert(audit.sides.frente.label.includes('CENTRAL'), 'frente com rua');
  assert(
    audit.sides.fundo.pending || audit.sides.fundo.label === PENDING_CONFRONTANT_LABEL,
    'fundo pendente ou A DEFINIR',
  );
  console.log('OK testAuditPendingFundo');
}

function testManualNotClearedByRebuild() {
  const b = block('c', '12', 50020, 7500000);
  let updated = applyManualConfrontantToBlock(b, [2], 'Área Verde', 'green_area');
  const again = buildSideConfrontantsWithSources(updated, 'c', [], [updated], []);
  assert(
    again.fundo === 'Área Verde' ||
      again.ladoDireito === 'Área Verde' ||
      again.ladoEsquerdo === 'Área Verde',
    'manual persiste no recálculo',
  );
  console.log('OK testManualNotClearedByRebuild');
}

testPendingLabel();
testManualOverridesAuto();
testAuditPendingFundo();
testManualNotClearedByRebuild();
console.log('mandatory-assisted-confrontation-tests: all passed');

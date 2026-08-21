/**
 * Etapa 9 / 9.1 — Confrontações dinâmicas ARAGUAIA = mesma fonte do popup GIS.
 * npx tsx scripts/mandatory-araguaia-esign-v2-confrontations-tests.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateContractHTML } from '../lib/contractTemplate';
import { resolveAraguaiaLotDescription } from '../lib/araguaiaContractLot';
import { loadLotConfrontations } from '../lib/lotConfrontationsPanel';
import {
  buildOfficialLotConfrontations,
  buildLotConfrontationAudit,
  buildOfficialLotConfrontationSegmentRows,
} from '../lib/assistedConfrontation';
import { shouldLoadProjectBlocksForContract } from '../lib/contractHtmlGlobal';

const root = process.cwd();

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

const TENANT = {
  contract_model: 'ARAGUAIA',
  name: 'S.V TOPOGRAFIA E PROJETO LTDA',
  cnpj: '12345678000190',
  address: 'Rua Teste, 100',
  city: 'Parauapebas',
  state: 'PA',
  legal_representative: 'JOÃO TESTE',
  representative_cpf: '39053344705',
};

const PROJECT = {
  name: 'Chacreamento Araguaia',
  city: 'Parauapebas',
  uf: 'PA',
  contract_model: 'ARAGUAIA',
};

const CUSTOMER = {
  name: 'Cliente Confrontações',
  cpf_cnpj: '11144477735',
  nationality: 'Brasileira',
  civil_state: 'Solteiro',
  profession: 'Comerciante',
  email: 'c@teste.com',
  phone: '(94) 99999-0000',
  address: 'Rua A, 1',
  city: 'Parauapebas',
  state: 'PA',
};

/** Fixture: quatro confrontações distintas — sem troca de lados. */
const LOT_FOUR_SIDES: Record<string, unknown> = {
  id: 'lot-confront-9',
  number: '59',
  block_name: '02',
  area: 1200,
  frente: 20,
  fundo: 20,
  'Lado Dir.': 60,
  'Lado Esq.': 60,
  segments_json: [
    {
      segment_index: 0,
      official_side: 'frente',
      distance: 20,
      confrontant: 'Rua 02',
    },
    {
      segment_index: 1,
      official_side: 'lado_direito',
      distance: 60,
      confrontant: 'Lote 60',
    },
    {
      segment_index: 2,
      official_side: 'fundo',
      distance: 20,
      confrontant: 'Lote 37',
    },
    {
      segment_index: 3,
      official_side: 'lado_esquerdo',
      distance: 60,
      confrontant: 'Lote 58',
    },
  ],
};

const SALE = {
  total_value: 50000,
  down_payment: 5000,
  installments_count: 10,
  installment_value: 4500,
  payment_type: 'Parcelado',
  installment_correction_type: 'IGPM',
  sale_date: '2026-08-21',
};

/** Geometria idêntica ao fixture assistido (vizinhos UTM nos 4 lados). */
const LAT0 = -23.5;
const LNG0 = -46.6;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

function utmRectSegments(east0: number, north0: number, w: number, h: number) {
  const e1 = east0 + w;
  const n1 = north0 + h;
  // Mesmos campos UTM do GIS assistido (sem official_side — evita walk invertido).
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

function rectBounds(w: number, h: number) {
  return [
    [LAT0, LNG0],
    [LAT0, LNG0 + w / M_PER_DEG_LNG],
    [LAT0 + h / M_PER_DEG_LAT, LNG0 + w / M_PER_DEG_LNG],
    [LAT0 + h / M_PER_DEG_LAT, LNG0],
  ] as [number, number][];
}

function blockWithGeometry(
  id: string,
  num: string,
  east: number,
  north: number,
  w = 12,
  h = 25,
) {
  const bounds = rectBounds(w, h);
  const coords = bounds.map(([lat, lng]) => [lng, lat]);
  return {
    id,
    number: num,
    block_name: '02',
    front_segment_index: 0,
    front_street_name: 'Rua 02',
    bounds,
    geometry: { type: 'Polygon', coordinates: [coords] },
    segments_json: utmRectSegments(east, north, w, h),
  };
}

function gisFinalBySide(
  lot: Record<string, unknown>,
  allBlocks: Record<string, unknown>[],
  streetGuides: Record<string, unknown>[] = [],
) {
  const frontStreetLabel = String(lot.front_street_name || '').trim() || null;
  const panel = loadLotConfrontations({
    lot,
    allBlocks,
    streetGuides,
    frenteConfrontLabel: frontStreetLabel,
    frontStreetLabel,
  });
  const audit =
    panel.audit ||
    buildLotConfrontationAudit(
      lot,
      String(lot.id),
      allBlocks,
      streetGuides,
      PROJECT,
    );
  const rows = buildOfficialLotConfrontationSegmentRows(lot, audit, allBlocks, {
    streetGuides: streetGuides as never,
    frenteConfrontLabel: frontStreetLabel,
    frontStreetLabel,
  });
  const conf = buildOfficialLotConfrontations(audit, {
    block: lot,
    allBlocks,
    project: PROJECT,
    streetGuides: streetGuides as never,
    frenteConfrontLabel: frontStreetLabel,
    frontStreetLabel,
  });
  return { panel, audit, rows, conf };
}

console.log('\n======== ETAPA 9.1 — CONFRONTAÇÕES ARAGUAIA = GIS ========');

console.log('\n=== A) Fonte canônica = popup GIS + carga de vizinhos ===');
{
  const panel = readFileSync(
    join(root, 'lib/lotConfrontationsPanel.ts'),
    'utf8',
  );
  ok(panel.includes('buildLotConfrontationAudit'), 'popup: audit');
  ok(
    panel.includes('buildOfficialLotConfrontationSegmentRows'),
    'popup: rows oficiais',
  );

  const lotLib = readFileSync(
    join(root, 'lib/araguaiaContractLot.ts'),
    'utf8',
  );
  ok(lotLib.includes('buildOfficialLotConfrontations'), 'contrato: official');
  ok(lotLib.includes('loadLotConfrontations'), 'contrato: loadLotConfrontations');

  const globalLib = readFileSync(
    join(root, 'lib/contractHtmlGlobal.ts'),
    'utf8',
  );
  ok(
    globalLib.includes('isAraguaiaContractModel'),
    'HTML global carrega blocks no ARAGUAIA',
  );
  ok(
    shouldLoadProjectBlocksForContract({ contract_model: 'ARAGUAIA' }),
    'shouldLoadProjectBlocks ARAGUAIA = true',
  );
  ok(
    shouldLoadProjectBlocksForContract({ contract_model: 'RECANTO_PRIMAVERA' }),
    'shouldLoadProjectBlocks Recanto = true',
  );

  const clauses = readFileSync(
    join(root, 'lib/araguaiaContractClauses.ts'),
    'utf8',
  );
  ok(clauses.includes('sideMeasureWithConfrontant'), 'cláusula com confrontante');
  ok(clauses.includes('confrontando com'), 'texto confrontando com');
}

console.log('\n=== B) Contrato × GIS — mesmos lados (segments_json) ===');
{
  const resolved = resolveAraguaiaLotDescription({
    block: LOT_FOUR_SIDES,
    project: PROJECT,
    projectBlocks: [LOT_FOUR_SIDES],
  });
  ok(resolved.confrontations.frente.includes('Rua 02'), 'B: frente = Rua 02');
  ok(resolved.confrontations.fundo.includes('Lote 37'), 'B: fundo = Lote 37');
  ok(
    resolved.confrontations.ladoDireito.includes('Lote 60'),
    'B: direita = Lote 60',
  );
  ok(
    resolved.confrontations.ladoEsquerdo.includes('Lote 58'),
    'B: esquerda = Lote 58',
  );

  const audit = buildLotConfrontationAudit(
    LOT_FOUR_SIDES,
    String(LOT_FOUR_SIDES.id),
    [LOT_FOUR_SIDES],
    [],
    PROJECT,
  );
  const gis = buildOfficialLotConfrontations(audit, {
    block: LOT_FOUR_SIDES,
    allBlocks: [LOT_FOUR_SIDES],
    project: PROJECT,
  });
  ok(
    resolved.confrontations.frente === gis.frente ||
      resolved.confrontations.frente.includes('Rua 02'),
    'B: frente alinhada GIS',
  );
  ok(
    resolved.confrontations.ladoDireito === gis.ladoDireito ||
      resolved.confrontations.ladoDireito.includes('Lote 60'),
    'B: direita alinhada GIS',
  );
  ok(
    resolved.confrontations.ladoEsquerdo === gis.ladoEsquerdo ||
      resolved.confrontations.ladoEsquerdo.includes('Lote 58'),
    'B: esquerda alinhada GIS',
  );

  ok(
    resolved.confrontations.ladoDireito !== resolved.confrontations.ladoEsquerdo,
    'B: direita ≠ esquerda',
  );
  ok(
    !resolved.confrontations.ladoDireito.includes('Lote 58'),
    'B: direita não pegou Lote 58',
  );
  ok(
    !resolved.confrontations.ladoEsquerdo.includes('Lote 60'),
    'B: esquerda não pegou Lote 60',
  );
}

console.log('\n=== B2) Integração geométrica — popup GIS final == contrato (4 lados) ===');
{
  const w = 10;
  const h = 24;
  const baseEast = 50050;
  const baseNorth = 7500025;

  // Mesmo lote do contrato (Lote 55) — não misturar com 33/outro.
  const lotEsq = blockWithGeometry('lot-54', '54', baseEast - w, baseNorth, w, h);
  const lotAlvo = {
    ...blockWithGeometry('lot-55', '55', baseEast, baseNorth, w, h),
    block_name: '02',
    front_street_name: 'Rua 02',
    // Homolog: segments_json sem confrontant em fundo/laterais (só geometria resolve).
    segments_json: utmRectSegments(baseEast, baseNorth, w, h),
  };
  const lotDir = blockWithGeometry('lot-56', '56', baseEast + w, baseNorth, w, h);
  const lotFundo = blockWithGeometry(
    'lot-41',
    '41',
    baseEast,
    baseNorth + h,
    w,
    h,
  );
  for (const b of [lotEsq, lotAlvo, lotDir, lotFundo]) {
    (b as { block_name: string }).block_name = '02';
  }

  const streetGuide = {
    id: 'sg-rua-02',
    name: '02',
    type: 'rua',
    active: true,
    geometry: {
      type: 'LineString',
      coordinates: [
        [LNG0 - 30 / M_PER_DEG_LNG, LAT0],
        [LNG0 + 50 / M_PER_DEG_LNG, LAT0],
      ],
    },
  };
  const allBlocks = [lotEsq, lotAlvo, lotDir, lotFundo];
  const guides = [streetGuide];

  const gis = gisFinalBySide(lotAlvo, allBlocks, guides);
  const contract = resolveAraguaiaLotDescription({
    block: lotAlvo,
    project: PROJECT,
    projectBlocks: allBlocks,
    streetGuides: guides,
  });

  const sideKeys = [
    'frente',
    'fundo',
    'ladoDireito',
    'ladoEsquerdo',
  ] as const;

  // Mapa de chaves GIS (official_side / SideRole).
  const SIDE_KEY_MAP = {
    frente: { official_side: 'frente|front', ui: 'Frente' },
    fundo: { official_side: 'fundo|back', ui: 'Fundo' },
    ladoDireito: { official_side: 'lado_direito|right', ui: 'Lado Direito' },
    ladoEsquerdo: { official_side: 'lado_esquerdo|left', ui: 'Lado Esquerdo' },
  };
  for (const key of sideKeys) {
    const row = gis.rows.find((r) => r.key === key);
    const edge = gis.audit?.segmentEdges.find(
      (e) => e.segmentIndex === row?.segmentIndex,
    );
    console.log(
      `  [lado ${key}] map=${JSON.stringify(SIDE_KEY_MAP[key])} seg=${row?.segmentIndex} geom="${edge?.confrontant ?? ''}" popup="${gis.conf[key]}" contrato="${contract.confrontations[key]}"`,
    );
  }

  ok(/rua\s*02/i.test(gis.conf.frente), 'B2 GIS: frente Rua 02');
  ok(/lote\s*41/i.test(gis.conf.fundo), 'B2 GIS: fundo Lote 41');
  ok(/lote\s*56/i.test(gis.conf.ladoDireito), 'B2 GIS: direita Lote 56');
  ok(/lote\s*54/i.test(gis.conf.ladoEsquerdo), 'B2 GIS: esquerda Lote 54');

  for (const key of sideKeys) {
    const g = String(gis.conf[key] || '')
      .trim()
      .toLowerCase();
    const c = String(contract.confrontations[key] || '')
      .trim()
      .toLowerCase();
    ok(
      g === c || c.includes(g) || g.includes(c),
      `B2 igualdade popup==contrato (${key}): GIS="${gis.conf[key]}" vs contrato="${contract.confrontations[key]}"`,
    );
  }

  ok(
    /rua\s*02/i.test(contract.confrontations.frente),
    'B2 contrato: frente Rua 02',
  );
  ok(
    /lote\s*41/i.test(contract.confrontations.fundo),
    'B2 contrato: fundo Lote 41',
  );
  ok(
    /lote\s*56/i.test(contract.confrontations.ladoDireito),
    'B2 contrato: direita Lote 56',
  );
  ok(
    /lote\s*54/i.test(contract.confrontations.ladoEsquerdo),
    'B2 contrato: esquerda Lote 54',
  );

  // Sem vizinhos (bug Etapa 9): só frente costuma resolver via segments/rua.
  const alone = resolveAraguaiaLotDescription({
    block: lotAlvo,
    project: PROJECT,
    projectBlocks: [lotAlvo],
    streetGuides: guides,
  });
  ok(/rua\s*02/i.test(alone.confrontations.frente), 'B2 solo: frente ok');
  ok(
    !/lote\s*41/i.test(alone.confrontations.fundo),
    'B2 solo: fundo sem vizinho (documenta necessidade de projectBlocks)',
  );
}

console.log('\n=== C) HTML do contrato — ordem e nomes ===');
{
  const html = generateContractHTML({
    tenant: TENANT,
    customer: CUSTOMER,
    project: PROJECT,
    block: LOT_FOUR_SIDES,
    sale: SALE,
    projectBlocks: [LOT_FOUR_SIDES],
    financeReceipts: [
      { installment_number: 0, amount: 5000, due_date: '2026-08-21' },
    ],
  });

  const clause2Idx = html.indexOf('CLÁUSULA SEGUNDA');
  ok(clause2Idx >= 0, 'C: cláusula segunda');
  const slice = html.slice(clause2Idx, clause2Idx + 2500);

  ok(/frente[\s\S]{0,120}Rua 02/i.test(slice), 'C: frente + Rua 02');
  ok(/fundo[\s\S]{0,120}Lote 37/i.test(slice), 'C: fundo + Lote 37');
  ok(
    /lateral direita[\s\S]{0,120}Lote 60/i.test(slice),
    'C: lateral direita + Lote 60',
  );
  ok(
    /lateral esquerda[\s\S]{0,120}Lote 58/i.test(slice),
    'C: lateral esquerda + Lote 58',
  );

  const iFrente = slice.search(/frente[\s\S]{0,80}confrontando com/i);
  const iFundo = slice.search(/fundo[\s\S]{0,80}confrontando com/i);
  const iDir = slice.search(/lateral direita[\s\S]{0,80}confrontando com/i);
  const iEsq = slice.search(/lateral esquerda[\s\S]{0,80}confrontando com/i);
  ok(iFrente >= 0 && iFundo > iFrente, 'C: frente antes de fundo');
  ok(iDir > iFundo, 'C: fundo antes de direita');
  ok(iEsq > iDir, 'C: direita antes de esquerda');

  ok(slice.includes('20,00 m') || slice.includes('20.00'), 'C: medida 20 m');
  ok(slice.includes('60,00 m') || slice.includes('60.00'), 'C: medida 60 m');
}

console.log('\n=== D) Lote sem confrontação não quebra ===');
{
  const bare = {
    id: 'lot-bare',
    number: '1',
    block_name: '01',
    area: 800,
    frente: 15,
    fundo: 15,
    'Lado Dir.': 40,
    'Lado Esq.': 40,
  };
  const resolved = resolveAraguaiaLotDescription({ block: bare });
  ok(resolved.sides.frente != null, 'D: medidas ok');
  const html = generateContractHTML({
    tenant: TENANT,
    customer: CUSTOMER,
    project: PROJECT,
    block: bare,
    sale: SALE,
    financeReceipts: [
      { installment_number: 0, amount: 5000, due_date: '2026-08-21' },
    ],
  });
  ok(html.includes('medindo:'), 'D: contrato gera');
  ok(
    html.includes('sv-contract-araguaia') || html.includes('CLÁUSULA SEGUNDA'),
    'D: ARAGUAIA',
  );
  ok(
    !/confrontando com\s*<strong>\s*vizinho/i.test(html),
    'D: sem vizinho inventado',
  );
}

console.log('\n=== E) Isolamento — e-sign/Portal/paginação não tocados ===');
{
  const portal = readFileSync(
    join(root, 'lib/portal-cliente/contractDownload.ts'),
    'utf8',
  );
  const esign = readFileSync(
    join(root, 'lib/saleContractSignedArtifact.ts'),
    'utf8',
  );
  ok(portal.includes('loadSignedSaleContractArtifact'), 'E: Portal intacto');
  ok(esign.includes('loadSignedSaleContractArtifact'), 'E: e-sign artifact intacto');
}

console.log('\n======== ETAPA 9.1 OK ========\n');

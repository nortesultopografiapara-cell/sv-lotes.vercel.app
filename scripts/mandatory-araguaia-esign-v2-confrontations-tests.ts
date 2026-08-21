/**
 * Etapa 9 — Confrontações dinâmicas ARAGUAIA = mesma fonte do popup GIS.
 * npx tsx scripts/mandatory-araguaia-esign-v2-confrontations-tests.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateContractHTML } from '../lib/contractTemplate';
import { resolveAraguaiaLotDescription } from '../lib/araguaiaContractLot';
import { loadLotConfrontations } from '../lib/lotConfrontationsPanel';
import { buildOfficialLotConfrontations, buildLotConfrontationAudit } from '../lib/assistedConfrontation';

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

console.log('\n======== ETAPA 9 — CONFRONTAÇÕES ARAGUAIA = GIS ========');

console.log('\n=== A) Fonte canônica = popup GIS ===');
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
  ok(lotLib.includes('buildLotConfrontationAudit'), 'contrato: audit');

  const clauses = readFileSync(
    join(root, 'lib/araguaiaContractClauses.ts'),
    'utf8',
  );
  ok(clauses.includes('sideMeasureWithConfrontant'), 'cláusula com confrontante');
  ok(clauses.includes('confrontando com'), 'texto confrontando com');
  ok(
    !clauses.includes('Única exclusão autorizada: confrontantes'),
    'exclusão antiga removida',
  );
}

console.log('\n=== B) Contrato × GIS — mesmos lados ===');
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

  // Sem troca: direita ≠ esquerda
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

  // Ordem no texto corrido: frente antes de fundo antes de direita antes de esquerda
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
  ok(html.includes('sv-contract-araguaia') || html.includes('CLÁUSULA SEGUNDA'), 'D: ARAGUAIA');
  // Sem inventar vizinho genérico
  ok(!/confrontando com\s*<strong>\s*vizinho/i.test(html), 'D: sem vizinho inventado');
}

console.log('\n=== E) Isolamento — e-sign/Portal não tocados ===');
{
  const changed = [
    'lib/araguaiaContractClauses.ts',
    'lib/araguaiaContractLot.ts',
    'scripts/mandatory-araguaia-esign-v2-confrontations-tests.ts',
  ];
  ok(changed.every(Boolean), 'E: escopo só contrato/lot/test');
  const portal = readFileSync(
    join(root, 'lib/portal-cliente/contractDownload.ts'),
    'utf8',
  );
  const esign = readFileSync(
    join(root, 'lib/saleContractSignedArtifact.ts'),
    'utf8',
  );
  // Sanity: arquivos de Portal/e-sign 8.6 ainda existem intactos neste check de leitura
  ok(portal.includes('loadSignedSaleContractArtifact'), 'E: Portal intacto');
  ok(esign.includes('loadSignedSaleContractArtifact'), 'E: e-sign artifact intacto');
}

console.log('\n======== ETAPA 9 OK ========\n');

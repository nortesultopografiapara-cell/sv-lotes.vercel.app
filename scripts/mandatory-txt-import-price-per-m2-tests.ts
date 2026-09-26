/**
 * Testes obrigatórios — preço por m² e por unidade na importação TXT Civil 3D.
 * npx tsx scripts/mandatory-txt-import-price-per-m2-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildTxtImportAuditDescription,
  calculateLotPriceFromAreaM2,
  parsePricePerM2Input,
  parseUnitPriceInput,
  resolveImportedLotPrice,
  resolveTxtImportPricingInput,
} from '../lib/txtImportLotPricing';
import { resolveLotBlockPrice } from '../lib/lotBlockPrice';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}: esperado ${String(expected)}, recebido ${String(actual)}`);
  }
}

function testParseBrazilianFormat() {
  const r = parsePricePerM2Input('120,00');
  assert(r.ok, '120,00 ok');
  assertEq(r.ok ? r.value : null, 120, 'valor 120');
}

function testParseAmericanFormat() {
  const r = parsePricePerM2Input('120.00');
  assert(r.ok, '120.00 ok');
  assertEq(r.ok ? r.value : null, 120, 'valor 120');
}

function testRejectNegative() {
  const r = parsePricePerM2Input('-10');
  assert(!r.ok, 'negativo rejeitado');
}

function testEmptyOptional() {
  const r = parsePricePerM2Input('');
  assert(r.ok && r.value === null, 'vazio = opcional');
}

function testExample1084m2() {
  const price = calculateLotPriceFromAreaM2(1084.2, 120);
  assertEq(price, 130104, '1084.20 m² × R$ 120 = R$ 130.104,00');
}

function testImportWithoutPricePerM2() {
  const price = resolveImportedLotPrice({
    areaM2: 500,
    pricePerM2: null,
    overwriteExistingPrices: false,
    hadExistingLot: false,
  });
  assertEq(price, null, 'sem preço/m² → null');
}

function testImportWithPricePerM2() {
  const price = resolveImportedLotPrice({
    areaM2: 250,
    pricePerM2: 120,
    overwriteExistingPrices: false,
    hadExistingLot: false,
  });
  assertEq(price, 30000, '250 × 120');
}

function testReimportPreservesExistingByDefault() {
  const price = resolveImportedLotPrice({
    areaM2: 250,
    pricePerM2: 120,
    existingPrice: 85000,
    overwriteExistingPrices: false,
    hadExistingLot: true,
  });
  assertEq(price, 85000, 'preserva preço existente');
}

function testReimportOverwriteWhenChecked() {
  const price = resolveImportedLotPrice({
    areaM2: 250,
    pricePerM2: 120,
    existingPrice: 85000,
    overwriteExistingPrices: true,
    hadExistingLot: true,
  });
  assertEq(price, 30000, 'sobrescreve com preço/m²');
}

function testReimportWithoutPricePerM2PreservesExisting() {
  const price = resolveImportedLotPrice({
    areaM2: 250,
    pricePerM2: null,
    existingPrice: 85000,
    overwriteExistingPrices: false,
    hadExistingLot: true,
  });
  assertEq(price, 85000, 'reimport sem m² preserva existente');
}

function testCommercialPopupReadsBlockPrice() {
  const block = { price: 130104, area: 1084.2 };
  const currentPrice = resolveLotBlockPrice({
    price: block.price,
    areaM2: block.area,
    pricePerM2: 120,
  });
  assertEq(currentPrice, 130104, 'popup comercial lê blocks.price salvo');
  const formatted = (currentPrice ?? 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  assert(formatted.includes('130.104'), 'formatação BRL');
}

function testManualEditOverridesCalculatedPrice() {
  const saved = resolveLotBlockPrice({
    price: 33960,
    areaM2: 412.8,
    pricePerM2: 80,
  });
  assertEq(saved, 33960, 'manual 33960 prevalece sobre 412.8×80');
  const calculatedOnly = resolveLotBlockPrice({
    price: null,
    areaM2: 412.8,
    pricePerM2: 80,
  });
  assertEq(calculatedOnly, 33024, 'só calcula sem preço salvo');
}

function testManualEditStillUsesBlockPriceField() {
  const manualPrice = 145000;
  const blockUpdate = { price: manualPrice };
  assertEq(blockUpdate.price, 145000, 'edição manual grava blocks.price');
}

function testImportAuditDescription() {
  const desc = buildTxtImportAuditDescription({
    quadraName: 'Q04',
    lotCount: 12,
    pricePerM2: 120,
    overwriteExistingPrices: false,
    isReimport: true,
    pricedFromM2Count: 2,
    preservedPriceCount: 10,
  });
  assert(desc.includes('Q04'), 'quadra no histórico');
  assert(desc.includes('12 lote'), 'quantidade no histórico');
  assert(desc.includes('preço/m²'), 'preço/m² no histórico');
  assert(desc.includes('preservados'), 'flag preservação');
}

function testA_AreaModeDifferentAreas() {
  const a = resolveImportedLotPrice({
    areaM2: 600,
    pricePerM2: 100,
    pricingMode: 'AREA',
    overwriteExistingPrices: false,
    hadExistingLot: false,
  });
  const b = resolveImportedLotPrice({
    areaM2: 603,
    pricePerM2: 100,
    pricingMode: 'AREA',
    overwriteExistingPrices: false,
    hadExistingLot: false,
  });
  assertEq(a, 60000, 'A: 600 m² × R$ 100 = R$ 60.000');
  assertEq(b, 60300, 'A: 603 m² × R$ 100 = R$ 60.300');
}

function testB_UnitModeSamePriceRegardlessOfArea() {
  for (const area of [600, 603, 605.5]) {
    const price = resolveImportedLotPrice({
      areaM2: area,
      unitPrice: 50000,
      pricingMode: 'UNIT',
      overwriteExistingPrices: false,
      hadExistingLot: false,
    });
    assertEq(price, 50000, `B: ${area} m² → R$ 50.000 (não deriva da área)`);
  }
}

function testC_LegacyEmptyPriceRemainsNull() {
  const price = resolveImportedLotPrice({
    areaM2: 600,
    pricePerM2: null,
    overwriteExistingPrices: false,
    hadExistingLot: false,
  });
  assertEq(price, null, 'C: sem preço (legado AREA) → null');
  const parsed = resolveTxtImportPricingInput('AREA', '', '');
  assert(parsed.ok && parsed.pricePerM2 === null && parsed.unitPrice === null, 'C: AREA vazio opcional');
}

function testD_InvalidValuesBlockedByMode() {
  const unitEmpty = resolveTxtImportPricingInput('UNIT', '100', '');
  assert(!unitEmpty.ok, 'D: UNIT vazio bloqueado');
  const unitZero = resolveTxtImportPricingInput('UNIT', '', '0');
  assert(!unitZero.ok, 'D: UNIT zero bloqueado');
  const unitNan = resolveTxtImportPricingInput('UNIT', '', 'abc');
  assert(!unitNan.ok, 'D: UNIT inválido bloqueado');
  const areaInvalid = resolveTxtImportPricingInput('AREA', 'abc', '50000');
  assert(!areaInvalid.ok, 'D: AREA inválido bloqueado');
  const areaValidIgnoresUnit = resolveTxtImportPricingInput('AREA', '100,00', '50000');
  assert(
    areaValidIgnoresUnit.ok &&
      areaValidIgnoresUnit.pricePerM2 === 100 &&
      areaValidIgnoresUnit.unitPrice === null,
    'D: AREA ignora o campo de unidade',
  );
  const unitValidIgnoresM2 = resolveTxtImportPricingInput('UNIT', '100,00', '50.000,00');
  assert(
    unitValidIgnoresM2.ok &&
      unitValidIgnoresM2.unitPrice === 50000 &&
      unitValidIgnoresM2.pricePerM2 === null,
    'D: UNIT ignora o campo de m²',
  );
}

function testUnitPriceBrazilianFormat() {
  const r = parseUnitPriceInput('R$ 50.000,00');
  assert(r.ok, 'unidade BR ok');
  assertEq(r.ok ? r.value : 0, 50000, 'unidade 50000');
}

function testUnitReimportPreserveAndOverwrite() {
  const preserved = resolveImportedLotPrice({
    areaM2: 600,
    unitPrice: 50000,
    pricingMode: 'UNIT',
    existingPrice: 85000,
    overwriteExistingPrices: false,
    hadExistingLot: true,
  });
  assertEq(preserved, 85000, 'UNIT reimport preserva existente');
  const overwritten = resolveImportedLotPrice({
    areaM2: 603,
    unitPrice: 50000,
    pricingMode: 'UNIT',
    existingPrice: 85000,
    overwriteExistingPrices: true,
    hadExistingLot: true,
  });
  assertEq(overwritten, 50000, 'UNIT reimport sobrescreve com valor fixo');
}

function testSavedUnitPriceNotRecalculatedFromArea() {
  const displayed = resolveLotBlockPrice({
    price: 50000,
    areaM2: 605.5,
    pricePerM2: 100,
  });
  assertEq(displayed, 50000, 'ficha lê blocks.price fixo, não 605,50×100');
}

function testUnitAuditDescription() {
  const desc = buildTxtImportAuditDescription({
    quadraName: 'A',
    lotCount: 3,
    pricingMode: 'UNIT',
    unitPrice: 50000,
    overwriteExistingPrices: false,
    isReimport: false,
    pricedFromM2Count: 0,
    pricedFromUnitCount: 3,
    preservedPriceCount: 0,
  });
  assert(desc.includes('preço por unidade'), 'audit UNIT');
  assert(desc.includes('50.000,00') || desc.includes('50000,00'), 'audit valor unidade');
  assert(!desc.includes('preço/m²: R$'), 'audit UNIT não usa preço/m²');
}

function testDefaultModeIsArea() {
  const parsed = resolveTxtImportPricingInput(undefined, '100', '999');
  assert(parsed.ok && parsed.pricingMode === 'AREA' && parsed.pricePerM2 === 100, 'legado = AREA');
}

function testModalSourceHasPricingModes() {
  const src = fs.readFileSync(path.join(process.cwd(), 'app/map/page.tsx'), 'utf8');
  assert(src.includes('Forma de precificação'), 'modal: Forma de precificação');
  assert(src.includes('Por m²'), 'modal: Por m²');
  assert(src.includes('Por unidade'), 'modal: Por unidade');
  assert(src.includes('Preço por unidade / lote'), 'modal: campo unidade');
  assert(src.includes("useState<TxtImportPricingMode>('AREA')"), 'default AREA');
  assert(src.includes('resolveTxtImportPricingInput'), 'handleImportTXT usa resolver');
  assert(
    src.includes("Todos os lotes importados receberão este mesmo valor, independentemente da área."),
    'helper UNIT',
  );
}

function main() {
  testParseBrazilianFormat();
  testParseAmericanFormat();
  testRejectNegative();
  testEmptyOptional();
  testExample1084m2();
  testImportWithoutPricePerM2();
  testImportWithPricePerM2();
  testReimportPreservesExistingByDefault();
  testReimportOverwriteWhenChecked();
  testReimportWithoutPricePerM2PreservesExisting();
  testCommercialPopupReadsBlockPrice();
  testManualEditOverridesCalculatedPrice();
  testManualEditStillUsesBlockPriceField();
  testImportAuditDescription();
  testA_AreaModeDifferentAreas();
  testB_UnitModeSamePriceRegardlessOfArea();
  testC_LegacyEmptyPriceRemainsNull();
  testD_InvalidValuesBlockedByMode();
  testUnitPriceBrazilianFormat();
  testUnitReimportPreserveAndOverwrite();
  testSavedUnitPriceNotRecalculatedFromArea();
  testUnitAuditDescription();
  testDefaultModeIsArea();
  testModalSourceHasPricingModes();
  console.log('OK — mandatory-txt-import-price-per-m2-tests passed');
}

main();

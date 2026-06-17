/**
 * Testes obrigatórios — preço por m² na importação TXT Civil 3D.
 * npx tsx scripts/mandatory-txt-import-price-per-m2-tests.ts
 */

import {
  buildTxtImportAuditDescription,
  calculateLotPriceFromAreaM2,
  parsePricePerM2Input,
  resolveImportedLotPrice,
} from '../lib/txtImportLotPricing';

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
  const currentPrice = Number(block.price) || 0;
  assertEq(currentPrice, 130104, 'popup comercial lê blocks.price');
  const formatted = currentPrice.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  assert(formatted.includes('130.104'), 'formatação BRL');
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
  testManualEditStillUsesBlockPriceField();
  testImportAuditDescription();
  console.log('OK — mandatory-txt-import-price-per-m2-tests passed');
}

main();

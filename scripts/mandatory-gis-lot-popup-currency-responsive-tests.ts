/**
 * Testes — moeda BRL e popup responsivo do lote no GIS.
 * npx tsx scripts/mandatory-gis-lot-popup-currency-responsive-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  formatCurrencyBRL,
  formatLotAuditDescription,
  parseCurrencyBRL,
} from '../lib/currencyBrl';
import {
  GIS_LOT_POPUP_CONTAINER_CLASS,
  GIS_LOT_POPUP_PRICE_INPUT_CLASS,
} from '../lib/gisLotPopupLayout';
import { buildTxtImportAuditDescription } from '../lib/txtImportLotPricing';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}: esperado ${String(expected)}, recebido ${String(actual)}`);
  }
}

function testFormat95286() {
  const formatted = formatCurrencyBRL(95286.4);
  assert(formatted.replace(/\u00a0/g, ' ').includes('R$ 95.286,40'), 'format 95286.4');
  assert(formatted.startsWith('R$'), 'prefixo R$');
}

function testParseFormatted() {
  assertEq(parseCurrencyBRL('R$ 95.286,40'), 95286.4, 'parse R$ 95.286,40');
}

function testParsePlainNumbers() {
  assertEq(parseCurrencyBRL('80000'), 80000, 'parse 80000');
  assertEq(parseCurrencyBRL('80.000,00'), 80000, 'parse 80.000,00');
}

function testRejectNegativeAndEmpty() {
  assertEq(parseCurrencyBRL('-100'), null, 'rejeita negativo');
  assertEq(parseCurrencyBRL(''), null, 'vazio vira null');
  assertEq(parseCurrencyBRL('   '), null, 'espaços vira null');
}

function testAuditHistoryFormatting() {
  const raw = 'R$ 95286,4 → R$ 80000';
  const formatted = formatLotAuditDescription(raw);
  assert(formatted.includes('95.286,40'), 'histórico formata origem');
  assert(formatted.includes('80.000,00'), 'histórico formata destino');
}

function testImportAuditCurrency() {
  const desc = buildTxtImportAuditDescription({
    quadraName: 'Q04',
    lotCount: 3,
    pricePerM2: 80,
    overwriteExistingPrices: false,
    isReimport: false,
    pricedFromM2Count: 3,
    preservedPriceCount: 0,
  });
  assert(desc.includes('R$ 80,00'), 'import audit preço/m² BRL');

  const importLine = formatLotAuditDescription(
    'Valor calculado: R$ 95286,4 (1.191,08 m² × R$ 80,00/m²)',
  );
  assert(importLine.includes('95.286,40'), 'import line valor calculado');
  assert(importLine.includes('80,00/m²'), 'import line preço m²');
}

function testPopupResponsiveClasses() {
  assert(
    GIS_LOT_POPUP_CONTAINER_CLASS.includes('w-[min(92vw,360px)]'),
    'mobile width',
  );
  assert(GIS_LOT_POPUP_CONTAINER_CLASS.includes('md:w-[420px]'), 'tablet width');
  assert(GIS_LOT_POPUP_CONTAINER_CLASS.includes('lg:w-[520px]'), 'desktop width');

  const gisMapPath = path.join(process.cwd(), 'components', 'map', 'GISMap.tsx');
  const source = fs.readFileSync(gisMapPath, 'utf8');
  assert(source.includes('GIS_LOT_POPUP_CONTAINER_CLASS'), 'GISMap usa container class');
  assert(source.includes('GIS_LOT_POPUP_PRICE_INPUT_CLASS'), 'GISMap usa input class');
  assert(source.includes('parseCurrencyBRL'), 'GISMap usa parseCurrencyBRL');
  assert(source.includes('type="text"'), 'input texto moeda');
  assert(GIS_LOT_POPUP_PRICE_INPUT_CLASS.includes('lg:w-40'), 'input desktop wider');
}

function testManualSaveUsesNumericPrice() {
  const parsed = parseCurrencyBRL('80.000,00');
  assertEq(parsed, 80000, 'save payload numérico');
  const blockUpdate = { price: parsed };
  assertEq(blockUpdate.price, 80000, 'blocks.price decimal');
}

function main() {
  testFormat95286();
  testParseFormatted();
  testParsePlainNumbers();
  testRejectNegativeAndEmpty();
  testAuditHistoryFormatting();
  testImportAuditCurrency();
  testPopupResponsiveClasses();
  testManualSaveUsesNumericPrice();
  console.log('OK — mandatory-gis-lot-popup-currency-responsive-tests passed');
}

main();

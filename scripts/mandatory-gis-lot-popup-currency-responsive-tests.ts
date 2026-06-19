/**
 * Testes — moeda BRL, preço manual e popup responsivo do lote no GIS.
 * npx tsx scripts/mandatory-gis-lot-popup-currency-responsive-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  commitCurrencyDraft,
  currencyDraftToParseable,
  extractCurrencyDraft,
  formatCurrencyDraftDisplay,
  formatCurrencyBRL,
  formatLotAuditDescription,
  maskCurrencyBRL,
  parseCurrencyBRL,
  parseCurrencyBRLNumber,
  parseCurrencyBR,
  serializeCurrencyBRL,
  valueToCurrencyDraft,
} from '../lib/currencyBrl';
import {
  GIS_LOT_POPUP_CONTAINER_CLASS,
  GIS_LOT_POPUP_PRICE_INPUT_CLASS,
} from '../lib/gisLotPopupLayout';
import {
  hasSavedLotPrice,
  normalizeSavedLotPrice,
  resolveLotBlockPrice,
} from '../lib/lotBlockPrice';
import { buildTxtImportAuditDescription } from '../lib/txtImportLotPricing';
import { canManageGisProject, isOwnerRole } from '../lib/rolePermissions';

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
  assertEq(parseCurrencyBR('R$ 33.960,00'), 33960, 'parseCurrencyBR alias');
}

function testParsePlainNumbers() {
  assertEq(parseCurrencyBRL('80000'), 80000, 'parse 80000');
  assertEq(parseCurrencyBRL('80.000,00'), 80000, 'parse 80.000,00');
  assertEq(parseCurrencyBRL('33960.00'), 33960, 'parse 33960.00');
  assertEq(parseCurrencyBRL('33.960,00'), 33960, 'parse 33.960,00');
}

function testRejectNegativeAndEmpty() {
  assertEq(parseCurrencyBRL('-100'), null, 'rejeita negativo');
  assertEq(parseCurrencyBRL(''), null, 'vazio vira null');
  assertEq(parseCurrencyBRL('   '), null, 'espaços vira null');
}

function testSavedPricePrecedence() {
  const calculated = resolveLotBlockPrice({
    price: 33045.53,
    areaM2: 412.8,
    pricePerM2: 80,
  });
  assertEq(calculated, 33045.53, 'preço salvo prevalece sobre m²');

  const manual = resolveLotBlockPrice({
    price: 33960,
    areaM2: 412.8,
    pricePerM2: 80,
  });
  assertEq(manual, 33960, 'preço manual salvo');

  const suggested = resolveLotBlockPrice({
    price: null,
    areaM2: 250,
    pricePerM2: 120,
  });
  assertEq(suggested, 30000, 'sugestão m² só sem preço salvo');

  assert(!hasSavedLotPrice(0), 'zero não é preço salvo');
  assert(hasSavedLotPrice(33960), '33960 é preço salvo');
  assertEq(normalizeSavedLotPrice(33045.53), 33045.53, 'normaliza salvo');
}

function testManualSaveFlow() {
  const parsed = parseCurrencyBRL('33.960,00');
  assertEq(parsed, 33960, 'digitação manual');
  const blockUpdate = { price: parsed };
  assertEq(blockUpdate.price, 33960, 'blocks.price decimal');

  const lotState = { id: 'lot-1', price: 33045.53 };
  const nextLot = { ...lotState, price: parsed ?? 0 };
  assertEq(nextLot.price, 33960, 'estado local após salvar');
}

function testOwnerCannotEditPrice() {
  assert(!canManageGisProject('OWNER'), 'OWNER não edita preço');
  assert(isOwnerRole('OWNER'), 'OWNER identificado');
  assert(canManageGisProject('ADMIN'), 'ADMIN edita preço');
  assert(canManageGisProject('SUPER_ADMIN'), 'SUPER_ADMIN edita preço');
}

function testAuditHistoryFormatting() {
  const raw = 'R$ 95286,4 → R$ 80000';
  const formatted = formatLotAuditDescription(raw);
  assert(formatted.includes('95.286,40'), 'histórico formata origem');
  assert(formatted.includes('80.000,00'), 'histórico formata destino');

  const manualChange = formatLotAuditDescription('R$ 33.045,53 → R$ 33.960,00');
  assert(manualChange.includes('33.045,53'), 'histórico origem manual');
  assert(manualChange.includes('33.960,00'), 'histórico destino manual');
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

function testMaskCurrencyBRL() {
  assert(
    maskCurrencyBRL('5000').replace(/\u00a0/g, ' ').includes('R$ 5.000,00'),
    'mask 5000',
  );
  assert(
    maskCurrencyBRL('1000').replace(/\u00a0/g, ' ').includes('R$ 1.000,00'),
    'mask 1000',
  );
  assert(
    maskCurrencyBRL('125000').replace(/\u00a0/g, ' ').includes('R$ 125.000,00'),
    'mask 125000',
  );
  assert(
    maskCurrencyBRL('1500,50').replace(/\u00a0/g, ' ').includes('R$ 1.500,50'),
    'mask 1500,50',
  );
  assertEq(parseCurrencyBRLNumber('R$ 5.000,00'), 5000, 'parse masked 5000');
  assertEq(serializeCurrencyBRL('R$ 5.000,00'), '5000', 'serialize masked');
}

function testContinuousTypingDoesNotLock() {
  let draft = '';
  for (const ch of '3500') {
    draft = extractCurrencyDraft(formatCurrencyDraftDisplay(draft) + ch);
  }
  assert(
    formatCurrencyDraftDisplay(draft).replace(/\u00a0/g, ' ').includes('R$ 3.500'),
    'digitar 3500 não trava em R$ 3,00',
  );
  assertEq(parseCurrencyBRLNumber(currencyDraftToParseable(draft)), 3500, 'parse 3500 durante digitação');
  const committed = commitCurrencyDraft(draft).replace(/\u00a0/g, ' ');
  assert(committed.includes('R$ 3.500,00'), 'blur 3500 → R$ 3.500,00');

  draft = extractCurrencyDraft('7');
  assert(
    formatCurrencyDraftDisplay(draft).replace(/\u00a0/g, ' ').includes('R$ 7'),
    '7 não vira R$ 7,00 durante digitação',
  );
  draft = extractCurrencyDraft(formatCurrencyDraftDisplay(draft) + '500');
  assertEq(parseCurrencyBRLNumber(currencyDraftToParseable(draft)), 7500, '7 + 500 → 7500');

  draft = extractCurrencyDraft('15830,48');
  assert(
    commitCurrencyDraft(draft).replace(/\u00a0/g, ' ').includes('R$ 15.830,48'),
    '15830,48',
  );

  draft = extractCurrencyDraft('1500.50');
  assert(
    commitCurrencyDraft(draft).replace(/\u00a0/g, ' ').includes('R$ 1.500,50'),
    '1500.50',
  );

  assertEq(valueToCurrencyDraft('R$ 5.500,00'), '5500', 'valueToCurrencyDraft inteiro');
}

function testCustomerLotFormUsesCurrencyInput() {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'components/map/CustomerLotFormModal.tsx'),
    'utf8',
  );
  assert(source.includes('CurrencyInput'), 'modal venda usa CurrencyInput');
  assert(source.includes('parseCurrencyBRLNumber'), 'modal venda parse unificado');
  assert(!source.includes('type="number"'), 'modal venda sem input number monetário');
  assert(
    fs.readFileSync(path.join(process.cwd(), 'components/ui/CurrencyInput.tsx'), 'utf8').includes('formatCurrencyDraftDisplay'),
    'CurrencyInput usa draft durante digitação',
  );
}

function testPopupResponsiveClasses() {
  assert(
    GIS_LOT_POPUP_CONTAINER_CLASS.includes('w-[min(92vw,360px)]'),
    'mobile width',
  );
  assert(GIS_LOT_POPUP_CONTAINER_CLASS.includes('md:w-[480px]'), 'notebook width');
  assert(GIS_LOT_POPUP_CONTAINER_CLASS.includes('lg:w-[520px]'), 'desktop width');
  assert(GIS_LOT_POPUP_CONTAINER_CLASS.includes('xl:w-[540px]'), 'desktop grande');

  const gisMapPath = path.join(process.cwd(), 'components', 'map', 'GISMap.tsx');
  const source = fs.readFileSync(gisMapPath, 'utf8');
  assert(source.includes('GIS_LOT_POPUP_CONTAINER_CLASS'), 'GISMap usa container class');
  assert(source.includes('GIS_LOT_POPUP_PRICE_INPUT_CLASS'), 'GISMap usa input class');
  assert(source.includes('priceDraft'), 'GISMap usa priceDraft controlado');
  assert(source.includes('GIS_LOT_PRICE_SAVE_START'), 'log save preço');
  assert(!source.includes('setPriceText'), 'não usa setPriceText legado');
  assert(
    !source.match(/useEffect\(\(\) => \{[\s\S]*?setPriceDraft[\s\S]*?\}, \[currentPrice/),
    'não reseta draft em currentPrice',
  );
  assert(source.includes('onMouseDown={(e) => e.preventDefault()}'), 'salvar sem blur');
  assert(source.includes('onPriceSaved'), 'GISMap usa onPriceSaved');
  assert(source.includes('handleLotPriceSaved'), 'GISMap atualiza estado local');
  assert(!source.includes('onAction(lot, lot.status, parsed'), 'save preço não chama onAction');
  assert(source.includes('canEditLotPrice'), 'GISMap restringe edição de preço');
  assert(source.includes('CurrencyInput'), 'GISMap usa CurrencyInput preço');
  assert(!source.includes('maskCurrencyBRL(e.target.value)'), 'GISMap não mascara a cada tecla');
  assert(GIS_LOT_POPUP_PRICE_INPUT_CLASS.includes('lg:w-40'), 'input desktop wider');
}

function main() {
  testFormat95286();
  testParseFormatted();
  testParsePlainNumbers();
  testRejectNegativeAndEmpty();
  testSavedPricePrecedence();
  testManualSaveFlow();
  testOwnerCannotEditPrice();
  testAuditHistoryFormatting();
  testImportAuditCurrency();
  testMaskCurrencyBRL();
  testContinuousTypingDoesNotLock();
  testCustomerLotFormUsesCurrencyInput();
  testPopupResponsiveClasses();
  console.log('OK — mandatory-gis-lot-popup-currency-responsive-tests passed');
}

main();

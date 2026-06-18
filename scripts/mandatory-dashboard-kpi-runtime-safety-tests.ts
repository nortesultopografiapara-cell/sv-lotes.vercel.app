/**
 * Segurança de runtime dos KPIs do dashboard.
 * npx tsx scripts/mandatory-dashboard-kpi-runtime-safety-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  coerceDashboardKpiNumber,
  formatDashboardKpiPrimaryValue,
  formatDashboardKpiSubtitle,
} from '../lib/dashboardKpiFormat';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testCoerceUndefinedNullNaN() {
  assert(coerceDashboardKpiNumber(undefined) === 0, 'undefined -> 0');
  assert(coerceDashboardKpiNumber(null) === 0, 'null -> 0');
  assert(coerceDashboardKpiNumber(NaN) === 0, 'NaN -> 0');
  assert(coerceDashboardKpiNumber('') === 0, 'empty string -> 0');
  console.log('OK testCoerceUndefinedNullNaN');
}

function testCoerceStringNumber() {
  assert(coerceDashboardKpiNumber('345') === 345, 'string 345');
  assert(coerceDashboardKpiNumber('1.234,56') === 1234.56, 'string pt-BR decimal');
  console.log('OK testCoerceStringNumber');
}

function testFormatCountNotCurrency() {
  assert(formatDashboardKpiPrimaryValue(undefined, false) === '0', 'undefined count');
  assert(formatDashboardKpiPrimaryValue(null, false) === '0', 'null count');
  assert(formatDashboardKpiPrimaryValue(NaN, false) === '0', 'NaN count');
  assert(formatDashboardKpiPrimaryValue('345', false) === '345', 'string count');
  assert(!formatDashboardKpiPrimaryValue(345, false).includes('R$'), 'sem R$');
  console.log('OK testFormatCountNotCurrency');
}

function testFormatCurrencySafe() {
  const value = formatDashboardKpiPrimaryValue(undefined, true);
  assert(value.includes('R$'), 'undefined currency has R$');
  assert(value.includes('0'), 'undefined currency zero');

  const parsed = formatDashboardKpiPrimaryValue('20185000', true);
  assert(parsed.includes('R$'), 'string currency R$');
  assert(parsed.includes('20.185.000') || parsed.includes('20185000'), parsed);
  console.log('OK testFormatCurrencySafe');
}

function testSubtitleResilience() {
  assert(formatDashboardKpiSubtitle(undefined) === '', 'subtitle undefined');
  assert(formatDashboardKpiSubtitle(null) === '', 'subtitle null');
  assert(
    formatDashboardKpiSubtitle('R$ 20.185.000,00') === 'R$ 20.185.000,00',
    'subtitle string currency',
  );
  assert(
    formatDashboardKpiSubtitle(3680000).includes('3.680.000'),
    'subtitle number as currency',
  );
  console.log('OK testSubtitleResilience');
}

function testDashboardPremiumUiImportsIcons() {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'components/dashboard/DashboardPremiumUI.tsx'),
    'utf8',
  );
  assert(
    source.includes("import { ArrowDownRight, ArrowUpRight, Loader2 } from 'lucide-react'"),
    'imports ArrowUpRight e ArrowDownRight',
  );
  assert(source.includes('coerceDashboardKpiNumber'), 'usa coerceDashboardKpiNumber');
  console.log('OK testDashboardPremiumUiImportsIcons');
}

function main() {
  testCoerceUndefinedNullNaN();
  testCoerceStringNumber();
  testFormatCountNotCurrency();
  testFormatCurrencySafe();
  testSubtitleResilience();
  testDashboardPremiumUiImportsIcons();
  console.log('OK — mandatory-dashboard-kpi-runtime-safety-tests passed');
}

main();

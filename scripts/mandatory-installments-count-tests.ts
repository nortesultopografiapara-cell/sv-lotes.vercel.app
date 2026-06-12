/**
 * SVL-CRM-028 — quantidade de parcelas na venda parcelada.
 * npx tsx scripts/mandatory-installments-count-tests.ts
 */

import {
  buildInstallmentsOptions,
  filterInstallmentsOptions,
  sanitizeInstallmentsInput,
  validateInstallmentsCount,
} from '../lib/installmentsCount';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testSanitizeAllowsEmpty() {
  assert(sanitizeInstallmentsInput('') === '', 'empty');
  assert(sanitizeInstallmentsInput('48a') === '48', 'digits only');
  console.log('OK testSanitizeAllowsEmpty');
}

function testValidateEmpty() {
  const result = validateInstallmentsCount('');
  assert(!result.valid, 'invalid');
  assert(result.message === 'Informe a quantidade de parcelas.', 'message');
  console.log('OK testValidateEmpty');
}

function testValidate48() {
  const result = validateInstallmentsCount('48');
  assert(result.valid, 'valid');
  assert(result.value === 48, 'value');
  console.log('OK testValidate48');
}

function testValidate160() {
  const result = validateInstallmentsCount('160');
  assert(result.valid, 'valid');
  assert(result.value === 160, 'value');
  console.log('OK testValidate160');
}

function testValidate161Blocked() {
  const result = validateInstallmentsCount('161');
  assert(!result.valid, 'invalid');
  assert(result.message === 'Quantidade máxima: 160 parcelas.', 'message');
  console.log('OK testValidate161Blocked');
}

function testValidateMinBlocked() {
  const result = validateInstallmentsCount('0');
  assert(!result.valid, 'invalid');
  assert(result.message === 'Quantidade mínima: 1 parcela.', 'message');
  console.log('OK testValidateMinBlocked');
}

function testOptionsRange() {
  const options = buildInstallmentsOptions();
  assert(options.length === 160, 'count');
  assert(options[0] === '1', 'first');
  assert(options[159] === '160', 'last');
  console.log('OK testOptionsRange');
}

function testFilterOptions() {
  const filtered = filterInstallmentsOptions('4');
  assert(filtered.includes('4'), 'exact');
  assert(filtered.includes('48'), 'prefix');
  assert(!filtered.includes('3'), 'no mismatch');
  console.log('OK testFilterOptions');
}

function main() {
  testSanitizeAllowsEmpty();
  testValidateEmpty();
  testValidate48();
  testValidate160();
  testValidate161Blocked();
  testValidateMinBlocked();
  testOptionsRange();
  testFilterOptions();
  console.log('mandatory-installments-count-tests: all passed');
}

main();

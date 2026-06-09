/**
 * Máscaras CPF/CNPJ e CEP — formulários cliente/venda.
 * npx tsx scripts/mandatory-input-mask-tests.ts
 */

import {
  formatCep,
  formatCpfCnpj,
  matchesCep,
  matchesCpfCnpj,
  normalizeCep,
  normalizeCpfCnpj,
  onlyDigits,
} from '../lib/inputMasks';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testOnlyDigits() {
  assert(onlyDigits('12a.3b4-5') === '12345', 'onlyDigits');
  console.log('OK testOnlyDigits');
}

function testFormatCpf() {
  assert(formatCpfCnpj('12551515500') === '125.515.155-00', 'CPF 12551515500');
  assert(formatCpfCnpj('01634822990') === '016.348.229-90', 'CPF 01634822990');
  assert(formatCpfCnpj('123') === '123', 'CPF parcial');
  console.log('OK testFormatCpf');
}

function testFormatCnpj() {
  assert(
    formatCpfCnpj('12345678000199') === '12.345.678/0001-99',
    'CNPJ 12345678000199',
  );
  console.log('OK testFormatCnpj');
}

function testFormatCpfCnpjAlreadyMasked() {
  const masked = '125.515.155-00';
  assert(formatCpfCnpj(masked) === masked, 'não duplica máscara CPF');
  const cnpjMasked = '12.345.678/0001-99';
  assert(formatCpfCnpj(cnpjMasked) === cnpjMasked, 'não duplica máscara CNPJ');
  console.log('OK testFormatCpfCnpjAlreadyMasked');
}

function testFormatCpfCnpjLimit14() {
  assert(
    formatCpfCnpj('1234567800019912345') === '12.345.678/0001-99',
    'limita 14 dígitos',
  );
  assert(normalizeCpfCnpj('1234567800019912345').length === 14, 'normalize 14');
  console.log('OK testFormatCpfCnpjLimit14');
}

function testMatchesCpfCnpjSearch() {
  assert(
    matchesCpfCnpj('12551515500', '125.515.155-00'),
    'busca sem máscara × mascarado',
  );
  assert(
    matchesCpfCnpj('125.515.155-00', '12551515500'),
    'busca mascarado × sem máscara',
  );
  assert(matchesCpfCnpj('125515', '125.515.155-00'), 'busca parcial');
  assert(!matchesCpfCnpj('999', '125.515.155-00'), 'sem match falso');
  console.log('OK testMatchesCpfCnpjSearch');
}

function testFormatCep() {
  assert(formatCep('68515000') === '68.515-000', 'CEP 68515000');
  assert(formatCep('68.515-000') === '68.515-000', 'CEP já mascarado');
  assert(formatCep('68515000123') === '68.515-000', 'CEP limita 8 dígitos');
  assert(normalizeCep('68.515-000') === '68515000', 'normalize CEP');
  console.log('OK testFormatCep');
}

function testMatchesCepSearch() {
  assert(matchesCep('68515000', '68.515-000'), 'CEP sem máscara × mascarado');
  assert(matchesCep('68.515-000', '68515000'), 'CEP mascarado × bruto');
  assert(matchesCep('68515', '68.515-000'), 'CEP parcial');
  console.log('OK testMatchesCepSearch');
}

function main() {
  testOnlyDigits();
  testFormatCpf();
  testFormatCnpj();
  testFormatCpfCnpjAlreadyMasked();
  testFormatCpfCnpjLimit14();
  testMatchesCpfCnpjSearch();
  testFormatCep();
  testMatchesCepSearch();
  console.log('mandatory-input-mask-tests: all passed');
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}

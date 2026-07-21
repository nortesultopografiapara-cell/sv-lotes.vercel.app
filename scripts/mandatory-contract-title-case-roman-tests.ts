/**
 * Title Case de contratos — preserva numerais romanos (II ≠ Ii).
 * npx tsx scripts/mandatory-contract-title-case-roman-tests.ts
 */
import {
  isRomanNumeralToken,
  toContractTitleCase,
} from '../lib/contractTitleCase';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testRomanTokens() {
  for (const n of ['I', 'II', 'III', 'IV', 'V', 'X', 'XV', 'XX', 'xxx']) {
    assert(isRomanNumeralToken(n), `token ${n}`);
  }
  assert(!isRomanNumeralToken('Mario'), 'Mario não é romano');
  assert(!isRomanNumeralToken('Covas'), 'Covas não é romano');
  assert(!isRomanNumeralToken('mix'), 'mix não está na whitelist I–XXX');
  console.log('OK testRomanTokens');
}

function testRecantoAddressCase() {
  const input = 'CONDOMÍNIO RESIDENCIAL MÁRIO COVAS II S/N';
  const out = toContractTitleCase(input);
  assert(out.includes('II'), `II preservado: got "${out}"`);
  assert(!/\bIi\b/.test(out), `não deve gerar Ii: got "${out}"`);
  assert(out.includes('S/N'), `S/N preservado: got "${out}"`);
  assert(
    out === 'Condomínio Residencial Mário Covas II S/N',
    `formato esperado, got "${out}"`,
  );
  console.log('OK testRecantoAddressCase');
}

function testOtherRomansInText() {
  assert(
    toContractTitleCase('QUADRA IV LOTE X') === 'Quadra IV Lote X',
    'IV e X',
  );
  assert(
    toContractTitleCase('fase iii do projeto') === 'Fase III Do Projeto',
    'III',
  );
  console.log('OK testOtherRomansInText');
}

function testEmpty() {
  assert(toContractTitleCase('') === '', 'vazio');
  console.log('OK testEmpty');
}

function testWiredInRecantoContext() {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const root = path.resolve(__dirname, '..');
  const ctx = fs.readFileSync(
    path.join(root, 'lib/recantoPrimaveraContractContext.ts'),
    'utf8',
  );
  assert(ctx.includes('toContractTitleCase'), 'Recanto usa helper compartilhado');
  assert(
    !ctx.includes(".replace(/(?:^|\\s)\\S/g, (a) => a.toUpperCase())"),
    'Recanto não mantém toTitleCase local sem romano',
  );
  console.log('OK testWiredInRecantoContext');
}

function main() {
  testRomanTokens();
  testRecantoAddressCase();
  testOtherRomansInText();
  testEmpty();
  testWiredInRecantoContext();
  console.log('mandatory-contract-title-case-roman-tests: OK');
}

main();

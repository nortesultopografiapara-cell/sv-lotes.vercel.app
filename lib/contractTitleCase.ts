/**
 * Title Case para textos de contrato, preservando numerais romanos em maiúsculas.
 * Ex.: "MÁRIO COVAS II" → "Mário Covas II" (nunca "Ii").
 */

const ROMAN_NUMERAL_TOKENS = new Set([
  'i',
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'vii',
  'viii',
  'ix',
  'x',
  'xi',
  'xii',
  'xiii',
  'xiv',
  'xv',
  'xvi',
  'xvii',
  'xviii',
  'xix',
  'xx',
  'xxi',
  'xxii',
  'xxiii',
  'xxiv',
  'xxv',
  'xxvi',
  'xxvii',
  'xxviii',
  'xxix',
  'xxx',
]);

/** Token alfabético puro que é numeral romano (I–XXX). */
export function isRomanNumeralToken(token: string): boolean {
  const core = String(token || '')
    .trim()
    .toLowerCase();
  return ROMAN_NUMERAL_TOKENS.has(core);
}

/**
 * Mesma regra histórica de Title Case dos contratos + S/N,
 * com restauração de numerais romanos em maiúsculas.
 */
export function toContractTitleCase(str: string): string {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase())
    .replace(/\bS\/n\b/g, 'S/N')
    .replace(/\b([ivxlcdm]+)\b/gi, (word) =>
      isRomanNumeralToken(word) ? word.toUpperCase() : word,
    );
}

/**
 * Normalização de texto para fontes padrão do jsPDF (Helvetica / WinAnsi).
 * Preserva acentos portugueses; substitui símbolos Unicode fora do WinAnsi.
 */

/** Fórmulas canônicas da memória de cálculo (compatíveis com Helvetica). */
export const QUOTE_PDF_MEMORIAL_FORMULA_LINES = [
  'Subtotal do item = Quantidade × Valor unitário',
  'BDI = Subtotal × BDI%',
  'Total com BDI = Subtotal + BDI',
  'Desconto = Total com BDI × Desconto%',
  'Total geral = Total com BDI - Desconto',
] as const;

/**
 * Sanitiza texto destinado a doc.text / autoTable com fonte Helvetica (WinAnsi).
 * Não altera significado técnico; apenas glifos incompatíveis.
 */
export function sanitizeQuotePdfText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return (
    String(value)
      .normalize('NFKC')
      // Minusculas tipográficas / traços → ASCII
      .replace(/\u2212/g, '-') // − MINUS SIGN
      .replace(/\u2013/g, '-') // – EN DASH
      .replace(/\u2014/g, '-') // — EM DASH
      .replace(/\u2015/g, '-') // ― HORIZONTAL BAR
      .replace(/\u00AD/g, '') // soft hyphen
      // Aspas tipográficas → ASCII
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      // Outros símbolos comuns fora do WinAnsi seguro
      .replace(/\u2026/g, '...') // …
      .replace(/\u2022/g, '-') // •
      .replace(/\u2713|\u2714|\u2715|\u2716|\u2717|\u2718/g, '-') // ✓ ✗ etc.
      .replace(/\u2192/g, '->') // →
      .replace(/\u21D2/g, '=>') // ⇒
      .replace(/\u00A0/g, ' ') // NBSP
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width / BOM
      // Controles (mantém \n e \t)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
  );
}

/** True se ainda houver caractere de controle ou minus tipográfico residual. */
export function quotePdfTextHasInvalidChars(text: string): boolean {
  const s = String(text || '');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s)) return true;
  if (/[\u2212\u2013\u2014\u2015]/.test(s)) return true;
  if (/[\u200B-\u200D\uFEFF]/.test(s)) return true;
  return false;
}

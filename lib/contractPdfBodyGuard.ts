/**
 * Detecta PDF de contrato sem corpo (só chrome) — regressão html2pdf off-screen.
 */

export function countPdfPagesRough(pdfBytes: Uint8Array): number {
  const raw = Buffer.from(pdfBytes).toString('latin1');
  const matches = raw.match(/\/Type\s*\/Page[^s]/g);
  return matches?.length ?? 0;
}

/** Texto bruto embutido no PDF (latin1) — suficiente para marcadores ASCII. */
export function extractPdfLatin1Text(pdfBytes: Uint8Array): string {
  return Buffer.from(pdfBytes).toString('latin1');
}

export type ContractPdfBodyCheckInput = {
  pdfBytes: Uint8Array;
  contractNumber?: string | null;
  buyerName?: string | null;
  minPages?: number;
  minTextChars?: number;
  /** PDFs Chromium costumam comprimir texto — use tamanho mínimo do arquivo. */
  minBytes?: number;
};

export type ContractPdfBodyCheckResult = {
  ok: boolean;
  pageCount: number;
  textLength: number;
  byteLength: number;
  hasContractNumber: boolean;
  hasBuyerHint: boolean;
  hasClauseHint: boolean;
  hasSignatureHint: boolean;
  chromeOnlyLikely: boolean;
  failures: string[];
};

/**
 * Valida que o PDF final não é só cabeçalho/rodapé.
 * Deve ser usado no buffer produzido pelo mesmo fluxo de download.
 */
export function analyzeContractPdfBody(
  input: ContractPdfBodyCheckInput,
): ContractPdfBodyCheckResult {
  const text = extractPdfLatin1Text(input.pdfBytes);
  const pageCount = countPdfPagesRough(input.pdfBytes);
  const byteLength = input.pdfBytes.byteLength;
  const failures: string[] = [];
  const minPages = input.minPages ?? 2;
  const minTextChars = input.minTextChars ?? 800;
  const minBytes = input.minBytes ?? 20_000;

  const hasContractNumber = input.contractNumber
    ? text.includes(String(input.contractNumber).slice(0, 9)) ||
      text.includes(String(input.contractNumber))
    : /000000\d{3}\/\d{4}/.test(text) || /Contrato/i.test(text);

  const buyer = String(input.buyerName || '').trim();
  const hasBuyerHint = buyer
    ? text
        .toLowerCase()
        .includes(buyer.slice(0, Math.min(12, buyer.length)).toLowerCase())
    : /COMPRADOR|PROMISS/i.test(text);

  const hasClauseHint =
    /Cl.?.?usula|CLAUSULA|PROMITENTE|instrumento|compromisso|Par.?.?grafo/i.test(
      text,
    );
  const hasSignatureHint =
    /TESTEMUNHA|VENDEDOR|COMPRADOR|assinam|ASSINATURA/i.test(text);

  // Sintoma da regressão html2pdf off-screen: 1 página + arquivo pequeno + só chrome.
  const chromeOnlyLikely =
    pageCount <= 1 &&
    byteLength < minBytes &&
    text.length < minTextChars &&
    !hasClauseHint;

  if (pageCount < minPages) {
    failures.push(`páginas insuficientes (${pageCount} < ${minPages})`);
  }
  if (byteLength < minBytes) {
    failures.push(`PDF pequeno demais (${byteLength} < ${minBytes} bytes)`);
  }
  // Marcadores latin1 só exigidos quando o PDF parece texto não comprimido / curto.
  if (byteLength < minBytes * 2 && !hasClauseHint && pageCount <= 1) {
    failures.push('sem trechos de cláusulas no PDF');
  }
  if (chromeOnlyLikely) {
    failures.push('PDF parece só chrome (cabeçalho/rodapé)');
  }
  if (input.contractNumber && pageCount <= 1 && !hasContractNumber) {
    failures.push('número do contrato ausente no PDF de 1 página');
  }

  return {
    ok: failures.length === 0,
    pageCount,
    textLength: text.length,
    byteLength,
    hasContractNumber,
    hasBuyerHint,
    hasClauseHint,
    hasSignatureHint,
    chromeOnlyLikely,
    failures,
  };
}

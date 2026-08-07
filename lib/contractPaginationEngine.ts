/**
 * Engine única de paginação/renderização de contratos SV LOTES.
 *
 * Todos os modelos (Meneses, Padrão, Recanto, SV LOTES 2.0 e futuros)
 * devem herdar estas regras — sem duplicar lógica por template.
 *
 * Princípios:
 * 1. Bloco de assinaturas (vendedor + comprador + cônjuge + testemunhas) é indivisível.
 * 2. Certificado digital permanece íntegro (hash/token/QR); só a posição de página muda.
 * 3. Compactação leve de espaçamentos — sem alterar tipografia jurídica.
 * 4. Nova página só quando o bloco não cabe no espaço restante.
 */

/**
 * Margens Chromium/html2pdf alinhadas à altura real do header/footer template.
 * Se a margem for menor que o chrome, o texto invade e aparece “cortado”.
 */
export const CONTRACT_PDF_MARGIN_MM = {
  /** Reserva o chrome do headerTemplate (nome + CNPJ + endereço + linha). */
  top: 48,
  right: 15,
  /**
   * Rodapé global (linha + “Documento emitido…” + Página X de Y).
   * 28mm libera ~15px a mais de área útil vs 32mm, sem invadir o chrome.
   */
  bottom: 28,
  left: 15,
} as const;

/** Largura A4 em mm. */
export const CONTRACT_A4_WIDTH_MM = 210;

/**
 * Largura útil do conteúdo (A4 − margens laterais) em px @ 96dpi.
 * html2pdf/jsPDF aplicam as margens FORA do canvas — o HTML deve caber
 * nesta largura, senão o lado direito é cortado.
 */
export const CONTRACT_PDF_CONTENT_WIDTH_PX = Math.round(
  ((CONTRACT_A4_WIDTH_MM -
    CONTRACT_PDF_MARGIN_MM.left -
    CONTRACT_PDF_MARGIN_MM.right) /
    25.4) *
    96,
); // ~680px com laterais 15mm

/** Altura útil aproximada de uma página A4 com margens do PDF (mm → px @ 96dpi). */
export const CONTRACT_PAGE_CONTENT_HEIGHT_PX = Math.round(
  ((297 - CONTRACT_PDF_MARGIN_MM.top - CONTRACT_PDF_MARGIN_MM.bottom) / 25.4) *
    96,
); // ~837px com top 48 + bottom 28

/** Reserva mínima para não “espremer” o bloco no rodapé. */
export const CONTRACT_FOOTER_RESERVE_PX = 40;

/** Seletores canônicos — novos modelos devem reutilizar estes. */
export const CONTRACT_PAGINATION_SELECTORS = {
  signatureBlock: '.contract-signatures, .sv2-signatures',
  signatureSlot: '.signature-slot',
  certificateBlock: '.sv-cert-official-block',
  certificateUnit: '.sv-cert-official-inner, .sv-cert-official',
  documentRoots:
    '.sv-contract-document, .sv-contract-recanto-primavera, .sv-contract-sv-lotes-2',
} as const;

/**
 * CSS de largura segura para A4 — aplica aos roots informados.
 * Evita corte lateral no html2canvas / Chromium.
 */
export function buildContractA4WidthSafeCss(documentRoots: string): string {
  return `
  ${documentRoots} {
    box-sizing: border-box !important;
    width: 100% !important;
    max-width: 100% !important;
    /* 2px interno evita corte da borda direita de tabelas em width:100% */
    padding-left: 0 !important;
    padding-right: 2px !important;
    overflow-x: clip;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  ${documentRoots} *,
  ${documentRoots} *::before,
  ${documentRoots} *::after {
    box-sizing: border-box;
  }
  ${documentRoots} img,
  ${documentRoots} svg,
  ${documentRoots} canvas {
    max-width: 100% !important;
    height: auto;
  }
  ${documentRoots} table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse;
  }
  ${documentRoots} th,
  ${documentRoots} td {
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: normal !important;
    max-width: 100%;
  }
  ${documentRoots} p,
  ${documentRoots} h1,
  ${documentRoots} h2,
  ${documentRoots} h3,
  ${documentRoots} li {
    max-width: 100%;
    overflow-wrap: break-word;
  }
`.trim();
}

/** @deprecated prefer buildContractA4WidthSafeCss com roots isolados por modelo */
export const CONTRACT_A4_WIDTH_SAFE_CSS = buildContractA4WidthSafeCss(
  CONTRACT_PAGINATION_SELECTORS.documentRoots,
);

export type ContractPaginationDecision = 'same-page' | 'new-page';

/**
 * Decide se um bloco indivisível cabe no espaço restante da página.
 * Usado por testes e por pré-medição (Puppeteer / html2pdf).
 */
export function decideIndivisibleBlockPlacement(input: {
  remainingPx: number;
  blockHeightPx: number;
  footerReservePx?: number;
}): ContractPaginationDecision {
  const reserve = input.footerReservePx ?? CONTRACT_FOOTER_RESERVE_PX;
  const available = Math.max(0, input.remainingPx - reserve);
  if (input.blockHeightPx <= 0) return 'same-page';
  if (available <= 0) return 'new-page';
  return input.blockHeightPx <= available ? 'same-page' : 'new-page';
}

/**
 * Offset vertical dentro da página atual (fluxo contínuo → simulação A4).
 */
export function offsetWithinPagePx(
  contentTopPx: number,
  pageH: number = CONTRACT_PAGE_CONTENT_HEIGHT_PX,
): number {
  if (pageH <= 0) return 0;
  const t = Number(contentTopPx) || 0;
  return ((t % pageH) + pageH) % pageH;
}

export function remainingSpaceOnPagePx(
  contentTopPx: number,
  pageH: number = CONTRACT_PAGE_CONTENT_HEIGHT_PX,
): number {
  return Math.max(0, pageH - offsetWithinPagePx(contentTopPx, pageH));
}

/**
 * Medição contínua (y % PAGE_H) subestima o espaço real no PDF quando
 * quebras anteriores (`break-inside: avoid` em parágrafos/tabelas) deixam
 * folgas. Usar esse resto para forçar `page-break-before` nas assinaturas
 * gera página quase vazia (ex.: data na pág. N, assinaturas na N+1).
 *
 * Por isso o Chromium deve decidir o encaixe das assinaturas via
 * `page-break-inside: avoid` — só forçamos nova página se o bloco for
 * maior que a área útil de uma página inteira (impossível caber).
 */
export function decideSignaturePageBreakFromContinuousMeasure(input: {
  pageH?: number;
  footerReservePx?: number;
  signatureHeightPx?: number | null;
}): ContractPaginationDecision {
  const pageH = input.pageH ?? CONTRACT_PAGE_CONTENT_HEIGHT_PX;
  const footer = input.footerReservePx ?? CONTRACT_FOOTER_RESERVE_PX;
  const sigH = Math.max(0, Number(input.signatureHeightPx) || 0);
  if (sigH <= 0) return 'same-page';
  // Só força nova página se nem uma página vazia comportaria o bloco.
  const fullPageUsable = Math.max(0, pageH - footer);
  return sigH > fullPageUsable ? 'new-page' : 'same-page';
}

/**
 * Decisão inteligente: assinaturas e certificado são medidos em separado.
 * Nunca empurra o bloco de assinaturas para página nova só porque o certificado
 * não cabe depois — isso gerava páginas quase vazias.
 *
 * Assinaturas: NÃO usam o resto contínuo (y % PAGE_H) para force-break —
 * ver `decideSignaturePageBreakFromContinuousMeasure`.
 */
export function decideSignatureAndCertificatePlacement(input: {
  pageH?: number;
  footerReservePx?: number;
  /** Topo do bloco de assinaturas na página (0 = início da área útil). */
  signatureOffsetTopInPagePx?: number | null;
  signatureHeightPx?: number | null;
  /** Topo do certificado na página (fluxo contínuo), quando não há assinaturas. */
  certificateOffsetTopInPagePx?: number | null;
  certificateHeightPx?: number | null;
  /**
   * @deprecated Ignorado. Mantido só para compatibilidade de chamadas/testes.
   * Assinaturas não forçam quebra pelo offset contínuo.
   */
  trustContinuousSignatureOffset?: boolean;
}): {
  signature: ContractPaginationDecision;
  certificate: ContractPaginationDecision;
} {
  const pageH = input.pageH ?? CONTRACT_PAGE_CONTENT_HEIGHT_PX;
  const footer = input.footerReservePx ?? CONTRACT_FOOTER_RESERVE_PX;
  const sigH = Math.max(0, Number(input.signatureHeightPx) || 0);
  const certH = Math.max(0, Number(input.certificateHeightPx) || 0);
  const hasSig = sigH > 0 && input.signatureOffsetTopInPagePx != null;
  const hasCert = certH > 0;

  const signature = hasSig
    ? decideSignaturePageBreakFromContinuousMeasure({
        pageH,
        footerReservePx: footer,
        signatureHeightPx: sigH,
      })
    : 'same-page';

  let certificate: ContractPaginationDecision = 'same-page';
  if (hasCert) {
    let remainingForCert: number;
    if (hasSig) {
      if (signature === 'new-page') {
        // Assinaturas no topo da nova página; certificado segue na mesma folha se couber.
        remainingForCert = Math.max(0, pageH - sigH);
      } else {
        const offset = Number(input.signatureOffsetTopInPagePx) || 0;
        remainingForCert = Math.max(
          0,
          remainingSpaceOnPagePx(offset, pageH) - sigH,
        );
      }
    } else {
      remainingForCert = remainingSpaceOnPagePx(
        Number(input.certificateOffsetTopInPagePx) || 0,
        pageH,
      );
    }
    certificate = decideIndivisibleBlockPlacement({
      remainingPx: remainingForCert,
      blockHeightPx: certH,
      footerReservePx: footer,
    });
  }

  return { signature, certificate };
}

/**
 * Evita página quase vazia: se restam poucas linhas úteis após o conteúdo
 * anterior, força o próximo bloco indivisível a iniciar na página seguinte
 * apenas quando o aproveitamento seria pior (espaço restante < limiar).
 * Não usar para empurrar assinaturas que já cabem.
 */
export function shouldAvoidNearlyEmptyTail(input: {
  remainingPx: number;
  minUsefulPx?: number;
}): boolean {
  const minUseful = input.minUsefulPx ?? 120;
  return input.remainingPx > 0 && input.remainingPx < minUseful;
}

/** Espaçamentos compactos compartilhados (px / CSS). */
export const CONTRACT_SIGNATURE_SPACING = {
  blockMarginTopClassic: '4px',
  blockMarginTopRecanto: '12px',
  blockMarginTopSv2: '18px',
  slotMarginBottomClassic: '0',
  slotMarginBottomLast: '0',
  slotMarginBottomRecanto: '12px',
  slotMarginBottomRecantoLast: '4px',
  classicGridColumnGap: '12px',
  classicGridRowGap: '4px',
  sv2GridMarginTop: '16px',
  sv2GridGap: '14px',
  /** Inline Recanto (atributo style do slot). */
  recantoSlotInlineMarginBottom: '12px',
} as const;

/**
 * Assinaturas indivisíveis + compactação.
 * Seletores globais (sem root Recanto) — seguros no HTML Meneses/Padrão.
 */
export const CONTRACT_SIGNATURE_PAGINATION_CSS = `
  ${CONTRACT_PAGINATION_SELECTORS.signatureBlock} {
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
    page-break-after: auto !important;
    break-after: auto !important;
    margin-bottom: 0 !important;
    padding-bottom: 0 !important;
  }
  ${CONTRACT_PAGINATION_SELECTORS.signatureBlock}.sv-pagination-force-break {
    page-break-before: always !important;
    break-before: page !important;
  }
  /* Compactação genérica (detalhes Recanto ficam em CONTRACT_RECANTO_CLAUSE_FLOW_CSS). */
  ${CONTRACT_PAGINATION_SELECTORS.signatureBlock}.sv-pagination-compact {
    margin-top: 2px !important;
  }
  /* Clássico (MENESES/PADRAO): grade 2 colunas — não aplica ao Recanto. */
  .sv-contract-document .contract-signatures {
    margin-top: ${CONTRACT_SIGNATURE_SPACING.blockMarginTopClassic};
    text-align: center;
  }
  .sv-contract-document .contract-signatures .signature-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: ${CONTRACT_SIGNATURE_SPACING.classicGridColumnGap};
    row-gap: ${CONTRACT_SIGNATURE_SPACING.classicGridRowGap};
    align-items: start;
    grid-auto-rows: min-content;
    width: 100%;
  }
  .sv-contract-document .contract-signatures .signature-slot {
    margin-bottom: ${CONTRACT_SIGNATURE_SPACING.slotMarginBottomClassic};
    /* Quebra só no bloco pai — slots individuais não forçam página nova. */
    page-break-inside: auto;
    break-inside: auto;
    text-align: center;
    min-width: 0;
  }
  .sv-contract-document .contract-signatures .signature-slot p {
    margin: 0;
    line-height: 1.25;
  }
  .sv-contract-document .contract-signatures .signature-slot img {
    max-height: 32px !important;
    margin-bottom: 1px !important;
  }
  .sv-contract-document .contract-signatures .sv-esign-stamp {
    margin: 0 0 1px 0 !important;
    font-size: 7.5pt !important;
    line-height: 1.15 !important;
  }
  .sv-contract-document .contract-signatures .signature-line {
    border-top: 1px solid #111;
    margin: 0 auto 2px auto;
    width: 70%;
  }
  .sv-contract-document .contract-closing {
    margin-top: 2px !important;
    margin-bottom: 4px !important;
  }
  .sv-contract-document .contract-closing > p {
    margin-bottom: 3px !important;
  }
  .sv-contract-document .contract-closing .contract-closing-date {
    text-align: right;
    margin-bottom: 3px !important;
  }
  .sv-contract-document .contract-institutional-footer {
    margin-top: 6px !important;
    margin-bottom: 0 !important;
    padding-top: 4px;
    border-top: 1px solid #ccc;
    font-size: 8pt;
    color: #444;
    text-align: center;
    page-break-before: avoid;
    break-before: avoid-page;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .sv-contract-document .contract-institutional-footer p {
    margin: 0;
    line-height: 1.25;
  }
  .sv-contract-document .contract-institutional-footer p + p {
    margin-top: 1px;
  }
  .contract-signatures--recanto {
    margin-top: ${CONTRACT_SIGNATURE_SPACING.blockMarginTopRecanto};
    text-align: center;
  }
  .contract-signatures--recanto .signature-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: ${CONTRACT_SIGNATURE_SPACING.classicGridColumnGap};
    row-gap: ${CONTRACT_SIGNATURE_SPACING.slotMarginBottomRecanto};
    align-items: start;
    justify-items: center;
    width: 100%;
  }
  .contract-signatures--recanto .signature-slot {
    margin-bottom: 0;
    text-align: center;
    min-width: 0;
    width: 100%;
    page-break-inside: auto;
    break-inside: auto;
  }
  /* Linhas padronizadas — altura fixa cria o respiro sob a linha (estilo cartório). */
  .contract-signatures--recanto .signature-slot .signature-line,
  .contract-signatures--recanto .signature-line {
    border-top: 1px solid #111 !important;
    border-bottom: none !important;
    margin: 0 auto 0 auto !important;
    padding: 0 !important;
    width: 70% !important;
    max-width: 240px !important;
    height: 26px !important;
    box-sizing: border-box !important;
  }
  .contract-signatures--recanto .signature-slot > p {
    margin-left: 0 !important;
    margin-right: 0 !important;
    text-align: center !important;
    line-height: 1.35 !important;
  }
  .contract-signatures--recanto .signature-slot > p:first-of-type {
    margin-top: 4px !important;
    margin-bottom: 6px !important;
  }
  .contract-signatures--recanto .signature-slot > p + p {
    margin-top: 0 !important;
    margin-bottom: 4px !important;
  }
  .contract-signatures--recanto .signature-slot > p:last-of-type {
    margin-bottom: 0 !important;
  }
  .contract-signatures--recanto .signature-slot img {
    display: block;
    margin: 0 auto 4px auto;
    max-height: 36px;
  }
  /* Respiro entre CPF do comprador e linha do cônjuge */
  .contract-signatures--recanto .signature-slot-spouse {
    grid-column: 2;
    margin-top: 0 !important;
    padding-top: 12px !important;
  }
  .sv2-signatures {
    margin-top: ${CONTRACT_SIGNATURE_SPACING.blockMarginTopSv2};
  }
  .sv2-signatures-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: ${CONTRACT_SIGNATURE_SPACING.sv2GridGap};
    margin-top: ${CONTRACT_SIGNATURE_SPACING.sv2GridMarginTop};
  }
`.trim();

/**
 * Certificado: NÃO força página nova.
 * Quebra forçada só via `.sv-pagination-force-break` (medição Puppeteer).
 */
export const CONTRACT_CERTIFICATE_PAGINATION_CSS = `
  .sv-cert-official-block {
    display: block !important;
    width: 100%;
    overflow: hidden;
    margin-top: 4px !important;
    margin-bottom: 0 !important;
    page-break-before: auto !important;
    break-before: auto !important;
    /* Preferir evidências + certificado na mesma página das assinaturas. */
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
    -webkit-column-break-inside: avoid !important;
  }
  .sv-cert-official-block.sv-pagination-force-break {
    page-break-before: always !important;
    break-before: page !important;
  }
  .sv-cert-official-inner,
  .sv-cert-official,
  .sv-cert-official .sv-cert-cards,
  .sv-cert-official .sv-cert-validation,
  .sv-cert-official .sv-cert-validation-inner {
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
    -webkit-column-break-inside: avoid !important;
  }
  /* Cards individuais: não partir no meio; podem refluir em grade. */
  .sv-cert-official .sv-cert-card {
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
    -webkit-column-break-inside: avoid !important;
  }
`.trim();

/** Fluxo de cláusulas — Meneses / Padrão. */
export const CONTRACT_CLASSIC_CLAUSE_FLOW_CSS = `
  .sv-contract-document .contract-clause {
    page-break-inside: auto;
    break-inside: auto;
    margin-bottom: 16px;
    orphans: 3;
    widows: 3;
  }
  /* Parágrafos íntegros: evita 1ª/última linha sob cabeçalho/rodapé. */
  .sv-contract-document .contract-clause > p {
    page-break-inside: avoid;
    break-inside: avoid-page;
    orphans: 3;
    widows: 3;
  }
  .sv-contract-document .contract-clause--tight {
    margin-bottom: 12px;
  }
  .sv-contract-document .contract-title {
    text-align: center;
    margin-bottom: 18px;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .sv-contract-document .contract-preamble {
    page-break-inside: avoid;
    break-inside: avoid-page;
    margin-bottom: 14px;
  }
  .sv-contract-document .contract-payment-block,
  .sv-contract-document .contract-balloon-finance,
  .sv-contract-document .contract-balloon-only-table {
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  /* Fecho (local/data) + assinaturas: não partir a data entre páginas. */
  .sv-contract-document .contract-clause:has(+ .contract-signatures) {
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
    page-break-after: avoid;
    break-after: avoid-page;
    margin-bottom: 2px !important;
  }
  .sv-contract-document .contract-footer,
  .sv-contract-document .contract-institutional-footer {
    page-break-before: avoid;
    break-before: avoid-page;
    page-break-after: avoid !important;
    break-after: avoid-page !important;
  }
  .sv-contract-document .contract-footer {
    margin-top: 6px;
    margin-bottom: 0 !important;
    padding-bottom: 0 !important;
    border-top: 1px solid #ccc;
    padding-top: 4px;
    font-size: 8pt;
    color: #444;
    text-align: center;
  }
  .sv-contract-document > *:last-child {
    page-break-after: avoid !important;
    break-after: avoid-page !important;
    margin-bottom: 0 !important;
  }
`.trim();

/** Fluxo de cláusulas — Recanto. */
export const CONTRACT_RECANTO_CLAUSE_FLOW_CSS = `
  .sv-contract-recanto-primavera .contract-clause {
    page-break-inside: auto;
    break-inside: auto;
    margin-bottom: 10px;
  }
  .sv-contract-recanto-primavera p {
    page-break-inside: avoid;
    break-inside: avoid-page;
    orphans: 2;
    widows: 2;
  }
  .sv-contract-recanto-primavera .contract-payment-block,
  .sv-contract-recanto-primavera .contract-clause--electronic-signature {
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .sv-contract-recanto-primavera .contract-payment-block table,
  .sv-contract-recanto-primavera .contract-payment-block tr {
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .sv-contract-recanto-primavera > *:last-child {
    page-break-after: avoid !important;
    break-after: avoid-page !important;
    margin-bottom: 0 !important;
  }
  /* Compactação sob demanda (sv-pagination-compact) — vence inline/Recanto. */
  .contract-signatures--recanto.sv-pagination-compact .signature-grid {
    row-gap: 4px !important;
  }
  .contract-signatures--recanto.sv-pagination-compact .signature-slot-spouse {
    padding-top: 2px !important;
    margin-top: 0 !important;
  }
  .contract-signatures--recanto.sv-pagination-compact .signature-slot .signature-line,
  .contract-signatures--recanto.sv-pagination-compact .signature-line {
    height: 10px !important;
    padding: 0 !important;
    margin: 0 auto 0 auto !important;
  }
  .contract-signatures--recanto.sv-pagination-compact .signature-slot > p {
    margin-top: 1px !important;
    margin-bottom: 1px !important;
    line-height: 1.2 !important;
  }
  .contract-signatures--recanto.sv-pagination-compact .signature-slot > p:first-of-type {
    margin-top: 2px !important;
    margin-bottom: 2px !important;
  }
  .contract-signatures--recanto.sv-pagination-compact .signature-slot img {
    max-height: 28px !important;
    margin-bottom: 1px !important;
  }
  /* Cola fechamento/data ao bloco — evita página só com data. */
  .sv-contract-recanto-primavera .contract-closing {
    page-break-after: avoid !important;
    break-after: avoid-page !important;
  }
  .sv-contract-recanto-primavera .contract-signatures--recanto {
    page-break-before: avoid !important;
    break-before: avoid-page !important;
  }
`.trim();

/** Fluxo SV LOTES 2.0 — injetado no CSS clássico (template SV2 usa CONTRACT_PDF_PRINT_CSS). */
export const CONTRACT_SV2_CLAUSE_FLOW_CSS = `
  .sv-contract-sv-lotes-2 .sv2-clause {
    margin-bottom: 7px;
    page-break-inside: auto;
    break-inside: auto;
    orphans: 3;
    widows: 3;
  }
  .sv-contract-sv-lotes-2 > *:last-child {
    page-break-after: avoid !important;
    break-after: avoid-page !important;
    margin-bottom: 0 !important;
  }
`.trim();

/** @deprecated Prefer split classic/recanto/sv2 exports */
export const CONTRACT_CLAUSE_FLOW_CSS = `
${CONTRACT_CLASSIC_CLAUSE_FLOW_CSS}
${CONTRACT_RECANTO_CLAUSE_FLOW_CSS}
${CONTRACT_SV2_CLAUSE_FLOW_CSS}
`.trim();

/** CSS Meneses/Padrão — sem roots Recanto/SV2 (isolamento de modelos). */
export function buildClassicContractPaginationCss(): string {
  return `<style type="text/css">
${buildContractA4WidthSafeCss('.sv-contract-document')}
${CONTRACT_CLASSIC_CLAUSE_FLOW_CSS}
${CONTRACT_SIGNATURE_PAGINATION_CSS}
${CONTRACT_CERTIFICATE_PAGINATION_CSS}
</style>`;
}

/**
 * CSS completo para SV LOTES 2.0 (template embute CONTRACT_PDF_PRINT_CSS + isto via legal CSS).
 * Mantido na engine para novos modelos herdarem a mesma decisão.
 */
export function buildSv2ContractPaginationAddonCss(): string {
  return CONTRACT_SV2_CLAUSE_FLOW_CSS;
}

/** CSS Recanto — mesma engine de assinatura/certificado (sem roots SV2). */
export function buildRecantoContractPaginationCss(): string {
  return `<style type="text/css">
${buildContractA4WidthSafeCss('.sv-contract-document.sv-contract-recanto-primavera, .sv-contract-recanto-primavera')}
${CONTRACT_RECANTO_CLAUSE_FLOW_CSS}
${CONTRACT_SIGNATURE_PAGINATION_CSS}
${CONTRACT_CERTIFICATE_PAGINATION_CSS}
</style>`;
}

/**
 * Script de medição para Chromium (Puppeteer) e html2pdf (browser):
 * - Bloco de assinaturas: nova página só se a altura real não couber no restante.
 * - Certificado: decisão independente (nunca empurra assinaturas junto).
 * Não altera hash/token/QR — só classes de quebra.
 */
export const CONTRACT_PAGINATION_MEASURE_SCRIPT = `
(() => {
  const PAGE_H = ${CONTRACT_PAGE_CONTENT_HEIGHT_PX};
  const FOOTER = ${CONTRACT_FOOTER_RESERVE_PX};
  const root = document;
  const sig = root.querySelector('.contract-signatures, .sv2-signatures');
  const cert = root.querySelector('.sv-cert-official-block');
  if (sig) sig.classList.remove('sv-pagination-force-break');
  if (cert) cert.classList.remove('sv-pagination-force-break');

  const scrollY = window.scrollY || window.pageYOffset || 0;
  const pageOffset = (y) => {
    const t = Number(y) || 0;
    return ((t % PAGE_H) + PAGE_H) % PAGE_H;
  };
  const remainingAt = (y) => Math.max(0, PAGE_H - pageOffset(y));
  const decideBlock = (remaining, blockH) => {
    const available = Math.max(0, remaining - FOOTER);
    if (blockH <= 0) return 'same-page';
    if (available <= 0) return 'new-page';
    return blockH <= available ? 'same-page' : 'new-page';
  };
  // Resto contínuo para decidir compactação — sem reservar rodapé de novo
  // (PAGE_H já desconta a margem inferior do PDF).
  const decideContinuousTight = (remaining, blockH) => {
    const safety = 8;
    const available = Math.max(0, remaining - safety);
    if (blockH <= 0) return 'same-page';
    if (available <= 0) return 'new-page';
    return blockH <= available ? 'same-page' : 'new-page';
  };
  // Assinaturas: NÃO usar resto contínuo (y%PAGE_H) — subestima folgas do PDF.
  // Só force-break se o bloco for maior que uma página útil inteira.
  const decideSignature = (blockH) => {
    if (blockH <= 0) return 'same-page';
    const fullPageUsable = Math.max(0, PAGE_H - FOOTER);
    return blockH > fullPageUsable ? 'new-page' : 'same-page';
  };

  let signature = 'same-page';
  let certificate = 'same-page';
  let sigH = 0;
  let certH = 0;
  let remainingAtSig = PAGE_H;
  let continuousWouldForce = false;

  if (sig) {
    const rect = sig.getBoundingClientRect();
    sigH = Math.ceil(rect.height || 0);
    // Inclui rodapé institucional imediatamente seguinte (mesmo “fecho” visual).
    const next = sig.nextElementSibling;
    if (next && next.classList && next.classList.contains('contract-institutional-footer')) {
      sigH += Math.ceil(next.getBoundingClientRect().height || 0);
    }
    const top = rect.top + scrollY;
    remainingAtSig = remainingAt(top);
    continuousWouldForce = decideContinuousTight(remainingAtSig, sigH) === 'new-page';
    signature = decideSignature(sigH);
    if (signature === 'new-page') {
      sig.classList.add('sv-pagination-force-break');
    } else if (continuousWouldForce) {
      // Compacta e remede — objetivo: caber no resto real do Chromium.
      sig.classList.add('sv-pagination-compact');
      const rect2 = sig.getBoundingClientRect();
      sigH = Math.ceil(rect2.height || 0);
      const next2 = sig.nextElementSibling;
      if (next2 && next2.classList && next2.classList.contains('contract-institutional-footer')) {
        sigH += Math.ceil(next2.getBoundingClientRect().height || 0);
      }
      remainingAtSig = remainingAt(rect2.top + scrollY);
      continuousWouldForce = decideContinuousTight(remainingAtSig, sigH) === 'new-page';
    } else {
      sig.classList.remove('sv-pagination-compact');
    }
  }

  if (cert) {
    certH = Math.ceil(cert.getBoundingClientRect().height || 0);
    let remainingForCert = PAGE_H;
    if (sig) {
      if (signature === 'new-page') {
        remainingForCert = Math.max(0, PAGE_H - sigH);
      } else {
        remainingForCert = Math.max(0, remainingAtSig - sigH);
      }
    } else {
      const top = cert.getBoundingClientRect().top + scrollY;
      remainingForCert = remainingAt(top);
    }
    certificate = decideBlock(remainingForCert, certH);
    if (certificate === 'new-page') {
      cert.classList.add('sv-pagination-force-break');
    }
  }

  return {
    applied: true,
    signature,
    certificate,
    remainingAtSig,
    sigH,
    certH,
    continuousWouldForce,
    decision:
      signature === 'new-page'
        ? 'signature-new-page'
        : certificate === 'new-page'
          ? 'certificate-new-page'
          : 'same-page',
  };
})()
`;

/**
 * Aplica a medição de paginação em um elemento HTML já no DOM (html2pdf / preview).
 * Mesma regra do script Puppeteer — assinaturas e certificado independentes.
 */
export function applyContractPaginationBreaksToElement(
  element: ParentNode,
  opts?: { pageH?: number; footerReservePx?: number },
): {
  signature: ContractPaginationDecision;
  certificate: ContractPaginationDecision;
  sigH: number;
  certH: number;
} {
  const pageH = opts?.pageH ?? CONTRACT_PAGE_CONTENT_HEIGHT_PX;
  const footer = opts?.footerReservePx ?? CONTRACT_FOOTER_RESERVE_PX;
  const doc = (element as Element).ownerDocument || document;
  const win = doc.defaultView || window;
  const scrollY = win.scrollY || win.pageYOffset || 0;

  const sig = element.querySelector(
    '.contract-signatures, .sv2-signatures',
  ) as HTMLElement | null;
  const cert = element.querySelector(
    '.sv-cert-official-block',
  ) as HTMLElement | null;

  if (sig) sig.classList.remove('sv-pagination-force-break');
  if (sig) sig.classList.remove('sv-pagination-compact');
  if (cert) cert.classList.remove('sv-pagination-force-break');

  let sigH = 0;
  let certH = 0;
  let signatureOffset: number | null = null;
  let certificateOffset: number | null = null;
  let continuousWouldForce = false;

  if (sig) {
    const rect = sig.getBoundingClientRect();
    sigH = Math.ceil(rect.height || 0);
    const next = sig.nextElementSibling as HTMLElement | null;
    if (next?.classList?.contains('contract-institutional-footer')) {
      sigH += Math.ceil(next.getBoundingClientRect().height || 0);
    }
    signatureOffset = offsetWithinPagePx(rect.top + scrollY, pageH);
    const remainingAtSig = Math.max(0, pageH - signatureOffset);
    continuousWouldForce =
      decideIndivisibleBlockPlacement({
        remainingPx: remainingAtSig,
        blockHeightPx: sigH,
        footerReservePx: footer,
      }) === 'new-page';
  }
  if (cert) {
    const rect = cert.getBoundingClientRect();
    certH = Math.ceil(rect.height || 0);
    certificateOffset = offsetWithinPagePx(rect.top + scrollY, pageH);
  }

  const decisions = decideSignatureAndCertificatePlacement({
    pageH,
    footerReservePx: footer,
    signatureOffsetTopInPagePx: signatureOffset,
    signatureHeightPx: sigH || null,
    certificateOffsetTopInPagePx: certificateOffset,
    certificateHeightPx: certH || null,
  });

  if (sig && decisions.signature === 'new-page') {
    sig.classList.add('sv-pagination-force-break');
  } else if (sig && continuousWouldForce) {
    sig.classList.add('sv-pagination-compact');
    const rect2 = sig.getBoundingClientRect();
    sigH = Math.ceil(rect2.height || 0);
    const next2 = sig.nextElementSibling as HTMLElement | null;
    if (next2?.classList?.contains('contract-institutional-footer')) {
      sigH += Math.ceil(next2.getBoundingClientRect().height || 0);
    }
  }
  if (cert && decisions.certificate === 'new-page') {
    cert.classList.add('sv-pagination-force-break');
  }

  return {
    signature: decisions.signature,
    certificate: decisions.certificate,
    sigH,
    certH,
  };
}

/**
 * Prepara um fragmento HTML solto para medição + html2pdf.
 *
 * IMPORTANTE: a medição pode anexar off-screen, mas ANTES do html2canvas
 * o elemento DEVE voltar ao fluxo normal. Deixar `left: -10000px` faz o
 * html2pdf gerar PDF só com chrome (cabeçalho/rodapé) e corpo vazio.
 */
export function prepareContractHtmlElementForPagination(
  element: HTMLElement,
): ReturnType<typeof applyContractPaginationBreaksToElement> {
  const needsAttach = !element.isConnected;

  if (needsAttach) {
    element.style.position = 'absolute';
    element.style.left = '-10000px';
    element.style.top = '0';
    element.style.width = `${CONTRACT_PDF_CONTENT_WIDTH_PX}px`;
    document.body.appendChild(element);
  } else if (!element.style.width) {
    element.style.width = `${CONTRACT_PDF_CONTENT_WIDTH_PX}px`;
  }

  const result = applyContractPaginationBreaksToElement(element);

  // Restaura layout imprimível — html2canvas captura a caixa visível do elemento.
  restoreContractElementStylesForHtml2PdfCapture(element);

  return result;
}

/**
 * Garante estilos compatíveis com captura html2canvas / html2pdf.
 * Nunca deixar position absolute fora da viewport.
 */
export function restoreContractElementStylesForHtml2PdfCapture(
  element: HTMLElement,
): void {
  element.style.position = 'static';
  element.style.left = '';
  element.style.top = '';
  element.style.right = '';
  element.style.bottom = '';
  element.style.transform = '';
  element.style.opacity = '';
  element.style.visibility = '';
  element.style.display = '';
  element.style.width = `${CONTRACT_PDF_CONTENT_WIDTH_PX}px`;
  element.style.maxWidth = `${CONTRACT_PDF_CONTENT_WIDTH_PX}px`;
  element.style.boxSizing = 'border-box';
}

/** Falha rápido se o elemento ainda estiver fora da área capturável. */
export function assertContractElementReadyForHtml2PdfCapture(
  element: HTMLElement,
): void {
  const left = String(element.style.left || '').trim();
  const pos = String(element.style.position || '').trim().toLowerCase();
  const vis = String(element.style.visibility || '').trim().toLowerCase();
  const display = String(element.style.display || '').trim().toLowerCase();
  const opacity = String(element.style.opacity || '').trim();

  if (/^-?\d{4,}px$/i.test(left) || left.includes('-10000')) {
    throw new Error(
      'CONTRACT_PDF_CAPTURE_OFFSCREEN: elemento com left off-screen antes do html2pdf',
    );
  }
  if (pos === 'absolute' && /^-/.test(left)) {
    throw new Error(
      'CONTRACT_PDF_CAPTURE_OFFSCREEN: position absolute fora da viewport',
    );
  }
  if (vis === 'hidden') {
    throw new Error(
      'CONTRACT_PDF_CAPTURE_HIDDEN: visibility hidden antes do html2pdf',
    );
  }
  if (display === 'none') {
    throw new Error(
      'CONTRACT_PDF_CAPTURE_HIDDEN: display none antes do html2pdf',
    );
  }
  if (opacity === '0') {
    throw new Error(
      'CONTRACT_PDF_CAPTURE_HIDDEN: opacity 0 antes do html2pdf',
    );
  }
}

/**
 * Aplica decisão de paginação no HTML do certificado (string),
 * útil quando a medição ocorre fora do DOM.
 */
export function applyCertificateBreakClass(
  html: string,
  decision: ContractPaginationDecision,
): string {
  if (decision !== 'new-page') {
    return html.replace(/\s*sv-pagination-force-break/g, '');
  }
  if (html.includes('sv-pagination-force-break')) return html;
  return html.replace(
    /class="sv-cert-official-block"/,
    'class="sv-cert-official-block sv-pagination-force-break"',
  );
}

/** Seletores html2pdf avoid — assinaturas inteiras; cláusulas fluem. */
export const CONTRACT_HTML2PDF_PAGINATION_AVOID = [
  '.contract-balloon-finance',
  '.contract-balloon-only-table',
  '.contract-payment-block',
  '.contract-signatures',
  '.sv2-signatures',
  '.sv-cert-official-block',
] as const;

export const RECANTO_HTML2PDF_PAGINATION_AVOID = [
  '.sv-contract-recanto-primavera p',
  '.sv-contract-recanto-primavera .contract-payment-block',
  '.sv-contract-recanto-primavera .contract-signatures',
  '.sv-contract-recanto-primavera .contract-clause--electronic-signature',
  '.sv-cert-official-block',
] as const;

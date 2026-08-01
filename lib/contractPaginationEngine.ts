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
  /** Reserva o chrome do footerTemplate (linha + texto + Página X de Y). */
  bottom: 32,
  left: 15,
} as const;

/** Altura útil aproximada de uma página A4 com margens do PDF (mm → px @ 96dpi). */
export const CONTRACT_PAGE_CONTENT_HEIGHT_PX = Math.round(
  ((297 - CONTRACT_PDF_MARGIN_MM.top - CONTRACT_PDF_MARGIN_MM.bottom) / 25.4) *
    96,
); // ~822px com top 48 + bottom 32

/** Reserva mínima para não “espremer” o bloco no rodapé. */
export const CONTRACT_FOOTER_RESERVE_PX = 56;

/** Seletores canônicos — novos modelos devem reutilizar estes. */
export const CONTRACT_PAGINATION_SELECTORS = {
  signatureBlock: '.contract-signatures, .sv2-signatures',
  signatureSlot: '.signature-slot',
  certificateBlock: '.sv-cert-official-block',
  certificateUnit: '.sv-cert-official-inner, .sv-cert-official',
  documentRoots:
    '.sv-contract-document, .sv-contract-recanto-primavera, .sv-contract-sv-lotes-2',
} as const;

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
 * Evita página quase vazia: se restam poucas linhas úteis após o conteúdo
 * anterior, força o próximo bloco indivisível a iniciar na página seguinte
 * apenas quando o aproveitamento seria pior (espaço restante < limiar).
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
  blockMarginTopClassic: '10px',
  blockMarginTopRecanto: '12px',
  blockMarginTopSv2: '18px',
  slotMarginBottomClassic: '0',
  slotMarginBottomLast: '0',
  slotMarginBottomRecanto: '12px',
  slotMarginBottomRecantoLast: '4px',
  classicGridColumnGap: '14px',
  classicGridRowGap: '6px',
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
    page-break-inside: avoid;
    break-inside: avoid-page;
    text-align: center;
    min-width: 0;
  }
  .sv-contract-document .contract-signatures .signature-slot p {
    margin: 0;
    line-height: 1.25;
  }
  .sv-contract-document .contract-signatures .signature-slot img {
    max-height: 40px !important;
    margin-bottom: 2px !important;
  }
  .sv-contract-document .contract-signatures .sv-esign-stamp {
    margin: 0 0 2px 0 !important;
    font-size: 8pt !important;
    line-height: 1.2 !important;
  }
  .sv-contract-document .contract-signatures .signature-line {
    border-top: 1px solid #111;
    margin: 0 auto 3px auto;
    width: 72%;
  }
  .sv-contract-document .contract-closing {
    margin-bottom: 8px !important;
  }
  .sv-contract-document .contract-closing > p {
    margin-bottom: 6px !important;
  }
  .sv-contract-document .contract-closing .contract-closing-date {
    text-align: right;
    margin-bottom: 6px !important;
  }
  .contract-signatures--recanto {
    margin-top: ${CONTRACT_SIGNATURE_SPACING.blockMarginTopRecanto};
    text-align: center;
  }
  .contract-signatures--recanto .signature-slot {
    margin-bottom: ${CONTRACT_SIGNATURE_SPACING.slotMarginBottomRecanto};
    text-align: center;
  }
  .contract-signatures--recanto .signature-slot:last-of-type {
    margin-bottom: ${CONTRACT_SIGNATURE_SPACING.slotMarginBottomRecantoLast};
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
    margin-top: 8px !important;
    margin-bottom: 0 !important;
    page-break-before: auto !important;
    break-before: auto !important;
    /* Bloco compacto: preferir evidências + certificado na mesma página. */
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
    margin-bottom: 6px !important;
  }
  .sv-contract-document .contract-footer {
    page-break-before: avoid;
    break-before: avoid-page;
    page-break-after: avoid !important;
    break-after: avoid-page !important;
    margin-top: 8px;
    margin-bottom: 0 !important;
    padding-bottom: 0 !important;
    border-top: 1px solid #ccc;
    padding-top: 6px;
    font-size: 8.5pt;
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
${CONTRACT_RECANTO_CLAUSE_FLOW_CSS}
${CONTRACT_SIGNATURE_PAGINATION_CSS}
${CONTRACT_CERTIFICATE_PAGINATION_CSS}
</style>`;
}

/**
 * Script de medição para Chromium (Puppeteer): marca o certificado com
 * `sv-pagination-force-break` apenas quando não cabe após o bloco de assinaturas.
 * Não altera hash/token/QR — só a classe de quebra.
 */
export const CONTRACT_PAGINATION_MEASURE_SCRIPT = `
(() => {
  const PAGE_H = ${CONTRACT_PAGE_CONTENT_HEIGHT_PX};
  const FOOTER = ${CONTRACT_FOOTER_RESERVE_PX};
  const sig = document.querySelector('.contract-signatures, .sv2-signatures');
  const cert = document.querySelector('.sv-cert-official-block');
  if (!cert) return { applied: false, reason: 'no-cert' };

  const certH = Math.ceil(cert.getBoundingClientRect().height || 0);
  let remaining = PAGE_H;

  if (sig) {
    const sigRect = sig.getBoundingClientRect();
    const offsetInPage = ((sigRect.bottom % PAGE_H) + PAGE_H) % PAGE_H;
    remaining = Math.max(0, PAGE_H - offsetInPage);
  } else {
    const certTop = cert.getBoundingClientRect().top;
    const offsetInPage = ((certTop % PAGE_H) + PAGE_H) % PAGE_H;
    remaining = Math.max(0, PAGE_H - offsetInPage);
  }

  const available = Math.max(0, remaining - FOOTER);
  if (certH > available) {
    cert.classList.add('sv-pagination-force-break');
    return { applied: true, decision: 'new-page', remaining, certH, available };
  }
  cert.classList.remove('sv-pagination-force-break');
  return { applied: true, decision: 'same-page', remaining, certH, available };
})()
`;

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

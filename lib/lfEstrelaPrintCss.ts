/**
 * Print/PDF do LF ESTRELA no fluxo GIS (html2pdf + chrome institucional).
 * Editor/prévia isolada continua com {{COMPANY_LOGO_URL}}.
 * Não altera texto jurídico nem tokens financeiros.
 */

export const LF_ESTRELA_GIS_PRINT_STYLE_ID = 'sv-lf-estrela-gis-print-css';
export const LF_ESTRELA_GIS_FINAL_ATTR = 'data-sv-lf-estrela-gis-final';
export const LF_ESTRELA_PRINT_INK = '#000';
export const LF_ESTRELA_PRINT_GREEN = '#1b7a3d';

const COMPANY_LOGO_BLOCK_RE =
  /<(div|span)\b[^>]*\bdata-sv-placeholder=["']COMPANY_LOGO_URL["'][^>]*>[\s\S]*?<\/\1>/gi;
const COMPANY_LOGO_CLASS_RE =
  /<(div|span)\b[^>]*\bclass=["'][^"']*\bsv-company-logo\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
const GIS_STYLE_RE = new RegExp(
  `<style\\b[^>]*\\bid=["']${LF_ESTRELA_GIS_PRINT_STYLE_ID}["'][^>]*>[\\s\\S]*?<\\/style>`,
  'gi',
);

/**
 * CSS de emissão GIS/PDF. Logos internos em display:none (não visibility),
 * para não reservar altura. Não define display nos demais nós — preserva
 * data-sv-if / [hidden].
 */
export const LF_ESTRELA_GIS_FINAL_PRINT_CSS = `
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-company-logo,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] [data-sv-placeholder="COMPANY_LOGO_URL"],
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] [data-sv-company-logo],
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-company-logo-img,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-company-logo-empty {
  display: none !important;
  height: 0 !important;
  width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
}
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}],
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] * {
  color: ${LF_ESTRELA_PRINT_INK} !important;
  opacity: 1 !important;
  -webkit-text-fill-color: ${LF_ESTRELA_PRINT_INK} !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] {
  background: #fff !important;
  font-family: "Times New Roman", Times, serif;
  font-size: 10.5pt;
  line-height: 1.28;
  text-align: justify;
}
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-green,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-green * {
  color: ${LF_ESTRELA_PRINT_GREEN} !important;
  -webkit-text-fill-color: ${LF_ESTRELA_PRINT_GREEN} !important;
  opacity: 1 !important;
}
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-sign-line {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  opacity: 1 !important;
  border-bottom: 1px solid ${LF_ESTRELA_PRINT_INK} !important;
}
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] h1,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] h2,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-cover-title,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-instrument-title,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-section,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-clause,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .lf-estrela-title,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .lf-estrela-clause-title {
  color: ${LF_ESTRELA_PRINT_INK} !important;
  -webkit-text-fill-color: ${LF_ESTRELA_PRINT_INK} !important;
  opacity: 1 !important;
}
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-note,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-footnote,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .lf-estrela-footnote {
  font-size: 7pt !important;
  line-height: 1.1 !important;
  color: ${LF_ESTRELA_PRINT_INK} !important;
  -webkit-text-fill-color: ${LF_ESTRELA_PRINT_INK} !important;
  opacity: 1 !important;
}
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] table.sv-lf-table,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] table.lf-estrela-table {
  border-collapse: collapse;
  width: 100%;
}
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] table.sv-lf-table th,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] table.sv-lf-table td,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] table.lf-estrela-table th,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] table.lf-estrela-table td {
  color: ${LF_ESTRELA_PRINT_INK} !important;
  -webkit-text-fill-color: ${LF_ESTRELA_PRINT_INK} !important;
  opacity: 1 !important;
  border: 1px solid ${LF_ESTRELA_PRINT_INK};
}
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-sign,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .lf-estrela-signatures,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-sign-slot,
.sv-lf-estrela[${LF_ESTRELA_GIS_FINAL_ATTR}] .sv-lf-sign * {
  color: ${LF_ESTRELA_PRINT_INK} !important;
  -webkit-text-fill-color: ${LF_ESTRELA_PRINT_INK} !important;
  opacity: 1 !important;
}
`.trim();

export function isLfEstrelaCustomHtml(html: string | null | undefined): boolean {
  return /sv-lf-estrela/i.test(String(html || ''));
}

export function stripLfEstrelaInternalLogos(html: string): string {
  return String(html || '')
    .replace(COMPANY_LOGO_BLOCK_RE, '')
    .replace(COMPANY_LOGO_CLASS_RE, '');
}

function markLfEstrelaGisFinalRoot(html: string): string {
  return String(html || '').replace(
    /<div\b([^>]*\bclass=["'][^"']*\bsv-lf-estrela\b[^"']*["'][^>]*)>/i,
    (full, attrs: string) => {
      if (new RegExp(`\\b${LF_ESTRELA_GIS_FINAL_ATTR}\\b`).test(full)) return full;
      return `<div${attrs} ${LF_ESTRELA_GIS_FINAL_ATTR}="true">`;
    },
  );
}

export function lfEstrelaGisPrintStyleTag(): string {
  return `<style id="${LF_ESTRELA_GIS_PRINT_STYLE_ID}">${LF_ESTRELA_GIS_FINAL_PRINT_CSS}</style>`;
}

/** HTML persistido / capturado no PDF GIS: sem logo interno e com tinta preta. */
export function prepareLfEstrelaGisFinalHtml(html: string): string {
  if (!isLfEstrelaCustomHtml(html)) return String(html || '');
  const stripped = stripLfEstrelaInternalLogos(String(html || '').replace(GIS_STYLE_RE, ''));
  return `${lfEstrelaGisPrintStyleTag()}${markLfEstrelaGisFinalRoot(stripped)}`;
}

export function ensureLfEstrelaGisPrintStyle(doc: Document): void {
  if (doc.getElementById(LF_ESTRELA_GIS_PRINT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = LF_ESTRELA_GIS_PRINT_STYLE_ID;
  style.textContent = LF_ESTRELA_GIS_FINAL_PRINT_CSS;
  doc.head.appendChild(style);
}

export function applyLfEstrelaGisPrintToCaptureElement(element: HTMLElement): void {
  const root = element.classList.contains('sv-lf-estrela')
    ? element
    : (element.querySelector('.sv-lf-estrela') as HTMLElement | null);
  if (!root) return;

  const doc = element.ownerDocument || document;
  ensureLfEstrelaGisPrintStyle(doc);
  root.setAttribute(LF_ESTRELA_GIS_FINAL_ATTR, 'true');
  root
    .querySelectorAll(
      '.sv-company-logo, [data-sv-placeholder="COMPANY_LOGO_URL"], [data-sv-company-logo], .sv-company-logo-img, .sv-company-logo-empty',
    )
    .forEach((node) => node.remove());

  element.style.color = LF_ESTRELA_PRINT_INK;
  element.style.backgroundColor = '#ffffff';
  element.style.opacity = '1';
  element.style.setProperty('-webkit-text-fill-color', LF_ESTRELA_PRINT_INK);
  element.style.setProperty('-webkit-print-color-adjust', 'exact');
  element.style.setProperty('print-color-adjust', 'exact');
  root.style.color = LF_ESTRELA_PRINT_INK;
  root.style.opacity = '1';
  root.style.setProperty('-webkit-text-fill-color', LF_ESTRELA_PRINT_INK);
}

const LIGHT_HEX = /^#(?:[ef][0-9a-f]{2}|fff|eee|f5f5f5|f8fafc|f1f5f9)$/i;
const LIGHT_RGB =
  /rgba?\(\s*(?:2(?:4[0-9]|5[0-5])|1\d{2})\s*,\s*(?:2(?:4[0-9]|5[0-5])|1\d{2})\s*,\s*(?:2(?:4[0-9]|5[0-5])|1\d{2})(?:\s*,\s*0(?:\.\d+)?|\s*\/\s*0(?:\.\d+)?)?\s*\)/i;

/** Falha se o CSS de print GIS pintar o corpo em cinza claro / transparente / opacity < 1. */
export function collectLfEstrelaPrintCssViolations(css: string): string[] {
  const source = String(css || '');
  const violations: string[] = [];
  if (!/color:\s*#000\s*!important/i.test(source)) {
    violations.push('corpo sem color #000 !important');
  }
  if (!/opacity:\s*1\s*!important/i.test(source)) {
    violations.push('corpo sem opacity 1 !important');
  }
  if (!/-webkit-text-fill-color:\s*#000\s*!important/i.test(source)) {
    violations.push('corpo sem -webkit-text-fill-color #000 !important');
  }
  if (!/display:\s*none\s*!important/.test(source) || !/sv-company-logo/.test(source)) {
    violations.push('logo interno sem display:none');
  }
  if (/visibility:\s*hidden/.test(source) && /sv-company-logo/.test(source)) {
    violations.push('logo interno não pode usar visibility:hidden');
  }
  const starDisplay = /\.sv-lf-estrela[^{]*\*\s*\{[^}]*\bdisplay\s*:/i.test(source);
  if (starDisplay) {
    violations.push('seletor * não pode sobrescrever display dos condicionais');
  }
  const bodyBlock = source.match(
    /\.sv-lf-estrela\[[^\]]+\]\s*,\s*\.sv-lf-estrela\[[^\]]+\]\s*\*\s*\{([^}]+)\}/,
  );
  const bodyCss = bodyBlock?.[1] || '';
  if (/opacity:\s*0(\.\d+)?/i.test(bodyCss) && !/opacity:\s*1\s*!important/i.test(bodyCss)) {
    violations.push('opacity < 1 no wrapper');
  }
  if (/color:\s*transparent/i.test(bodyCss) || LIGHT_HEX.test(bodyCss) || LIGHT_RGB.test(bodyCss)) {
    violations.push('cor transparente/clara no wrapper');
  }
  if (
    /-webkit-text-fill-color:\s*transparent/i.test(bodyCss) ||
    /-webkit-text-fill-color:\s*#(?:[ef]|fff)/i.test(bodyCss)
  ) {
    violations.push('-webkit-text-fill-color transparente/claro no wrapper');
  }
  return violations;
}

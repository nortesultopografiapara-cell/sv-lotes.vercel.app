/**
 * Pós-processamento de PDF gerado via html2pdf (contrato).
 */

import { displayContractNumber } from "@/lib/contractNumber";
import {
  formatCompanyAddressForHeader,
  getCompanyDisplayName,
} from "@/lib/contractCompanyDisplay";
import { isAraguaiaContractModel, isMundoNovoContractModel, isRecantoPrimaveraContractModel, isSvLotes2ContractModel } from "@/lib/contractModel";
import {
  buildClassicContractPaginationCss,
  buildRecantoContractPaginationCss,
  CONTRACT_HTML2PDF_PAGINATION_AVOID,
  CONTRACT_PDF_CONTENT_WIDTH_PX,
  CONTRACT_PDF_MARGIN_MM,
  RECANTO_HTML2PDF_PAGINATION_AVOID,
} from "@/lib/contractPaginationEngine";
import { formatCpfCnpj } from "@/lib/inputMasks";
import { ARAGUAIA_HTML2PDF_PAGINATION_AVOID } from "@/lib/araguaiaHtml2PdfPagination";
import { resolveMundoNovoHtml2pdfAvoid } from "@/lib/mundoNovoHtml2PdfPagination";
import { mundoNovoPdfChromeLogoSizeMm } from "@/lib/mundoNovoContractPdf";
import { formatMundoNovoSeatAddressParts } from "@/lib/mundoNovoContractQualification";
import { formatAraguaiaSeatAddressParts } from "@/lib/araguaiaContractQualification";
import { buildRecantoPrimaveraPdfChrome } from "@/lib/recantoPrimaveraContractPdf";
import { buildSvLotes2PdfChrome } from "@/lib/svLotes2ContractPdf";

export type ContractPdfChromeInput = {
  tenantName: string;
  tenantCnpj: string;
  /** Rótulo do documento no cabeçalho PDF — padrão CNPJ (Meneses). */
  tenantDocumentLabel?: string;
  addressLine: string;
  cityUfLine: string;
  contractNumber: string;
  logoBase64: string | null;
  /** Largura da logo no chrome jsPDF (mm). Padrão 22 — ARAGUAIA inalterado. */
  logoWidthMm?: number;
  /** Altura da logo no chrome jsPDF (mm). Padrão 12 — ARAGUAIA inalterado. */
  logoHeightMm?: number;
  /** Variante visual do cabeçalho/rodapé PDF. */
  printStyle?: 'default' | 'sv-lotes-2';
  /** SV LOTES 2.0 — contato no cabeçalho institucional PDF. */
  tenantPhone?: string;
  tenantEmail?: string;
  tenantCep?: string;
};

/** CSS embutido no HTML do contrato — engine única de paginação. */
export const CONTRACT_PDF_PRINT_CSS = buildClassicContractPaginationCss();

/** CSS de impressão Recanto — mesma engine (fluxo de cláusulas + assinaturas indivisíveis). */
export const RECANTO_CONTRACT_PDF_PRINT_CSS = buildRecantoContractPaginationCss();

export type ContractHtml2pdfPagebreakOptions = {
  mode: string[];
  avoid?: string[];
};

export type ContractHtml2pdfOptions = {
  margin: number[];
  filename: string;
  image: { type: string; quality: number };
  html2canvas: {
    scale: number;
    useCORS: boolean;
    letterRendering?: boolean;
    logging?: boolean;
    /** Largura do documento = área útil A4 (evita corte à direita). */
    windowWidth?: number;
    width?: number;
  };
  jsPDF: { unit: string; format: string; orientation: string };
  pagebreak: ContractHtml2pdfPagebreakOptions;
};

/** Seletores que o html2pdf deve manter inteiros (engine única). */
export const RECANTO_CONTRACT_HTML2PDF_AVOID_SELECTORS =
  RECANTO_HTML2PDF_PAGINATION_AVOID;

export const CONTRACT_HTML2PDF_AVOID_SELECTORS =
  CONTRACT_HTML2PDF_PAGINATION_AVOID;

/** Opções html2pdf — sem avoid-all (evita página vazia extra no final). */
export function getContractHtml2pdfOptions(
  filename: string,
): ContractHtml2pdfOptions {
  return {
    margin: [
      CONTRACT_PDF_MARGIN_MM.top,
      CONTRACT_PDF_MARGIN_MM.right,
      CONTRACT_PDF_MARGIN_MM.bottom,
      CONTRACT_PDF_MARGIN_MM.left,
    ],
    filename,
    image: { type: "jpeg", quality: 1 },
    // scale 3 + letterRendering: tipografia nítida (evita serrilhado do Quadro Financeiro).
    // windowWidth = área útil A4 — HTML mais largo que isso corta o lado direito.
    html2canvas: {
      scale: 3,
      useCORS: true,
      letterRendering: true,
      logging: false,
      windowWidth: CONTRACT_PDF_CONTENT_WIDTH_PX,
      width: CONTRACT_PDF_CONTENT_WIDTH_PX,
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: {
      mode: ["css", "legacy"],
      avoid: [...CONTRACT_HTML2PDF_AVOID_SELECTORS],
    },
  };
}

/**
 * Recanto — evita corte de linha entre páginas (html2canvas fatia no meio do parágrafo
 * quando só a cláusula inteira está com break-inside:auto).
 */
export function getRecantoContractHtml2pdfOptions(
  filename: string,
): ContractHtml2pdfOptions {
  return {
    ...getContractHtml2pdfOptions(filename),
    pagebreak: {
      mode: ['css', 'legacy'],
      avoid: [...RECANTO_CONTRACT_HTML2PDF_AVOID_SELECTORS],
    },
  };
}

export function resolveContractHtml2pdfOptions(
  tenant: Record<string, unknown> | null | undefined,
  filename: string,
  html?: string | null,
): ContractHtml2pdfOptions {
  if (isRecantoPrimaveraContractModel(tenant)) {
    return getRecantoContractHtml2pdfOptions(filename);
  }
  if (isAraguaiaContractModel(tenant)) {
    return {
      ...getContractHtml2pdfOptions(filename),
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: [...ARAGUAIA_HTML2PDF_PAGINATION_AVOID],
      },
    };
  }
  if (isMundoNovoContractModel(tenant)) {
    return {
      ...getContractHtml2pdfOptions(filename),
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: [...resolveMundoNovoHtml2pdfAvoid(html)],
      },
    };
  }
  return getContractHtml2pdfOptions(filename);
}

type PdfWithText = {
  internal: { getNumberOfPages: () => number; pages?: unknown[] };
  deletePage: (n: number) => void;
  getTextFromPage?: (n: number) => { items?: Array<{ str?: string }> };
};

/** Texto contratual — se presente, a página nunca deve ser removida. */
export const CONTRACT_KEEP_MARKERS =
  /\b(cláusula|clausula|parágrafo|paragrafo|promitente|promissário|promissario|comprador|vendedor|testemunha|cpf|cnpj|assinatura|assinam|foro|multa|escritura|parcela|entrada|valor|instrumento|compromisso)\b/i;

/** Somente cabeçalho/rodapé do chrome PDF (após processamento) ou lixo de layout. */
const PDF_CHROME_ONLY_MARKERS =
  /documento emitido digitalmente pelo sv lotes gis|página\s+\d+\s+de\s+\d+/i;

export function extractPdfPageText(
  pdf: PdfWithText,
  pageNum: number,
): string {
  if (typeof pdf.getTextFromPage !== "function") return "";
  try {
    const text = pdf.getTextFromPage(pageNum);
    const items = text?.items || [];
    return items
      .map((it) => String(it.str || "").trim())
      .filter(Boolean)
      .join(" ");
  } catch {
    return "";
  }
}

/** Qualquer trecho contratual na página → manter. */
export function pdfPageHasContractualText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return CONTRACT_KEEP_MARKERS.test(normalized);
}

/** @deprecated use pdfPageHasContractualText */
export function pdfPageHasContractBody(text: string): boolean {
  return pdfPageHasContractualText(text);
}

/**
 * Última página removível: só quando o texto extraído prova que é só rodapé/cabeçalho,
 * sem cláusulas. Se não houver texto extraído, não remove (html2pdf costuma falhar nas páginas 2+).
 */
export function isContractPdfTrailingBlankPage(
  pdf: PdfWithText,
  pageNum: number,
): boolean {
  const text = extractPdfPageText(pdf, pageNum);
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) return false;

  if (pdfPageHasContractualText(normalized)) return false;

  const chromeOnly =
    PDF_CHROME_ONLY_MARKERS.test(normalized) &&
    normalized.length < 220 &&
    !CONTRACT_KEEP_MARKERS.test(normalized);

  const orphanCompanyFooter =
    normalized.length < 140 &&
    /\bcnpj\b/i.test(normalized) &&
    !CONTRACT_KEEP_MARKERS.test(normalized) &&
    !/cláusula|clausula|testemunha|promitente|promissário|promissario/i.test(
      normalized,
    );

  return chromeOnly || orphanCompanyFooter;
}

/** Remove no máximo a última página, e só se for comprovadamente vazia de contrato. */
export function removeTrailingBlankPdfPages(pdf: PdfWithText): void {
  const total = pdf.internal.getNumberOfPages();
  if (total <= 1) return;
  if (!isContractPdfTrailingBlankPage(pdf, total)) return;
  pdf.deletePage(total);
}

/** Cabeçalho/rodapé em todas as páginas — chamar após remover páginas vazias. */
export function applyContractPdfChrome(
  pdf: {
    internal: {
      getNumberOfPages: () => number;
      pageSize: { width: number; height: number };
    };
    setPage: (n: number) => void;
    setFontSize: (n: number) => void;
    setTextColor: (r: number, g?: number, b?: number) => void;
    setFont: (family: string, style?: string) => void;
    text: (
      text: string | string[],
      x: number,
      y: number,
      opts?: Record<string, unknown>,
    ) => void;
    splitTextToSize: (text: string, maxWidth: number) => string[];
    addImage: (...args: unknown[]) => void;
    setDrawColor: (r: number, g?: number, b?: number) => void;
    setLineWidth: (w: number) => void;
    line: (x1: number, y1: number, x2: number, y2: number) => void;
    getTextFromPage?: (n: number) => { items?: Array<{ str?: string }> };
    deletePage: (n: number) => void;
  },
  data: ContractPdfChromeInput,
): void {
  removeTrailingBlankPdfPages(pdf);

  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.width;
  const pageHeight = pdf.internal.pageSize.height;
  const rightX = pageWidth - 14;
  const contractLabel = `Contrato nº ${displayContractNumber(data.contractNumber)}`;

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);

    const logoW = data.logoWidthMm ?? 22;
    const logoH = data.logoHeightMm ?? 12;

    let titleX = 14;
    if (data.logoBase64) {
      pdf.addImage(data.logoBase64, "PNG", 14, 10, logoW, logoH, undefined, "FAST");
      titleX = 14 + logoW + 3;
    }

    pdf.setFontSize(11);
    pdf.setTextColor(20);
    pdf.setFont("times", "bold");
    const splitName = pdf.splitTextToSize(data.tenantName.toUpperCase(), 100);
    pdf.text(splitName, titleX, 13);

    pdf.setFontSize(9);
    pdf.setFont("times", "normal");
    pdf.setTextColor(50);

    let yPos = 13 + splitName.length * 3.5;

    const infoParts: string[] = [];
    const docLabel = data.tenantDocumentLabel || "CNPJ";
    if (data.tenantCnpj) infoParts.push(`${docLabel}: ${data.tenantCnpj}`);
    if (data.cityUfLine) infoParts.push(data.cityUfLine);
    if (infoParts.length > 0) {
      pdf.text(infoParts.join(" | "), titleX, yPos);
      yPos += 3.5;
    }

    if (data.addressLine) {
      const splitAddr = pdf.splitTextToSize(data.addressLine, 140);
      pdf.text(splitAddr, titleX, yPos);
      yPos += splitAddr.length * 3.5;
    }

    const logoBottom = data.logoBase64 ? 10 + logoH : 0;
    const finalY = Math.max(yPos, logoBottom, 22) + 2;

    pdf.setFontSize(8);
    pdf.setTextColor(100);
    pdf.text(contractLabel, rightX, 13, { align: "right" });

    pdf.setDrawColor(150);
    pdf.setLineWidth(0.3);
    pdf.line(14, finalY, rightX, finalY);

    pdf.setLineWidth(0.2);
    pdf.line(14, pageHeight - 12, rightX, pageHeight - 12);

    pdf.setFontSize(7);
    pdf.setTextColor(150);
    pdf.setFont("times", "italic");
    pdf.text(
      "Documento emitido digitalmente pelo SV LOTES GIS",
      14,
      pageHeight - 8,
    );
    pdf.text(`Página ${i} de ${totalPages}`, rightX, pageHeight - 8, {
      align: "right",
    });
  }
}

/** Chrome PDF do contrato conforme modelo da empresa (Recanto vs padrão). */
export function buildContractPdfChromeFromTenant(
  tenant: Record<string, unknown> | null | undefined,
  contractNumber: string,
  logoBase64: string | null = null,
): ContractPdfChromeInput {
  const row = tenant && typeof tenant === "object" ? tenant : {};

  if (isRecantoPrimaveraContractModel(row)) {
    return buildRecantoPrimaveraPdfChrome(row, contractNumber, logoBase64);
  }

  if (isSvLotes2ContractModel(row)) {
    return buildSvLotes2PdfChrome(row, contractNumber, logoBase64);
  }

  if (isAraguaiaContractModel(row)) {
    const seat = formatAraguaiaSeatAddressParts(row);
    return {
      tenantName: getCompanyDisplayName(row),
      tenantCnpj: formatCpfCnpj(String(row.cnpj || row.document || "")),
      tenantDocumentLabel: "CNPJ",
      addressLine: seat.headerAddressLine,
      cityUfLine: seat.cityUfLine,
      contractNumber,
      logoBase64,
    };
  }

  if (isMundoNovoContractModel(row)) {
    const seat = formatMundoNovoSeatAddressParts(row);
    const logoSize = mundoNovoPdfChromeLogoSizeMm();
    return {
      tenantName: getCompanyDisplayName(row),
      tenantCnpj: formatCpfCnpj(String(row.cnpj || row.document || "")),
      tenantDocumentLabel: "CNPJ",
      addressLine: seat.headerAddressLine,
      cityUfLine: seat.cityUfLine,
      contractNumber,
      logoBase64,
      logoWidthMm: logoSize.widthMm,
      logoHeightMm: logoSize.heightMm,
    };
  }

  const { addressLine, cityUfLine } = formatCompanyAddressForHeader(row);

  return {
    tenantName: getCompanyDisplayName(row),
    tenantCnpj: formatCpfCnpj(String(row.cnpj || row.document || "")),
    tenantDocumentLabel: "CNPJ",
    addressLine,
    cityUfLine,
    contractNumber,
    logoBase64,
  };
}

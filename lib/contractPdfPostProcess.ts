/**
 * Pós-processamento de PDF gerado via html2pdf (contrato).
 */

import { displayContractNumber } from "@/lib/contractNumber";

export type ContractPdfChromeInput = {
  tenantName: string;
  tenantCnpj: string;
  addressLine: string;
  cityUfLine: string;
  contractNumber: string;
  logoBase64: string | null;
};

/** CSS embutido no HTML do contrato — evita página extra após assinaturas. */
export const CONTRACT_PDF_PRINT_CSS = `
<style type="text/css">
  .sv-contract-document .contract-clause {
    page-break-inside: avoid;
    break-inside: avoid-page;
    margin-bottom: 22px;
  }
  .sv-contract-document .contract-clause--tight {
    margin-bottom: 18px;
  }
  .sv-contract-document .contract-title {
    text-align: center;
    margin-bottom: 22px;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .sv-contract-document .contract-preamble {
    page-break-inside: avoid;
    break-inside: avoid-page;
    margin-bottom: 18px;
  }
  .sv-contract-document .contract-signatures {
    page-break-inside: avoid;
    break-inside: avoid-page;
    page-break-after: avoid !important;
    break-after: avoid-page !important;
    margin-top: 28px;
    margin-bottom: 0 !important;
    padding-bottom: 0 !important;
    text-align: center;
  }
  .sv-contract-document .contract-signatures .signature-slot {
    margin-bottom: 40px;
  }
  .sv-contract-document .contract-signatures .signature-slot:last-of-type {
    margin-bottom: 8px;
  }
  .sv-contract-document .contract-footer {
    page-break-before: avoid;
    break-before: avoid-page;
    page-break-after: avoid !important;
    break-after: avoid-page !important;
    margin-top: 12px;
    margin-bottom: 0 !important;
    padding-bottom: 0 !important;
    border-top: 1px solid #ccc;
    padding-top: 10px;
    font-size: 9pt;
    color: #444;
    text-align: center;
  }
  .sv-contract-document > *:last-child {
    page-break-after: avoid !important;
    break-after: avoid-page !important;
    margin-bottom: 0 !important;
  }
</style>
`;

export type ContractHtml2pdfOptions = {
  margin: number[];
  filename: string;
  image: { type: string; quality: number };
  html2canvas: { scale: number; useCORS: boolean };
  jsPDF: { unit: string; format: string; orientation: string };
  pagebreak: { mode: string[] };
};

/** Opções html2pdf — sem avoid-all (evita página vazia extra no final). */
export function getContractHtml2pdfOptions(
  filename: string,
): ContractHtml2pdfOptions {
  return {
    margin: [35, 15, 25, 15],
    filename,
    image: { type: "jpeg", quality: 1 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css"] },
  };
}

type PdfWithText = {
  internal: { getNumberOfPages: () => number; pages?: unknown[] };
  deletePage: (n: number) => void;
  getTextFromPage?: (n: number) => { items?: Array<{ str?: string }> };
};

const CONTRACT_BODY_MARKERS =
  /cláusula|clausula|promitente|promissário|promissario|testemunha|instrumento|assinam|compromisso de compra/i;

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

/** Página com corpo contratual (cláusulas/assinaturas), não só rodapé HTML residual. */
export function pdfPageHasContractBody(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 20) return false;
  return CONTRACT_BODY_MARKERS.test(normalized);
}

/** Última página sem conteúdo útil do contrato (html2pdf / rodapé HTML órfão). */
export function isContractPdfTrailingBlankPage(
  pdf: PdfWithText,
  pageNum: number,
): boolean {
  const text = extractPdfPageText(pdf, pageNum);
  if (pdfPageHasContractBody(text)) return false;

  const pages = pdf.internal.pages as unknown[] | undefined;
  if (pages) {
    const pageOps = pages[pageNum];
    if (Array.isArray(pageOps) && pageOps.length <= 12) return true;
  }

  return text.length < 80;
}

/** Remove páginas finais sem conteúdo (cabeçalho/rodapé PDF são aplicados depois). */
export function removeTrailingBlankPdfPages(pdf: PdfWithText): void {
  let total = pdf.internal.getNumberOfPages();
  while (total > 1 && isContractPdfTrailingBlankPage(pdf, total)) {
    pdf.deletePage(total);
    total = pdf.internal.getNumberOfPages();
  }
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

    let titleX = 14;
    if (data.logoBase64) {
      pdf.addImage(data.logoBase64, "PNG", 14, 10, 22, 12, undefined, "FAST");
      titleX = 39;
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
    if (data.tenantCnpj) infoParts.push(`CNPJ: ${data.tenantCnpj}`);
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

    const finalY = Math.max(yPos, 22) + 2;

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

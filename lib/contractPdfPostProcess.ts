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

/** Remove apenas páginas finais realmente vazias (evita apagar páginas 2–N do contrato). */
export function removeTrailingBlankPdfPages(pdf: {
  internal: { getNumberOfPages: () => number; pages?: unknown[] };
  deletePage: (n: number) => void;
}): void {
  const pages = pdf.internal.pages as unknown[] | undefined;
  if (!pages) return;

  let total = pdf.internal.getNumberOfPages();
  while (total > 1) {
    const pageOps = pages[total];
    if (!Array.isArray(pageOps)) break;
    if (pageOps.length > 5) break;
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

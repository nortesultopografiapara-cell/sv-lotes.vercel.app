/**
 * Chrome mínimo do PDF físico LF ESTRELA (jsPDF overlay).
 *
 * Somente:
 * - cabeçalho: Contrato nº {número}
 * - rodapé: Página X de 10
 *
 * Fora do fluxo HTML — não altera paginação, logo, margens nem jurídico.
 * Não duplica o chrome GIS (logo/CNPJ/endereço/linhas).
 * Não se aplica ao certificado (página 11).
 */

import { displayContractNumber } from '@/lib/contractNumber';

export const LF_ESTRELA_PHYSICAL_INSTRUMENT_PAGES = 10;

/** Coordenadas em mm (jsPDF unit: mm, A4 210×297). Origem: canto superior esquerdo. */
export const LF_ESTRELA_PHYSICAL_CHROME_LAYOUT = {
  headerXMm: 195,
  headerYMm: 8,
  headerAlign: 'right' as const,
  footerXMm: 105,
  footerYMm: 289,
  footerAlign: 'center' as const,
  headerRightMarginMm: 15,
  footerFromBottomMm: 8,
  fontSizePt: 8,
} as const;

export type LfEstrelaPhysicalChromePdf = {
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
};

export function lfEstrelaPhysicalHeaderLabel(contractNumber: string | null | undefined): string {
  return `Contrato nº ${displayContractNumber(contractNumber)}`;
}

export function lfEstrelaPhysicalFooterLabel(page: number): string {
  return `Página ${page} de ${LF_ESTRELA_PHYSICAL_INSTRUMENT_PAGES}`;
}

export function applyLfEstrelaPhysicalChrome(
  pdf: LfEstrelaPhysicalChromePdf,
  input: { contractNumber: string | null | undefined },
): void {
  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = Number(pdf.internal.pageSize.width) || 210;
  const pageHeight = Number(pdf.internal.pageSize.height) || 297;
  const headerX = pageWidth - LF_ESTRELA_PHYSICAL_CHROME_LAYOUT.headerRightMarginMm;
  const headerY = LF_ESTRELA_PHYSICAL_CHROME_LAYOUT.headerYMm;
  const footerX = pageWidth / 2;
  const footerY = pageHeight - LF_ESTRELA_PHYSICAL_CHROME_LAYOUT.footerFromBottomMm;
  const header = lfEstrelaPhysicalHeaderLabel(input.contractNumber);
  const instrumentPages = Math.min(totalPages, LF_ESTRELA_PHYSICAL_INSTRUMENT_PAGES);

  for (let i = 1; i <= instrumentPages; i++) {
    pdf.setPage(i);
    pdf.setFont('times', 'normal');
    pdf.setFontSize(LF_ESTRELA_PHYSICAL_CHROME_LAYOUT.fontSizePt);
    pdf.setTextColor(110);
    pdf.text(header, headerX, headerY, { align: 'right' });
    pdf.text(lfEstrelaPhysicalFooterLabel(i), footerX, footerY, { align: 'center' });
  }
}

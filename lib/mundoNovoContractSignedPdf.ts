/**
 * PDF ELECTRONIC_SIGNED MUNDO_NOVO — certificado compacto na mesma página 7.
 * Não altera ARAGUAIA nem PHYSICAL_UNSIGNED.
 */

import {
  buildSaleContractPdfFromHtml,
} from '@/lib/saleContractPdf';
import type { ContractPdfChromeInput } from '@/lib/contractPdfPostProcess';

export async function buildMundoNovoElectronicSignedPdfFromHtml(
  html: string,
  chrome: ContractPdfChromeInput,
): Promise<Uint8Array> {
  return buildSaleContractPdfFromHtml(html, chrome);
}

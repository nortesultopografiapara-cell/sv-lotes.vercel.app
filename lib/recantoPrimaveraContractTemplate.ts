/**
 * Template de contrato Recanto Primavera — dados da empresa sempre dinâmicos.
 */

import { CONTRACT_PDF_PRINT_CSS } from '@/lib/contractPdfPostProcess';
import {
  buildRecantoPrimaveraBuyerClauseHtml,
  buildRecantoPrimaveraLegalBodyHtml,
  buildRecantoPrimaveraSignaturesHtml,
  buildRecantoPrimaveraVendorHeaderHtml,
} from '@/lib/recantoPrimaveraContractLegal';
import {
  buildSaleContractRenderContext,
  type SaleContractRenderParams,
} from '@/lib/saleContractContext';

export type GenerateRecantoPrimaveraContractParams = SaleContractRenderParams & {
  block: Record<string, unknown>;
};

export function generateRecantoPrimaveraContract(
  params: GenerateRecantoPrimaveraContractParams,
): string {
  const ctx = buildSaleContractRenderContext(params);
  const lotArea = ctx.formatArea(params.block?.area);

  return `
        ${CONTRACT_PDF_PRINT_CSS}
        <div class="sv-contract-document sv-contract-recanto-primavera" style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #111; background: #fff; padding: 10px; text-align: justify;">

            ${buildRecantoPrimaveraVendorHeaderHtml(ctx)}
            ${buildRecantoPrimaveraBuyerClauseHtml(ctx)}
            ${buildRecantoPrimaveraLegalBodyHtml(ctx, lotArea)}
            ${buildRecantoPrimaveraSignaturesHtml(ctx)}

        </div>
    `;
}

/**
 * Template de contrato Recanto Primavera — totalmente isolado do modelo Meneses/PADRAO.
 */

import { RECANTO_CONTRACT_PDF_PRINT_CSS } from '@/lib/contractPdfPostProcess';
import { buildRecantoPrimaveraContractContext } from '@/lib/recantoPrimaveraContractContext';
import {
  buildRecantoPrimaveraBuyerClauseHtml,
  buildRecantoPrimaveraElectronicSignatureHtml,
  buildRecantoPrimaveraLegalBodyHtml,
  buildRecantoPrimaveraSignaturesHtml,
  buildRecantoPrimaveraSpouseClauseHtml,
  buildRecantoPrimaveraTitleHtml,
  buildRecantoPrimaveraVendorHeaderHtml,
} from '@/lib/recantoPrimaveraContractLegal';
import type { RecantoPrimaveraContractParams } from '@/lib/recantoPrimaveraContractContext';

export type GenerateRecantoPrimaveraContractParams = RecantoPrimaveraContractParams;

export function generateRecantoPrimaveraContract(
  params: GenerateRecantoPrimaveraContractParams,
): string {
  const ctx = buildRecantoPrimaveraContractContext(params);

  return `
        ${RECANTO_CONTRACT_PDF_PRINT_CSS}
        <div class="sv-contract-document sv-contract-recanto-primavera" style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; color: #111; background: #fff; padding: 0; margin: 0; width: 100%; max-width: 100%; box-sizing: border-box; text-align: justify;">

            ${buildRecantoPrimaveraTitleHtml(ctx)}
            ${buildRecantoPrimaveraVendorHeaderHtml(ctx)}
            ${buildRecantoPrimaveraBuyerClauseHtml(ctx)}
            ${buildRecantoPrimaveraSpouseClauseHtml(ctx)}
            ${buildRecantoPrimaveraLegalBodyHtml(ctx)}
            ${buildRecantoPrimaveraElectronicSignatureHtml()}
            ${buildRecantoPrimaveraSignaturesHtml(ctx)}

        </div>
    `;
}

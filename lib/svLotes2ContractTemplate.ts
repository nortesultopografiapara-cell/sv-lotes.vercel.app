/**
 * Template de contrato SV LOTES 2.0 (Recomendado) — isolado dos demais modelos.
 */

import { CONTRACT_PDF_PRINT_CSS } from '@/lib/contractPdfPostProcess';
import type { SaleContractRenderParams } from '@/lib/saleContractContext';
import { buildSvLotes2ContractContext } from '@/lib/svLotes2ContractContext';
import {
  SV_LOTES_2_CONTRACT_CSS,
  SV_LOTES_2_CONTRACT_TITLE,
  SV_LOTES_2_LEGAL_MARKER,
} from '@/lib/svLotes2ContractLegal';
import {
  buildSvLotes2BuyerQualificationHtml,
  buildSvLotes2ClausesHtml,
  buildSvLotes2SignaturesHtml,
  buildSvLotes2SummaryHtml,
  buildSvLotes2VendorQualificationHtml,
} from '@/lib/svLotes2ContractClauses';

export type GenerateSvLotes2ContractParams = SaleContractRenderParams;

export function generateSvLotes2Contract(
  params: GenerateSvLotes2ContractParams,
): string {
  const ctx = buildSvLotes2ContractContext(params);

  return `
        ${CONTRACT_PDF_PRINT_CSS}
        ${SV_LOTES_2_CONTRACT_CSS}
        <div class="sv-contract-document sv-contract-sv-lotes-2" data-sv-lotes-model="2.0" style="background:#fff;padding:10px;text-align:justify;">

            <div class="sv2-header">
              ${ctx.empresaLogoHtml}
              <span class="sv2-badge">SV LOTES 2.0 — Recomendado</span>
              <h2>${SV_LOTES_2_CONTRACT_TITLE}</h2>
              <p style="margin:0;font-size:10pt;color:#64748b;">Contrato nº ${ctx.contractNumber}</p>
            </div>

            <!-- ${SV_LOTES_2_LEGAL_MARKER} -->
            ${buildSvLotes2SummaryHtml(ctx)}

            <div class="sv2-section-title">Qualificação das Partes</div>
            ${buildSvLotes2VendorQualificationHtml(ctx)}
            ${buildSvLotes2BuyerQualificationHtml(ctx)}

            <div class="sv2-section-title">Cláusulas Contratuais</div>
            ${buildSvLotes2ClausesHtml(ctx)}
            ${buildSvLotes2SignaturesHtml(ctx)}

        </div>
    `;
}

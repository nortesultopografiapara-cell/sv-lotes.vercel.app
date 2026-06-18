/**
 * Template jurídico isolado — Recanto Primavera (modelo DOCX Ivanilde).
 */

import {
  buildRecantoVendorFieldLine,
} from '@/lib/recantoPrimaveraCompanyProfile';
import {
  buildRecantoPrimaveraClausesHtml,
  buildRecantoPrimaveraElectronicSignatureClauseHtml,
} from '@/lib/recantoPrimaveraContractClauses';
import type { RecantoPrimaveraContractContext } from '@/lib/recantoPrimaveraContractContext';

export {
  buildRecantoPrimaveraBuyerClauseHtml,
  buildRecantoPrimaveraSignaturesHtml,
  buildRecantoPrimaveraSpouseClauseHtml,
} from '@/lib/recantoPrimaveraContractParties';

export const RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1 =
  'INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA';

/** Marcador estável para testes — distingue do modelo Meneses/PADRAO. */
export const RECANTO_PRIMAVERA_LEGAL_MARKER =
  'CLÁUSULA PRIMEIRA – DAS DECLARAÇÕES INICIAIS';

/** @deprecated use RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1 */
export const RECANTO_PRIMAVERA_CONTRACT_TITLE = RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1;

export function buildRecantoPrimaveraTitleHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  return `
    <div class="contract-header-recanto" style="text-align: center; margin-bottom: 18px;">
      <h2 style="font-family: 'Times New Roman', Times, serif; font-size: 17px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 6px 0; padding: 0; line-height: 1.3;">${RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1}</h2>
      <h3 style="font-family: 'Times New Roman', Times, serif; font-size: 15px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 14px 0; padding: 0; line-height: 1.3;">${ctx.titleLine2}</h3>
    </div>`;
}

export function buildRecantoPrimaveraVendorHeaderHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const p = ctx.profile;
  const rgLine =
    p.rg && p.rgIssuer
      ? `${p.rg} — ${p.rgIssuer}`
      : p.rg || p.rgIssuer;

  const lines = [
    buildRecantoVendorFieldLine('VENDEDOR(A)', p.vendorName),
    buildRecantoVendorFieldLine('Nacionalidade', p.nationality),
    buildRecantoVendorFieldLine('Estado civil', p.maritalStatus),
    buildRecantoVendorFieldLine('Profissão', p.profession),
    buildRecantoVendorFieldLine('RG', rgLine),
    buildRecantoVendorFieldLine(p.documentLabel, p.documentFmt),
    buildRecantoVendorFieldLine('Telefone', p.phone),
    buildRecantoVendorFieldLine('E-mail', p.email),
    buildRecantoVendorFieldLine('Endereço', p.address),
  ].filter(Boolean);

  return `
    <div class="contract-clause contract-vendor-block" style="margin-bottom: 14px;">
      ${lines.join('\n')}
    </div>`;
}

export function buildRecantoPrimaveraLegalBodyHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  return buildRecantoPrimaveraClausesHtml(ctx);
}

export function buildRecantoPrimaveraElectronicSignatureHtml(): string {
  return buildRecantoPrimaveraElectronicSignatureClauseHtml();
}

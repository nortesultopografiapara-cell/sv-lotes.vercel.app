/**
 * Template jurídico isolado — Recanto Primavera (modelo DOCX Ivanilde).
 */

import {
  buildRecantoVendorFieldLine,
  sanitizeContractField,
} from '@/lib/recantoPrimaveraCompanyProfile';
import { buildRecantoPrimaveraClausesHtml } from '@/lib/recantoPrimaveraContractClauses';
import type { RecantoPrimaveraContractContext } from '@/lib/recantoPrimaveraContractContext';

export const RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1 =
  'INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA';

/** Marcador estável para testes — distingue do modelo Meneses/PADRAO. */
export const RECANTO_PRIMAVERA_LEGAL_MARKER =
  'CLÁUSULA PRIMEIRA – DAS DECLARAÇÕES INICIAIS';

/** @deprecated use RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1 */
export const RECANTO_PRIMAVERA_CONTRACT_TITLE = RECANTO_PRIMAVERA_CONTRACT_TITLE_LINE1;

function buildRecantoPartyFieldLine(label: string, value: string): string {
  const clean = sanitizeContractField(value);
  return `<p style="margin: 0 0 4px 0;"><strong>${label}:</strong> ${clean || '&nbsp;'}</p>`;
}

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

export function buildRecantoPrimaveraBuyerClauseHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const rgLine =
    ctx.clienteRg && ctx.clienteRgIssuer
      ? `${ctx.clienteRg} — ${ctx.clienteRgIssuer}`
      : ctx.clienteRg || ctx.clienteRgIssuer;

  const lines = [
    buildRecantoPartyFieldLine('COMPRADOR(A)', ctx.clienteNome),
    buildRecantoPartyFieldLine('Nacionalidade', ctx.clienteNacionalidade),
    buildRecantoPartyFieldLine('Estado civil', ctx.clienteEstadoCivil),
    buildRecantoPartyFieldLine('Profissão', ctx.clienteProfissao),
    buildRecantoPartyFieldLine('RG', rgLine),
    buildRecantoPartyFieldLine('CPF', ctx.clienteCpfCnpj),
    buildRecantoPartyFieldLine('Telefone', ctx.clienteTelefone),
    buildRecantoPartyFieldLine('E-mail', ctx.clienteEmail),
    buildRecantoPartyFieldLine('ENDEREÇO', ctx.clienteEnderecoCompleto),
  ];

  return `
    <div class="contract-clause contract-buyer-block" style="margin-bottom: 14px;">
      ${lines.join('\n')}
    </div>`;
}

export function buildRecantoPrimaveraSpouseClauseHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const rgLine =
    ctx.conjugeRg && ctx.conjugeRgIssuer
      ? `${ctx.conjugeRg} — ${ctx.conjugeRgIssuer}`
      : ctx.conjugeRg || ctx.conjugeRgIssuer;

  const lines = [
    buildRecantoPartyFieldLine('Esposo(A)/Cônjuge', ctx.conjugeNome),
    buildRecantoPartyFieldLine('Nacionalidade', ctx.conjugeNacionalidade),
    buildRecantoPartyFieldLine('Estado civil', ctx.conjugeEstadoCivil),
    buildRecantoPartyFieldLine('Profissão', ctx.conjugeProfissao),
    buildRecantoPartyFieldLine('RG', rgLine),
    buildRecantoPartyFieldLine('CPF', ctx.conjugeCpf),
    buildRecantoPartyFieldLine('Telefone', ctx.conjugeTelefone),
    buildRecantoPartyFieldLine('E-mail', ctx.conjugeEmail),
    buildRecantoPartyFieldLine('ENDEREÇO', ctx.conjugeEndereco),
  ];

  return `
    <div class="contract-clause contract-spouse-block" style="margin-bottom: 14px;">
      ${lines.join('\n')}
    </div>`;
}

export function buildRecantoPrimaveraLegalBodyHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  return buildRecantoPrimaveraClausesHtml(ctx);
}

export function buildRecantoPrimaveraSignaturesHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const p = ctx.profile;
  const docLabel = p.documentLabel;
  const locationLine = [ctx.dataContratoCidade, ctx.dataContratoUf]
    .filter((v) => sanitizeContractField(v))
    .join(' - ');

  const brokerLine = [
    ctx.brokerNome,
    ctx.brokerDocumento ? `CPF ${ctx.brokerDocumento}` : '',
    ctx.brokerCreci ? `CRECI ${ctx.brokerCreci}` : '',
  ]
    .filter(Boolean)
    .join(' — ');

  return `
    <div class="contract-clause">
      <p style="margin-bottom: 20px;">
        E, por estarem assim justos e contratados, assinam o presente contrato em 2 (duas) vias de igual teor e forma.
      </p>
      <div style="text-align: right; margin-bottom: 30px;">
        <p style="margin: 0;">${locationLine ? `${locationLine}, ` : ''}${ctx.dataContratoFmt}</p>
      </div>
    </div>

    <div class="contract-signatures">
      <div class="signature-slot">
        ${ctx.empresaAssinatura}
        <div style="border-top: 1px solid #111; margin: 0 auto 5px auto; width: 60%;"></div>
        <p style="margin: 0; font-weight: bold; text-transform: uppercase;">VENDEDOR(A): ${p.vendorName}</p>
        <p style="margin: 0; font-size: 10pt; font-weight: normal;">${docLabel}: ${p.documentFmt || '&nbsp;'}</p>
      </div>

      <div class="signature-slot">
        <div style="border-top: 1px solid #111; margin: 0 auto 5px auto; width: 60%;"></div>
        <p style="margin: 0; font-weight: bold; text-transform: uppercase;">COMPRADOR(A): ${ctx.clienteNome || '&nbsp;'}</p>
        <p style="margin: 0; font-size: 10pt; font-weight: normal;">CPF: ${ctx.clienteCpfCnpj || '&nbsp;'}</p>
      </div>

      <div class="signature-slot">
        <div style="border-top: 1px solid #111; margin: 0 auto 5px auto; width: 60%;"></div>
        <p style="margin: 0; font-weight: bold; text-transform: uppercase;">CÔNJUGE ANUENTE: ${ctx.conjugeNome || '&nbsp;'}</p>
        <p style="margin: 0; font-size: 10pt; font-weight: normal;">CPF: ${ctx.conjugeCpf || '&nbsp;'}</p>
      </div>

      <div class="signature-slot">
        <div style="border-top: 1px solid #111; margin: 0 auto 5px auto; width: 60%;"></div>
        <p style="margin: 0; font-weight: bold; text-transform: uppercase;">CORRETOR: ${ctx.brokerNome || '&nbsp;'}</p>
        <p style="margin: 0; font-size: 10pt; font-weight: normal;">CPF/CRECI: ${brokerLine || '&nbsp;'}</p>
      </div>

      <div class="signature-slot">
        <div style="border-top: 1px solid #111; margin: 0 auto 8px auto; width: 60%;"></div>
        <p style="margin: 0 0 8px 0; font-weight: bold;">Testemunhas:</p>
        <p style="margin: 0 0 5px 0; font-size: 10pt;">Nome: __________________________________________</p>
        <p style="margin: 0 0 12px 0; font-size: 10pt;">RG/CPF: _______________________________________</p>
        <p style="margin: 0 0 5px 0; font-size: 10pt;">Nome: __________________________________________</p>
        <p style="margin: 0; font-size: 10pt;">RG/CPF: _______________________________________</p>
      </div>
    </div>`;
}

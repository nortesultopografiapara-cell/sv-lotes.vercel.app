/**
 * Blocos HTML do contrato Recanto — assinaturas e campos de partes.
 */

import { sanitizeContractField } from '@/lib/recantoPrimaveraCompanyProfile';
import type { RecantoPrimaveraContractContext } from '@/lib/recantoPrimaveraContractContext';

const SIGNATURE_SLOT_STYLE =
  'text-align: center; margin-bottom: 22px; page-break-inside: avoid;';
const SIGNATURE_LINE_STYLE =
  'border-top: 1px solid #111; margin: 0 auto 8px auto; width: 55%; max-width: 320px;';
const SIGNATURE_ROLE_STYLE =
  'margin: 0 0 4px 0; font-weight: bold; text-transform: uppercase; font-size: 11pt;';
const SIGNATURE_NAME_STYLE = 'margin: 0 0 2px 0; font-weight: bold; font-size: 11pt;';
const SIGNATURE_META_STYLE = 'margin: 0; font-size: 10pt; font-weight: normal;';

function buildRecantoPartyFieldLine(label: string, value: string): string {
  const clean = sanitizeContractField(value);
  if (!clean) return '';
  return `<p style="margin: 0 0 4px 0;"><strong>${label}:</strong> ${clean}</p>`;
}

function buildRecantoPartyBlockLines(
  lines: Array<string | false | null | undefined>,
): string {
  return lines.filter(Boolean).join('\n');
}

function buildSignatureSlot(params: {
  role: string;
  name?: string;
  docLines?: string[];
  signatureImage?: string;
}): string {
  const name = sanitizeContractField(params.name);
  const docLines = (params.docLines || [])
    .map((line) => sanitizeContractField(line))
    .filter(Boolean);

  const docHtml = docLines
    .map((line) => `<p style="${SIGNATURE_META_STYLE}">${line}</p>`)
    .join('\n');

  return `
      <div class="signature-slot" style="${SIGNATURE_SLOT_STYLE}">
        ${params.signatureImage || ''}
        <div style="${SIGNATURE_LINE_STYLE}"></div>
        <p style="${SIGNATURE_ROLE_STYLE}">${params.role}</p>
        ${name ? `<p style="${SIGNATURE_NAME_STYLE}">${name}</p>` : ''}
        ${docHtml}
      </div>`;
}

export function buildRecantoPrimaveraBuyerClauseHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const rgLine =
    ctx.clienteRg && ctx.clienteRgIssuer
      ? `${ctx.clienteRg} — ${ctx.clienteRgIssuer}`
      : ctx.clienteRg || ctx.clienteRgIssuer;

  const lines = buildRecantoPartyBlockLines([
    buildRecantoPartyFieldLine('COMPRADOR(A)', ctx.clienteNome),
    buildRecantoPartyFieldLine('Nacionalidade', ctx.clienteNacionalidade),
    buildRecantoPartyFieldLine('Estado civil', ctx.clienteEstadoCivil),
    buildRecantoPartyFieldLine('Profissão', ctx.clienteProfissao),
    buildRecantoPartyFieldLine('RG', rgLine),
    buildRecantoPartyFieldLine('CPF', ctx.clienteCpfCnpj),
    buildRecantoPartyFieldLine('Telefone', ctx.clienteTelefone),
    buildRecantoPartyFieldLine('E-mail', ctx.clienteEmail),
    buildRecantoPartyFieldLine('ENDEREÇO', ctx.clienteEnderecoCompleto),
  ]);

  return `
    <div class="contract-clause contract-buyer-block" style="margin-bottom: 14px;">
      ${lines}
    </div>`;
}

export function buildRecantoPrimaveraSpouseClauseHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  if (!ctx.hasConjuge) return '';

  const rgLine =
    ctx.conjugeRg && ctx.conjugeRgIssuer
      ? `${ctx.conjugeRg} — ${ctx.conjugeRgIssuer}`
      : ctx.conjugeRg || ctx.conjugeRgIssuer;

  const lines = buildRecantoPartyBlockLines([
    buildRecantoPartyFieldLine('Esposo(A)/Cônjuge', ctx.conjugeNome),
    buildRecantoPartyFieldLine('Nacionalidade', ctx.conjugeNacionalidade),
    buildRecantoPartyFieldLine('Estado civil', ctx.conjugeEstadoCivil),
    buildRecantoPartyFieldLine('Profissão', ctx.conjugeProfissao),
    buildRecantoPartyFieldLine('RG', rgLine),
    buildRecantoPartyFieldLine('CPF', ctx.conjugeCpf),
    buildRecantoPartyFieldLine('Telefone', ctx.conjugeTelefone),
    buildRecantoPartyFieldLine('E-mail', ctx.conjugeEmail),
    buildRecantoPartyFieldLine('ENDEREÇO', ctx.conjugeEndereco),
  ]);

  return `
    <div class="contract-clause contract-spouse-block" style="margin-bottom: 14px;">
      ${lines}
    </div>`;
}

export function buildRecantoPrimaveraSignaturesHtml(
  ctx: RecantoPrimaveraContractContext,
): string {
  const p = ctx.profile;
  const docLabel = p.documentLabel;

  const vendorDocLine = p.documentFmt
    ? `${docLabel}: ${p.documentFmt}`
    : '';

  const buyerDocLines = [
    ctx.clienteCpfCnpj ? `CPF: ${ctx.clienteCpfCnpj}` : '',
  ].filter(Boolean);

  const conjugeSignatureSlot = ctx.hasConjuge
    ? buildSignatureSlot({
        role: 'CÔNJUGE ANUENTE',
        name: ctx.conjugeNome,
        docLines: [ctx.conjugeCpf ? `CPF: ${ctx.conjugeCpf}` : ''].filter(Boolean),
      })
    : '';

  // RECANTO_PRIMAVERA: sem bloco de assinatura do corretor (corretor permanece na venda).
  return `
    <div class="contract-clause contract-clause--tight">
      <p style="margin-bottom: 10px;">
        E, por estarem assim justos e contratados, assinam o presente contrato em 2 (duas) vias de igual teor e forma.
      </p>
      <div style="text-align: right; margin-bottom: 14px;">
        <p style="margin: 0;">${ctx.dataContratoExtensoFmt || ctx.dataContratoFmt}</p>
      </div>
    </div>

    <div class="contract-signatures contract-signatures--recanto">
      ${buildSignatureSlot({
        role: 'VENDEDOR(A)',
        name: p.vendorName,
        docLines: vendorDocLine ? [vendorDocLine] : [],
        signatureImage: ctx.empresaAssinatura,
      })}

      ${buildSignatureSlot({
        role: 'COMPRADOR(A)',
        name: ctx.clienteNome,
        docLines: buyerDocLines,
      })}

      ${conjugeSignatureSlot}

      <div class="signature-slot" style="${SIGNATURE_SLOT_STYLE}">
        <div style="${SIGNATURE_LINE_STYLE}"></div>
        <p style="${SIGNATURE_ROLE_STYLE}">Testemunhas</p>
        <p style="margin: 8px 0 4px 0; font-size: 10pt;">Nome: __________________________________________</p>
        <p style="margin: 0 0 12px 0; font-size: 10pt;">RG/CPF: _______________________________________</p>
        <p style="margin: 0 0 4px 0; font-size: 10pt;">Nome: __________________________________________</p>
        <p style="margin: 0; font-size: 10pt;">RG/CPF: _______________________________________</p>
      </div>
    </div>`;
}

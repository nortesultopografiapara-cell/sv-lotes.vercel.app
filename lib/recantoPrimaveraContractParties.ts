/**
 * Blocos HTML do contrato Recanto — assinaturas e campos de partes.
 */

import { sanitizeContractField } from '@/lib/recantoPrimaveraCompanyProfile';
import type { RecantoPrimaveraContractContext } from '@/lib/recantoPrimaveraContractContext';

const SIGNATURE_SLOT_STYLE =
  `text-align: center; margin-bottom: 0; min-width: 0; width: 100%;`;
/** Respiro cartório: linha no topo + altura 26px até o bloco de texto. */
const SIGNATURE_LINE_STYLE =
  'border-top: 1px solid #111; margin: 0 auto 0 auto; padding: 0; width: 70%; max-width: 240px; height: 26px; box-sizing: border-box;';
const SIGNATURE_LINE_CLASS = 'signature-line';
/** +4px acima do título; fontes inalteradas. */
const SIGNATURE_ROLE_STYLE =
  'margin: 4px 0 6px 0; font-weight: bold; text-transform: uppercase; font-size: 11pt; text-align: center;';
const SIGNATURE_NAME_STYLE =
  'margin: 0 0 4px 0; font-weight: bold; font-size: 11pt; overflow-wrap: break-word; text-align: center;';
const SIGNATURE_META_STYLE =
  'margin: 0; font-size: 10pt; font-weight: normal; overflow-wrap: break-word; text-align: center;';
/** ~12px entre CPF do comprador e linha do cônjuge. */
const SIGNATURE_SPOUSE_SLOT_EXTRA = ' margin-top: 0; padding-top: 12px;';

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
  partyRole: 'VENDOR' | 'BUYER' | 'SPOUSE' | 'WITNESS';
  name?: string;
  docLines?: string[];
  signatureImage?: string;
  extraClass?: string;
}): string {
  const name = sanitizeContractField(params.name);
  const docLines = (params.docLines || [])
    .map((line) => sanitizeContractField(line))
    .filter(Boolean);

  const docHtml = docLines
    .map((line) => `<p style="${SIGNATURE_META_STYLE}">${line}</p>`)
    .join('\n');

  const className = [
    'signature-slot',
    params.extraClass || '',
  ]
    .filter(Boolean)
    .join(' ');

  const slotStyle =
    SIGNATURE_SLOT_STYLE +
    (params.partyRole === 'SPOUSE' ? SIGNATURE_SPOUSE_SLOT_EXTRA : '');

  return `
      <div class="${className}" data-party-role="${params.partyRole}" style="${slotStyle}">
        ${params.signatureImage || ''}
        <div class="${SIGNATURE_LINE_CLASS}" style="${SIGNATURE_LINE_STYLE}"></div>
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
        partyRole: 'SPOUSE',
        name: ctx.conjugeNome,
        docLines: [ctx.conjugeCpf ? `CPF: ${ctx.conjugeCpf}` : ''].filter(Boolean),
        extraClass: 'signature-slot-spouse',
      })
    : '';

  // RECANTO_PRIMAVERA: sem bloco de assinatura do corretor (corretor permanece na venda).
  // Layout 2 colunas: Vendedor|Comprador, Cônjuge sob comprador, Testemunhas lado a lado.
  return `
    <div class="contract-clause contract-clause--tight contract-closing">
      <p style="margin-bottom: 10px;">
        E, por estarem assim justos e contratados, assinam o presente contrato em 2 (duas) vias de igual teor e forma.
      </p>
      <div class="contract-closing-date" style="text-align: right; margin-bottom: 10px;">
        <p style="margin: 0;">${ctx.dataContratoExtensoFmt || ctx.dataContratoFmt}</p>
      </div>
    </div>

    <div class="contract-signatures contract-signatures--recanto">
      <div class="signature-grid">
      ${buildSignatureSlot({
        role: 'VENDEDOR(A)',
        partyRole: 'VENDOR',
        name: p.vendorName,
        docLines: vendorDocLine ? [vendorDocLine] : [],
        signatureImage: ctx.empresaAssinatura,
      })}

      ${buildSignatureSlot({
        role: 'COMPRADOR(A)',
        partyRole: 'BUYER',
        name: ctx.clienteNome,
        docLines: buyerDocLines,
      })}

      ${conjugeSignatureSlot}

      ${buildSignatureSlot({
        role: 'TESTEMUNHA 1',
        partyRole: 'WITNESS',
        docLines: ['Nome: ________________________________', 'RG/CPF: _____________________________'],
      })}

      ${buildSignatureSlot({
        role: 'TESTEMUNHA 2',
        partyRole: 'WITNESS',
        docLines: ['Nome: ________________________________', 'RG/CPF: _____________________________'],
      })}
      </div>
    </div>`;
}

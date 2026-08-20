/**
 * Assinaturas e título — modelo ARAGUAIA (isolado).
 * Não altera parties eletrônicos BUYER/SPOUSE/VENDOR.
 */

import type { AraguaiaContractContext } from '@/lib/araguaiaContractContext';
import {
  ARAGUAIA_CONTRACT_TITLE,
  buildAraguaiaClausesHtml,
  buildAraguaiaPartiesPreambleHtml,
} from '@/lib/araguaiaContractClauses';
import { formatSellerCpfDisplay } from '@/lib/projectContractSellers';

const SLOT_STYLE =
  'text-align: center; margin-bottom: 0; min-width: 0; width: 100%; page-break-inside: avoid; break-inside: avoid-page;';
const LINE_STYLE =
  'border-top: 1px solid #111; margin: 28px auto 0 auto; padding: 0; width: 72%; max-width: 260px; height: 12px; box-sizing: border-box;';
const ROLE_STYLE =
  'margin: 4px 0 4px 0; font-weight: bold; text-transform: uppercase; font-size: 10.5pt; text-align: center;';
const NAME_STYLE =
  'margin: 0 0 2px 0; font-weight: bold; font-size: 10.5pt; overflow-wrap: break-word; text-align: center;';
const META_STYLE =
  'margin: 0; font-size: 9.5pt; font-weight: normal; overflow-wrap: break-word; text-align: center;';

function esc(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSlot(params: {
  role: string;
  name?: string;
  meta?: string[];
  extraClass?: string;
  dataRole?: string;
}): string {
  const metaHtml = (params.meta || [])
    .filter(Boolean)
    .map((line) => `<p style="${META_STYLE}">${esc(line)}</p>`)
    .join('\n');
  const className = ['signature-slot', params.extraClass || '']
    .filter(Boolean)
    .join(' ');
  return `
    <div class="${className}" ${params.dataRole ? `data-party-role="${params.dataRole}"` : ''} style="${SLOT_STYLE}">
      <div class="signature-line" style="${LINE_STYLE}"></div>
      <p style="${ROLE_STYLE}">${esc(params.role)}</p>
      ${params.name ? `<p style="${NAME_STYLE}">${esc(params.name)}</p>` : ''}
      ${metaHtml}
    </div>`;
}

export function buildAraguaiaTitleHtml(): string {
  return `
    <div class="contract-header-araguaia" style="text-align: center; margin-bottom: 18px;">
      <h2 style="font-family: 'Times New Roman', Times, serif; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.6px; margin: 0 0 8px 0; padding: 0; line-height: 1.35;">
        ${ARAGUAIA_CONTRACT_TITLE}
      </h2>
      <h3 style="font-family: 'Times New Roman', Times, serif; font-size: 13px; font-weight: bold; text-transform: uppercase; margin: 0 0 14px 0; padding: 0;">
        Chacreamento Araguaia
      </h3>
    </div>`;
}

export function buildAraguaiaBodyHtml(ctx: AraguaiaContractContext): string {
  return `
    ${buildAraguaiaPartiesPreambleHtml(ctx)}
    ${buildAraguaiaClausesHtml(ctx)}
  `;
}

export function buildAraguaiaSignaturesHtml(ctx: AraguaiaContractContext): string {
  const seller1 = ctx.sellers[0];
  const seller2 = ctx.sellers[1];

  return `
    <div class="contract-closing-and-signatures--araguaia">
      <div class="contract-closing" style="margin: 18px 0 8px 0; text-align: justify;">
        <p class="contract-closing-date" style="margin: 0 0 18px 0; text-align: right; font-weight: bold;">
          ${esc(ctx.closingLine)}
        </p>
      </div>
      <div class="contract-signatures contract-signatures--araguaia">
        <div class="signature-grid signature-grid--araguaia">
          ${buildSlot({
            role: 'PROMITENTE VENDEDOR',
            name: seller1?.name || 'Promitente Vendedor 1',
            meta: seller1?.cpf
              ? [`CPF: ${formatSellerCpfDisplay(seller1.cpf) || seller1.cpf}`]
              : [],
            dataRole: 'VENDOR_PF_1',
            extraClass: 'signature-slot-vendor-1',
          })}
          ${buildSlot({
            role: 'PROMITENTE VENDEDOR',
            name: seller2?.name || 'Promitente Vendedor 2',
            meta: seller2?.cpf
              ? [`CPF: ${formatSellerCpfDisplay(seller2.cpf) || seller2.cpf}`]
              : [],
            dataRole: 'VENDOR_PF_2',
            extraClass: 'signature-slot-vendor-2',
          })}
          ${buildSlot({
            role: 'PROMITENTE COMPRADOR(A)',
            name: ctx.buyerName,
            meta: ctx.buyerCpf ? [`CPF: ${ctx.buyerCpf}`] : [],
            dataRole: 'BUYER',
            extraClass: 'signature-slot-buyer',
          })}
          ${buildSlot({
            role: 'INTERVENIENTE',
            name: ctx.intervenienteName,
            meta: [`CNPJ: ${ctx.intervenienteCnpj}`],
            dataRole: 'INTERVENIENT',
            extraClass: 'signature-slot-intervenient',
          })}
          ${buildSlot({
            role: 'TESTEMUNHA 1',
            meta: ['Nome: ________________________________', 'CPF: ________________________________'],
            dataRole: 'WITNESS',
            extraClass: 'signature-slot-witness-1',
          })}
          ${buildSlot({
            role: 'TESTEMUNHA 2',
            meta: ['Nome: ________________________________', 'CPF: ________________________________'],
            dataRole: 'WITNESS',
            extraClass: 'signature-slot-witness-2',
          })}
        </div>
      </div>
    </div>`;
}

/**
 * Título, corpo e assinaturas visuais — MUNDO_NOVO (Fase 1, sem e-sign).
 */

import type { MundoNovoContractContext } from '@/lib/mundoNovoContractContext';
import {
  MUNDO_NOVO_CONTRACT_TITLE,
  buildMundoNovoClausesHtml,
  buildMundoNovoPartiesPreambleHtml,
} from '@/lib/mundoNovoContractClauses';
import { MUNDO_NOVO_DEVELOPMENT_NAME } from '@/lib/mundoNovoContractConstants';
import { formatMundoNovoSellerCpfDisplay } from '@/lib/mundoNovoContractSellers';

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

function buildPhysicalSlot(params: {
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

export function buildMundoNovoTitleHtml(): string {
  return `
    <div class="contract-header-mundo-novo" style="text-align: center; margin-bottom: 18px;">
      <h2 style="font-family: 'Times New Roman', Times, serif; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.6px; margin: 0 0 8px 0; padding: 0; line-height: 1.35;">
        ${MUNDO_NOVO_CONTRACT_TITLE}
      </h2>
      <h3 style="font-family: 'Times New Roman', Times, serif; font-size: 13px; font-weight: bold; text-transform: uppercase; margin: 0 0 14px 0; padding: 0;">
        Chacreamento ${MUNDO_NOVO_DEVELOPMENT_NAME}
      </h3>
    </div>`;
}

export function buildMundoNovoBodyHtml(ctx: MundoNovoContractContext): string {
  return `
    ${buildMundoNovoPartiesPreambleHtml(ctx)}
    ${buildMundoNovoClausesHtml(ctx)}
  `;
}

export function buildMundoNovoSignaturesHtml(ctx: MundoNovoContractContext): string {
  const intervenienteName = ctx.intervenienteName || 'R R NEGÓCIOS & SERVIÇOS LTDA';
  const intervenienteCnpj = ctx.intervenienteCnpj || '';

  const vendorSlots = ctx.sellers
    .map((seller, idx) =>
      buildPhysicalSlot({
        role: ctx.vendorSignatureLabels?.[idx] || 'PROMITENTE VENDEDOR',
        name: seller?.name || `Promitente Vendedor ${idx + 1}`,
        meta: seller?.cpf
          ? [`CPF: ${formatMundoNovoSellerCpfDisplay(seller.cpf) || seller.cpf}`]
          : [],
        dataRole: 'VENDOR',
        extraClass: `signature-slot-vendor-${idx + 1}`,
      }),
    )
    .join('\n');

  const closing = `
      <div class="contract-closing" style="margin: 18px 0 8px 0; text-align: justify;">
        <p class="mundo-novo-closing-statement" style="margin: 0 0 18px 0; text-align: justify;">
          E, assim, por estarem justos e contratados, assinam o presente, inclusive o mandatário supracitado, 03(três) vias de igual teor e forma, para um mesmo efeito, na presença de duas testemunhas abaixo que a tudo assistiram.
        </p>
        <p class="contract-closing-date" style="margin: 0 0 18px 0; text-align: right; font-weight: bold;">
          ${esc(ctx.closingLine)}
        </p>
      </div>`;

  return `
    <div class="contract-closing-and-signatures--mundo-novo" data-signature-mode="PHYSICAL_UNSIGNED">
      ${closing}
      <div class="contract-signatures contract-signatures--mundo-novo" data-signature-mode="PHYSICAL_UNSIGNED">
        <div class="signature-grid signature-grid--mundo-novo" data-signature-mode="PHYSICAL_UNSIGNED">
          ${vendorSlots}
          ${buildPhysicalSlot({
            role: ctx.buyerSignatureLabel || 'PROMITENTE COMPRADOR',
            name: ctx.buyerName,
            meta: ctx.buyerCpf ? [`CPF: ${ctx.buyerCpf}`] : [],
            dataRole: 'BUYER',
            extraClass: 'signature-slot-buyer',
          })}
          ${buildPhysicalSlot({
            role: 'INTERVENIENTE',
            name: intervenienteName,
            meta: intervenienteCnpj ? [`CNPJ: ${intervenienteCnpj}`] : [],
            dataRole: 'INTERVENIENT',
            extraClass: 'signature-slot-intervenient',
          })}
          ${buildPhysicalSlot({
            role: 'TESTEMUNHA 1',
            meta: ['NOME: ________________________________', 'CPF: ________________________________'],
            dataRole: 'WITNESS_1',
            extraClass: 'signature-slot-witness-1',
          })}
          ${buildPhysicalSlot({
            role: 'TESTEMUNHA 2',
            meta: ['NOME: ________________________________', 'CPF: ________________________________'],
            dataRole: 'WITNESS_2',
            extraClass: 'signature-slot-witness-2',
          })}
        </div>
      </div>
    </div>`;
}

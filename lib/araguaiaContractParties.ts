/**
 * Assinaturas e título — modelo ARAGUAIA (isolado).
 * PHYSICAL_UNSIGNED: linhas físicas (Daniel, Aldenise, buyer, INTERVENIENTE, testemunhas).
 * ELECTRONIC_SIGNED: representação documental sem linhas vazias (via apply helper).
 */

import type { AraguaiaContractContext } from '@/lib/araguaiaContractContext';
import {
  ARAGUAIA_CONTRACT_TITLE,
  buildAraguaiaClausesHtml,
  buildAraguaiaPartiesPreambleHtml,
} from '@/lib/araguaiaContractClauses';
import { formatSellerCpfDisplay } from '@/lib/projectContractSellers';
import {
  normalizeSaleContractSignatureRenderMode,
  type SaleContractSignatureRenderMode,
} from '@/lib/saleContractSignatureRenderMode';
import type { AraguaiaElectronicSignatureSlotInput } from '@/lib/araguaiaContractElectronicSignaturesUi';
import { buildAraguaiaElectronicSignaturesBlockHtml } from '@/lib/araguaiaContractElectronicSignaturesUi';

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

export type BuildAraguaiaSignaturesHtmlOptions = {
  /** Default: PHYSICAL_UNSIGNED (contrato comum / impressão). */
  signatureMode?: SaleContractSignatureRenderMode | string | null;
  /** Slots eletrônicos quando signatureMode = ELECTRONIC_SIGNED. */
  electronicSlots?: AraguaiaElectronicSignatureSlotInput[] | null;
};

export function buildAraguaiaPhysicalSignaturesGridHtml(
  ctx: AraguaiaContractContext,
): string {
  const intervenienteName =
    ctx.intervenienteName || 'R R NEGÓCIOS & SERVIÇOS LTDA';
  const intervenienteCnpj =
    ctx.intervenienteCnpj || '57.590.706/0001-78';
  const representativeName =
    ctx.intervenienteRepresentativeName ||
    ctx.sellers[0]?.name ||
    'Representante Legal';

  const vendorSlots = (ctx.sellers.length > 0 ? ctx.sellers : [])
    .map((seller, idx) =>
      buildPhysicalSlot({
        role: 'PROMITENTE VENDEDOR',
        name: seller?.name || `Promitente Vendedor ${idx + 1}`,
        meta: seller?.cpf
          ? [`CPF: ${formatSellerCpfDisplay(seller.cpf) || seller.cpf}`]
          : [],
        dataRole: 'VENDOR',
        extraClass: `signature-slot-vendor-${idx + 1}`,
      }),
    )
    .join('\n');

  return `
        <div class="signature-grid signature-grid--araguaia" data-signature-mode="PHYSICAL_UNSIGNED">
          ${vendorSlots}
          ${buildPhysicalSlot({
            role: 'PROMITENTE COMPRADOR(A)',
            name: ctx.buyerName,
            meta: ctx.buyerCpf ? [`CPF: ${ctx.buyerCpf}`] : [],
            dataRole: 'BUYER',
            extraClass: 'signature-slot-buyer',
          })}
          ${buildPhysicalSlot({
            role: 'INTERVENIENTE',
            name: intervenienteName,
            meta: [
              `CNPJ: ${intervenienteCnpj}`,
              'Representada por:',
              representativeName,
            ],
            dataRole: 'INTERVENIENT',
            extraClass: 'signature-slot-intervenient',
          })}
          ${buildPhysicalSlot({
            role: 'TESTEMUNHA 1',
            meta: ['Nome: ________________________________', 'CPF: ________________________________'],
            dataRole: 'WITNESS_1',
            extraClass: 'signature-slot-witness-1',
          })}
          ${buildPhysicalSlot({
            role: 'TESTEMUNHA 2',
            meta: ['Nome: ________________________________', 'CPF: ________________________________'],
            dataRole: 'WITNESS_2',
            extraClass: 'signature-slot-witness-2',
          })}
        </div>`;
}

export function buildAraguaiaSignaturesHtml(
  ctx: AraguaiaContractContext,
  options?: BuildAraguaiaSignaturesHtmlOptions,
): string {
  const mode = normalizeSaleContractSignatureRenderMode(
    options?.signatureMode,
  );
  const closing = `
      <div class="contract-closing" style="margin: 18px 0 8px 0; text-align: justify;">
        <p class="araguaia-closing-statement" style="margin: 0 0 18px 0; text-align: justify;">
          E, assim, por estarem justos e contratados, assinam o presente, inclusive o mandatário supracitado, <strong>03</strong> (três) vias de igual teor e forma, para um mesmo efeito, na presença de duas testemunhas abaixo que a tudo assistiram.
        </p>
        <p class="contract-closing-date" style="margin: 0 0 18px 0; text-align: right; font-weight: bold;">
          ${esc(ctx.closingLine)}
        </p>
      </div>`;

  if (mode === 'ELECTRONIC_SIGNED' && options?.electronicSlots?.length) {
    return `
    <div class="contract-closing-and-signatures--araguaia" data-signature-mode="ELECTRONIC_SIGNED">
      ${closing}
      ${buildAraguaiaElectronicSignaturesBlockHtml(options.electronicSlots)}
    </div>`;
  }

  return `
    <div class="contract-closing-and-signatures--araguaia" data-signature-mode="PHYSICAL_UNSIGNED">
      ${closing}
      <div class="contract-signatures contract-signatures--araguaia" data-signature-mode="PHYSICAL_UNSIGNED">
        ${buildAraguaiaPhysicalSignaturesGridHtml(ctx)}
      </div>
    </div>`;
}

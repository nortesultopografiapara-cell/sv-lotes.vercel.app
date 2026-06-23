/**
 * Cabeçalho institucional da 1ª página — SV LOTES 2.0.
 */

import type { SvLotes2ContractContext } from '@/lib/svLotes2ContractContext';
import { SV_LOTES_2_CONTRACT_TITLE } from '@/lib/svLotes2ContractLegal';

export function buildSvLotes2InstitutionalHeaderHtml(
  ctx: SvLotes2ContractContext,
): string {
  const docLine =
    ctx.empresaDocumentoFmt && ctx.empresaDocumentoFmt !== 'Não informado'
      ? `${ctx.empresaDocumentoLabel}: ${ctx.empresaDocumentoFmt}`
      : '';
  const addressLine =
    ctx.empresaEndereco && ctx.empresaEndereco !== 'Não informado'
      ? ctx.empresaEndereco
      : '';
  const contactParts = [
    ctx.empresaTelefone && ctx.empresaTelefone !== 'Não informado'
      ? ctx.empresaTelefone
      : '',
    ctx.empresaEmail && ctx.empresaEmail !== 'Não informado' ? ctx.empresaEmail : '',
  ].filter(Boolean);

  return `
    <div class="sv2-header">
      ${ctx.empresaLogoHtml ? `<div class="sv2-header-logo">${ctx.empresaLogoHtml}</div>` : ''}
      <h2>${SV_LOTES_2_CONTRACT_TITLE}</h2>
      <p class="sv2-header-contract">Contrato nº ${ctx.contractNumber}</p>
      <div class="sv2-header-company">
        <p class="sv2-header-company-name">${ctx.empresaNome}</p>
        ${docLine ? `<p class="sv2-header-company-meta">${docLine}</p>` : ''}
        ${addressLine ? `<p class="sv2-header-company-meta">${addressLine}</p>` : ''}
        ${contactParts.length ? `<p class="sv2-header-company-meta">${contactParts.join(' · ')}</p>` : ''}
      </div>
    </div>`;
}

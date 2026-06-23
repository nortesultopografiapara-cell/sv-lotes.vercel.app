/**
 * Capa da 1ª página — SV LOTES 2.0 (título + número do contrato).
 * Dados institucionais da empresa ficam no cabeçalho PDF.
 */

import type { SvLotes2ContractContext } from '@/lib/svLotes2ContractContext';
import { SV_LOTES_2_CONTRACT_TITLE } from '@/lib/svLotes2ContractLegal';

export function buildSvLotes2InstitutionalHeaderHtml(
  ctx: SvLotes2ContractContext,
): string {
  return `
    <div class="sv2-header">
      <h2>${SV_LOTES_2_CONTRACT_TITLE}</h2>
      <p class="sv2-header-contract">Contrato nº ${ctx.contractNumber}</p>
    </div>`;
}

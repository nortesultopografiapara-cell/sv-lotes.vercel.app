/**
 * UI — pré-visualização de Contratos Antigos.
 */

import type { ValidatedLegacyContractRow } from '@/lib/imports/modules/legacy-contracts/types';
import { canLegacyContractRowBeManuallyLinked } from '@/lib/imports/modules/legacy-contracts/manualLink';
import { IMPORT_ROW_STATUS_LABELS } from '@/components/imports/customerImportUi';

export function getLegacyContractSaleLocatedLabel(
  row: ValidatedLegacyContractRow,
): string {
  if (row.manual_link_applied) return 'Manual';
  if (row.sale_id) return `Sim (${row.sale_id.slice(0, 8)}…)`;
  return 'Não';
}

export function getLegacyContractRowResultLabel(
  row: ValidatedLegacyContractRow,
): string {
  if (row.manual_link_applied && row.importable) {
    return 'Pronto para importar';
  }
  return IMPORT_ROW_STATUS_LABELS[row.status] || row.status;
}

export function legacyContractRowResultClass(status: string): string {
  switch (status) {
    case 'valid':
      return 'text-emerald-400';
    case 'warning':
      return 'text-amber-400';
    case 'error':
      return 'text-red-400';
    case 'duplicate':
      return 'text-orange-400';
    case 'existing':
      return 'text-slate-400';
    default:
      return 'text-[var(--text-secondary)]';
  }
}

export function shouldShowLegacyContractManualLinkButton(
  row: ValidatedLegacyContractRow,
): boolean {
  return canLegacyContractRowBeManuallyLinked(row);
}

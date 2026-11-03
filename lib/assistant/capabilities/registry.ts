import type { AssistantCapability } from './types';
import { capabilityFromProcedure } from './derive';
import { listAssistantProcedures } from '../knowledgeBase';
import { ASSISTANT_GLOBAL_SHORTCUTS, ASSISTANT_CONTEXTUAL_SHORTCUTS } from '../shortcuts';
import brokerPhoto from '../../../docs/assistant-capabilities/brokers/photo-update.json';
import brokerMySales from '../../../docs/assistant-capabilities/brokers/my-sales.json';
import financialAccounts from '../../../docs/assistant-capabilities/settings/financial-accounts.json';
import dataMigration from '../../../docs/assistant-capabilities/settings/data-migration.json';
import clientPortal from '../../../docs/assistant-capabilities/settings/client-portal.json';
import financeAsaas from '../../../docs/assistant-capabilities/finance/asaas-installment.json';
import gisPranchaGeral from '../../../docs/assistant-capabilities/gis/prancha-geral.json';
import gisPranchaLote from '../../../docs/assistant-capabilities/gis/prancha-lote.json';
import gisMemorial from '../../../docs/assistant-capabilities/gis/memorial.json';
import gisConfrontacoes from '../../../docs/assistant-capabilities/gis/confrontacoes.json';
import saleRelease from '../../../docs/assistant-capabilities/gis/sale-release.json';
import saleDesistencia from '../../../docs/assistant-capabilities/gis/sale-termination-desistencia.json';
import saleDistrato from '../../../docs/assistant-capabilities/gis/sale-termination-distrato.json';
import saleInadimplencia from '../../../docs/assistant-capabilities/gis/sale-termination-inadimplencia.json';
import saleLotSwap from '../../../docs/assistant-capabilities/gis/sale-lot-swap.json';
import saleTitleTransfer from '../../../docs/assistant-capabilities/gis/sale-title-transfer.json';
import saleEdit from '../../../docs/assistant-capabilities/gis/sale-edit.json';
import saleCharges from '../../../docs/assistant-capabilities/gis/sale-charges.json';
import soldViewContract from '../../../docs/assistant-capabilities/gis/sold-view-contract.json';
import soldViewFinance from '../../../docs/assistant-capabilities/gis/sold-view-finance.json';
import contractCancel from '../../../docs/assistant-capabilities/contracts/contract-cancel.json';

const EXPLICIT: AssistantCapability[] = [
  brokerPhoto,
  brokerMySales,
  financialAccounts,
  dataMigration,
  clientPortal,
  financeAsaas,
  gisPranchaGeral,
  gisPranchaLote,
  gisMemorial,
  gisConfrontacoes,
  saleRelease,
  saleDesistencia,
  saleDistrato,
  saleInadimplencia,
  saleLotSwap,
  saleTitleTransfer,
  saleEdit,
  saleCharges,
  soldViewContract,
  soldViewFinance,
  contractCancel,
] as AssistantCapability[];

function claimedKeys(explicit: AssistantCapability[]): Set<string> {
  const keys = new Set<string>();
  for (const item of explicit) {
    keys.add(item.id);
    for (const knowledgeId of item.knowledgeIds || []) keys.add(knowledgeId);
  }
  return keys;
}

export function listExplicitAssistantCapabilities(): AssistantCapability[] {
  return EXPLICIT.slice();
}

export function listDerivedAssistantCapabilities(): AssistantCapability[] {
  const claimed = claimedKeys(EXPLICIT);
  return listAssistantProcedures()
    .filter((procedure) => !claimed.has(procedure.id) && !procedure.tags.some((tag) => claimed.has(tag)))
    .map(capabilityFromProcedure);
}

export function listAssistantCapabilities(): AssistantCapability[] {
  return [...listExplicitAssistantCapabilities(), ...listDerivedAssistantCapabilities()];
}

export function getAssistantCapabilityById(id: string): AssistantCapability | null {
  return listAssistantCapabilities().find((item) => item.id === id) ?? null;
}

export function listAssistantCapabilityShortcuts(): Array<{ id: string; label: string; procedureId?: string }> {
  return [...ASSISTANT_GLOBAL_SHORTCUTS, ...ASSISTANT_CONTEXTUAL_SHORTCUTS].map((item) => ({
    id: item.id,
    label: item.label,
    procedureId: item.procedureId,
  }));
}

export function countAssistantCapabilities(): { total: number; explicit: number; derived: number } {
  const explicit = listExplicitAssistantCapabilities().length;
  const derived = listDerivedAssistantCapabilities().length;
  return { total: explicit + derived, explicit, derived };
}

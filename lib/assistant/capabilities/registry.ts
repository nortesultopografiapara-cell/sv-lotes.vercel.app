import type { AssistantCapability } from './types';
import { capabilityFromProcedure } from './derive';
import { listAssistantProcedures } from '../knowledgeBase';
import { ASSISTANT_GLOBAL_SHORTCUTS, ASSISTANT_CONTEXTUAL_SHORTCUTS } from '../shortcuts';
import brokerPhoto from '../../../docs/assistant-capabilities/brokers/photo-update.json';
import financialAccounts from '../../../docs/assistant-capabilities/settings/financial-accounts.json';
import gisPranchaGeral from '../../../docs/assistant-capabilities/gis/prancha-geral.json';
import gisPranchaLote from '../../../docs/assistant-capabilities/gis/prancha-lote.json';
import gisMemorial from '../../../docs/assistant-capabilities/gis/memorial.json';
import gisConfrontacoes from '../../../docs/assistant-capabilities/gis/confrontacoes.json';

const EXPLICIT: AssistantCapability[] = [
  brokerPhoto,
  financialAccounts,
  gisPranchaGeral,
  gisPranchaLote,
  gisMemorial,
  gisConfrontacoes,
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

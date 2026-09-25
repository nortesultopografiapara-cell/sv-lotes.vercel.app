import {
  EMPTY_ASSISTANT_UI_STATE,
  resolveContractNextAction,
  sanitizeUiClientHints,
  type AssistantUiClientHints,
  type AssistantUiSafeState,
} from './uiSnapshot';

export type AssistantProjectRecord = {
  id: string;
  tenantId: string;
  name: string | null;
  contractModel: string | null;
};

export type AssistantLotRecord = {
  id: string;
  tenantId: string;
  projectId: string | null;
  blockNumber: string | null;
  lotNumber: string | null;
  status: string | null;
};

export type AssistantContractRecord = {
  id: string;
  tenantId: string;
  contractNumber: string | null;
  status: string | null;
  signatureStatus: string | null;
  needsRegenerar: boolean;
  projectName: string | null;
  contractModel: string | null;
  partyTotal: number | null;
  partySigned: number | null;
};

export type AssistantEntityLoaders = {
  loadProject: (id: string) => Promise<AssistantProjectRecord | null>;
  loadLot: (id: string) => Promise<AssistantLotRecord | null>;
  loadContract: (id: string) => Promise<AssistantContractRecord | null>;
};

function sameTenant(recordTenant: string | null | undefined, authTenant: string | null): boolean {
  if (!authTenant || !recordTenant) return false;
  return String(recordTenant) === String(authTenant);
}

function sliceName(value: string | null | undefined): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, 80);
}

/**
 * Valida IDs do frontend contra o tenant autenticado.
 * Project/lote/contrato de outro tenant são descartados.
 */
export async function hydrateAssistantUiContext(input: {
  tenantId: string | null;
  hints: unknown;
  loaders: AssistantEntityLoaders;
}): Promise<{ ui: AssistantUiSafeState; rejectedForeignTenant: boolean }> {
  const hints: AssistantUiClientHints = sanitizeUiClientHints(input.hints);
  const ui: AssistantUiSafeState = {
    ...EMPTY_ASSISTANT_UI_STATE,
    lotModalOpen: Boolean(hints.lotModalOpen),
    activeLotTab: hints.activeLotTab,
    saleFormOpen: Boolean(hints.saleFormOpen),
    paymentMode: hints.paymentMode,
    customerSelected: Boolean(hints.customerSelected),
  };

  let rejectedForeignTenant = false;
  const tenantId = input.tenantId;

  if (hints.projectId) {
    const project = await input.loaders.loadProject(hints.projectId);
    if (project && sameTenant(project.tenantId, tenantId)) {
      ui.projectId = project.id;
      ui.projectName = sliceName(project.name);
      ui.contractModel = project.contractModel ? String(project.contractModel).toUpperCase().slice(0, 40) : null;
    } else if (hints.projectId) {
      rejectedForeignTenant = true;
    }
  }

  if (hints.lotId) {
    const lot = await input.loaders.loadLot(hints.lotId);
    if (lot && sameTenant(lot.tenantId, tenantId)) {
      ui.lotId = lot.id;
      ui.blockNumber = sliceName(hints.blockNumber) || sliceName(lot.blockNumber);
      ui.lotNumber = sliceName(hints.lotNumber) || sliceName(lot.lotNumber);
      ui.lotStatus = sliceName(hints.lotStatus) || sliceName(lot.status);
      if (lot.projectId && !ui.projectId) {
        const project = await input.loaders.loadProject(lot.projectId);
        if (project && sameTenant(project.tenantId, tenantId)) {
          ui.projectId = project.id;
          ui.projectName = sliceName(project.name);
          ui.contractModel = project.contractModel
            ? String(project.contractModel).toUpperCase().slice(0, 40)
            : ui.contractModel;
        }
      }
    } else {
      rejectedForeignTenant = true;
      ui.lotModalOpen = false;
      ui.activeLotTab = null;
      ui.saleFormOpen = false;
      ui.customerSelected = false;
      ui.paymentMode = null;
    }
  }

  if (hints.contractId) {
    const contract = await input.loaders.loadContract(hints.contractId);
    if (contract && sameTenant(contract.tenantId, tenantId)) {
      ui.contractId = contract.id;
      ui.contractNumber = sliceName(contract.contractNumber);
      ui.contractStatus = sliceName(contract.status);
      ui.signatureStatus = sliceName(contract.signatureStatus);
      ui.needsRegenerar = Boolean(contract.needsRegenerar);
      ui.eSignStarted = Boolean(contract.signatureStatus);
      ui.partyTotal = contract.partyTotal;
      ui.partySigned = contract.partySigned;
      ui.nextAction = resolveContractNextAction({
        contractStatus: contract.status,
        signatureStatus: contract.signatureStatus,
        needsRegenerar: contract.needsRegenerar,
      });
      if (!ui.projectName && contract.projectName) ui.projectName = sliceName(contract.projectName);
      if (!ui.contractModel && contract.contractModel) {
        ui.contractModel = String(contract.contractModel).toUpperCase().slice(0, 40);
      }
    } else {
      rejectedForeignTenant = true;
    }
  }

  return { ui, rejectedForeignTenant };
}

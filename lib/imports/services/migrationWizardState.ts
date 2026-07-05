/**
 * Estado e navegação do wizard de migração.
 */

import type { BrokerImportValidationResult } from '@/lib/imports/modules/brokers/types';
import type { CustomerImportValidationResult } from '@/lib/imports/modules/customers/types';
import type { LegacyContractImportValidationResult } from '@/lib/imports/modules/legacy-contracts/types';
import type { SaleImportValidationResult } from '@/lib/imports/modules/sales/types';
import {
  getNextWizardStepForModule,
  getPreviousWizardStepForModule,
  getWizardStepIndexForModule,
  getWizardStepOrder,
} from '@/lib/imports/services/migrationWizardSteps';
import type {
  ActiveImportModuleId,
  ImportModuleId,
  MigrationWizardState,
  MigrationWizardStepId,
} from '@/lib/imports/types';

export const INITIAL_MIGRATION_WIZARD_STATE: MigrationWizardState = {
  step: 'welcome',
  selectedModuleId: null,
  mappingFile: null,
  documentFiles: [],
  customerValidation: null,
  customerPreviewFilter: 'all',
  customerImportResult: null,
  brokerValidation: null,
  brokerPreviewFilter: 'all',
  brokerImportResult: null,
  salesValidation: null,
  salesPreviewFilter: 'all',
  salesImportResult: null,
  legacyContractsValidation: null,
  legacyContractsPreviewFilter: 'all',
  legacyContractsImportResult: null,
  validating: false,
  importing: false,
  validationError: null,
};

export function isActiveImportModule(
  moduleId: ImportModuleId | null,
): moduleId is ActiveImportModuleId {
  return (
    moduleId === 'customers' ||
    moduleId === 'brokers' ||
    moduleId === 'sales' ||
    moduleId === 'legacy_contracts'
  );
}

export function getWizardStepIndex(
  step: MigrationWizardStepId,
  moduleId: ImportModuleId | null = null,
): number {
  return getWizardStepIndexForModule(moduleId, step);
}

export { getWizardStepOrder };

function hasModuleValidation(state: MigrationWizardState): boolean {
  if (state.selectedModuleId === 'customers') return state.customerValidation != null;
  if (state.selectedModuleId === 'brokers') return state.brokerValidation != null;
  if (state.selectedModuleId === 'sales') return state.salesValidation != null;
  if (state.selectedModuleId === 'legacy_contracts') {
    return state.legacyContractsValidation != null;
  }
  return false;
}

export function canAdvanceWizardStep(state: MigrationWizardState): boolean {
  switch (state.step) {
    case 'welcome':
      return true;
    case 'select-type':
      return state.selectedModuleId != null;
    case 'template':
      return state.selectedModuleId != null;
    case 'upload':
      if (state.validating) return false;
      return state.mappingFile != null;
    case 'upload-documents':
      if (state.validating) return false;
      return state.documentFiles.length > 0;
    case 'pre-validation':
      if (isActiveImportModule(state.selectedModuleId)) {
        return hasModuleValidation(state) && !state.validating;
      }
      return state.selectedModuleId != null && state.mappingFile != null;
    case 'preview':
      if (isActiveImportModule(state.selectedModuleId)) {
        return hasModuleValidation(state);
      }
      return state.selectedModuleId != null && state.mappingFile != null;
    case 'confirmation':
      return false;
    default:
      return false;
  }
}

export function getNextWizardStep(
  step: MigrationWizardStepId,
  moduleId: ImportModuleId | null = null,
): MigrationWizardStepId | null {
  return getNextWizardStepForModule(moduleId, step);
}

export function getPreviousWizardStep(
  step: MigrationWizardStepId,
  moduleId: ImportModuleId | null = null,
): MigrationWizardStepId | null {
  return getPreviousWizardStepForModule(moduleId, step);
}

export function advanceWizardState(
  state: MigrationWizardState,
): MigrationWizardState {
  const next = getNextWizardStep(state.step, state.selectedModuleId);
  if (!next || !canAdvanceWizardStep(state)) return state;
  return { ...state, step: next };
}

export function applyCustomerValidationAndAdvance(
  state: MigrationWizardState,
  validation: CustomerImportValidationResult,
): MigrationWizardState {
  if (state.step !== 'upload' || state.selectedModuleId !== 'customers') {
    return state;
  }

  return {
    ...state,
    step: 'pre-validation',
    customerValidation: validation,
    validating: false,
    validationError: null,
  };
}

export function applyBrokerValidationAndAdvance(
  state: MigrationWizardState,
  validation: BrokerImportValidationResult,
): MigrationWizardState {
  if (state.step !== 'upload' || state.selectedModuleId !== 'brokers') {
    return state;
  }

  return {
    ...state,
    step: 'pre-validation',
    brokerValidation: validation,
    validating: false,
    validationError: null,
  };
}

export function applySalesValidationAndAdvance(
  state: MigrationWizardState,
  validation: SaleImportValidationResult,
): MigrationWizardState {
  if (state.step !== 'upload' || state.selectedModuleId !== 'sales') {
    return state;
  }

  return {
    ...state,
    step: 'pre-validation',
    salesValidation: validation,
    validating: false,
    validationError: null,
  };
}

export function applyLegacyContractsValidationAndAdvance(
  state: MigrationWizardState,
  validation: LegacyContractImportValidationResult,
): MigrationWizardState {
  if (
    state.step !== 'upload-documents' ||
    state.selectedModuleId !== 'legacy_contracts'
  ) {
    return state;
  }

  return {
    ...state,
    step: 'pre-validation',
    legacyContractsValidation: validation,
    validating: false,
    validationError: null,
  };
}

export function retreatWizardState(
  state: MigrationWizardState,
): MigrationWizardState {
  const prev = getPreviousWizardStep(state.step, state.selectedModuleId);
  if (!prev) return state;
  return { ...state, step: prev };
}

export function selectImportModule(
  state: MigrationWizardState,
  moduleId: ImportModuleId,
): MigrationWizardState {
  return {
    ...state,
    selectedModuleId: moduleId,
    mappingFile: null,
    documentFiles: [],
    customerValidation: null,
    customerPreviewFilter: 'all',
    customerImportResult: null,
    brokerValidation: null,
    brokerPreviewFilter: 'all',
    brokerImportResult: null,
    salesValidation: null,
    salesPreviewFilter: 'all',
    salesImportResult: null,
    legacyContractsValidation: null,
    legacyContractsPreviewFilter: 'all',
    legacyContractsImportResult: null,
    validating: false,
    importing: false,
    validationError: null,
    step: state.step === 'welcome' ? 'select-type' : state.step,
  };
}

export function startMigrationWizard(): MigrationWizardState {
  return { ...INITIAL_MIGRATION_WIZARD_STATE, step: 'select-type' };
}

export function validateCurrentWizardStep(
  state: MigrationWizardState,
  files: { mappingFile: File | null; documentFiles: File[] },
): string | null {
  switch (state.step) {
    case 'upload':
      if (!state.mappingFile && !files.mappingFile) {
        if (state.selectedModuleId === 'legacy_contracts') return null;
        return 'Selecione um arquivo antes de avançar.';
      }
      return null;
    case 'upload-documents':
      if (!files.documentFiles.length && state.documentFiles.length === 0) {
        return 'Selecione ao menos um PDF ou um ZIP contendo os contratos antigos.';
      }
      return null;
    default:
      return null;
  }
}

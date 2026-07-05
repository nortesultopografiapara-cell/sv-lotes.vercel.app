/**
 * Estado e navegação do wizard de migração.
 */

import { MIGRATION_WIZARD_STEPS } from '@/lib/imports/constants';
import type { BrokerImportValidationResult } from '@/lib/imports/modules/brokers/types';
import type { CustomerImportValidationResult } from '@/lib/imports/modules/customers/types';
import type { SaleImportValidationResult } from '@/lib/imports/modules/sales/types';
import type {
  ActiveImportModuleId,
  ImportModuleId,
  MigrationWizardState,
  MigrationWizardStepId,
} from '@/lib/imports/types';

export const INITIAL_MIGRATION_WIZARD_STATE: MigrationWizardState = {
  step: 'welcome',
  selectedModuleId: null,
  uploadedFile: null,
  customerValidation: null,
  customerPreviewFilter: 'all',
  customerImportResult: null,
  brokerValidation: null,
  brokerPreviewFilter: 'all',
  brokerImportResult: null,
  salesValidation: null,
  salesPreviewFilter: 'all',
  salesImportResult: null,
  validating: false,
  importing: false,
  validationError: null,
};

export function isActiveImportModule(
  moduleId: ImportModuleId | null,
): moduleId is ActiveImportModuleId {
  return moduleId === 'customers' || moduleId === 'brokers' || moduleId === 'sales';
}

export function getWizardStepIndex(step: MigrationWizardStepId): number {
  return MIGRATION_WIZARD_STEPS.findIndex((s) => s.id === step);
}

export function getWizardStepOrder(step: MigrationWizardStepId): number {
  return MIGRATION_WIZARD_STEPS.find((s) => s.id === step)?.order ?? 0;
}

function hasModuleValidation(state: MigrationWizardState): boolean {
  if (state.selectedModuleId === 'customers') return state.customerValidation != null;
  if (state.selectedModuleId === 'brokers') return state.brokerValidation != null;
  if (state.selectedModuleId === 'sales') return state.salesValidation != null;
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
      return state.uploadedFile != null;
    case 'pre-validation':
      if (isActiveImportModule(state.selectedModuleId)) {
        return hasModuleValidation(state) && !state.validating;
      }
      return state.selectedModuleId != null && state.uploadedFile != null;
    case 'preview':
      if (isActiveImportModule(state.selectedModuleId)) {
        return hasModuleValidation(state);
      }
      return state.selectedModuleId != null && state.uploadedFile != null;
    case 'confirmation':
      return false;
    default:
      return false;
  }
}

export function getNextWizardStep(
  step: MigrationWizardStepId,
): MigrationWizardStepId | null {
  const idx = getWizardStepIndex(step);
  if (idx < 0 || idx >= MIGRATION_WIZARD_STEPS.length - 1) return null;
  return MIGRATION_WIZARD_STEPS[idx + 1].id;
}

export function getPreviousWizardStep(
  step: MigrationWizardStepId,
): MigrationWizardStepId | null {
  const idx = getWizardStepIndex(step);
  if (idx <= 0) return null;
  return MIGRATION_WIZARD_STEPS[idx - 1].id;
}

export function advanceWizardState(
  state: MigrationWizardState,
): MigrationWizardState {
  const next = getNextWizardStep(state.step);
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

export function retreatWizardState(
  state: MigrationWizardState,
): MigrationWizardState {
  const prev = getPreviousWizardStep(state.step);
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
    uploadedFile: null,
    customerValidation: null,
    customerPreviewFilter: 'all',
    customerImportResult: null,
    brokerValidation: null,
    brokerPreviewFilter: 'all',
    brokerImportResult: null,
    salesValidation: null,
    salesPreviewFilter: 'all',
    salesImportResult: null,
    validating: false,
    importing: false,
    validationError: null,
    step: state.step === 'welcome' ? 'select-type' : state.step,
  };
}

export function startMigrationWizard(): MigrationWizardState {
  return { ...INITIAL_MIGRATION_WIZARD_STATE, step: 'select-type' };
}

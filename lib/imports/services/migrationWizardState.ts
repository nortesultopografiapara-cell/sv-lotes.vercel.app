/**
 * Estado e navegação do wizard de migração.
 */

import { MIGRATION_WIZARD_STEPS } from '@/lib/imports/constants';
import type {
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
  validating: false,
  importing: false,
};

export function getWizardStepIndex(step: MigrationWizardStepId): number {
  return MIGRATION_WIZARD_STEPS.findIndex((s) => s.id === step);
}

export function getWizardStepOrder(step: MigrationWizardStepId): number {
  return MIGRATION_WIZARD_STEPS.find((s) => s.id === step)?.order ?? 0;
}

function isCustomersFlow(state: MigrationWizardState): boolean {
  return state.selectedModuleId === 'customers';
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
      if (isCustomersFlow(state)) {
        return state.uploadedFile != null;
      }
      return state.uploadedFile != null;
    case 'pre-validation':
      if (isCustomersFlow(state)) {
        return state.customerValidation != null && !state.validating;
      }
      return state.selectedModuleId != null && state.uploadedFile != null;
    case 'preview':
      if (isCustomersFlow(state)) {
        return state.customerValidation != null;
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
    validating: false,
    importing: false,
    step: state.step === 'welcome' ? 'select-type' : state.step,
  };
}

export function startMigrationWizard(): MigrationWizardState {
  return { ...INITIAL_MIGRATION_WIZARD_STATE, step: 'select-type' };
}

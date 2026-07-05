/**
 * Passos do wizard — migração de dados.
 */

import type { ImportModuleId, MigrationWizardStepId } from '@/lib/imports/types';

const BASE_STEPS: MigrationWizardStepId[] = [
  'welcome',
  'select-type',
  'template',
  'upload',
];

const TAIL_STEPS: MigrationWizardStepId[] = [
  'pre-validation',
  'preview',
  'confirmation',
];

export function getWizardStepsForModule(
  moduleId: ImportModuleId | null,
): { id: MigrationWizardStepId; label: string; order: number }[] {
  const steps: MigrationWizardStepId[] =
    moduleId === 'legacy_contracts'
      ? [...BASE_STEPS, 'upload-documents', ...TAIL_STEPS]
      : [...BASE_STEPS, ...TAIL_STEPS];

  const labels: Record<MigrationWizardStepId, string> = {
    welcome: 'Boas-vindas',
    'select-type': 'Tipo',
    template: 'Modelo',
    upload: moduleId === 'legacy_contracts' ? 'Planilha' : 'Upload',
    'upload-documents': 'PDFs',
    'pre-validation': 'Pré-validação',
    preview: 'Pré-visualização',
    confirmation: 'Confirmação',
  };

  return steps.map((id, index) => ({
    id,
    label: labels[id],
    order: index + 1,
  }));
}

export function getWizardStepIndexForModule(
  moduleId: ImportModuleId | null,
  step: MigrationWizardStepId,
): number {
  return getWizardStepsForModule(moduleId).findIndex((item) => item.id === step);
}

export function getNextWizardStepForModule(
  moduleId: ImportModuleId | null,
  step: MigrationWizardStepId,
): MigrationWizardStepId | null {
  const steps = getWizardStepsForModule(moduleId);
  const idx = steps.findIndex((item) => item.id === step);
  if (idx < 0 || idx >= steps.length - 1) return null;
  return steps[idx + 1].id;
}

export function getPreviousWizardStepForModule(
  moduleId: ImportModuleId | null,
  step: MigrationWizardStepId,
): MigrationWizardStepId | null {
  const steps = getWizardStepsForModule(moduleId);
  const idx = steps.findIndex((item) => item.id === step);
  if (idx <= 0) return null;
  return steps[idx - 1].id;
}

export function getWizardStepOrder(
  moduleId: ImportModuleId | null,
  step: MigrationWizardStepId,
): number {
  const idx = getWizardStepIndexForModule(moduleId, step);
  return idx >= 0 ? idx + 1 : 0;
}

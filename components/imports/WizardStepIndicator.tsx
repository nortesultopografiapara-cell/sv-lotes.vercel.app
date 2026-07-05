'use client';

import { getWizardStepsForModule } from '@/lib/imports/services/migrationWizardSteps';
import type { ImportModuleId, MigrationWizardStepId } from '@/lib/imports/types';

type WizardStepIndicatorProps = {
  currentStep: MigrationWizardStepId;
  moduleId?: ImportModuleId | null;
};

export function WizardStepIndicator({
  currentStep,
  moduleId = null,
}: WizardStepIndicatorProps) {
  const steps = getWizardStepsForModule(moduleId);
  const currentOrder =
    steps.find((step) => step.id === currentStep)?.order ?? 1;

  return (
    <ol className="flex flex-wrap gap-2 mb-6" aria-label="Etapas do assistente">
      {steps.map((step) => {
        const active = step.id === currentStep;
        const done = step.order < currentOrder;
        return (
          <li
            key={step.id}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium border ${
              active
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                : done
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-[var(--border-color)] text-[var(--text-muted)]'
            }`}
          >
            <span className="font-mono">{step.order}</span>
            <span>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

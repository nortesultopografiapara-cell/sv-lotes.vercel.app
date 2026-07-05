'use client';

import { MIGRATION_WIZARD_STEPS } from '@/lib/imports/constants';
import type { MigrationWizardStepId } from '@/lib/imports/types';

type WizardStepIndicatorProps = {
  currentStep: MigrationWizardStepId;
};

export function WizardStepIndicator({ currentStep }: WizardStepIndicatorProps) {
  const currentOrder =
    MIGRATION_WIZARD_STEPS.find((s) => s.id === currentStep)?.order ?? 1;

  return (
    <ol className="flex flex-wrap gap-2 mb-6" aria-label="Etapas do assistente">
      {MIGRATION_WIZARD_STEPS.map((step) => {
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

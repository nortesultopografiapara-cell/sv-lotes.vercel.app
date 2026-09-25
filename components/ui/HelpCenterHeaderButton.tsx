'use client';

import { Sparkles } from 'lucide-react';
import {
  ASSISTANT_BUTTON_LABEL,
  ASSISTANT_BUTTON_MOBILE_LABEL,
  ASSISTANT_TOOLTIP_DESCRIPTION,
  ASSISTANT_TOOLTIP_TITLE,
} from '@/lib/assistant';
import { useAssistantPanelOptional } from '@/contexts/AssistantPanelContext';

type HelpCenterHeaderButtonProps = {
  variant: 'desktop' | 'mobile';
};

export function HelpCenterHeaderButton({ variant }: HelpCenterHeaderButtonProps) {
  const assistant = useAssistantPanelOptional();
  const isActive = Boolean(assistant?.open);

  return (
    <div className="relative group shrink-0">
      <button
        type="button"
        className={[
          'sv-help-center-btn',
          variant === 'mobile' ? 'sv-help-center-btn--mobile' : '',
          isActive ? 'is-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={ASSISTANT_BUTTON_LABEL}
        title={ASSISTANT_TOOLTIP_TITLE}
        data-testid="assistant-sv-header-button"
        onClick={() => assistant?.toggle()}
      >
        <Sparkles className="w-4 h-4 shrink-0 text-white" aria-hidden />
        {variant === 'desktop' ? (
          <span className="whitespace-nowrap">{ASSISTANT_BUTTON_LABEL}</span>
        ) : (
          <span className="whitespace-nowrap text-[11px] leading-none">{ASSISTANT_BUTTON_MOBILE_LABEL}</span>
        )}
      </button>

      {variant === 'desktop' ? (
        <div className="sv-help-center-tooltip" role="tooltip">
          <p className="text-xs font-semibold text-[var(--text-primary)]">{ASSISTANT_TOOLTIP_TITLE}</p>
          <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
            {ASSISTANT_TOOLTIP_DESCRIPTION}
          </p>
        </div>
      ) : null}
    </div>
  );
}

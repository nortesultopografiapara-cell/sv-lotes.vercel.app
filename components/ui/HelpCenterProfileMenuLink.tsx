'use client';

import { Sparkles } from 'lucide-react';
import { ASSISTANT_BUTTON_LABEL } from '@/lib/assistant';
import { useAssistantPanelOptional } from '@/contexts/AssistantPanelContext';

const DEFAULT_CLASS =
  'flex items-center gap-3 px-3 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors mt-1 w-full text-left';

type HelpCenterProfileMenuLinkProps = {
  className?: string;
};

/** Abre o Assistente SV — o Manual Completo permanece como fallback dentro do painel. */
export function HelpCenterProfileMenuLink({
  className = DEFAULT_CLASS,
}: HelpCenterProfileMenuLinkProps) {
  const assistant = useAssistantPanelOptional();

  return (
    <button
      type="button"
      className={className}
      aria-label={ASSISTANT_BUTTON_LABEL}
      data-testid="assistant-sv-profile-link"
      onClick={() => assistant?.setOpen(true)}
    >
      <Sparkles className="w-4 h-4 shrink-0" aria-hidden />
      {ASSISTANT_BUTTON_LABEL}
    </button>
  );
}

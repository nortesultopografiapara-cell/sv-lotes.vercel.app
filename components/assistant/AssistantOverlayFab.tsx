'use client';

import { Sparkles } from 'lucide-react';
import { useAssistantPanel } from '@/contexts/AssistantPanelContext';
import { useAssistantUiStateOptional } from '@/contexts/AssistantUiStateContext';
import { ASSISTANT_BUTTON_LABEL, ASSISTANT_TOOLTIP_TITLE } from '@/lib/assistant';

/** Botão compacto acima de modais operacionais (Nova venda / Reserva / edição). */
export function AssistantOverlayFab() {
  const { open, setOpen } = useAssistantPanel();
  const ui = useAssistantUiStateOptional();
  const overlayOpen = Boolean(ui?.hints.saleFormOpen);
  if (open || !overlayOpen) return null;

  return (
    <button
      type="button"
      className="sv-assistant-overlay-fab"
      data-testid="assistant-sv-overlay-fab"
      aria-label={ASSISTANT_BUTTON_LABEL}
      title={ASSISTANT_TOOLTIP_TITLE}
      onClick={() => setOpen(true)}
    >
      <Sparkles className="h-4 w-4" aria-hidden />
      <span>IA</span>
    </button>
  );
}

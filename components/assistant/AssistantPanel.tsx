'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpenText, Loader2, Send, Sparkles, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAssistantPanel } from '@/contexts/AssistantPanelContext';
import { useGisSelectedProject } from '@/contexts/GisSelectedProjectContext';
import { useAssistantUiStateOptional } from '@/contexts/AssistantUiStateContext';
import { AssistantSafeMarkdown } from '@/components/assistant/AssistantSafeMarkdown';
import {
  ASSISTANT_GREETING,
  ASSISTANT_INPUT_PLACEHOLDER,
  ASSISTANT_LOCAL_FALLBACK_NOTICE,
  ASSISTANT_MANUAL_FALLBACK_LABEL,
  ASSISTANT_MANUAL_HREF,
  ASSISTANT_PANEL_SUBTITLE,
  ASSISTANT_PANEL_TITLE,
  ASSISTANT_THINKING_LABEL,
  buildSafeAssistantContext,
  listVisibleAssistantShortcuts,
  type AssistantMessage,
  type AssistantShortcut,
} from '@/lib/assistant';
import { historyFromMessages, requestAssistantAsk } from '@/lib/assistant/clientAsk';
import { isClientPortalEnabledForUi } from '@/lib/portal-cliente/config';
import { EMPTY_ASSISTANT_UI_STATE } from '@/lib/assistant/uiSnapshot';

function nextMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AssistantPanel() {
  const pathname = usePathname();
  const { open, setOpen, pendingQuestion, consumePendingQuestion, role, tenantName, impersonatingTenant } =
    useAssistantPanel();
  const { project } = useGisSelectedProject();
  const uiState = useAssistantUiStateOptional();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [
    { id: 'greeting', role: 'assistant', text: ASSISTANT_GREETING },
  ]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const context = useMemo(
    () =>
      buildSafeAssistantContext({
        pathname,
        role,
        tenantName,
        projectName: project?.name ?? null,
        contractModel: project?.contractModel ?? null,
        impersonatingTenant,
        flags: {
          clientPortal: isClientPortalEnabledForUi(),
        },
        ui: {
          ...EMPTY_ASSISTANT_UI_STATE,
          projectId: uiState?.hints.projectId || project?.id || null,
          projectName: project?.name ?? null,
          contractModel: project?.contractModel ?? null,
          lotId: uiState?.hints.lotId || null,
          blockNumber: uiState?.hints.blockNumber || null,
          lotNumber: uiState?.hints.lotNumber || null,
          lotStatus: uiState?.hints.lotStatus || null,
          lotModalOpen: Boolean(uiState?.hints.lotModalOpen),
          activeLotTab: uiState?.hints.activeLotTab || null,
          saleFormOpen: Boolean(uiState?.hints.saleFormOpen),
          paymentMode: uiState?.hints.paymentMode || null,
          customerSelected: Boolean(uiState?.hints.customerSelected),
          installmentsFilled: Boolean(uiState?.hints.installmentsFilled),
          firstDueFilled: Boolean(uiState?.hints.firstDueFilled),
          brokerSelected: Boolean(uiState?.hints.brokerSelected),
          downPaymentFilled: Boolean(uiState?.hints.downPaymentFilled),
          contractId: uiState?.hints.contractId || null,
        },
      }),
    [pathname, role, tenantName, project?.id, project?.name, project?.contractModel, impersonatingTenant, uiState?.hints],
  );

  const shortcuts = useMemo(() => listVisibleAssistantShortcuts(context), [context]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || !pendingQuestion) return;
    const next = consumePendingQuestion();
    if (next) {
      void submitQuestion(next.question, next.procedureId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingQuestion]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  async function submitQuestion(question: string, procedureId?: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setInput('');
    const history = historyFromMessages(messages);
    setMessages((prev) => [...prev, { id: nextMessageId(), role: 'user', text: trimmed }]);
    setLoading(true);
    try {
      const result = await requestAssistantAsk({
        question: trimmed,
        context,
        procedureId,
        history,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: 'assistant',
          text: result.text,
          kind: result.kind,
          notice: result.notice || (result.source === 'local-fallback' ? ASSISTANT_LOCAL_FALLBACK_NOTICE : null),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: 'assistant',
          text: 'Não consegui responder agora. Tente de novo em instantes.',
          kind: 'unknown',
          notice: ASSISTANT_LOCAL_FALLBACK_NOTICE,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleShortcut(shortcut: AssistantShortcut) {
    void submitQuestion(shortcut.question, shortcut.procedureId);
  }

  if (!open) return null;
  const overModal = Boolean(uiState?.hints.saleFormOpen);

  return (
    <div
      className={overModal ? 'sv-assistant-root sv-assistant-root--over-modal' : 'sv-assistant-root'}
      data-testid="assistant-sv-panel"
    >
      <button
        type="button"
        className="sv-assistant-backdrop"
        aria-label="Fechar Assistente SV"
        onClick={() => setOpen(false)}
      />
      <aside className="sv-assistant-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-sv-title">
        <header className="sv-assistant-header">
          <div className="sv-assistant-header-icon" aria-hidden>
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="assistant-sv-title" className="sv-assistant-title">
              {ASSISTANT_PANEL_TITLE}
            </h2>
            <p className="sv-assistant-subtitle">{ASSISTANT_PANEL_SUBTITLE}</p>
          </div>
          <button
            type="button"
            className="sv-assistant-close"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={listRef} className="sv-assistant-thread">
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'user' ? 'sv-assistant-bubble sv-assistant-bubble--user' : 'sv-assistant-bubble'
              }
            >
              {message.role === 'assistant' ? (
                <p className="sv-assistant-bubble-kicker">Assistente SV</p>
              ) : null}
              {message.role === 'assistant' ? (
                <AssistantSafeMarkdown text={message.text} />
              ) : (
                <pre className="sv-assistant-bubble-text">{message.text}</pre>
              )}
              {message.role === 'assistant' && message.notice ? (
                <p className="sv-assistant-notice" data-testid="assistant-sv-notice">
                  {message.notice}
                </p>
              ) : null}
            </div>
          ))}
          {loading ? (
            <div className="sv-assistant-bubble" data-testid="assistant-sv-loading">
              <p className="sv-assistant-bubble-kicker">Assistente SV</p>
              <p className="sv-assistant-loading">
                <Loader2 className="h-4 w-4 animate-spin" />
                {ASSISTANT_THINKING_LABEL}
              </p>
            </div>
          ) : null}

          <div className="sv-assistant-shortcuts">
            {shortcuts.contextual.length > 0 ? (
              <div>
                <p className="sv-assistant-shortcuts-label">Nesta tela</p>
                <div className="sv-assistant-chips">
                  {shortcuts.contextual.map((item) => (
                    <button key={item.id} type="button" className="sv-assistant-chip" onClick={() => handleShortcut(item)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <p className="sv-assistant-shortcuts-label">Atalhos</p>
              <div className="sv-assistant-chips">
                {shortcuts.global.map((item) => (
                  <button key={item.id} type="button" className="sv-assistant-chip" onClick={() => handleShortcut(item)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <form
          className="sv-assistant-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submitQuestion(input);
          }}
        >
          <label className="sv-assistant-input-label" htmlFor="assistant-sv-input">
            {ASSISTANT_INPUT_PLACEHOLDER}
          </label>
          <textarea
            id="assistant-sv-input"
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={ASSISTANT_INPUT_PLACEHOLDER}
            className="sv-assistant-input"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submitQuestion(input);
              }
            }}
          />
          <button
            type="submit"
            className="sv-assistant-send"
            disabled={loading || !input.trim()}
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>

        <div className="sv-assistant-footer">
          <Link href={ASSISTANT_MANUAL_HREF} className="sv-assistant-manual-link" onClick={() => setOpen(false)}>
            <BookOpenText className="h-3.5 w-3.5" />
            {ASSISTANT_MANUAL_FALLBACK_LABEL}
          </Link>
        </div>
      </aside>
    </div>
  );
}

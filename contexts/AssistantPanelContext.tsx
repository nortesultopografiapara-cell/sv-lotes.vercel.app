'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type AssistantPanelContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  pendingQuestion: { question: string; procedureId?: string } | null;
  consumePendingQuestion: () => { question: string; procedureId?: string } | null;
  askFromShortcut: (question: string, procedureId?: string) => void;
  role: string | null;
  tenantName: string | null;
  impersonatingTenant: boolean;
};

const AssistantPanelContext = createContext<AssistantPanelContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
  role?: string | null;
  tenantName?: string | null;
  impersonatingTenant?: boolean;
};

export function AssistantPanelProvider({
  children,
  role = null,
  tenantName = null,
  impersonatingTenant = false,
}: ProviderProps) {
  const [open, setOpenState] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<{
    question: string;
    procedureId?: string;
  } | null>(null);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
  }, []);

  const toggle = useCallback(() => {
    setOpenState((prev) => !prev);
  }, []);

  const askFromShortcut = useCallback((question: string, procedureId?: string) => {
    setPendingQuestion({ question, procedureId });
    setOpenState(true);
  }, []);

  const consumePendingQuestion = useCallback(() => {
    const current = pendingQuestion;
    if (current) setPendingQuestion(null);
    return current;
  }, [pendingQuestion]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggle,
      pendingQuestion,
      consumePendingQuestion,
      askFromShortcut,
      role,
      tenantName,
      impersonatingTenant,
    }),
    [
      open,
      setOpen,
      toggle,
      pendingQuestion,
      consumePendingQuestion,
      askFromShortcut,
      role,
      tenantName,
      impersonatingTenant,
    ],
  );

  return (
    <AssistantPanelContext.Provider value={value}>{children}</AssistantPanelContext.Provider>
  );
}

export function useAssistantPanel() {
  const ctx = useContext(AssistantPanelContext);
  if (!ctx) {
    throw new Error('useAssistantPanel deve ser usado dentro de AssistantPanelProvider');
  }
  return ctx;
}

export function useAssistantPanelOptional() {
  return useContext(AssistantPanelContext);
}

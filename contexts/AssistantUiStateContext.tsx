'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AssistantLotTab, AssistantPaymentModeHint, AssistantUiClientHints } from '@/lib/assistant/uiSnapshot';

type LotPatch = {
  lotId?: string | null;
  projectId?: string | null;
  lotModalOpen?: boolean;
  activeLotTab?: AssistantLotTab | null;
  blockNumber?: string | null;
  lotNumber?: string | null;
  lotStatus?: string | null;
};

type SalePatch = {
  saleFormOpen?: boolean;
  paymentMode?: AssistantPaymentModeHint | null;
  customerSelected?: boolean;
};

type AssistantUiStateContextValue = {
  hints: AssistantUiClientHints;
  patchLot: (patch: LotPatch) => void;
  clearLot: () => void;
  patchSale: (patch: SalePatch) => void;
  clearSale: () => void;
  patchContract: (patch: { contractId?: string | null }) => void;
  clearContract: () => void;
};

const AssistantUiStateContext = createContext<AssistantUiStateContextValue | null>(null);

export function AssistantUiStateProvider({ children }: { children: ReactNode }) {
  const [hints, setHints] = useState<AssistantUiClientHints>({});

  const patchLot = useCallback((patch: LotPatch) => {
    setHints((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearLot = useCallback(() => {
    setHints((prev) => {
      if (prev.saleFormOpen) {
        return {
          ...prev,
          lotModalOpen: false,
          activeLotTab: null,
        };
      }
      return {
        ...prev,
        lotId: null,
        lotModalOpen: false,
        activeLotTab: null,
        blockNumber: null,
        lotNumber: null,
        lotStatus: null,
      };
    });
  }, []);

  const patchSale = useCallback((patch: SalePatch) => {
    setHints((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearSale = useCallback(() => {
    setHints((prev) => ({
      ...prev,
      saleFormOpen: false,
      paymentMode: null,
      customerSelected: false,
    }));
  }, []);

  const patchContract = useCallback((patch: { contractId?: string | null }) => {
    setHints((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearContract = useCallback(() => {
    setHints((prev) => ({ ...prev, contractId: null }));
  }, []);

  const value = useMemo(
    () => ({
      hints,
      patchLot,
      clearLot,
      patchSale,
      clearSale,
      patchContract,
      clearContract,
    }),
    [hints, patchLot, clearLot, patchSale, clearSale, patchContract, clearContract],
  );

  return <AssistantUiStateContext.Provider value={value}>{children}</AssistantUiStateContext.Provider>;
}

export function useAssistantUiState() {
  const ctx = useContext(AssistantUiStateContext);
  if (!ctx) {
    throw new Error('useAssistantUiState deve ser usado dentro de AssistantUiStateProvider');
  }
  return ctx;
}

export function useAssistantUiStateOptional() {
  return useContext(AssistantUiStateContext);
}

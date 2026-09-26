'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { useGisSelectedProject } from '@/contexts/GisSelectedProjectContext';
import {
  scopeAssistantHintsToRoute,
  type AssistantLotTab,
  type AssistantPaymentModeHint,
  type AssistantSaleEditTab,
  type AssistantUiClientHints,
} from '@/lib/assistant/uiSnapshot';

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
  installmentsFilled?: boolean;
  firstDueFilled?: boolean;
  brokerSelected?: boolean;
  downPaymentFilled?: boolean;
  saleEditOpen?: boolean;
  saleEditTab?: AssistantSaleEditTab | null;
  saleChargesMissing?: number | null;
  saleChargesEligible?: number | null;
  saleChargesGenerated?: number | null;
  saleChargesPaid?: number | null;
  saleChargesCancelled?: number | null;
  saleChargesPending?: number | null;
  saleChargesInstallments?: number | null;
  saleChargesHasAccount?: boolean;
  saleChargesReady?: boolean;
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
  const pathname = usePathname() || '/';
  const gis = useGisSelectedProject();
  const selectedProjectId = gis.project?.id || null;

  useLayoutEffect(() => {
    setHints((prev) => scopeAssistantHintsToRoute(pathname, prev));
  }, [pathname]);

  useEffect(() => {
    if (!selectedProjectId) return;
    setHints((prev) => {
      if (!prev.projectId || prev.projectId === selectedProjectId) {
        return prev.projectId ? prev : { ...prev, projectId: selectedProjectId };
      }
      return {
        ...prev,
        projectId: selectedProjectId,
        lotId: null,
        lotModalOpen: false,
        activeLotTab: null,
        blockNumber: null,
        lotNumber: null,
        lotStatus: null,
        saleFormOpen: false,
        paymentMode: null,
        customerSelected: false,
        installmentsFilled: false,
        firstDueFilled: false,
        brokerSelected: false,
        downPaymentFilled: false,
        saleEditOpen: false,
        saleEditTab: null,
        saleChargesReady: false,
        saleChargesMissing: null,
        saleChargesEligible: null,
        saleChargesGenerated: null,
        saleChargesPaid: null,
        saleChargesCancelled: null,
        saleChargesPending: null,
        saleChargesInstallments: null,
        saleChargesHasAccount: false,
      };
    });
  }, [selectedProjectId]);

  const patchLot = useCallback((patch: LotPatch) => {
    setHints((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearLot = useCallback(() => {
    setHints((prev) => ({
      ...prev,
      lotId: null,
      lotModalOpen: false,
      activeLotTab: null,
      blockNumber: null,
      lotNumber: null,
      lotStatus: null,
    }));
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
      installmentsFilled: false,
      firstDueFilled: false,
      brokerSelected: false,
      downPaymentFilled: false,
      saleEditOpen: false,
      saleEditTab: null,
      saleChargesReady: false,
      saleChargesMissing: null,
      saleChargesEligible: null,
      saleChargesGenerated: null,
      saleChargesPaid: null,
      saleChargesCancelled: null,
      saleChargesPending: null,
      saleChargesInstallments: null,
      saleChargesHasAccount: false,
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

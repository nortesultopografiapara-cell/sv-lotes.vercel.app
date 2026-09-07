/**
 * Estados persistentes da Fase 5B (cobranças externas da Troca de lote).
 * Independentes do status da Fase 4. Sem atomicidade fingida com APIs externas.
 */

export const LOT_SWAP_CHARGES_PHASES = [
  'PREPARED',
  'CANCELLING',
  'CANCELED',
  'LOCAL_EXECUTED',
  'GENERATING',
  'COMPLETED',
  'FAILED',
] as const;

export type LotSwapChargesPhase = (typeof LOT_SWAP_CHARGES_PHASES)[number];

export const LOT_SWAP_CHARGES_LIVE_DISABLED = 'LOT_SWAP_CHARGES_LIVE_DISABLED';
export const LOT_SWAP_CHARGES_CANCEL_FAILED = 'LOT_SWAP_CHARGES_CANCEL_FAILED';
export const LOT_SWAP_CHARGES_GENERATE_FAILED = 'LOT_SWAP_CHARGES_GENERATE_FAILED';

export function isLotSwapChargesPhase(value?: string | null): value is LotSwapChargesPhase {
  return (LOT_SWAP_CHARGES_PHASES as readonly string[]).includes(String(value || ''));
}

/**
 * Flag global `true` é inválida. LIVE só via resolveLotSwapExternalChargesLiveScope.
 * Sem contexto escopado, fail closed.
 */
export function isLotSwapExternalChargeLiveEnabled(_override?: boolean): boolean {
  return false;
}

export type LotSwapChargesSnapshot = {
  phase: LotSwapChargesPhase;
  live: boolean;
  failedStage?: 'CANCEL' | 'GENERATE' | 'BLOCK' | null;
  localExecuted?: boolean;
  canceledChargeIds?: string[];
  generatedReceiptIds?: string[];
  reusedReceiptIds?: string[];
  error?: string | null;
  updatedAt?: string;
};

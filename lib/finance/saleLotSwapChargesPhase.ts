/**
 * Estados persistentes da Fase 5B (cancelamento de cobranças externas antigas).
 * Independentes do status da Fase 4. Sem atomicidade fingida com APIs externas.
 *
 * Máquina atual: PREPARED → CANCELLING → CANCELED → COMPLETED | FAILED
 * LOCAL_EXECUTED e GENERATING são legado de leitura (não gravados em fluxos novos).
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
/** Legado: a 5B não gera mais cobranças novas. Mantido para mensagens antigas. */
export const LOT_SWAP_CHARGES_GENERATE_FAILED = 'LOT_SWAP_CHARGES_GENERATE_FAILED';

export function isLotSwapChargesPhase(value?: string | null): value is LotSwapChargesPhase {
  return (LOT_SWAP_CHARGES_PHASES as readonly string[]).includes(String(value || ''));
}

export function isLotSwapChargesPhaseTerminalSuccess(value?: string | null): boolean {
  const phase = String(value || '');
  return phase === 'COMPLETED' || phase === 'LOCAL_EXECUTED' || phase === 'GENERATING';
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

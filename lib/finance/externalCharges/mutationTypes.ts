/**
 * Resultado das mutações de cobrança externa (Fase 5B).
 * Adapters devolvem isto; o motor da troca não conhece Asaas/Inter.
 */

export type ExternalChargeCancelResult = {
  ok: true;
  reused: boolean;
  chargeId: string;
  status: string;
};

export type ExternalChargeGenerateResult = {
  ok: boolean;
  created: number;
  reused: number;
  skipped: number;
  errors: Array<{ receiptId: string; message: string }>;
};

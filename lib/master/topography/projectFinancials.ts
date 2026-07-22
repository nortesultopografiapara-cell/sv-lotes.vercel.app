/**
 * Cálculos financeiros do projeto (não persistidos).
 * saldo e percentual são sempre derivados em código.
 */

export type ProjectFinancialSummary = {
  valor_recebido: number;
  saldo_receber: number;
  percentual_recebido: number;
  valorRecebido: number;
  saldoReceber: number;
  percentualRecebido: number;
};

export function computeProjectFinancials(
  contractValue: number | null | undefined,
  valorRecebido: number | null | undefined,
): ProjectFinancialSummary {
  const contracted = Number(contractValue ?? 0);
  const received = Number(valorRecebido ?? 0);
  const safeContracted = Number.isFinite(contracted) && contracted > 0 ? contracted : 0;
  const safeReceived = Number.isFinite(received) && received > 0 ? received : 0;
  const saldo = Math.round((safeContracted - safeReceived) * 100) / 100;
  const percentual =
    safeContracted <= 0 ? 0 : Math.round((safeReceived / safeContracted) * 10000) / 100;

  return {
    valor_recebido: Math.round(safeReceived * 100) / 100,
    saldo_receber: saldo,
    percentual_recebido: percentual,
    valorRecebido: Math.round(safeReceived * 100) / 100,
    saldoReceber: saldo,
    percentualRecebido: percentual,
  };
}

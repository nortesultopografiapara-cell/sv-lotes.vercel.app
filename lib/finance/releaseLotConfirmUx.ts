/**
 * UX do botão "Confirmar liberação do lote".
 * Não altera canConfirmReleaseLot nem o motor financeiro — só composição de
 * habilitação já usada no modal e avisos visíveis no rodapé.
 */

import { canConfirmReleaseLot } from '@/lib/finance/releaseLotShared';
import { INADIMPLENCIA_NO_DEFAULT_MESSAGE } from '@/lib/finance/inadimplenciaGuards';

export const REFUND_FIRST_DUE_DATE_REQUIRED_MESSAGE =
  'Informe o vencimento da 1ª parcela da restituição para concluir a operação.';

export function asaasBlockedReleaseFooterMessage(count: number): string {
  return `Há cobrança(s) Asaas que não podem ser canceladas automaticamente (${count}). A liberação fica bloqueada até regularizar.`;
}

export function interBlockedReleaseFooterMessage(count: number): string {
  return `Há cobrança(s) Banco Inter que não podem ser canceladas automaticamente (${count}).`;
}

/** Sincroniza o state controlado com o valor real do input (digitação ou autofill). */
export function passwordStateFromInputValue(value: string): string {
  return String(value ?? '');
}

export function computeReleaseLotConfirmEnabled(input: {
  releaseOperation: boolean;
  motiveCode: string;
  motiveDetail: string;
  acknowledged: boolean;
  password: string;
  loading?: boolean;
  asaasBlockedCharges?: number;
  interBlockedCharges?: number;
  needsRefundSchedule: boolean;
  refundFirstDueDate: string;
  showSettlement: boolean;
  improvementsCheckOk: boolean;
  inadimplenciaEligible?: boolean;
  inadimplenciaPolicyOk?: boolean;
}): boolean {
  if (input.motiveCode === 'inadimplencia' && input.inadimplenciaEligible !== true) {
    return false;
  }
  if (input.motiveCode === 'inadimplencia' && input.inadimplenciaPolicyOk === false) {
    return false;
  }
  return (
    input.releaseOperation &&
    canConfirmReleaseLot({
      motiveCode: input.motiveCode,
      motiveDetail: input.motiveDetail,
      acknowledged: input.acknowledged,
      password: input.password,
      loading: input.loading,
      asaasBlockedCharges: input.asaasBlockedCharges,
      interBlockedCharges: input.interBlockedCharges,
    }) &&
    (!input.needsRefundSchedule || Boolean(input.refundFirstDueDate)) &&
    (!input.showSettlement || input.improvementsCheckOk)
  );
}

export type ReleaseLotConfirmFooterNotice = {
  kind: 'improvements' | 'schedule' | 'asaas' | 'inter' | 'inadimplencia';
  message: string;
};

export function buildReleaseLotConfirmFooterNotices(input: {
  showSettlement: boolean;
  improvementsCheckOk: boolean;
  improvementsCheckError?: string | null;
  needsRefundSchedule: boolean;
  refundFirstDueDate: string;
  asaasBlockedCharges?: number;
  interBlockedCharges?: number;
  motiveCode?: string;
  inadimplenciaEligible?: boolean;
  inadimplenciaPolicyError?: string | null;
}): ReleaseLotConfirmFooterNotice[] {
  const notices: ReleaseLotConfirmFooterNotice[] = [];
  const inadimplenciaIneligible =
    input.motiveCode === 'inadimplencia' && input.inadimplenciaEligible === false;
  if (inadimplenciaIneligible) {
    notices.push({
      kind: 'inadimplencia',
      message: INADIMPLENCIA_NO_DEFAULT_MESSAGE,
    });
    return notices;
  }
  if (
    input.motiveCode === 'inadimplencia' &&
    String(input.inadimplenciaPolicyError || '').trim()
  ) {
    notices.push({
      kind: 'inadimplencia',
      message: String(input.inadimplenciaPolicyError).trim(),
    });
  }
  if (input.showSettlement && !input.improvementsCheckOk) {
    const message = String(input.improvementsCheckError || '').trim();
    if (message) {
      notices.push({ kind: 'improvements', message });
    }
  }
  if (input.needsRefundSchedule && !input.refundFirstDueDate) {
    notices.push({
      kind: 'schedule',
      message: REFUND_FIRST_DUE_DATE_REQUIRED_MESSAGE,
    });
  }
  const asaas = input.asaasBlockedCharges || 0;
  if (asaas > 0) {
    notices.push({
      kind: 'asaas',
      message: asaasBlockedReleaseFooterMessage(asaas),
    });
  }
  const inter = input.interBlockedCharges || 0;
  if (inter > 0) {
    notices.push({
      kind: 'inter',
      message: interBlockedReleaseFooterMessage(inter),
    });
  }
  return notices;
}

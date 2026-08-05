/**
 * Labels das ações de conversão do Google Ads (send_to = AW-ID/label).
 *
 * A conversão comercial "Assinatura" (= contratação/ativação paga do SV LOTES)
 * NÃO deve ser ligada a assinaturas documentais de contratos de lote.
 * Label permanece vazio até autorização e definição do ponto de ativação paga.
 */

export type GoogleAdsConversionAction = 'assinatura';

/** Sem label gravado — conversão Ads de assinatura paga ainda não conectada. */
const LABEL_DEFAULTS: Record<GoogleAdsConversionAction, string> = {
  assinatura: '',
};

export function getGoogleAdsConversionLabel(
  action: GoogleAdsConversionAction
): string {
  return LABEL_DEFAULTS[action] || '';
}

export function hasGoogleAdsConversionLabel(
  action: GoogleAdsConversionAction
): boolean {
  return Boolean(getGoogleAdsConversionLabel(action));
}

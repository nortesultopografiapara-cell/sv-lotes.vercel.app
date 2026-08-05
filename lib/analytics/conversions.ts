/**
 * Labels das ações de conversão do Google Ads (send_to = AW-ID/label).
 *
 * - Clique no WhatsApp: ativa (landing)
 * - Solicitar Demonstração: ativa (landing / leads)
 * - Assinatura: conversão comercial futura (contratação paga do SV LOTES).
 *   NÃO ligar a assinaturas documentais de contratos de lote.
 */

export type GoogleAdsConversionAction =
  | 'click_whatsapp'
  | 'solicitar_demonstracao'
  | 'assinatura';

const LABEL_DEFAULTS: Record<GoogleAdsConversionAction, string> = {
  /** Google Ads — "Clique no WhatsApp" */
  click_whatsapp: 'cj8eCILp4NwcEInop72E',
  /** Google Ads — "Solicitar Demonstração" */
  solicitar_demonstracao: 'bNhHCL_Tx9wcEInop72E',
  /** Sem label — assinatura paga ainda não conectada */
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

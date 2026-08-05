/** Nomes canônicos dos eventos (sem dependência de gtag / client). */
export const ANALYTICS_EVENTS = {
  page_view: 'page_view',
  click_whatsapp: 'click_whatsapp',
  solicitar_demonstracao: 'solicitar_demonstracao',
  enviar_formulario: 'enviar_formulario',
  cadastro_empresa: 'cadastro_empresa',
  assinatura_realizada: 'assinatura_realizada',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

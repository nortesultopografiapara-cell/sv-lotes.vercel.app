import type { OpenAiAdsWindow } from './pixel';

/**
 * A página comercial atual só abre WhatsApp ou o cliente de e-mail.
 * Esses canais não confirmam que a solicitação chegou à equipe.
 * lead_created só existe para uma solicitação comercial com entrega concluída.
 * Essa entrega ainda não existe: não há persistência e a API de Conversões
 * não faz parte desta fase. O clique no WhatsApp não emite o evento.
 */
export type CommercialLeadChannel = 'whatsapp_click' | 'mailto' | 'completed_commercial_request';

export type LeadCreatedDecision = {
  emit: boolean;
  reason:
    | 'whatsapp_is_not_a_confirmed_lead'
    | 'mailto_is_not_a_confirmed_lead'
    | 'request_not_completed'
    | 'completed_commercial_request';
};

export function evaluateLeadCreated(input: {
  channel: CommercialLeadChannel;
  requestCompleted: boolean;
}): LeadCreatedDecision {
  if (input.channel === 'whatsapp_click') {
    return { emit: false, reason: 'whatsapp_is_not_a_confirmed_lead' };
  }
  if (input.channel === 'mailto') {
    return { emit: false, reason: 'mailto_is_not_a_confirmed_lead' };
  }
  if (!input.requestCompleted) {
    return { emit: false, reason: 'request_not_completed' };
  }
  return { emit: true, reason: 'completed_commercial_request' };
}

export function measureLeadCreatedIfEligible(
  win: OpenAiAdsWindow,
  input: { channel: CommercialLeadChannel; requestCompleted: boolean },
): LeadCreatedDecision {
  const decision = evaluateLeadCreated(input);
  if (!decision.emit || !win.oaiq) return { ...decision, emit: false };
  win.oaiq('measure', 'lead_created', { type: 'customer_action' });
  return decision;
}

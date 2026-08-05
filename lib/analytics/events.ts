/**
 * Eventos de conversão / remarketing — infraestrutura reutilizável (gtag via @next/third-parties).
 * Use apenas em Client Components ou handlers de browser.
 */

import { sendGAEvent } from '@next/third-parties/google';
import { GA_MEASUREMENT_ID, getGoogleAdsId } from './config';
import { getGoogleAdsConversionLabel } from './conversions';
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
} from './eventNames';

export { ANALYTICS_EVENTS, type AnalyticsEventName };

export type AnalyticsEventParams = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Só dispara se a tag foi montada (dataLayer criado em produção). */
function canTrack(): boolean {
  return typeof window !== 'undefined' && Array.isArray(window.dataLayer);
}

/**
 * Dispara evento genérico no dataLayer / gtag.
 * Seguro em SSR e quando a tag está desligada (no-op).
 */
export function trackEvent(
  eventName: AnalyticsEventName | string,
  params: AnalyticsEventParams = {}
): void {
  if (!canTrack()) return;

  const cleaned: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    cleaned[key] = value;
  }

  try {
    sendGAEvent('event', eventName, cleaned);
  } catch {
    // Não interrompe o fluxo da UI se a tag falhar
  }
}

/** page_view manual (útil se Enhanced Measurement estiver desligado). */
export function trackPageView(
  params: AnalyticsEventParams & { page_path?: string; page_title?: string } = {}
): void {
  const page_path =
    params.page_path ??
    (typeof window !== 'undefined' ? window.location.pathname : undefined);
  const page_title =
    params.page_title ??
    (typeof document !== 'undefined' ? document.title : undefined);

  trackEvent(ANALYTICS_EVENTS.page_view, {
    ...params,
    page_path,
    page_title,
  });
}

export function trackClickWhatsApp(params: AnalyticsEventParams = {}): void {
  trackEvent(ANALYTICS_EVENTS.click_whatsapp, {
    event_category: 'engagement',
    event_label: 'whatsapp',
    ...params,
  });
}

export function trackSolicitarDemonstracao(
  params: AnalyticsEventParams = {}
): void {
  trackEvent(ANALYTICS_EVENTS.solicitar_demonstracao, {
    event_category: 'lead',
    event_label: 'demonstracao',
    ...params,
  });

  const conversionLabel = getGoogleAdsConversionLabel('solicitar_demonstracao');
  if (!conversionLabel) return;

  trackGoogleAdsConversion({
    conversionLabel,
    currency: 'BRL',
    extra: {
      event_category: 'lead',
      event_label: 'demonstracao',
      ...params,
    },
  });
}

export function trackEnviarFormulario(params: AnalyticsEventParams = {}): void {
  trackEvent(ANALYTICS_EVENTS.enviar_formulario, {
    event_category: 'lead',
    event_label: 'formulario',
    ...params,
  });
}

export function trackCadastroEmpresa(params: AnalyticsEventParams = {}): void {
  trackEvent(ANALYTICS_EVENTS.cadastro_empresa, {
    event_category: 'conversion',
    event_label: 'cadastro_empresa',
    ...params,
  });
}

/**
 * Conversão comercial futura: contratação/ativação de assinatura paga do SV LOTES.
 * NÃO usar em rotas de assinatura documental (/sign, /sign/sale).
 *
 * Hoje: envia `assinatura_realizada` ao dataLayer quando chamado.
 * Ads (send_to): só dispara se houver conversionLabel configurado (ainda vazio).
 */
export function trackAssinaturaRealizada(
  params: AnalyticsEventParams & {
    transaction_id?: string;
    value?: number;
    currency?: string;
  } = {}
): void {
  const { transaction_id, value, currency, ...rest } = params;

  trackEvent(ANALYTICS_EVENTS.assinatura_realizada, {
    event_category: 'conversion',
    event_label: 'assinatura_sv_lotes',
    ...(transaction_id ? { transaction_id } : {}),
    ...(typeof value === 'number' ? { value } : {}),
    ...(currency ? { currency } : {}),
    ...rest,
  });

  const conversionLabel = getGoogleAdsConversionLabel('assinatura');
  if (!conversionLabel) return;

  trackGoogleAdsConversion({
    conversionLabel,
    value,
    currency: currency || 'BRL',
    transaction_id,
    extra: {
      event_category: 'conversion',
      event_label: 'assinatura_sv_lotes',
      ...rest,
    },
  });
}

/**
 * Conversão Google Ads com send_to (AW-ID/label).
 * Use quando a conversão for criada no painel Ads e houver label.
 */
export function trackGoogleAdsConversion(options: {
  /** Label da conversão no Google Ads (após a barra do send_to). */
  conversionLabel: string;
  value?: number;
  currency?: string;
  transaction_id?: string;
  extra?: AnalyticsEventParams;
}): void {
  if (!canTrack()) return;
  if (!options.conversionLabel.trim()) return;

  const send_to = `${getGoogleAdsId()}/${options.conversionLabel.trim()}`;
  const payload: Record<string, string | number | boolean> = { send_to };

  if (typeof options.value === 'number') payload.value = options.value;
  if (options.currency) payload.currency = options.currency;
  if (options.transaction_id) payload.transaction_id = options.transaction_id;

  if (options.extra) {
    for (const [key, value] of Object.entries(options.extra)) {
      if (value === undefined || value === null) continue;
      payload[key] = value;
    }
  }

  try {
    sendGAEvent('event', 'conversion', payload);
  } catch {
    // no-op
  }
}

/** Configura GA4 no mesmo gtag já carregado (sem segundo script). */
export function configureOptionalGa4(): void {
  if (!canTrack() || !GA_MEASUREMENT_ID) return;
  try {
    sendGAEvent('config', GA_MEASUREMENT_ID);
  } catch {
    // no-op
  }
}

export {
  GOOGLE_ADS_ID,
  GA_MEASUREMENT_ID,
  getGoogleAdsId,
  isGoogleTagEnabled,
} from './config';

export {
  type GoogleAdsConversionAction,
  getGoogleAdsConversionLabel,
  hasGoogleAdsConversionLabel,
} from './conversions';

export {
  type ConsentStatus,
  type GoogleConsentState,
  buildConsentDefaultInlineScript,
  buildDefaultConsentState,
  denyAdsAndAnalyticsConsent,
  getDefaultConsentStatus,
  grantAllGoogleConsent,
  updateGoogleConsent,
} from './consent';

export {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
} from './eventNames';

export {
  type AnalyticsEventParams,
  configureOptionalGa4,
  trackAssinaturaRealizada,
  trackCadastroEmpresa,
  trackClickWhatsApp,
  trackEnviarFormulario,
  trackEvent,
  trackGoogleAdsConversion,
  trackPageView,
  trackSolicitarDemonstracao,
} from './events';

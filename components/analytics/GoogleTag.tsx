import { getGoogleAdsId, isGoogleTagEnabled } from '@/lib/analytics/config';
import { GoogleTagClient } from './GoogleTagClient';

/**
 * Google Tag (gtag.js) + Google Ads via @next/third-parties/google.
 * Uma única instância, afterInteractive, somente quando a tag está habilitada.
 */
export function GoogleTag() {
  if (!isGoogleTagEnabled()) return null;
  return <GoogleTagClient gaId={getGoogleAdsId()} />;
}

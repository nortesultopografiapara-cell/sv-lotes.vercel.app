import { isGoogleTagEnabled } from '@/lib/analytics/config';
import { buildConsentDefaultInlineScript } from '@/lib/analytics/consent';

/**
 * Consent Mode V2 default — deve ir no <head> antes do gtag('config').
 */
export function GoogleConsentDefaults() {
  if (!isGoogleTagEnabled()) return null;

  return (
    <script
      id="google-consent-default"
      dangerouslySetInnerHTML={{ __html: buildConsentDefaultInlineScript() }}
    />
  );
}

'use client';

import { useEffect } from 'react';
import { GoogleAnalytics } from '@next/third-parties/google';
import { GA_MEASUREMENT_ID } from '@/lib/analytics/config';
import { configureOptionalGa4 } from '@/lib/analytics/events';

/**
 * Carrega gtag.js uma vez (afterInteractive via @next/third-parties)
 * e configura GA4 opcional no mesmo dataLayer.
 */
export function GoogleTagClient({ gaId }: { gaId: string }) {
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    const timer = window.setTimeout(() => {
      configureOptionalGa4();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <GoogleAnalytics gaId={gaId} />;
}

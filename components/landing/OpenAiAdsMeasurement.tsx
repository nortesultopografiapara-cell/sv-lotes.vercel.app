'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  clearOpenAiAdsAttribution,
  rememberOpenAiAdsAttribution,
} from '@/lib/openai-ads/attribution';
import {
  readOpenAiAdsConsent,
  writeOpenAiAdsConsent,
  type OpenAiAdsConsent,
} from '@/lib/openai-ads/consent';
import {
  OPENAI_ADS_SDK_URL,
  PUBLIC_COMMERCIAL_PATH,
  isProductionAdsHost,
  resolveOpenAiAdsRuntime,
} from '@/lib/openai-ads/config';
import {
  armCommercialDocumentBoundary,
  hardNavigationDestination,
  releaseOpenAiAdsDocument,
} from '@/lib/openai-ads/isolation';
import {
  grantOpenAiAdsConsent,
  installOfficialOpenAiAdsLoader,
  measureOpenAiAdsPageView,
  shouldRequestOpenAiAdsSdk,
  type OpenAiAdsDom,
  type OpenAiAdsWindow,
} from '@/lib/openai-ads/pixel';

type Props = {
  enabled: boolean;
};

/**
 * Pixel da página comercial pública.
 * Não entra no layout global. Sem consentimento, o SDK não é pedido.
 * Sair desta rota recarrega o documento para derrubar o SDK.
 */
export function OpenAiAdsMeasurement({ enabled }: Props) {
  const pathname = usePathname();
  const [consent, setConsent] = useState<OpenAiAdsConsent>('unknown');
  const [hostAllowed, setHostAllowed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHostAllowed(!isProductionAdsHost(window.location.hostname));
    try {
      setConsent(readOpenAiAdsConsent(window.localStorage));
    } catch {
      setConsent('unknown');
    }
    setHydrated(true);
  }, []);

  const active = enabled && hostAllowed && pathname === PUBLIC_COMMERCIAL_PATH;

  useEffect(() => {
    if (!active) return;
    const adsWindow = window as Window & OpenAiAdsWindow;
    const leave = (url: string) => {
      releaseOpenAiAdsDocument(adsWindow, document, window.localStorage);
      window.location.assign(url);
    };
    const disarm = armCommercialDocumentBoundary(window.history, window.location, leave);
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const anchor = (event.target as Element | null)?.closest?.('a');
      if (!anchor) return;
      const destination = hardNavigationDestination({
        currentHref: window.location.href,
        anchorHref: anchor.href,
        button: event.button,
        modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
        target: anchor.getAttribute('target'),
      });
      if (!destination) return;
      event.preventDefault();
      event.stopPropagation();
      leave(destination);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      disarm();
      document.removeEventListener('click', onClick, true);
      if (window.location.pathname !== PUBLIC_COMMERCIAL_PATH) {
        releaseOpenAiAdsDocument(adsWindow, document, window.localStorage);
        window.location.replace(window.location.href);
      }
    };
  }, [active]);

  useEffect(() => {
    if (!hydrated || !shouldRequestOpenAiAdsSdk({ active, consent, pathname })) return;

    const runtime = resolveOpenAiAdsRuntime({
      enabledFlag: process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ENABLED,
      pixelId: process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID,
      debugFlag: process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_DEBUG,
      vercelEnv: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? '',
      hostname: window.location.hostname,
    });
    if (!runtime.active || !runtime.pixelId) return;

    const adsWindow = window as Window & OpenAiAdsWindow;
    installOfficialOpenAiAdsLoader(adsWindow, document as unknown as OpenAiAdsDom, runtime.pixelId, runtime.debug);
    try {
      rememberOpenAiAdsAttribution(window.sessionStorage, window.location.search);
    } catch {
      /* navegador sem storage: o SDK ainda lê o oppref da URL */
    }
    grantOpenAiAdsConsent(adsWindow);
    measureOpenAiAdsPageView(adsWindow);
  }, [active, consent, hydrated, pathname]);

  const choose = (next: Exclude<OpenAiAdsConsent, 'unknown'>) => {
    try {
      writeOpenAiAdsConsent(window.localStorage, next);
      if (next === 'denied') clearOpenAiAdsAttribution(window.sessionStorage);
    } catch {
      /* sem storage o aceite vale só nesta montagem */
    }
    if (next === 'denied') {
      const adsWindow = window as Window & OpenAiAdsWindow;
      const hadSdk = Boolean(adsWindow.oaiq) || Boolean(document.querySelector(`script[src="${OPENAI_ADS_SDK_URL}"]`));
      releaseOpenAiAdsDocument(adsWindow, document, window.localStorage);
      if (hadSdk) window.location.reload();
    }
    setConsent(next);
  };

  if (!active || !hydrated || consent === 'denied') return null;

  if (consent === 'granted') {
    return (
      <button
        type="button"
        className="fixed bottom-24 right-4 z-[80] rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg md:bottom-6"
        onClick={() => choose('denied')}
      >
        Revogar medição
      </button>
    );
  }

  return (
    <section
      className="fixed inset-x-4 bottom-24 z-[80] mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl md:bottom-6 md:left-6 md:right-auto"
      aria-label="Medição de anúncios"
    >
      <p className="text-sm leading-5">
        Esta página comercial pode medir a visita para anúncios. O script só carrega depois do aceite. Ao sair desta
        página, o documento é recarregado e a medição não continua nas áreas internas.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          onClick={() => choose('granted')}
        >
          Aceitar medição
        </button>
        <button
          type="button"
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          onClick={() => choose('denied')}
        >
          Agora não
        </button>
      </div>
    </section>
  );
}

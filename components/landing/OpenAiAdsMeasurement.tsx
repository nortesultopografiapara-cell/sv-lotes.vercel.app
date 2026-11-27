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
  PUBLIC_COMMERCIAL_PATH,
  isProductionAdsHost,
  resolveOpenAiAdsRuntime,
} from '@/lib/openai-ads/config';
import {
  denyOpenAiAdsConsent,
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

  if (!active || !hydrated || consent !== 'unknown') return null;

  const choose = (next: Exclude<OpenAiAdsConsent, 'unknown'>) => {
    try {
      writeOpenAiAdsConsent(window.localStorage, next);
      if (next === 'denied') clearOpenAiAdsAttribution(window.sessionStorage);
    } catch {
      /* sem storage o aceite vale só nesta montagem */
    }
    if (next === 'denied') denyOpenAiAdsConsent(window as Window & OpenAiAdsWindow);
    setConsent(next);
  };

  return (
    <section
      className="fixed inset-x-4 bottom-24 z-[80] mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl md:bottom-6 md:left-6 md:right-auto"
      aria-label="Medição de anúncios"
    >
      <p className="text-sm leading-5">
        Esta página comercial pode medir a visita para anúncios. O script só carrega depois do aceite e não entra
        nas áreas de clientes, contratos ou financeiro.
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

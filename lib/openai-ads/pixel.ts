import { OPENAI_ADS_SDK_URL, PUBLIC_COMMERCIAL_PATH } from './config';
import type { OpenAiAdsConsent } from './consent';

export type OpenAiAdsCommand = unknown[];

export type OpenAiAdsQueue = {
  (...args: unknown[]): void;
  q: OpenAiAdsCommand[];
};

export type OpenAiAdsScript = {
  async: boolean;
  src: string;
};

export type OpenAiAdsDom = {
  createElement: (tag: string) => OpenAiAdsScript;
  getElementsByTagName: (
    tag: string,
  ) => Array<{ parentNode: { insertBefore: (node: OpenAiAdsScript, ref: unknown) => void } | null }>;
};

export type OpenAiAdsWindow = {
  oaiq?: OpenAiAdsQueue;
  __svlotesOpenAiPageViewed?: boolean;
};

export function shouldRequestOpenAiAdsSdk(input: {
  active: boolean;
  consent: OpenAiAdsConsent;
  pathname: string | null;
}): boolean {
  return input.active && input.consent === 'granted' && input.pathname === PUBLIC_COMMERCIAL_PATH;
}

function createQueue(): OpenAiAdsQueue {
  const queue = function queueCommand(...args: unknown[]) {
    queue.q.push(args);
  } as OpenAiAdsQueue;
  queue.q = [];
  return queue;
}

/** Loader oficial: script async, consentimento falso antes do init, sem objeto user. */
export function installOfficialOpenAiAdsLoader(
  win: OpenAiAdsWindow,
  doc: OpenAiAdsDom,
  pixelId: string,
  debug: boolean,
): OpenAiAdsScript | null {
  if (win.oaiq) return null;

  const queue = createQueue();
  win.oaiq = queue;

  const script = doc.createElement('script');
  script.async = true;
  script.src = OPENAI_ADS_SDK_URL;
  const first = doc.getElementsByTagName('script')[0];
  first?.parentNode?.insertBefore(script, first);

  const init: { pixelId: string; debug?: boolean } = { pixelId };
  if (debug) init.debug = true;

  queue('consent', false);
  queue('init', init);
  return script;
}

export function grantOpenAiAdsConsent(win: OpenAiAdsWindow): void {
  win.oaiq?.('consent', true);
}

export function denyOpenAiAdsConsent(win: OpenAiAdsWindow): void {
  win.oaiq?.('consent', false);
}

export function measureOpenAiAdsPageView(win: OpenAiAdsWindow): boolean {
  if (!win.oaiq || win.__svlotesOpenAiPageViewed) return false;
  win.__svlotesOpenAiPageViewed = true;
  win.oaiq('measure', 'page_viewed', {
    type: 'contents',
    contents: [{ id: 'sv-lotes-landing', content_type: 'page' }],
  });
  return true;
}

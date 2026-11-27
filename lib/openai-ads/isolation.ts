import { OPENAI_ADS_SDK_URL, PUBLIC_COMMERCIAL_PATH } from './config';
import type { OpenAiAdsWindow } from './pixel';

/**
 * O SDK oficial 0.1.105 escuta change, keydown, click e submit no documento
 * e lê input, select e textarea enquanto o consentimento está concedido.
 * A navegação interna do Next.js troca a página sem destruir esse documento.
 * Sair de / força um carregamento completo. Um formulário futuro com dados
 * pessoais precisa nascer em outra rota, depois desse carregamento.
 */
export const OPENAI_ADS_COOKIE_NAMES = ['__oppref', '__obref', '__oaiq_consent'] as const;
export const OPENAI_ADS_SDK_STORAGE_KEY = 'oaiq_consent';

export type OpenAiAdsDocument = {
  cookie: string;
  querySelectorAll: (selector: string) => Iterable<{ remove: () => void }>;
};

export type CommercialHistory = {
  pushState: (data: unknown, unused: string, url?: string | URL | null) => void;
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
};

export type CommercialLocation = {
  href: string;
  assign: (url: string) => void;
  reload: () => void;
};

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname || PUBLIC_COMMERCIAL_PATH;
}

export function shouldForceFullDocumentLoad(currentHref: string, nextHref: string): boolean {
  let current: URL;
  let next: URL;
  try {
    current = new URL(currentHref);
    next = new URL(nextHref, currentHref);
  } catch {
    return false;
  }
  if (next.origin !== current.origin) return false;
  if (normalizePath(current.pathname) !== PUBLIC_COMMERCIAL_PATH) return false;
  return normalizePath(next.pathname) !== PUBLIC_COMMERCIAL_PATH;
}

export function hardNavigationDestination(input: {
  currentHref: string;
  anchorHref: string | null;
  button: number;
  modified: boolean;
  target: string | null;
}): string | null {
  if (input.button !== 0 || input.modified || !input.anchorHref) return null;
  if (input.target && input.target.toLowerCase() !== '_self') return null;
  if (!shouldForceFullDocumentLoad(input.currentHref, input.anchorHref)) return null;
  return new URL(input.anchorHref, input.currentHref).href;
}

export function clearOpenAiAdsCookies(doc: { cookie: string }): void {
  for (const name of OPENAI_ADS_COOKIE_NAMES) {
    doc.cookie = `${name}=; Path=/; Max-Age=0`;
  }
}

export function releaseOpenAiAdsDocument(
  win: OpenAiAdsWindow,
  doc: OpenAiAdsDocument,
  storage?: { removeItem: (key: string) => void },
): void {
  try {
    win.oaiq?.('consent', false);
  } catch {
    /* a fila pode já ter sido substituída por uma função que falhou */
  }
  for (const script of doc.querySelectorAll(`script[src="${OPENAI_ADS_SDK_URL}"]`)) {
    script.remove();
  }
  delete win.oaiq;
  delete win.__svlotesOpenAiPageViewed;
  clearOpenAiAdsCookies(doc);
  try {
    storage?.removeItem(OPENAI_ADS_SDK_STORAGE_KEY);
  } catch {
    /* storage privado não impede o descarregamento */
  }
}

export function armCommercialDocumentBoundary(
  history: CommercialHistory,
  location: CommercialLocation,
  onLeave: (url: string) => void,
): () => void {
  const pushState = history.pushState;
  const replaceState = history.replaceState;
  const guard = (original: CommercialHistory['pushState']) =>
    function guardedState(data: unknown, unused: string, url?: string | URL | null) {
      if (typeof url === 'string' || url instanceof URL) {
        const next = new URL(String(url), location.href).href;
        if (shouldForceFullDocumentLoad(location.href, next)) {
          onLeave(next);
          return;
        }
      }
      original.call(history, data, unused, url);
    };
  history.pushState = guard(pushState);
  history.replaceState = guard(replaceState);
  return () => {
    history.pushState = pushState;
    history.replaceState = replaceState;
  };
}

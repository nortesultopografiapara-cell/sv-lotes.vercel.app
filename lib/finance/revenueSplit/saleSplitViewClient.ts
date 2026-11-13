/**
 * Leitura do rateio por venda.
 * Um 404 da rota (módulo bancário desligado) interrompe as demais chamadas
 * da sessão. Uma resposta válida continua sendo buscada venda a venda.
 */

export type SaleSplitViewPayload = {
  saleId: string;
  operational: boolean;
  snapshot: { id: string } | null;
  participants: unknown[];
  legs: unknown[];
};

let splitRouteMissing = false;
let splitRouteGate: Promise<boolean> | null = null;
let probedSaleId = '';
let probedView: SaleSplitViewPayload | null | undefined;
const viewCache = new Map<string, Promise<SaleSplitViewPayload | null>>();

export function resetSaleSplitViewClient() {
  splitRouteMissing = false;
  splitRouteGate = null;
  probedSaleId = '';
  probedView = undefined;
  viewCache.clear();
}

export function invalidateSaleRevenueSplitView(saleId?: string | null) {
  splitRouteMissing = false;
  splitRouteGate = null;
  probedSaleId = '';
  probedView = undefined;
  if (saleId) viewCache.delete(String(saleId));
  else viewCache.clear();
}

async function requestSplitView(
  saleId: string,
): Promise<SaleSplitViewPayload | null | 'missing'> {
  const res = await fetch(
    `/api/finance/revenue-split/sales/${encodeURIComponent(saleId)}`,
    { credentials: 'include' },
  );
  if (res.status === 404) return 'missing';
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const view = data as SaleSplitViewPayload;
  if (!view?.snapshot) return view?.saleId ? view : { ...view, saleId };
  return view;
}

export function loadSaleSplitView(
  saleId: string,
): Promise<SaleSplitViewPayload | null> {
  const id = String(saleId || '').trim();
  if (!id || splitRouteMissing) return Promise.resolve(null);
  const cached = viewCache.get(id);
  if (cached) return cached;

  const pending = (async () => {
    if (splitRouteMissing) return null;
    if (!splitRouteGate) {
      splitRouteGate = (async () => {
        const first = await requestSplitView(id);
        if (first === 'missing') {
          splitRouteMissing = true;
          return false;
        }
        probedSaleId = id;
        probedView = first;
        return true;
      })();
    }
    const available = await splitRouteGate;
    if (!available || splitRouteMissing) return null;
    const next = probedSaleId === id ? (probedView ?? null) : await requestSplitView(id);
    if (next === 'missing') {
      splitRouteMissing = true;
      viewCache.delete(id);
      return null;
    }
    if (next == null || !next.snapshot) {
      viewCache.delete(id);
    }
    return next;
  })();

  viewCache.set(id, pending);
  return pending;
}

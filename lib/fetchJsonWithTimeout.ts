/**
 * Fetch JSON com timeout e parse seguro — evita loading infinito no cliente.
 */

import { formatClientFetchError } from '@/lib/clientFetchError';

export const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
export const CONTRACTS_FETCH_TIMEOUT_MS = 45_000;
export const SALES_FETCH_TIMEOUT_MS = 45_000;

export type FetchJsonResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

type JsonWithError = { error?: unknown };

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJsonWithTimeout<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<FetchJsonResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(input, {
      ...init,
      signal: controller.signal,
    });

    const text = await res.text();
    let data: T | null = null;
    let parseError: string | null = null;

    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        parseError = 'Resposta inválida do servidor.';
      }
    }

    const body = data as JsonWithError | null;
    const apiError =
      body?.error != null && String(body.error).trim() !== ''
        ? String(body.error)
        : null;

    if (parseError) {
      return {
        ok: false,
        status: res.status,
        data,
        error: formatClientFetchError({ status: res.status, apiError: parseError }),
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: formatClientFetchError({ status: res.status, apiError }),
      };
    }

    if (apiError) {
      return {
        ok: false,
        status: res.status,
        data,
        error: formatClientFetchError({ status: res.status, apiError }),
      };
    }

    return { ok: true, status: res.status, data, error: null };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        status: 0,
        data: null,
        error: formatClientFetchError({ timeout: true }),
      };
    }
    const message = err instanceof Error ? err.message : 'Falha de rede';
    return {
      ok: false,
      status: 0,
      data: null,
      error: formatClientFetchError({ networkMessage: message }),
    };
  } finally {
    clearTimeout(timer);
  }
}

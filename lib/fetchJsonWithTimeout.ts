/**
 * Fetch JSON com timeout e parse seguro — evita loading infinito no cliente.
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 60_000;

export type FetchJsonResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

type JsonWithError = { error?: unknown };

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
      return { ok: false, status: res.status, data, error: parseError };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: apiError || `Erro HTTP ${res.status}`,
      };
    }

    if (apiError) {
      return { ok: false, status: res.status, data, error: apiError };
    }

    return { ok: true, status: res.status, data, error: null };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        status: 0,
        data: null,
        error:
          'Tempo esgotado ao salvar. O servidor demorou demais para responder — tente novamente.',
      };
    }
    const message = err instanceof Error ? err.message : 'Falha de rede ao salvar.';
    return { ok: false, status: 0, data: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

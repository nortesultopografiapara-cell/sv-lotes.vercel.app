/**
 * Captura global de erros (window + React) — diagnóstico iOS Safari.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type AppErrorSource =
  | 'window.onerror'
  | 'window.onunhandledrejection'
  | 'react_error_boundary';

export type AppErrorDiagnostics = {
  iosSafari: boolean;
  platform: string;
  viewport: { width: number; height: number; devicePixelRatio: number };
  localStorage: { ok: boolean; keys?: string[]; error?: string };
  sessionStorage: { ok: boolean; keys?: string[]; error?: string };
  supabaseAuth: {
    ok: boolean;
    hasSession?: boolean;
    userId?: string | null;
    error?: string;
  };
  leaflet: { ok: boolean; defined?: boolean; version?: string };
  intl: {
    ok: boolean;
    DateTimeFormat?: boolean;
    NumberFormat?: boolean;
    localeSample?: string;
    error?: string;
  };
  date: { ok: boolean; iso?: string; error?: string };
  hydration: {
    documentReady: string;
    hasNextRoot: boolean;
    reactVersion?: string;
  };
};

export type AppErrorPayload = {
  source: AppErrorSource;
  message: string;
  stack?: string;
  componentStack?: string;
  errorName?: string;
  route?: string;
};

declare global {
  interface Window {
    __SV_LOTES_ERROR_CTX__?: {
      tenantId?: string | null;
      userId?: string | null;
    };
    __SV_LOTES_ERROR_HANDLERS__?: boolean;
  }
}

const DEDUPE_MS = 3000;
const recentKeys = new Map<string, number>();

function dedupeKey(payload: AppErrorPayload): string {
  return `${payload.source}|${payload.message}|${payload.route || ''}`.slice(0, 500);
}

function shouldSkipDuplicate(key: string): boolean {
  const now = Date.now();
  const last = recentKeys.get(key);
  if (last && now - last < DEDUPE_MS) return true;
  recentKeys.set(key, now);
  if (recentKeys.size > 80) {
    for (const [k, t] of recentKeys) {
      if (now - t > DEDUPE_MS * 4) recentKeys.delete(k);
    }
  }
  return false;
}

export function parseBrowser(userAgent: string): string {
  const ua = userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)) {
    return 'iOS Safari';
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS WebView/Other';
  if (/Android/i.test(ua) && /Chrome/i.test(ua)) return 'Android Chrome';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Edg/i.test(ua)) return 'Edge';
  if (/Chrome/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'Unknown';
}

export function isIosSafari(userAgent?: string): boolean {
  const ua =
    userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return parseBrowser(ua) === 'iOS Safari';
}

export function getCurrentRoute(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search || ''}`;
}

/** Atualizado pelo Layout quando o usuário/tenant estiver disponível. */
export function setAppErrorContext(ctx: {
  tenantId?: string | null;
  userId?: string | null;
}) {
  if (typeof window === 'undefined') return;
  window.__SV_LOTES_ERROR_CTX__ = {
    tenantId: ctx.tenantId ?? null,
    userId: ctx.userId ?? null,
  };
}

function resolveTenantIdSync(): string | null {
  if (typeof window === 'undefined') return null;
  const ctx = window.__SV_LOTES_ERROR_CTX__;
  if (ctx?.tenantId) return ctx.tenantId;
  try {
    return (
      localStorage.getItem('impersonating_tenant_id') ||
      localStorage.getItem('active_tenant') ||
      null
    );
  } catch {
    return null;
  }
}

function resolveUserIdSync(): string | null {
  if (typeof window === 'undefined') return null;
  return window.__SV_LOTES_ERROR_CTX__?.userId ?? null;
}

export function collectEnvironmentDiagnostics(): AppErrorDiagnostics {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const diag: AppErrorDiagnostics = {
    iosSafari: isIosSafari(ua),
    platform: typeof navigator !== 'undefined' ? navigator.platform : '',
    viewport: {
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      height: typeof window !== 'undefined' ? window.innerHeight : 0,
      devicePixelRatio:
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    },
    localStorage: { ok: false },
    sessionStorage: { ok: false },
    supabaseAuth: { ok: false },
    leaflet: { ok: false },
    intl: { ok: false },
    date: { ok: false },
    hydration: {
      documentReady:
        typeof document !== 'undefined' ? document.readyState : 'unknown',
      hasNextRoot:
        typeof document !== 'undefined' &&
        Boolean(document.getElementById('__next')),
      reactVersion: '19',
    },
  };

  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    diag.localStorage = { ok: true, keys: keys.slice(0, 40) };
  } catch (e) {
    diag.localStorage = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k) keys.push(k);
    }
    diag.sessionStorage = { ok: true, keys: keys.slice(0, 40) };
  } catch (e) {
    diag.sessionStorage = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const L = (window as Window & { L?: { version?: string } }).L;
    diag.leaflet = {
      ok: true,
      defined: Boolean(L),
      version: L?.version,
    };
  } catch (e) {
    diag.leaflet = { ok: false, defined: false };
    console.warn('[SV_LOTES_ERROR] Leaflet check failed', e);
  }

  try {
    const dtf = Intl.DateTimeFormat('pt-BR').format(new Date());
    const nf = Intl.NumberFormat('pt-BR').format(1234.5);
    diag.intl = {
      ok: true,
      DateTimeFormat: Boolean(dtf),
      NumberFormat: Boolean(nf),
      localeSample: dtf,
    };
  } catch (e) {
    diag.intl = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    diag.date = { ok: true, iso: new Date().toISOString() };
  } catch (e) {
    diag.date = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return diag;
}

async function enrichSupabaseAuthDiagnostics(
  diag: AppErrorDiagnostics,
): Promise<AppErrorDiagnostics> {
  if (!isSupabaseConfigured) {
    diag.supabaseAuth = { ok: false, error: 'supabase_not_configured' };
    return diag;
  }
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      diag.supabaseAuth = { ok: false, error: error.message };
      return diag;
    }
    diag.supabaseAuth = {
      ok: true,
      hasSession: Boolean(data.session),
      userId: data.session?.user?.id ?? null,
    };
    if (data.session?.user?.id && !window.__SV_LOTES_ERROR_CTX__?.userId) {
      setAppErrorContext({
        userId: data.session.user.id,
        tenantId: resolveTenantIdSync(),
      });
    }
  } catch (e) {
    diag.supabaseAuth = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  return diag;
}

export async function reportAppError(payload: AppErrorPayload): Promise<void> {
  if (typeof window === 'undefined') return;

  const key = dedupeKey(payload);
  if (shouldSkipDuplicate(key)) return;

  const userAgent = navigator.userAgent || '';
  const browser = parseBrowser(userAgent);
  const route = payload.route || getCurrentRoute();
  const tenant_id = resolveTenantIdSync();
  const user_id = resolveUserIdSync();

  let diagnostics = collectEnvironmentDiagnostics();
  diagnostics = await enrichSupabaseAuthDiagnostics(diagnostics);

  const record = {
    source: payload.source,
    message: payload.message?.slice(0, 8000) || 'Unknown error',
    error_name: payload.errorName?.slice(0, 500) || null,
    stack: payload.stack?.slice(0, 16000) || null,
    component_stack: payload.componentStack?.slice(0, 16000) || null,
    route: route.slice(0, 2000),
    user_agent: userAgent.slice(0, 2000),
    browser,
    tenant_id,
    user_id,
    diagnostics,
  };

  console.error('[SV_LOTES_ERROR]', record);

  if (!isSupabaseConfigured) {
    console.warn('[SV_LOTES_ERROR] Supabase não configurado — não persistido em app_errors');
    return;
  }

  try {
    const { error } = await supabase.from('app_errors').insert([record]);
    if (error) {
      const msg = error.message || '';
      if (/does not exist|app_errors/i.test(msg)) {
        console.warn('[SV_LOTES_ERROR] Tabela app_errors ausente — rode a migration 20260611120000_app_errors.sql', msg);
      } else {
        console.warn('[SV_LOTES_ERROR] Falha ao gravar app_errors:', error.message);
      }
    }
  } catch (e) {
    console.warn('[SV_LOTES_ERROR] Exceção ao gravar app_errors:', e);
  }
}

function normalizeErrorLike(err: unknown): {
  message: string;
  stack?: string;
  name?: string;
} {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

export function registerGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;
  if (window.__SV_LOTES_ERROR_HANDLERS__) return;
  window.__SV_LOTES_ERROR_HANDLERS__ = true;

  const prevOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    const norm = normalizeErrorLike(error ?? message);
    void reportAppError({
      source: 'window.onerror',
      message: norm.message || String(message),
      stack:
        norm.stack ||
        (source ? `${source}:${lineno}:${colno}` : undefined),
      errorName: norm.name,
      route: getCurrentRoute(),
    });
    if (typeof prevOnError === 'function') {
      return prevOnError.call(window, message, source, lineno, colno, error);
    }
    return false;
  };

  const prevOnRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const norm = normalizeErrorLike(reason);
    void reportAppError({
      source: 'window.onunhandledrejection',
      message: norm.message || 'Unhandled promise rejection',
      stack: norm.stack,
      errorName: norm.name,
      route: getCurrentRoute(),
    });
    if (typeof prevOnRejection === 'function') {
      return prevOnRejection.call(window, event);
    }
  };

  console.log('[SV_LOTES_ERROR] Handlers globais registrados', {
    browser: parseBrowser(navigator.userAgent),
    iosSafari: isIosSafari(),
  });
}

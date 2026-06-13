import { supabase } from '@/lib/supabase';

export type OwnersApiJson = {
  success?: boolean;
  error?: string;
  errorStep?: string;
  errorCode?: string;
  httpStatus?: number;
  debug?: Record<string, unknown>;
  owners?: unknown[];
  owner?: unknown;
  temporaryPassword?: string | null;
  isExisting?: boolean;
  tenantId?: string;
};

export class OwnersApiError extends Error {
  status: number;
  payload: OwnersApiJson;

  constructor(message: string, status: number, payload: OwnersApiJson = {}) {
    super(message);
    this.name = 'OwnersApiError';
    this.status = status;
    this.payload = payload;
  }
}

export type OwnersApiCallOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  path?: string;
  body?: Record<string, unknown>;
  callerUserId: string;
  tenantId?: string | null;
  impersonatingTenantId?: string | null;
};

async function getSessionToken(): Promise<string | undefined> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token;
}

function ownersApiUrl(path = '', query?: URLSearchParams): string {
  const base =
    typeof window !== 'undefined' ? `${window.location.origin}/api/owners` : '/api/owners';
  const suffix = path ? `/${path.replace(/^\//, '')}` : '';
  const queryString = query?.toString();
  return queryString ? `${base}${suffix}?${queryString}` : `${base}${suffix}`;
}

export async function callOwnersApi(options: OwnersApiCallOptions): Promise<OwnersApiJson> {
  const token = await getSessionToken();
  const method = options.method || 'GET';
  const query = new URLSearchParams();

  if (method === 'GET') {
    if (options.callerUserId) query.set('callerUserId', options.callerUserId);
    if (options.tenantId) query.set('tenantId', options.tenantId);
    if (options.impersonatingTenantId) {
      query.set('impersonatingTenantId', options.impersonatingTenantId);
    }
  }

  const body =
    method === 'GET'
      ? undefined
      : JSON.stringify({
          ...(options.body || {}),
          callerUserId: options.callerUserId,
          tenantId: options.tenantId || undefined,
          impersonatingTenantId: options.impersonatingTenantId || undefined,
        });

  const response = await fetch(ownersApiUrl(options.path || '', method === 'GET' ? query : undefined), {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

  let json: OwnersApiJson = {};
  try {
    json = (await response.json()) as OwnersApiJson;
  } catch {
    json = { error: `Resposta inválida da API (HTTP ${response.status})` };
  }

  if (!response.ok) {
    throw new OwnersApiError(
      json.error || `Falha na API de sócios/proprietários (HTTP ${response.status})`,
      response.status,
      {
        ...json,
        httpStatus: response.status,
      },
    );
  }

  return json;
}

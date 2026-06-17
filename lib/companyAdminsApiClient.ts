import { supabase } from '@/lib/supabase';

export type CompanyAdminsApiJson = {
  success?: boolean;
  error?: string;
  admins?: unknown[];
  admin?: unknown;
  meta?: unknown;
  temporaryPassword?: string | null;
  isExisting?: boolean;
  tenantId?: string;
  limit?: number;
};

export class CompanyAdminsApiError extends Error {
  status: number;
  payload: CompanyAdminsApiJson;

  constructor(message: string, status: number, payload: CompanyAdminsApiJson = {}) {
    super(message);
    this.name = 'CompanyAdminsApiError';
    this.status = status;
    this.payload = payload;
  }
}

export type CompanyAdminsApiCallOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  path?: string;
  body?: Record<string, unknown>;
  callerUserId: string;
  tenantId?: string | null;
  companyId?: string | null;
  impersonatingTenantId?: string | null;
  master?: boolean;
};

async function getSessionToken(): Promise<string | undefined> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token;
}

function companyAdminsApiUrl(
  path = '',
  query?: URLSearchParams,
  master = false,
): string {
  const basePath = master ? '/api/master/company-admins' : '/api/company-admins';
  const base = typeof window !== 'undefined' ? `${window.location.origin}${basePath}` : basePath;
  const suffix = path ? `/${path.replace(/^\//, '')}` : '';
  const queryString = query?.toString();
  return queryString ? `${base}${suffix}?${queryString}` : `${base}${suffix}`;
}

export async function callCompanyAdminsApi(
  options: CompanyAdminsApiCallOptions,
): Promise<CompanyAdminsApiJson> {
  const token = await getSessionToken();
  const method = options.method || 'GET';
  const query = new URLSearchParams();

  if (method === 'GET') {
    if (options.callerUserId) query.set('callerUserId', options.callerUserId);
    if (options.tenantId) query.set('tenantId', options.tenantId);
    if (options.companyId && options.master) query.set('companyId', options.companyId);
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
          companyId: options.companyId || options.tenantId || undefined,
          impersonatingTenantId: options.impersonatingTenantId || undefined,
        });

  const response = await fetch(
    companyAdminsApiUrl(options.path || '', method === 'GET' ? query : undefined, options.master),
    {
      method,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    },
  );

  let json: CompanyAdminsApiJson = {};
  try {
    json = (await response.json()) as CompanyAdminsApiJson;
  } catch {
    json = { error: `Resposta inválida da API (HTTP ${response.status})` };
  }

  if (!response.ok) {
    throw new CompanyAdminsApiError(
      json.error || `Falha na API de administradores (HTTP ${response.status})`,
      response.status,
      { ...json },
    );
  }

  return json;
}

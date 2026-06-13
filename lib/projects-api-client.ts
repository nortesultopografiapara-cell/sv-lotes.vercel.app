import { supabase } from '@/lib/supabase';
import { getClientConfigErrorMessage } from '@/lib/supabase-config';
import { formatProjectApiError } from '@/lib/projectEditAccess';

type ApiJson = {
  error?: string;
  code?: string;
  hint?: string;
  details?: unknown;
  project?: Record<string, unknown>;
  success?: boolean;
};

async function getSessionToken(): Promise<string | undefined> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token;
}

function projectsApiBase(): string {
  return typeof window !== 'undefined'
    ? `${window.location.origin}/api/projects`
    : '/api/projects';
}

async function callProjectsApi(
  path: string,
  method: 'POST' | 'PATCH',
  payload: Record<string, unknown>,
  logLabel: string,
): Promise<{ project: Record<string, unknown> }> {
  const configError = getClientConfigErrorMessage();
  if (configError) {
    throw new Error(configError);
  }

  const token = await getSessionToken();
  const apiUrl = `${projectsApiBase()}${path}`;

  console.log(`[${logLabel}] ${method}`, apiUrl, {
    hasSession: Boolean(token),
    projectId: payload.projectId ?? path.replace(/^\//, ''),
  });

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr: unknown) {
    const msg = networkErr instanceof Error ? networkErr.message : 'Failed to fetch';
    console.error(`[${logLabel}] rede`, { apiUrl, msg, networkErr });
    throw new Error(formatProjectApiError(0, {}, msg));
  }

  let json: ApiJson = {};
  try {
    json = (await response.json()) as ApiJson;
  } catch {
    json = { error: `Resposta inválida da API (HTTP ${response.status})` };
  }

  if (!response.ok) {
    console.error(`[${logLabel}] erro API`, {
      status: response.status,
      code: json.code,
      error: json.error,
    });
    throw new Error(formatProjectApiError(response.status, json));
  }

  return { project: json.project || {} };
}

export async function createProjectThroughApi(payload: {
  name: string;
  city: string;
  uf: string;
  neighborhood?: string | null;
  address?: string | null;
  forum_city?: string | null;
  impersonatingTenantId?: string | null;
}): Promise<{ project: Record<string, unknown> }> {
  return callProjectsApi('', 'POST', payload, 'Criar Projeto');
}

export async function updateProjectThroughApi(
  projectId: string,
  payload: {
    name: string;
    city: string;
    uf: string;
    neighborhood?: string | null;
    address?: string | null;
    forum_city?: string | null;
    impersonatingTenantId?: string | null;
  },
): Promise<{ project: Record<string, unknown> }> {
  return callProjectsApi(`/${projectId}`, 'PATCH', payload, 'Editar Projeto');
}

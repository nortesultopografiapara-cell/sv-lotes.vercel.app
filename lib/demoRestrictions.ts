import {
  DEMO_BLOCKED_API_PREFIXES,
  DEMO_BLOCKED_ROUTE_PREFIXES,
  isDemoBlockedApi,
  isDemoBlockedRoute,
  isDemoProfile,
} from '@/lib/demoConfig';

export {
  DEMO_BLOCKED_API_PREFIXES,
  DEMO_BLOCKED_ROUTE_PREFIXES,
  isDemoBlockedApi,
  isDemoBlockedRoute,
  isDemoProfile,
};

export const DEMO_ENVIRONMENT_BANNER =
  'Ambiente de demonstração — dados fictícios e resetáveis.';

export const DEMO_ACCESS_DENIED_MESSAGE =
  'Esta área não está disponível no ambiente de demonstração.';

export const DEMO_PASSWORD_BLOCKED_MESSAGE =
  'Usuário demonstração não pode alterar senha.';

export const DEMO_SENSITIVE_PROFILE_MESSAGE =
  'Usuário demonstração não pode alterar e-mail, senha ou dados críticos do perfil.';

export const DEMO_SENSITIVE_SETTINGS_MESSAGE =
  'Usuário demonstração não pode alterar configurações sensíveis da empresa.';

export function isDemoSensitiveProfileAction(isDemo?: boolean | null): boolean {
  return isDemoProfile({ is_demo: isDemo });
}

export function assertDemoSensitiveBlocked(isDemo?: boolean | null): {
  blocked: false;
} | {
  blocked: true;
  message: string;
} {
  if (!isDemoProfile({ is_demo: isDemo })) {
    return { blocked: false };
  }
  return { blocked: true, message: DEMO_SENSITIVE_SETTINGS_MESSAGE };
}

export function assertDemoCanWrite(params: {
  isDemo?: boolean | null;
  pathname: string;
  method?: string;
}): { allowed: true } | { allowed: false; message: string } {
  if (!params.isDemo) return { allowed: true };

  if (isDemoBlockedRoute(params.pathname)) {
    return { allowed: false, message: DEMO_ACCESS_DENIED_MESSAGE };
  }

  if (params.method && isDemoBlockedApi(params.pathname, params.method)) {
    return { allowed: false, message: DEMO_ACCESS_DENIED_MESSAGE };
  }

  return { allowed: true };
}

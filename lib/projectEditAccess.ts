export type ProjectEditCaller = {
  id?: string;
  role?: string | null;
  tenant_id?: string | null;
};

export type ProjectEditTarget = {
  id?: string;
  tenant_id?: string | null;
};

const EDIT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

export function normalizeProjectTenantId(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/** Quem pode editar metadados do projeto (nome, cidade, UF). */
export function canEditProject(
  caller: ProjectEditCaller | null | undefined,
  project: ProjectEditTarget | null | undefined,
  options?: { impersonatingTenantId?: string | null },
): { allowed: boolean; reason?: string } {
  if (!caller?.id) {
    return { allowed: false, reason: 'Não autenticado. Faça login novamente.' };
  }
  if (!project?.id) {
    return { allowed: false, reason: 'Projeto não encontrado.' };
  }

  const role = String(caller.role || 'USER').toUpperCase();
  if (!EDIT_ROLES.has(role)) {
    return {
      allowed: false,
      reason: 'Seu perfil não tem permissão para editar projetos. Contate o administrador.',
    };
  }

  if (role === 'SUPER_ADMIN') {
    const impersonating = normalizeProjectTenantId(options?.impersonatingTenantId);
    const projectTenant = normalizeProjectTenantId(project.tenant_id);
    if (impersonating && projectTenant && impersonating !== projectTenant) {
      return {
        allowed: false,
        reason: 'Este projeto pertence a outra empresa. Use "Entrar como Empresa" correta.',
      };
    }
    return { allowed: true };
  }

  const callerTenant = normalizeProjectTenantId(caller.tenant_id);
  const projectTenant = normalizeProjectTenantId(project.tenant_id);

  if (!callerTenant) {
    return {
      allowed: false,
      reason: 'Empresa (tenant) não vinculada ao seu usuário.',
    };
  }
  if (!projectTenant || callerTenant !== projectTenant) {
    return {
      allowed: false,
      reason: 'Você não pode editar projetos de outra empresa.',
    };
  }

  return { allowed: true };
}

export function formatProjectApiError(
  status: number,
  body: { error?: string; code?: string; hint?: string },
  networkMessage?: string,
): string {
  if (networkMessage) {
    if (networkMessage.includes('Failed to fetch') || networkMessage.includes('fetch')) {
      return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
    }
    return networkMessage;
  }
  if (body.error) return body.error;
  if (status === 401) return 'Sessão expirada. Faça login novamente.';
  if (status === 403) return 'Sem permissão para editar este projeto.';
  if (status === 404) return 'Projeto não encontrado.';
  return `Erro ao salvar projeto (HTTP ${status}).`;
}

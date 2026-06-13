import { normalizeUserRole } from '@/lib/rolePermissions';
import { isPlatformAdmin } from '@/lib/rls';

export const OWNER_ROLE = 'OWNER';

export type OwnerProjectAccessRow = {
  id?: string;
  tenant_id: string;
  user_id: string;
  project_id: string;
  can_view_dashboard: boolean;
  can_view_map: boolean;
  can_view_finance: boolean;
  can_view_contracts: boolean;
  created_at?: string;
};

export type OwnerProjectAccessInput = {
  project_id: string;
  can_view_dashboard?: boolean;
  can_view_map?: boolean;
  can_view_finance?: boolean;
  can_view_contracts?: boolean;
};

export type OwnerAccessUser = {
  id?: string;
  role?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
};

export type OwnerModuleKey = 'dashboard' | 'map' | 'finance' | 'contracts';

export type OwnerProjectOption = {
  id: string;
  name: string;
};

export function isOwnerUser(user?: OwnerAccessUser | null): boolean {
  return normalizeUserRole(user?.role) === OWNER_ROLE;
}

export function isTenantAdminRole(role?: string | null): boolean {
  const normalized = normalizeUserRole(role);
  if (isPlatformAdmin(normalized)) return true;
  return ['ADMIN', 'COMPANY_ADMIN', 'ADMIN_EMPRESA'].includes(normalized);
}

export function resolveOwnerTenantId(user?: OwnerAccessUser | null): string | null {
  if (!user) return null;
  const tenant = user.tenant_id || user.company_id;
  return tenant ? String(tenant).trim() : null;
}

export function getOwnerAllowedProjectIds(
  rows: Pick<OwnerProjectAccessRow, 'project_id'>[],
): string[] {
  return [...new Set(rows.map((row) => String(row.project_id).trim()).filter(Boolean))];
}

export function getOwnerAllowedProjectIdsForModule(
  rows: OwnerProjectAccessRow[],
  module: OwnerModuleKey,
): string[] {
  const flag =
    module === 'dashboard'
      ? 'can_view_dashboard'
      : module === 'map'
        ? 'can_view_map'
        : module === 'finance'
          ? 'can_view_finance'
          : 'can_view_contracts';

  return [
    ...new Set(
      rows
        .filter((row) => row[flag])
        .map((row) => String(row.project_id).trim())
        .filter(Boolean),
    ),
  ];
}

export function canOwnerAccessProject(
  user: OwnerAccessUser | null | undefined,
  projectId: string | null | undefined,
  allowedProjectIds: string[] | null | undefined,
): boolean {
  if (!projectId) return false;
  if (!user) return false;
  if (isPlatformAdmin(user.role) || isTenantAdminRole(user.role)) return true;
  if (!isOwnerUser(user)) return true;
  if (!allowedProjectIds?.length) return false;
  return allowedProjectIds.includes(projectId);
}

export function filterProjectsForUser<T extends { id: string }>(
  user: OwnerAccessUser | null | undefined,
  projects: T[],
  allowedProjectIds: string[] | null | undefined,
): T[] {
  if (!isOwnerUser(user)) return projects;
  if (!allowedProjectIds?.length) return [];
  const allowed = new Set(allowedProjectIds);
  return projects.filter((project) => allowed.has(project.id));
}

function ownerModuleFlag(module: OwnerModuleKey): keyof OwnerProjectAccessRow {
  switch (module) {
    case 'dashboard':
      return 'can_view_dashboard';
    case 'map':
      return 'can_view_map';
    case 'finance':
      return 'can_view_finance';
    default:
      return 'can_view_contracts';
  }
}

export function buildOwnerProjectOptionsFromAccessRows(
  rows: OwnerProjectAccessRow[],
  allProjects: Array<{ id: string; name: string }>,
  module: OwnerModuleKey,
): OwnerProjectOption[] {
  const allowedIds = getOwnerAllowedProjectIdsForModule(rows, module);
  const projectById = new Map(allProjects.map((project) => [project.id, project]));
  const options: OwnerProjectOption[] = [];

  for (const id of allowedIds) {
    const project = projectById.get(id);
    if (project) {
      options.push({ id: project.id, name: project.name });
    }
  }

  return options.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function fetchOwnerProjectOptionsForModule(
  client: SupabaseLike,
  userId: string,
  tenantId: string,
  module: OwnerModuleKey,
): Promise<OwnerProjectOption[]> {
  const flag = ownerModuleFlag(module);
  let query = client
    .from('owner_project_access')
    .select(`project_id, ${flag}, projects(id, name)`)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq(flag, true);

  const { data, error } = await query;
  if (error) {
    console.warn('OWNER_PROJECT_OPTIONS_FETCH_ERROR', error.message);
    return [];
  }

  const options: OwnerProjectOption[] = [];
  for (const row of (data || []) as Array<{
    project_id?: string;
    projects?: { id?: string; name?: string } | null;
  }>) {
    const joined = row.projects;
    if (joined?.id && joined?.name) {
      options.push({ id: joined.id, name: joined.name });
      continue;
    }
    if (row.project_id) {
      options.push({
        id: String(row.project_id),
        name: String(row.project_id),
      });
    }
  }

  return options.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function resolveFinanceProjectFilterList(
  user: OwnerAccessUser | null | undefined,
  ownerRows: OwnerProjectAccessRow[],
  allProjects: Array<{ id: string; name: string }>,
  explicitOptions?: OwnerProjectOption[],
): string[] {
  if (!isOwnerUser(user)) {
    return allProjects
      .map((project) => project.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  const options =
    explicitOptions?.length
      ? explicitOptions
      : buildOwnerProjectOptionsFromAccessRows(ownerRows, allProjects, 'finance');

  return options.map((project) => project.name);
}

export function aggregateOwnerPermissions(rows: OwnerProjectAccessRow[]) {
  return {
    can_view_dashboard: rows.some((row) => row.can_view_dashboard),
    can_view_map: rows.some((row) => row.can_view_map),
    can_view_finance: rows.some((row) => row.can_view_finance),
    can_view_contracts: rows.some((row) => row.can_view_contracts),
  };
}

export function ownerCanAccessModule(
  rows: OwnerProjectAccessRow[],
  module: OwnerModuleKey,
): boolean {
  if (rows.length === 0) return false;
  switch (module) {
    case 'dashboard':
      return rows.some((row) => row.can_view_dashboard);
    case 'map':
      return rows.some((row) => row.can_view_map);
    case 'finance':
      return rows.some((row) => row.can_view_finance);
    case 'contracts':
      return rows.some((row) => row.can_view_contracts);
    default:
      return false;
  }
}

export function ownerCanAccessModuleForProject(
  rows: OwnerProjectAccessRow[],
  projectId: string | null | undefined,
  module: OwnerModuleKey,
): boolean {
  if (!projectId) return false;
  const row = rows.find((item) => item.project_id === projectId);
  if (!row) return false;
  switch (module) {
    case 'dashboard':
      return row.can_view_dashboard;
    case 'map':
      return row.can_view_map;
    case 'finance':
      return row.can_view_finance;
    case 'contracts':
      return row.can_view_contracts;
    default:
      return false;
  }
}

export function filterRowsByOwnerProjects<T>(
  rows: T[],
  allowedProjectIds: string[] | null | undefined,
  resolveProjectId: (row: T) => string | null | undefined,
): T[] {
  if (!allowedProjectIds) return rows;
  if (allowedProjectIds.length === 0) return [];
  const allowed = new Set(allowedProjectIds);
  return rows.filter((row) => {
    const projectId = resolveProjectId(row);
    return projectId ? allowed.has(projectId) : false;
  });
}

export function resolveReceiptProjectId(receipt: {
  project_id?: string | null;
  sales?: { project_id?: string | null; projects?: { id?: string } | null } | null;
  blocks?: { project_id?: string | null; projects?: { id?: string } | null } | null;
  projects?: { id?: string } | null;
}): string | null {
  return (
    receipt.project_id ||
    receipt.projects?.id ||
    receipt.sales?.project_id ||
    receipt.sales?.projects?.id ||
    receipt.blocks?.project_id ||
    receipt.blocks?.projects?.id ||
    null
  );
}

export function resolveContractProjectId(contract: {
  project_id?: string | null;
  sales?: { project_id?: string | null; projects?: { id?: string } | null } | null;
  blocks?: { project_id?: string | null; projects?: { id?: string } | null } | null;
  projects?: { id?: string } | null;
}): string | null {
  return (
    contract.project_id ||
    contract.projects?.id ||
    contract.sales?.project_id ||
    contract.sales?.projects?.id ||
    contract.blocks?.project_id ||
    contract.blocks?.projects?.id ||
    null
  );
}

export function resolveCashMovementProjectId(movement: {
  project_id?: string | null;
  projects?: { id?: string } | null;
  sales?: { project_id?: string | null; projects?: { id?: string } | null } | null;
  contracts?: { project_id?: string | null; projects?: { id?: string } | null } | null;
}): string | null {
  return (
    movement.project_id ||
    movement.projects?.id ||
    movement.sales?.project_id ||
    movement.sales?.projects?.id ||
    movement.contracts?.project_id ||
    movement.contracts?.projects?.id ||
    null
  );
}

export function resolveCommissionProjectId(commission: {
  project_id?: string | null;
  sales?: { project_id?: string | null; projects?: { id?: string } | null } | null;
  contracts?: { project_id?: string | null; projects?: { id?: string } | null } | null;
}): string | null {
  return (
    commission.project_id ||
    commission.sales?.project_id ||
    commission.sales?.projects?.id ||
    commission.contracts?.project_id ||
    commission.contracts?.projects?.id ||
    null
  );
}

export function ownerBlockedRoutePrefixes(): string[] {
  return [
    '/customers',
    '/dashboard/brokers',
    '/settings',
    '/users',
    '/owners',
    '/companies',
    '/crm',
    '/logs',
    '/plans',
    '/saas-finance',
    '/offline-sync',
    '/reports',
    '/master',
  ];
}

export function isOwnerBlockedRoute(pathname: string): boolean {
  return ownerBlockedRoutePrefixes().some((route) => pathname.startsWith(route));
}

export function canOwnerAccessRoute(
  pathname: string,
  permissions: ReturnType<typeof aggregateOwnerPermissions>,
): boolean {
  if (pathname.startsWith('/dashboard')) return permissions.can_view_dashboard;
  if (pathname.startsWith('/map')) return permissions.can_view_map;
  if (pathname.startsWith('/finance')) return permissions.can_view_finance;
  if (pathname.startsWith('/contracts')) return permissions.can_view_contracts;
  return false;
}

type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string) => any;
  };
};

export async function fetchOwnerProjectAccessRows(
  client: SupabaseLike,
  userId: string,
  tenantId?: string | null,
): Promise<OwnerProjectAccessRow[]> {
  let query = client
    .from('owner_project_access')
    .select(
      'id, tenant_id, user_id, project_id, can_view_dashboard, can_view_map, can_view_finance, can_view_contracts, created_at',
    )
    .eq('user_id', userId);

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('OWNER_PROJECT_ACCESS_FETCH_ERROR', error.message);
    return [];
  }
  return (data || []) as OwnerProjectAccessRow[];
}

export async function loadOwnerAccessContext(
  client: SupabaseLike,
  user: OwnerAccessUser | null | undefined,
  tenantId?: string | null,
): Promise<{
  isOwner: boolean;
  rows: OwnerProjectAccessRow[];
  allowedProjectIds: string[] | null;
  permissions: ReturnType<typeof aggregateOwnerPermissions>;
}> {
  if (!user || !isOwnerUser(user)) {
    return {
      isOwner: false,
      rows: [],
      allowedProjectIds: null,
      permissions: {
        can_view_dashboard: true,
        can_view_map: true,
        can_view_finance: true,
        can_view_contracts: true,
      },
    };
  }

  const resolvedTenant = tenantId || resolveOwnerTenantId(user);
  if (!user.id || !resolvedTenant) {
    return {
      isOwner: true,
      rows: [],
      allowedProjectIds: [],
      permissions: {
        can_view_dashboard: false,
        can_view_map: false,
        can_view_finance: false,
        can_view_contracts: false,
      },
    };
  }

  const rows = await fetchOwnerProjectAccessRows(client, user.id, resolvedTenant);
  return {
    isOwner: true,
    rows,
    allowedProjectIds: getOwnerAllowedProjectIds(rows),
    permissions: aggregateOwnerPermissions(rows),
  };
}

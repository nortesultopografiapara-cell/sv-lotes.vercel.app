import type { SupabaseClient } from '@supabase/supabase-js';
import { applyTenantFilter, type RlsContext } from '@/lib/rls';
import {
  filterProjectsForUser,
  filterRowsByOwnerProjects,
  getOwnerAllowedProjectIdsForModule,
  loadOwnerAccessContext,
} from '@/lib/ownerProjectAccess';
import { buildLotReport, filterBlocksByProjectIds } from '@/lib/lotReportExport/buildLotReport';
import type {
  LotReportBlockRecord,
  LotReportBuildResult,
  LotReportOptions,
} from '@/lib/lotReportExport/types';

export type FetchLotReportParams = {
  selectedProjectId?: string;
  options: Pick<LotReportOptions, 'groupBy' | 'sortBy' | 'filters'>;
};

export type FetchLotReportResult = {
  result: LotReportBuildResult;
  projectLabel: string;
  allowedProjectIds: string[];
};

export async function fetchLotReportForExport(
  supabase: SupabaseClient,
  user: Record<string, unknown>,
  rlsCtx: RlsContext,
  params: FetchLotReportParams,
): Promise<FetchLotReportResult> {
  const resolvedTenantId =
    rlsCtx.tenantId ||
    (user.tenant_id as string) ||
    (user.company_id as string) ||
    null;

  let blocksQuery = supabase
    .from('blocks')
    .select(
      'project_id, block_name, name, number, lot_number, area, price, status, projects(id, name)',
    );
  let projectsQuery = supabase.from('projects').select('id, name');

  blocksQuery = applyTenantFilter(blocksQuery, rlsCtx, 'blocks');
  projectsQuery = applyTenantFilter(projectsQuery, rlsCtx, 'projects');

  const [{ data: blocksData, error }, { data: projectsData }] = await Promise.all([
    blocksQuery,
    projectsQuery,
  ]);

  if (error) throw error;

  const ownerCtx = await loadOwnerAccessContext(supabase, user, resolvedTenantId);
  const ownerDashboardProjectIds = ownerCtx.isOwner
    ? getOwnerAllowedProjectIdsForModule(ownerCtx.rows, 'dashboard')
    : ownerCtx.allowedProjectIds;

  const visibleProjects = filterProjectsForUser(
    user,
    projectsData || [],
    ownerDashboardProjectIds,
  );
  const allowedProjectIds = visibleProjects.map((p) => String(p.id));

  const projectNameById = Object.fromEntries(
    visibleProjects.map((p) => [String(p.id), String(p.name || '')]),
  );

  let blocks = (blocksData || []) as LotReportBlockRecord[];
  blocks = filterRowsByOwnerProjects(
    blocks,
    ownerDashboardProjectIds,
    (row) => row.project_id as string | null | undefined,
  ) as LotReportBlockRecord[];

  if (!ownerCtx.isOwner) {
    // tenant filter already applied
  }

  blocks = filterBlocksByProjectIds(
    blocks,
    params.selectedProjectId ? [params.selectedProjectId] : allowedProjectIds,
  );

  const projectLabel = params.selectedProjectId
    ? projectNameById[params.selectedProjectId] || 'Empreendimento'
    : 'Todos os empreendimentos';

  const result = buildLotReport(blocks, params.options, projectNameById);

  return { result, projectLabel, allowedProjectIds };
}

export function assertOwnerProjectExportAllowed(
  selectedProjectId: string | undefined,
  allowedProjectIds: string[],
): void {
  if (!selectedProjectId) return;
  if (!allowedProjectIds.includes(selectedProjectId)) {
    throw new Error('Sem permissão para exportar este empreendimento.');
  }
}

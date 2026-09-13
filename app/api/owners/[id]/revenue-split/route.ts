import { NextResponse } from 'next/server';
import {
  authorizeRevenueSplitAdmin,
  revenueSplitErrorResponse,
} from '@/lib/finance/revenueSplit/httpAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await authorizeRevenueSplitAdmin(request);
  if ('error' in auth) return auth.error;
  try {
    const { id } = await context.params;
    const result = await auth.service.listOwnerParticipations({
      actor: { role: auth.role, companyId: auth.tenantId, userId: auth.userId },
      companyId: auth.tenantId,
      userId: id,
    });
    const projectIds = [...new Set(result.participants.map((row) => row.projectId))];
    const { data: projects } = projectIds.length
      ? await auth.admin.from('projects').select('id, name').in('id', projectIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const names = new Map((projects || []).map((row) => [row.id, row.name]));
    return NextResponse.json({
      participations: result.participants.map((row) => ({
        ...row,
        projectName: names.get(row.projectId) || 'Empreendimento',
        destination: result.destinations.find(
          (item) => item.financialAccountId === row.financialAccountId && item.status === 'ACTIVE',
        ) || null,
      })),
    });
  } catch (err) {
    return revenueSplitErrorResponse(err);
  }
}

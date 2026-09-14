import { NextResponse } from 'next/server';
import {
  authorizeRevenueSplitAdmin,
  revenueSplitErrorResponse,
} from '@/lib/finance/revenueSplit/httpAuth';
import type { ProjectRevenueSplitParticipantInput } from '@/lib/finance/revenueSplit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function readParticipants(body: Record<string, unknown>): ProjectRevenueSplitParticipantInput[] {
  const raw = Array.isArray(body.participants) ? body.participants : [];
  return raw.map((item, index) => {
    const row = (item || {}) as Record<string, unknown>;
    return {
      displayName: String(row.displayName ?? row.display_name ?? '').trim(),
      partyKind: String(row.partyKind ?? row.party_kind ?? 'OWNER') as ProjectRevenueSplitParticipantInput['partyKind'],
      userId: String(row.userId ?? row.user_id ?? '').trim() || null,
      financialAccountId: String(row.financialAccountId ?? row.financial_account_id ?? '').trim() || null,
      sharePercent: Number(row.sharePercent ?? row.share_percent ?? 0),
      isIssuerRemainder: Boolean(row.isIssuerRemainder ?? row.is_issuer_remainder),
      sortOrder: Number(row.sortOrder ?? row.sort_order ?? index),
      active: row.active !== false,
    };
  });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await authorizeRevenueSplitAdmin(request);
  if ('error' in auth) return auth.error;
  try {
    const { id } = await context.params;
    const view = await auth.service.getProjectRevenueSplitView(id, auth.tenantId);
    return NextResponse.json(view);
  } catch (err) {
    return revenueSplitErrorResponse(err);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const auth = await authorizeRevenueSplitAdmin(request, {
    impersonatingTenantId: String(body.impersonatingTenantId || '').trim() || null,
    tenantId: String(body.tenantId || '').trim() || null,
  });
  if ('error' in auth) return auth.error;

  try {
    const { id } = await context.params;
    const action = String(body.action || 'draft').toLowerCase();
    const participants = readParticipants(body);
    const actor = { role: auth.role, companyId: auth.tenantId, userId: auth.userId };

    if (action === 'inspect') {
      const inspection = await auth.service.inspectProjectRevenueSplit({
        companyId: auth.tenantId,
        projectId: id,
        enabled: true,
        status: 'ACTIVE',
        participants,
      });
      return NextResponse.json(inspection);
    }

    const status =
      action === 'activate' ? 'ACTIVE' : action === 'deactivate' ? 'INACTIVE' : 'DRAFT';
    const enabled = action === 'activate';

    if (action === 'activate') {
      const inspection = await auth.service.inspectProjectRevenueSplit({
        companyId: auth.tenantId,
        projectId: id,
        enabled: true,
        status: 'ACTIVE',
        participants,
      });
      if (!inspection.ok) {
        return NextResponse.json(
          { error: inspection.issues[0]?.message || 'Configuração inválida para ativar.', code: 'VALIDATION', issues: inspection.issues },
          { status: 400 },
        );
      }
    }

    const saved = await auth.service.saveProjectRevenueSplit({
      actor,
      companyId: auth.tenantId,
      projectId: id,
      enabled,
      status,
      participants,
    });
    const view = await auth.service.getProjectRevenueSplitView(id, auth.tenantId);
    return NextResponse.json({ ...view, saved });
  } catch (err) {
    return revenueSplitErrorResponse(err);
  }
}

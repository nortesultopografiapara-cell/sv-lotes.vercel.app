import { NextResponse } from 'next/server';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import { isBrokerRole } from '@/lib/rolePermissions';
import {
  BROKER_UNLINKED_MESSAGE,
  resolveAuthenticatedBroker,
} from '@/lib/broker/resolveAuthenticatedBroker';
import {
  getMySalesDetailForBroker,
  listMySalesForBroker,
} from '@/lib/broker/mySalesService';
import type { MySalesListTab } from '@/lib/broker/mySalesTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resolveCompanyId(
  profile: { tenant_id?: string | null; company_id?: string | null } | null,
  userMeta?: Record<string, unknown>,
): string | null {
  const fromProfile = String(profile?.company_id || profile?.tenant_id || '').trim();
  if (fromProfile) return fromProfile;
  const fromMeta = String(userMeta?.tenant_id || userMeta?.company_id || '').trim();
  return fromMeta || null;
}

function dbErrorResponse(err: unknown, context: string) {
  const message = err instanceof Error ? err.message : String(err || 'erro desconhecido');
  console.error(`[api/my-sales] ${context}`, message);
  return NextResponse.json(
    {
      error: message,
      code: 'MY_SALES_QUERY_FAILED',
      summaryUnavailable: true,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json(
        { error: configError || 'Não autenticado' },
        { status: 401 },
      );
    }

    const { client: admin, configError: adminError } = createAdminSupabase();
    if (!admin || adminError) {
      return NextResponse.json(
        { error: adminError || 'Supabase não configurado' },
        { status: 503 },
      );
    }

    const profile = await resolveCallerProfile(admin, user.id);
    const { data: userRow } = await admin
      .from('users')
      .select('tenant_id, company_id, role')
      .eq('id', user.id)
      .maybeSingle();

    const role = String(
      profile?.role || userRow?.role || user.user_metadata?.role || '',
    ).toUpperCase();
    if (!isBrokerRole(role)) {
      return NextResponse.json(
        { error: 'Acesso restrito a corretores.' },
        { status: 403 },
      );
    }

    const companyId = resolveCompanyId(
      {
        tenant_id: profile?.tenant_id ?? userRow?.tenant_id,
        company_id: (userRow as { company_id?: string | null } | null)?.company_id,
      },
      user.user_metadata as Record<string, unknown>,
    );
    if (!companyId) {
      return NextResponse.json(
        { error: 'Empresa não identificada para o usuário.' },
        { status: 403 },
      );
    }

    const brokerResult = await resolveAuthenticatedBroker(admin, user.id, companyId);
    if (!brokerResult.ok) {
      return NextResponse.json({
        brokerUnlinked: true,
        message: BROKER_UNLINKED_MESSAGE,
        summary: {
          totalSales: 0,
          salesThisMonth: 0,
          activeReservations: 0,
          pendingContracts: 0,
          signedContracts: 0,
        },
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        projects: [],
      });
    }

    const url = new URL(request.url);
    const detailId = url.searchParams.get('id');
    const detailType = url.searchParams.get('type') as 'sale' | 'reservation' | null;
    const brokerCtx = {
      companyId,
      brokerId: brokerResult.broker.id,
      brokerName: brokerResult.broker.name,
      authUserId: brokerResult.broker.authUserId || user.id,
      userId: brokerResult.broker.userId,
    };

    if (detailId && (detailType === 'sale' || detailType === 'reservation')) {
      try {
        const detail = await getMySalesDetailForBroker(admin, {
          ...brokerCtx,
          recordId: detailId,
          type: detailType,
        });
        if (!detail) {
          return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 });
        }
        return NextResponse.json({ detail, brokerName: brokerResult.broker.name });
      } catch (err) {
        return dbErrorResponse(err, 'detail');
      }
    }

    const tab = (url.searchParams.get('tab') || 'all') as MySalesListTab;
    const page = Number(url.searchParams.get('page') || 1);
    const pageSize = Number(url.searchParams.get('pageSize') || 20);

    try {
      const result = await listMySalesForBroker(admin, {
        ...brokerCtx,
        filters: {
          tab: ['all', 'sales', 'reservations'].includes(tab) ? tab : 'all',
          projectId: url.searchParams.get('projectId'),
          status: url.searchParams.get('status'),
          search: url.searchParams.get('search'),
          startDate: url.searchParams.get('startDate'),
          endDate: url.searchParams.get('endDate'),
          blockLabel: url.searchParams.get('block'),
          lotLabel: url.searchParams.get('lot'),
          page,
          pageSize,
        },
      });
      return NextResponse.json(result);
    } catch (err) {
      return dbErrorResponse(err, 'list');
    }
  } catch (err) {
    return dbErrorResponse(err, 'unhandled');
  }
}

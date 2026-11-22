import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import { isTenantEnterpriseAdminRole } from '@/lib/rolePermissions';
import {
  deleteCompanyFinancialAccount,
  FinancialAccountLifecycleError,
  inspectCompanyFinancialAccount,
  setCompanyFinancialAccountActive,
} from '@/lib/finance/companyFinancialAccountLifecycle';
import {
  readPrimaryAdminVerifyRequest,
  verifyPrimaryAdminPassword,
} from '@/lib/primaryAdminReauth';
import {
  createPrimaryAdminReauthDeps,
  persistPrimaryAdminVerifyAudit,
} from '@/lib/primaryAdminReauthServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function lifecycleError(error: unknown) {
  if (error instanceof FinancialAccountLifecycleError) {
    return NextResponse.json(
      { error: error.message, decision: error.decision },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Não foi possível alterar a conta financeira.' },
    { status: 500 },
  );
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;
  if (!isTenantEnterpriseAdminRole(auth.role)) {
    return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
  }

  const { id } = await context.params;
  try {
    const inspected = await inspectCompanyFinancialAccount(auth.admin, auth.tenantId, id);
    return NextResponse.json(inspected);
  } catch (error) {
    return lifecycleError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;
  if (!isTenantEnterpriseAdminRole(auth.role)) {
    return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const record = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const action = String(record.action || '');
  const expectedUpdatedAt = String(record.expectedUpdatedAt || record.expected_updated_at || '');
  if (!expectedUpdatedAt) {
    return NextResponse.json({ error: 'Atualize a tela antes de alterar a conta.' }, { status: 422 });
  }
  if (action !== 'deactivate' && action !== 'reactivate' && action !== 'delete') {
    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 422 });
  }

  try {
    if (action === 'delete') {
      const authEnvUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
      const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
      if (!authEnvUrl || !anonKey) {
        return NextResponse.json({ error: 'Autenticação indisponível.' }, { status: 503 });
      }
      const { password } = readPrimaryAdminVerifyRequest(record);
      const verify = await verifyPrimaryAdminPassword(
        createPrimaryAdminReauthDeps(auth.admin, { url: authEnvUrl, anonKey }),
        { operatorUserId: auth.userId, password, companyId: auth.tenantId },
      );
      await persistPrimaryAdminVerifyAudit(auth.admin, verify);
      if (!verify.ok || verify.tenantId !== auth.tenantId) {
        return NextResponse.json({ error: 'Autorização não concedida.' }, { status: 403 });
      }
      await deleteCompanyFinancialAccount(
        auth.admin,
        auth.tenantId,
        id,
        expectedUpdatedAt,
        String(record.confirmation || ''),
      );
      return NextResponse.json({ deleted: true });
    }

    const decision = await setCompanyFinancialAccountActive(
      auth.admin,
      auth.tenantId,
      id,
      action === 'reactivate',
      expectedUpdatedAt,
    );
    return NextResponse.json({ active: action === 'reactivate', decision });
  } catch (error) {
    return lifecycleError(error);
  }
}

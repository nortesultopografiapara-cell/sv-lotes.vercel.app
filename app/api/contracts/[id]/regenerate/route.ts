import { NextResponse } from 'next/server';
import {
  loadSaleContractContext,
  regenerateSaleContract,
  resolveRegenerationSession,
} from '@/lib/contractRegeneration';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json(
        { error: configError || 'Não autenticado' },
        { status: 401 },
      );
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json(
        { error: adminError || 'Supabase não configurado' },
        { status: 503 },
      );
    }

    const profile = await resolveCallerProfile(supabase, user.id);
    const callerRole = String(profile?.role || '').toUpperCase();
    const callerTenant = profile?.tenant_id || profile?.company_id || null;

    const { id: contractId } = await params;
    console.log('REGENERATE_CONTRACT_START', contractId);
    console.log('CONTRACT_REGENERATE_CONFIRM', { contractId, userId: user.id });

    const contract = await loadSaleContractContext(supabase, contractId);

    let body: { impersonatingTenantId?: string; activeTenantId?: string } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const session = resolveRegenerationSession(contract, {
      callerTenantId:
        body.activeTenantId ||
        callerTenant ||
        (profile?.tenant_id as string) ||
        (profile?.company_id as string) ||
        null,
      callerRole,
      impersonatingTenantId: body.impersonatingTenantId || null,
    });

    const result = await regenerateSaleContract(supabase, {
      contractId,
      regeneratedByUserId: user.id,
      session,
    });

    return NextResponse.json({
      success: true,
      contract: result.newContract,
      versions: result.versions,
      oldVersion: result.oldContract.version,
      newVersion: result.newContract.version,
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error('Erro ao regenerar contrato');
    console.error('CONTRACT_REGENERATE_ERROR', error.message, error.stack);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 },
    );
  }
}

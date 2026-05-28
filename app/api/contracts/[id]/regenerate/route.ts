import { NextResponse } from 'next/server';
import {
  loadSaleContractContext,
  regenerateSaleContract,
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

    const contractTenant =
      (contract.tenant_id as string) || (contract.company_id as string);
    const isSuperAdmin =
      callerRole === 'SUPER_ADMIN' ||
      callerRole === 'MASTER' ||
      callerRole === 'MASTER_ADMIN' ||
      callerRole === 'MASTER-ADMIN';

    if (
      !isSuperAdmin &&
      contractTenant &&
      callerTenant &&
      contractTenant !== callerTenant
    ) {
      return NextResponse.json(
        { error: 'Sem permissão para este contrato.' },
        { status: 403 },
      );
    }

    const result = await regenerateSaleContract(supabase, {
      contractId,
      regeneratedByUserId: user.id,
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

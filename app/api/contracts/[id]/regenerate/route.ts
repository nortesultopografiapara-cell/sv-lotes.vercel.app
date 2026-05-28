import { NextResponse } from 'next/server';
import {
  ContractNotFoundError,
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
    console.log('REGENERATE_ID_RECEIVED', contractId);
    console.log('REGENERATE_CONTRACT_START', contractId);
    console.log('CONTRACT_REGENERATE_CONFIRM', { contractId, userId: user.id });

    let contract: Record<string, unknown>;
    try {
      contract = await loadSaleContractContext(supabase, contractId);
    } catch (lookupErr) {
      if (lookupErr instanceof ContractNotFoundError) {
        console.error('CONTRACT_REGENERATE_NOT_FOUND', {
          receivedId: lookupErr.receivedId,
          lookup: lookupErr.lookup,
          supabaseCode: lookupErr.supabaseCode,
          supabaseMessage: lookupErr.supabaseMessage,
        });
        return NextResponse.json(
          {
            success: false,
            error: 'Contrato não encontrado',
            receivedId: lookupErr.receivedId || contractId,
            lookup: lookupErr.lookup,
            supabaseCode: lookupErr.supabaseCode,
            supabaseMessage: lookupErr.supabaseMessage,
          },
          { status: 404 },
        );
      }
      throw lookupErr;
    }

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

    const resolvedContractId = String(contract.id || contractId);

    const result = await regenerateSaleContract(supabase, {
      contractId: resolvedContractId,
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
    const { id: receivedId } = await params;
    if (e instanceof ContractNotFoundError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Contrato não encontrado',
          receivedId: e.receivedId || receivedId,
        },
        { status: 404 },
      );
    }

    const error = e instanceof Error ? e : new Error('Erro ao regenerar contrato');
    if (error.message?.includes('html_content')) {
      console.warn('REGENERATE_HTML_COLUMN_MISSING', {
        message: error.message,
        receivedId,
      });
    }
    console.error('CONTRACT_REGENERATE_ERROR', error.message, error.stack);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        receivedId,
        stack: error.stack,
      },
      { status: 500 },
    );
  }
}

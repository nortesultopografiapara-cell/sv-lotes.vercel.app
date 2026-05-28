import { NextResponse } from 'next/server';
import {
  loadSaleContractContext,
  regenerateSaleContract,
} from '@/lib/contractRegeneration';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';

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

    const { id: contractId } = await params;
    const contract = await loadSaleContractContext(supabase, contractId);

    const contractTenant =
      (contract.tenant_id as string) || (contract.company_id as string);
    const userTenant = user.tenant_id || user.company_id;
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    if (!isSuperAdmin && contractTenant && userTenant && contractTenant !== userTenant) {
      return NextResponse.json({ error: 'Sem permissão para este contrato.' }, { status: 403 });
    }

    const result = await regenerateSaleContract(supabase, {
      contractId,
      regeneratedByUserId: user.id,
    });

    return NextResponse.json({
      success: true,
      contract: result.newContract,
      versions: result.versions,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro ao regenerar contrato';
    console.error('[API contract regenerate]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

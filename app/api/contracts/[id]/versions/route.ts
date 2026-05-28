import { NextResponse } from 'next/server';
import {
  ContractNotFoundError,
  loadSaleContractContext,
  listSaleContractVersions,
} from '@/lib/contractRegeneration';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ error: configError || 'Não autenticado' }, { status: 401 });
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json({ error: adminError || 'Supabase não configurado' }, { status: 503 });
    }

    const profile = await resolveCallerProfile(supabase, user.id);
    const callerTenant = profile?.tenant_id || profile?.company_id || null;
    const callerRole = String(profile?.role || '').toUpperCase();
    const isSuperAdmin =
      callerRole === 'SUPER_ADMIN' ||
      callerRole === 'MASTER' ||
      callerRole === 'MASTER_ADMIN' ||
      callerRole === 'MASTER-ADMIN';

    const { id: contractId } = await params;
    const contract = await loadSaleContractContext(supabase, contractId);

    const contractTenant =
      (contract.tenant_id as string) || (contract.company_id as string);
    if (
      !isSuperAdmin &&
      contractTenant &&
      callerTenant &&
      contractTenant !== callerTenant
    ) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
    }
    const saleId = contract.sale_id as string;
    if (!saleId) {
      return NextResponse.json({ versions: [contract] });
    }

    const versions = await listSaleContractVersions(supabase, saleId);
    return NextResponse.json({ versions, active: versions.find((v) => v.status === 'ativo') });
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
    const message = e instanceof Error ? e.message : 'Erro ao listar versões';
    console.error('CONTRACT_VERSIONS_ERROR', message, e);
    return NextResponse.json(
      { success: false, error: message, receivedId },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import { createSaleContractPdfResponse } from '@/lib/saleContractPdfHttp';
import { loadSignedSaleContractArtifact } from '@/lib/saleContractSignedArtifact';
import {
  SaleContractSignatureError,
} from '@/lib/saleContractSignatureService';
import { loadSaleContractContext } from '@/lib/contractRegeneration';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function assertContractAccess(
  supabase: NonNullable<Awaited<ReturnType<typeof createAdminSupabase>>['client']>,
  contractId: string,
  userId: string,
) {
  const profile = await resolveCallerProfile(supabase, userId);
  const callerRole = String(profile?.role || '').toUpperCase();
  if (callerRole === 'OWNER') {
    throw new SaleContractSignatureError(
      'Perfil OWNER possui acesso somente leitura.',
    );
  }

  const contract = await loadSaleContractContext(supabase, contractId);
  const tenantId = String(contract.tenant_id || contract.company_id || '');
  const callerTenant = String(profile?.tenant_id || profile?.company_id || '');

  const isSuperAdmin = ['SUPER_ADMIN', 'MASTER-ADMIN', 'MASTER_ADMIN'].includes(callerRole);
  if (!isSuperAdmin && callerTenant && tenantId && callerTenant !== tenantId) {
    throw new SaleContractSignatureError('Sem permissão para este contrato.');
  }

  return contract;
}

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

    const { id: contractId } = await params;
    const contract = await assertContractAccess(supabase, contractId, user.id);
    const url = new URL(request.url);
    const download = url.searchParams.get('download') === '1';

    const artifact = await loadSignedSaleContractArtifact(
      supabase,
      contractId,
      contract as Record<string, unknown>,
    );

    if (!artifact) {
      return NextResponse.json(
        { error: 'Contrato sem assinatura eletrônica registrada.' },
        { status: 404 },
      );
    }

    return createSaleContractPdfResponse(
      artifact.bytes,
      download ? 'attachment' : 'inline',
      artifact.contractNumber,
    );
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao gerar PDF.';
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    console.error('[CONTRACT_SIGNED_PDF]', message);
    return NextResponse.json({ error: message }, { status });
  }
}

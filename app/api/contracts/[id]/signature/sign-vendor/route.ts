import { NextResponse } from 'next/server';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import {
  resolveClientIp,
  SaleContractSignatureError,
  signSaleContractByVendor,
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

  return { contract, profile };
}

export async function POST(
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
    await assertContractAccess(supabase, contractId, user.id);

    const body = await request.json().catch(() => ({}));
    const signatureId = typeof body.signatureId === 'string' ? body.signatureId : null;
    if (!signatureId) {
      return NextResponse.json({ error: 'signatureId é obrigatório.' }, { status: 400 });
    }

    const result = await signSaleContractByVendor(supabase, contractId, signatureId, {
      vendorName: String(body.vendorName || ''),
      vendorDocument: String(body.vendorDocument || ''),
      vendorEmail: String(body.vendorEmail || ''),
      vendorRole: body.vendorRole ? String(body.vendorRole) : null,
      ipAddress: resolveClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({
      success: true,
      signature: result.signature,
      pdfSignedUrl: result.pdfSignedUrl,
    });
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao assinar como vendedor.';
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    console.error('SALE_CONTRACT_VENDOR_SIGN_ERROR', { message });
    return NextResponse.json({ error: message }, { status });
  }
}

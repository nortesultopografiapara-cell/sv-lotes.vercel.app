import { NextResponse } from 'next/server';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import { persistLfEstrelaPhysicalPdf } from '@/lib/lfEstrelaSignedPdf';
import { isPdfBytes } from '@/lib/saasContractPdfHttp';
import { SaleContractSignatureError } from '@/lib/saleContractSignatureService';
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

  const isSuperAdmin = ['SUPER_ADMIN', 'MASTER-ADMIN', 'MASTER_ADMIN'].includes(
    callerRole,
  );
  if (!isSuperAdmin && callerTenant && tenantId && callerTenant !== tenantId) {
    throw new SaleContractSignatureError('Sem permissão para este contrato.');
  }

  return contract;
}

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
    const contract = await assertContractAccess(supabase, contractId, user.id);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'Envie o PDF físico em file.' },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPdfBytes(bytes)) {
      return NextResponse.json({ error: 'Arquivo não é PDF.' }, { status: 400 });
    }
    if (bytes.byteLength > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'PDF físico excede 25 MB.' },
        { status: 413 },
      );
    }

    const tenantId = String(contract.tenant_id || contract.company_id || '');
    const contractNumber = String(contract.contract_number || contractId);
    const result = await persistLfEstrelaPhysicalPdf({
      supabaseAdmin: supabase,
      contractId,
      tenantId,
      contractNumber,
      pdfBytes: bytes,
      overwrite: false,
    });

    return NextResponse.json({
      success: true,
      frozen: true,
      reused: result.reused,
      sha256: result.sha256,
      pageCount: result.pageCount,
      pdfUrl: result.url,
    });
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao congelar PDF físico.';
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    console.error('[CONTRACT_PHYSICAL_PDF]', message);
    return NextResponse.json({ error: message }, { status });
  }
}

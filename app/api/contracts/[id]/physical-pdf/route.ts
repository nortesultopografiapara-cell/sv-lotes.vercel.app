import { NextResponse } from 'next/server';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import {
  confirmLfEstrelaPhysicalDirectUpload,
  prepareLfEstrelaPhysicalDirectUpload,
} from '@/lib/lfEstrelaSignedPdf';
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

/**
 * Autoriza/confirma freeze do PDF físico LF ESTRELA.
 * NÃO recebe o PDF — o browser envia os bytes direto ao Storage.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contractId } = await params;
  const contentType = request.headers.get('content-type') || '';
  try {
    if (/multipart\/form-data/i.test(contentType)) {
      console.error('[LF PHYSICAL STORAGE TRACE]', {
        contractId,
        contentType,
        uploadStatus: 'rejected_payload',
        postStatus: 415,
        error: 'PDF não pode passar pela Function (HTTP 413). Use upload direto ao Storage.',
      });
      return NextResponse.json(
        {
          error:
            'PDF físico deve ir direto ao Storage. Não envie o arquivo nesta API.',
        },
        { status: 415 },
      );
    }

    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      console.error('[LF PHYSICAL STORAGE TRACE]', {
        contractId,
        contentType,
        uploadStatus: 'unauthenticated',
        postStatus: 401,
        error: configError || 'Não autenticado',
      });
      return NextResponse.json(
        { error: configError || 'Não autenticado' },
        { status: 401 },
      );
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      console.error('[LF PHYSICAL STORAGE TRACE]', {
        contractId,
        contentType,
        uploadStatus: 'supabase_missing',
        postStatus: 503,
        error: adminError || 'Supabase não configurado',
      });
      return NextResponse.json(
        { error: adminError || 'Supabase não configurado' },
        { status: 503 },
      );
    }

    const contract = await assertContractAccess(supabase, contractId, user.id);
    const body = (await request.json().catch(() => ({}))) as {
      intent?: string;
      pageCount?: number;
      sha256?: string;
      blobSize?: number;
    };
    const intent = String(body.intent || '').trim().toLowerCase();
    const tenantId = String(contract.tenant_id || contract.company_id || '');
    const contractNumber = String(contract.contract_number || contractId);
    const saleId = String(contract.sale_id || '').trim() || null;

    if (intent === 'prepare') {
      const result = await prepareLfEstrelaPhysicalDirectUpload({
        supabaseAdmin: supabase,
        contractId,
        tenantId,
        contractNumber,
        saleId,
        pageCount: typeof body.pageCount === 'number' ? body.pageCount : null,
        blobSize: typeof body.blobSize === 'number' ? body.blobSize : null,
      });
      console.info('[LF PHYSICAL STORAGE TRACE]', {
        contractId,
        intent: 'prepare',
        blobSize: body.blobSize ?? null,
        pageCount: body.pageCount ?? (result.reused ? result.pageCount : null),
        sha256: body.sha256 || (result.reused ? result.sha256 : null),
        bucket: result.bucket,
        storagePath: result.storagePath,
        uploadStatus: result.reused ? 'reused' : 'prepare',
        storedSize: result.reused ? result.storedSize : 0,
        postStatus: 200,
      });
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    if (intent === 'confirm') {
      const result = await confirmLfEstrelaPhysicalDirectUpload({
        supabaseAdmin: supabase,
        contractId,
        tenantId,
        contractNumber,
        saleId,
        sha256: body.sha256 || null,
        pageCount: typeof body.pageCount === 'number' ? body.pageCount : null,
        blobSize: typeof body.blobSize === 'number' ? body.blobSize : null,
      });
      console.info('[LF PHYSICAL STORAGE TRACE]', {
        contractId,
        intent: 'confirm',
        blobSize: body.blobSize ?? result.storedSize,
        pageCount: result.pageCount,
        sha256: result.sha256,
        bucket: result.bucket,
        storagePath: result.storagePath,
        uploadStatus: 'success',
        storedSize: result.storedSize,
        postStatus: 200,
      });
      return NextResponse.json({
        success: true,
        frozen: true,
        reused: false,
        ...result,
      });
    }

    return NextResponse.json(
      { error: 'Informe intent=prepare ou intent=confirm.' },
      { status: 400 },
    );
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao congelar PDF físico.';
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    console.error('[LF PHYSICAL STORAGE TRACE]', {
      contractId,
      contentType,
      uploadStatus: 'failed',
      postStatus: status,
      error: message,
    });
    return NextResponse.json({ error: message }, { status });
  }
}

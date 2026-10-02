import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import {
  LF_ESTRELA_SIGNED_INSTRUMENT_PAGES,
  persistLfEstrelaPhysicalPdf,
} from '@/lib/lfEstrelaSignedPdf';
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
  const { id: contractId } = await params;
  const contentType = request.headers.get('content-type');
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      console.error('[LF PHYSICAL PDF POST TRACE]', {
        contractId,
        contentType,
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
      console.error('[LF PHYSICAL PDF POST TRACE]', {
        contractId,
        contentType,
        postStatus: 503,
        error: adminError || 'Supabase não configurado',
      });
      return NextResponse.json(
        { error: adminError || 'Supabase não configurado' },
        { status: 503 },
      );
    }

    const contract = await assertContractAccess(supabase, contractId, user.id);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      console.error('[LF PHYSICAL PDF POST TRACE]', {
        contractId,
        contentType,
        bytesReceived: 0,
        postStatus: 400,
        error: 'Envie o PDF físico em file.',
      });
      return NextResponse.json(
        { error: 'Envie o PDF físico em file.' },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const companyId = String(contract.tenant_id || contract.company_id || '');
    const projectId = String(contract.project_id || '').trim() || null;
    const saleId = String(contract.sale_id || '').trim() || null;

    if (bytes.byteLength === 0) {
      console.error('[LF PHYSICAL PDF POST TRACE]', {
        contractId,
        contentType,
        bytesReceived: 0,
        pageCount: null,
        company_id: companyId,
        project_id: projectId,
        sale_id: saleId,
        postStatus: 400,
        error: 'PDF físico vazio (0 bytes).',
      });
      return NextResponse.json(
        { error: 'PDF físico vazio (0 bytes).' },
        { status: 400 },
      );
    }
    if (!isPdfBytes(bytes)) {
      console.error('[LF PHYSICAL PDF POST TRACE]', {
        contractId,
        contentType,
        bytesReceived: bytes.byteLength,
        pageCount: null,
        company_id: companyId,
        project_id: projectId,
        sale_id: saleId,
        postStatus: 400,
        error: 'Arquivo não é PDF.',
      });
      return NextResponse.json({ error: 'Arquivo não é PDF.' }, { status: 400 });
    }
    if (bytes.byteLength > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'PDF físico excede 25 MB.' },
        { status: 413 },
      );
    }

    const pageCount = (await PDFDocument.load(bytes)).getPageCount();
    if (pageCount !== LF_ESTRELA_SIGNED_INSTRUMENT_PAGES) {
      const error = `Base física LF ESTRELA inválida: esperado ${LF_ESTRELA_SIGNED_INSTRUMENT_PAGES} páginas, encontrado ${pageCount}. Gere/congele novamente o PDF físico homologado.`;
      console.error('[LF PHYSICAL PDF POST TRACE]', {
        contractId,
        contentType,
        bytesReceived: bytes.byteLength,
        pageCount,
        company_id: companyId,
        project_id: projectId,
        sale_id: saleId,
        postStatus: 400,
        error,
      });
      return NextResponse.json({ error }, { status: 400 });
    }

    const tenantId = companyId;
    const contractNumber = String(contract.contract_number || contractId);
    const result = await persistLfEstrelaPhysicalPdf({
      supabaseAdmin: supabase,
      contractId,
      tenantId,
      contractNumber,
      pdfBytes: bytes,
      saleId,
      version: Number(contract.version || 0) || null,
      overwrite: false,
    });

    console.info('[LF PHYSICAL PDF POST TRACE]', {
      contractId,
      contentType,
      bytesReceived: bytes.byteLength,
      physicalBaseFound: true,
      pageCount: result.pageCount,
      company_id: companyId,
      project_id: projectId,
      sale_id: saleId,
      bucket: result.bucket,
      storagePath: result.storagePath,
      uploadOk: true,
      sha256: result.sha256,
      reused: result.reused,
      postStatus: 200,
    });

    return NextResponse.json({
      success: true,
      frozen: true,
      reused: result.reused,
      sha256: result.sha256,
      pageCount: result.pageCount,
      storagePath: result.storagePath,
      bucket: result.bucket,
    });
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao congelar PDF físico.';
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    console.error('[LF PHYSICAL PDF POST TRACE]', {
      contractId,
      contentType,
      postStatus: status,
      error: message,
    });
    return NextResponse.json({ error: message }, { status });
  }
}

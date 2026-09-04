import { NextResponse } from 'next/server';
import { isPlatformAdmin } from '@/lib/rls';
import {
  isTenantEnterpriseAdminRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';
import { assertSaleDocumentSaleAccess, SaleDocumentError } from '@/lib/saleDocumentService';
import { createAdminSupabase, getRequestAuthUser, resolveCallerProfile } from '@/lib/supabase/server';
import { terminationSignedSaleDocumentType } from '@/lib/termination-documents/documentKinds';
import {
  documentViewFromSnapshot,
  loadTerminationDocumentBySale,
  retryTerminationDocumentPdf,
  TerminationDocumentError,
} from '@/lib/termination-documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function authorize(request: Request, saleId: string) {
  const { user, configError } = await getRequestAuthUser(request);
  if (configError || !user) {
    return {
      error: NextResponse.json({ success: false, error: configError || 'Não autenticado' }, { status: 401 }),
    };
  }
  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return {
      error: NextResponse.json({ success: false, error: adminError || 'Supabase não configurado' }, { status: 503 }),
    };
  }
  const ctx = await assertSaleDocumentSaleAccess(admin, saleId, user.id);
  return { admin, userId: user.id, companyId: ctx.companyId };
}

/** Visualiza o HTML congelado do termo (nunca reconstrói a partir do cadastro vivo). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { saleId: raw } = await params;
    const saleId = String(raw || '').trim();
    if (!saleId) {
      return NextResponse.json({ success: false, error: 'saleId obrigatório.' }, { status: 400 });
    }
    const auth = await authorize(request, saleId);
    if ('error' in auth) return auth.error;

    const loaded = await loadTerminationDocumentBySale(auth.admin, {
      saleId,
      companyId: auth.companyId,
    });
    if (!loaded) {
      return NextResponse.json({ success: false, error: 'Termo não encontrado.' }, { status: 404 });
    }

    const url = new URL(request.url);
    if (url.searchParams.get('format') === 'html') {
      return new NextResponse(loaded.snapshot.html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="${loaded.snapshot.documentNumber.replace(/\//g, '-')}.html"`,
        },
      });
    }

    const { data: signedRow } = await auth.admin
      .from('sale_documents')
      .select('id')
      .eq('sale_id', saleId)
      .eq('company_id', auth.companyId)
      .eq(
        'document_type',
        terminationSignedSaleDocumentType(loaded.snapshot.operationType),
      )
      .is('deleted_at', null)
      .maybeSingle();
    const signedArtifactAvailable = Boolean(signedRow?.id);

    const view = documentViewFromSnapshot(loaded.snapshot, loaded.documentStatus);
    if (url.searchParams.get('meta') === '1') {
      return NextResponse.json({
        success: true,
        settlementStatus: loaded.settlementStatus,
        documentId: loaded.documentId,
        documentNumber: view?.documentNumber ?? null,
        documentStatus: view?.documentStatus ?? null,
        title: view?.title ?? null,
        saleId: view?.saleId ?? saleId,
        generatedAt: loaded.snapshot.generatedAt,
        signedArtifactAvailable,
        canView: view?.canView ?? false,
        canDownload: view?.canDownload ?? false,
      });
    }

    return NextResponse.json({
      success: true,
      settlementStatus: loaded.settlementStatus,
      documentId: loaded.documentId,
      signedArtifactAvailable,
      ...view,
    });
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error('[termination-document GET]', err);
    return NextResponse.json({ success: false, error: 'Erro ao carregar o termo.' }, { status: 500 });
  }
}

/** Retry documental: reutiliza snapshot/HTML/número. Não recalcula nem reexecuta release. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saleId: string }> },
) {
  try {
    const { saleId: raw } = await params;
    const saleId = String(raw || '').trim();
    if (!saleId) {
      return NextResponse.json({ success: false, error: 'saleId obrigatório.' }, { status: 400 });
    }
    const auth = await authorize(request, saleId);
    if ('error' in auth) return auth.error;

    const profile = await resolveCallerProfile(auth.admin, auth.userId);
    const role = normalizeUserRole(profile?.role);
    if (!isPlatformAdmin(role) && !isTenantEnterpriseAdminRole(role)) {
      return NextResponse.json(
        { success: false, error: 'Apenas administradores podem regenerar o PDF do termo.' },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.retry !== true && body.action !== 'retry-pdf') {
      return NextResponse.json({ success: false, error: 'Informe retry=true para materializar o PDF.' }, { status: 400 });
    }

    const loaded = await loadTerminationDocumentBySale(auth.admin, {
      saleId,
      companyId: auth.companyId,
    });
    if (!loaded) {
      return NextResponse.json({ success: false, error: 'Termo congelado não encontrado.' }, { status: 404 });
    }

    const result = await retryTerminationDocumentPdf(auth.admin, {
      settlementId: loaded.settlementId,
      saleId,
      companyId: auth.companyId,
      operatorUserId: auth.userId,
    });
    const view = documentViewFromSnapshot(result.snapshot, result.documentStatus);
    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      ...view,
    });
  } catch (err) {
    if (err instanceof SaleDocumentError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    if (err instanceof TerminationDocumentError) {
      const status = err.code === 'CROSS_TENANT' ? 403 : 409;
      return NextResponse.json({ success: false, code: err.code, error: err.message }, { status });
    }
    console.error('[termination-document POST]', err);
    return NextResponse.json({ success: false, error: 'Erro ao gerar o PDF do termo.' }, { status: 500 });
  }
}

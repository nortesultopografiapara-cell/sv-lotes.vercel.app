import { NextResponse } from 'next/server';
import { authorizeLegacyContractsRequest } from '@/lib/legacy-contracts/apiAuth';
import { loadLegacyContractDocumentById } from '@/lib/legacy-contracts/listService';
import { resolveLegacyContractPdfAccess } from '@/lib/legacy-contracts/pdfAccess';
import { LegacyContractDocumentError } from '@/lib/legacyContractDocumentService';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const activeTenantId = new URL(request.url).searchParams.get('activeTenantId');
    const auth = await authorizeLegacyContractsRequest(request, {
      bodyTenantId: activeTenantId,
    });
    if ('error' in auth) return auth.error;

    const { id } = await params;
    const document = await loadLegacyContractDocumentById({
      admin: auth.ctx.admin,
      tenantId: auth.ctx.tenantId,
      documentId: id,
      ownerProjectIds: auth.ctx.ownerProjectIds,
    });

    if (!document) {
      return NextResponse.json({ error: 'Contrato antigo não encontrado.' }, { status: 404 });
    }

    if (!document.storage_path?.trim()) {
      return NextResponse.json({ error: 'Caminho do PDF ausente para este contrato.' }, { status: 404 });
    }

    const access = await resolveLegacyContractPdfAccess({
      admin: auth.ctx.admin,
      storagePath: document.storage_path,
      fileName: document.original_file_name,
      tenantId: auth.ctx.tenantId,
    });

    const url = new URL(request.url);
    const asJson = url.searchParams.get('format') === 'json';

    if (asJson) {
      return NextResponse.json(access);
    }

    return NextResponse.redirect(access.url);
  } catch (err) {
    if (err instanceof LegacyContractDocumentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    const message = err instanceof Error ? err.message : 'Erro ao abrir PDF do contrato antigo.';
    console.error('[legacy-contracts/[id]/pdf GET]', message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

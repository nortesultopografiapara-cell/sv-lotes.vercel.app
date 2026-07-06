import { NextResponse } from 'next/server';
import { authorizeLegacyContractsRequest } from '@/lib/legacy-contracts/apiAuth';
import { loadLegacyContractDocumentById } from '@/lib/legacy-contracts/listService';
import { createLegacyContractSignedPdfUrl } from '@/lib/legacyContractDocumentService';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeLegacyContractsRequest(request);
    if ('error' in auth) return auth.error;

    const { id } = await params;
    const document = await loadLegacyContractDocumentById({
      admin: auth.ctx.admin,
      tenantId: auth.ctx.tenantId,
      documentId: id,
      ownerProjectIds: auth.ctx.ownerProjectIds,
    });

    if (!document?.storage_path) {
      return NextResponse.json({ error: 'Contrato antigo não encontrado.' }, { status: 404 });
    }

    const expectedPrefix = `${auth.ctx.tenantId}/`;
    if (!document.storage_path.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Arquivo fora do escopo do tenant.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const asJson = url.searchParams.get('format') === 'json';
    const signedUrl = await createLegacyContractSignedPdfUrl(auth.ctx.admin, document.storage_path);

    if (asJson) {
      return NextResponse.json({
        url: signedUrl,
        fileName: document.original_file_name,
      });
    }

    return NextResponse.redirect(signedUrl);
  } catch (err) {
    console.error('[legacy-contracts/[id]/pdf GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao abrir PDF do contrato antigo.' },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import { authorizeLegacyContractsRequest } from '@/lib/legacy-contracts/apiAuth';
import {
  loadLegacyContractDocumentById,
  softDeleteLegacyContractDocument,
} from '@/lib/legacy-contracts/listService';

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

    if (!document) {
      return NextResponse.json({ error: 'Contrato antigo não encontrado.' }, { status: 404 });
    }

    const { storage_path: _storagePath, ...view } = document;
    return NextResponse.json({ document: view });
  } catch (err) {
    console.error('[legacy-contracts/[id] GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao consultar contrato antigo.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeLegacyContractsRequest(request, { requireManage: true });
    if ('error' in auth) return auth.error;

    const { id } = await params;
    const deleted = await softDeleteLegacyContractDocument({
      admin: auth.ctx.admin,
      tenantId: auth.ctx.tenantId,
      documentId: id,
      userId: auth.ctx.userId,
    });

    if (!deleted) {
      return NextResponse.json({ error: 'Contrato antigo não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[legacy-contracts/[id] DELETE]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao arquivar contrato antigo.' },
      { status: 500 },
    );
  }
}

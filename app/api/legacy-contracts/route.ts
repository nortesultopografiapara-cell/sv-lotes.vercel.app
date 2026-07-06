import { NextResponse } from 'next/server';
import { authorizeLegacyContractsRequest } from '@/lib/legacy-contracts/apiAuth';
import { listLegacyContractDocuments } from '@/lib/legacy-contracts/listService';
import type { LegacyContractLinkType } from '@/lib/legacy-contracts/constants';
import type { LegacyContractListFilters } from '@/lib/legacy-contracts/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function parseListFilters(url: URL): LegacyContractListFilters {
  const linkTypeRaw = url.searchParams.get('linkType') || '';
  const linkType =
    linkTypeRaw === 'automatic' || linkTypeRaw === 'manual'
      ? (linkTypeRaw as LegacyContractLinkType)
      : '';

  return {
    projectId: url.searchParams.get('projectId') || undefined,
    quadra: url.searchParams.get('quadra') || undefined,
    lote: url.searchParams.get('lote') || undefined,
    customer: url.searchParams.get('customer') || undefined,
    fileName: url.searchParams.get('fileName') || undefined,
    linkType,
    page: Number(url.searchParams.get('page') || '1'),
    pageSize: Number(url.searchParams.get('pageSize') || '25'),
  };
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeLegacyContractsRequest(request);
    if ('error' in auth) return auth.error;

    const filters = parseListFilters(new URL(request.url));
    const result = await listLegacyContractDocuments({
      admin: auth.ctx.admin,
      tenantId: auth.ctx.tenantId,
      filters,
      ownerProjectIds: auth.ctx.ownerProjectIds,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar contratos antigos.';
    console.error('[legacy-contracts GET]', message, err);
    return NextResponse.json(
      {
        error: message,
        items: [],
        summary: { total: 0, automatic: 0, manual: 0, unlinked: 0 },
        total: 0,
        page: 1,
        pageSize: 25,
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { loadLegacyContractImportContext } from '@/lib/imports/modules/legacy-contracts/lookupIndex';
import {
  applyLegacyContractManualLinkToRow,
  resolveLegacyContractManualLink,
} from '@/lib/imports/modules/legacy-contracts/manualLink';
import type {
  LegacyContractManualLinkInput,
  ValidatedLegacyContractRow,
} from '@/lib/imports/modules/legacy-contracts/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

type ResolveManualLinkBody = LegacyContractManualLinkInput & {
  lineNumber?: number;
  activeTenantId?: string | null;
  baseRow?: ValidatedLegacyContractRow;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResolveManualLinkBody;
    const activeTenantId =
      typeof body.activeTenantId === 'string' ? body.activeTenantId : null;

    const auth = await authorizeDataMigrationRequest(request, activeTenantId);
    if ('error' in auth) return auth.error;

    const input: LegacyContractManualLinkInput = {
      project_id: String(body.project_id || ''),
      quadra: String(body.quadra || ''),
      lote: String(body.lote || ''),
      customer_name: String(body.customer_name || ''),
      observacoes: typeof body.observacoes === 'string' ? body.observacoes : undefined,
    };

    const context = await loadLegacyContractImportContext(
      auth.ctx.admin,
      auth.ctx.tenantId,
    );

    const resolved = resolveLegacyContractManualLink(context, input);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    if (!body.baseRow || typeof body.baseRow !== 'object') {
      return NextResponse.json(
        { error: 'Dados da linha de importação ausentes.' },
        { status: 400 },
      );
    }

    const row = applyLegacyContractManualLinkToRow(
      body.baseRow,
      input,
      resolved.resolution,
    );

    return NextResponse.json({
      row,
      projectId: resolved.resolution.project_id,
      lotId: resolved.resolution.block_id,
      saleId: resolved.resolution.sale_id,
      customerId: resolved.resolution.customer_id,
      customerName: resolved.resolution.customer_name,
      projectName: resolved.resolution.project_name,
      block: resolved.resolution.block,
      lot: resolved.resolution.lot,
    });
  } catch (err) {
    console.error('[data-migration/legacy-contracts/resolve-manual-link]', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Erro interno ao vincular contrato manualmente.',
      },
      { status: 500 },
    );
  }
}

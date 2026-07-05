import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';
import {
  loadSalesImportContext,
  validateSaleImportBuffer,
} from '@/lib/imports/modules/sales/importService';
import { extractUploadedFile } from '@/lib/imports/uploadFile';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = extractUploadedFile(formData.get('file'), 'import_vendas.xlsx');
    const activeTenantId = formData.get('activeTenantId');

    if (!file) {
      return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });
    }

    const auth = await authorizeDataMigrationRequest(
      request,
      typeof activeTenantId === 'string' ? activeTenantId : null,
    );
    if ('error' in auth) return auth.error;

    const buffer = Buffer.from(await file.arrayBuffer());
    const context = await loadSalesImportContext(auth.ctx.admin, auth.ctx.tenantId);
    const validation = await validateSaleImportBuffer(buffer, file.name, context);

    return NextResponse.json({ validation });
  } catch (err) {
    console.error('[data-migration/sales/validate]', err);

    if (isCustomerImportParseError(err)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Erro interno ao validar o arquivo. Tente novamente.',
      },
      { status: 500 },
    );
  }
}

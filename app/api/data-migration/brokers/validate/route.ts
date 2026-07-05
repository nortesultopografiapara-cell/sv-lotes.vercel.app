import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';
import {
  validateBrokerImportBuffer,
  loadExistingBrokersForImport,
} from '@/lib/imports/modules/brokers/importService';
import { extractUploadedFile } from '@/lib/imports/uploadFile';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = extractUploadedFile(formData.get('file'), 'import_corretores.xlsx');
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
    const existingBrokers = await loadExistingBrokersForImport(
      auth.ctx.admin,
      auth.ctx.tenantId,
    );

    const validation = await validateBrokerImportBuffer(
      buffer,
      file.name,
      existingBrokers,
    );

    return NextResponse.json({ validation });
  } catch (err) {
    console.error('[data-migration/brokers/validate]', err);

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

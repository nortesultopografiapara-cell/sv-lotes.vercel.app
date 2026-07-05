import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';
import {
  loadLegacyContractImportContext,
  validateLegacyContractImportBuffer,
} from '@/lib/imports/modules/legacy-contracts/importService';
import { extractUploadedFile } from '@/lib/imports/uploadFile';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const spreadsheetFile = extractUploadedFile(formData.get('file'), 'mapeamento_contratos.xlsx');
    const documentsFile = extractUploadedFile(formData.get('documents'), 'contratos.zip');
    const activeTenantId = formData.get('activeTenantId');

    if (!spreadsheetFile) {
      return NextResponse.json({ error: 'Planilha de mapeamento não enviada.' }, { status: 400 });
    }
    if (!documentsFile) {
      return NextResponse.json({ error: 'Arquivo PDF ou ZIP não enviado.' }, { status: 400 });
    }

    const auth = await authorizeDataMigrationRequest(
      request,
      typeof activeTenantId === 'string' ? activeTenantId : null,
    );
    if ('error' in auth) return auth.error;

    const spreadsheetBuffer = Buffer.from(await spreadsheetFile.arrayBuffer());
    const documentsBuffer = Buffer.from(await documentsFile.arrayBuffer());
    const context = await loadLegacyContractImportContext(auth.ctx.admin, auth.ctx.tenantId);

    const validation = await validateLegacyContractImportBuffer({
      spreadsheetBuffer,
      spreadsheetFileName: spreadsheetFile.name,
      documentsBuffer,
      documentsFileName: documentsFile.name,
      context,
    });

    return NextResponse.json({ validation });
  } catch (err) {
    console.error('[data-migration/legacy-contracts/validate]', err);

    if (isCustomerImportParseError(err)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Erro interno ao validar os arquivos. Tente novamente.',
      },
      { status: 500 },
    );
  }
}

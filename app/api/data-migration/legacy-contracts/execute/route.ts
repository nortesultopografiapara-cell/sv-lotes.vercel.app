import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';
import { executeLegacyContractImportBuffer } from '@/lib/imports/modules/legacy-contracts/importService';
import { extractUploadedFile } from '@/lib/imports/uploadFile';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const spreadsheetFile = extractUploadedFile(formData.get('file'), 'mapeamento_contratos.xlsx');
    const documentsFile = extractUploadedFile(formData.get('documents'), 'contratos.zip');
    const confirmed = String(formData.get('confirmed') || '') === 'true';
    const activeTenantId = formData.get('activeTenantId');

    if (!confirmed) {
      return NextResponse.json({ error: 'Confirmação obrigatória.' }, { status: 400 });
    }
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

    const result = await executeLegacyContractImportBuffer({
      admin: auth.ctx.admin,
      tenantId: auth.ctx.tenantId,
      userId: auth.ctx.userId,
      userName: auth.ctx.userName,
      spreadsheetBuffer: Buffer.from(await spreadsheetFile.arrayBuffer()),
      spreadsheetFileName: spreadsheetFile.name,
      documentsBuffer: Buffer.from(await documentsFile.arrayBuffer()),
      documentsFileName: documentsFile.name,
    });

    return NextResponse.json({ result });
  } catch (err) {
    console.error('[data-migration/legacy-contracts/execute]', err);

    if (isCustomerImportParseError(err)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Erro interno ao importar contratos antigos. Tente novamente.',
      },
      { status: 500 },
    );
  }
}

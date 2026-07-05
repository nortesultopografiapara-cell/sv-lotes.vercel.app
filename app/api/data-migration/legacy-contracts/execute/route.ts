import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { extractLegacyContractFormFiles } from '@/lib/imports/helpers/legacyContractFormData';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';
import { buildLegacyContractDocumentUploads } from '@/lib/imports/modules/legacy-contracts/documentUploads';
import { executeLegacyContractImportBuffer } from '@/lib/imports/modules/legacy-contracts/importService';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const { mappingFile, documentFiles } = extractLegacyContractFormFiles(formData);
    const confirmed = String(formData.get('confirmed') || '') === 'true';
    const activeTenantId = formData.get('activeTenantId');

    if (!confirmed) {
      return NextResponse.json({ error: 'Confirmação obrigatória.' }, { status: 400 });
    }
    if (!mappingFile) {
      return NextResponse.json({ error: 'Planilha de mapeamento não enviada.' }, { status: 400 });
    }
    if (documentFiles.length === 0) {
      return NextResponse.json(
        { error: 'Selecione ao menos um PDF ou um arquivo ZIP contendo PDFs.' },
        { status: 400 },
      );
    }

    const auth = await authorizeDataMigrationRequest(
      request,
      typeof activeTenantId === 'string' ? activeTenantId : null,
    );
    if ('error' in auth) return auth.error;

    const { documentUploads, documentsFileName } =
      await buildLegacyContractDocumentUploads(documentFiles);

    const result = await executeLegacyContractImportBuffer({
      admin: auth.ctx.admin,
      tenantId: auth.ctx.tenantId,
      userId: auth.ctx.userId,
      userName: auth.ctx.userName,
      spreadsheetBuffer: Buffer.from(await mappingFile.arrayBuffer()),
      spreadsheetFileName: mappingFile.name,
      documentUploads,
      documentsFileName,
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

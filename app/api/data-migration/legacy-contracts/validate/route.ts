import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { extractLegacyContractFormFiles } from '@/lib/imports/helpers/legacyContractFormData';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';
import { buildLegacyContractDocumentUploads } from '@/lib/imports/modules/legacy-contracts/documentUploads';
import {
  loadLegacyContractImportContext,
  validateLegacyContractDocumentsBuffer,
  validateLegacyContractImportBuffer,
} from '@/lib/imports/modules/legacy-contracts/importService';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const { mappingFile, documentFiles } = extractLegacyContractFormFiles(formData);
    const activeTenantId = formData.get('activeTenantId');

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
    const context = await loadLegacyContractImportContext(auth.ctx.admin, auth.ctx.tenantId);

    const validation = mappingFile
      ? await validateLegacyContractImportBuffer({
          spreadsheetBuffer: Buffer.from(await mappingFile.arrayBuffer()),
          spreadsheetFileName: mappingFile.name,
          documentUploads,
          documentsFileName,
          context,
        })
      : await validateLegacyContractDocumentsBuffer({
          documentUploads,
          documentsFileName,
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

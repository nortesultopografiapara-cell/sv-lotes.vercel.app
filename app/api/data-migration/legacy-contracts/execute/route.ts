import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { extractLegacyContractFormFiles } from '@/lib/imports/helpers/legacyContractFormData';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';
import { resolveLegacyContractDocumentUploads } from '@/lib/imports/modules/legacy-contracts/documentUploads';
import { executeLegacyContractImportBuffer } from '@/lib/imports/modules/legacy-contracts/importService';
import {
  assertLegacyDocumentFilesWithinLimits,
  getLegacyDocumentUploadTotalBytes,
  LEGACY_CONTRACT_MAX_REQUEST_BYTES,
  LEGACY_CONTRACT_PAYLOAD_TOO_LARGE_MESSAGE,
} from '@/lib/imports/modules/legacy-contracts/uploadLimits';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const { mappingFile, documentFiles, documentStoragePaths, manualLinkOverrides } =
      extractLegacyContractFormFiles(formData);
    const confirmed = String(formData.get('confirmed') || '') === 'true';
    const activeTenantId = formData.get('activeTenantId');

    if (!confirmed) {
      return NextResponse.json({ error: 'Confirmação obrigatória.' }, { status: 400 });
    }

    if (documentFiles.length === 0 && documentStoragePaths.length === 0) {
      return NextResponse.json(
        { error: 'Selecione ao menos um PDF ou um arquivo ZIP contendo PDFs.' },
        { status: 400 },
      );
    }

    try {
      assertLegacyDocumentFilesWithinLimits(documentFiles);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : LEGACY_CONTRACT_PAYLOAD_TOO_LARGE_MESSAGE },
        { status: 413 },
      );
    }

    const directBytes = getLegacyDocumentUploadTotalBytes(documentFiles);
    if (directBytes > LEGACY_CONTRACT_MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { error: LEGACY_CONTRACT_PAYLOAD_TOO_LARGE_MESSAGE },
        { status: 413 },
      );
    }

    const auth = await authorizeDataMigrationRequest(
      request,
      typeof activeTenantId === 'string' ? activeTenantId : null,
    );
    if ('error' in auth) return auth.error;

    const { documentUploads, documentsFileName } = await resolveLegacyContractDocumentUploads({
      admin: auth.ctx.admin,
      documentFiles,
      documentStoragePaths,
    });

    const result = await executeLegacyContractImportBuffer({
      admin: auth.ctx.admin,
      tenantId: auth.ctx.tenantId,
      userId: auth.ctx.userId,
      userName: auth.ctx.userName,
      spreadsheetBuffer: mappingFile ? Buffer.from(await mappingFile.arrayBuffer()) : undefined,
      spreadsheetFileName: mappingFile?.name,
      documentUploads,
      documentsFileName,
      manualLinkOverrides,
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

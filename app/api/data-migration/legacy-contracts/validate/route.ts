import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { extractLegacyContractFormFiles } from '@/lib/imports/helpers/legacyContractFormData';
import { isCustomerImportParseError } from '@/lib/imports/modules/customers/errors';
import { resolveLegacyContractDocumentUploads } from '@/lib/imports/modules/legacy-contracts/documentUploads';
import {
  loadLegacyContractImportContext,
  validateLegacyContractDocumentsBuffer,
  validateLegacyContractImportBuffer,
} from '@/lib/imports/modules/legacy-contracts/importService';
import {
  assertLegacyDocumentFilesWithinLimits,
  getLegacyDocumentUploadTotalBytes,
  LEGACY_CONTRACT_MAX_REQUEST_BYTES,
  LEGACY_CONTRACT_PAYLOAD_TOO_LARGE_MESSAGE,
} from '@/lib/imports/modules/legacy-contracts/uploadLimits';

export const runtime = 'nodejs';
export const maxDuration = 60;

function hasLegacyDocumentSources(
  documentFiles: File[],
  documentStoragePaths: Array<{ storagePath: string; fileName: string }>,
): boolean {
  return documentFiles.length > 0 || documentStoragePaths.length > 0;
}

function validateLegacyUploadPayloadSize(
  documentFiles: File[],
  documentStoragePaths: Array<{ storagePath: string; fileName: string }>,
): NextResponse | null {
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

  if (documentStoragePaths.length > 0 && documentFiles.length === 0) {
    return null;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const { mappingFile, documentFiles, documentStoragePaths } =
      extractLegacyContractFormFiles(formData);
    const activeTenantId = formData.get('activeTenantId');

    if (!hasLegacyDocumentSources(documentFiles, documentStoragePaths)) {
      return NextResponse.json(
        { error: 'Selecione ao menos um PDF ou um arquivo ZIP contendo PDFs.' },
        { status: 400 },
      );
    }

    const sizeError = validateLegacyUploadPayloadSize(documentFiles, documentStoragePaths);
    if (sizeError) return sizeError;

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

    let context;
    try {
      context = await loadLegacyContractImportContext(auth.ctx.admin, auth.ctx.tenantId);
    } catch (loadErr) {
      console.error('[data-migration/legacy-contracts/validate] load context', loadErr);
      return NextResponse.json(
        {
          error:
            loadErr instanceof Error
              ? loadErr.message
              : 'Não foi possível carregar os dados para validação.',
        },
        { status: 500 },
      );
    }

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

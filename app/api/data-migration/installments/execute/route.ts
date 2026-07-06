import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { executeInstallmentImportBuffer } from '@/lib/imports/modules/installments/importService';
import { extractUploadedFile } from '@/lib/imports/uploadFile';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = extractUploadedFile(formData.get('file'), 'import_parcelas.xlsx');
    const activeTenantId = formData.get('activeTenantId');
    const confirmed = formData.get('confirmed');

    if (confirmed !== 'true') {
      return NextResponse.json(
        { error: 'Confirmação obrigatória para executar a atualização.' },
        { status: 400 },
      );
    }

    if (!file) {
      return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });
    }

    const auth = await authorizeDataMigrationRequest(
      request,
      typeof activeTenantId === 'string' ? activeTenantId : null,
    );
    if ('error' in auth) return auth.error;

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await executeInstallmentImportBuffer({
      admin: auth.ctx.admin,
      tenantId: auth.ctx.tenantId,
      userId: auth.ctx.user.id,
      userName: auth.ctx.userName,
      buffer,
      fileName: file.name,
    });

    return NextResponse.json({ result });
  } catch (err) {
    console.error('[data-migration/installments/execute]', err);
    const message =
      err instanceof Error ? err.message : 'Erro ao atualizar parcelas.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
